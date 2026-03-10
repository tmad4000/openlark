import { FastifyInstance } from "fastify";
import { db } from "../db";
import { chats, chatMembers, users, messages } from "../db/schema";
import { eq, and, or, inArray, desc, gt, sql, isNull } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { createSystemMessage } from "./messages";

interface GetChatsQuery {
  filter?: "dm" | "group" | "unread" | "muted";
}

// UUID validation regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CreateDmBody {
  user_id: string;
}

interface CreateGroupBody {
  name: string;
  member_ids: string[];
}

/**
 * Helper to get a chat with its members
 */
async function getChatWithMembers(chatId: string) {
  const chat = await db
    .select()
    .from(chats)
    .where(eq(chats.id, chatId))
    .limit(1);

  if (!chat[0]) return null;

  const members = await db
    .select({
      chatId: chatMembers.chatId,
      userId: chatMembers.userId,
      role: chatMembers.role,
      joinedAt: chatMembers.joinedAt,
      muted: chatMembers.muted,
      label: chatMembers.label,
      lastReadMessageId: chatMembers.lastReadMessageId,
      user: {
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        status: users.status,
      },
    })
    .from(chatMembers)
    .innerJoin(users, eq(chatMembers.userId, users.id))
    .where(eq(chatMembers.chatId, chatId));

  return {
    ...chat[0],
    members,
  };
}

/**
 * Find existing DM between two users
 */
async function findExistingDm(userId1: string, userId2: string, orgId: string) {
  // Find DM chats where both users are members
  const userDmChats = await db
    .select({
      chatId: chatMembers.chatId,
    })
    .from(chatMembers)
    .innerJoin(chats, eq(chatMembers.chatId, chats.id))
    .where(
      and(
        eq(chats.type, "dm"),
        eq(chats.orgId, orgId),
        or(eq(chatMembers.userId, userId1), eq(chatMembers.userId, userId2))
      )
    );

  // Group by chatId and find one with exactly 2 members (both users)
  const chatCounts = new Map<string, Set<string>>();
  for (const row of userDmChats) {
    if (!chatCounts.has(row.chatId)) {
      chatCounts.set(row.chatId, new Set());
    }
  }

  // For each potential DM chat, verify it has exactly both users
  for (const chatId of chatCounts.keys()) {
    const membersInChat = await db
      .select({ userId: chatMembers.userId })
      .from(chatMembers)
      .where(eq(chatMembers.chatId, chatId));

    const memberIds = membersInChat.map((m) => m.userId);
    if (
      memberIds.length === 2 &&
      memberIds.includes(userId1) &&
      memberIds.includes(userId2)
    ) {
      return chatId;
    }
  }

  return null;
}

