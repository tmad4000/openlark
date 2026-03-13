import { pgTable, uuid, varchar, timestamp, jsonb, pgEnum, index, integer } from "drizzle-orm/pg-core";
import { users } from "./users";
import { organizations } from "./organizations";

// AI job type enum
export const aiJobTypeEnum = pgEnum("ai_job_type", [
  "complete",
  "rewrite",
  "summarize",
  "expand",
  "adjust_tone",
]);

// AI job status enum
export const aiJobStatusEnum = pgEnum("ai_job_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

// AI jobs table
export const aiJobs = pgTable("ai_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: aiJobTypeEnum("type").notNull(),
  input: jsonb("input").$type<{
    prompt?: string;
    context?: string;
    text?: string;
    tone?: string;
  }>().notNull(),
  output: jsonb("output").$type<{
    text?: string;
    error?: string;
  }>(),
  status: aiJobStatusEnum("status").notNull().default("pending"),
  model: varchar("model", { length: 100 }),
  costTokens: integer("cost_tokens"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("ai_jobs_user_id_idx").on(table.userId),
  index("ai_jobs_org_id_idx").on(table.orgId),
  index("ai_jobs_status_idx").on(table.status),
  index("ai_jobs_created_at_idx").on(table.createdAt),
]);

export type AiJob = typeof aiJobs.$inferSelect;
export type InsertAiJob = typeof aiJobs.$inferInsert;
