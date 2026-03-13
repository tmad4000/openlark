import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { buzzService } from "./buzz.service.js";
import { notificationsService } from "./notifications.service.js";
import { createBuzzSchema, buzzMessageParamsSchema } from "./buzz.schemas.js";
import { authenticate } from "../auth/middleware.js";
import { formatZodError } from "../../utils/validation.js";
import { messengerService } from "../messenger/messenger.service.js";
import { publishMessageEvent } from "../messenger/websocket.js";

export async function buzzRoutes(app: FastifyInstance) {
  // All buzz routes require authentication
  app.addHook("preHandler", authenticate);

  // POST /messages/:messageId/buzz - Create a buzz notification
  app.post<{ Params: { messageId: string } }>(
    "/messages/:messageId/buzz",
    async (req, reply) => {
      try {
        const { messageId } = buzzMessageParamsSchema.parse(req.params);
        const input = createBuzzSchema.parse(req.body);

        // Verify message exists
        const message = await messengerService.getMessageById(messageId);
        if (!message) {
          return reply.status(404).send({
            code: "MESSAGE_NOT_FOUND",
            message: "Message not found",
          });
        }

        // Only message sender can buzz their own messages
        if (message.senderId !== req.user!.id) {
          return reply.status(403).send({
            code: "FORBIDDEN",
            message: "Only the message sender can buzz their own messages",
          });
        }

        // Cannot buzz yourself
        if (input.recipient_id === req.user!.id) {
          return reply.status(400).send({
            code: "INVALID_RECIPIENT",
            message: "Cannot buzz yourself",
          });
        }

        const result = await buzzService.createBuzz(
          messageId,
          req.user!.id,
          input
        );

        if ("error" in result) {
          const msg =
            result.error === "BUZZ_LIMIT_PER_MESSAGE"
              ? "Maximum 3 buzzes per message reached"
              : "Maximum 10 buzzes per hour reached";
          return reply.status(429).send({
            code: result.error,
            message: msg,
          });
        }

        // Create high-priority in-app notification
        await notificationsService.createNotification({
          userId: input.recipient_id,
          type: "dm_received",
          title: `Urgent buzz from ${req.user!.email}`,
          body: "You have an urgent notification. Check this message now.",
          entityType: "message",
          entityId: messageId,
        });

        // Publish real-time event for the buzz
        if (message.chatId) {
          await publishMessageEvent(message.chatId, {
            type: "buzz:new",
            chatId: message.chatId,
            messageId,
            recipientId: input.recipient_id,
            senderId: req.user!.id,
            buzzType: input.type,
          });
        }

        return reply.status(201).send({ data: { buzz: result.data } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply
            .status(400)
            .send({ code: "VALIDATION_ERROR", message: formatZodError(error) });
        }
        throw error;
      }
    }
  );
}
