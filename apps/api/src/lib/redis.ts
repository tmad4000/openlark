import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

// Main Redis client for general operations
export const redis = new Redis(redisUrl);

// Separate client for pub/sub subscriber (required by Redis for subscriptions)
export const redisSub = new Redis(redisUrl);

// Track active channel subscriptions and their callbacks
type MessageCallback = (channel: string, message: string) => void;
const channelCallbacks = new Map<string, Set<MessageCallback>>();

// Set up the subscriber message handler
redisSub.on("message", (channel: string, message: string) => {
  const callbacks = channelCallbacks.get(channel);
  if (callbacks) {
    for (const callback of callbacks) {
      try {
        callback(channel, message);
      } catch (err) {
        console.error(`Error in Redis subscription callback for ${channel}:`, err);
      }
    }
  }
});

/**
 * Publish a message to a Redis channel
 */
export async function publish(channel: string, event: unknown): Promise<number> {
  const message = typeof event === "string" ? event : JSON.stringify(event);
  return redis.publish(channel, message);
}

/**
 * Subscribe to a Redis channel with a callback
 * Returns an unsubscribe function
 */
export async function subscribe(
  channel: string,
  callback: MessageCallback
): Promise<() => Promise<void>> {
  // Add callback to the set for this channel
  if (!channelCallbacks.has(channel)) {
    channelCallbacks.set(channel, new Set());
    // First subscriber for this channel - actually subscribe
    await redisSub.subscribe(channel);
  }
  channelCallbacks.get(channel)!.add(callback);

  // Return unsubscribe function
  return async () => {
    const callbacks = channelCallbacks.get(channel);
    if (callbacks) {
      callbacks.delete(callback);
      // If no more callbacks for this channel, unsubscribe
      if (callbacks.size === 0) {
        channelCallbacks.delete(channel);
        await redisSub.unsubscribe(channel);
      }
    }
  };
}

/**
 * Get the channel name for a chat
 */
export function getChatChannel(chatId: string): string {
  return `chat:${chatId}`;
}

/**
 * Get the channel name for user presence
 */
export function getUserPresenceChannel(userId: string): string {
  return `presence:${userId}`;
}

// =====================================================
// Typing Indicators
// =====================================================

const TYPING_TTL_SECONDS = 3;

/**
 * Set a user as typing in a chat (ephemeral, 3s TTL)
 */
export async function setTyping(chatId: string, userId: string, displayName: string): Promise<void> {
  const key = `typing:${chatId}`;
  // Store user info as JSON with TTL
  await redis.hset(key, userId, JSON.stringify({ displayName, timestamp: Date.now() }));
  await redis.expire(key, TYPING_TTL_SECONDS + 1); // Slightly longer TTL for the hash itself
}

/**
 * Clear a user's typing status in a chat
 */
export async function clearTyping(chatId: string, userId: string): Promise<void> {
  const key = `typing:${chatId}`;
  await redis.hdel(key, userId);
}

/**
 * Get all users currently typing in a chat (filters out expired entries)
 */
export async function getTypingUsers(chatId: string): Promise<Array<{ userId: string; displayName: string }>> {
  const key = `typing:${chatId}`;
  const data = await redis.hgetall(key);
  const now = Date.now();
  const result: Array<{ userId: string; displayName: string }> = [];

  for (const [userId, value] of Object.entries(data)) {
    try {
      const parsed = JSON.parse(value) as { displayName: string; timestamp: number };
      // Only include if within TTL
      if (now - parsed.timestamp < TYPING_TTL_SECONDS * 1000) {
        result.push({ userId, displayName: parsed.displayName });
      } else {
        // Clean up expired entry
        await redis.hdel(key, userId);
      }
    } catch {
      // Invalid data, remove it
      await redis.hdel(key, userId);
    }
  }

  return result;
}

// =====================================================
// Online Presence
// =====================================================

const PRESENCE_KEY = "presence:online";
const PRESENCE_EXPIRY_SECONDS = 60;

/**
 * Update user's online presence (heartbeat)
 * Uses a sorted set with timestamp as score for easy expiry checking
 */
export async function updatePresence(userId: string): Promise<void> {
  const now = Date.now();
  await redis.zadd(PRESENCE_KEY, now, userId);
}

/**
 * Remove a user from online presence
 */
export async function removePresence(userId: string): Promise<void> {
  await redis.zrem(PRESENCE_KEY, userId);
}

/**
 * Check if a user is online (had heartbeat within expiry window)
 */
export async function isUserOnline(userId: string): Promise<boolean> {
  const score = await redis.zscore(PRESENCE_KEY, userId);
  if (!score) return false;

  const lastSeen = parseInt(score, 10);
  const now = Date.now();
  return now - lastSeen < PRESENCE_EXPIRY_SECONDS * 1000;
}

/**
 * Get online status for multiple users
 */
export async function getOnlineUsers(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();

  const now = Date.now();
  const cutoff = now - PRESENCE_EXPIRY_SECONDS * 1000;
  const online = new Set<string>();

  // Get scores for all requested users
  const pipeline = redis.pipeline();
  for (const userId of userIds) {
    pipeline.zscore(PRESENCE_KEY, userId);
  }
  const results = await pipeline.exec();

  if (results) {
    for (let i = 0; i < userIds.length; i++) {
      const [err, score] = results[i];
      if (!err && score !== null) {
        const lastSeen = parseInt(score as string, 10);
        if (lastSeen > cutoff) {
          online.add(userIds[i]);
        }
      }
    }
  }

  return online;
}

/**
 * Clean up expired presence entries (call periodically)
 */
export async function cleanupExpiredPresence(): Promise<number> {
  const cutoff = Date.now() - PRESENCE_EXPIRY_SECONDS * 1000;
  return redis.zremrangebyscore(PRESENCE_KEY, "-inf", cutoff);
}

// =====================================================
// Shutdown
// =====================================================

// Graceful shutdown
export async function closeRedis(): Promise<void> {
  await redis.quit();
  await redisSub.quit();
}
