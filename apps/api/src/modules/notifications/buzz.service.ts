import { db } from "../../db/index.js";
import { buzzNotifications } from "../../db/schema/index.js";
import { eq, and, sql, gt } from "drizzle-orm";
import { redis } from "../../redis.js";
import type { CreateBuzzInput } from "./buzz.schemas.js";

const MAX_BUZZES_PER_MESSAGE = 3;
const MAX_BUZZES_PER_HOUR = 10;

export class BuzzService {
  // ============ QUERY OPERATIONS ============

  async getBuzzCountForMessage(messageId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(buzzNotifications)
      .where(eq(buzzNotifications.messageId, messageId));
    return result[0]?.count ?? 0;
  }

  async getHourlyBuzzCount(senderId: string): Promise<number> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(buzzNotifications)
      .where(
        and(
          eq(buzzNotifications.senderId, senderId),
          gt(buzzNotifications.createdAt, oneHourAgo)
        )
      );
    return result[0]?.count ?? 0;
  }

  // ============ MUTATION OPERATIONS ============

  async createBuzz(
    messageId: string,
    senderId: string,
    input: CreateBuzzInput
  ) {
    // Check per-message rate limit
    const messageCount = await this.getBuzzCountForMessage(messageId);
    if (messageCount >= MAX_BUZZES_PER_MESSAGE) {
      return { error: "BUZZ_LIMIT_PER_MESSAGE" as const };
    }

    // Check hourly rate limit
    const hourlyCount = await this.getHourlyBuzzCount(senderId);
    if (hourlyCount >= MAX_BUZZES_PER_HOUR) {
      return { error: "BUZZ_LIMIT_PER_HOUR" as const };
    }

    const result = await db
      .insert(buzzNotifications)
      .values({
        messageId,
        senderId,
        recipientId: input.recipient_id,
        type: input.type,
        status: "pending",
      })
      .returning();

    const buzz = result[0]!;

    // For in-app buzzes, mark as delivered immediately
    if (input.type === "in_app") {
      const updated = await db
        .update(buzzNotifications)
        .set({ status: "delivered", deliveredAt: new Date() })
        .where(eq(buzzNotifications.id, buzz.id))
        .returning();
      return { data: updated[0]! };
    }

    return { data: buzz };
  }

  async markBuzzReadByMessage(
    messageId: string,
    recipientId: string
  ): Promise<number> {
    const result = await db
      .update(buzzNotifications)
      .set({ status: "read", readAt: new Date() })
      .where(
        and(
          eq(buzzNotifications.messageId, messageId),
          eq(buzzNotifications.recipientId, recipientId)
        )
      )
      .returning({ id: buzzNotifications.id });
    return result.length;
  }
}

export const buzzService = new BuzzService();
