import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  pgEnum,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { chats, messages } from "./chats";

// Chat tab type enum
export const chatTabTypeEnum = pgEnum("chat_tab_type", ["auto", "custom"]);

// Buzz notification type enum
export const buzzTypeEnum = pgEnum("buzz_type", ["in_app", "sms", "phone"]);

// Buzz notification status enum
export const buzzStatusEnum = pgEnum("buzz_status", [
  "pending",
  "delivered",
  "read",
]);

// Message reactions table
export const messageReactions = pgTable(
  "message_reactions",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: varchar("emoji", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.userId, table.emoji] }),
    index("message_reactions_message_id_idx").on(table.messageId),
  ]
);

// Message read receipts table
export const messageReadReceipts = pgTable(
  "message_read_receipts",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.userId] }),
    index("message_read_receipts_user_id_idx").on(table.userId),
  ]
);

// Pins table
export const pins = pgTable(
  "pins",
  {
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    pinnedBy: uuid("pinned_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pinnedAt: timestamp("pinned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.chatId, table.messageId] }),
    index("pins_chat_id_idx").on(table.chatId),
  ]
);

// Favorites table
export const favorites = pgTable(
  "favorites",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.messageId] }),
    index("favorites_user_id_idx").on(table.userId),
  ]
);

// Chat tabs table
export const chatTabs = pgTable(
  "chat_tabs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    type: chatTabTypeEnum("type").notNull().default("custom"),
    name: varchar("name", { length: 100 }).notNull(),
    url: text("url"),
    position: integer("position").notNull().default(0),
  },
  (table) => [index("chat_tabs_chat_id_idx").on(table.chatId)]
);

// Announcements table
export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("announcements_chat_id_idx").on(table.chatId)]
);

// Buzz notifications table
export const buzzNotifications = pgTable(
  "buzz_notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: buzzTypeEnum("type").notNull().default("in_app"),
    status: buzzStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    index("buzz_notifications_message_id_idx").on(table.messageId),
    index("buzz_notifications_recipient_id_idx").on(table.recipientId),
    index("buzz_notifications_sender_id_created_at_idx").on(
      table.senderId,
      table.createdAt
    ),
  ]
);

// Type exports
export type MessageReaction = typeof messageReactions.$inferSelect;
export type NewMessageReaction = typeof messageReactions.$inferInsert;
export type MessageReadReceipt = typeof messageReadReceipts.$inferSelect;
export type NewMessageReadReceipt = typeof messageReadReceipts.$inferInsert;
export type Pin = typeof pins.$inferSelect;
export type NewPin = typeof pins.$inferInsert;
export type Favorite = typeof favorites.$inferSelect;
export type NewFavorite = typeof favorites.$inferInsert;
export type ChatTab = typeof chatTabs.$inferSelect;
export type NewChatTab = typeof chatTabs.$inferInsert;
export type Announcement = typeof announcements.$inferSelect;
export type NewAnnouncement = typeof announcements.$inferInsert;
export type BuzzNotification = typeof buzzNotifications.$inferSelect;
export type NewBuzzNotification = typeof buzzNotifications.$inferInsert;
