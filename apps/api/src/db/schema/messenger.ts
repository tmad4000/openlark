import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  pgEnum,
  boolean,
  index,
  uniqueIndex,
  integer,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users, organizations } from "./auth";

// Enums
export const chatTypeEnum = pgEnum("chat_type", [
  "dm",
  "group",
  "topic_group",
  "supergroup",
  "meeting",
]);

export const chatMemberRoleEnum = pgEnum("chat_member_role", [
  "owner",
  "admin",
  "member",
]);

export const messageTypeEnum = pgEnum("message_type", [
  "text",
  "rich_text",
  "code",
  "voice",
  "card",
  "system",
]);

export const topicStatusEnum = pgEnum("topic_status", ["open", "closed"]);

// Chat tab types: auto-generated tabs (Chat, Docs, Files, Pins, Announcements) or custom user-added tabs
export const chatTabTypeEnum = pgEnum("chat_tab_type", ["auto", "custom"]);

// Chats table
export const chats = pgTable(
  "chats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    type: chatTypeEnum("type").notNull().default("group"),
    name: varchar("name", { length: 255 }),
    avatarUrl: text("avatar_url"),
    isPublic: boolean("is_public").notNull().default(false),
    maxMembers: integer("max_members"),
    settingsJson: jsonb("settings_json").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
  },
  (table) => [
    index("chats_org_id_idx").on(table.orgId),
    index("chats_type_idx").on(table.type),
    index("chats_is_public_idx")
      .on(table.isPublic)
      .where(sql`${table.deletedAt} IS NULL`),
  ]
);

// Chat members (join table)
export const chatMembers = pgTable(
  "chat_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: chatMemberRoleEnum("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    muted: boolean("muted").notNull().default(false),
    label: varchar("label", { length: 100 }),
    lastReadMessageId: uuid("last_read_message_id"),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("chat_members_unique_idx")
      .on(table.chatId, table.userId)
      .where(sql`${table.leftAt} IS NULL`),
    index("chat_members_user_id_idx").on(table.userId),
    index("chat_members_chat_id_idx").on(table.chatId),
  ]
);

// Messages table
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id),
    type: messageTypeEnum("type").notNull().default("text"),
    contentJson: jsonb("content_json").notNull().default({}),
    threadId: uuid("thread_id"),
    replyToId: uuid("reply_to_id"),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    editCount: integer("edit_count").notNull().default(0),
    recalledAt: timestamp("recalled_at", { withTimezone: true }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("messages_chat_id_idx").on(table.chatId),
    index("messages_sender_id_idx").on(table.senderId),
    index("messages_thread_id_idx").on(table.threadId),
    index("messages_created_at_idx").on(table.createdAt),
    // Composite index for chat timeline queries
    index("messages_chat_created_idx").on(table.chatId, table.createdAt),
  ]
);

// Message reactions
export const messageReactions = pgTable(
  "message_reactions",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    emoji: varchar("emoji", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("message_reactions_unique_idx").on(
      table.messageId,
      table.userId,
      table.emoji
    ),
    index("message_reactions_message_id_idx").on(table.messageId),
  ]
);

// Message read receipts
export const messageReadReceipts = pgTable(
  "message_read_receipts",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("message_read_receipts_unique_idx").on(
      table.messageId,
      table.userId
    ),
    index("message_read_receipts_message_id_idx").on(table.messageId),
  ]
);

// Pins
export const pins = pgTable(
  "pins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    pinnedBy: uuid("pinned_by")
      .notNull()
      .references(() => users.id),
    pinnedAt: timestamp("pinned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("pins_unique_idx").on(table.chatId, table.messageId),
    index("pins_chat_id_idx").on(table.chatId),
  ]
);

// Favorites (personal bookmarks)
export const favorites = pgTable(
  "favorites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("favorites_unique_idx").on(table.userId, table.messageId),
    index("favorites_user_id_idx").on(table.userId),
  ]
);

