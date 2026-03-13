import { FastifyInstance } from "fastify";
import crypto from "crypto";
import { db } from "../db";
import { notificationBots, chats, chatMembers, messages, users } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { publish, getChatChannel } from "../lib/redis";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function generateWebhookToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

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
}

interface InteractiveCard {
  header?: CardHeader;
  elements: CardBlock[];
}

interface WebhookPayload {
  text?: string;
  card?: InteractiveCard;
}

export async function notificationBotRoutes(fastify: FastifyInstance) {
  // ── List notification bots for a chat ────────────────────────
  // GET /chats/:chatId/notification-bots
  fastify.get<{ Params: { chatId: string } }>(
    "/chats/:chatId/notification-bots",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const userId = (request as any).user.id;
      const { chatId } = request.params;

      if (!UUID_REGEX.test(chatId)) {
        return reply.status(400).send({ error: "Invalid chatId" });
      }

      // Verify user is a member of the chat
      const [membership] = await db
        .select()
        .from(chatMembers)
        .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId)))
        .limit(1);

      if (!membership) {
        return reply.status(403).send({ error: "Not a member of this chat" });
      }

      const bots = await db
        .select({
          id: notificationBots.id,
          name: notificationBots.name,
          iconUrl: notificationBots.iconUrl,
          webhookToken: notificationBots.webhookToken,
          createdAt: notificationBots.createdAt,
          createdBy: notificationBots.createdBy,
        })
        .from(notificationBots)
        .where(eq(notificationBots.chatId, chatId));

      // Build webhook URLs
      const baseUrl = process.env.API_URL || "http://localhost:3001";
      const botsWithUrls = bots.map((bot) => ({
        ...bot,
        webhookUrl: `${baseUrl}/webhooks/notification/${bot.webhookToken}`,
      }));

      return reply.status(200).send(botsWithUrls);
    }
  );

  // ── Create notification bot ──────────────────────────────────
  // POST /chats/:chatId/notification-bots
  fastify.post<{
    Params: { chatId: string };
    Body: { name?: string; icon_url?: string };
  }>(
    "/chats/:chatId/notification-bots",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const userId = (request as any).user.id;
      const { chatId } = request.params;
      const { name, icon_url } = request.body || {};

      if (!UUID_REGEX.test(chatId)) {
        return reply.status(400).send({ error: "Invalid chatId" });
      }

      // Verify chat exists and is a group
      const [chat] = await db
        .select()
        .from(chats)
        .where(eq(chats.id, chatId))
        .limit(1);

      if (!chat) {
        return reply.status(404).send({ error: "Chat not found" });
      }

      if (chat.type === "dm") {
        return reply.status(400).send({ error: "Cannot add notification bots to DMs" });
      }

      // Verify user is owner or admin
      const [membership] = await db
        .select()
        .from(chatMembers)
        .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId)))
        .limit(1);

      if (!membership || membership.role === "member") {
        return reply.status(403).send({ error: "Only owners and admins can add notification bots" });
      }

      const webhookToken = generateWebhookToken();

      const [bot] = await db
        .insert(notificationBots)
        .values({
          chatId,
          orgId: chat.orgId,
          name: name || "Notification Bot",
          iconUrl: icon_url || null,
          webhookToken,
          createdBy: userId,
        })
        .returning();

      const baseUrl = process.env.API_URL || "http://localhost:3001";

      return reply.status(201).send({
        id: bot.id,
        name: bot.name,
        iconUrl: bot.iconUrl,
        webhookToken: bot.webhookToken,
        webhookUrl: `${baseUrl}/webhooks/notification/${bot.webhookToken}`,
        createdAt: bot.createdAt,
      });
    }
  );

  // ── Update notification bot ──────────────────────────────────
  // PATCH /notification-bots/:botId
  fastify.patch<{
    Params: { botId: string };
    Body: { name?: string; icon_url?: string };
  }>(
    "/notification-bots/:botId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const userId = (request as any).user.id;
      const { botId } = request.params;
      const { name, icon_url } = request.body || {};

      if (!UUID_REGEX.test(botId)) {
        return reply.status(400).send({ error: "Invalid botId" });
      }

      const [bot] = await db
        .select()
        .from(notificationBots)
        .where(eq(notificationBots.id, botId))
        .limit(1);

      if (!bot) {
        return reply.status(404).send({ error: "Notification bot not found" });
      }

      // Verify user is owner/admin of the chat
      const [membership] = await db
        .select()
        .from(chatMembers)
        .where(and(eq(chatMembers.chatId, bot.chatId), eq(chatMembers.userId, userId)))
        .limit(1);

      if (!membership || membership.role === "member") {
        return reply.status(403).send({ error: "Only owners and admins can update notification bots" });
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (name !== undefined) updates.name = name;
      if (icon_url !== undefined) updates.iconUrl = icon_url;

      const [updated] = await db
        .update(notificationBots)
        .set(updates)
        .where(eq(notificationBots.id, botId))
        .returning();

      return reply.status(200).send(updated);
    }
  );

  // ── Regenerate webhook URL ───────────────────────────────────
  // POST /notification-bots/:botId/regenerate
  fastify.post<{ Params: { botId: string } }>(
    "/notification-bots/:botId/regenerate",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const userId = (request as any).user.id;
      const { botId } = request.params;

      if (!UUID_REGEX.test(botId)) {
        return reply.status(400).send({ error: "Invalid botId" });
      }

      const [bot] = await db
        .select()
        .from(notificationBots)
        .where(eq(notificationBots.id, botId))
        .limit(1);

      if (!bot) {
        return reply.status(404).send({ error: "Notification bot not found" });
      }

      // Verify user is owner/admin
      const [membership] = await db
        .select()
        .from(chatMembers)
        .where(and(eq(chatMembers.chatId, bot.chatId), eq(chatMembers.userId, userId)))
        .limit(1);

      if (!membership || membership.role === "member") {
        return reply.status(403).send({ error: "Only owners and admins can regenerate webhook URLs" });
      }

      const newToken = generateWebhookToken();

      const [updated] = await db
        .update(notificationBots)
        .set({ webhookToken: newToken, updatedAt: new Date() })
        .where(eq(notificationBots.id, botId))
        .returning();

      const baseUrl = process.env.API_URL || "http://localhost:3001";

      return reply.status(200).send({
        id: updated.id,
        name: updated.name,
        webhookToken: updated.webhookToken,
        webhookUrl: `${baseUrl}/webhooks/notification/${updated.webhookToken}`,
      });
    }
  );

  // ── Delete notification bot ──────────────────────────────────
  // DELETE /notification-bots/:botId
  fastify.delete<{ Params: { botId: string } }>(
    "/notification-bots/:botId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const userId = (request as any).user.id;
      const { botId } = request.params;

      if (!UUID_REGEX.test(botId)) {
        return reply.status(400).send({ error: "Invalid botId" });
      }

      const [bot] = await db
        .select()
        .from(notificationBots)
        .where(eq(notificationBots.id, botId))
        .limit(1);

      if (!bot) {
        return reply.status(404).send({ error: "Notification bot not found" });
      }

      // Verify user is owner/admin
      const [membership] = await db
        .select()
        .from(chatMembers)
        .where(and(eq(chatMembers.chatId, bot.chatId), eq(chatMembers.userId, userId)))
        .limit(1);

      if (!membership || membership.role === "member") {
        return reply.status(403).send({ error: "Only owners and admins can delete notification bots" });
      }

      await db.delete(notificationBots).where(eq(notificationBots.id, botId));

      return reply.status(200).send({ ok: true });
    }
  );

  // ── Public Webhook Receiver (no auth required) ──────────────
  // POST /webhooks/notification/:token
  fastify.post<{
    Params: { token: string };
    Body: WebhookPayload;
  }>("/webhooks/notification/:token", async (request, reply) => {
    const { token } = request.params;
    const body = request.body;

    if (!token || token.length !== 64) {
      return reply.status(400).send({ error: "Invalid webhook token" });
    }

    // Look up the bot by webhook token
    const [bot] = await db
      .select()
      .from(notificationBots)
      .where(eq(notificationBots.webhookToken, token))
      .limit(1);

    if (!bot) {
      return reply.status(404).send({ error: "Webhook not found or invalid token" });
    }

    // Validate payload
    if (!body || (!body.text && !body.card)) {
      return reply.status(400).send({ error: "Request body must contain 'text' or 'card'" });
    }

    // Determine message type and content
    let messageType: "text" | "card";
    let messageContent: Record<string, unknown>;

    if (body.card) {
      messageType = "card";
      messageContent = {
        card: body.card,
        notification_bot_id: bot.id,
        notification_bot_name: bot.name,
      };
    } else {
      messageType = "text";
      messageContent = {
        text: body.text,
        notification_bot_id: bot.id,
        notification_bot_name: bot.name,
      };
    }

    // Create a deterministic bot sender ID from the bot's id
    const botHash = crypto
      .createHash("sha256")
      .update(`notification-bot:${bot.id}`)
      .digest("hex")
      .slice(0, 8);
    const botSenderId = `00000000-0000-4000-b000-${botHash}0000`;

    // Insert message
    const [message] = await db
      .insert(messages)
      .values({
        chatId: bot.chatId,
        senderId: botSenderId,
        type: messageType,
        content: messageContent,
      })
      .returning();

    // Publish to Redis for real-time delivery
    await publish(getChatChannel(bot.chatId), {
      type: "message",
      payload: {
        ...message,
        sender: {
          id: botSenderId,
          displayName: bot.name,
          avatarUrl: bot.iconUrl,
        },
      },
    });

    return reply.status(200).send({
      ok: true,
      message_id: message.id,
    });
  });
}
