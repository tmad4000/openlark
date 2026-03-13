import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  pgEnum,
  index,
  boolean,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const ssoProviderEnum = pgEnum("sso_provider", ["saml"]);

export const ssoConfigs = pgTable(
  "sso_configs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: ssoProviderEnum("provider").notNull().default("saml"),
    metadataUrl: text("metadata_url"),
    entityId: varchar("entity_id", { length: 512 }).notNull(),
    ssoUrl: text("sso_url").notNull(),
    certificate: text("certificate").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("sso_configs_org_id_idx").on(table.orgId),
  ]
);

export type SsoConfig = typeof ssoConfigs.$inferSelect;
export type NewSsoConfig = typeof ssoConfigs.$inferInsert;
