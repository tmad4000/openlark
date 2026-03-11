import { FastifyInstance } from "fastify";
import { db } from "../db";
import { chats, chatMembers, users, messages, pins, chatTabs, announcements } from "../db/schema";
import { eq, and, or, inArray, desc, gt, sql, isNull } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { createSystemMessage } from "./messages";
import { getTypingUsers, getOnlineUsers } from "../lib/redis";

interface GetChatsQuery {
  filter?: "dm" | "group" | "unread" | "muted" | "done";
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
  type?: "group" | "topic_group";
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
      done: chatMembers.done,
      pinned: chatMembers.pinned,
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

interface UpdateChatMemberBody {
  muted?: boolean;
  done?: boolean;
  pinned?: boolean;
  label?: string | null;
}

interface UpdateChatBody {
  name?: string;
  avatarUrl?: string | null;
  isPublic?: boolean;
  settings?: {
    whoCanSendMessages?: "all" | "admins_only";
    whoCanAddMembers?: "all" | "admins_only";
    historyVisibleToNewMembers?: boolean;
  };
}

interface AddMembersBody {
  member_ids: string[];
}

interface UpdateMemberRoleBody {
  role: "admin" | "member";
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
      const validFilters = ["dm", "group", "unread", "muted", "done"];
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
          done: chatMembers.done,
          pinned: chatMembers.pinned,
          label: chatMembers.label,
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
      } else if (filter === "done") {
        // Show only done chats
        chatList = chatList.filter((c) => membershipMap.get(c.id)?.done === true);
      } else {
        // By default, filter out done chats (they're searchable but not in active list)
        chatList = chatList.filter((c) => membershipMap.get(c.id)?.done !== true);
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
          done: membership?.done ?? false,
          pinned: membership?.pinned ?? false,
          label: membership?.label ?? null,
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

      // Sort: pinned chats first, then by last message timestamp (most recent first)
      result.sort((a, b) => {
        // Pinned chats always come first
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        // Within same pinned status, sort by last message time
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
      const { name, member_ids, type = "group" } = request.body;

      // Validate name is provided
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return reply.status(400).send({
          error: "name is required and must be a non-empty string",
        });
      }

      // Validate type if provided
      const validTypes = ["group", "topic_group"];
      if (!validTypes.includes(type)) {
        return reply.status(400).send({
          error: `type must be one of: ${validTypes.join(", ")}`,
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
          type,
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
        action: type === "topic_group" ? "topic_group_created" : "group_created",
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

  /**
   * GET /chats/:id/members - Get members of a chat
   * Returns: Array of chat members with user info
   */
  fastify.get<{ Params: { id: string } }>(
    "/chats/:id/members",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid chat ID format",
        });
      }

      // Verify user is a member of this chat
      const [membership] = await db
        .select()
        .from(chatMembers)
        .where(
          and(
            eq(chatMembers.chatId, id),
            eq(chatMembers.userId, request.user.id)
          )
        )
        .limit(1);

      if (!membership) {
        return reply.status(403).send({
          error: "Access denied - not a member of this chat",
        });
      }

      // Get all members with user info
      const members = await db
        .select({
          userId: chatMembers.userId,
          role: chatMembers.role,
          joinedAt: chatMembers.joinedAt,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          email: users.email,
        })
        .from(chatMembers)
        .innerJoin(users, eq(chatMembers.userId, users.id))
        .where(eq(chatMembers.chatId, id));

      return reply.status(200).send({ members });
    }
  );

  /**
   * GET /chats/:id/typing - Get users currently typing in a chat
   * Returns: Array of typing users
   */
  fastify.get<{ Params: { id: string } }>(
    "/chats/:id/typing",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid chat ID format",
        });
      }

      // Verify user is a member of this chat
      const [membership] = await db
        .select()
        .from(chatMembers)
        .where(
          and(
            eq(chatMembers.chatId, id),
            eq(chatMembers.userId, request.user.id)
          )
        )
        .limit(1);

      if (!membership) {
        return reply.status(403).send({
          error: "Access denied - not a member of this chat",
        });
      }

      const typingUsers = await getTypingUsers(id);

      // Filter out the current user from typing list
      const filteredTyping = typingUsers.filter(
        (t) => t.userId !== request.user.id
      );

      return reply.status(200).send({ typing: filteredTyping });
    }
  );

  /**
   * GET /chats/:id/members/presence - Get online presence for chat members
   * Returns: Map of userId to isOnline boolean
   */
  fastify.get<{ Params: { id: string } }>(
    "/chats/:id/members/presence",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid chat ID format",
        });
      }

      // Verify user is a member of this chat
      const [membership] = await db
        .select()
        .from(chatMembers)
        .where(
          and(
            eq(chatMembers.chatId, id),
            eq(chatMembers.userId, request.user.id)
          )
        )
        .limit(1);

      if (!membership) {
        return reply.status(403).send({
          error: "Access denied - not a member of this chat",
        });
      }

      // Get all member IDs
      const members = await db
        .select({ userId: chatMembers.userId })
        .from(chatMembers)
        .where(eq(chatMembers.chatId, id));

      const memberIds = members.map((m) => m.userId);
      const onlineSet = await getOnlineUsers(memberIds);

      const presence: Record<string, boolean> = {};
      for (const memberId of memberIds) {
        presence[memberId] = onlineSet.has(memberId);
      }

      return reply.status(200).send({ presence });
    }
  );

  /**
   * POST /chats/:id/pins/:messageId - Pin a message to the chat
   * Returns: { success: true, pin: { chatId, messageId, pinnedBy, pinnedAt } }
   */
  fastify.post<{ Params: { id: string; messageId: string } }>(
    "/chats/:id/pins/:messageId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: chatId, messageId } = request.params;

      // Validate UUID formats
      if (!UUID_REGEX.test(chatId)) {
        return reply.status(400).send({
          error: "Invalid chat ID format",
        });
      }

      if (!UUID_REGEX.test(messageId)) {
        return reply.status(400).send({
          error: "Invalid message ID format",
        });
      }

      const currentUserId = request.user.id;

      // Verify user is a member of this chat
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
          error: "Access denied - not a member of this chat",
        });
      }

      // Verify the message exists in this chat
      const [message] = await db
        .select()
        .from(messages)
        .where(and(eq(messages.id, messageId), eq(messages.chatId, chatId)))
        .limit(1);

      if (!message) {
        return reply.status(404).send({
          error: "Message not found in this chat",
        });
      }

      // Check if already pinned
      const [existingPin] = await db
        .select()
        .from(pins)
        .where(and(eq(pins.chatId, chatId), eq(pins.messageId, messageId)))
        .limit(1);

      if (existingPin) {
        return reply.status(200).send({
          success: true,
          pin: existingPin,
          alreadyPinned: true,
        });
      }

      // Insert the pin
      const [newPin] = await db
        .insert(pins)
        .values({
          chatId,
          messageId,
          pinnedBy: currentUserId,
        })
        .returning();

      return reply.status(201).send({
        success: true,
        pin: newPin,
      });
    }
  );

  /**
   * DELETE /chats/:id/pins/:messageId - Unpin a message from the chat
   * Returns: { success: true }
   */
  fastify.delete<{ Params: { id: string; messageId: string } }>(
    "/chats/:id/pins/:messageId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: chatId, messageId } = request.params;

      // Validate UUID formats
      if (!UUID_REGEX.test(chatId)) {
        return reply.status(400).send({
          error: "Invalid chat ID format",
        });
      }

      if (!UUID_REGEX.test(messageId)) {
        return reply.status(400).send({
          error: "Invalid message ID format",
        });
      }

      const currentUserId = request.user.id;

      // Verify user is a member of this chat
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
          error: "Access denied - not a member of this chat",
        });
      }

      // Delete the pin
      const result = await db
        .delete(pins)
        .where(and(eq(pins.chatId, chatId), eq(pins.messageId, messageId)))
        .returning();

      if (result.length === 0) {
        return reply.status(404).send({
          error: "Pin not found",
        });
      }

      return reply.status(200).send({
        success: true,
      });
    }
  );

  /**
   * GET /chats/:id/pins - Get all pinned messages in a chat
   * Returns: { pins: Array<{ pin, message, sender }> }
   */
  fastify.get<{ Params: { id: string } }>(
    "/chats/:id/pins",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: chatId } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(chatId)) {
        return reply.status(400).send({
          error: "Invalid chat ID format",
        });
      }

      const currentUserId = request.user.id;

      // Verify user is a member of this chat
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
          error: "Access denied - not a member of this chat",
        });
      }

      // Get all pinned messages with message content and sender info
      const pinnedMessages = await db
        .select({
          pin: {
            chatId: pins.chatId,
            messageId: pins.messageId,
            pinnedBy: pins.pinnedBy,
            pinnedAt: pins.pinnedAt,
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
        })
        .from(pins)
        .innerJoin(messages, eq(pins.messageId, messages.id))
        .innerJoin(users, eq(messages.senderId, users.id))
        .where(eq(pins.chatId, chatId))
        .orderBy(desc(pins.pinnedAt));

      return reply.status(200).send({
        pins: pinnedMessages,
      });
    }
  );

  /**
   * GET /chats/:id - Get chat details including settings
   * Returns: Chat with settings and current user's role
   */
  fastify.get<{ Params: { id: string } }>(
    "/chats/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid chat ID format",
        });
      }

      const currentUserId = request.user.id;

      // Verify user is a member of this chat and get their role
      const [membership] = await db
        .select()
        .from(chatMembers)
        .where(
          and(
            eq(chatMembers.chatId, id),
            eq(chatMembers.userId, currentUserId)
          )
        )
        .limit(1);

      if (!membership) {
        return reply.status(403).send({
          error: "Access denied - not a member of this chat",
        });
      }

      // Get the chat
      const [chat] = await db
        .select()
        .from(chats)
        .where(eq(chats.id, id))
        .limit(1);

      if (!chat) {
        return reply.status(404).send({
          error: "Chat not found",
        });
      }

      // Get member count
      const [memberCountResult] = await db
        .select({
          count: sql<number>`count(*)::int`.as("count"),
        })
        .from(chatMembers)
        .where(eq(chatMembers.chatId, id));

      return reply.status(200).send({
        id: chat.id,
        type: chat.type,
        name: chat.name,
        avatarUrl: chat.avatarUrl,
        isPublic: chat.isPublic,
        maxMembers: chat.maxMembers,
        memberCount: memberCountResult?.count ?? 0,
        settings: chat.settings ?? {
          whoCanSendMessages: "all",
          whoCanAddMembers: "all",
          historyVisibleToNewMembers: true,
        },
        currentUserRole: membership.role,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      });
    }
  );

  /**
   * PATCH /chats/:id - Update chat settings (owner/admin only)
   * Body: { name?, avatarUrl?, isPublic?, settings? }
   * Returns: Updated chat
   */
  fastify.patch<{ Params: { id: string }; Body: UpdateChatBody }>(
    "/chats/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { name, avatarUrl, isPublic, settings } = request.body;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid chat ID format",
        });
      }

      const currentUserId = request.user.id;

      // Get the chat to verify it's a group
      const [chat] = await db
        .select()
        .from(chats)
        .where(eq(chats.id, id))
        .limit(1);

      if (!chat) {
        return reply.status(404).send({
          error: "Chat not found",
        });
      }

      if (chat.type === "dm") {
        return reply.status(400).send({
          error: "Cannot update DM chat settings",
        });
      }

      // Get user's membership and role
      const [membership] = await db
        .select()
        .from(chatMembers)
        .where(
          and(
            eq(chatMembers.chatId, id),
            eq(chatMembers.userId, currentUserId)
          )
        )
        .limit(1);

      if (!membership) {
        return reply.status(403).send({
          error: "Access denied - not a member of this chat",
        });
      }

      // Only owner can update isPublic
      if (isPublic !== undefined && membership.role !== "owner") {
        return reply.status(403).send({
          error: "Only group owner can change public/private setting",
        });
      }

      // Owner and admin can update name, avatar, and settings
      if (membership.role !== "owner" && membership.role !== "admin") {
        return reply.status(403).send({
          error: "Only group owner or admin can update group settings",
        });
      }

      // Build update object
      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (name !== undefined) {
        if (typeof name !== "string" || name.trim().length === 0) {
          return reply.status(400).send({
            error: "name must be a non-empty string",
          });
        }
        updates.name = name.trim();
      }

      if (avatarUrl !== undefined) {
        updates.avatarUrl = avatarUrl;
      }

      if (isPublic !== undefined) {
        updates.isPublic = isPublic;
      }

      if (settings !== undefined) {
        // Merge with existing settings
        const existingSettings = (chat.settings ?? {}) as Record<string, unknown>;
        const newSettings = { ...existingSettings };

        if (settings.whoCanSendMessages !== undefined) {
          if (!["all", "admins_only"].includes(settings.whoCanSendMessages)) {
            return reply.status(400).send({
              error: "whoCanSendMessages must be 'all' or 'admins_only'",
            });
          }
          newSettings.whoCanSendMessages = settings.whoCanSendMessages;
        }

        if (settings.whoCanAddMembers !== undefined) {
          if (!["all", "admins_only"].includes(settings.whoCanAddMembers)) {
            return reply.status(400).send({
              error: "whoCanAddMembers must be 'all' or 'admins_only'",
            });
          }
          newSettings.whoCanAddMembers = settings.whoCanAddMembers;
        }

        if (settings.historyVisibleToNewMembers !== undefined) {
          newSettings.historyVisibleToNewMembers = settings.historyVisibleToNewMembers;
        }

        updates.settings = newSettings;
      }

      // Update the chat
      const [updatedChat] = await db
        .update(chats)
        .set(updates)
        .where(eq(chats.id, id))
        .returning();

      // Create system message for name change
      if (name !== undefined) {
        await createSystemMessage(id, currentUserId, {
          action: "group_renamed",
          renamedBy: request.user.displayName,
          newName: name.trim(),
        });
      }

      return reply.status(200).send({
        id: updatedChat.id,
        type: updatedChat.type,
        name: updatedChat.name,
        avatarUrl: updatedChat.avatarUrl,
        isPublic: updatedChat.isPublic,
        maxMembers: updatedChat.maxMembers,
        settings: updatedChat.settings ?? {
          whoCanSendMessages: "all",
          whoCanAddMembers: "all",
          historyVisibleToNewMembers: true,
        },
        createdAt: updatedChat.createdAt,
        updatedAt: updatedChat.updatedAt,
      });
    }
  );

  /**
   * POST /chats/:id/members - Add members to a group chat
   * Body: { member_ids: string[] }
   * Returns: { added: number, members: Array }
   */
  fastify.post<{ Params: { id: string }; Body: AddMembersBody }>(
    "/chats/:id/members",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { member_ids } = request.body;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid chat ID format",
        });
      }

      // Validate member_ids is an array
      if (!member_ids || !Array.isArray(member_ids)) {
        return reply.status(400).send({
          error: "member_ids must be an array",
        });
      }

      if (member_ids.length === 0) {
        return reply.status(400).send({
          error: "member_ids cannot be empty",
        });
      }

      // Validate each member_id format
      for (const memberId of member_ids) {
        if (!UUID_REGEX.test(memberId)) {
          return reply.status(400).send({
            error: `Invalid member_id format: ${memberId}`,
          });
        }
      }

      const currentUserId = request.user.id;

      // Get the chat to verify it's a group
      const [chat] = await db
        .select()
        .from(chats)
        .where(eq(chats.id, id))
        .limit(1);

      if (!chat) {
        return reply.status(404).send({
          error: "Chat not found",
        });
      }

      if (chat.type === "dm") {
        return reply.status(400).send({
          error: "Cannot add members to a DM",
        });
      }

      // Get user's membership and role
      const [membership] = await db
        .select()
        .from(chatMembers)
        .where(
          and(
            eq(chatMembers.chatId, id),
            eq(chatMembers.userId, currentUserId)
          )
        )
        .limit(1);

      if (!membership) {
        return reply.status(403).send({
          error: "Access denied - not a member of this chat",
        });
      }

      // Check who can add members based on settings
      const chatSettings = (chat.settings ?? {}) as Record<string, unknown>;
      const whoCanAddMembers = chatSettings.whoCanAddMembers ?? "all";

      if (whoCanAddMembers === "admins_only") {
        if (membership.role !== "owner" && membership.role !== "admin") {
          return reply.status(403).send({
            error: "Only group owner or admin can add members",
          });
        }
      }

      // Remove duplicates
      const uniqueMemberIds = [...new Set(member_ids)];

      // Check if users already are members
      const existingMembers = await db
        .select({ userId: chatMembers.userId })
        .from(chatMembers)
        .where(
          and(
            eq(chatMembers.chatId, id),
            inArray(chatMembers.userId, uniqueMemberIds)
          )
        );

      const existingMemberIds = new Set(existingMembers.map((m) => m.userId));
      const newMemberIds = uniqueMemberIds.filter((mid) => !existingMemberIds.has(mid));

      if (newMemberIds.length === 0) {
        return reply.status(200).send({
          added: 0,
          message: "All users are already members",
        });
      }

      // Validate all new members exist and are in the same org
      const foundUsers = await db
        .select({ id: users.id, orgId: users.orgId, displayName: users.displayName })
        .from(users)
        .where(inArray(users.id, newMemberIds));

      const foundUserIds = new Set(foundUsers.map((u) => u.id));
      const missingUserIds = newMemberIds.filter((mid) => !foundUserIds.has(mid));

      if (missingUserIds.length > 0) {
        return reply.status(404).send({
          error: `Users not found: ${missingUserIds.join(", ")}`,
        });
      }

      // Check all users are in the same org
      const wrongOrgUsers = foundUsers.filter((u) => u.orgId !== chat.orgId);
      if (wrongOrgUsers.length > 0) {
        return reply.status(400).send({
          error: `Users not in same organization: ${wrongOrgUsers.map((u) => u.id).join(", ")}`,
        });
      }

      // Add the members
      const memberValues = newMemberIds.map((userId) => ({
        chatId: id,
        userId,
        role: "member" as const,
      }));

      await db.insert(chatMembers).values(memberValues);

      // Create system message for members added
      const memberNames = foundUsers.map((u) => u.displayName).filter(Boolean);
      await createSystemMessage(id, currentUserId, {
        action: "members_added",
        addedBy: request.user.displayName,
        members: memberNames,
      });

      // Get updated member list
      const members = await db
        .select({
          userId: chatMembers.userId,
          role: chatMembers.role,
          joinedAt: chatMembers.joinedAt,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          email: users.email,
        })
        .from(chatMembers)
        .innerJoin(users, eq(chatMembers.userId, users.id))
        .where(eq(chatMembers.chatId, id));

      return reply.status(201).send({
        added: newMemberIds.length,
        members,
      });
    }
  );

  /**
   * DELETE /chats/:id/members/:userId - Remove a member from a group chat
   * Returns: { success: true }
   */
  fastify.delete<{ Params: { id: string; userId: string } }>(
    "/chats/:id/members/:userId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id, userId } = request.params;

      // Validate UUID formats
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid chat ID format",
        });
      }

      if (!UUID_REGEX.test(userId)) {
        return reply.status(400).send({
          error: "Invalid user ID format",
        });
      }

      const currentUserId = request.user.id;

      // Get the chat to verify it's a group
      const [chat] = await db
        .select()
        .from(chats)
        .where(eq(chats.id, id))
        .limit(1);

      if (!chat) {
        return reply.status(404).send({
          error: "Chat not found",
        });
      }

      if (chat.type === "dm") {
        return reply.status(400).send({
          error: "Cannot remove members from a DM",
        });
      }

      // Get current user's membership
      const [currentMembership] = await db
        .select()
        .from(chatMembers)
        .where(
          and(
            eq(chatMembers.chatId, id),
            eq(chatMembers.userId, currentUserId)
          )
        )
        .limit(1);

      if (!currentMembership) {
        return reply.status(403).send({
          error: "Access denied - not a member of this chat",
        });
      }

      // Get target user's membership
      const [targetMembership] = await db
        .select()
        .from(chatMembers)
        .where(
          and(
            eq(chatMembers.chatId, id),
            eq(chatMembers.userId, userId)
          )
        )
        .limit(1);

      if (!targetMembership) {
        return reply.status(404).send({
          error: "User is not a member of this chat",
        });
      }

      // Users can remove themselves (leave the group)
      if (userId === currentUserId) {
        if (currentMembership.role === "owner") {
          return reply.status(400).send({
            error: "Owner cannot leave the group. Transfer ownership first.",
          });
        }

        await db
          .delete(chatMembers)
          .where(
            and(
              eq(chatMembers.chatId, id),
              eq(chatMembers.userId, userId)
            )
          );

        // Get user info for system message
        const [removedUser] = await db
          .select({ displayName: users.displayName })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        await createSystemMessage(id, currentUserId, {
          action: "member_left",
          member: removedUser?.displayName ?? "Unknown",
        });

        return reply.status(200).send({ success: true });
      }

      // Owner can remove anyone (except themselves)
      // Admin can remove members only (not other admins or owner)
      if (currentMembership.role === "owner") {
        // Owner can remove anyone
      } else if (currentMembership.role === "admin") {
        if (targetMembership.role === "owner" || targetMembership.role === "admin") {
          return reply.status(403).send({
            error: "Admins cannot remove other admins or the owner",
          });
        }
      } else {
        return reply.status(403).send({
          error: "Only owner or admin can remove members",
        });
      }

      // Remove the member
      await db
        .delete(chatMembers)
        .where(
          and(
            eq(chatMembers.chatId, id),
            eq(chatMembers.userId, userId)
          )
        );

      // Get user info for system message
      const [removedUser] = await db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      await createSystemMessage(id, currentUserId, {
        action: "member_removed",
        removedBy: request.user.displayName,
        member: removedUser?.displayName ?? "Unknown",
      });

      return reply.status(200).send({ success: true });
    }
  );

  /**
   * PATCH /chats/:id/members/:userId - Update a member's role
   * Body: { role: "admin" | "member" }
   * Returns: Updated member info
   */
  fastify.patch<{ Params: { id: string; userId: string }; Body: UpdateMemberRoleBody }>(
    "/chats/:id/members/:userId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id, userId } = request.params;
      const { role } = request.body;

      // Validate UUID formats
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid chat ID format",
        });
      }

      if (!UUID_REGEX.test(userId)) {
        return reply.status(400).send({
          error: "Invalid user ID format",
        });
      }

      // Validate role
      if (!role || !["admin", "member"].includes(role)) {
        return reply.status(400).send({
          error: "role must be 'admin' or 'member'",
        });
      }

      const currentUserId = request.user.id;

      // Get the chat to verify it's a group
      const [chat] = await db
        .select()
        .from(chats)
        .where(eq(chats.id, id))
        .limit(1);

      if (!chat) {
        return reply.status(404).send({
          error: "Chat not found",
        });
      }

      if (chat.type === "dm") {
        return reply.status(400).send({
          error: "Cannot change roles in a DM",
        });
      }

      // Get current user's membership - only owner can change roles
      const [currentMembership] = await db
        .select()
        .from(chatMembers)
        .where(
          and(
            eq(chatMembers.chatId, id),
            eq(chatMembers.userId, currentUserId)
          )
        )
        .limit(1);

      if (!currentMembership) {
        return reply.status(403).send({
          error: "Access denied - not a member of this chat",
        });
      }

      if (currentMembership.role !== "owner") {
        return reply.status(403).send({
          error: "Only the group owner can change member roles",
        });
      }

      // Get target user's membership
      const [targetMembership] = await db
        .select()
        .from(chatMembers)
        .where(
          and(
            eq(chatMembers.chatId, id),
            eq(chatMembers.userId, userId)
          )
        )
        .limit(1);

      if (!targetMembership) {
        return reply.status(404).send({
          error: "User is not a member of this chat",
        });
      }

      // Cannot change owner's role
      if (targetMembership.role === "owner") {
        return reply.status(400).send({
          error: "Cannot change the owner's role. Transfer ownership instead.",
        });
      }

      // Cannot change your own role
      if (userId === currentUserId) {
        return reply.status(400).send({
          error: "Cannot change your own role",
        });
      }

      // Update the role
      const [updated] = await db
        .update(chatMembers)
        .set({ role })
        .where(
          and(
            eq(chatMembers.chatId, id),
            eq(chatMembers.userId, userId)
          )
        )
        .returning();

      // Get user info for system message
      const [targetUser] = await db
        .select({ displayName: users.displayName, avatarUrl: users.avatarUrl, email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      await createSystemMessage(id, currentUserId, {
        action: role === "admin" ? "admin_added" : "admin_removed",
        changedBy: request.user.displayName,
        member: targetUser?.displayName ?? "Unknown",
      });

      return reply.status(200).send({
        userId: updated.userId,
        role: updated.role,
        joinedAt: updated.joinedAt,
        displayName: targetUser?.displayName,
        avatarUrl: targetUser?.avatarUrl,
        email: targetUser?.email,
      });
    }
  );

  /**
   * PATCH /chat-members/:chatId/me - Update current user's membership settings for a chat
   * Body: { muted?: boolean, done?: boolean, pinned?: boolean, label?: string | null }
   * Returns: Updated chat member settings
   */
  fastify.patch<{ Params: { chatId: string }; Body: UpdateChatMemberBody }>(
    "/chat-members/:chatId/me",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { chatId } = request.params;
      const { muted, done, pinned, label } = request.body;

      // Validate UUID format
      if (!UUID_REGEX.test(chatId)) {
        return reply.status(400).send({
          error: "Invalid chat ID format",
        });
      }

      const currentUserId = request.user.id;

      // Verify user is a member of this chat
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
          error: "Access denied - not a member of this chat",
        });
      }

      // Build update object with only provided fields
      const updates: Partial<{
        muted: boolean;
        done: boolean;
        pinned: boolean;
        label: string | null;
      }> = {};

      if (typeof muted === "boolean") {
        updates.muted = muted;
      }
      if (typeof done === "boolean") {
        updates.done = done;
      }
      if (typeof pinned === "boolean") {
        updates.pinned = pinned;
      }
      if (label !== undefined) {
        // Allow setting label to null to remove it
        updates.label = label;
      }

      // If no updates provided, return current membership
      if (Object.keys(updates).length === 0) {
        return reply.status(200).send({
          chatId: membership.chatId,
          userId: membership.userId,
          muted: membership.muted,
          done: membership.done,
          pinned: membership.pinned,
          label: membership.label,
        });
      }

      // Update the membership
      const [updated] = await db
        .update(chatMembers)
        .set(updates)
        .where(
          and(
            eq(chatMembers.chatId, chatId),
            eq(chatMembers.userId, currentUserId)
          )
        )
        .returning();

      return reply.status(200).send({
        chatId: updated.chatId,
        userId: updated.userId,
        muted: updated.muted,
        done: updated.done,
        pinned: updated.pinned,
        label: updated.label,
      });
    }
  );

  /**
   * GET /chats/:id/tabs - Get all tabs for a chat
   * Returns: { tabs: Array<{ id, chatId, type, name, url, position }> }
   */
  fastify.get<{ Params: { id: string } }>(
    "/chats/:id/tabs",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: chatId } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(chatId)) {
        return reply.status(400).send({
          error: "Invalid chat ID format",
        });
      }

      const currentUserId = request.user.id;

      // Verify user is a member of this chat
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
          error: "Access denied - not a member of this chat",
        });
      }

      // Get all custom tabs for this chat
      const tabs = await db
        .select()
        .from(chatTabs)
        .where(eq(chatTabs.chatId, chatId))
        .orderBy(chatTabs.position);

      return reply.status(200).send({ tabs });
    }
  );

  /**
   * POST /chats/:id/tabs - Create a new custom tab for a chat
   * Body: { name: string, url: string }
   * Returns: { tab: { id, chatId, type, name, url, position } }
   */
  fastify.post<{ Params: { id: string }; Body: { name: string; url: string } }>(
    "/chats/:id/tabs",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: chatId } = request.params;
      const { name, url } = request.body;

      // Validate UUID format
      if (!UUID_REGEX.test(chatId)) {
        return reply.status(400).send({
          error: "Invalid chat ID format",
        });
      }

      // Validate name
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return reply.status(400).send({
          error: "name is required and must be a non-empty string",
        });
      }

      if (name.length > 100) {
        return reply.status(400).send({
          error: "name must be at most 100 characters",
        });
      }

      // Validate url
      if (!url || typeof url !== "string" || url.trim().length === 0) {
        return reply.status(400).send({
          error: "url is required and must be a non-empty string",
        });
      }

      const currentUserId = request.user.id;

      // Verify user is a member of this chat
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
          error: "Access denied - not a member of this chat",
        });
      }

      // Check tab count limit (max 20 per chat)
      const existingTabs = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(chatTabs)
        .where(eq(chatTabs.chatId, chatId));

      if (existingTabs[0]?.count >= 20) {
        return reply.status(400).send({
          error: "Maximum of 20 custom tabs per chat",
        });
      }

      // Get the next position
      const [maxPosition] = await db
        .select({ max: sql<number>`coalesce(max(position), -1)::int` })
        .from(chatTabs)
        .where(eq(chatTabs.chatId, chatId));

      const nextPosition = (maxPosition?.max ?? -1) + 1;

      // Create the tab
      const [newTab] = await db
        .insert(chatTabs)
        .values({
          chatId,
          type: "custom",
          name: name.trim(),
          url: url.trim(),
          position: nextPosition,
        })
        .returning();

      return reply.status(201).send({ tab: newTab });
    }
  );

  /**
   * DELETE /chats/:id/tabs/:tabId - Delete a custom tab
   * Returns: { success: true }
   */
  fastify.delete<{ Params: { id: string; tabId: string } }>(
    "/chats/:id/tabs/:tabId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: chatId, tabId } = request.params;

      // Validate UUID formats
      if (!UUID_REGEX.test(chatId)) {
        return reply.status(400).send({
          error: "Invalid chat ID format",
        });
      }

      if (!UUID_REGEX.test(tabId)) {
        return reply.status(400).send({
          error: "Invalid tab ID format",
        });
      }

      const currentUserId = request.user.id;

      // Verify user is a member of this chat
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
          error: "Access denied - not a member of this chat",
        });
      }

      // Delete the tab (only custom tabs can be deleted)
      const result = await db
        .delete(chatTabs)
        .where(
          and(
            eq(chatTabs.id, tabId),
            eq(chatTabs.chatId, chatId),
            eq(chatTabs.type, "custom")
          )
        )
        .returning();

      if (result.length === 0) {
        return reply.status(404).send({
          error: "Tab not found or cannot be deleted",
        });
      }

      return reply.status(200).send({ success: true });
    }
  );

  /**
   * PUT /chats/:id/tabs/reorder - Reorder tabs in a chat
   * Body: { tabIds: string[] } - Array of tab IDs in desired order
   * Returns: { tabs: Array<{ id, chatId, type, name, url, position }> }
   */
  fastify.put<{ Params: { id: string }; Body: { tabIds: string[] } }>(
    "/chats/:id/tabs/reorder",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: chatId } = request.params;
      const { tabIds } = request.body;

      // Validate UUID format
      if (!UUID_REGEX.test(chatId)) {
        return reply.status(400).send({
          error: "Invalid chat ID format",
        });
      }

      // Validate tabIds is an array
      if (!tabIds || !Array.isArray(tabIds)) {
        return reply.status(400).send({
          error: "tabIds must be an array",
        });
      }

      // Validate each tabId format
      for (const tabId of tabIds) {
        if (!UUID_REGEX.test(tabId)) {
          return reply.status(400).send({
            error: `Invalid tab ID format: ${tabId}`,
          });
        }
      }

      const currentUserId = request.user.id;

      // Verify user is a member of this chat
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
          error: "Access denied - not a member of this chat",
        });
      }

      // Update positions for each tab
      for (let i = 0; i < tabIds.length; i++) {
        await db
          .update(chatTabs)
          .set({ position: i })
          .where(
            and(
              eq(chatTabs.id, tabIds[i]),
              eq(chatTabs.chatId, chatId)
            )
          );
      }

      // Return updated tabs
      const tabs = await db
        .select()
        .from(chatTabs)
        .where(eq(chatTabs.chatId, chatId))
        .orderBy(chatTabs.position);

      return reply.status(200).send({ tabs });
    }
  );

  /**
   * GET /chats/:id/announcements - Get all announcements for a chat
   * Returns: { announcements: Array<{ id, chatId, content, authorId, createdAt, author }> }
   */
  fastify.get<{ Params: { id: string } }>(
    "/chats/:id/announcements",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: chatId } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(chatId)) {
        return reply.status(400).send({
          error: "Invalid chat ID format",
        });
      }

      const currentUserId = request.user.id;

      // Verify user is a member of this chat
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
          error: "Access denied - not a member of this chat",
        });
      }

      // Get all announcements with author info
      const chatAnnouncements = await db
        .select({
          id: announcements.id,
          chatId: announcements.chatId,
          content: announcements.content,
          authorId: announcements.authorId,
          createdAt: announcements.createdAt,
          author: {
            id: users.id,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
          },
        })
        .from(announcements)
        .innerJoin(users, eq(announcements.authorId, users.id))
        .where(eq(announcements.chatId, chatId))
        .orderBy(desc(announcements.createdAt));

      return reply.status(200).send({ announcements: chatAnnouncements });
    }
  );

  /**
   * POST /chats/:id/announcements - Create a new announcement (admin/owner only)
   * Body: { content: string }
   * Returns: { announcement: { id, chatId, content, authorId, createdAt, author } }
   */
  fastify.post<{ Params: { id: string }; Body: { content: string } }>(
    "/chats/:id/announcements",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: chatId } = request.params;
      const { content } = request.body;

      // Validate UUID format
      if (!UUID_REGEX.test(chatId)) {
        return reply.status(400).send({
          error: "Invalid chat ID format",
        });
      }

      // Validate content
      if (!content || typeof content !== "string" || content.trim().length === 0) {
        return reply.status(400).send({
          error: "content is required and must be a non-empty string",
        });
      }

      if (content.length > 5000) {
        return reply.status(400).send({
          error: "content must be at most 5000 characters",
        });
      }

      const currentUserId = request.user.id;

      // Get the chat to verify it's a group
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

      if (chat.type === "dm") {
        return reply.status(400).send({
          error: "Cannot create announcements in a DM",
        });
      }

      // Get user's membership and role
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
          error: "Access denied - not a member of this chat",
        });
      }

      // Only owner and admin can create announcements
      if (membership.role !== "owner" && membership.role !== "admin") {
        return reply.status(403).send({
          error: "Only group owner or admin can create announcements",
        });
      }

      // Create the announcement
      const [newAnnouncement] = await db
        .insert(announcements)
        .values({
          chatId,
          content: content.trim(),
          authorId: currentUserId,
        })
        .returning();

      return reply.status(201).send({
        announcement: {
          ...newAnnouncement,
          author: {
            id: request.user.id,
            displayName: request.user.displayName,
            avatarUrl: request.user.avatarUrl,
          },
        },
      });
    }
  );

  /**
   * PATCH /chats/:id/announcements/:announcementId - Update an announcement (admin/owner only)
   * Body: { content: string }
   * Returns: { announcement: { id, chatId, content, authorId, createdAt, author } }
   */
  fastify.patch<{ Params: { id: string; announcementId: string }; Body: { content: string } }>(
    "/chats/:id/announcements/:announcementId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: chatId, announcementId } = request.params;
      const { content } = request.body;

      // Validate UUID formats
      if (!UUID_REGEX.test(chatId)) {
        return reply.status(400).send({
          error: "Invalid chat ID format",
        });
      }

      if (!UUID_REGEX.test(announcementId)) {
        return reply.status(400).send({
          error: "Invalid announcement ID format",
        });
      }

      // Validate content
      if (!content || typeof content !== "string" || content.trim().length === 0) {
        return reply.status(400).send({
          error: "content is required and must be a non-empty string",
        });
      }

      if (content.length > 5000) {
        return reply.status(400).send({
          error: "content must be at most 5000 characters",
        });
      }

      const currentUserId = request.user.id;

      // Verify the announcement exists and belongs to this chat
      const [announcement] = await db
        .select()
        .from(announcements)
        .where(
          and(
            eq(announcements.id, announcementId),
            eq(announcements.chatId, chatId)
          )
        )
        .limit(1);

      if (!announcement) {
        return reply.status(404).send({
          error: "Announcement not found",
        });
      }

      // Get user's membership and role
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
          error: "Access denied - not a member of this chat",
        });
      }

      // Only owner and admin can edit announcements
      if (membership.role !== "owner" && membership.role !== "admin") {
        return reply.status(403).send({
          error: "Only group owner or admin can edit announcements",
        });
      }

      // Update the announcement
      const [updatedAnnouncement] = await db
        .update(announcements)
        .set({ content: content.trim() })
        .where(eq(announcements.id, announcementId))
        .returning();

      // Get author info
      const [author] = await db
        .select({
          id: users.id,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(eq(users.id, updatedAnnouncement.authorId))
        .limit(1);

      return reply.status(200).send({
        announcement: {
          ...updatedAnnouncement,
          author,
        },
      });
    }
  );

  /**
   * DELETE /chats/:id/announcements/:announcementId - Delete an announcement (admin/owner only)
   * Returns: { success: true }
   */
  fastify.delete<{ Params: { id: string; announcementId: string } }>(
    "/chats/:id/announcements/:announcementId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: chatId, announcementId } = request.params;

      // Validate UUID formats
      if (!UUID_REGEX.test(chatId)) {
        return reply.status(400).send({
          error: "Invalid chat ID format",
        });
      }

      if (!UUID_REGEX.test(announcementId)) {
        return reply.status(400).send({
          error: "Invalid announcement ID format",
        });
      }

      const currentUserId = request.user.id;

      // Verify the announcement exists and belongs to this chat
      const [announcement] = await db
        .select()
        .from(announcements)
        .where(
          and(
            eq(announcements.id, announcementId),
            eq(announcements.chatId, chatId)
          )
        )
        .limit(1);

      if (!announcement) {
        return reply.status(404).send({
          error: "Announcement not found",
        });
      }

      // Get user's membership and role
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
          error: "Access denied - not a member of this chat",
        });
      }

      // Only owner and admin can delete announcements
      if (membership.role !== "owner" && membership.role !== "admin") {
        return reply.status(403).send({
          error: "Only group owner or admin can delete announcements",
        });
      }

      // Delete the announcement
      await db
        .delete(announcements)
        .where(eq(announcements.id, announcementId));

      return reply.status(200).send({ success: true });
    }
  );
}
