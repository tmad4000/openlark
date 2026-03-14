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
import { organizations, users } from "./auth";
import { bases, baseTables } from "./base";

// ============ ENUMS ============

export const formQuestionTypeEnum = pgEnum("form_question_type", [
  "text",
  "single_select",
  "multi_choice",
  "rating",
  "nps",
  "location",
  "date",
  "person",
  "file",
  "number",
]);

// ============ TABLES ============

export const forms = pgTable(
  "forms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    baseId: uuid("base_id").references(() => bases.id, {
      onDelete: "set null",
    }),
    tableId: uuid("table_id").references(() => baseTables.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    settings: jsonb("settings").notNull().default({}),
    theme: jsonb("theme").notNull().default({}),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("forms_org_id_idx").on(table.orgId),
    index("forms_creator_id_idx").on(table.creatorId),
    index("forms_base_id_idx").on(table.baseId),
  ]
);

export const formQuestions = pgTable(
  "form_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    type: formQuestionTypeEnum("type").notNull(),
    config: jsonb("config").notNull().default({}),
    position: integer("position").notNull().default(0),
    required: boolean("required").notNull().default(false),
    displayCondition: jsonb("display_condition"),
  },
  (table) => [
    index("form_questions_form_id_idx").on(table.formId),
    index("form_questions_position_idx").on(table.formId, table.position),
  ]
);

export const formResponses = pgTable(
  "form_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    respondentId: uuid("respondent_id").references(() => users.id),
    answers: jsonb("answers").notNull().default({}),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("form_responses_form_id_idx").on(table.formId),
    index("form_responses_respondent_id_idx").on(table.respondentId),
  ]
);

// ============ RELATIONS ============

export const formsRelations = relations(forms, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [forms.orgId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [forms.creatorId],
    references: [users.id],
  }),
  base: one(bases, {
    fields: [forms.baseId],
    references: [bases.id],
  }),
  table: one(baseTables, {
    fields: [forms.tableId],
    references: [baseTables.id],
  }),
  questions: many(formQuestions),
  responses: many(formResponses),
}));

export const formQuestionsRelations = relations(formQuestions, ({ one }) => ({
  form: one(forms, {
    fields: [formQuestions.formId],
    references: [forms.id],
  }),
}));

export const formResponsesRelations = relations(formResponses, ({ one }) => ({
  form: one(forms, {
    fields: [formResponses.formId],
    references: [forms.id],
  }),
  respondent: one(users, {
    fields: [formResponses.respondentId],
    references: [users.id],
  }),
}));

// ============ TYPES ============

export type Form = typeof forms.$inferSelect;
export type NewForm = typeof forms.$inferInsert;
export type FormQuestion = typeof formQuestions.$inferSelect;
export type NewFormQuestion = typeof formQuestions.$inferInsert;
export type FormResponse = typeof formResponses.$inferSelect;
export type NewFormResponse = typeof formResponses.$inferInsert;
