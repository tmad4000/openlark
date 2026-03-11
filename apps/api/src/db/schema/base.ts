import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  pgEnum,
  index,
  integer,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

// Base view type enum
export const baseViewTypeEnum = pgEnum("base_view_type", [
  "grid",
  "kanban",
  "calendar",
  "gantt",
  "gallery",
  "form",
]);

// Bases table - top-level database containers
export const bases = pgTable(
  "bases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    icon: varchar("icon", { length: 100 }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("bases_org_id_idx").on(table.orgId),
    index("bases_owner_id_idx").on(table.ownerId),
  ]
);

export type Base = typeof bases.$inferSelect;
export type InsertBase = typeof bases.$inferInsert;

// Base tables - individual tables within a base
export const baseTables = pgTable(
  "base_tables",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    baseId: uuid("base_id")
      .notNull()
      .references(() => bases.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("base_tables_base_id_idx").on(table.baseId),
    index("base_tables_position_idx").on(table.position),
  ]
);

export type BaseTable = typeof baseTables.$inferSelect;
export type InsertBaseTable = typeof baseTables.$inferInsert;

// Base fields - columns/fields within a table
// Type is varchar to support 25+ field types: text, long_text, number, currency,
// percent, date, datetime, checkbox, single_select, multi_select, user, attachment,
// url, email, phone, rating, duration, barcode, formula, rollup, lookup, link,
// autonumber, created_time, modified_time, created_by, modified_by, button, etc.
export const baseFields = pgTable(
  "base_fields",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => baseTables.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    type: varchar("type", { length: 50 }).notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().default({}),
    position: integer("position").notNull().default(0),
  },
  (table) => [
    index("base_fields_table_id_idx").on(table.tableId),
    index("base_fields_position_idx").on(table.position),
  ]
);

export type BaseField = typeof baseFields.$inferSelect;
export type InsertBaseField = typeof baseFields.$inferInsert;

// Base records - rows of data in a table
// Data is JSONB keyed by field_id for flexible schema per table
export const baseRecords = pgTable(
  "base_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => baseTables.id, { onDelete: "cascade" }),
    data: jsonb("data").$type<Record<string, unknown>>().default({}),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("base_records_table_id_idx").on(table.tableId),
    index("base_records_created_by_idx").on(table.createdBy),
    index("base_records_created_at_idx").on(table.createdAt),
  ]
);

export type BaseRecord = typeof baseRecords.$inferSelect;
export type InsertBaseRecord = typeof baseRecords.$inferInsert;

// Base views - different ways to visualize table data
export const baseViews = pgTable(
  "base_views",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => baseTables.id, { onDelete: "cascade" }),
    type: baseViewTypeEnum("type").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    config: jsonb("config")
      .$type<{
        // Common config options
        filters?: Array<{
          fieldId: string;
          op: string;
          value: unknown;
        }>;
        sorts?: Array<{
          fieldId: string;
          direction: "asc" | "desc";
        }>;
        hiddenFields?: string[];
        fieldOrder?: string[];
        // Grid-specific
        rowHeight?: "short" | "medium" | "tall" | "extra_tall";
        columnWidths?: Record<string, number>;
        // Kanban-specific
        groupByFieldId?: string;
        // Calendar-specific
        dateFieldId?: string;
        endDateFieldId?: string;
        // Gantt-specific
        startDateFieldId?: string;
        durationFieldId?: string;
        // Gallery-specific
        coverFieldId?: string;
        showTitleOnly?: boolean;
        // Form-specific
        formDescription?: string;
        formSubmitLabel?: string;
        formSuccessMessage?: string;
        formRequiredFields?: string[];
        formPublicAccess?: boolean;
        formShareToken?: string;
      }>()
      .default({}),
    position: integer("position").notNull().default(0),
  },
  (table) => [
    index("base_views_table_id_idx").on(table.tableId),
    index("base_views_type_idx").on(table.type),
    index("base_views_position_idx").on(table.position),
  ]
);

export type BaseView = typeof baseViews.$inferSelect;
export type InsertBaseView = typeof baseViews.$inferInsert;
