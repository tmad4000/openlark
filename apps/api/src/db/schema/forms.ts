import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  pgEnum,
  index,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";
import { bases } from "./base";
import { baseTables } from "./base";

// Form question type enum
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

// Forms table
export const forms = pgTable(
  "forms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    baseId: uuid("base_id").references(() => bases.id, {
      onDelete: "set null",
    }),
    tableId: uuid("table_id").references(() => baseTables.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    settings: jsonb("settings")
      .$type<Record<string, unknown>>()
      .default({}),
    theme: jsonb("theme").$type<Record<string, unknown>>().default({}),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("forms_org_id_idx").on(table.orgId),
    index("forms_creator_id_idx").on(table.creatorId),
  ]
);

export type Form = typeof forms.$inferSelect;
export type InsertForm = typeof forms.$inferInsert;

// Form questions table
export const formQuestions = pgTable(
  "form_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    formId: uuid("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    type: formQuestionTypeEnum("type").notNull(),
    config: jsonb("config")
      .$type<Record<string, unknown>>()
      .default({}),
    position: integer("position").notNull().default(0),
    required: boolean("required").notNull().default(false),
    displayCondition: jsonb("display_condition").$type<Record<
      string,
      unknown
    > | null>(),
  },
  (table) => [index("form_questions_form_id_idx").on(table.formId)]
);

export type FormQuestion = typeof formQuestions.$inferSelect;
export type InsertFormQuestion = typeof formQuestions.$inferInsert;

// Form responses table
export const formResponses = pgTable(
  "form_responses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    formId: uuid("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    respondentId: uuid("respondent_id").references(() => users.id, {
      onDelete: "set null",
    }),
    answers: jsonb("answers")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("form_responses_form_id_idx").on(table.formId),
    index("form_responses_respondent_id_idx").on(table.respondentId),
  ]
);

export type FormResponse = typeof formResponses.$inferSelect;
export type InsertFormResponse = typeof formResponses.$inferInsert;
