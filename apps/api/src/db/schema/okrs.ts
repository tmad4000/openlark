import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  numeric,
  boolean,
  pgEnum,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users } from "./auth";

// ============ ENUMS ============

export const okrCycleStatusEnum = pgEnum("okr_cycle_status", [
  "creating",
  "aligning",
  "following_up",
  "reviewing",
]);

export const objectiveVisibilityEnum = pgEnum("objective_visibility", [
  "everyone",
  "leaders",
  "team",
]);

export const objectiveStatusEnum = pgEnum("objective_status", [
  "draft",
  "active",
  "completed",
]);

// ============ TABLES ============

export const okrCycles = pgTable(
  "okr_cycles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: varchar("name", { length: 255 }).notNull(),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }).notNull(),
    status: okrCycleStatusEnum("status").notNull().default("creating"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("okr_cycles_org_id_idx").on(table.orgId),
    index("okr_cycles_status_idx").on(table.status),
  ]
);

export const objectives = pgTable(
  "objectives",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => okrCycles.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    parentObjectiveId: uuid("parent_objective_id"),
    visibility: objectiveVisibilityEnum("visibility")
      .notNull()
      .default("everyone"),
    status: objectiveStatusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("objectives_cycle_id_idx").on(table.cycleId),
    index("objectives_owner_id_idx").on(table.ownerId),
    index("objectives_parent_objective_id_idx").on(table.parentObjectiveId),
    index("objectives_status_idx").on(table.status),
  ]
);

export const keyResults = pgTable(
  "key_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).notNull(),
    targetValue: numeric("target_value").notNull(),
    currentValue: numeric("current_value").notNull().default("0"),
    weight: numeric("weight").notNull().default("1"),
    score: numeric("score").notNull().default("0"),
    unit: varchar("unit", { length: 50 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("key_results_objective_id_idx").on(table.objectiveId),
  ]
);

export const okrCheckins = pgTable(
  "okr_checkins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    keyResultId: uuid("key_result_id")
      .notNull()
      .references(() => keyResults.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    value: numeric("value").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("okr_checkins_key_result_id_idx").on(table.keyResultId),
    index("okr_checkins_user_id_idx").on(table.userId),
  ]
);

export const okrAlignments = pgTable(
  "okr_alignments",
  {
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    alignedToObjectiveId: uuid("aligned_to_objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    confirmed: boolean("confirmed").notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.objectiveId, table.alignedToObjectiveId] }),
    index("okr_alignments_aligned_to_idx").on(table.alignedToObjectiveId),
  ]
);

// ============ RELATIONS ============

export const okrCyclesRelations = relations(okrCycles, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [okrCycles.orgId],
    references: [organizations.id],
  }),
  objectives: many(objectives),
}));

export const objectivesRelations = relations(objectives, ({ one, many }) => ({
  cycle: one(okrCycles, {
    fields: [objectives.cycleId],
    references: [okrCycles.id],
  }),
  owner: one(users, {
    fields: [objectives.ownerId],
    references: [users.id],
  }),
  parent: one(objectives, {
    fields: [objectives.parentObjectiveId],
    references: [objectives.id],
    relationName: "parentChild",
  }),
  children: many(objectives, { relationName: "parentChild" }),
  keyResults: many(keyResults),
}));

export const keyResultsRelations = relations(keyResults, ({ one, many }) => ({
  objective: one(objectives, {
    fields: [keyResults.objectiveId],
    references: [objectives.id],
  }),
  checkins: many(okrCheckins),
}));

export const okrCheckinsRelations = relations(okrCheckins, ({ one }) => ({
  keyResult: one(keyResults, {
    fields: [okrCheckins.keyResultId],
    references: [keyResults.id],
  }),
  user: one(users, {
    fields: [okrCheckins.userId],
    references: [users.id],
  }),
}));

// ============ TYPES ============

export type OkrCycle = typeof okrCycles.$inferSelect;
export type NewOkrCycle = typeof okrCycles.$inferInsert;
export type Objective = typeof objectives.$inferSelect;
export type NewObjective = typeof objectives.$inferInsert;
export type KeyResult = typeof keyResults.$inferSelect;
export type NewKeyResult = typeof keyResults.$inferInsert;
export type OkrCheckin = typeof okrCheckins.$inferSelect;
export type NewOkrCheckin = typeof okrCheckins.$inferInsert;
export type OkrAlignment = typeof okrAlignments.$inferSelect;
export type NewOkrAlignment = typeof okrAlignments.$inferInsert;
