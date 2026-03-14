import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./auth";

export const notificationTypeEnum = pgEnum("notification_type", [
  "dm_received",
  "mentioned",
  "thread_reply",
  "task_assigned",
  "approval_pending",
  "event_invite",
  "event_updated",
  "minutes_ready",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    body: text("body"),
    entityType: varchar("entity_type", { length: 50 }),
    entityId: uuid("entity_id"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notifications_user_id_idx").on(table.userId),
    index("notifications_user_created_idx").on(table.userId, table.createdAt),
  ]
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

// Buzz notification enums
export const buzzTypeEnum = pgEnum("buzz_type", ["in_app", "sms", "phone"]);
export const buzzStatusEnum = pgEnum("buzz_status", [
  "pending",
  "delivered",
  "read",
]);

// Buzz notifications table — urgent notification on a specific message
export const buzzNotifications = pgTable(
  "buzz_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id").notNull(),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: buzzTypeEnum("type").notNull(),
    status: buzzStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    index("buzz_notifications_message_id_idx").on(table.messageId),
    index("buzz_notifications_sender_id_idx").on(table.senderId),
    index("buzz_notifications_recipient_id_idx").on(table.recipientId),
  ]
);

export const buzzNotificationsRelations = relations(
  buzzNotifications,
  ({ one }) => ({
    sender: one(users, {
      fields: [buzzNotifications.senderId],
      references: [users.id],
      relationName: "buzzSender",
    }),
    recipient: one(users, {
      fields: [buzzNotifications.recipientId],
      references: [users.id],
      relationName: "buzzRecipient",
    }),
  })
);
