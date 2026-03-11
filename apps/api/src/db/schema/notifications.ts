import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

// Notification type enum
export const notificationTypeEnum = pgEnum("notification_type", [
  "dm_received",
  "mentioned",
  "thread_reply",
  "task_assigned",
  "approval_pending",
]);

// Entity type enum - what the notification is about
export const notificationEntityTypeEnum = pgEnum("notification_entity_type", [
  "message",
  "chat",
  "task",
  "approval",
  "document",
]);

// Notifications table
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body"),
    entityType: notificationEntityTypeEnum("entity_type"),
    entityId: uuid("entity_id"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Index for fetching user's notifications, most recent first
    index("notifications_user_id_created_at_idx").on(
      table.userId,
      table.createdAt
    ),
    // Index for finding unread notifications
    index("notifications_user_id_read_at_idx").on(table.userId, table.readAt),
  ]
);

// Type exports
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
