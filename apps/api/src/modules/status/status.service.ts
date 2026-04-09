import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users } from "../../db/schema/index.js";
import { redis } from "../../redis.js";

/**
 * Custom user status (emoji + text + optional expiry).
 *
 * Stored in Redis as a JSON blob under `user:status:<userId>`.
 * When `expiresAt` is present, the key is written with `EX <ttl>` so Redis
 * itself expires the entry — no in-process state required (works under
 * horizontal scaling).
 *
 * Working hours live on the `users` table because they're durable user prefs,
 * not transient status.
 */

const STATUS_KEY_PREFIX = "user:status:";

interface CustomStatus {
  emoji: string | null;
  text: string | null;
  expiresAt: string | null;
}

const EMPTY_STATUS: CustomStatus = { emoji: null, text: null, expiresAt: null };

function statusKey(userId: string): string {
  return `${STATUS_KEY_PREFIX}${userId}`;
}

class StatusService {
  /**
   * Read just the custom status from Redis. If the cached entry has an
   * `expiresAt` in the past (which can happen if the TTL was set inaccurately
   * or the clock skewed), it is treated as cleared.
   */
  async getCustomStatus(userId: string): Promise<CustomStatus> {
    const raw = await redis.get(statusKey(userId));
    if (!raw) return { ...EMPTY_STATUS };

    let parsed: CustomStatus;
    try {
      parsed = JSON.parse(raw) as CustomStatus;
    } catch {
      // Corrupt entry — clear it.
      await redis.del(statusKey(userId));
      return { ...EMPTY_STATUS };
    }

    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() <= Date.now()) {
      await redis.del(statusKey(userId));
      return { ...EMPTY_STATUS };
    }

    return {
      emoji: parsed.emoji ?? null,
      text: parsed.text ?? null,
      expiresAt: parsed.expiresAt ?? null,
    };
  }

  async getStatus(userId: string) {
    const [user] = await db
      .select({
        workingHoursStart: users.workingHoursStart,
        workingHoursEnd: users.workingHoursEnd,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const customStatus = await this.getCustomStatus(userId);

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
    // Update custom status in Redis if any custom-status field was provided.
    if (
      data.emoji !== undefined ||
      data.text !== undefined ||
      data.expiresAt !== undefined
    ) {
      const current = await this.getCustomStatus(userId);
      const next: CustomStatus = {
        emoji:
          data.emoji !== undefined ? (data.emoji || null) : current.emoji,
        text: data.text !== undefined ? (data.text || null) : current.text,
        expiresAt:
          data.expiresAt !== undefined
            ? (data.expiresAt || null)
            : current.expiresAt,
      };

      const allCleared = !next.emoji && !next.text && !next.expiresAt;
      const key = statusKey(userId);

      if (allCleared) {
        await redis.del(key);
      } else if (next.expiresAt) {
        const ttlMs = new Date(next.expiresAt).getTime() - Date.now();
        if (ttlMs <= 0) {
          // expiresAt is already in the past; treat as cleared.
          await redis.del(key);
        } else {
          const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
          await redis.set(key, JSON.stringify(next), "EX", ttlSec);
        }
      } else {
        await redis.set(key, JSON.stringify(next));
      }
    }

    // Working hours are durable user prefs — persist on the users table.
    if (data.workingHoursStart || data.workingHoursEnd) {
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (data.workingHoursStart)
        updates.workingHoursStart = data.workingHoursStart;
      if (data.workingHoursEnd) updates.workingHoursEnd = data.workingHoursEnd;
      await db.update(users).set(updates).where(eq(users.id, userId));
    }

    return this.getStatus(userId);
  }
}

export const statusService = new StatusService();
