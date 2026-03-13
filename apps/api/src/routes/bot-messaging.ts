import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import crypto from "crypto";
import { db } from "../db";
import { oauthApps, messages, chatMembers, chats, users } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { publish, getChatChannel } from "../lib/redis";
import { dispatchWebhookEvent } from "../lib/webhook-worker";

// UUID validation regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── App Access Token Store ──────────────────────────────────────────
// In-memory store for app_access_tokens (like auth codes in oauth.ts)
// Maps token_hash -> app metadata. Tokens valid for 2 hours.

interface AppTokenData {
  appDbId: string; // internal UUID
  appId: string; // public cli_xxx ID
  orgId: string;
  botEnabled: boolean;
  webhookUrl: string | null;
  expiresAt: number;
}

const appAccessTokens = new Map<string, AppTokenData>();

// Clean up expired tokens every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [hash, data] of appAccessTokens) {
    if (data.expiresAt < now) {
      appAccessTokens.delete(hash);
    }
  }
}, 60_000);

// ── Bot Auth Middleware ─────────────────────────────────────────────

interface BotRequest extends FastifyRequest {
  app: AppTokenData;
}

async function botAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Authorization: Bearer <app_access_token> required" });
  }

  const token = authHeader.slice(7);
  if (!token) {
    return reply.status(401).send({ error: "Token required" });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const appData = appAccessTokens.get(tokenHash);

  if (!appData) {
    return reply.status(401).send({ error: "Invalid or expired app_access_token" });
  }

  if (appData.expiresAt < Date.now()) {
    appAccessTokens.delete(tokenHash);
    return reply.status(401).send({ error: "app_access_token expired" });
  }

  (request as BotRequest).app = appData;
}

// ── Interfaces ──────────────────────────────────────────────────────

interface CardHeader {
  title: string;
  subtitle?: string;
  icon_url?: string;
}

interface CardBlock {
  tag: "text" | "image" | "divider" | "action";
  content?: string;
  image_url?: string;
  alt?: string;
  actions?: CardAction[];
}

interface CardAction {
  tag: "button";
  text: string;
  type?: "primary" | "danger" | "default";
  value: Record<string, unknown>;
  action_id: string;
}

interface InteractiveCard {
  header?: CardHeader;
  elements: CardBlock[];
}

interface SendMessageBody {
  chat_id: string;
  content: {
    msg_type: "text" | "rich_text" | "interactive";
    text?: string;
    rich_text?: Record<string, unknown>;
    card?: InteractiveCard;
  };
}

interface UpdateMessageBody {
  message_id: string;
  content: {
    card: InteractiveCard;
  };
}

interface CardActionBody {
  message_id: string;
  action_id: string;
  value: Record<string, unknown>;
}

// ── Routes ──────────────────────────────────────────────────────────

