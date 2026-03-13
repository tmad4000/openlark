import { FastifyInstance } from "fastify";
import { db } from "../db";
import { messages, chatMembers, chats, users, messageReadReceipts, messageReactions, favorites, buzzNotifications } from "../db/schema";
import { eq, and, desc, lt, gt, gte, inArray, sql } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { publish, getChatChannel, getUserPresenceChannel } from "../lib/redis";
import {
  createDmReceivedNotification,
  createMentionNotification,
  createThreadReplyNotification,
  createBuzzNotification,
} from "../lib/notifications";
import { dispatchWebhookEvent } from "../lib/webhook-worker";

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

      // Reopen "done" chats for all members when a new message arrives
      // This brings the chat back to the active list
      await db
        .update(chatMembers)
        .set({ done: false })
        .where(
          and(
            eq(chatMembers.chatId, chatId),
            eq(chatMembers.done, true)
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

      // Get chat info for notifications
      const [chatInfo] = await db
        .select({ name: chats.name, type: chats.type, orgId: chats.orgId })
        .from(chats)
        .where(eq(chats.id, chatId))
        .limit(1);

      // Dispatch webhook event for message.created
      if (chatInfo?.orgId) {
        dispatchWebhookEvent("message.created", chatInfo.orgId, {
          messageId: newMessage.id,
          chatId,
          senderId: currentUserId,
          type,
          content,
          threadId: thread_id || null,
          createdAt: newMessage.createdAt,
        }).catch(() => {});
      }

      // Get message text preview for notifications
      const messagePreview = typeof content.text === "string" ? content.text :
        typeof content.html === "string" ? content.html.replace(/<[^>]*>/g, "").substring(0, 100) :
        "New message";

      // Track users who should not receive DM notifications (they're getting mention/thread notifications)
      const notifiedUserIds = new Set<string>();
      notifiedUserIds.add(currentUserId); // Don't notify sender

      // Handle mention notifications
      const mentions = content.mentions as Array<{ id: string; displayName: string }> | undefined;
      if (mentions && mentions.length > 0) {
        for (const mention of mentions) {
          // Don't notify the sender if they mention themselves
          if (mention.id === currentUserId) continue;

          notifiedUserIds.add(mention.id);

          // Create persistent notification for mention
          await createMentionNotification({
            mentionedUserId: mention.id,
            mentionedByName: request.user.displayName,
            chatId,
            chatName: chatInfo?.name || "Chat",
            messageId: newMessage.id,
            messagePreview,
          });

          // Also publish to presence channel for real-time
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

      // Handle thread reply notifications
      if (thread_id) {
        // Get the parent message to find who should be notified (thread participants)
        const threadParticipants = await db
          .select({ senderId: messages.senderId })
          .from(messages)
          .where(eq(messages.threadId, thread_id))
          .groupBy(messages.senderId);

        // Also include the parent message sender
        const [parentMessage] = await db
          .select({ senderId: messages.senderId })
          .from(messages)
          .where(eq(messages.id, thread_id))
          .limit(1);

        const participantIds = new Set<string>();
        for (const p of threadParticipants) {
          participantIds.add(p.senderId);
        }
        if (parentMessage) {
          participantIds.add(parentMessage.senderId);
        }

        // Notify thread participants (except sender and already notified via mentions)
        for (const participantId of participantIds) {
          if (notifiedUserIds.has(participantId)) continue;
          notifiedUserIds.add(participantId);

          await createThreadReplyNotification({
            recipientId: participantId,
            replierName: request.user.displayName,
            chatId,
            chatName: chatInfo?.name || "Thread",
            threadId: thread_id,
            messageId: newMessage.id,
            messagePreview,
          });
        }
      }

      // Handle DM notifications (only for DM chats)
      if (chatInfo?.type === "dm") {
        // Get the other member of the DM who isn't muted
        const otherMembers = await db
          .select({ userId: chatMembers.userId, muted: chatMembers.muted })
          .from(chatMembers)
          .where(
            and(
              eq(chatMembers.chatId, chatId),
              sql`${chatMembers.userId} != ${currentUserId}`
            )
          );

        for (const member of otherMembers) {
          // Skip if already notified via mention or muted
          if (notifiedUserIds.has(member.userId)) continue;
          if (member.muted) continue;

          await createDmReceivedNotification({
            recipientId: member.userId,
            senderId: currentUserId,
            senderName: request.user.displayName,
            chatId,
            messageId: newMessage.id,
            messagePreview,
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

      // Mark any buzz notifications for these messages as read
      if (messagesToMark.length > 0) {
        const messageIds = messagesToMark.map((m) => m.id);
        await db
          .update(buzzNotifications)
          .set({ status: "read", readAt: new Date() })
          .where(
            and(
              inArray(buzzNotifications.messageId, messageIds),
              eq(buzzNotifications.recipientId, currentUserId),
              sql`${buzzNotifications.status} != 'read'`
            )
          );
      }

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

  /**
   * POST /messages/:id/favorite - Add a message to favorites
   * Returns: { success: true, favorite: { userId, messageId, createdAt } }
   */
  fastify.post<{
    Params: { id: string };
  }>(
    "/messages/:id/favorite",
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

      // Check if already favorited
      const [existingFavorite] = await db
        .select()
        .from(favorites)
        .where(
          and(
            eq(favorites.userId, currentUserId),
            eq(favorites.messageId, messageId)
          )
        )
        .limit(1);

      if (existingFavorite) {
        return reply.status(200).send({
          success: true,
          favorite: existingFavorite,
          alreadyFavorited: true,
        });
      }

      // Insert the favorite
      const [newFavorite] = await db
        .insert(favorites)
        .values({
          userId: currentUserId,
          messageId,
        })
        .returning();

      return reply.status(201).send({
        success: true,
        favorite: newFavorite,
      });
    }
  );

  /**
   * DELETE /messages/:id/favorite - Remove a message from favorites
   * Returns: { success: true }
   */
  fastify.delete<{
    Params: { id: string };
  }>(
    "/messages/:id/favorite",
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

      // Delete the favorite
      const result = await db
        .delete(favorites)
        .where(
          and(
            eq(favorites.userId, currentUserId),
            eq(favorites.messageId, messageId)
          )
        )
        .returning();

      if (result.length === 0) {
        return reply.status(404).send({
          error: "Favorite not found",
        });
      }

      return reply.status(200).send({
        success: true,
      });
    }
  );

  /**
   * GET /favorites - Get all favorite messages for the current user
   * Returns: { favorites: Array<{ favorite, message, sender, chat }> }
   */
  fastify.get(
    "/favorites",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const currentUserId = request.user.id;

      // Get all favorites with message, sender, and chat info
      const favoriteMessages = await db
        .select({
          favorite: {
            userId: favorites.userId,
            messageId: favorites.messageId,
            createdAt: favorites.createdAt,
          },
          message: {
            id: messages.id,
            chatId: messages.chatId,
            senderId: messages.senderId,
            type: messages.type,
            content: messages.content,
            createdAt: messages.createdAt,
          },
          sender: {
            id: users.id,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
          },
          chat: {
            id: chats.id,
            name: chats.name,
            type: chats.type,
          },
        })
        .from(favorites)
        .innerJoin(messages, eq(favorites.messageId, messages.id))
        .innerJoin(users, eq(messages.senderId, users.id))
        .innerJoin(chats, eq(messages.chatId, chats.id))
        .where(eq(favorites.userId, currentUserId))
        .orderBy(desc(favorites.createdAt));

      return reply.status(200).send({
        favorites: favoriteMessages,
      });
    }
  );

  /**
   * PATCH /messages/:id - Edit a message
   * Body: { content: Record<string, unknown> }
   * Constraints: Only sender can edit, within 24h, max 20 edits, text/rich_text only
   * Returns: Updated message
   */
  fastify.patch<{
    Params: { id: string };
    Body: { content: Record<string, unknown> };
  }>(
    "/messages/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: messageId } = request.params;
      const { content } = request.body;
      const currentUserId = request.user.id;

      // Validate messageId format
      if (!UUID_REGEX.test(messageId)) {
        return reply.status(400).send({
          error: "Invalid message ID format",
        });
      }

      // Validate content
      if (!content || typeof content !== "object") {
        return reply.status(400).send({
          error: "content is required and must be an object",
        });
      }

      // Get the message
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

      // Only sender can edit their own messages
      if (message.senderId !== currentUserId) {
        return reply.status(403).send({
          error: "You can only edit your own messages",
        });
      }

      // Can't edit recalled messages
      if (message.recalledAt) {
        return reply.status(400).send({
          error: "Cannot edit a recalled message",
        });
      }

      // Only text and rich_text messages can be edited
      if (message.type !== "text" && message.type !== "rich_text") {
        return reply.status(400).send({
          error: "Only text and rich_text messages can be edited",
        });
      }

      // Check 24h time limit
      const createdAt = new Date(message.createdAt);
      const now = new Date();
      const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceCreation > 24) {
        return reply.status(400).send({
          error: "Messages can only be edited within 24 hours of sending",
        });
      }

      // Check edit count (stored in content.editCount, default 0)
      const currentEditCount = typeof message.content.editCount === "number" ? message.content.editCount : 0;
      if (currentEditCount >= 20) {
        return reply.status(400).send({
          error: "Maximum edit limit (20) reached for this message",
        });
      }

      // Update the message
      const [updatedMessage] = await db
        .update(messages)
        .set({
          content: { ...content, editCount: currentEditCount + 1 },
          editedAt: new Date(),
        })
        .where(eq(messages.id, messageId))
        .returning();

      // Get sender info for the response and WebSocket event
      const [sender] = await db
        .select({
          id: users.id,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(eq(users.id, message.senderId))
        .limit(1);

      const messageWithSender = {
        ...updatedMessage,
        sender: sender || { id: message.senderId, displayName: null, avatarUrl: null },
      };

      // Publish update to Redis channel for real-time delivery
      await publish(getChatChannel(message.chatId), {
        type: "message_updated",
        payload: messageWithSender,
      });

      return reply.status(200).send(messageWithSender);
    }
  );

  /**
   * DELETE /messages/:id - Recall (soft delete) a message
   * Constraints: Sender can recall own messages within 24h, group owner/admin can recall any
   * Returns: Updated message with recalledAt set
   */
  fastify.delete<{
    Params: { id: string };
  }>(
    "/messages/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: messageId } = request.params;
      const currentUserId = request.user.id;

      // Validate messageId format
      if (!UUID_REGEX.test(messageId)) {
        return reply.status(400).send({
          error: "Invalid message ID format",
        });
      }

      // Get the message
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

      // Already recalled
      if (message.recalledAt) {
        return reply.status(400).send({
          error: "Message has already been recalled",
        });
      }

      // Check if user is the sender
      const isSender = message.senderId === currentUserId;

      // Check if user is owner/admin of the chat
      const [memberRecord] = await db
        .select({ role: chatMembers.role })
        .from(chatMembers)
        .where(
          and(
            eq(chatMembers.chatId, message.chatId),
            eq(chatMembers.userId, currentUserId)
          )
        )
        .limit(1);

      const isOwnerOrAdmin = memberRecord && (memberRecord.role === "owner" || memberRecord.role === "admin");

      // If not sender and not owner/admin, deny
      if (!isSender && !isOwnerOrAdmin) {
        return reply.status(403).send({
          error: "You can only recall your own messages, or be a chat owner/admin",
        });
      }

      // If sender (not owner/admin), check 24h time limit
      if (isSender && !isOwnerOrAdmin) {
        const createdAt = new Date(message.createdAt);
        const now = new Date();
        const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceCreation > 24) {
          return reply.status(400).send({
            error: "Messages can only be recalled within 24 hours of sending",
          });
        }
      }

      // Recall the message (soft delete by setting recalledAt)
      const [updatedMessage] = await db
        .update(messages)
        .set({
          recalledAt: new Date(),
        })
        .where(eq(messages.id, messageId))
        .returning();

      // Get sender info for the WebSocket event
      const [sender] = await db
        .select({
          id: users.id,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(eq(users.id, message.senderId))
        .limit(1);

      const messageWithSender = {
        ...updatedMessage,
        sender: sender || { id: message.senderId, displayName: null, avatarUrl: null },
      };

      // Publish update to Redis channel for real-time delivery
      await publish(getChatChannel(message.chatId), {
        type: "message_updated",
        payload: messageWithSender,
      });

      return reply.status(200).send(messageWithSender);
    }
  );

  /**
   * POST /messages/:id/forward - Forward a message to one or more chats
   * Body: { chat_ids: string[] }
   * Creates forwarded message copies in target chats
   * Returns: { success: true, forwarded: Array<{ chatId, messageId }> }
   */
  fastify.post<{
    Params: { id: string };
    Body: { chat_ids: string[] };
  }>(
    "/messages/:id/forward",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: messageId } = request.params;
      const { chat_ids } = request.body;
      const currentUserId = request.user.id;

      // Validate messageId format
      if (!UUID_REGEX.test(messageId)) {
        return reply.status(400).send({
          error: "Invalid message ID format",
        });
      }

      // Validate chat_ids is provided and is an array
      if (!chat_ids || !Array.isArray(chat_ids) || chat_ids.length === 0) {
        return reply.status(400).send({
          error: "chat_ids must be a non-empty array",
        });
      }

      // Validate max number of chats (prevent abuse)
      if (chat_ids.length > 20) {
        return reply.status(400).send({
          error: "Cannot forward to more than 20 chats at once",
        });
      }

      // Validate all chat_ids are valid UUIDs
      for (const chatId of chat_ids) {
        if (!UUID_REGEX.test(chatId)) {
          return reply.status(400).send({
            error: `Invalid chat ID format: ${chatId}`,
          });
        }
      }

      // Get the original message
      const [originalMessage] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1);

      if (!originalMessage) {
        return reply.status(404).send({
          error: "Message not found",
        });
      }

      // Check if message has been recalled
      if (originalMessage.recalledAt) {
        return reply.status(400).send({
          error: "Cannot forward a recalled message",
        });
      }

      // Check user is a member of the source chat
      if (!(await isChatMember(originalMessage.chatId, currentUserId))) {
        return reply.status(403).send({
          error: "You are not a member of the source chat",
        });
      }

      // Get source chat info for attribution
      const [sourceChat] = await db
        .select({ name: chats.name, type: chats.type })
        .from(chats)
        .where(eq(chats.id, originalMessage.chatId))
        .limit(1);

      // Get original sender info
      const [originalSender] = await db
        .select({
          id: users.id,
          displayName: users.displayName,
        })
        .from(users)
        .where(eq(users.id, originalMessage.senderId))
        .limit(1);

      // Validate user is a member of all target chats
      const targetChatMemberships = await db
        .select({ chatId: chatMembers.chatId })
        .from(chatMembers)
        .where(
          and(
            inArray(chatMembers.chatId, chat_ids),
            eq(chatMembers.userId, currentUserId)
          )
        );

      const memberOfChatIds = new Set(targetChatMemberships.map((m) => m.chatId));
      const invalidChatIds = chat_ids.filter((id) => !memberOfChatIds.has(id));

      if (invalidChatIds.length > 0) {
        return reply.status(403).send({
          error: `You are not a member of these chats: ${invalidChatIds.join(", ")}`,
        });
      }

      // Create forwarded messages in each target chat
      const forwardedMessages: Array<{ chatId: string; messageId: string }> = [];

      for (const targetChatId of chat_ids) {
        // Build forwarded content with attribution
        const forwardedContent = {
          ...originalMessage.content,
          forwardedFrom: {
            chatId: originalMessage.chatId,
            chatName: sourceChat?.name || "Chat",
            chatType: sourceChat?.type || "dm",
            messageId: originalMessage.id,
            senderName: originalSender?.displayName || "Unknown",
            senderId: originalMessage.senderId,
            originalCreatedAt: originalMessage.createdAt,
          },
        };

        // Create the forwarded message
        const [newMessage] = await db
          .insert(messages)
          .values({
            chatId: targetChatId,
            senderId: currentUserId,
            type: originalMessage.type,
            content: forwardedContent,
            forwardedFromMessageId: originalMessage.id,
            forwardedFromChatId: originalMessage.chatId,
          })
          .returning();

        forwardedMessages.push({
          chatId: targetChatId,
          messageId: newMessage.id,
        });

        // Update sender's last_read_message_id
        await db
          .update(chatMembers)
          .set({ lastReadMessageId: newMessage.id })
          .where(
            and(
              eq(chatMembers.chatId, targetChatId),
              eq(chatMembers.userId, currentUserId)
            )
          );

        // Publish message to Redis channel for real-time delivery
        await publish(getChatChannel(targetChatId), {
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
      }

      return reply.status(201).send({
        success: true,
        forwarded: forwardedMessages,
      });
    }
  );

  /**
   * POST /messages/forward-multiple - Forward multiple messages to one or more chats
   * Body: { message_ids: string[], chat_ids: string[], combine?: boolean }
   * If combine is true, messages are combined into a single forwarded bundle
   * Returns: { success: true, forwarded: Array<{ chatId, messageIds: string[] }> }
   */
  fastify.post<{
    Body: { message_ids: string[]; chat_ids: string[]; combine?: boolean };
  }>(
    "/messages/forward-multiple",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { message_ids, chat_ids, combine = false } = request.body;
      const currentUserId = request.user.id;

      // Validate message_ids
      if (!message_ids || !Array.isArray(message_ids) || message_ids.length === 0) {
        return reply.status(400).send({
          error: "message_ids must be a non-empty array",
        });
      }

      if (message_ids.length > 50) {
        return reply.status(400).send({
          error: "Cannot forward more than 50 messages at once",
        });
      }

      // Validate chat_ids
      if (!chat_ids || !Array.isArray(chat_ids) || chat_ids.length === 0) {
        return reply.status(400).send({
          error: "chat_ids must be a non-empty array",
        });
      }

      if (chat_ids.length > 20) {
        return reply.status(400).send({
          error: "Cannot forward to more than 20 chats at once",
        });
      }

      // Validate UUIDs
      for (const id of [...message_ids, ...chat_ids]) {
        if (!UUID_REGEX.test(id)) {
          return reply.status(400).send({
            error: `Invalid UUID format: ${id}`,
          });
        }
      }

      // Get all original messages
      const originalMessages = await db
        .select()
        .from(messages)
        .where(inArray(messages.id, message_ids));

      if (originalMessages.length !== message_ids.length) {
        return reply.status(404).send({
          error: "Some messages were not found",
        });
      }

      // Check no messages are recalled
      const recalledMessages = originalMessages.filter((m) => m.recalledAt);
      if (recalledMessages.length > 0) {
        return reply.status(400).send({
          error: "Cannot forward recalled messages",
        });
      }

      // Verify user is a member of all source chats
      const sourceChatIds = [...new Set(originalMessages.map((m) => m.chatId))];
      for (const chatId of sourceChatIds) {
        if (!(await isChatMember(chatId, currentUserId))) {
          return reply.status(403).send({
            error: "You are not a member of one or more source chats",
          });
        }
      }

      // Verify user is a member of all target chats
      const targetChatMemberships = await db
        .select({ chatId: chatMembers.chatId })
        .from(chatMembers)
        .where(
          and(
            inArray(chatMembers.chatId, chat_ids),
            eq(chatMembers.userId, currentUserId)
          )
        );

      const memberOfChatIds = new Set(targetChatMemberships.map((m) => m.chatId));
      const invalidChatIds = chat_ids.filter((id) => !memberOfChatIds.has(id));

      if (invalidChatIds.length > 0) {
        return reply.status(403).send({
          error: `You are not a member of these chats: ${invalidChatIds.join(", ")}`,
        });
      }

      // Get source chat info
      const sourceChats = await db
        .select({ id: chats.id, name: chats.name, type: chats.type })
        .from(chats)
        .where(inArray(chats.id, sourceChatIds));
      const sourceChatMap = new Map(sourceChats.map((c) => [c.id, c]));

      // Get sender info for all messages
      const senderIds = [...new Set(originalMessages.map((m) => m.senderId))];
      const senders = await db
        .select({ id: users.id, displayName: users.displayName })
        .from(users)
        .where(inArray(users.id, senderIds));
      const senderMap = new Map(senders.map((s) => [s.id, s]));

      // Sort messages by createdAt for consistent ordering
      originalMessages.sort((a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      const forwardedResults: Array<{ chatId: string; messageIds: string[] }> = [];

      for (const targetChatId of chat_ids) {
        const messageIdsForChat: string[] = [];

        if (combine) {
          // Combine all messages into a single rich_text message bundle
          const bundledContent = {
            text: `Forwarded ${originalMessages.length} messages`,
            bundle: originalMessages.map((m) => {
              const sourceChat = sourceChatMap.get(m.chatId);
              const sender = senderMap.get(m.senderId);
              return {
                type: m.type,
                content: m.content,
                originalMessageId: m.id,
                originalChatId: m.chatId,
                originalChatName: sourceChat?.name || "Chat",
                originalChatType: sourceChat?.type || "dm",
                senderName: sender?.displayName || "Unknown",
                senderId: m.senderId,
                originalCreatedAt: m.createdAt,
              };
            }),
            forwardedFrom: {
              bundled: true,
              messageCount: originalMessages.length,
            },
          };

          const [newMessage] = await db
            .insert(messages)
            .values({
              chatId: targetChatId,
              senderId: currentUserId,
              type: "rich_text",
              content: bundledContent,
              forwardedFromMessageId: originalMessages[0].id,
              forwardedFromChatId: originalMessages[0].chatId,
            })
            .returning();

          messageIdsForChat.push(newMessage.id);

          // Update sender's last_read_message_id
          await db
            .update(chatMembers)
            .set({ lastReadMessageId: newMessage.id })
            .where(
              and(
                eq(chatMembers.chatId, targetChatId),
                eq(chatMembers.userId, currentUserId)
              )
            );

          // Publish to WebSocket
          await publish(getChatChannel(targetChatId), {
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
        } else {
          // Forward each message individually
          for (const originalMessage of originalMessages) {
            const sourceChat = sourceChatMap.get(originalMessage.chatId);
            const originalSender = senderMap.get(originalMessage.senderId);

            const forwardedContent = {
              ...originalMessage.content,
              forwardedFrom: {
                chatId: originalMessage.chatId,
                chatName: sourceChat?.name || "Chat",
                chatType: sourceChat?.type || "dm",
                messageId: originalMessage.id,
                senderName: originalSender?.displayName || "Unknown",
                senderId: originalMessage.senderId,
                originalCreatedAt: originalMessage.createdAt,
              },
            };

            const [newMessage] = await db
              .insert(messages)
              .values({
                chatId: targetChatId,
                senderId: currentUserId,
                type: originalMessage.type,
                content: forwardedContent,
                forwardedFromMessageId: originalMessage.id,
                forwardedFromChatId: originalMessage.chatId,
              })
              .returning();

            messageIdsForChat.push(newMessage.id);

            // Publish to WebSocket
            await publish(getChatChannel(targetChatId), {
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
          }

          // Update sender's last_read_message_id to the last forwarded message
          const lastMessageId = messageIdsForChat[messageIdsForChat.length - 1];
          await db
            .update(chatMembers)
            .set({ lastReadMessageId: lastMessageId })
            .where(
              and(
                eq(chatMembers.chatId, targetChatId),
                eq(chatMembers.userId, currentUserId)
              )
            );
        }

        forwardedResults.push({
          chatId: targetChatId,
          messageIds: messageIdsForChat,
        });
      }

      return reply.status(201).send({
        success: true,
        forwarded: forwardedResults,
      });
    }
  );

  /**
   * POST /messages/:id/buzz - Send an urgent buzz notification for a message
   * Body: { recipient_id: string, type?: "in_app" | "sms" | "phone" }
   * Only the message sender can buzz their own messages
   * Rate limits: max 3 buzzes per message, 10 per hour per user
   * Returns: { success: true, buzz: BuzzNotification }
   */
  fastify.post<{
    Params: { id: string };
    Body: { recipient_id: string; type?: "in_app" | "sms" | "phone" };
  }>(
    "/messages/:id/buzz",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: messageId } = request.params;
      const { recipient_id, type = "in_app" } = request.body;
      const currentUserId = request.user.id;

      // Validate messageId format
      if (!UUID_REGEX.test(messageId)) {
        return reply.status(400).send({
          error: "Invalid message ID format",
        });
      }

      // Validate recipient_id is provided
      if (!recipient_id) {
        return reply.status(400).send({
          error: "recipient_id is required",
        });
      }

      // Validate recipient_id format
      if (!UUID_REGEX.test(recipient_id)) {
        return reply.status(400).send({
          error: "Invalid recipient_id format",
        });
      }

      // Validate type
      const validTypes = ["in_app", "sms", "phone"];
      if (!validTypes.includes(type)) {
        return reply.status(400).send({
          error: `type must be one of: ${validTypes.join(", ")}`,
        });
      }

      // For now, only in_app is supported (SMS/phone require Twilio integration)
      if (type !== "in_app") {
        return reply.status(400).send({
          error: "Only in_app buzz type is currently supported",
        });
      }

      // Get the message
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

      // Only the message sender can buzz their own messages
      if (message.senderId !== currentUserId) {
        return reply.status(403).send({
          error: "You can only buzz your own messages",
        });
      }

      // Cannot buzz recalled messages
      if (message.recalledAt) {
        return reply.status(400).send({
          error: "Cannot buzz a recalled message",
        });
      }

      // Validate recipient is a member of the chat
      const [recipientMember] = await db
        .select({ userId: chatMembers.userId })
        .from(chatMembers)
        .where(
          and(
            eq(chatMembers.chatId, message.chatId),
            eq(chatMembers.userId, recipient_id)
          )
        )
        .limit(1);

      if (!recipientMember) {
        return reply.status(400).send({
          error: "Recipient is not a member of this chat",
        });
      }

      // Cannot buzz yourself
      if (recipient_id === currentUserId) {
        return reply.status(400).send({
          error: "Cannot buzz yourself",
        });
      }

      // Rate limit check: max 3 buzzes per message
      const buzzesForMessage = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(buzzNotifications)
        .where(eq(buzzNotifications.messageId, messageId));

      if (buzzesForMessage[0]?.count >= 3) {
        return reply.status(429).send({
          error: "Maximum of 3 buzzes per message reached",
        });
      }

      // Rate limit check: max 10 buzzes per hour per user
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const buzzesLastHour = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(buzzNotifications)
        .where(
          and(
            eq(buzzNotifications.senderId, currentUserId),
            gte(buzzNotifications.createdAt, oneHourAgo)
          )
        );

      if (buzzesLastHour[0]?.count >= 10) {
        return reply.status(429).send({
          error: "Maximum of 10 buzzes per hour reached",
        });
      }

      // Create the buzz notification record
      const [buzz] = await db
        .insert(buzzNotifications)
        .values({
          messageId,
          senderId: currentUserId,
          recipientId: recipient_id,
          type,
          status: "pending",
        })
        .returning();

      // Get chat info for the notification
      const [chat] = await db
        .select({ name: chats.name, type: chats.type })
        .from(chats)
        .where(eq(chats.id, message.chatId))
        .limit(1);

      // Get message preview text
      const messageContent = message.content as Record<string, unknown>;
      const messagePreview =
        typeof messageContent.text === "string"
          ? messageContent.text
          : typeof messageContent.html === "string"
            ? messageContent.html.replace(/<[^>]*>/g, "").substring(0, 100)
            : "Urgent message";

      // Create high-priority notification and send buzz event
      await createBuzzNotification({
        recipientId: recipient_id,
        senderName: request.user.displayName,
        chatId: message.chatId,
        chatName: chat?.name || "Chat",
        messageId,
        messagePreview,
        buzzId: buzz.id,
      });

      // Mark as delivered (for in_app type, delivery is instant)
      const [deliveredBuzz] = await db
        .update(buzzNotifications)
        .set({ status: "delivered", deliveredAt: new Date() })
        .where(eq(buzzNotifications.id, buzz.id))
        .returning();

      return reply.status(201).send({
        success: true,
        buzz: deliveredBuzz,
      });
    }
  );
}
