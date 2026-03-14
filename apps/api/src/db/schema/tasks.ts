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
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users } from "./auth";
import { messages } from "./messenger";

// ============ ENUMS ============

export const taskStatusEnum = pgEnum("task_status", [
  "todo",
  "in_progress",
  "done",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "none",
  "low",
  "medium",
  "high",
  "urgent",
]);

export const taskDependencyTypeEnum = pgEnum("task_dependency_type", [
  "fs",
  "ss",
  "ff",
  "sf",
]);

// ============ TABLES ============

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
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
      .references(() => users.id),
    dueDate: timestamp("due_date", { withTimezone: true }),
    startDate: timestamp("start_date", { withTimezone: true }),
    parentTaskId: uuid("parent_task_id"),
    customFields: jsonb("custom_fields").default({}),
    recurrenceRule: varchar("recurrence_rule", { length: 255 }),
    sourceMessageId: uuid("source_message_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("tasks_org_id_idx").on(table.orgId),
    index("tasks_creator_id_idx").on(table.creatorId),
    index("tasks_status_idx").on(table.status),
    index("tasks_due_date_idx").on(table.dueDate),
    index("tasks_parent_task_id_idx").on(table.parentTaskId),
  ]
);

export const taskLists = pgTable(
  "task_lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: varchar("name", { length: 255 }).notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    settings: jsonb("settings").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("task_lists_org_id_idx").on(table.orgId),
    index("task_lists_owner_id_idx").on(table.ownerId),
  ]
);

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
    index("task_list_items_task_list_id_idx").on(table.taskListId),
    index("task_list_items_task_id_idx").on(table.taskId),
  ]
);

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
    index("task_dependencies_task_id_idx").on(table.taskId),
    index("task_dependencies_depends_on_idx").on(table.dependsOnTaskId),
  ]
);

export const taskComments = pgTable(
  "task_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("task_comments_task_id_idx").on(table.taskId),
    index("task_comments_user_id_idx").on(table.userId),
  ]
);

// ============ RELATIONS ============

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [tasks.orgId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [tasks.creatorId],
    references: [users.id],
  }),
  parentTask: one(tasks, {
    fields: [tasks.parentTaskId],
    references: [tasks.id],
    relationName: "subtasks",
  }),
  subtasks: many(tasks, { relationName: "subtasks" }),
  sourceMessage: one(messages, {
    fields: [tasks.sourceMessageId],
    references: [messages.id],
  }),
  comments: many(taskComments),
  listItems: many(taskListItems),
}));

export const taskListsRelations = relations(taskLists, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [taskLists.orgId],
    references: [organizations.id],
  }),
  owner: one(users, {
    fields: [taskLists.ownerId],
    references: [users.id],
  }),
  items: many(taskListItems),
}));

export const taskListItemsRelations = relations(taskListItems, ({ one }) => ({
  taskList: one(taskLists, {
    fields: [taskListItems.taskListId],
    references: [taskLists.id],
  }),
  task: one(tasks, {
    fields: [taskListItems.taskId],
    references: [tasks.id],
  }),
}));

export const taskDependenciesRelations = relations(
  taskDependencies,
  ({ one }) => ({
    task: one(tasks, {
      fields: [taskDependencies.taskId],
      references: [tasks.id],
      relationName: "dependsOn",
    }),
    dependsOn: one(tasks, {
      fields: [taskDependencies.dependsOnTaskId],
      references: [tasks.id],
      relationName: "dependedOnBy",
    }),
  })
);

export const taskCommentsRelations = relations(taskComments, ({ one }) => ({
  task: one(tasks, {
    fields: [taskComments.taskId],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [taskComments.userId],
    references: [users.id],
  }),
}));

// ============ TYPES ============

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TaskList = typeof taskLists.$inferSelect;
export type NewTaskList = typeof taskLists.$inferInsert;
export type TaskComment = typeof taskComments.$inferSelect;
export type NewTaskComment = typeof taskComments.$inferInsert;
