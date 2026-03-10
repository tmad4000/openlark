import { FastifyInstance } from "fastify";
import { db } from "../db";
import { messages, chatMembers, chats, users } from "../db/schema";
import { eq, and, desc, lt } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { publish, getChatChannel } from "../lib/redis";

// UUID validation regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SendMessageBody {
  type: "text" | "rich_text" | "code" | "voice" | "card" | "system";
  content: Record<string, unknown>;
  thread_id?: string;
  reply_to_id?: string;
}

interface GetMessagesQuery {
  cursor?: string;
  limit?: string;
}

/**
 * Helper to check if a user is a member of a chat
 */
async function isChatMember(chatId: string, userId: string): Promise<boolean> {
  const member = await db
    .select({ chatId: chatMembers.chatId })
    .from(chatMembers)
    .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId)))
    .limit(1);

  return member.length > 0;
}

/**
 * Create a system message for member join/leave events
 */
export async function createSystemMessage(
  chatId: string,
  senderId: string,
  content: Record<string, unknown>
): Promise<typeof messages.$inferSelect> {
  const [message] = await db
    .insert(messages)
    .values({
      chatId,
      senderId,
      type: "system",
      content,
    })
    .returning();

  // Publish to Redis channel
  await publish(getChatChannel(chatId), {
    type: "message",
    payload: message,
  });

  return message;
}

