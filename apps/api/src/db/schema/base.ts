import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  pgEnum,
  index,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users, organizations } from "./auth";

// Enums
export const baseViewTypeEnum = pgEnum("base_view_type", [
  "grid",
  "kanban",
  "calendar",
  "gantt",
  "gallery",
  "form",
]);

// Bases table
export const bases = pgTable(
  "bases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: varchar("name", { length: 255 }).notNull(),
    icon: varchar("icon", { length: 100 }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("bases_org_id_idx").on(table.orgId),
    index("bases_owner_id_idx").on(table.ownerId),
  ]
);

// Base tables table
export const baseTables = pgTable(
  "base_tables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    baseId: uuid("base_id")
      .notNull()
      .references(() => bases.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("base_tables_base_id_idx").on(table.baseId)]
);

// Base fields table
export const baseFields = pgTable(
  "base_fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => baseTables.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    type: varchar("type", { length: 50 }).notNull(),
    config: jsonb("config").default({}),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("base_fields_table_id_idx").on(table.tableId)]
);

// Base records table
export const baseRecords = pgTable(
  "base_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => baseTables.id, { onDelete: "cascade" }),
    data: jsonb("data").notNull().default({}),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("base_records_table_id_idx").on(table.tableId),
    index("base_records_created_by_idx").on(table.createdBy),
  ]
);

// Base views table
export const baseViews = pgTable(
  "base_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => baseTables.id, { onDelete: "cascade" }),
    type: baseViewTypeEnum("type").notNull().default("grid"),
    name: varchar("name", { length: 255 }).notNull(),
    config: jsonb("config").default({}),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("base_views_table_id_idx").on(table.tableId)]
);

// Relations
export const basesRelations = relations(bases, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [bases.orgId],
    references: [organizations.id],
  }),
  owner: one(users, {
    fields: [bases.ownerId],
    references: [users.id],
  }),
  tables: many(baseTables),
}));

export const baseTablesRelations = relations(baseTables, ({ one, many }) => ({
  base: one(bases, {
    fields: [baseTables.baseId],
    references: [bases.id],
  }),
  fields: many(baseFields),
  records: many(baseRecords),
  views: many(baseViews),
}));

export const baseFieldsRelations = relations(baseFields, ({ one }) => ({
  table: one(baseTables, {
    fields: [baseFields.tableId],
    references: [baseTables.id],
  }),
}));

export const baseRecordsRelations = relations(baseRecords, ({ one }) => ({
  table: one(baseTables, {
    fields: [baseRecords.tableId],
    references: [baseTables.id],
  }),
  creator: one(users, {
    fields: [baseRecords.createdBy],
    references: [users.id],
  }),
}));

export const baseViewsRelations = relations(baseViews, ({ one }) => ({
  table: one(baseTables, {
    fields: [baseViews.tableId],
    references: [baseTables.id],
  }),
}));

// Automation enums
export const automationTypeEnum = pgEnum("automation_type", [
  "automation",
  "workflow",
]);

export const automationRunStatusEnum = pgEnum("automation_run_status", [
  "success",
  "failed",
]);

// Base automations table
export const baseAutomations = pgTable(
  "base_automations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    baseId: uuid("base_id")
      .notNull()
      .references(() => bases.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    trigger: jsonb("trigger").notNull(),
    actions: jsonb("actions").notNull().default([]),
    enabled: boolean("enabled").notNull().default(true),
    type: automationTypeEnum("type").notNull().default("automation"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("base_automations_base_id_idx").on(table.baseId)]
);

// Automation runs table
export const automationRuns = pgTable(
  "automation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => baseAutomations.id, { onDelete: "cascade" }),
    triggerEvent: jsonb("trigger_event").notNull(),
    status: automationRunStatusEnum("status").notNull(),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("automation_runs_automation_id_idx").on(table.automationId),
  ]
);

// Automation relations
export const baseAutomationsRelations = relations(
  baseAutomations,
  ({ one, many }) => ({
    base: one(bases, {
      fields: [baseAutomations.baseId],
      references: [bases.id],
    }),
    runs: many(automationRuns),
  })
);

export const automationRunsRelations = relations(automationRuns, ({ one }) => ({
  automation: one(baseAutomations, {
    fields: [automationRuns.automationId],
    references: [baseAutomations.id],
  }),
}));

// Type exports
export type Base = typeof bases.$inferSelect;
export type NewBase = typeof bases.$inferInsert;
export type BaseTable = typeof baseTables.$inferSelect;
export type NewBaseTable = typeof baseTables.$inferInsert;
export type BaseField = typeof baseFields.$inferSelect;
export type NewBaseField = typeof baseFields.$inferInsert;
export type BaseRecord = typeof baseRecords.$inferSelect;
export type NewBaseRecord = typeof baseRecords.$inferInsert;
export type BaseView = typeof baseViews.$inferSelect;
export type NewBaseView = typeof baseViews.$inferInsert;
export type BaseAutomation = typeof baseAutomations.$inferSelect;
export type NewBaseAutomation = typeof baseAutomations.$inferInsert;
export type AutomationRun = typeof automationRuns.$inferSelect;
export type NewAutomationRun = typeof automationRuns.$inferInsert;
