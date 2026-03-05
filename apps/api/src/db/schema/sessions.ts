import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

// Device info type for session metadata
export interface DeviceInfo {
  userAgent?: string;
  platform?: string;
  browser?: string;
  os?: string;
  device?: string;
}

// Sessions table - stores user authentication sessions
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    deviceInfo: jsonb("device_info").$type<DeviceInfo>(),
    ip: varchar("ip", { length: 45 }), // IPv6 max length
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Index on token_hash for fast session lookup
    index("sessions_token_hash_idx").on(table.tokenHash),
    // Index on user_id for finding all sessions for a user
    index("sessions_user_id_idx").on(table.userId),
  ]
);

// Type exports
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
