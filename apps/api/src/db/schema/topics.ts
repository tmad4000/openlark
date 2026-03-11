import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  pgEnum,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { chats } from "./chats";

// Topic status enum
export const topicStatusEnum = pgEnum("topic_status", ["open", "closed"]);

// Topics table - organizes discussions within topic_group chats
export const topics = pgTable(
  "topics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: topicStatusEnum("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("topics_chat_id_idx").on(table.chatId),
    index("topics_creator_id_idx").on(table.creatorId),
    index("topics_status_idx").on(table.status),
  ]
);

// Topic subscriptions - tracks which users are subscribed to which topics
export const topicSubscriptions = pgTable(
  "topic_subscriptions",
  {
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subscribedAt: timestamp("subscribed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.topicId, table.userId] }),
    index("topic_subscriptions_user_id_idx").on(table.userId),
  ]
);

// Type exports
export type Topic = typeof topics.$inferSelect;
export type NewTopic = typeof topics.$inferInsert;
export type TopicSubscription = typeof topicSubscriptions.$inferSelect;
export type NewTopicSubscription = typeof topicSubscriptions.$inferInsert;
