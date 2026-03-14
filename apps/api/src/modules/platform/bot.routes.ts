import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { platformService } from "./platform.service.js";
import { webhookService } from "./webhook.service.js";
import { messengerService } from "../messenger/messenger.service.js";

/**
 * Authenticate a bot request using app_access_token.
 * The token format is: "Bearer <appId>:<appSecret>"
 */
async function authenticateBot(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return reply.status(401).send({
      code: "UNAUTHORIZED",
      message: "Missing or invalid authorization header",
    });
  }

  const token = authHeader.slice(7);
  const colonIdx = token.indexOf(":");
  if (colonIdx === -1) {
    return reply.status(401).send({
      code: "INVALID_TOKEN",
      message: "Invalid app access token format. Expected appId:appSecret",
    });
  }

  const appId = token.slice(0, colonIdx);
  const appSecret = token.slice(colonIdx + 1);

  const app = await platformService.getAppByAppId(appId);
  if (!app) {
    return reply.status(401).send({
      code: "INVALID_CLIENT",
      message: "Unknown app",
    });
  }

  if (!app.botEnabled) {
    return reply.status(403).send({
      code: "BOT_DISABLED",
      message: "Bot messaging is not enabled for this app",
    });
  }

  if (!platformService.verifyAppSecret(appSecret, app.appSecretHash)) {
    return reply.status(401).send({
      code: "INVALID_SECRET",
      message: "Invalid app secret",
    });
  }

  // Attach app context for route handlers
  (req as unknown as Record<string, unknown>).platformApp = {
    id: app.id,
    orgId: app.orgId,
    appId: app.appId,
    webhookUrl: app.webhookUrl,
  };
}

interface PlatformAppContext {
  id: string;
  orgId: string;
  appId: string;
  webhookUrl: string | null;
}

function getAppContext(req: FastifyRequest): PlatformAppContext {
  return (req as unknown as Record<string, unknown>).platformApp as PlatformAppContext;
}

/**
 * Bot messaging routes.
 * Mounted under /bot
 */
export async function botRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateBot);

  // POST /bot/messages/send - Send a message to a chat
  app.post<{
    Body: {
      chat_id: string;
      content: string | Record<string, unknown>;
      msg_type?: "text" | "rich_text" | "interactive";
    };
  }>("/messages/send", async (req, reply) => {
    const ctx = getAppContext(req);
    const body = req.body as {
      chat_id: string;
      content: string | Record<string, unknown>;
      msg_type?: string;
    };

    if (!body.chat_id) {
      return reply.status(400).send({
        code: "MISSING_CHAT_ID",
        message: "chat_id is required",
      });
    }

    if (!body.content) {
      return reply.status(400).send({
        code: "MISSING_CONTENT",
        message: "content is required",
      });
    }

    const msgType = body.msg_type || "text";
    let contentJson: Record<string, unknown>;

    if (msgType === "text" && typeof body.content === "string") {
      contentJson = { text: body.content };
    } else if (msgType === "interactive" && typeof body.content === "object") {
      // Interactive card format:
      // { header: { title, template }, elements: [...blocks], actions: [...buttons] }
      contentJson = {
        cardType: "bot_card",
        appId: ctx.appId,
        ...(body.content as Record<string, unknown>),
      };
    } else if (typeof body.content === "object") {
      contentJson = body.content as Record<string, unknown>;
    } else {
      contentJson = { text: String(body.content) };
    }

    try {
      // Use sendCardMessage which skips membership check (bot sends as system)
      const message = await messengerService.sendCardMessage(
        body.chat_id,
        ctx.id, // app.id as sender (bot identity)
        contentJson,
        msgType === "interactive" ? "card" : "system"
      );

      return reply.send({
        data: {
          message_id: message.id,
          chat_id: message.chatId,
        },
      });
    } catch {
      return reply.status(500).send({
        code: "SEND_FAILED",
        message: "Failed to send message",
      });
    }
  });

  // POST /bot/messages/update - Update a previously sent message/card
  app.post<{
    Body: {
      message_id: string;
      content: Record<string, unknown>;
    };
  }>("/messages/update", async (req, reply) => {
    const ctx = getAppContext(req);
    const body = req.body as {
      message_id: string;
      content: Record<string, unknown>;
    };

    if (!body.message_id) {
      return reply.status(400).send({
        code: "MISSING_MESSAGE_ID",
        message: "message_id is required",
      });
    }

    if (!body.content) {
      return reply.status(400).send({
        code: "MISSING_CONTENT",
        message: "content is required",
      });
    }

    const contentJson = {
      cardType: "bot_card",
      appId: ctx.appId,
      ...(body.content as Record<string, unknown>),
    };

    const updated = await messengerService.updateMessageContent(
      body.message_id,
      contentJson
    );

    if (!updated) {
      return reply.status(404).send({
        code: "NOT_FOUND",
        message: "Message not found",
      });
    }

    return reply.send({
      data: {
        message_id: updated.id,
      },
    });
  });

  // POST /bot/actions/callback - Internal endpoint for card action callbacks
  // When a user clicks a button on an interactive card, the frontend calls this
  // and we forward to the app's webhook_url
  app.post<{
    Body: {
      app_id: string;
      action: Record<string, unknown>;
      message_id: string;
      user_id: string;
    };
  }>("/actions/callback", async (req, reply) => {
    const ctx = getAppContext(req);
    const body = req.body as {
      app_id: string;
      action: Record<string, unknown>;
      message_id: string;
      user_id: string;
    };

    if (!ctx.webhookUrl) {
      return reply.status(400).send({
        code: "NO_WEBHOOK",
        message: "App does not have a webhook URL configured",
      });
    }

    // Dispatch the action callback to the app's webhook
    await webhookService.dispatch({
      eventType: "card.action",
      payload: {
        action: body.action,
        message_id: body.message_id,
        user_id: body.user_id,
        app_id: ctx.appId,
      },
      orgId: ctx.orgId,
    });

    return reply.send({ data: { success: true } });
  });
}
