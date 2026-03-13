import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  jsonb,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { eventSubscriptions } from "./event-subscriptions";

export const webhookDeliveryStatusEnum = pgEnum("webhook_delivery_status", [
  "pending",
  "delivered",
  "failed",
]);

// Webhook Deliveries table - tracks webhook delivery attempts
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => eventSubscriptions.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 255 }).notNull(),
    payload: jsonb("payload").notNull(),
    status: webhookDeliveryStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("webhook_deliveries_subscription_id_idx").on(table.subscriptionId),
    index("webhook_deliveries_status_idx").on(table.status),
    index("webhook_deliveries_created_at_idx").on(table.createdAt),
  ]
);

// Type exports
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;
