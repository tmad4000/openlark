import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { users, organizations } from "./auth.js";

export const aiJobStatusEnum = pgEnum("ai_job_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const aiJobs = pgTable(
  "ai_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    type: varchar("type", { length: 50 }).notNull(), // rewrite, summarize, expand, tone, complete
    input: jsonb("input").notNull(),
    output: jsonb("output"),
    status: aiJobStatusEnum("status").notNull().default("pending"),
    model: varchar("model", { length: 100 }),
    costTokens: integer("cost_tokens"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("ai_jobs_org_id_idx").on(table.orgId),
    index("ai_jobs_user_id_idx").on(table.userId),
    index("ai_jobs_status_idx").on(table.status),
    index("ai_jobs_created_at_idx").on(table.createdAt),
  ]
);

export type AiJob = typeof aiJobs.$inferSelect;
export type NewAiJob = typeof aiJobs.$inferInsert;
