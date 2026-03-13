/**
 * WebSocket handler for real-time messaging
 *
 * Architecture:
 * - WebSocket connections authenticate via JWT token in query string
 * - Each connected user subscribes to Redis pub/sub channels for their chats
 * - Messages are published to Redis after being persisted to PostgreSQL
 * - Typing indicators and presence are ephemeral (Redis pub/sub only)
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import { redis } from "../../redis.js";
import Redis from "ioredis";
import { config } from "../../config.js";
import { authService } from "../auth/auth.service.js";
import { messengerService } from "./messenger.service.js";

// Separate Redis client for subscriptions (can't use same client for pub and sub)
// Created lazily to avoid issues with multiple test instances
let subscriber: Redis | null = null;
let subscriberInitialized = false;

function getSubscriber(): Redis {
  if (!subscriber) {
    subscriber = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  return subscriber;
}

// Map of userId -> WebSocket connections (user can have multiple connections)
const userConnections = new Map<string, Set<WebSocket>>();

// Map of chatId -> Set of userIds subscribed
const chatSubscribers = new Map<string, Set<string>>();

// Track Redis channel subscriptions for cleanup
const subscribedChannels = new Set<string>();

// Constants for presence and typing
const PRESENCE_TTL = 60; // seconds - expires after 60s without heartbeat
const PRESENCE_KEY_PREFIX = "presence:";
const TYPING_TTL = 3; // seconds - typing indicator auto-expires
const TYPING_KEY_PREFIX = "typing:";

interface WsMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * Authenticate WebSocket connection using JWT from query string
 */
async function authenticateConnection(
  request: FastifyRequest
): Promise<{ userId: string; orgId: string } | null> {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const token = url.searchParams.get("token");

  if (!token) {
    return null;
  }

  try {
    // Verify JWT and validate session exists
    const payload = authService.verifyToken(token);
    const session = await authService.getSessionById(payload.sessionId);

    if (!session || session.userId !== payload.sub) {
      return null;
    }

    // Get user's org
    const user = await authService.getUserById(payload.sub);
    if (!user) {
      return null;
    }

    return { userId: payload.sub, orgId: user.orgId };
  } catch {
    return null;
  }
}

/**
 * Subscribe user to their chat channels
 */
async function subscribeUserToChats(
  userId: string,
  orgId: string
): Promise<string[]> {
  const chats = await messengerService.getUserChats(userId, orgId);
  const chatIds = chats.map((chat) => chat.id);

  // Track subscriptions
  for (const chatId of chatIds) {
    if (!chatSubscribers.has(chatId)) {
      chatSubscribers.set(chatId, new Set());
    }
    chatSubscribers.get(chatId)!.add(userId);
  }

  return chatIds;
}

/**
 * Unsubscribe user from all chat channels
 */
function unsubscribeUser(userId: string): void {
  for (const [chatId, subscribers] of chatSubscribers) {
    subscribers.delete(userId);
    if (subscribers.size === 0) {
      chatSubscribers.delete(chatId);
    }
  }
}

/**
 * Send message to all connections of a user
 */
function sendToUser(userId: string, message: WsMessage): void {
  const connections = userConnections.get(userId);
  if (connections) {
    const payload = JSON.stringify(message);
    for (const ws of connections) {
      if (ws.readyState === 1) {
        // OPEN
        ws.send(payload);
      }
    }
  }
}

/**
 * Broadcast message to all members of a chat
 */
function broadcastToChat(
  chatId: string,
  message: WsMessage,
  excludeUserId?: string
): void {
  const subscribers = chatSubscribers.get(chatId);
  if (!subscribers) return;

  for (const userId of subscribers) {
    if (userId !== excludeUserId) {
      sendToUser(userId, message);
    }
  }
}

/**
 * Set user presence in Redis
 */
async function setPresence(userId: string): Promise<void> {
  await redis.setex(`${PRESENCE_KEY_PREFIX}${userId}`, PRESENCE_TTL, "online");
}

/**
 * Clear user presence from Redis
 */
async function clearPresence(userId: string): Promise<void> {
  await redis.del(`${PRESENCE_KEY_PREFIX}${userId}`);
}

/**
 * Handle incoming WebSocket messages from client
 */
async function handleClientMessage(
  ws: WebSocket,
  userId: string,
  message: WsMessage
): Promise<void> {
  switch (message.type) {
    case "typing:start":
    case "typing:stop": {
      const chatId = message.chatId as string;
      if (!chatId) return;

      // Verify user is a member
      const isMember = await messengerService.isChatMember(chatId, userId);
      if (!isMember) return;

      // Set/clear typing indicator in Redis with 3s TTL (debounced, auto-expires)
      const typingKey = `${TYPING_KEY_PREFIX}${chatId}:${userId}`;
      if (message.type === "typing:start") {
        await redis.setex(typingKey, TYPING_TTL, "1");
      } else {
        await redis.del(typingKey);
      }

      // Publish to Redis for distribution
      await redis.publish(
        `chat:${chatId}`,
        JSON.stringify({
          type: message.type,
          chatId,
          userId,
        })
      );
      break;
    }

    case "ping": {
      // Heartbeat - update presence TTL
      await setPresence(userId);
      ws.send(JSON.stringify({ type: "pong" }));
      break;
    }

    default:
      // Unknown message type - ignore
      break;
  }
}

/**
 * Handle Redis pub/sub messages
 */
