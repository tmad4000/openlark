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
import { organizations } from "./organizations";
import { users } from "./users";

// OKR cycle status enum
export const okrCycleStatusEnum = pgEnum("okr_cycle_status", [
  "creating",
  "aligning",
  "following_up",
  "reviewing",
]);

// Objective visibility enum
export const objectiveVisibilityEnum = pgEnum("objective_visibility", [
  "everyone",
  "leaders",
  "team",
]);

// Objective status enum
export const objectiveStatusEnum = pgEnum("objective_status", [
  "draft",
  "active",
  "completed",
]);

// OKR cycles table
export const okrCycles = pgTable(
  "okr_cycles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date").notNull(),
    status: okrCycleStatusEnum("status").notNull().default("creating"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("okr_cycles_org_id_idx").on(table.orgId),
  ]
);

export type OkrCycle = typeof okrCycles.$inferSelect;
export type NewOkrCycle = typeof okrCycles.$inferInsert;

// Objectives table
export const objectives = pgTable(
  "objectives",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => okrCycles.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    parentObjectiveId: uuid("parent_objective_id"),
    visibility: objectiveVisibilityEnum("visibility").notNull().default("everyone"),
    status: objectiveStatusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("objectives_cycle_id_idx").on(table.cycleId),
    index("objectives_owner_id_idx").on(table.ownerId),
    index("objectives_parent_objective_id_idx").on(table.parentObjectiveId),
  ]
);

export type Objective = typeof objectives.$inferSelect;
export type NewObjective = typeof objectives.$inferInsert;

// Key results table
export const keyResults = pgTable(
  "key_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).notNull(),
    targetValue: numeric("target_value").notNull(),
    currentValue: numeric("current_value").notNull().default("0"),
    weight: numeric("weight").notNull().default("1"),
    score: numeric("score").notNull().default("0"),
    unit: varchar("unit", { length: 50 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("key_results_objective_id_idx").on(table.objectiveId),
  ]
);

export type KeyResult = typeof keyResults.$inferSelect;
export type NewKeyResult = typeof keyResults.$inferInsert;

// OKR check-ins table
export const okrCheckins = pgTable(
  "okr_checkins",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    keyResultId: uuid("key_result_id")
      .notNull()
      .references(() => keyResults.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    value: numeric("value").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("okr_checkins_key_result_id_idx").on(table.keyResultId),
    index("okr_checkins_user_id_idx").on(table.userId),
  ]
);

export type OkrCheckin = typeof okrCheckins.$inferSelect;
export type NewOkrCheckin = typeof okrCheckins.$inferInsert;

// OKR alignments table
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
  ]
);

export type OkrAlignment = typeof okrAlignments.$inferSelect;
export type NewOkrAlignment = typeof okrAlignments.$inferInsert;
