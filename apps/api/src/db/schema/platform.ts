import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth.js";

// Apps table for Open Platform
export const apps = pgTable(
  "apps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    appId: varchar("app_id", { length: 64 }).notNull(),
    appSecretHash: text("app_secret_hash").notNull(),
    redirectUris: text("redirect_uris").array().notNull().default([]),
    scopes: text("scopes").array().notNull().default([]),
    botEnabled: boolean("bot_enabled").notNull().default(false),
    webhookUrl: text("webhook_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("apps_app_id_idx").on(table.appId),
    index("apps_org_id_idx").on(table.orgId),
  ]
);

// Event subscriptions table
export const eventSubscriptions = pgTable(
  "event_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    callbackUrl: text("callback_url").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("event_subs_app_id_idx").on(table.appId),
    index("event_subs_event_type_idx").on(table.eventType),
  ]
);

// OAuth authorization codes (temporary, for code flow)
export const oauthCodes = pgTable(
  "oauth_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 128 }).notNull(),
    appId: uuid("app_id")
      .notNull()
      .references(() => apps.id),
    userId: uuid("user_id").notNull(),
    orgId: uuid("org_id").notNull(),
    scopes: text("scopes").array().notNull().default([]),
    redirectUri: text("redirect_uri").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("oauth_codes_code_idx").on(table.code),
    index("oauth_codes_app_id_idx").on(table.appId),
  ]
);

// Webhook delivery status enum
export const webhookDeliveryStatusEnum = pgEnum("webhook_delivery_status", [
  "pending",
  "delivered",
  "failed",
]);

// Webhook deliveries table
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => eventSubscriptions.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    payload: jsonb("payload").notNull(),
    status: webhookDeliveryStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    responseStatus: integer("response_status"),
    responseBody: text("response_body"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("webhook_deliveries_sub_id_idx").on(table.subscriptionId),
    index("webhook_deliveries_status_idx").on(table.status),
    index("webhook_deliveries_created_at_idx").on(table.createdAt),
  ]
);

// Type exports
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type App = typeof apps.$inferSelect;
export type NewApp = typeof apps.$inferInsert;
export type EventSubscription = typeof eventSubscriptions.$inferSelect;
export type OAuthCode = typeof oauthCodes.$inferSelect;
