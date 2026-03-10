import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";

// Plan enum for organization subscription tiers
export const planEnum = pgEnum("plan", ["starter", "pro", "enterprise"]);

// Organizations table
export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  domain: varchar("domain", { length: 255 }).unique(),
  logoUrl: text("logo_url"),
  industry: varchar("industry", { length: 100 }),
  plan: planEnum("plan").notNull().default("starter"),
  settings: jsonb("settings").$type<Record<string, unknown>>().default({}),
  primaryAdminId: uuid("primary_admin_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Type exports
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
