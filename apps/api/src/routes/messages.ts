import { FastifyInstance } from "fastify";
import { db } from "../db";
import { messages, chatMembers, chats, users, messageReadReceipts, messageReactions } from "../db/schema";
import { eq, and, desc, lt, gt, inArray, sql } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { publish, getChatChannel, getUserPresenceChannel } from "../lib/redis";

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

      // Publish mention notifications for mentioned users
      const mentions = content.mentions as Array<{ id: string; displayName: string }> | undefined;
      if (mentions && mentions.length > 0) {
        // Get chat name for the notification
        const [chatInfo] = await db
          .select({ name: chats.name, type: chats.type })
          .from(chats)
          .where(eq(chats.id, chatId))
          .limit(1);

        for (const mention of mentions) {
          // Don't notify the sender if they mention themselves
          if (mention.id === currentUserId) continue;

          await publish(getUserPresenceChannel(mention.id), {
            type: "mention",
            payload: {
              messageId: newMessage.id,
              chatId,
              chatName: chatInfo?.name || "Chat",
              chatType: chatInfo?.type || "group",
              senderId: request.user.id,
              senderName: request.user.displayName,
              mentionedUserId: mention.id,
              text: content.text || "",
              createdAt: newMessage.createdAt,
            },
          });
        }
      }

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

      // Fetch messages with sender info (excluding thread replies - only show parent messages and non-threaded messages)
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
            ? and(
                eq(messages.chatId, chatId),
                lt(messages.createdAt, cursorTimestamp),
                sql`${messages.threadId} IS NULL` // Only show parent messages, not thread replies
              )
            : and(
                eq(messages.chatId, chatId),
                sql`${messages.threadId} IS NULL` // Only show parent messages, not thread replies
              )
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

      // Get reply counts for all messages in the result
      const messageIds = resultMessages.map((m) => m.id);
      const replyCounts: Record<string, number> = {};

      if (messageIds.length > 0) {
        const replyCountRows = await db
          .select({
            threadId: messages.threadId,
            count: sql<number>`count(*)::int`,
          })
          .from(messages)
          .where(inArray(messages.threadId, messageIds))
          .groupBy(messages.threadId);

        for (const row of replyCountRows) {
          if (row.threadId) {
            replyCounts[row.threadId] = row.count;
          }
        }
      }

      // Add replyCount to each message
      const messagesWithReplyCounts = resultMessages.map((msg) => ({
        ...msg,
        replyCount: replyCounts[msg.id] || 0,
      }));

      return reply.status(200).send({
        messages: messagesWithReplyCounts,
        nextCursor,
        hasMore,
      });
    }
  );

  /**
   * POST /chats/:id/read - Mark messages as read up to a specific message
   * Body: { last_message_id: string }
   * Returns: { success: true, readCount: number }
   */
  fastify.post<{
    Params: { id: string };
    Body: { last_message_id: string };
  }>(
    "/chats/:id/read",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: chatId } = request.params;
      const { last_message_id } = request.body;

      // Validate chatId format
      if (!UUID_REGEX.test(chatId)) {
        return reply.status(400).send({
          error: "Invalid chat ID format",
        });
      }

      // Validate last_message_id is provided
      if (!last_message_id) {
        return reply.status(400).send({
          error: "last_message_id is required",
        });
      }

      // Validate last_message_id format
      if (!UUID_REGEX.test(last_message_id)) {
        return reply.status(400).send({
          error: "Invalid last_message_id format",
        });
      }

      const currentUserId = request.user.id;

      // Check user is a member of the chat
      const [membership] = await db
        .select()
        .from(chatMembers)
        .where(
          and(
            eq(chatMembers.chatId, chatId),
            eq(chatMembers.userId, currentUserId)
          )
        )
        .limit(1);

      if (!membership) {
        return reply.status(403).send({
          error: "You are not a member of this chat",
        });
      }

      // Validate the target message exists in this chat
      const [targetMessage] = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.id, last_message_id),
            eq(messages.chatId, chatId)
          )
        )
        .limit(1);

      if (!targetMessage) {
        return reply.status(404).send({
          error: "Message not found in this chat",
        });
      }

      // Get the user's current last_read_message_id timestamp
      let oldReadTimestamp: Date | null = null;
      if (membership.lastReadMessageId) {
        const [oldReadMsg] = await db
          .select({ createdAt: messages.createdAt })
          .from(messages)
          .where(eq(messages.id, membership.lastReadMessageId))
          .limit(1);
        oldReadTimestamp = oldReadMsg?.createdAt ?? null;
      }

      // Get all messages between old position and new position that need read receipts
      // These are messages not sent by the current user
      const messagesToMark = await db
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.chatId, chatId),
            sql`${messages.senderId} != ${currentUserId}`,
            sql`${messages.createdAt} <= ${targetMessage.createdAt}`,
            oldReadTimestamp
              ? gt(messages.createdAt, oldReadTimestamp)
              : sql`1=1`
          )
        );

      // Batch insert read receipts
      if (messagesToMark.length > 0) {
        const messageIds = messagesToMark.map((m) => m.id);

        // Get existing receipts to avoid duplicates
        const existingReceipts = await db
          .select({ messageId: messageReadReceipts.messageId })
          .from(messageReadReceipts)
          .where(
            and(
              inArray(messageReadReceipts.messageId, messageIds),
              eq(messageReadReceipts.userId, currentUserId)
            )
          );

        const existingSet = new Set(existingReceipts.map((r) => r.messageId));
        const newReceipts = messageIds.filter((id) => !existingSet.has(id));

        if (newReceipts.length > 0) {
          await db.insert(messageReadReceipts).values(
            newReceipts.map((messageId) => ({
              messageId,
              userId: currentUserId,
            }))
          );
        }
      }

      // Update the user's last_read_message_id
      await db
        .update(chatMembers)
        .set({ lastReadMessageId: last_message_id })
        .where(
          and(
            eq(chatMembers.chatId, chatId),
            eq(chatMembers.userId, currentUserId)
          )
        );

      // Publish read receipt event to WebSocket channel
      await publish(getChatChannel(chatId), {
        type: "read_receipt",
        payload: {
          chatId,
          userId: currentUserId,
          lastMessageId: last_message_id,
          displayName: request.user.displayName,
        },
      });

      return reply.status(200).send({
        success: true,
        readCount: messagesToMark.length,
      });
    }
  );

  /**
   * GET /messages/:id/read-receipts - Get read receipts for a specific message
   * Returns: { receipts: Array<{ userId, displayName, avatarUrl, readAt }>, totalMembers, readCount }
   */
  fastify.get<{
    Params: { id: string };
  }>(
    "/messages/:id/read-receipts",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: messageId } = request.params;

      // Validate messageId format
      if (!UUID_REGEX.test(messageId)) {
        return reply.status(400).send({
          error: "Invalid message ID format",
        });
      }

      const currentUserId = request.user.id;

      // Get the message and verify it exists
      const [message] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1);

      if (!message) {
        return reply.status(404).send({
          error: "Message not found",
        });
      }

      // Check user is a member of the chat
      if (!(await isChatMember(message.chatId, currentUserId))) {
        return reply.status(403).send({
          error: "You are not a member of this chat",
        });
      }

      // Get all chat members (excluding the sender)
      const members = await db
        .select({
          userId: chatMembers.userId,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(chatMembers)
        .innerJoin(users, eq(chatMembers.userId, users.id))
        .where(
          and(
            eq(chatMembers.chatId, message.chatId),
            sql`${chatMembers.userId} != ${message.senderId}`
          )
        );

      const memberIds = members.map((m) => m.userId);
      const totalMembers = members.length;

      // Get read receipts for this message
      const receipts = await db
        .select({
          userId: messageReadReceipts.userId,
          readAt: messageReadReceipts.readAt,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(messageReadReceipts)
        .innerJoin(users, eq(messageReadReceipts.userId, users.id))
        .where(eq(messageReadReceipts.messageId, messageId));

      const readUserIds = new Set(receipts.map((r) => r.userId));

      // Build response with both read and unread users
      const readReceipts = receipts.map((r) => ({
        userId: r.userId,
        displayName: r.displayName,
        avatarUrl: r.avatarUrl,
        readAt: r.readAt,
        hasRead: true,
      }));

      const unreadReceipts = members
        .filter((m) => !readUserIds.has(m.userId))
        .map((m) => ({
          userId: m.userId,
          displayName: m.displayName,
          avatarUrl: m.avatarUrl,
          readAt: null,
          hasRead: false,
        }));

      return reply.status(200).send({
        receipts: [...readReceipts, ...unreadReceipts],
        totalMembers,
        readCount: receipts.length,
      });
    }
  );

  /**
   * POST /messages/:id/reactions - Add a reaction to a message
   * Body: { emoji: string }
   * Returns: { success: true, reaction: { messageId, userId, emoji, createdAt } }
   */
  fastify.post<{
    Params: { id: string };
    Body: { emoji: string };
  }>(
    "/messages/:id/reactions",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: messageId } = request.params;
      const { emoji } = request.body;

      // Validate messageId format
      if (!UUID_REGEX.test(messageId)) {
        return reply.status(400).send({
          error: "Invalid message ID format",
        });
      }

      // Validate emoji is provided
      if (!emoji || typeof emoji !== "string" || emoji.trim().length === 0) {
        return reply.status(400).send({
          error: "emoji is required",
        });
      }

      // Validate emoji length (max 32 chars to match db schema)
      if (emoji.length > 32) {
        return reply.status(400).send({
          error: "emoji must be 32 characters or fewer",
        });
      }

      const currentUserId = request.user.id;

      // Get the message and verify it exists
      const [message] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1);

      if (!message) {
        return reply.status(404).send({
          error: "Message not found",
        });
      }

      // Check user is a member of the chat
      if (!(await isChatMember(message.chatId, currentUserId))) {
        return reply.status(403).send({
          error: "You are not a member of this chat",
        });
      }

      // Check if reaction already exists (toggle off)
      const [existingReaction] = await db
        .select()
        .from(messageReactions)
        .where(
          and(
            eq(messageReactions.messageId, messageId),
            eq(messageReactions.userId, currentUserId),
            eq(messageReactions.emoji, emoji)
          )
        )
        .limit(1);

      if (existingReaction) {
        // Reaction already exists - this endpoint should add, not toggle
        // Return the existing reaction
        return reply.status(200).send({
          success: true,
          reaction: existingReaction,
          alreadyExists: true,
        });
      }

      // Insert the new reaction
      const [newReaction] = await db
        .insert(messageReactions)
        .values({
          messageId,
          userId: currentUserId,
          emoji,
        })
        .returning();

      // Publish reaction event to WebSocket channel (without notification)
      await publish(getChatChannel(message.chatId), {
        type: "reaction",
        payload: {
          messageId,
          userId: currentUserId,
          emoji,
          action: "add",
          displayName: request.user.displayName,
        },
      });

      return reply.status(201).send({
        success: true,
        reaction: newReaction,
      });
    }
  );

  /**
   * DELETE /messages/:id/reactions/:emoji - Remove a reaction from a message
   * Returns: { success: true }
   */
  fastify.delete<{
    Params: { id: string; emoji: string };
  }>(
    "/messages/:id/reactions/:emoji",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: messageId, emoji } = request.params;

      // Validate messageId format
      if (!UUID_REGEX.test(messageId)) {
        return reply.status(400).send({
          error: "Invalid message ID format",
        });
      }

      // Validate emoji is provided
      if (!emoji || emoji.trim().length === 0) {
        return reply.status(400).send({
          error: "emoji is required",
        });
      }

      const currentUserId = request.user.id;

      // Get the message and verify it exists
      const [message] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1);

      if (!message) {
        return reply.status(404).send({
          error: "Message not found",
        });
      }

      // Check user is a member of the chat
      if (!(await isChatMember(message.chatId, currentUserId))) {
        return reply.status(403).send({
          error: "You are not a member of this chat",
        });
      }

      // Delete the reaction (only the current user's reaction with this emoji)
      const result = await db
        .delete(messageReactions)
        .where(
          and(
            eq(messageReactions.messageId, messageId),
            eq(messageReactions.userId, currentUserId),
            eq(messageReactions.emoji, emoji)
          )
        )
        .returning();

      if (result.length === 0) {
        return reply.status(404).send({
          error: "Reaction not found",
        });
      }

      // Publish reaction removal event to WebSocket channel
      await publish(getChatChannel(message.chatId), {
        type: "reaction",
        payload: {
          messageId,
          userId: currentUserId,
          emoji,
          action: "remove",
          displayName: request.user.displayName,
        },
      });

      return reply.status(200).send({
        success: true,
      });
    }
  );

  /**
   * GET /messages/:id/reactions - Get all reactions for a message
   * Returns: { reactions: Array<{ emoji, count, users: Array<{ userId, displayName, avatarUrl }> }> }
   */
  fastify.get<{
    Params: { id: string };
  }>(
    "/messages/:id/reactions",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: messageId } = request.params;

      // Validate messageId format
      if (!UUID_REGEX.test(messageId)) {
        return reply.status(400).send({
          error: "Invalid message ID format",
        });
      }

      const currentUserId = request.user.id;

      // Get the message and verify it exists
      const [message] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1);

      if (!message) {
        return reply.status(404).send({
          error: "Message not found",
        });
      }

      // Check user is a member of the chat
      if (!(await isChatMember(message.chatId, currentUserId))) {
        return reply.status(403).send({
          error: "You are not a member of this chat",
        });
      }

      // Get all reactions for this message with user info
      const reactions = await db
        .select({
          emoji: messageReactions.emoji,
          userId: messageReactions.userId,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          createdAt: messageReactions.createdAt,
        })
        .from(messageReactions)
        .innerJoin(users, eq(messageReactions.userId, users.id))
        .where(eq(messageReactions.messageId, messageId))
        .orderBy(messageReactions.createdAt);

      // Group reactions by emoji
      const reactionGroups: Record<
        string,
        {
          emoji: string;
          count: number;
          users: Array<{ userId: string; displayName: string | null; avatarUrl: string | null }>;
          hasCurrentUser: boolean;
        }
      > = {};

      for (const r of reactions) {
        if (!reactionGroups[r.emoji]) {
          reactionGroups[r.emoji] = {
            emoji: r.emoji,
            count: 0,
            users: [],
            hasCurrentUser: false,
          };
        }
        reactionGroups[r.emoji].count++;
        reactionGroups[r.emoji].users.push({
          userId: r.userId,
          displayName: r.displayName,
          avatarUrl: r.avatarUrl,
        });
        if (r.userId === currentUserId) {
          reactionGroups[r.emoji].hasCurrentUser = true;
        }
      }

      return reply.status(200).send({
        reactions: Object.values(reactionGroups),
      });
    }
  );

  /**
   * GET /messages/:id/thread - Get all replies in a thread
   * Returns: { parentMessage, replies: Message[], totalReplies: number }
   */
  fastify.get<{
    Params: { id: string };
    Querystring: { cursor?: string; limit?: string };
  }>(
    "/messages/:id/thread",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: parentMessageId } = request.params;
      const { cursor, limit: limitStr } = request.query;

      // Validate messageId format
      if (!UUID_REGEX.test(parentMessageId)) {
        return reply.status(400).send({
          error: "Invalid message ID format",
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

      // Get the parent message and verify it exists
      const [parentMessage] = await db
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
        .where(eq(messages.id, parentMessageId))
        .limit(1);

      if (!parentMessage) {
        return reply.status(404).send({
          error: "Message not found",
        });
      }

      // Check user is a member of the chat
      if (!(await isChatMember(parentMessage.chatId, currentUserId))) {
        return reply.status(403).send({
          error: "You are not a member of this chat",
        });
      }

      // Build query for thread replies (messages where threadId = parentMessageId)
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

      // Fetch thread replies with sender info (oldest first for threads)
      const replyRows = await db
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
            ? and(eq(messages.threadId, parentMessageId), gt(messages.createdAt, cursorTimestamp))
            : eq(messages.threadId, parentMessageId)
        )
        .orderBy(messages.createdAt) // Oldest first for threads
        .limit(limit + 1);

      // Determine if there are more replies
      const hasMore = replyRows.length > limit;
      const resultReplies = hasMore ? replyRows.slice(0, limit) : replyRows;

      // Get next cursor (last reply ID in the result)
      const nextCursor = hasMore
        ? resultReplies[resultReplies.length - 1]?.id
        : null;

      // Get total reply count
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .where(eq(messages.threadId, parentMessageId));

      return reply.status(200).send({
        parentMessage,
        replies: resultReplies,
        totalReplies: countResult?.count || 0,
        nextCursor,
        hasMore,
      });
    }
  );
}
