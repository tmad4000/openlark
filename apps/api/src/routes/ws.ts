import { FastifyInstance, FastifyRequest } from "fastify";
import { WebSocket } from "@fastify/websocket";
import crypto from "crypto";
import { db } from "../db";
import { sessions, users, organizations, chatMembers } from "../db/schema";
import { eq, and, gt } from "drizzle-orm";
import {
  subscribe,
  publish,
  getChatChannel,
  setTyping,
  clearTyping,
  getTypingUsers,
  updatePresence,
  removePresence,
  cleanupExpiredPresence,
} from "../lib/redis";
import type { User, Organization } from "../db/schema";

// Track active WebSocket connections by user ID
const userConnections = new Map<string, Set<WebSocket>>();

// Track unsubscribe functions per connection
const connectionSubscriptions = new WeakMap<WebSocket, Array<() => Promise<void>>>();

interface AuthenticatedConnection {
  user: Omit<User, "passwordHash">;
  org: Organization | null;
  socket: WebSocket;
}

/**
 * Authenticate a WebSocket connection using a token query parameter
 */
async function authenticateConnection(
  token: string
): Promise<{ user: Omit<User, "passwordHash">; org: Organization | null } | null> {
  if (!token) {
    return null;
  }

  // Hash the token before lookup
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  // Look up session by token hash
  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        gt(sessions.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!session) {
    return null;
  }

  // Look up user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user || user.deletedAt) {
    return null;
  }

  // Look up organization if user has one
  let org: Organization | null = null;
  if (user.orgId) {
    const [foundOrg] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, user.orgId))
      .limit(1);
    org = foundOrg || null;
  }

  const { passwordHash: _, ...userWithoutPassword } = user;
  return { user: userWithoutPassword, org };
}

/**
 * Subscribe a connection to all of the user's chat channels
 */
async function subscribeToUserChats(
  userId: string,
  socket: WebSocket
): Promise<Array<() => Promise<void>>> {
  // Get all chats the user is a member of
  const memberships = await db
    .select({ chatId: chatMembers.chatId })
    .from(chatMembers)
    .where(eq(chatMembers.userId, userId));

  const unsubscribers: Array<() => Promise<void>> = [];

  for (const membership of memberships) {
    const channel = getChatChannel(membership.chatId);
    const unsubscribe = await subscribe(channel, (_channel, message) => {
      // Forward the message to this WebSocket connection
      if (socket.readyState === socket.OPEN) {
        socket.send(message);
      }
    });
    unsubscribers.push(unsubscribe);
  }

  return unsubscribers;
}

/**
 * Clean up a WebSocket connection
 */
async function cleanupConnection(socket: WebSocket, userId: string): Promise<void> {
  // Unsubscribe from all channels
  const unsubscribers = connectionSubscriptions.get(socket);
  if (unsubscribers) {
    for (const unsubscribe of unsubscribers) {
      try {
        await unsubscribe();
      } catch (err) {
        console.error("Error unsubscribing:", err);
      }
    }
    connectionSubscriptions.delete(socket);
  }

  // Remove from user connections tracking
  const connections = userConnections.get(userId);
  if (connections) {
    connections.delete(socket);
    if (connections.size === 0) {
      userConnections.delete(userId);
      // User has no more connections - remove presence
      await removePresence(userId);
    }
  }
}

/**
 * Get chat member IDs for broadcasting typing events
 */
async function getChatMemberIds(chatId: string): Promise<string[]> {
  const members = await db
    .select({ userId: chatMembers.userId })
    .from(chatMembers)
    .where(eq(chatMembers.chatId, chatId));
  return members.map((m) => m.userId);
}

/**
 * Broadcast typing indicator to chat members
 */
async function broadcastTypingEvent(
  chatId: string,
  userId: string,
  displayName: string,
  isTyping: boolean
): Promise<void> {
  const event = {
    type: "typing",
    chatId,
    userId,
    displayName,
    isTyping,
  };

  // Publish to the chat channel so all subscribers receive it
  await publish(getChatChannel(chatId), event);
}

/**
 * Broadcast presence update to all connected users in the org
 */
async function broadcastPresenceEvent(
  userId: string,
  displayName: string,
  isOnline: boolean,
  orgId: string | null
): Promise<void> {
  const event = {
    type: "presence",
    userId,
    displayName,
    isOnline,
  };

  // Broadcast to all connected users (they'll filter by relevance on the client)
  // In production, you might want to be more selective (e.g., only users in same org or chats)
  const eventStr = JSON.stringify(event);
  for (const [connectedUserId, connections] of userConnections) {
    // Skip the user themselves
    if (connectedUserId === userId) continue;

    for (const socket of connections) {
      if (socket.readyState === socket.OPEN) {
        socket.send(eventStr);
      }
    }
  }
}

