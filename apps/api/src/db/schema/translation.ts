import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./auth";

// ============ TABLES ============

export const translationPreferences = pgTable(
  "translation_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    autoTranslateEnabled: boolean("auto_translate_enabled")
      .notNull()
      .default(false),
    targetLanguage: varchar("target_language", { length: 10 })
      .notNull()
      .default("en"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("translation_preferences_user_id_idx").on(table.userId),
  ]
);

export const translationUsage = pgTable(
  "translation_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hour: timestamp("hour", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("translation_usage_user_id_idx").on(table.userId),
    uniqueIndex("translation_usage_user_hour_idx").on(
      table.userId,
      table.hour
    ),
  ]
);

// ============ RELATIONS ============

export const translationPreferencesRelations = relations(
  translationPreferences,
  ({ one }) => ({
    user: one(users, {
      fields: [translationPreferences.userId],
      references: [users.id],
    }),
  })
);

export const translationUsageRelations = relations(
  translationUsage,
  ({ one }) => ({
    user: one(users, {
      fields: [translationUsage.userId],
      references: [users.id],
    }),
  })
);

// ============ TYPES ============

export type TranslationPreference = typeof translationPreferences.$inferSelect;
export type NewTranslationPreference =
  typeof translationPreferences.$inferInsert;
export type TranslationUsage = typeof translationUsage.$inferSelect;
export type NewTranslationUsage = typeof translationUsage.$inferInsert;