// Chat tabs - FR-2.15, FR-2.16
// Auto-generated tabs (Chat, Docs, Files, Pins, Announcements) and custom user tabs
export const chatTabs = pgTable(
  "chat_tabs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    type: chatTabTypeEnum("type").notNull().default("custom"),
    name: varchar("name", { length: 100 }).notNull(),
    url: text("url"), // For custom tabs - external link
    position: integer("position").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("chat_tabs_chat_id_idx").on(table.chatId),
    uniqueIndex("chat_tabs_chat_name_idx").on(table.chatId, table.name),
  ]
);

// Announcements - FR-2.18
// Group announcements displayed prominently, posted by owner/admin
export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    isPinned: boolean("is_pinned").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("announcements_chat_id_idx").on(table.chatId),
    index("announcements_created_at_idx").on(table.chatId, table.createdAt),
  ]
);

// Relations
export const chatsRelations = relations(chats, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [chats.orgId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [chats.createdBy],
    references: [users.id],
  }),
  members: many(chatMembers),
  messages: many(messages),
  pins: many(pins),
  tabs: many(chatTabs),
  announcements: many(announcements),
}));

export const chatMembersRelations = relations(chatMembers, ({ one }) => ({
  chat: one(chats, {
    fields: [chatMembers.chatId],
    references: [chats.id],
  }),
  user: one(users, {
    fields: [chatMembers.userId],
    references: [users.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  chat: one(chats, {
    fields: [messages.chatId],
    references: [chats.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
  thread: one(messages, {
    fields: [messages.threadId],
    references: [messages.id],
    relationName: "messageThread",
  }),
  replies: many(messages, { relationName: "messageThread" }),
  replyTo: one(messages, {
    fields: [messages.replyToId],
    references: [messages.id],
    relationName: "messageReply",
  }),
  reactions: many(messageReactions),
  readReceipts: many(messageReadReceipts),
  pin: one(pins, {
    fields: [messages.id],
    references: [pins.messageId],
  }),
}));

export const messageReactionsRelations = relations(
  messageReactions,
  ({ one }) => ({
    message: one(messages, {
      fields: [messageReactions.messageId],
      references: [messages.id],
    }),
    user: one(users, {
      fields: [messageReactions.userId],
      references: [users.id],
    }),
  })
);

export const messageReadReceiptsRelations = relations(
  messageReadReceipts,
  ({ one }) => ({
    message: one(messages, {
      fields: [messageReadReceipts.messageId],
      references: [messages.id],
    }),
    user: one(users, {
      fields: [messageReadReceipts.userId],
      references: [users.id],
    }),
  })
);

export const pinsRelations = relations(pins, ({ one }) => ({
  chat: one(chats, {
    fields: [pins.chatId],
    references: [chats.id],
  }),
  message: one(messages, {
    fields: [pins.messageId],
    references: [messages.id],
  }),
  pinnedByUser: one(users, {
    fields: [pins.pinnedBy],
    references: [users.id],
  }),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, {
    fields: [favorites.userId],
    references: [users.id],
  }),
  message: one(messages, {
    fields: [favorites.messageId],
    references: [messages.id],
  }),
}));

export const chatTabsRelations = relations(chatTabs, ({ one }) => ({
  chat: one(chats, {
    fields: [chatTabs.chatId],
    references: [chats.id],
  }),
  creator: one(users, {
    fields: [chatTabs.createdBy],
    references: [users.id],
  }),
}));

export const announcementsRelations = relations(announcements, ({ one }) => ({
  chat: one(chats, {
    fields: [announcements.chatId],
    references: [chats.id],
  }),
  author: one(users, {
    fields: [announcements.authorId],
    references: [users.id],
  }),
}));

// Type exports
export type Chat = typeof chats.$inferSelect;
export type NewChat = typeof chats.$inferInsert;
export type ChatMember = typeof chatMembers.$inferSelect;
export type NewChatMember = typeof chatMembers.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type MessageReaction = typeof messageReactions.$inferSelect;
export type Pin = typeof pins.$inferSelect;
export type Favorite = typeof favorites.$inferSelect;
export type ChatTab = typeof chatTabs.$inferSelect;
export type NewChatTab = typeof chatTabs.$inferInsert;
export type Announcement = typeof announcements.$inferSelect;
export type NewAnnouncement = typeof announcements.$inferInsert;
