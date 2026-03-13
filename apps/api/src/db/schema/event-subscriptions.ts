import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { oauthApps } from "./oauth-apps";

// Event Subscriptions table - stores webhook event subscriptions for apps
export const eventSubscriptions = pgTable(
  "event_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    appId: uuid("app_id")
      .notNull()
      .references(() => oauthApps.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 255 }).notNull(),
    callbackUrl: text("callback_url").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("event_subscriptions_app_id_idx").on(table.appId),
    index("event_subscriptions_event_type_idx").on(table.eventType),
  ]
);

// Type exports
export type EventSubscription = typeof eventSubscriptions.$inferSelect;
export type NewEventSubscription = typeof eventSubscriptions.$inferInsert;