export async function messagesRoutes(fastify: FastifyInstance) {
  /**
   * POST /chats/:id/messages - Send a message to a chat
   * Body: { type, content, thread_id?, reply_to_id? }
   * Returns: Created message
   */
  fastify.post<{
    Params: { id: string };
    Body: SendMessageBody;
  }>(
    "/chats/:id/messages",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: chatId } = request.params;
      const { type, content, thread_id, reply_to_id } = request.body;

      // Validate chatId format
      if (!UUID_REGEX.test(chatId)) {
        return reply.status(400).send({
          error: "Invalid chat ID format",
        });
      }

      // Validate type
      const validTypes = ["text", "rich_text", "code", "voice", "card", "system"];
      if (!type || !validTypes.includes(type)) {
        return reply.status(400).send({
          error: `type must be one of: ${validTypes.join(", ")}`,
        });
      }

      // Validate content is provided
      if (!content || typeof content !== "object") {
        return reply.status(400).send({
          error: "content is required and must be an object",
        });
      }

      // Validate thread_id format if provided
      if (thread_id && !UUID_REGEX.test(thread_id)) {
        return reply.status(400).send({
          error: "Invalid thread_id format",
        });
      }

      // Validate reply_to_id format if provided
      if (reply_to_id && !UUID_REGEX.test(reply_to_id)) {
        return reply.status(400).send({
          error: "Invalid reply_to_id format",
        });
      }

      const currentUserId = request.user.id;

      // Check chat exists
      const [chat] = await db
        .select()
        .from(chats)
        .where(eq(chats.id, chatId))
        .limit(1);

      if (!chat) {
        return reply.status(404).send({
          error: "Chat not found",
        });
      }

      // Check user is a member of the chat
      const memberRecord = await db
        .select()
        .from(chatMembers)
        .where(
          and(
            eq(chatMembers.chatId, chatId),
            eq(chatMembers.userId, currentUserId)
          )
        )
        .limit(1);

      if (memberRecord.length === 0) {
        return reply.status(403).send({
          error: "You are not a member of this chat",
        });
      }

      // Validate thread_id references a valid message in this chat
      if (thread_id) {
        const [threadMessage] = await db
          .select({ id: messages.id })
          .from(messages)
          .where(and(eq(messages.id, thread_id), eq(messages.chatId, chatId)))
          .limit(1);

        if (!threadMessage) {
          return reply.status(400).send({
            error: "Thread message not found in this chat",
          });
        }
      }

      // Validate reply_to_id references a valid message in this chat
      if (reply_to_id) {
        const [replyMessage] = await db
          .select({ id: messages.id })
          .from(messages)
          .where(and(eq(messages.id, reply_to_id), eq(messages.chatId, chatId)))
          .limit(1);

        if (!replyMessage) {
          return reply.status(400).send({
            error: "Reply-to message not found in this chat",
          });
        }
      }

      // Create the message
      const [newMessage] = await db
        .insert(messages)
        .values({
          chatId,
          senderId: currentUserId,
          type,
          content,
          threadId: thread_id || null,
          replyToId: reply_to_id || null,
        })
        .returning();

      // Update sender's last_read_message_id
      await db
        .update(chatMembers)
        .set({ lastReadMessageId: newMessage.id })
        .where(
          and(
            eq(chatMembers.chatId, chatId),
            eq(chatMembers.userId, currentUserId)
          )
        );

      // Publish message to Redis channel for real-time delivery
      await publish(getChatChannel(chatId), {
        type: "message",
        payload: {
          ...newMessage,
          sender: {
            id: request.user.id,
            displayName: request.user.displayName,
            avatarUrl: request.user.avatarUrl,
          },
        },
      });

      // Return message with sender info
      return reply.status(201).send({
        ...newMessage,
        sender: {
          id: request.user.id,
          displayName: request.user.displayName,
          avatarUrl: request.user.avatarUrl,
        },
      });
    }
  );

  /**
   * GET /chats/:id/messages - Get paginated messages from a chat
   * Query: cursor (message ID to start from), limit (default 50)
   * Returns: Paginated messages (newest first)
   */
  fastify.get<{
    Params: { id: string };
    Querystring: GetMessagesQuery;
  }>(
    "/chats/:id/messages",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: chatId } = request.params;
      const { cursor, limit: limitStr } = request.query;

      // Validate chatId format
      if (!UUID_REGEX.test(chatId)) {
        return reply.status(400).send({
          error: "Invalid chat ID format",
        });
      }

      // Parse and validate limit
      const limit = Math.min(Math.max(parseInt(limitStr || "50", 10) || 50, 1), 100);

      // Validate cursor format if provided
      if (cursor && !UUID_REGEX.test(cursor)) {
        return reply.status(400).send({
          error: "Invalid cursor format",
        });
      }

      const currentUserId = request.user.id;

      // Check chat exists
      const [chat] = await db
        .select()
        .from(chats)
        .where(eq(chats.id, chatId))
        .limit(1);

      if (!chat) {
        return reply.status(404).send({
          error: "Chat not found",
        });
      }

      // Check user is a member of the chat
      if (!(await isChatMember(chatId, currentUserId))) {
        return reply.status(403).send({
          error: "You are not a member of this chat",
        });
      }

      // Build query for messages
      let cursorTimestamp: Date | null = null;

      // If cursor provided, get its timestamp for pagination
      if (cursor) {
        const [cursorMessage] = await db
          .select({ createdAt: messages.createdAt })
          .from(messages)
          .where(eq(messages.id, cursor))
          .limit(1);

        if (cursorMessage) {
          cursorTimestamp = cursorMessage.createdAt;
        }
      }

      // Fetch messages with sender info
      const messageRows = await db
        .select({
          id: messages.id,
          chatId: messages.chatId,
          senderId: messages.senderId,
          type: messages.type,
          content: messages.content,
          threadId: messages.threadId,
          replyToId: messages.replyToId,
          editedAt: messages.editedAt,
          recalledAt: messages.recalledAt,
          scheduledFor: messages.scheduledFor,
          createdAt: messages.createdAt,
          sender: {
            id: users.id,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
          },
        })
        .from(messages)
        .innerJoin(users, eq(messages.senderId, users.id))
        .where(
          cursorTimestamp
            ? and(eq(messages.chatId, chatId), lt(messages.createdAt, cursorTimestamp))
            : eq(messages.chatId, chatId)
        )
        .orderBy(desc(messages.createdAt))
        .limit(limit + 1); // Fetch one extra to check if there are more

      // Determine if there are more messages
      const hasMore = messageRows.length > limit;
      const resultMessages = hasMore ? messageRows.slice(0, limit) : messageRows;

      // Get next cursor (last message ID in the result)
      const nextCursor = hasMore
        ? resultMessages[resultMessages.length - 1]?.id
        : null;

      return reply.status(200).send({
        messages: resultMessages,
        nextCursor,
        hasMore,
      });
    }
  );
}
