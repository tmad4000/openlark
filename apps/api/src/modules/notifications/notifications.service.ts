import { db } from "../../db/index.js";
import { notifications } from "../../db/schema/index.js";
import { eq, desc, and, isNull, sql } from "drizzle-orm";

export class NotificationsService {
  // ============ QUERY OPERATIONS ============

  async getNotifications(
    userId: string,
    params: { limit: number; offset: number }
  ) {
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(params.limit)
      .offset(params.offset);

    return rows;
  }

  async getUnreadCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          isNull(notifications.readAt)
        )
      );

    return result[0]?.count ?? 0;
  }

  // ============ MUTATION OPERATIONS ============

  async markAsRead(notificationId: string, userId: string) {
    const result = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, userId)
        )
      )
      .returning();

    return result[0] ?? null;
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.userId, userId),
          isNull(notifications.readAt)
        )
      )
      .returning({ id: notifications.id });

    return result.length;
  }

  // ============ NOTIFICATION GENERATION ============

  async createNotification(data: {
    userId: string;
    type: "dm_received" | "mentioned" | "thread_reply" | "task_assigned" | "approval_pending";
    title: string;
    body?: string;
    entityType?: string;
    entityId?: string;
  }) {
    const result = await db
      .insert(notifications)
      .values({
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body ?? null,
        entityType: data.entityType ?? null,
        entityId: data.entityId ?? null,
      })
      .returning();

    return result[0]!;
  }
}

export const notificationsService = new NotificationsService();