function handleRedisMessage(channel: string, message: string): void {
  try {
    const data = JSON.parse(message) as WsMessage;

    if (channel.startsWith("chat:")) {
      const chatId = channel.replace("chat:", "");

      // Broadcast to all subscribers of this chat
      // Exclude the sender for typing indicators (they don't need their own)
      const excludeUserId =
        data.type.startsWith("typing:") ? (data.userId as string) : undefined;
      broadcastToChat(chatId, data, excludeUserId);
    }
  } catch {
    // Invalid message format - ignore
  }
}

/**
 * Subscribe to Redis channels for a list of chat IDs
 */
async function subscribeToRedisChannels(chatIds: string[]): Promise<void> {
  if (chatIds.length === 0 || !subscriberInitialized) return;

  const channels = chatIds.map((id) => `chat:${id}`);
  for (const channel of channels) {
    subscribedChannels.add(channel);
  }
  await getSubscriber().subscribe(...channels);
}

/**
 * Initialize Redis subscriber message handler
 */
function initializeRedisSubscriber(): void {
  getSubscriber().on("message", handleRedisMessage);
}

/**
 * Publish a message event to a chat channel
 */
export async function publishMessageEvent(
  chatId: string,
  event: WsMessage
): Promise<void> {
  const channel = `chat:${chatId}`;
  const payload = JSON.stringify(event);
  await redis.publish(channel, payload);
}

/**
 * Notify users that they've been added to a chat
 *
 * Only adds to subscription tracking if user is currently connected.
 * If not connected, they'll subscribe when they connect next.
 */
export async function notifyUserJoinedChat(
  chatId: string,
  userId: string
): Promise<void> {
  // Only track and subscribe if user is currently connected
  if (userConnections.has(userId)) {
    // Add to in-memory subscription tracking
    if (!chatSubscribers.has(chatId)) {
      chatSubscribers.set(chatId, new Set());
    }
    chatSubscribers.get(chatId)!.add(userId);

    // Subscribe to Redis channel
    await subscribeToRedisChannels([chatId]);

    // Notify the connected user
    sendToUser(userId, {
      type: "chat:joined",
      chatId,
    });
  }
  // If not connected, user will get the chat via getUserChats when they connect
}

/**
 * Register WebSocket routes
 */
export async function registerWebSocketRoutes(
  app: FastifyInstance
): Promise<void> {
  // Initialize Redis subscriber (skip in test mode when Redis may not be available)
  if (!subscriberInitialized) {
    try {
      const sub = getSubscriber();
      if (sub.status === "wait") {
        await sub.connect();
      }
      initializeRedisSubscriber();
      subscriberInitialized = true;
    } catch (error) {
      // Redis not available - WebSocket real-time features will be disabled
      app.log.warn({ error }, "Redis not available, WebSocket pub/sub disabled");
    }
  }

  // WebSocket endpoint
  app.get(
    "/ws",
    { websocket: true },
    async (socket: WebSocket, request: FastifyRequest) => {
      // Authenticate connection
      const auth = await authenticateConnection(request);
      if (!auth) {
        socket.close(4001, "Unauthorized");
        return;
      }

      const { userId, orgId } = auth;

      // Add to connection tracking
      if (!userConnections.has(userId)) {
        userConnections.set(userId, new Set());
      }
      userConnections.get(userId)!.add(socket);

      // Subscribe to user's chats
      const chatIds = await subscribeUserToChats(userId, orgId);
      await subscribeToRedisChannels(chatIds);

      // Set presence
      await setPresence(userId);

      // Notify other users in shared chats that this user is online
      for (const chatId of chatIds) {
        broadcastToChat(
          chatId,
          {
            type: "presence:online",
            userId,
            chatId,
          },
          userId
        );
      }

      // Send welcome message
      socket.send(
        JSON.stringify({
          type: "connected",
          userId,
        })
      );

      // Send subscription confirmation
      socket.send(
        JSON.stringify({
          type: "subscribed",
          chatIds,
        })
      );

      // Handle incoming messages
      socket.on("message", async (data) => {
        try {
          const message = JSON.parse(data.toString()) as WsMessage;
          await handleClientMessage(socket, userId, message);
        } catch {
          // Invalid JSON - ignore
        }
      });

      // Handle disconnect
      socket.on("close", async () => {
        // Remove from connection tracking
        const connections = userConnections.get(userId);
        if (connections) {
          connections.delete(socket);
          if (connections.size === 0) {
            userConnections.delete(userId);

            // Only clear presence and notify offline if no more connections
            await clearPresence(userId);
            unsubscribeUser(userId);

            // Notify other users in shared chats that this user is offline
            for (const chatId of chatIds) {
              broadcastToChat(chatId, {
                type: "presence:offline",
                userId,
                chatId,
              });
            }
          }
        }
      });

      // Handle errors
      socket.on("error", (error) => {
        app.log.error({ error, userId }, "WebSocket error");
      });
    }
  );
}

/**
 * Reset WebSocket state (for testing purposes)
 * This closes all connections, clears in-memory tracking, and unsubscribes from Redis.
 */
export async function resetWebSocketState(): Promise<void> {
  // Close all WebSocket connections gracefully
  for (const connections of userConnections.values()) {
    for (const ws of connections) {
      try {
        ws.close(1000, "Test reset");
      } catch {
        // Ignore errors from already-closed connections
      }
    }
  }

  // Wait for close handlers to complete and connections to fully close
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Clear in-memory state
  userConnections.clear();
  chatSubscribers.clear();

  // Unsubscribe from all Redis channels
  if (subscriberInitialized && subscribedChannels.size > 0) {
    try {
      const channels = Array.from(subscribedChannels);
      await getSubscriber().unsubscribe(...channels);
    } catch {
      // Ignore errors if Redis is not available
    }
  }
  subscribedChannels.clear();
}
