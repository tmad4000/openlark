import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

// API Keys table - stores API keys for programmatic access
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),
    scopes: text("scopes").array().notNull().default([]),
    name: varchar("name", { length: 255 }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    // Index on key_hash for fast API key lookup
    index("api_keys_key_hash_idx").on(table.keyHash),
    // Index on org_id for finding all keys in an organization
    index("api_keys_org_id_idx").on(table.orgId),
    // Index on user_id for finding all keys for a user
    index("api_keys_user_id_idx").on(table.userId),
  ]
);

// Type exports
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
