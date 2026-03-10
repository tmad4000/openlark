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

// Graceful shutdown
export async function closeRedis(): Promise<void> {
  await redis.quit();
  await redisSub.quit();
}
