import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  pgEnum,
  boolean,
  time,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// Enums
export const userStatusEnum = pgEnum("user_status", [
  "active",
  "deactivated",
  "pending",
]);

export const orgRoleEnum = pgEnum("org_role", [
  "primary_admin",
  "admin",
  "member",
]);

export const planEnum = pgEnum("plan_type", ["free", "starter", "business", "enterprise"]);

// Organizations table
export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    domain: varchar("domain", { length: 255 }),
    logoUrl: text("logo_url"),
    industry: varchar("industry", { length: 100 }),
    plan: planEnum("plan").notNull().default("free"),
    settingsJson: jsonb("settings_json").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("organizations_domain_idx")
      .on(table.domain)
      .where(sql`${table.domain} IS NOT NULL AND ${table.deletedAt} IS NULL`),
  ]
);

// Users table
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    email: varchar("email", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 50 }),
    passwordHash: text("password_hash"),
    displayName: varchar("display_name", { length: 255 }),
    avatarUrl: text("avatar_url"),
    timezone: varchar("timezone", { length: 100 }).default("UTC"),
    locale: varchar("locale", { length: 10 }).default("en"),
    status: userStatusEnum("status").notNull().default("pending"),
    workingHoursStart: time("working_hours_start").default("09:00"),
    workingHoursEnd: time("working_hours_end").default("17:00"),
    role: orgRoleEnum("role").notNull().default("member"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    totpSecret: text("totp_secret"),
    totpEnabled: boolean("totp_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
  },
  (table) => [
    uniqueIndex("users_email_org_idx")
      .on(table.email, table.orgId)
      .where(sql`${table.deletedAt} IS NULL`),
    index("users_org_id_idx").on(table.orgId),
  ]
);

// Departments table (tree structure)
export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: varchar("name", { length: 255 }).notNull(),
    parentId: uuid("parent_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
  },
  (table) => [
    index("departments_org_id_idx").on(table.orgId),
    index("departments_parent_id_idx").on(table.parentId),
  ]
);

// Department membership (join table with role)
export const departmentMembers = pgTable(
  "department_members",
  {
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: varchar("role", { length: 50 }).notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("dept_members_user_idx").on(table.userId),
    uniqueIndex("dept_members_unique_idx").on(table.departmentId, table.userId),
  ]
);

// Sessions table
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    deviceInfo: jsonb("device_info").default({}),
    ip: varchar("ip", { length: 45 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ]
);

// API Keys table
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 255 }).notNull(),
    keyHash: text("key_hash").notNull(),
    keyPrefix: varchar("key_prefix", { length: 10 }).notNull(), // For identification
    scopes: jsonb("scopes").default([]).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("api_keys_org_id_idx").on(table.orgId),
    index("api_keys_user_id_idx").on(table.userId),
  ]
);

// Invitations table
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    email: varchar("email", { length: 255 }).notNull(),
    role: orgRoleEnum("role").notNull().default("member"),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("invitations_org_id_idx").on(table.orgId),
    index("invitations_email_idx").on(table.email),
    uniqueIndex("invitations_org_email_pending_idx")
      .on(table.orgId, table.email)
      .where(sql`${table.acceptedAt} IS NULL AND ${table.revokedAt} IS NULL`),
  ]
);

// Magic Links table (for passwordless login)
export const magicLinks = pgTable(
  "magic_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (table) => [index("magic_links_user_id_idx").on(table.userId)]
);

// Relations
export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  departments: many(departments),
  apiKeys: many(apiKeys),
  invitations: many(invitations),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.orgId],
    references: [organizations.id],
  }),
  sessions: many(sessions),
  apiKeys: many(apiKeys),
  departmentMemberships: many(departmentMembers),
  magicLinks: many(magicLinks),
}));

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [departments.orgId],
    references: [organizations.id],
  }),
  parent: one(departments, {
    fields: [departments.parentId],
    references: [departments.id],
    relationName: "departmentHierarchy",
  }),
  children: many(departments, { relationName: "departmentHierarchy" }),
  members: many(departmentMembers),
}));

export const departmentMembersRelations = relations(
  departmentMembers,
  ({ one }) => ({
    department: one(departments, {
      fields: [departmentMembers.departmentId],
      references: [departments.id],
    }),
    user: one(users, {
      fields: [departmentMembers.userId],
      references: [users.id],
    }),
  })
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  organization: one(organizations, {
    fields: [apiKeys.orgId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  organization: one(organizations, {
    fields: [invitations.orgId],
    references: [organizations.id],
  }),
  invitedBy: one(users, {
    fields: [invitations.createdBy],
    references: [users.id],
  }),
}));

export const magicLinksRelations = relations(magicLinks, ({ one }) => ({
  user: one(users, {
    fields: [magicLinks.userId],
    references: [users.id],
  }),
}));

// Type exports for use in application code
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
