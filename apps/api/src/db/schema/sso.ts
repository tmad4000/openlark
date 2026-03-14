import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./auth";

// SSO configurations table - SAML 2.0 IdP settings per organization
export const ssoConfigs = pgTable(
  "sso_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    entityId: varchar("entity_id", { length: 512 }).notNull(),
    ssoUrl: text("sso_url").notNull(),
    certificate: text("certificate").notNull(),
    isEnabled: boolean("is_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("sso_configs_org_id_idx").on(table.orgId)]
);

// Relations
export const ssoConfigsRelations = relations(ssoConfigs, ({ one }) => ({
  organization: one(organizations, {
    fields: [ssoConfigs.orgId],
    references: [organizations.id],
  }),
}));

// Type exports
export type SsoConfig = typeof ssoConfigs.$inferSelect;
export type NewSsoConfig = typeof ssoConfigs.$inferInsert;
