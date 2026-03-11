import { FastifyInstance } from "fastify";
import { db } from "../db";
import { chats, chatMembers, messages, users, topics, topicSubscriptions } from "../db/schema";
import { eq, and, desc, asc, inArray, sql } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { publish, getChatChannel } from "../lib/redis";

// UUID validation regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CreateTopicBody {
  title: string;
  initial_message?: {
    type: "text" | "rich_text";
    content: Record<string, unknown>;
  };
}

export async function topicsRoutes(fastify: FastifyInstance) {
  /**
   * POST /chats/:id/topics - Create a new topic in a topic_group chat
   * Body: { title: string, initial_message?: { type, content } }
   * Returns: Created topic with optional initial message
   */
  fastify.post<{
    Params: { id: string };
    Body: CreateTopicBody;
  }>(
    "/chats/:id/topics",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: chatId } = request.params;
      const { title, initial_message } = request.body;

      // Validate chatId format
      if (!UUID_REGEX.test(chatId)) {
        return reply.status(400).send({
          error: "Invalid chat ID format",
        });
      }

      // Validate title
      if (!title || typeof title !== "string" || title.trim().length === 0) {
        return reply.status(400).send({
          error: "title is required and must be a non-empty string",
        });
      }

      if (title.length > 255) {
        return reply.status(400).send({
          error: "title must be at most 255 characters",
        });
      }

      const currentUserId = request.user.id;

      // Check chat exists and is a topic_group
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

      if (chat.type !== "topic_group") {
        return reply.status(400).send({
          error: "Topics can only be created in topic_group chats",
        });
      }

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

      // Create the topic
      const [newTopic] = await db
        .insert(topics)
        .values({
          chatId,
          title: title.trim(),
          creatorId: currentUserId,
          status: "open",
        })
        .returning();

      // Auto-subscribe creator to the topic
      await db.insert(topicSubscriptions).values({
        topicId: newTopic.id,
        userId: currentUserId,
      });

      let initialMessage = null;

      // Create initial message if provided
      if (initial_message && initial_message.content) {
        const validTypes = ["text", "rich_text"];
        const msgType = initial_message.type || "text";

        if (!validTypes.includes(msgType)) {
          return reply.status(400).send({
            error: `initial_message.type must be one of: ${validTypes.join(", ")}`,
          });
        }

        const [newMessage] = await db
          .insert(messages)
          .values({
            chatId,
            senderId: currentUserId,
            type: msgType,
            content: initial_message.content,
            topicId: newTopic.id,
          })
          .returning();

        initialMessage = {
          ...newMessage,
          sender: {
            id: request.user.id,
            displayName: request.user.displayName,
            avatarUrl: request.user.avatarUrl,
          },
        };

        // Publish message to Redis channel
        await publish(getChatChannel(chatId), {
          type: "topic_message",
          payload: {
            ...initialMessage,
            topicId: newTopic.id,
            topicTitle: newTopic.title,
          },
        });
      }

      // Publish topic creation event
      await publish(getChatChannel(chatId), {
        type: "topic_created",
        payload: {
          topic: {
            ...newTopic,
            creator: {
              id: request.user.id,
              displayName: request.user.displayName,
              avatarUrl: request.user.avatarUrl,
            },
          },
        },
      });

      return reply.status(201).send({
        topic: {
          ...newTopic,
          creator: {
            id: request.user.id,
            displayName: request.user.displayName,
            avatarUrl: request.user.avatarUrl,
          },
          messageCount: initialMessage ? 1 : 0,
          isSubscribed: true,
        },
        initialMessage,
      });
    }
  );

  /**
   * GET /chats/:id/topics - Get all topics in a topic_group chat
   * Query: status (open|closed), cursor, limit
   * Returns: Paginated list of topics (open first, then closed)
   */
  fastify.get<{
    Params: { id: string };
    Querystring: { status?: "open" | "closed"; cursor?: string; limit?: string };
  }>(
    "/chats/:id/topics",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: chatId } = request.params;
      const { status, cursor, limit: limitStr } = request.query;

      // Validate chatId format
      if (!UUID_REGEX.test(chatId)) {
        return reply.status(400).send({
          error: "Invalid chat ID format",
        });
      }

      // Validate status if provided
      if (status && !["open", "closed"].includes(status)) {
        return reply.status(400).send({
          error: "status must be 'open' or 'closed'",
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

      // Check chat exists and is a topic_group
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

      if (chat.type !== "topic_group") {
        return reply.status(400).send({
          error: "Topics are only available in topic_group chats",
        });
      }

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

      // Build query conditions
      const conditions = [eq(topics.chatId, chatId)];

      if (status) {
        conditions.push(eq(topics.status, status));
      }

      // Get topics with creator info
      // Order: open topics first (newest), then closed topics (newest)
      const topicRows = await db
        .select({
          id: topics.id,
          chatId: topics.chatId,
          title: topics.title,
          creatorId: topics.creatorId,
          status: topics.status,
          createdAt: topics.createdAt,
          creator: {
            id: users.id,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
          },
        })
        .from(topics)
        .innerJoin(users, eq(topics.creatorId, users.id))
        .where(and(...conditions))
        .orderBy(
          // Open topics first, then closed
          asc(sql`CASE WHEN ${topics.status} = 'open' THEN 0 ELSE 1 END`),
          // Within each status, newest first
          desc(topics.createdAt)
        )
        .limit(limit + 1);

      // Determine if there are more topics
      const hasMore = topicRows.length > limit;
      const resultTopics = hasMore ? topicRows.slice(0, limit) : topicRows;

      // Get message counts for each topic
      const topicIds = resultTopics.map((t) => t.id);
      const messageCounts: Record<string, number> = {};

      if (topicIds.length > 0) {
        const countRows = await db
          .select({
            topicId: messages.topicId,
            count: sql<number>`count(*)::int`,
          })
          .from(messages)
          .where(inArray(messages.topicId, topicIds))
          .groupBy(messages.topicId);

        for (const row of countRows) {
          if (row.topicId) {
            messageCounts[row.topicId] = row.count;
          }
        }
      }

      // Check which topics the user is subscribed to
      const subscriptions: Record<string, boolean> = {};

      if (topicIds.length > 0) {
        const subRows = await db
          .select({ topicId: topicSubscriptions.topicId })
          .from(topicSubscriptions)
          .where(
            and(
              inArray(topicSubscriptions.topicId, topicIds),
              eq(topicSubscriptions.userId, currentUserId)
            )
          );

        for (const row of subRows) {
          subscriptions[row.topicId] = true;
        }
      }

      // Get last message for each topic
      const lastMessages: Record<string, { createdAt: Date; senderName: string | null }> = {};

      if (topicIds.length > 0) {
        // Get the most recent message for each topic
        const lastMsgRows = await db
          .select({
            topicId: messages.topicId,
            createdAt: messages.createdAt,
            senderName: users.displayName,
          })
          .from(messages)
          .innerJoin(users, eq(messages.senderId, users.id))
          .where(inArray(messages.topicId, topicIds))
          .orderBy(desc(messages.createdAt));

        // Group by topicId and take only the first (most recent)
        for (const row of lastMsgRows) {
          if (row.topicId && !lastMessages[row.topicId]) {
            lastMessages[row.topicId] = {
              createdAt: row.createdAt,
              senderName: row.senderName,
            };
          }
        }
      }

      // Build response
      const topicsResponse = resultTopics.map((topic) => ({
        ...topic,
        messageCount: messageCounts[topic.id] || 0,
        isSubscribed: subscriptions[topic.id] || false,
        lastActivity: lastMessages[topic.id]?.createdAt || topic.createdAt,
        lastActivityBy: lastMessages[topic.id]?.senderName || null,
      }));

      // Get next cursor
      const nextCursor = hasMore ? resultTopics[resultTopics.length - 1]?.id : null;

      return reply.status(200).send({
        topics: topicsResponse,
        nextCursor,
        hasMore,
      });
    }
  );

  /**
   * GET /topics/:id - Get a single topic with its messages
   * Query: cursor, limit (for messages)
   * Returns: Topic with paginated messages
   */
  fastify.get<{
    Params: { id: string };
    Querystring: { cursor?: string; limit?: string };
  }>(
    "/topics/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: topicId } = request.params;
      const { cursor, limit: limitStr } = request.query;

      // Validate topicId format
      if (!UUID_REGEX.test(topicId)) {
        return reply.status(400).send({
          error: "Invalid topic ID format",
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

      // Get the topic
      const [topic] = await db
        .select({
          id: topics.id,
          chatId: topics.chatId,
          title: topics.title,
          creatorId: topics.creatorId,
          status: topics.status,
          createdAt: topics.createdAt,
          creator: {
            id: users.id,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
          },
        })
        .from(topics)
        .innerJoin(users, eq(topics.creatorId, users.id))
        .where(eq(topics.id, topicId))
        .limit(1);

      if (!topic) {
        return reply.status(404).send({
          error: "Topic not found",
        });
      }

      // Check user is a member of the chat
      const [membership] = await db
        .select()
        .from(chatMembers)
        .where(
          and(
            eq(chatMembers.chatId, topic.chatId),
            eq(chatMembers.userId, currentUserId)
          )
        )
        .limit(1);

      if (!membership) {
        return reply.status(403).send({
          error: "You are not a member of this chat",
        });
      }

      // Check if user is subscribed
      const [subscription] = await db
        .select()
        .from(topicSubscriptions)
        .where(
          and(
            eq(topicSubscriptions.topicId, topicId),
            eq(topicSubscriptions.userId, currentUserId)
          )
        )
        .limit(1);

      // Get messages for this topic
      let cursorTimestamp: Date | null = null;

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

      // Fetch messages (oldest first for topic view)
      const messageRows = await db
        .select({
          id: messages.id,
          chatId: messages.chatId,
          senderId: messages.senderId,
          type: messages.type,
          content: messages.content,
          topicId: messages.topicId,
          editedAt: messages.editedAt,
          recalledAt: messages.recalledAt,
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
                eq(messages.topicId, topicId),
                sql`${messages.createdAt} > ${cursorTimestamp}`
              )
            : eq(messages.topicId, topicId)
        )
        .orderBy(asc(messages.createdAt))
        .limit(limit + 1);

      // Determine if there are more messages
      const hasMore = messageRows.length > limit;
      const resultMessages = hasMore ? messageRows.slice(0, limit) : messageRows;

      // Get next cursor
      const nextCursor = hasMore ? resultMessages[resultMessages.length - 1]?.id : null;

      // Get total message count
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .where(eq(messages.topicId, topicId));

      return reply.status(200).send({
        topic: {
          ...topic,
          messageCount: countResult?.count || 0,
          isSubscribed: !!subscription,
        },
        messages: resultMessages,
        nextCursor,
        hasMore,
      });
    }
  );

  /**
   * POST /topics/:id/messages - Send a message to a topic
   * Body: { type, content }
   * Returns: Created message
   */
  fastify.post<{
    Params: { id: string };
    Body: { type: "text" | "rich_text" | "code"; content: Record<string, unknown> };
  }>(
    "/topics/:id/messages",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: topicId } = request.params;
      const { type, content } = request.body;

      // Validate topicId format
      if (!UUID_REGEX.test(topicId)) {
        return reply.status(400).send({
          error: "Invalid topic ID format",
        });
      }

      // Validate type
      const validTypes = ["text", "rich_text", "code"];
      if (!type || !validTypes.includes(type)) {
        return reply.status(400).send({
          error: `type must be one of: ${validTypes.join(", ")}`,
        });
      }

      // Validate content
      if (!content || typeof content !== "object") {
        return reply.status(400).send({
          error: "content is required and must be an object",
        });
      }

      const currentUserId = request.user.id;

      // Get the topic
      const [topic] = await db
        .select()
        .from(topics)
        .where(eq(topics.id, topicId))
        .limit(1);

      if (!topic) {
        return reply.status(404).send({
          error: "Topic not found",
        });
      }

      // Check topic is open
      if (topic.status !== "open") {
        return reply.status(400).send({
          error: "Cannot post to a closed topic",
        });
      }

      // Check user is a member of the chat
      const [membership] = await db
        .select()
        .from(chatMembers)
        .where(
          and(
            eq(chatMembers.chatId, topic.chatId),
            eq(chatMembers.userId, currentUserId)
          )
        )
        .limit(1);

      if (!membership) {
        return reply.status(403).send({
          error: "You are not a member of this chat",
        });
      }

      // Create the message
      const [newMessage] = await db
        .insert(messages)
        .values({
          chatId: topic.chatId,
          senderId: currentUserId,
          type,
          content,
          topicId,
        })
        .returning();

      // Auto-subscribe sender to the topic if not already
      const [existingSub] = await db
        .select()
        .from(topicSubscriptions)
        .where(
          and(
            eq(topicSubscriptions.topicId, topicId),
            eq(topicSubscriptions.userId, currentUserId)
          )
        )
        .limit(1);

      if (!existingSub) {
        await db.insert(topicSubscriptions).values({
          topicId,
          userId: currentUserId,
        });
      }

      const messageWithSender = {
        ...newMessage,
        sender: {
          id: request.user.id,
          displayName: request.user.displayName,
          avatarUrl: request.user.avatarUrl,
        },
      };

      // Publish message to Redis channel
      await publish(getChatChannel(topic.chatId), {
        type: "topic_message",
        payload: {
          ...messageWithSender,
          topicId,
          topicTitle: topic.title,
        },
      });

      return reply.status(201).send(messageWithSender);
    }
  );

  /**
   * PATCH /topics/:id - Update a topic (close/reopen)
   * Body: { status?: "open" | "closed", title?: string }
   * Only creator or chat owner can update
   */
  fastify.patch<{
    Params: { id: string };
    Body: { status?: "open" | "closed"; title?: string };
  }>(
    "/topics/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: topicId } = request.params;
      const { status, title } = request.body;

      // Validate topicId format
      if (!UUID_REGEX.test(topicId)) {
        return reply.status(400).send({
          error: "Invalid topic ID format",
        });
      }

      const currentUserId = request.user.id;

      // Get the topic
      const [topic] = await db
        .select()
        .from(topics)
        .where(eq(topics.id, topicId))
        .limit(1);

      if (!topic) {
        return reply.status(404).send({
          error: "Topic not found",
        });
      }

      // Get user's membership
      const [membership] = await db
        .select()
        .from(chatMembers)
        .where(
          and(
            eq(chatMembers.chatId, topic.chatId),
            eq(chatMembers.userId, currentUserId)
          )
        )
        .limit(1);

      if (!membership) {
        return reply.status(403).send({
          error: "You are not a member of this chat",
        });
      }

      // Only creator or owner can update topic
      const isCreator = topic.creatorId === currentUserId;
      const isOwner = membership.role === "owner";

      if (!isCreator && !isOwner) {
        return reply.status(403).send({
          error: "Only topic creator or group owner can update this topic",
        });
      }

      // Build updates
      const updates: Record<string, unknown> = {};

      if (status !== undefined) {
        if (!["open", "closed"].includes(status)) {
          return reply.status(400).send({
            error: "status must be 'open' or 'closed'",
          });
        }
        updates.status = status;
      }

      if (title !== undefined) {
        if (typeof title !== "string" || title.trim().length === 0) {
          return reply.status(400).send({
            error: "title must be a non-empty string",
          });
        }
        if (title.length > 255) {
          return reply.status(400).send({
            error: "title must be at most 255 characters",
          });
        }
        updates.title = title.trim();
      }

      if (Object.keys(updates).length === 0) {
        return reply.status(400).send({
          error: "No updates provided",
        });
      }

      // Update the topic
      const [updatedTopic] = await db
        .update(topics)
        .set(updates)
        .where(eq(topics.id, topicId))
        .returning();

      // Get creator info
      const [creator] = await db
        .select({
          id: users.id,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(eq(users.id, updatedTopic.creatorId))
        .limit(1);

      // Publish topic update event
      await publish(getChatChannel(topic.chatId), {
        type: "topic_updated",
        payload: {
          topic: {
            ...updatedTopic,
            creator,
          },
          updatedBy: {
            id: request.user.id,
            displayName: request.user.displayName,
          },
        },
      });

      return reply.status(200).send({
        topic: {
          ...updatedTopic,
          creator,
        },
      });
    }
  );

  /**
   * POST /topics/:id/subscribe - Subscribe to a topic
   * Returns: { success: true }
   */
  fastify.post<{ Params: { id: string } }>(
    "/topics/:id/subscribe",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: topicId } = request.params;

      // Validate topicId format
      if (!UUID_REGEX.test(topicId)) {
        return reply.status(400).send({
          error: "Invalid topic ID format",
        });
      }

      const currentUserId = request.user.id;

      // Get the topic
      const [topic] = await db
        .select()
        .from(topics)
        .where(eq(topics.id, topicId))
        .limit(1);

      if (!topic) {
        return reply.status(404).send({
          error: "Topic not found",
        });
      }

      // Check user is a member of the chat
      const [membership] = await db
        .select()
        .from(chatMembers)
        .where(
          and(
            eq(chatMembers.chatId, topic.chatId),
            eq(chatMembers.userId, currentUserId)
          )
        )
        .limit(1);

      if (!membership) {
        return reply.status(403).send({
          error: "You are not a member of this chat",
        });
      }

      // Check if already subscribed
      const [existingSub] = await db
        .select()
        .from(topicSubscriptions)
        .where(
          and(
            eq(topicSubscriptions.topicId, topicId),
            eq(topicSubscriptions.userId, currentUserId)
          )
        )
        .limit(1);

      if (existingSub) {
        return reply.status(200).send({
          success: true,
          alreadySubscribed: true,
        });
      }

      // Subscribe
      await db.insert(topicSubscriptions).values({
        topicId,
        userId: currentUserId,
      });

      return reply.status(201).send({
        success: true,
      });
    }
  );

  /**
   * DELETE /topics/:id/subscribe - Unsubscribe from a topic
   * Returns: { success: true }
   */
  fastify.delete<{ Params: { id: string } }>(
    "/topics/:id/subscribe",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: topicId } = request.params;

      // Validate topicId format
      if (!UUID_REGEX.test(topicId)) {
        return reply.status(400).send({
          error: "Invalid topic ID format",
        });
      }

      const currentUserId = request.user.id;

      // Delete subscription
      const result = await db
        .delete(topicSubscriptions)
        .where(
          and(
            eq(topicSubscriptions.topicId, topicId),
            eq(topicSubscriptions.userId, currentUserId)
          )
        )
        .returning();

      if (result.length === 0) {
        return reply.status(404).send({
          error: "Not subscribed to this topic",
        });
      }

      return reply.status(200).send({
        success: true,
      });
    }
  );
}
