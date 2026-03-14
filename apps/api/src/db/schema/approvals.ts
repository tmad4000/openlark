import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  pgEnum,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users } from "./auth";

// ============ ENUMS ============

export const approvalRequestStatusEnum = pgEnum("approval_request_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

export const approvalStepTypeEnum = pgEnum("approval_step_type", [
  "sequential",
  "parallel",
]);

export const approvalStepStatusEnum = pgEnum("approval_step_status", [
  "pending",
  "approved",
  "rejected",
]);

// ============ TABLES ============

export const approvalTemplates = pgTable(
  "approval_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: varchar("name", { length: 255 }).notNull(),
    formSchema: jsonb("form_schema").notNull().default({}),
    workflow: jsonb("workflow").notNull().default([]),
    category: varchar("category", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("approval_templates_org_id_idx").on(table.orgId),
    index("approval_templates_category_idx").on(table.category),
  ]
);

export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => approvalTemplates.id),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    formData: jsonb("form_data").notNull().default({}),
    status: approvalRequestStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("approval_requests_template_id_idx").on(table.templateId),
    index("approval_requests_requester_id_idx").on(table.requesterId),
    index("approval_requests_org_id_idx").on(table.orgId),
    index("approval_requests_status_idx").on(table.status),
  ]
);

export const approvalSteps = pgTable(
  "approval_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => approvalRequests.id, { onDelete: "cascade" }),
    stepIndex: integer("step_index").notNull(),
    approverIds: uuid("approver_ids").array().notNull().default([]),
    type: approvalStepTypeEnum("type").notNull().default("sequential"),
    status: approvalStepStatusEnum("status").notNull().default("pending"),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    comment: text("comment"),
  },
  (table) => [
    index("approval_steps_request_id_idx").on(table.requestId),
    index("approval_steps_status_idx").on(table.status),
  ]
);

// ============ RELATIONS ============

export const approvalTemplatesRelations = relations(
  approvalTemplates,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [approvalTemplates.orgId],
      references: [organizations.id],
    }),
    requests: many(approvalRequests),
  })
);

export const approvalRequestsRelations = relations(
  approvalRequests,
  ({ one, many }) => ({
    template: one(approvalTemplates, {
      fields: [approvalRequests.templateId],
      references: [approvalTemplates.id],
    }),
    requester: one(users, {
      fields: [approvalRequests.requesterId],
      references: [users.id],
    }),
    organization: one(organizations, {
      fields: [approvalRequests.orgId],
      references: [organizations.id],
    }),
    steps: many(approvalSteps),
  })
);

export const approvalStepsRelations = relations(approvalSteps, ({ one }) => ({
  request: one(approvalRequests, {
    fields: [approvalSteps.requestId],
    references: [approvalRequests.id],
  }),
  decider: one(users, {
    fields: [approvalSteps.decidedBy],
    references: [users.id],
  }),
}));

// ============ TYPES ============

export type ApprovalTemplate = typeof approvalTemplates.$inferSelect;
export type NewApprovalTemplate = typeof approvalTemplates.$inferInsert;
export type ApprovalRequest = typeof approvalRequests.$inferSelect;
export type NewApprovalRequest = typeof approvalRequests.$inferInsert;
export type ApprovalStep = typeof approvalSteps.$inferSelect;
export type NewApprovalStep = typeof approvalSteps.$inferInsert;
