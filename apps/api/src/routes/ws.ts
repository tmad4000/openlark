import { FastifyInstance, FastifyRequest } from "fastify";
import { WebSocket } from "@fastify/websocket";
import crypto from "crypto";
import { db } from "../db";
import { sessions, users, organizations, chatMembers } from "../db/schema";
import { eq, and, gt } from "drizzle-orm";
import { subscribe, getChatChannel } from "../lib/redis";
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

      // Send connection success message
      socket.send(
        JSON.stringify({
          type: "connected",
          userId: user.id,
          orgId: org?.id || null,
        })
      );

      // Handle incoming messages (for future use - ping/pong, typing indicators, etc.)
      socket.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
        try {
          const message = JSON.parse(data.toString());

          // Handle ping messages to keep connection alive
          if (message.type === "ping") {
            socket.send(JSON.stringify({ type: "pong" }));
          }
        } catch {
          // Ignore invalid JSON
        }
      });

      // Handle disconnect
      socket.on("close", async () => {
        await cleanupConnection(socket, user.id);
      });

      socket.on("error", async (err: Error) => {
        console.error("WebSocket error:", err);
        await cleanupConnection(socket, user.id);
      });
    }
  );
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
