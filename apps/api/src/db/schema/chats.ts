import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
  pgEnum,
  index,
  primaryKey,
  AnyPgColumn,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

// Forward reference for topics table (defined in topics.ts)
// We use AnyPgColumn to avoid circular dependencies
declare const topicsTable: { id: ReturnType<typeof uuid> };

// Chat type enum
export const chatTypeEnum = pgEnum("chat_type", [
  "dm",
  "group",
  "topic_group",
  "supergroup",
  "meeting",
]);

// Chat member role enum
export const chatMemberRoleEnum = pgEnum("chat_member_role", [
  "owner",
  "admin",
  "member",
]);

// Message type enum
export const messageTypeEnum = pgEnum("message_type", [
  "text",
  "rich_text",
  "code",
  "voice",
  "card",
  "system",
]);

// Chats table
export const chats = pgTable(
  "chats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: chatTypeEnum("type").notNull(),
    name: varchar("name", { length: 255 }),
    avatarUrl: text("avatar_url"),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    isPublic: boolean("is_public").notNull().default(false),
    maxMembers: integer("max_members"),
    settings: jsonb("settings").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("chats_org_id_idx").on(table.orgId)]
);

// Chat members junction table
export const chatMembers = pgTable(
  "chat_members",
  {
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: chatMemberRoleEnum("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    muted: boolean("muted").notNull().default(false),
    done: boolean("done").notNull().default(false),
    pinned: boolean("pinned").notNull().default(false),
    label: varchar("label", { length: 100 }),
    lastReadMessageId: uuid("last_read_message_id"),
  },
  (table) => [
    primaryKey({ columns: [table.chatId, table.userId] }),
    index("chat_members_user_id_idx").on(table.userId),
  ]
);

// Messages table
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id),
    type: messageTypeEnum("type").notNull().default("text"),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    threadId: uuid("thread_id").references((): AnyPgColumn => messages.id),
    replyToId: uuid("reply_to_id").references((): AnyPgColumn => messages.id),
    forwardedFromMessageId: uuid("forwarded_from_message_id").references((): AnyPgColumn => messages.id),
    forwardedFromChatId: uuid("forwarded_from_chat_id").references(() => chats.id),
    topicId: uuid("topic_id"), // References topics.id - FK added in migration to avoid circular import
    editedAt: timestamp("edited_at", { withTimezone: true }),
    recalledAt: timestamp("recalled_at", { withTimezone: true }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("messages_chat_id_created_at_idx").on(table.chatId, table.createdAt),
    index("messages_thread_id_idx").on(table.threadId),
    index("messages_topic_id_idx").on(table.topicId),
  ]
);

// Type exports
export type Chat = typeof chats.$inferSelect;
export type NewChat = typeof chats.$inferInsert;
export type ChatMember = typeof chatMembers.$inferSelect;
export type NewChatMember = typeof chatMembers.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
