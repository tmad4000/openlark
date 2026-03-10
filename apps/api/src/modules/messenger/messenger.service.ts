import { db } from "../../db/index.js";
import {
  chats,
  chatMembers,
  messages,
  messageReactions,
  messageReadReceipts,
  pins,
  favorites,
  type Chat,
  type Message,
  type ChatMember,
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
   * Get user's chats
   *
   * Returns all chats where the user is a member, regardless of org.
   * This supports external groups (FR-2.29) where users from different
   * orgs can be members of the same chat.
   */
  async getUserChats(userId: string, _orgId: string): Promise<Chat[]> {
    const result = await db
      .select({ chat: chats })
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

    return result.map((r) => r.chat);
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
   */
  async getMessages(
    chatId: string,
    pagination: PaginationInput
  ): Promise<Message[]> {
    const conditions = [eq(messages.chatId, chatId)];

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
}

export const messengerService = new MessengerService();
