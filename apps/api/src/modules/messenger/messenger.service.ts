import { db } from "../../db/index.js";
import {
  chats,
  chatMembers,
  messages,
  messageReactions,
  messageReadReceipts,
  pins,
  favorites,
  chatTabs,
  announcements,
  topics,
  topicSubscriptions,
  users,
  type Chat,
  type Message,
  type ChatMember,
  type ChatTab,
  type Announcement,
  type Topic,
} from "../../db/schema/index.js";
// Users table is imported via relations in messenger schema
import { eq, and, isNull, desc, lt, gt, inArray, sql } from "drizzle-orm";
import type {
  CreateChatInput,
  UpdateChatInput,
  AddMemberInput,
  UpdateMemberInput,
  SendMessageInput,
  EditMessageInput,
  PaginationInput,
  CreateChatTabInput,
  UpdateChatTabInput,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
  CreateTopicInput,
  UpdateTopicInput,
} from "./messenger.schemas.js";

// Constants
const MAX_EDIT_COUNT = 20;
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const RECALL_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export class MessengerService {
  // ============ CHAT OPERATIONS ============

  /**
   * Create a new chat (DM, group, etc.)
   * FR-2.1: Create 1:1 DM or group chat
   */
  async createChat(
    input: CreateChatInput,
    creatorId: string,
    orgId: string
  ): Promise<{ chat: Chat; members: ChatMember[] }> {
    // For DMs, check if one already exists between these users
    if (input.type === "dm") {
      const existingDm = await this.findExistingDm(
        creatorId,
        input.memberIds[0]!,
        orgId
      );
      if (existingDm) {
        const members = await this.getChatMembers(existingDm.id);
        return { chat: existingDm, members };
      }
    }

    // Create the chat
    const [chat] = await db
      .insert(chats)
      .values({
        orgId,
        type: input.type,
        name: input.type === "dm" ? null : input.name,
        avatarUrl: input.avatarUrl,
        isPublic: input.isPublic,
        maxMembers: input.maxMembers,
        createdBy: creatorId,
      })
      .returning();

    if (!chat) {
      throw new Error("Failed to create chat");
    }

    // Add creator as owner
    const memberValues = [
      {
        chatId: chat.id,
        userId: creatorId,
        role: "owner" as const,
      },
      // Add other members
      ...input.memberIds.map((userId) => ({
        chatId: chat.id,
        userId,
        role: "member" as const,
      })),
    ];

    const members = await db.insert(chatMembers).values(memberValues).returning();

    return { chat, members };
  }

  /**
   * Find existing DM between two users
   */
  private async findExistingDm(
    userId1: string,
    userId2: string,
    orgId: string
  ): Promise<Chat | null> {
    // Find DM chats where both users are members
    const result = await db
      .select({ chat: chats })
      .from(chats)
      .innerJoin(chatMembers, eq(chats.id, chatMembers.chatId))
      .where(
        and(
          eq(chats.orgId, orgId),
          eq(chats.type, "dm"),
          isNull(chats.deletedAt),
          isNull(chatMembers.leftAt),
          inArray(chatMembers.userId, [userId1, userId2])
        )
      )
      .groupBy(chats.id)
      .having(sql`COUNT(DISTINCT ${chatMembers.userId}) = 2`);

    return result[0]?.chat ?? null;
  }

  /**
   * Get chat by ID
   */
  async getChatById(chatId: string): Promise<Chat | null> {
    const [chat] = await db
      .select()
      .from(chats)
      .where(and(eq(chats.id, chatId), isNull(chats.deletedAt)))
      .limit(1);

    return chat ?? null;
  }

  /**
   * Get user's chats with member settings
   *
   * Returns all chats where the user is a member, regardless of org.
   * This supports external groups (FR-2.29) where users from different
   * orgs can be members of the same chat.
   * Includes per-user member settings (muted, done, pinned, label).
   */
  async getUserChats(userId: string, _orgId: string): Promise<(Chat & { memberSettings: { muted: boolean; done: boolean; pinned: boolean; label: string | null } })[]> {
    const result = await db
      .select({
        chat: chats,
        muted: chatMembers.muted,
        done: chatMembers.done,
        pinned: chatMembers.pinned,
        label: chatMembers.label,
      })
      .from(chats)
      .innerJoin(chatMembers, eq(chats.id, chatMembers.chatId))
      .where(
        and(
          eq(chatMembers.userId, userId),
          isNull(chatMembers.leftAt),
          isNull(chats.deletedAt)
        )
      )
      .orderBy(desc(chats.updatedAt));

    return result.map((r) => ({
      ...r.chat,
      memberSettings: {
        muted: r.muted,
        done: r.done,
        pinned: r.pinned,
        label: r.label,
      },
    }));
  }

  /**
   * Update chat settings
   */
  async updateChat(
    chatId: string,
    input: UpdateChatInput,
    userId: string
  ): Promise<Chat | null> {
    // Verify user has permission (owner or admin)
    const member = await this.getChatMember(chatId, userId);
    if (!member || (member.role !== "owner" && member.role !== "admin")) {
      return null;
    }

    const [updated] = await db
      .update(chats)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(and(eq(chats.id, chatId), isNull(chats.deletedAt)))
      .returning();

    return updated ?? null;
  }

  /**
   * Delete (soft) a chat
   */
  async deleteChat(chatId: string, userId: string): Promise<boolean> {
    // Only owner can delete
    const member = await this.getChatMember(chatId, userId);
    if (!member || member.role !== "owner") {
      return false;
    }

    const [deleted] = await db
      .update(chats)
      .set({ deletedAt: new Date() })
      .where(and(eq(chats.id, chatId), isNull(chats.deletedAt)))
      .returning();

    return !!deleted;
  }

  // ============ MEMBER OPERATIONS ============

  /**
   * Get chat members
   */
  async getChatMembers(chatId: string): Promise<ChatMember[]> {
    return db
      .select()
      .from(chatMembers)
      .where(and(eq(chatMembers.chatId, chatId), isNull(chatMembers.leftAt)));
  }

  /**
   * Get chat members with user info (displayName, avatarUrl)
   */
  async getChatMembersWithUserInfo(chatId: string): Promise<
    Array<ChatMember & { user: { displayName: string | null; avatarUrl: string | null } }>
  > {
    const result = await db
      .select({
        id: chatMembers.id,
        chatId: chatMembers.chatId,
        userId: chatMembers.userId,
        role: chatMembers.role,
        joinedAt: chatMembers.joinedAt,
        muted: chatMembers.muted,
        done: chatMembers.done,
        pinned: chatMembers.pinned,
        label: chatMembers.label,
        lastReadMessageId: chatMembers.lastReadMessageId,
        leftAt: chatMembers.leftAt,
        user: {
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(chatMembers)
      .innerJoin(users, eq(chatMembers.userId, users.id))
      .where(and(eq(chatMembers.chatId, chatId), isNull(chatMembers.leftAt)));

    return result;
  }

  /**
   * Get a specific chat member
   */
  async getChatMember(
    chatId: string,
    userId: string
  ): Promise<ChatMember | null> {
    const [member] = await db
      .select()
      .from(chatMembers)
      .where(
        and(
          eq(chatMembers.chatId, chatId),
          eq(chatMembers.userId, userId),
          isNull(chatMembers.leftAt)
        )
      )
      .limit(1);

    return member ?? null;
  }

  /**
   * Check if user is a member of a chat
   */
  async isChatMember(chatId: string, userId: string): Promise<boolean> {
    const member = await this.getChatMember(chatId, userId);
    return !!member;
  }

  /**
   * Add member to chat
   */
  async addMember(
    chatId: string,
    input: AddMemberInput,
    addedBy: string
  ): Promise<ChatMember | null> {
    // Check if adder has permission
    const adderMember = await this.getChatMember(chatId, addedBy);
    if (
      !adderMember ||
      (adderMember.role !== "owner" && adderMember.role !== "admin")
    ) {
      return null;
    }

    // Check if already a member
    const existing = await this.getChatMember(chatId, input.userId);
    if (existing) {
      return existing;
    }

    // Check max members
    const chat = await this.getChatById(chatId);
    if (!chat) {
      return null;
    }

    if (chat.maxMembers) {
      const currentMembers = await this.getChatMembers(chatId);
      if (currentMembers.length >= chat.maxMembers) {
        throw new Error("Chat has reached maximum member limit");
      }
    }

    const [member] = await db
      .insert(chatMembers)
      .values({
        chatId,
        userId: input.userId,
        role: input.role,
      })
      .returning();

    return member ?? null;
  }

  /**
   * Update member settings
   */
  async updateMember(
    chatId: string,
    targetUserId: string,
    input: UpdateMemberInput,
    updatedBy: string
  ): Promise<ChatMember | null> {
    const updater = await this.getChatMember(chatId, updatedBy);
    const target = await this.getChatMember(chatId, targetUserId);

    if (!updater || !target) {
      return null;
    }

    // Users can update their own muted/label settings
    // Only owner/admin can update roles
    const isSelf = updatedBy === targetUserId;
    const isPrivileged = updater.role === "owner" || updater.role === "admin";

    if (input.role !== undefined && !isPrivileged) {
      return null;
    }

    if (!isSelf && !isPrivileged) {
      return null;
    }

    // Owner can't be demoted
    if (target.role === "owner" && input.role && input.role !== "owner") {
      return null;
    }

    const [updated] = await db
      .update(chatMembers)
      .set(input)
      .where(
        and(
          eq(chatMembers.chatId, chatId),
          eq(chatMembers.userId, targetUserId),
          isNull(chatMembers.leftAt)
        )
      )
      .returning();

    return updated ?? null;
  }

  /**
   * Remove member from chat (leave or kick)
   */
  async removeMember(
    chatId: string,
    targetUserId: string,
    removedBy: string
  ): Promise<boolean> {
    const remover = await this.getChatMember(chatId, removedBy);
    const target = await this.getChatMember(chatId, targetUserId);

    if (!remover || !target) {
      return false;
    }

    const isSelf = removedBy === targetUserId;
    const isPrivileged = remover.role === "owner" || remover.role === "admin";

    // Can't remove owner unless they're leaving themselves
    if (target.role === "owner" && !isSelf) {
      return false;
    }

    // Must have permission to kick others
    if (!isSelf && !isPrivileged) {
      return false;
    }

    // Admin can't kick another admin
    if (!isSelf && remover.role === "admin" && target.role === "admin") {
      return false;
    }

    await db
      .update(chatMembers)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(chatMembers.chatId, chatId),
          eq(chatMembers.userId, targetUserId),
          isNull(chatMembers.leftAt)
        )
      );

    return true;
  }

  // ============ MESSAGE OPERATIONS ============

  /**
   * Send a message
   * FR-2.2: Send text messages with rich formatting
   */
  async sendMessage(
    chatId: string,
    input: SendMessageInput,
    senderId: string
  ): Promise<Message | null> {
    // Verify sender is a member
    const isMember = await this.isChatMember(chatId, senderId);
    if (!isMember) {
      return null;
    }

    // Build content JSON
    const contentJson =
      typeof input.content === "string"
        ? { text: input.content }
        : input.content;

    const [message] = await db
      .insert(messages)
      .values({
        chatId,
        senderId,
        type: input.type,
        contentJson,
        threadId: input.threadId,
        topicId: input.topicId,
        replyToId: input.replyToId,
        scheduledFor: input.scheduledFor
          ? new Date(input.scheduledFor)
          : undefined,
      })
      .returning();

    if (!message) {
      throw new Error("Failed to send message");
    }

    // Update chat's updatedAt
    await db
      .update(chats)
      .set({ updatedAt: new Date() })
      .where(eq(chats.id, chatId));

    return message;
  }

  /**
   * Get messages in a chat with pagination
   * Excludes thread replies (messages with threadId) from the main timeline.
   * Includes replyCount for parent messages that have thread replies.
   */
  async getMessages(
    chatId: string,
    pagination: PaginationInput
  ): Promise<(Message & { replyCount?: number })[]> {
    const conditions = [
      eq(messages.chatId, chatId),
      isNull(messages.threadId), // Exclude thread replies from main timeline
    ];

    if (pagination.before) {
      const beforeMsg = await this.getMessageById(pagination.before);
      if (beforeMsg) {
        conditions.push(lt(messages.createdAt, beforeMsg.createdAt));
      }
    }

    if (pagination.after) {
      const afterMsg = await this.getMessageById(pagination.after);
      if (afterMsg) {
        conditions.push(gt(messages.createdAt, afterMsg.createdAt));
      }
    }

    const mainMessages = await db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(pagination.limit);

    if (mainMessages.length === 0) return mainMessages;

    // Get reply counts for these messages
    const msgIds = mainMessages.map((m) => m.id);
    const replyCounts = await db
      .select({
        threadId: messages.threadId,
        count: sql<number>`count(*)::int`,
      })
      .from(messages)
      .where(inArray(messages.threadId, msgIds))
      .groupBy(messages.threadId);

    const replyCountMap = new Map<string, number>();
    for (const rc of replyCounts) {
      if (rc.threadId) replyCountMap.set(rc.threadId, rc.count);
    }

    return mainMessages.map((m) => ({
      ...m,
      replyCount: replyCountMap.get(m.id) || 0,
    }));
  }

  /**
   * Get thread replies for a parent message
   * FR-2.5: Message threading
   */
  async getThreadReplies(
    parentMessageId: string
  ): Promise<{ parentMessage: Message; replies: Message[] } | null> {
    const parent = await this.getMessageById(parentMessageId);
    if (!parent) return null;

    const replies = await db
      .select()
      .from(messages)
      .where(eq(messages.threadId, parentMessageId))
      .orderBy(messages.createdAt); // chronological order for threads

    return { parentMessage: parent, replies };
  }

  /**
   * Get a single message by ID
   */
  async getMessageById(messageId: string): Promise<Message | null> {
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    return message ?? null;
  }

  /**
   * Edit a message
   * FR-2.11: Edit sent messages within 24 hours (up to 20 edits)
   */
  async editMessage(
    messageId: string,
    input: EditMessageInput,
    userId: string
  ): Promise<Message | null> {
    const message = await this.getMessageById(messageId);
    if (!message) {
      return null;
    }

    // Only sender can edit
    if (message.senderId !== userId) {
      return null;
    }

    // Check edit window
    const messageAge = Date.now() - message.createdAt.getTime();
    if (messageAge > EDIT_WINDOW_MS) {
      throw new Error("Message can only be edited within 24 hours");
    }

    // Check edit count
    if (message.editCount >= MAX_EDIT_COUNT) {
      throw new Error("Maximum edit count reached");
    }

    // Can't edit recalled messages
    if (message.recalledAt) {
      return null;
    }

    const contentJson =
      typeof input.content === "string"
        ? { text: input.content }
        : input.content;

    const [updated] = await db
      .update(messages)
      .set({
        contentJson,
        editedAt: new Date(),
        editCount: message.editCount + 1,
      })
      .where(eq(messages.id, messageId))
      .returning();

    return updated ?? null;
  }

  /**
   * Recall (unsend) a message
   * FR-2.12: Recall messages within 24 hours
   */
  async recallMessage(
    messageId: string,
    userId: string,
    chatId: string
  ): Promise<boolean> {
    const message = await this.getMessageById(messageId);
    if (!message || message.chatId !== chatId) {
      return false;
    }

    // Already recalled
    if (message.recalledAt) {
      return false;
    }

    // Sender can recall their own messages
    // Owner/admin can recall any message in the chat
    const isSender = message.senderId === userId;
    let canRecall = isSender;

    if (!isSender) {
      const member = await this.getChatMember(chatId, userId);
      canRecall = !!member && (member.role === "owner" || member.role === "admin");
    }

    if (!canRecall) {
      return false;
    }

    // Check recall window (only for non-privileged users)
    if (isSender) {
      const messageAge = Date.now() - message.createdAt.getTime();
      if (messageAge > RECALL_WINDOW_MS) {
        throw new Error("Message can only be recalled within 24 hours");
      }
    }

    await db
      .update(messages)
      .set({ recalledAt: new Date() })
      .where(eq(messages.id, messageId));

    return true;
  }

  // ============ FORWARD OPERATIONS ============

  /**
   * Forward a message to one or more chats
   * Creates copies of the message with forwarded attribution
   */
  async forwardMessage(
    messageId: string,
    chatIds: string[],
    userId: string
  ): Promise<Message[]> {
    const original = await this.getMessageById(messageId);
    if (!original) {
      throw new Error("Message not found");
    }

    // Verify user can see the original message (is member of source chat)
    const isMemberOfSource = await this.isChatMember(original.chatId, userId);
    if (!isMemberOfSource) {
      throw new Error("Not a member of the source chat");
    }

    // Get source chat name for attribution
    const [sourceChat] = await db
      .select({ name: chats.name })
      .from(chats)
      .where(eq(chats.id, original.chatId))
      .limit(1);

    // Get original sender name
    const [originalSender] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, original.senderId))
      .limit(1);

    const originalContent = original.contentJson as Record<string, unknown>;

    const forwarded: Message[] = [];
    for (const chatId of chatIds) {
      // Verify user is a member of each destination chat
      const isMember = await this.isChatMember(chatId, userId);
      if (!isMember) {
        continue; // Skip chats user is not a member of
      }

      const forwardedContent = {
        ...originalContent,
        forwarded: {
          originalMessageId: original.id,
          originalSenderId: original.senderId,
          originalSenderName: originalSender?.displayName || "Unknown",
          originalChatId: original.chatId,
          originalChatName: sourceChat?.name || "Direct Message",
          originalCreatedAt: original.createdAt,
        },
      };

      const [msg] = await db
        .insert(messages)
        .values({
          chatId,
          senderId: userId,
          type: original.type,
          contentJson: forwardedContent,
        })
        .returning();

      if (msg) {
        forwarded.push(msg);
        // Update chat's updatedAt
        await db
          .update(chats)
          .set({ updatedAt: new Date() })
          .where(eq(chats.id, chatId));
      }
    }

    return forwarded;
  }

  // ============ REACTION OPERATIONS ============

  /**
   * Add reaction to a message
   * FR-2.7: Emoji reactions on messages
   */
  async addReaction(
    messageId: string,
    emoji: string,
    userId: string
  ): Promise<boolean> {
    const message = await this.getMessageById(messageId);
    if (!message) {
      return false;
    }

    // Verify user is a member of the chat
    const isMember = await this.isChatMember(message.chatId, userId);
    if (!isMember) {
      return false;
    }

    try {
      await db.insert(messageReactions).values({
        messageId,
        userId,
        emoji,
      });
      return true;
    } catch {
      // Unique constraint violation = already reacted
      return false;
    }
  }

  /**
   * Remove reaction from a message
   */
  async removeReaction(
    messageId: string,
    emoji: string,
    userId: string
  ): Promise<boolean> {
    const result = await db
      .delete(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, messageId),
          eq(messageReactions.userId, userId),
          eq(messageReactions.emoji, emoji)
        )
      )
      .returning();

    return result.length > 0;
  }

  /**
   * Get reactions for a message
   */
  async getMessageReactions(messageId: string) {
    return db
      .select()
      .from(messageReactions)
      .where(eq(messageReactions.messageId, messageId));
  }

  // ============ READ RECEIPT OPERATIONS ============

  /**
   * Mark message as read
   * FR-2.8: Read receipts
   */
  async markAsRead(messageId: string, userId: string): Promise<boolean> {
    const message = await this.getMessageById(messageId);
    if (!message) {
      return false;
    }

    // Verify user is a member of the chat
    const isMember = await this.isChatMember(message.chatId, userId);
    if (!isMember) {
      return false;
    }

    try {
      await db.insert(messageReadReceipts).values({
        messageId,
        userId,
      });

      // Update last_read_message_id on chat member
      await db
        .update(chatMembers)
        .set({ lastReadMessageId: messageId })
        .where(
          and(
            eq(chatMembers.chatId, message.chatId),
            eq(chatMembers.userId, userId)
          )
        );

      return true;
    } catch {
      // Already read
      return false;
    }
  }

  /**
   * Get read receipts for a message
   */
  async getReadReceipts(messageId: string) {
    return db
      .select({
        userId: messageReadReceipts.userId,
        readAt: messageReadReceipts.readAt,
      })
      .from(messageReadReceipts)
      .where(eq(messageReadReceipts.messageId, messageId));
  }

  /**
   * Mark chat as read up to a given message (batch insert read receipts)
   * FR-2.8: Batch read receipts for all messages between old and new position
   */
  async markChatAsRead(
    chatId: string,
    lastMessageId: string,
    userId: string
  ): Promise<{ readCount: number }> {
    // Verify user is a member
    const member = await this.getChatMember(chatId, userId);
    if (!member) {
      return { readCount: 0 };
    }

    // Verify the target message exists and belongs to this chat
    const targetMessage = await this.getMessageById(lastMessageId);
    if (!targetMessage || targetMessage.chatId !== chatId) {
      return { readCount: 0 };
    }

    // Get all messages in this chat up to and including lastMessageId
    // that the user hasn't read yet, excluding own messages
    const oldReadPosition = member.lastReadMessageId;

    // Build conditions: messages in this chat, up to target, not sent by user
    const conditions = [
      eq(messages.chatId, chatId),
      sql`${messages.senderId} != ${userId}`,
      sql`${messages.createdAt} <= ${targetMessage.createdAt}`,
    ];

    // If user had a previous read position, only insert receipts for messages after that
    if (oldReadPosition) {
      const oldMsg = await this.getMessageById(oldReadPosition);
      if (oldMsg) {
        conditions.push(gt(messages.createdAt, oldMsg.createdAt));
      }
    }

    // Get unread message IDs
    const unreadMessages = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(...conditions));

    if (unreadMessages.length > 0) {
      // Batch insert read receipts (ignore conflicts for already-read messages)
      await db
        .insert(messageReadReceipts)
        .values(unreadMessages.map((m) => ({ messageId: m.id, userId })))
        .onConflictDoNothing();
    }

    // Update lastReadMessageId on chat member
    await db
      .update(chatMembers)
      .set({ lastReadMessageId: lastMessageId })
      .where(
        and(
          eq(chatMembers.chatId, chatId),
          eq(chatMembers.userId, userId),
          isNull(chatMembers.leftAt)
        )
      );

    return { readCount: unreadMessages.length };
  }

  /**
   * Get read status for multiple messages in a chat (batch query)
   * Returns read count and total member count for each message
   */
  async getMessagesReadStatus(
    messageIds: string[],
    chatId: string
  ): Promise<
    Array<{
      messageId: string;
      readBy: Array<{ userId: string; readAt: Date }>;
    }>
  > {
    if (messageIds.length === 0) return [];

    const receipts = await db
      .select({
        messageId: messageReadReceipts.messageId,
        userId: messageReadReceipts.userId,
        readAt: messageReadReceipts.readAt,
      })
      .from(messageReadReceipts)
      .where(inArray(messageReadReceipts.messageId, messageIds));

    // Group by messageId
    const receiptMap = new Map<
      string,
      Array<{ userId: string; readAt: Date }>
    >();
    for (const r of receipts) {
      if (!receiptMap.has(r.messageId)) {
        receiptMap.set(r.messageId, []);
      }
      receiptMap.get(r.messageId)!.push({ userId: r.userId, readAt: r.readAt });
    }

    return messageIds.map((id) => ({
      messageId: id,
      readBy: receiptMap.get(id) || [],
    }));
  }

  // ============ PIN OPERATIONS ============

  /**
   * Pin a message
   * FR-2.13: Pin messages to chat
   */
  async pinMessage(
    chatId: string,
    messageId: string,
    userId: string
  ): Promise<boolean> {
    // Check permission (owner/admin only)
    const member = await this.getChatMember(chatId, userId);
    if (!member || (member.role !== "owner" && member.role !== "admin")) {
      return false;
    }

    // Verify message belongs to this chat
    const message = await this.getMessageById(messageId);
    if (!message || message.chatId !== chatId) {
      return false;
    }

    try {
      await db.insert(pins).values({
        chatId,
        messageId,
        pinnedBy: userId,
      });
      return true;
    } catch {
      // Already pinned
      return false;
    }
  }

  /**
   * Unpin a message
   */
  async unpinMessage(
    chatId: string,
    messageId: string,
    userId: string
  ): Promise<boolean> {
    // Check permission
    const member = await this.getChatMember(chatId, userId);
    if (!member || (member.role !== "owner" && member.role !== "admin")) {
      return false;
    }

    const result = await db
      .delete(pins)
      .where(and(eq(pins.chatId, chatId), eq(pins.messageId, messageId)))
      .returning();

    return result.length > 0;
  }

  /**
   * Get pinned messages in a chat
   */
  async getPinnedMessages(chatId: string) {
    return db
      .select({
        pin: pins,
        message: messages,
      })
      .from(pins)
      .innerJoin(messages, eq(pins.messageId, messages.id))
      .where(eq(pins.chatId, chatId))
      .orderBy(desc(pins.pinnedAt));
  }

  // ============ FAVORITE OPERATIONS ============

  /**
   * Favorite a message
   * FR-2.14: Favorite/bookmark messages (personal)
   */
  async favoriteMessage(messageId: string, userId: string): Promise<boolean> {
    const message = await this.getMessageById(messageId);
    if (!message) {
      return false;
    }

    // Verify user is a member of the chat
    const isMember = await this.isChatMember(message.chatId, userId);
    if (!isMember) {
      return false;
    }

    try {
      await db.insert(favorites).values({
        userId,
        messageId,
      });
      return true;
    } catch {
      // Already favorited
      return false;
    }
  }

  /**
   * Unfavorite a message
   */
  async unfavoriteMessage(messageId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(favorites)
      .where(
        and(eq(favorites.messageId, messageId), eq(favorites.userId, userId))
      )
      .returning();

    return result.length > 0;
  }

  /**
   * Get user's favorited messages
   */
  async getUserFavorites(userId: string) {
    return db
      .select({
        favorite: favorites,
        message: messages,
      })
      .from(favorites)
      .innerJoin(messages, eq(favorites.messageId, messages.id))
      .where(eq(favorites.userId, userId))
      .orderBy(desc(favorites.createdAt));
  }

  // ============ CHAT TAB OPERATIONS ============

  /**
   * Get chat tabs
   * FR-2.15: Auto-generated and custom tabs
   */
  async getChatTabs(chatId: string): Promise<ChatTab[]> {
    return db
      .select()
      .from(chatTabs)
      .where(eq(chatTabs.chatId, chatId))
      .orderBy(chatTabs.position);
  }

  /**
   * Create a custom chat tab
   * FR-2.16: Custom chat tabs (max 20 per chat)
   */
  async createChatTab(
    chatId: string,
    input: CreateChatTabInput,
    userId: string
  ): Promise<ChatTab | null> {
    // Check permission (owner/admin only)
    const member = await this.getChatMember(chatId, userId);
    if (!member || (member.role !== "owner" && member.role !== "admin")) {
      return null;
    }

    // Check tab limit (max 20 custom tabs per chat)
    const existingTabs = await this.getChatTabs(chatId);
    const customTabs = existingTabs.filter((tab) => tab.type === "custom");
    if (customTabs.length >= 20) {
      throw new Error("Maximum of 20 custom tabs per chat");
    }

    // Get next position
    const maxPosition = existingTabs.length > 0
      ? Math.max(...existingTabs.map((t) => t.position))
      : -1;

    const [tab] = await db
      .insert(chatTabs)
      .values({
        chatId,
        type: "custom",
        name: input.name,
        url: input.url,
        position: maxPosition + 1,
        createdBy: userId,
      })
      .returning();

    return tab ?? null;
  }

  /**
   * Update a chat tab
   */
  async updateChatTab(
    tabId: string,
    input: UpdateChatTabInput,
    userId: string
  ): Promise<ChatTab | null> {
    // Get the tab first
    const [tab] = await db
      .select()
      .from(chatTabs)
      .where(eq(chatTabs.id, tabId))
      .limit(1);

    if (!tab) {
      return null;
    }

    // Only custom tabs can be updated
    if (tab.type !== "custom") {
      return null;
    }

    // Check permission
    const member = await this.getChatMember(tab.chatId, userId);
    if (!member || (member.role !== "owner" && member.role !== "admin")) {
      return null;
    }

    const [updated] = await db
      .update(chatTabs)
      .set(input)
      .where(eq(chatTabs.id, tabId))
      .returning();

    return updated ?? null;
  }

  /**
   * Delete a chat tab
   */
  async deleteChatTab(tabId: string, userId: string): Promise<boolean> {
    // Get the tab first
    const [tab] = await db
      .select()
      .from(chatTabs)
      .where(eq(chatTabs.id, tabId))
      .limit(1);

    if (!tab) {
      return false;
    }

    // Only custom tabs can be deleted
    if (tab.type !== "custom") {
      return false;
    }

    // Check permission
    const member = await this.getChatMember(tab.chatId, userId);
    if (!member || (member.role !== "owner" && member.role !== "admin")) {
      return false;
    }

    const result = await db
      .delete(chatTabs)
      .where(eq(chatTabs.id, tabId))
      .returning();

    return result.length > 0;
  }

  // ============ ANNOUNCEMENT OPERATIONS ============

  /**
   * Get chat announcements
   * FR-2.18: Group announcements
   */
  async getAnnouncements(chatId: string): Promise<Announcement[]> {
    return db
      .select()
      .from(announcements)
      .where(eq(announcements.chatId, chatId))
      .orderBy(desc(announcements.createdAt));
  }

  /**
   * Create an announcement
   * FR-2.18: Owner/admin posts announcement
   */
  async createAnnouncement(
    chatId: string,
    input: CreateAnnouncementInput,
    userId: string
  ): Promise<Announcement | null> {
    // Check permission (owner/admin only)
    const member = await this.getChatMember(chatId, userId);
    if (!member || (member.role !== "owner" && member.role !== "admin")) {
      return null;
    }

    const [announcement] = await db
      .insert(announcements)
      .values({
        chatId,
        content: input.content,
        authorId: userId,
      })
      .returning();

    return announcement ?? null;
  }

  /**
   * Update an announcement
   */
  async updateAnnouncement(
    announcementId: string,
    input: UpdateAnnouncementInput,
    userId: string
  ): Promise<Announcement | null> {
    // Get the announcement first
    const [announcement] = await db
      .select()
      .from(announcements)
      .where(eq(announcements.id, announcementId))
      .limit(1);

    if (!announcement) {
      return null;
    }

    // Check permission (owner/admin or author)
    const member = await this.getChatMember(announcement.chatId, userId);
    const isAuthor = announcement.authorId === userId;
    const isPrivileged = member && (member.role === "owner" || member.role === "admin");

    if (!isAuthor && !isPrivileged) {
      return null;
    }

    const [updated] = await db
      .update(announcements)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(announcements.id, announcementId))
      .returning();

    return updated ?? null;
  }

  /**
   * Delete an announcement
   */
  async deleteAnnouncement(
    announcementId: string,
    userId: string
  ): Promise<boolean> {
    // Get the announcement first
    const [announcement] = await db
      .select()
      .from(announcements)
      .where(eq(announcements.id, announcementId))
      .limit(1);

    if (!announcement) {
      return false;
    }

    // Check permission (owner/admin or author)
    const member = await this.getChatMember(announcement.chatId, userId);
    const isAuthor = announcement.authorId === userId;
    const isPrivileged = member && (member.role === "owner" || member.role === "admin");

    if (!isAuthor && !isPrivileged) {
      return false;
    }

    const result = await db
      .delete(announcements)
      .where(eq(announcements.id, announcementId))
      .returning();

    return result.length > 0;
  }
  // ============ TOPIC OPERATIONS ============

  /**
   * Create a topic in a topic_group chat
   */
  async createTopic(
    chatId: string,
    input: CreateTopicInput,
    userId: string
  ): Promise<{ topic: Topic; message: Message } | null> {
    // Verify user is a member
    const isMember = await this.isChatMember(chatId, userId);
    if (!isMember) return null;

    // Verify chat is a topic_group
    const chat = await this.getChatById(chatId);
    if (!chat || chat.type !== "topic_group") return null;

    // Create the topic
    const [topic] = await db
      .insert(topics)
      .values({
        chatId,
        title: input.title,
        creatorId: userId,
      })
      .returning();

    if (!topic) throw new Error("Failed to create topic");

    // Subscribe the creator
    await db.insert(topicSubscriptions).values({
      topicId: topic.id,
      userId,
    });

    // Create the initial message in this topic
    const [message] = await db
      .insert(messages)
      .values({
        chatId,
        senderId: userId,
        type: "text",
        contentJson: { text: input.initialMessage },
        topicId: topic.id,
      })
      .returning();

    if (!message) throw new Error("Failed to create initial message");

    // Update chat's updatedAt
    await db
      .update(chats)
      .set({ updatedAt: new Date() })
      .where(eq(chats.id, chatId));

    return { topic, message };
  }

  /**
   * Get topics for a topic_group chat (open first, then closed)
   */
  async getTopics(
    chatId: string
  ): Promise<(Topic & { messageCount: number })[]> {
    const allTopics = await db
      .select()
      .from(topics)
      .where(eq(topics.chatId, chatId))
      .orderBy(
        sql`CASE WHEN ${topics.status} = 'open' THEN 0 ELSE 1 END`,
        desc(topics.createdAt)
      );

    if (allTopics.length === 0) return [];

    // Get message counts for each topic
    const topicIds = allTopics.map((t) => t.id);
    const counts = await db
      .select({
        topicId: messages.topicId,
        count: sql<number>`count(*)::int`,
      })
      .from(messages)
      .where(inArray(messages.topicId, topicIds))
      .groupBy(messages.topicId);

    const countMap = new Map<string, number>();
    for (const c of counts) {
      if (c.topicId) countMap.set(c.topicId, c.count);
    }

    return allTopics.map((t) => ({
      ...t,
      messageCount: countMap.get(t.id) || 0,
    }));
  }

  /**
   * Get messages for a specific topic
   */
  async getTopicMessages(
    topicId: string,
    pagination: PaginationInput
  ): Promise<Message[]> {
    const conditions = [eq(messages.topicId, topicId)];

    if (pagination.before) {
      const beforeMsg = await this.getMessageById(pagination.before);
      if (beforeMsg) {
        conditions.push(lt(messages.createdAt, beforeMsg.createdAt));
      }
    }

    if (pagination.after) {
      const afterMsg = await this.getMessageById(pagination.after);
      if (afterMsg) {
        conditions.push(gt(messages.createdAt, afterMsg.createdAt));
      }
    }

    return db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(pagination.limit);
  }

  /**
   * Update a topic (close/reopen)
   */
  async updateTopic(
    topicId: string,
    input: UpdateTopicInput,
    userId: string
  ): Promise<Topic | null> {
    const [topic] = await db
      .select()
      .from(topics)
      .where(eq(topics.id, topicId))
      .limit(1);

    if (!topic) return null;

    // Check permission: creator, owner, or admin
    const member = await this.getChatMember(topic.chatId, userId);
    if (!member) return null;

    const isCreator = topic.creatorId === userId;
    const isPrivileged = member.role === "owner" || member.role === "admin";
    if (!isCreator && !isPrivileged) return null;

    const [updated] = await db
      .update(topics)
      .set(input)
      .where(eq(topics.id, topicId))
      .returning();

    return updated ?? null;
  }

  /**
   * Get a single topic by ID
   */
  async getTopicById(topicId: string): Promise<Topic | null> {
    const [topic] = await db
      .select()
      .from(topics)
      .where(eq(topics.id, topicId))
      .limit(1);

    return topic ?? null;
  }

  // ============ TOPIC SUBSCRIPTION OPERATIONS ============

  /**
   * Subscribe a user to a topic
   */
  async subscribeTopic(topicId: string, userId: string): Promise<boolean> {
    // Verify topic exists
    const topic = await this.getTopicById(topicId);
    if (!topic) return false;

    // Verify user is a member of the topic's chat
    const isMember = await this.isChatMember(topic.chatId, userId);
    if (!isMember) return false;

    try {
      await db.insert(topicSubscriptions).values({ topicId, userId });
      return true;
    } catch {
      // Already subscribed (unique constraint)
      return false;
    }
  }

  /**
   * Unsubscribe a user from a topic
   */
  async unsubscribeTopic(topicId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(topicSubscriptions)
      .where(
        and(
          eq(topicSubscriptions.topicId, topicId),
          eq(topicSubscriptions.userId, userId)
        )
      )
      .returning();

    return result.length > 0;
  }

  /**
   * Check if a user is subscribed to a topic
   */
  async isSubscribedToTopic(topicId: string, userId: string): Promise<boolean> {
    const [sub] = await db
      .select()
      .from(topicSubscriptions)
      .where(
        and(
          eq(topicSubscriptions.topicId, topicId),
          eq(topicSubscriptions.userId, userId)
        )
      )
      .limit(1);

    return !!sub;
  }

  /**
   * Get all topics a user is subscribed to (across all topic groups)
   */
  async getSubscribedTopics(
    userId: string
  ): Promise<(Topic & { messageCount: number })[]> {
    const subs = await db
      .select({ topicId: topicSubscriptions.topicId })
      .from(topicSubscriptions)
      .where(eq(topicSubscriptions.userId, userId));

    if (subs.length === 0) return [];

    const topicIds = subs.map((s) => s.topicId);

    const subscribedTopics = await db
      .select()
      .from(topics)
      .where(inArray(topics.id, topicIds))
      .orderBy(
        sql`CASE WHEN ${topics.status} = 'open' THEN 0 ELSE 1 END`,
        desc(topics.createdAt)
      );

    if (subscribedTopics.length === 0) return [];

    // Get message counts
    const counts = await db
      .select({
        topicId: messages.topicId,
        count: sql<number>`count(*)::int`,
      })
      .from(messages)
      .where(inArray(messages.topicId, topicIds))
      .groupBy(messages.topicId);

    const countMap = new Map<string, number>();
    for (const c of counts) {
      if (c.topicId) countMap.set(c.topicId, c.count);
    }

    return subscribedTopics.map((t) => ({
      ...t,
      messageCount: countMap.get(t.id) || 0,
    }));
  }

  /**
   * Get subscription status for multiple topics for a user
   */
  async getTopicSubscriptionStatuses(
    topicIds: string[],
    userId: string
  ): Promise<Set<string>> {
    if (topicIds.length === 0) return new Set();

    const subs = await db
      .select({ topicId: topicSubscriptions.topicId })
      .from(topicSubscriptions)
      .where(
        and(
          inArray(topicSubscriptions.topicId, topicIds),
          eq(topicSubscriptions.userId, userId)
        )
      );

    return new Set(subs.map((s) => s.topicId));
  }

  /**
   * Auto-subscribe user to a topic (silently, no error on duplicate)
   */
  async autoSubscribeTopic(topicId: string, userId: string): Promise<void> {
    try {
      await db
        .insert(topicSubscriptions)
        .values({ topicId, userId })
        .onConflictDoNothing();
    } catch {
      // ignore
    }
  }
}

export const messengerService = new MessengerService();