export async function chatsRoutes(fastify: FastifyInstance) {
  /**
   * GET /chats - Get user's chat list with last message preview and unread count
   * Query: filter (dm|group|unread|muted)
   * Returns: Chats sorted by last message timestamp
   */
  fastify.get<{ Querystring: GetChatsQuery }>(
    "/chats",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { filter } = request.query;
      const currentUserId = request.user.id;

      // Validate filter if provided
      const validFilters = ["dm", "group", "unread", "muted"];
      if (filter && !validFilters.includes(filter)) {
        return reply.status(400).send({
          error: `filter must be one of: ${validFilters.join(", ")}`,
        });
      }

      // Get all chats the user is a member of with their membership info
      const userMemberships = await db
        .select({
          chatId: chatMembers.chatId,
          muted: chatMembers.muted,
          lastReadMessageId: chatMembers.lastReadMessageId,
        })
        .from(chatMembers)
        .where(eq(chatMembers.userId, currentUserId));

      if (userMemberships.length === 0) {
        return reply.status(200).send([]);
      }

      const chatIds = userMemberships.map((m) => m.chatId);
      const membershipMap = new Map(
        userMemberships.map((m) => [m.chatId, m])
      );

      // Get all chats
      let chatList = await db
        .select()
        .from(chats)
        .where(inArray(chats.id, chatIds));

      // Apply type filter (dm or group)
      if (filter === "dm") {
        chatList = chatList.filter((c) => c.type === "dm");
      } else if (filter === "group") {
        chatList = chatList.filter((c) => c.type !== "dm");
      } else if (filter === "muted") {
        chatList = chatList.filter((c) => membershipMap.get(c.id)?.muted === true);
      }

      if (chatList.length === 0) {
        return reply.status(200).send([]);
      }

      const filteredChatIds = chatList.map((c) => c.id);

      // Get member counts for each chat
      const memberCounts = await db
        .select({
          chatId: chatMembers.chatId,
          count: sql<number>`count(*)::int`.as("count"),
        })
        .from(chatMembers)
        .where(inArray(chatMembers.chatId, filteredChatIds))
        .groupBy(chatMembers.chatId);

      const memberCountMap = new Map(
        memberCounts.map((m) => [m.chatId, m.count])
      );

      // Get last message for each chat (subquery approach)
      const lastMessages = await db
        .select({
          chatId: messages.chatId,
          id: messages.id,
          type: messages.type,
          content: messages.content,
          createdAt: messages.createdAt,
          senderId: messages.senderId,
          senderName: users.displayName,
        })
        .from(messages)
        .innerJoin(users, eq(messages.senderId, users.id))
        .where(inArray(messages.chatId, filteredChatIds))
        .orderBy(desc(messages.createdAt));

      // Group by chatId and get the most recent message per chat
      const lastMessageMap = new Map<
        string,
        {
          id: string;
          type: string;
          content: Record<string, unknown>;
          createdAt: Date;
          senderId: string;
          senderName: string | null;
        }
      >();

      for (const msg of lastMessages) {
        if (!lastMessageMap.has(msg.chatId)) {
          lastMessageMap.set(msg.chatId, {
            id: msg.id,
            type: msg.type,
            content: msg.content as Record<string, unknown>,
            createdAt: msg.createdAt,
            senderId: msg.senderId,
            senderName: msg.senderName,
          });
        }
      }

      // Get unread counts for each chat
      // Count messages after the user's last_read_message_id
      const unreadCountPromises = filteredChatIds.map(async (chatId) => {
        const membership = membershipMap.get(chatId);
        const lastReadMessageId = membership?.lastReadMessageId;

        if (!lastReadMessageId) {
          // No message read yet - count all messages not sent by user
          const [result] = await db
            .select({
              count: sql<number>`count(*)::int`.as("count"),
            })
            .from(messages)
            .where(
              and(
                eq(messages.chatId, chatId),
                sql`${messages.senderId} != ${currentUserId}`
              )
            );
          return { chatId, count: result?.count ?? 0 };
        }

        // Get the timestamp of the last read message
        const [lastReadMsg] = await db
          .select({ createdAt: messages.createdAt })
          .from(messages)
          .where(eq(messages.id, lastReadMessageId))
          .limit(1);

        if (!lastReadMsg) {
          // Last read message was deleted - count all messages not sent by user
          const [result] = await db
            .select({
              count: sql<number>`count(*)::int`.as("count"),
            })
            .from(messages)
            .where(
              and(
                eq(messages.chatId, chatId),
                sql`${messages.senderId} != ${currentUserId}`
              )
            );
          return { chatId, count: result?.count ?? 0 };
        }

        // Count messages after the last read message, not sent by user
        const [result] = await db
          .select({
            count: sql<number>`count(*)::int`.as("count"),
          })
          .from(messages)
          .where(
            and(
              eq(messages.chatId, chatId),
              gt(messages.createdAt, lastReadMsg.createdAt),
              sql`${messages.senderId} != ${currentUserId}`
            )
          );

        return { chatId, count: result?.count ?? 0 };
      });

      const unreadCounts = await Promise.all(unreadCountPromises);
      const unreadCountMap = new Map(
        unreadCounts.map((u) => [u.chatId, u.count])
      );

      // For DMs, get the other user's info (name/avatar)
      const dmChats = chatList.filter((c) => c.type === "dm");
      const dmOtherUserMap = new Map<
        string,
        { displayName: string | null; avatarUrl: string | null }
      >();

      if (dmChats.length > 0) {
        const dmChatIds = dmChats.map((c) => c.id);
        const dmMembers = await db
          .select({
            chatId: chatMembers.chatId,
            userId: chatMembers.userId,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
          })
          .from(chatMembers)
          .innerJoin(users, eq(chatMembers.userId, users.id))
          .where(
            and(
              inArray(chatMembers.chatId, dmChatIds),
              sql`${chatMembers.userId} != ${currentUserId}`
            )
          );

        for (const member of dmMembers) {
          dmOtherUserMap.set(member.chatId, {
            displayName: member.displayName,
            avatarUrl: member.avatarUrl,
          });
        }
      }

      // Build the response
      let result = chatList.map((chat) => {
        const lastMessage = lastMessageMap.get(chat.id);
        const membership = membershipMap.get(chat.id);
        const unreadCount = unreadCountMap.get(chat.id) ?? 0;
        const memberCount = memberCountMap.get(chat.id) ?? 0;

        // For DMs, use the other user's name and avatar
        let displayName = chat.name;
        let displayAvatar = chat.avatarUrl;

        if (chat.type === "dm") {
          const otherUser = dmOtherUserMap.get(chat.id);
          displayName = otherUser?.displayName ?? "Unknown";
          displayAvatar = otherUser?.avatarUrl ?? null;
        }

        return {
          id: chat.id,
          type: chat.type,
          name: displayName,
          avatarUrl: displayAvatar,
          memberCount,
          unreadCount,
          muted: membership?.muted ?? false,
          lastMessage: lastMessage
            ? {
                id: lastMessage.id,
                type: lastMessage.type,
                content: lastMessage.content,
                createdAt: lastMessage.createdAt,
                senderName: lastMessage.senderName,
              }
            : null,
          lastMessageAt: lastMessage?.createdAt ?? chat.createdAt,
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt,
        };
      });

      // Apply unread filter
      if (filter === "unread") {
        result = result.filter((c) => c.unreadCount > 0);
      }

      // Sort by last message timestamp (most recent first)
      result.sort((a, b) => {
        const aTime = a.lastMessageAt?.getTime() ?? 0;
        const bTime = b.lastMessageAt?.getTime() ?? 0;
        return bTime - aTime;
      });

      return reply.status(200).send(result);
    }
  );

  /**
   * POST /chats/dm - Create or return existing DM with a user
   * Body: { user_id: string }
   * Returns: Full chat object with member list
   */
  fastify.post<{ Body: CreateDmBody }>(
    "/chats/dm",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { user_id } = request.body;

      // Validate user_id is provided
      if (!user_id) {
        return reply.status(400).send({
          error: "user_id is required",
        });
      }

      // Validate user_id format
      if (!UUID_REGEX.test(user_id)) {
        return reply.status(400).send({
          error: "Invalid user_id format",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization to create chats",
        });
      }

      const currentUserId = request.user.id;
      const orgId = request.user.orgId;

      // Cannot create DM with yourself
      if (user_id === currentUserId) {
        return reply.status(400).send({
          error: "Cannot create DM with yourself",
        });
      }

      // Validate target user exists and is in the same org
      const [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, user_id))
        .limit(1);

      if (!targetUser) {
        return reply.status(404).send({
          error: "User not found",
        });
      }

      if (targetUser.orgId !== orgId) {
        return reply.status(400).send({
          error: "User is not in the same organization",
        });
      }

      // Check for existing DM between these users
      const existingDmId = await findExistingDm(currentUserId, user_id, orgId);

      if (existingDmId) {
        const existingChat = await getChatWithMembers(existingDmId);
        return reply.status(200).send(existingChat);
      }

      // Create new DM chat
      const [newChat] = await db
        .insert(chats)
        .values({
          type: "dm",
          orgId,
          maxMembers: 2,
        })
        .returning();

      // Add both users as members
      await db.insert(chatMembers).values([
        {
          chatId: newChat.id,
          userId: currentUserId,
          role: "member",
        },
        {
          chatId: newChat.id,
          userId: user_id,
          role: "member",
        },
      ]);

      const chatWithMembers = await getChatWithMembers(newChat.id);
      return reply.status(201).send(chatWithMembers);
    }
  );

  /**
   * POST /chats/group - Create a new group chat
   * Body: { name: string, member_ids: string[] }
   * Returns: Full chat object with member list
   */
  fastify.post<{ Body: CreateGroupBody }>(
    "/chats/group",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { name, member_ids } = request.body;

      // Validate name is provided
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return reply.status(400).send({
          error: "name is required and must be a non-empty string",
        });
      }

      // Validate member_ids is provided and is an array
      if (!member_ids || !Array.isArray(member_ids)) {
        return reply.status(400).send({
          error: "member_ids must be an array",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization to create chats",
        });
      }

      const currentUserId = request.user.id;
      const orgId = request.user.orgId;

      // Validate each member_id format
      for (const memberId of member_ids) {
        if (!UUID_REGEX.test(memberId)) {
          return reply.status(400).send({
            error: `Invalid member_id format: ${memberId}`,
          });
        }
      }

      // Remove duplicates and ensure creator is not in member_ids
      const uniqueMemberIds = [...new Set(member_ids)].filter(
        (id) => id !== currentUserId
      );

      // Validate all members exist and are in the same org
      if (uniqueMemberIds.length > 0) {
        const foundUsers = await db
          .select({ id: users.id, orgId: users.orgId })
          .from(users)
          .where(inArray(users.id, uniqueMemberIds));

        const foundUserIds = new Set(foundUsers.map((u) => u.id));
        const missingUserIds = uniqueMemberIds.filter(
          (id) => !foundUserIds.has(id)
        );

        if (missingUserIds.length > 0) {
          return reply.status(404).send({
            error: `Users not found: ${missingUserIds.join(", ")}`,
          });
        }

        // Check all users are in the same org
        const wrongOrgUsers = foundUsers.filter((u) => u.orgId !== orgId);
        if (wrongOrgUsers.length > 0) {
          return reply.status(400).send({
            error: `Users not in same organization: ${wrongOrgUsers.map((u) => u.id).join(", ")}`,
          });
        }
      }

      // Create new group chat
      const [newChat] = await db
        .insert(chats)
        .values({
          type: "group",
          name: name.trim(),
          orgId,
        })
        .returning();

      // Add creator as owner
      const memberValues: Array<{
        chatId: string;
        userId: string;
        role: "owner" | "admin" | "member";
      }> = [
        {
          chatId: newChat.id,
          userId: currentUserId,
          role: "owner",
        },
      ];

      // Add other members
      for (const memberId of uniqueMemberIds) {
        memberValues.push({
          chatId: newChat.id,
          userId: memberId,
          role: "member",
        });
      }

      await db.insert(chatMembers).values(memberValues);

      // Create system message for group creation
      await createSystemMessage(newChat.id, currentUserId, {
        action: "group_created",
        createdBy: request.user.displayName,
        groupName: name.trim(),
      });

      // Create system message for members added (if any members besides creator)
      if (uniqueMemberIds.length > 0) {
        // Get member names for the system message
        const addedMembers = await db
          .select({ id: users.id, displayName: users.displayName })
          .from(users)
          .where(inArray(users.id, uniqueMemberIds));

        const memberNames = addedMembers.map((m) => m.displayName).filter(Boolean);

        await createSystemMessage(newChat.id, currentUserId, {
          action: "members_added",
          addedBy: request.user.displayName,
          members: memberNames,
        });
      }

      const chatWithMembers = await getChatWithMembers(newChat.id);
      return reply.status(201).send(chatWithMembers);
    }
  );
}
