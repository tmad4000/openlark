import { randomBytes } from "crypto";
import type { FastifyInstance } from "fastify";
import { db } from "../../db/index.js";
import { notificationBots } from "../../db/schema/platform.js";
import { eq, and } from "drizzle-orm";
import { authenticate, requireAdmin } from "../auth/middleware.js";
import { messengerService } from "../messenger/messenger.service.js";

function generateToken(): string {
  return randomBytes(48).toString("hex");
}

/**
 * Notification bot management routes (authenticated).
 * Mounted under /messenger/chats/:chatId/bots
 */
export async function notificationBotRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /messenger/chats/:chatId/bots - List bots in a chat
  app.get<{ Params: { chatId: string } }>(
    "/",
    async (req, reply) => {
      const bots = await db
        .select()
        .from(notificationBots)
        .where(eq(notificationBots.chatId, req.params.chatId));

      return reply.send({
        data: {
          bots: bots.map((b) => ({
            id: b.id,
            name: b.name,
            avatarUrl: b.avatarUrl,
            webhookUrl: `/api/v1/webhook-bot/${b.webhookToken}`,
            createdAt: b.createdAt,
          })),
        },
      });
    }
  );

  // POST /messenger/chats/:chatId/bots - Create a notification bot
  app.post<{
    Params: { chatId: string };
    Body: { name: string; avatarUrl?: string };
  }>("/", async (req, reply) => {
    const body = req.body as { name: string; avatarUrl?: string };
    if (!body.name?.trim()) {
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: "Bot name is required",
      });
    }

    const token = generateToken();
    const [bot] = await db
      .insert(notificationBots)
      .values({
        chatId: req.params.chatId,
        orgId: req.user!.orgId,
        name: body.name.trim(),
        avatarUrl: body.avatarUrl ?? null,
        webhookToken: token,
        createdBy: req.user!.id,
      })
      .returning();

    return reply.status(201).send({
      data: {
        bot: {
          id: bot!.id,
          name: bot!.name,
          avatarUrl: bot!.avatarUrl,
          webhookUrl: `/api/v1/webhook-bot/${token}`,
          createdAt: bot!.createdAt,
        },
      },
    });
  });

  // POST /messenger/chats/:chatId/bots/:botId/regenerate - Regenerate webhook token
  app.post<{ Params: { chatId: string; botId: string } }>(
    "/:botId/regenerate",
    async (req, reply) => {
      const newToken = generateToken();
      const [updated] = await db
        .update(notificationBots)
        .set({ webhookToken: newToken })
        .where(
          and(
            eq(notificationBots.id, req.params.botId),
            eq(notificationBots.chatId, req.params.chatId)
          )
        )
        .returning();

      if (!updated) {
        return reply.status(404).send({ code: "NOT_FOUND", message: "Bot not found" });
      }

      return reply.send({
        data: {
          webhookUrl: `/api/v1/webhook-bot/${newToken}`,
        },
      });
    }
  );

  // DELETE /messenger/chats/:chatId/bots/:botId - Delete a bot
  app.delete<{ Params: { chatId: string; botId: string } }>(
    "/:botId",
    async (req, reply) => {
      const [deleted] = await db
        .delete(notificationBots)
        .where(
          and(
            eq(notificationBots.id, req.params.botId),
            eq(notificationBots.chatId, req.params.chatId)
          )
        )
        .returning();

      if (!deleted) {
        return reply.status(404).send({ code: "NOT_FOUND", message: "Bot not found" });
      }

      return reply.send({ data: { success: true } });
    }
  );
}

/**
 * Public webhook endpoint for notification bots (no auth needed).
 * Mounted under /webhook-bot
 */
export async function webhookBotRoutes(app: FastifyInstance) {
  // POST /webhook-bot/:token - Send a message via webhook bot
  app.post<{
    Params: { token: string };
    Body: { text?: string; card?: Record<string, unknown> };
  }>("/:token", async (req, reply) => {
    const { token } = req.params;
    const body = req.body as { text?: string; card?: Record<string, unknown> };

    // Find the bot by token
    const [bot] = await db
      .select()
      .from(notificationBots)
      .where(eq(notificationBots.webhookToken, token));

    if (!bot) {
      return reply.status(404).send({
        code: "NOT_FOUND",
        message: "Invalid webhook URL",
      });
    }

    // Build content
    let contentJson: Record<string, unknown>;
    let type: "card" | "system" = "system";

    if (body.card) {
      contentJson = {
        cardType: "notification_bot",
        botName: bot.name,
        botAvatarUrl: bot.avatarUrl,
        ...body.card,
      };
      type = "card";
    } else if (body.text) {
      contentJson = {
        text: body.text,
        botName: bot.name,
        botAvatarUrl: bot.avatarUrl,
      };
    } else {
      return reply.status(400).send({
        code: "MISSING_CONTENT",
        message: "Either text or card is required",
      });
    }

    const message = await messengerService.sendCardMessage(
      bot.chatId,
      bot.id, // bot ID as sender
      contentJson,
      type
    );

    return reply.send({
      data: {
        message_id: message.id,
      },
    });
  });
}
