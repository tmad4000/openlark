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
  primaryKey,
  AnyPgColumn,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

// Task status enum
export const taskStatusEnum = pgEnum("task_status", [
  "todo",
  "in_progress",
  "done",
]);

// Task priority enum
export const taskPriorityEnum = pgEnum("task_priority", [
  "none",
  "low",
  "medium",
  "high",
  "urgent",
]);

// Task dependency type enum
export const taskDependencyTypeEnum = pgEnum("task_dependency_type", [
  "fs",
  "ss",
  "ff",
  "sf",
]);

// Tasks table
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    status: taskStatusEnum("status").notNull().default("todo"),
    priority: taskPriorityEnum("priority").notNull().default("none"),
    assigneeIds: uuid("assignee_ids")
      .array()
      .notNull()
      .default([]),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    startDate: timestamp("start_date", { withTimezone: true }),
    parentTaskId: uuid("parent_task_id").references(
      (): AnyPgColumn => tasks.id
    ),
    customFields: jsonb("custom_fields")
      .$type<Record<string, unknown>>()
      .default({}),
    recurrenceRule: varchar("recurrence_rule", { length: 255 }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("tasks_org_id_idx").on(table.orgId),
    index("tasks_creator_id_idx").on(table.creatorId),
    index("tasks_status_idx").on(table.status),
    index("tasks_parent_task_id_idx").on(table.parentTaskId),
    index("tasks_due_date_idx").on(table.dueDate),
  ]
);

// Task lists table
export const taskLists = pgTable(
  "task_lists",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    settings: jsonb("settings")
      .$type<Record<string, unknown>>()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("task_lists_org_id_idx").on(table.orgId),
    index("task_lists_owner_id_idx").on(table.ownerId),
  ]
);

// Task list items junction table
export const taskListItems = pgTable(
  "task_list_items",
  {
    taskListId: uuid("task_list_id")
      .notNull()
      .references(() => taskLists.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.taskListId, table.taskId] }),
    index("task_list_items_task_id_idx").on(table.taskId),
  ]
);

// Task dependencies table
export const taskDependencies = pgTable(
  "task_dependencies",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    dependsOnTaskId: uuid("depends_on_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    type: taskDependencyTypeEnum("type").notNull().default("fs"),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.dependsOnTaskId] }),
    index("task_dependencies_depends_on_idx").on(table.dependsOnTaskId),
  ]
);

// Task comments table
export const taskComments = pgTable(
  "task_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("task_comments_task_id_idx").on(table.taskId),
  ]
);

// Type exports
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TaskList = typeof taskLists.$inferSelect;
export type NewTaskList = typeof taskLists.$inferInsert;
export type TaskListItem = typeof taskListItems.$inferSelect;
export type NewTaskListItem = typeof taskListItems.$inferInsert;
export type TaskDependency = typeof taskDependencies.$inferSelect;
export type NewTaskDependency = typeof taskDependencies.$inferInsert;
export type TaskComment = typeof taskComments.$inferSelect;
export type NewTaskComment = typeof taskComments.$inferInsert;
