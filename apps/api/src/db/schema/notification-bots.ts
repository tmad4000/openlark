import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { chats } from "./chats";
import { users } from "./users";
import { organizations } from "./organizations";

// Notification bots (incoming webhooks) for group chats
export const notificationBots = pgTable(
  "notification_bots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull().default("Notification Bot"),
    iconUrl: text("icon_url"),
    webhookToken: varchar("webhook_token", { length: 64 }).notNull().unique(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notification_bots_chat_id_idx").on(table.chatId),
    index("notification_bots_webhook_token_idx").on(table.webhookToken),
  ]
);

export type NotificationBot = typeof notificationBots.$inferSelect;
export type NewNotificationBot = typeof notificationBots.$inferInsert;
