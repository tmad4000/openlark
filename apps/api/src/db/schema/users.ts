import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  time,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

// User status enum
export const userStatusEnum = pgEnum("user_status", [
  "active",
  "away",
  "busy",
  "offline",
]);

// User theme preference enum
export const userThemeEnum = pgEnum("user_theme", ["light", "dark", "system"]);

// User role enum - organization-level role
export const userRoleEnum = pgEnum("user_role", ["owner", "admin", "member"]);

// Users table
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    phone: varchar("phone", { length: 50 }),
    passwordHash: text("password_hash"),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    avatarUrl: text("avatar_url"),
    timezone: varchar("timezone", { length: 50 }).default("UTC"),
    locale: varchar("locale", { length: 10 }).default("en"),
    status: userStatusEnum("status").default("offline"),
    statusText: varchar("status_text", { length: 100 }),
    statusEmoji: varchar("status_emoji", { length: 32 }),
    workingHoursStart: time("working_hours_start"),
    workingHoursEnd: time("working_hours_end"),
    theme: userThemeEnum("theme").notNull().default("system"),
    role: userRoleEnum("role").notNull().default("member"),
    orgId: uuid("org_id").references(() => organizations.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    // Index on org_id for efficient organization-based queries
    index("users_org_id_idx").on(table.orgId),
  ]
);

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
