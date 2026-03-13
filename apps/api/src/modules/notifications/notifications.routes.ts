import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { notificationsService } from "./notifications.service.js";
import {
  getNotificationsQuerySchema,
  markReadParamsSchema,
} from "./notifications.schemas.js";
import { authenticate } from "../auth/middleware.js";
import { formatZodError } from "../../utils/validation.js";

export async function notificationRoutes(app: FastifyInstance) {
  // All notification routes require authentication
  app.addHook("preHandler", authenticate);

  // GET /notifications - List user's notifications (paginated, newest first)
  app.get("/", async (req, reply) => {
    try {
      const query = getNotificationsQuerySchema.parse(req.query);
      const [items, unreadCount] = await Promise.all([
        notificationsService.getNotifications(req.user!.id, query),
        notificationsService.getUnreadCount(req.user!.id),
      ]);
      return reply.send({
        data: { notifications: items, unreadCount },
      });
    } catch (err) {
      if (err instanceof ZodError) {
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: formatZodError(err) });
      }
      throw err;
    }
  });

  // GET /notifications/unread-count - Get unread notification count
  app.get("/unread-count", async (req, reply) => {
    const count = await notificationsService.getUnreadCount(req.user!.id);
    return reply.send({ data: { unreadCount: count } });
  });

  // PATCH /notifications/:id/read - Mark single notification as read
  app.patch("/:id/read", async (req, reply) => {
    try {
      const { id } = markReadParamsSchema.parse(req.params);
      const notification = await notificationsService.markAsRead(
        id,
        req.user!.id
      );
      if (!notification) {
        return reply.status(404).send({
          code: "NOT_FOUND",
          message: "Notification not found",
        });
      }
      return reply.send({ data: { notification } });
    } catch (err) {
      if (err instanceof ZodError) {
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: formatZodError(err) });
      }
      throw err;
    }
  });

  // POST /notifications/read-all - Mark all notifications as read
  app.post("/read-all", async (req, reply) => {
    const count = await notificationsService.markAllAsRead(req.user!.id);
    return reply.send({ data: { success: true, count } });
  });
}
