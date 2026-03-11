import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  pgEnum,
  index,
  boolean,
} from "drizzle-orm/pg-core";
import { bases } from "./base";

// Automation type enum (automation = triggered by events, workflow = manual/scheduled)
export const automationTypeEnum = pgEnum("automation_type", [
  "automation",
  "workflow",
]);

// Automation run status enum
export const automationRunStatusEnum = pgEnum("automation_run_status", [
  "pending",
  "running",
  "success",
  "failed",
]);

// Trigger types supported by the automation engine
export type AutomationTrigger =
  | { type: "record_created"; tableId: string }
  | { type: "record_updated"; tableId: string; fieldIds?: string[] }
  | { type: "record_matches_condition"; tableId: string; condition: FilterCondition }
  | { type: "scheduled"; cron: string; timezone?: string }
  | { type: "button_clicked"; tableId: string; fieldId: string }
  | { type: "webhook_received"; webhookId: string };

// Filter condition for record_matches_condition trigger
export interface FilterCondition {
  fieldId: string;
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "not_contains" | "is_empty" | "is_not_empty";
  value: unknown;
}

// Action types supported by the automation engine
export type AutomationAction =
  | { type: "update_record"; tableId: string; recordId?: string; updates: Record<string, unknown> }
  | { type: "create_record"; tableId: string; data: Record<string, unknown> }
  | { type: "send_message"; chatId: string; content: { text: string } }
  | { type: "http_request"; method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; url: string; headers?: Record<string, string>; body?: unknown };

// Base automations table
export const baseAutomations = pgTable(
  "base_automations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    baseId: uuid("base_id")
      .notNull()
      .references(() => bases.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    trigger: jsonb("trigger").$type<AutomationTrigger>().notNull(),
    actions: jsonb("actions").$type<AutomationAction[]>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    type: automationTypeEnum("type").notNull().default("automation"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("base_automations_base_id_idx").on(table.baseId),
    index("base_automations_enabled_idx").on(table.enabled),
    index("base_automations_type_idx").on(table.type),
  ]
);

export type BaseAutomation = typeof baseAutomations.$inferSelect;
export type InsertBaseAutomation = typeof baseAutomations.$inferInsert;

// Automation runs table - tracks execution history
export const automationRuns = pgTable(
  "automation_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => baseAutomations.id, { onDelete: "cascade" }),
    triggerEvent: jsonb("trigger_event").$type<{
      type: string;
      recordId?: string;
      tableId?: string;
      data?: Record<string, unknown>;
    }>().notNull(),
    status: automationRunStatusEnum("status").notNull().default("pending"),
    error: varchar("error", { length: 2000 }),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("automation_runs_automation_id_idx").on(table.automationId),
    index("automation_runs_status_idx").on(table.status),
    index("automation_runs_started_at_idx").on(table.startedAt),
  ]
);

export type AutomationRun = typeof automationRuns.$inferSelect;
export type InsertAutomationRun = typeof automationRuns.$inferInsert;