export async function botMessagingRoutes(fastify: FastifyInstance) {
  // ── Get App Access Token (client_credentials grant) ─────────────
  // POST /auth/app_access_token
  // Body: { app_id, app_secret }
  // Returns: { app_access_token, expire }

  fastify.post<{
    Body: { app_id: string; app_secret: string };
  }>("/auth/app_access_token", async (request, reply) => {
    const { app_id, app_secret } = request.body;

    if (!app_id || !app_secret) {
      return reply.status(400).send({ error: "app_id and app_secret are required" });
    }

    // Lookup app by public app_id
    const [app] = await db
      .select()
      .from(oauthApps)
      .where(eq(oauthApps.appId, app_id))
      .limit(1);

    if (!app) {
      return reply.status(401).send({ error: "Invalid app credentials" });
    }

    // Validate secret
    const secretHash = crypto
      .createHash("sha256")
      .update(app_secret)
      .digest("hex");

    if (secretHash !== app.appSecretHash) {
      return reply.status(401).send({ error: "Invalid app credentials" });
    }

    if (!app.botEnabled) {
      return reply.status(403).send({ error: "Bot is not enabled for this app" });
    }

    // Generate access token (valid for 2 hours)
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = Date.now() + 2 * 60 * 60 * 1000; // 2 hours

    appAccessTokens.set(tokenHash, {
      appDbId: app.id,
      appId: app.appId,
      orgId: app.orgId,
      botEnabled: app.botEnabled,
      webhookUrl: app.webhookUrl,
      expiresAt,
    });

    return reply.status(200).send({
      app_access_token: token,
      expire: 7200,
    });
  });

  // ── Send Message ────────────────────────────────────────────────
  // POST /api/v1/messages/send
  // Auth: Bearer <app_access_token>
  // Body: { chat_id, content: { msg_type, text?, rich_text?, card? } }

  fastify.post<{ Body: SendMessageBody }>(
    "/api/v1/messages/send",
    { preHandler: botAuthMiddleware },
    async (request, reply) => {
      const appData = (request as BotRequest).app;
      const { chat_id, content } = request.body;

      if (!chat_id || !content || !content.msg_type) {
        return reply.status(400).send({
          error: "chat_id and content.msg_type are required",
        });
      }

      if (!UUID_REGEX.test(chat_id)) {
        return reply.status(400).send({ error: "Invalid chat_id format" });
      }

      // Verify chat exists and belongs to the same org
      const [chat] = await db
        .select({ id: chats.id, orgId: chats.orgId })
        .from(chats)
        .where(eq(chats.id, chat_id))
        .limit(1);

      if (!chat) {
        return reply.status(404).send({ error: "Chat not found" });
      }

      if (chat.orgId !== appData.orgId) {
        return reply.status(403).send({ error: "App does not have access to this chat" });
      }

      // Map msg_type to internal message type and build content
      let messageType: "text" | "rich_text" | "card";
      let messageContent: Record<string, unknown>;

      switch (content.msg_type) {
        case "text":
          if (!content.text) {
            return reply.status(400).send({ error: "content.text is required for text messages" });
          }
          messageType = "text";
          messageContent = { text: content.text };
          break;

        case "rich_text":
          if (!content.rich_text) {
            return reply.status(400).send({ error: "content.rich_text is required for rich_text messages" });
          }
          messageType = "rich_text";
          messageContent = content.rich_text;
          break;

        case "interactive":
          if (!content.card) {
            return reply.status(400).send({ error: "content.card is required for interactive messages" });
          }
          messageType = "card";
          messageContent = {
            card: content.card,
            app_id: appData.appId,
          };
          break;

        default:
          return reply.status(400).send({
            error: "msg_type must be one of: text, rich_text, interactive",
          });
      }

      // Find a bot user to attribute the message to.
      // Use the first member of the org or create a system-level sender.
      // For bot messages, senderId is set to a dummy UUID derived from the app ID.
      // This makes bot messages identifiable and avoids requiring a real user.
      const botUserId = crypto
        .createHash("sha256")
        .update(`bot:${appData.appDbId}`)
        .digest("hex")
        .slice(0, 8);
      const botSenderId = `00000000-0000-4000-a000-${botUserId}0000`;

      // Insert message
      const [message] = await db
        .insert(messages)
        .values({
          chatId: chat_id,
          senderId: botSenderId,
          type: messageType,
          content: messageContent,
        })
        .returning();

      // Publish to Redis for real-time delivery
      await publish(getChatChannel(chat_id), {
        type: "message",
        payload: {
          ...message,
          sender: {
            id: botSenderId,
            displayName: `Bot: ${appData.appId}`,
            avatarUrl: null,
          },
        },
      });

      // Dispatch webhook event
      await dispatchWebhookEvent("bot.message.sent", appData.orgId, {
        messageId: message.id,
        chatId: chat_id,
        appId: appData.appId,
        type: messageType,
        content: messageContent,
        createdAt: message.createdAt,
      });

      return reply.status(200).send({
        message_id: message.id,
        chat_id: message.chatId,
        type: messageType,
        content: messageContent,
        created_at: message.createdAt,
      });
    }
  );

  // ── Update Message (Card) ─────────────────────────────────────
  // POST /api/v1/messages/update
  // Auth: Bearer <app_access_token>
  // Body: { message_id, content: { card } }

  fastify.post<{ Body: UpdateMessageBody }>(
    "/api/v1/messages/update",
    { preHandler: botAuthMiddleware },
    async (request, reply) => {
      const appData = (request as BotRequest).app;
      const { message_id, content } = request.body;

      if (!message_id || !content || !content.card) {
        return reply.status(400).send({
          error: "message_id and content.card are required",
        });
      }

      if (!UUID_REGEX.test(message_id)) {
        return reply.status(400).send({ error: "Invalid message_id format" });
      }

      // Find the original message
      const [original] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, message_id))
        .limit(1);

      if (!original) {
        return reply.status(404).send({ error: "Message not found" });
      }

      // Verify the message is a card type sent by this app's bot
      if (original.type !== "card") {
        return reply.status(400).send({ error: "Only card messages can be updated" });
      }

      const originalContent = original.content as Record<string, unknown>;
      if (originalContent.app_id !== appData.appId) {
        return reply.status(403).send({ error: "Can only update messages sent by this app" });
      }

      // Verify the chat belongs to the same org
      const [chat] = await db
        .select({ orgId: chats.orgId })
        .from(chats)
        .where(eq(chats.id, original.chatId))
        .limit(1);

      if (!chat || chat.orgId !== appData.orgId) {
        return reply.status(403).send({ error: "App does not have access to this chat" });
      }

      // Update the message content
      const updatedContent = {
        card: content.card,
        app_id: appData.appId,
      };

      const [updated] = await db
        .update(messages)
        .set({
          content: updatedContent,
          editedAt: new Date(),
        })
        .where(eq(messages.id, message_id))
        .returning();

      // Publish update to Redis for real-time delivery
      await publish(getChatChannel(original.chatId), {
        type: "message_updated",
        payload: updated,
      });

      return reply.status(200).send({
        message_id: updated.id,
        chat_id: updated.chatId,
        type: updated.type,
        content: updatedContent,
        updated_at: updated.editedAt,
      });
    }
  );

  // ── Card Action Callback ──────────────────────────────────────
  // POST /api/v1/card/action
  // Auth: Bearer <user_session_token> (called by the frontend when user clicks a button)
  // Body: { message_id, action_id, value }
  // Dispatches the action to the app's webhook_url

  fastify.post<{ Body: CardActionBody }>(
    "/api/v1/card/action",
    async (request, reply) => {
      const { message_id, action_id, value } = request.body;

      if (!message_id || !action_id) {
        return reply.status(400).send({
          error: "message_id and action_id are required",
        });
      }

      if (!UUID_REGEX.test(message_id)) {
        return reply.status(400).send({ error: "Invalid message_id format" });
      }

      // Find the message
      const [message_row] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, message_id))
        .limit(1);

      if (!message_row || message_row.type !== "card") {
        return reply.status(404).send({ error: "Card message not found" });
      }

      const cardContent = message_row.content as Record<string, unknown>;
      const appClientId = cardContent.app_id as string | undefined;

      if (!appClientId) {
        return reply.status(400).send({ error: "Message is not a bot card" });
      }

      // Look up the app to get webhook_url
      const [app] = await db
        .select({
          id: oauthApps.id,
          webhookUrl: oauthApps.webhookUrl,
          appSecretHash: oauthApps.appSecretHash,
          appId: oauthApps.appId,
          orgId: oauthApps.orgId,
        })
        .from(oauthApps)
        .where(eq(oauthApps.appId, appClientId))
        .limit(1);

      if (!app) {
        return reply.status(404).send({ error: "App not found" });
      }

      if (!app.webhookUrl) {
        return reply.status(400).send({ error: "App has no webhook_url configured" });
      }

      // Build the action callback payload
      const actionPayload = {
        type: "card.action",
        timestamp: new Date().toISOString(),
        orgId: app.orgId,
        appId: app.appId,
        data: {
          message_id,
          chat_id: message_row.chatId,
          action_id,
          value: value || {},
        },
      };

      // Sign and deliver the callback to the app's webhook_url
      const payloadStr = JSON.stringify(actionPayload);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signatureBody = `${timestamp}.${payloadStr}`;
      const signature = crypto
        .createHmac("sha256", app.appSecretHash)
        .update(signatureBody)
        .digest("hex");

      try {
        const response = await fetch(app.webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-OpenLark-Signature": `sha256=${signature}`,
            "X-OpenLark-Timestamp": timestamp,
          },
          body: payloadStr,
          signal: AbortSignal.timeout(10000),
        });

        return reply.status(200).send({
          ok: true,
          status: response.status,
        });
      } catch (err) {
        return reply.status(502).send({
          error: "Failed to deliver action callback to app",
        });
      }
    }
  );
}
