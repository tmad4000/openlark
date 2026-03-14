import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  status: z.enum(["todo", "in_progress", "done"]).optional().default("todo"),
  priority: z
    .enum(["none", "low", "medium", "high", "urgent"])
    .optional()
    .default("none"),
  assigneeIds: z.array(z.string().uuid()).optional().default([]),
  dueDate: z.string().datetime().optional(),
  startDate: z.string().datetime().optional(),
  parentTaskId: z.string().uuid().optional(),
  customFields: z.record(z.unknown()).optional(),
  recurrenceRule: z.string().max(255).optional(),
  taskListId: z.string().uuid().optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  priority: z.enum(["none", "low", "medium", "high", "urgent"]).optional(),
  assigneeIds: z.array(z.string().uuid()).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  parentTaskId: z.string().uuid().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
  recurrenceRule: z.string().max(255).nullable().optional(),
});

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const createTaskFromMessageSchema = z.object({
  messageId: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
  assigneeIds: z.array(z.string().uuid()).optional().default([]),
  dueDate: z.string().datetime().optional(),
  taskListId: z.string().uuid().optional(),
});

export type CreateTaskFromMessageInput = z.infer<
  typeof createTaskFromMessageSchema
>;

export const tasksQuerySchema = z.object({
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  assignee: z.string().uuid().optional(),
  dueBefore: z.string().datetime().optional(),
  dueAfter: z.string().datetime().optional(),
  listId: z.string().uuid().optional(),
  parentTaskId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type TasksQueryInput = z.infer<typeof tasksQuerySchema>;

export const createTaskListSchema = z.object({
  name: z.string().min(1).max(255),
  settings: z.record(z.unknown()).optional(),
});

export const createTaskCommentSchema = z.object({
  content: z.string().min(1),
});

export const createTaskDependencySchema = z.object({
  dependsOnTaskId: z.string().uuid(),
  type: z.enum(["fs", "ss", "ff", "sf"]).optional().default("fs"),
});
