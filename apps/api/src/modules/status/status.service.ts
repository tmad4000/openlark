import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users } from "../../db/schema/index.js";

// In-memory custom status store (in production, add columns or use Redis)
const statusStore = new Map<
  string,
  {
    emoji: string | null;
    text: string | null;
    expiresAt: string | null;
  }
>();

class StatusService {
  async getStatus(userId: string) {
    const [user] = await db
      .select({
        workingHoursStart: users.workingHoursStart,
        workingHoursEnd: users.workingHoursEnd,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const customStatus = statusStore.get(userId) || {
      emoji: null,
      text: null,
      expiresAt: null,
    };

    // Check expiry
    if (customStatus.expiresAt && new Date(customStatus.expiresAt) < new Date()) {
      statusStore.delete(userId);
      return {
        emoji: null,
        text: null,
        expiresAt: null,
        workingHoursStart: user?.workingHoursStart || "09:00",
        workingHoursEnd: user?.workingHoursEnd || "17:00",
      };
    }

    return {
      ...customStatus,
      workingHoursStart: user?.workingHoursStart || "09:00",
      workingHoursEnd: user?.workingHoursEnd || "17:00",
    };
  }

  async setStatus(
    userId: string,
    data: {
      emoji?: string;
      text?: string;
      expiresAt?: string;
      workingHoursStart?: string;
      workingHoursEnd?: string;
    }
  ) {
    // Update custom status in memory
    if (data.emoji !== undefined || data.text !== undefined || data.expiresAt !== undefined) {
      const current = statusStore.get(userId) || {
        emoji: null,
        text: null,
        expiresAt: null,
      };
      statusStore.set(userId, {
        emoji: data.emoji !== undefined ? (data.emoji || null) : current.emoji,
        text: data.text !== undefined ? (data.text || null) : current.text,
        expiresAt: data.expiresAt !== undefined ? (data.expiresAt || null) : current.expiresAt,
      });
    }

    // Update working hours in DB if provided
    if (data.workingHoursStart || data.workingHoursEnd) {
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (data.workingHoursStart) updates.workingHoursStart = data.workingHoursStart;
      if (data.workingHoursEnd) updates.workingHoursEnd = data.workingHoursEnd;

      await db.update(users).set(updates).where(eq(users.id, userId));
    }

    return this.getStatus(userId);
  }
}

export const statusService = new StatusService();
