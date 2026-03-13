import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

// OAuth Apps table - stores registered developer apps
export const oauthApps = pgTable(
  "oauth_apps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    appId: varchar("app_id", { length: 64 }).notNull().unique(),
    appSecretHash: varchar("app_secret_hash", { length: 64 }).notNull(),
    redirectUris: text("redirect_uris").array().notNull().default([]),
    scopes: text("scopes").array().notNull().default([]),
    botEnabled: boolean("bot_enabled").notNull().default(false),
    webhookUrl: text("webhook_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("oauth_apps_org_id_idx").on(table.orgId),
    index("oauth_apps_app_id_idx").on(table.appId),
  ]
);

// Type exports
export type OAuthApp = typeof oauthApps.$inferSelect;
export type NewOAuthApp = typeof oauthApps.$inferInsert;
