import { FastifyInstance } from "fastify";
import { db } from "../db";
import { notifications } from "../db/schema";
import { eq, and, desc, lt, isNull, sql } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";

// UUID validation regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface GetNotificationsQuery {
  cursor?: string;
  limit?: string;
}

export async function notificationsRoutes(fastify: FastifyInstance) {
  /**
   * GET /notifications - Get paginated notifications for the current user
   * Query: cursor (notification ID), limit (default 20, max 100)
   * Returns: { notifications, nextCursor, hasMore, unreadCount }
   */
  fastify.get<{
    Querystring: GetNotificationsQuery;
  }>(
    "/notifications",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { cursor, limit: limitStr } = request.query;
      const currentUserId = request.user.id;

      // Parse and validate limit
      const limit = Math.min(
        Math.max(parseInt(limitStr || "20", 10) || 20, 1),
        100
      );

      // Validate cursor format if provided
      if (cursor && !UUID_REGEX.test(cursor)) {
        return reply.status(400).send({
          error: "Invalid cursor format",
        });
      }

      // Get cursor timestamp for pagination
      let cursorTimestamp: Date | null = null;
      if (cursor) {
        const [cursorNotification] = await db
          .select({ createdAt: notifications.createdAt })
          .from(notifications)
          .where(eq(notifications.id, cursor))
          .limit(1);

        if (cursorNotification) {
          cursorTimestamp = cursorNotification.createdAt;
        }
      }

      // Fetch notifications (newest first)
      const notificationRows = await db
        .select()
        .from(notifications)
        .where(
          cursorTimestamp
            ? and(
                eq(notifications.userId, currentUserId),
                lt(notifications.createdAt, cursorTimestamp)
              )
            : eq(notifications.userId, currentUserId)
        )
        .orderBy(desc(notifications.createdAt))
        .limit(limit + 1);

      // Determine if there are more notifications
      const hasMore = notificationRows.length > limit;
      const resultNotifications = hasMore
        ? notificationRows.slice(0, limit)
        : notificationRows;

      // Get next cursor
      const nextCursor = hasMore
        ? resultNotifications[resultNotifications.length - 1]?.id
        : null;

      // Get unread count
      const [unreadCountResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, currentUserId),
            isNull(notifications.readAt)
          )
        );

      return reply.status(200).send({
        notifications: resultNotifications,
        nextCursor,
        hasMore,
        unreadCount: unreadCountResult?.count || 0,
      });
    }
  );

  /**
   * GET /notifications/unread-count - Get unread notification count
   * Returns: { unreadCount }
   */
  fastify.get(
    "/notifications/unread-count",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const currentUserId = request.user.id;

      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, currentUserId),
            isNull(notifications.readAt)
          )
        );

      return reply.status(200).send({
        unreadCount: result?.count || 0,
      });
    }
  );

  /**
   * PATCH /notifications/:id/read - Mark a single notification as read
   * Returns: Updated notification
   */
  fastify.patch<{
    Params: { id: string };
  }>(
    "/notifications/:id/read",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: notificationId } = request.params;
      const currentUserId = request.user.id;

      // Validate notificationId format
      if (!UUID_REGEX.test(notificationId)) {
        return reply.status(400).send({
          error: "Invalid notification ID format",
        });
      }

      // Get the notification
      const [notification] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, notificationId))
        .limit(1);

      if (!notification) {
        return reply.status(404).send({
          error: "Notification not found",
        });
      }

      // Verify ownership
      if (notification.userId !== currentUserId) {
        return reply.status(403).send({
          error: "You can only mark your own notifications as read",
        });
      }

      // Already read
      if (notification.readAt) {
        return reply.status(200).send(notification);
      }

      // Mark as read
      const [updatedNotification] = await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(eq(notifications.id, notificationId))
        .returning();

      return reply.status(200).send(updatedNotification);
    }
  );

  /**
   * POST /notifications/read-all - Mark all notifications as read
   * Returns: { success, count }
   */
  fastify.post(
    "/notifications/read-all",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const currentUserId = request.user.id;

      // Update all unread notifications for the user
      const result = await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notifications.userId, currentUserId),
            isNull(notifications.readAt)
          )
        )
        .returning({ id: notifications.id });

      return reply.status(200).send({
        success: true,
        count: result.length,
      });
    }
  );
}