export async function wsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    "/ws",
    { websocket: true },
    async (socket: WebSocket, request: FastifyRequest) => {
      // Get token from query parameter
      const url = new URL(request.url, `http://${request.headers.host}`);
      const token = url.searchParams.get("token");

      if (!token) {
        socket.close(4001, "Token required");
        return;
      }

      // Authenticate the connection
      const auth = await authenticateConnection(token);

      if (!auth) {
        socket.close(4001, "Invalid or expired token");
        return;
      }

      const { user, org } = auth;

      // Track this connection
      if (!userConnections.has(user.id)) {
        userConnections.set(user.id, new Set());
      }
      userConnections.get(user.id)!.add(socket);

      // Subscribe to user's chat channels
      const unsubscribers = await subscribeToUserChats(user.id, socket);
      connectionSubscriptions.set(socket, unsubscribers);

      // Set initial presence
      await updatePresence(user.id);

      // Broadcast that user is now online
      await broadcastPresenceEvent(user.id, user.displayName || "Unknown", true, org?.id || null);

      // Send connection success message
      socket.send(
        JSON.stringify({
          type: "connected",
          userId: user.id,
          orgId: org?.id || null,
        })
      );

      // Handle incoming messages
      socket.on("message", async (data: Buffer | ArrayBuffer | Buffer[]) => {
        try {
          const message = JSON.parse(data.toString());

          // Handle ping messages to keep connection alive
          if (message.type === "ping") {
            socket.send(JSON.stringify({ type: "pong" }));
          }

          // Handle heartbeat for presence
          if (message.type === "heartbeat") {
            await updatePresence(user.id);
            socket.send(JSON.stringify({ type: "heartbeat_ack" }));
          }

          // Handle typing start
          if (message.type === "typing_start" && message.chatId) {
            const chatId = message.chatId as string;
            // Verify user is member of this chat
            const [membership] = await db
              .select()
              .from(chatMembers)
              .where(
                and(
                  eq(chatMembers.chatId, chatId),
                  eq(chatMembers.userId, user.id)
                )
              )
              .limit(1);

            if (membership) {
              await setTyping(chatId, user.id, user.displayName || "Unknown");
              await broadcastTypingEvent(chatId, user.id, user.displayName || "Unknown", true);
            }
          }

          // Handle typing stop
          if (message.type === "typing_stop" && message.chatId) {
            const chatId = message.chatId as string;
            await clearTyping(chatId, user.id);
            await broadcastTypingEvent(chatId, user.id, user.displayName || "Unknown", false);
          }
        } catch {
          // Ignore invalid JSON
        }
      });

      // Handle disconnect
      socket.on("close", async () => {
        // Broadcast that user is going offline (if this was their last connection)
        const connections = userConnections.get(user.id);
        if (!connections || connections.size <= 1) {
          await broadcastPresenceEvent(user.id, user.displayName || "Unknown", false, org?.id || null);
        }
        await cleanupConnection(socket, user.id);
      });

      socket.on("error", async (err: Error) => {
        console.error("WebSocket error:", err);
        await cleanupConnection(socket, user.id);
      });
    }
  );

  // Periodic cleanup of expired presence entries (every 30 seconds)
  const cleanupInterval = setInterval(async () => {
    try {
      await cleanupExpiredPresence();
    } catch (err) {
      console.error("Error cleaning up expired presence:", err);
    }
  }, 30000);

  // Clean up on server shutdown
  fastify.addHook("onClose", async () => {
    clearInterval(cleanupInterval);
  });
}

/**
 * Helper to get all active connections for a user
 * (useful for sending targeted messages)
 */
export function getUserConnections(userId: string): Set<WebSocket> | undefined {
  return userConnections.get(userId);
}

/**
 * Helper to broadcast to all of a user's connections
 */
export function broadcastToUser(userId: string, message: unknown): void {
  const connections = userConnections.get(userId);
  if (connections) {
    const messageStr = typeof message === "string" ? message : JSON.stringify(message);
    for (const socket of connections) {
      if (socket.readyState === socket.OPEN) {
        socket.send(messageStr);
      }
    }
  }
}
