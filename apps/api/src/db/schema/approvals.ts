import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

// Approval request status enum
export const approvalRequestStatusEnum = pgEnum("approval_request_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

// Approval step type enum
export const approvalStepTypeEnum = pgEnum("approval_step_type", [
  "sequential",
  "parallel",
]);

// Approval step status enum
export const approvalStepStatusEnum = pgEnum("approval_step_status", [
  "pending",
  "approved",
  "rejected",
]);

// Approval templates table
export const approvalTemplates = pgTable(
  "approval_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    formSchema: jsonb("form_schema").notNull().default({}),
    workflow: jsonb("workflow").notNull().default([]),
    category: varchar("category", { length: 100 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("approval_templates_org_id_idx").on(table.orgId),
  ]
);

export type ApprovalTemplate = typeof approvalTemplates.$inferSelect;
export type NewApprovalTemplate = typeof approvalTemplates.$inferInsert;

// Approval requests table
export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => approvalTemplates.id, { onDelete: "cascade" }),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    formData: jsonb("form_data").notNull().default({}),
    status: approvalRequestStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("approval_requests_template_id_idx").on(table.templateId),
    index("approval_requests_requester_id_idx").on(table.requesterId),
    index("approval_requests_status_idx").on(table.status),
  ]
);

export type ApprovalRequest = typeof approvalRequests.$inferSelect;
export type NewApprovalRequest = typeof approvalRequests.$inferInsert;

// Approval steps table
export const approvalSteps = pgTable(
  "approval_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => approvalRequests.id, { onDelete: "cascade" }),
    stepIndex: integer("step_index").notNull(),
    approverIds: uuid("approver_ids").array().notNull(),
    type: approvalStepTypeEnum("type").notNull().default("sequential"),
    status: approvalStepStatusEnum("status").notNull().default("pending"),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at"),
    comment: text("comment"),
  },
  (table) => [
    index("approval_steps_request_id_idx").on(table.requestId),
  ]
);

export type ApprovalStep = typeof approvalSteps.$inferSelect;
export type NewApprovalStep = typeof approvalSteps.$inferInsert;
