import { db } from "../../db/index.js";
import {
  tasks,
  taskLists,
  taskListItems,
  taskDependencies,
  taskComments,
  messages,
} from "../../db/schema/index.js";
import { eq, and, isNull, lte, gte, inArray, desc, asc, sql } from "drizzle-orm";
import type {
  CreateTaskInput,
  UpdateTaskInput,
  CreateTaskFromMessageInput,
  TasksQueryInput,
} from "./tasks.schemas.js";

export class TasksService {
  // ============ TASK OPERATIONS ============

  async createTask(
    input: CreateTaskInput,
    userId: string,
    orgId: string
  ) {
    const [task] = await db
      .insert(tasks)
      .values({
        orgId,
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority,
        assigneeIds: input.assigneeIds ?? [],
        creatorId: userId,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        parentTaskId: input.parentTaskId,
        customFields: input.customFields ?? {},
        recurrenceRule: input.recurrenceRule,
      })
      .returning();

    if (!task) {
      throw new Error("Failed to create task");
    }

    // Add to list if specified
    if (input.taskListId) {
      await db.insert(taskListItems).values({
        taskListId: input.taskListId,
        taskId: task.id,
        position: 0,
      });
    }

    return task;
  }

  async createTaskFromMessage(
    input: CreateTaskFromMessageInput,
    userId: string,
    orgId: string
  ) {
    // Fetch the message to use as task content
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, input.messageId));

    if (!message) {
      return null;
    }

    const contentStr =
      typeof message.contentJson === "string"
        ? message.contentJson
        : message.contentJson
          ? JSON.stringify(message.contentJson)
          : null;

    const title =
      input.title ||
      (contentStr ? contentStr.slice(0, 500) : "Task from message");

    const [task] = await db
      .insert(tasks)
      .values({
        orgId,
        title,
        description: contentStr || undefined,
        status: "todo",
        priority: "none",
        assigneeIds: input.assigneeIds ?? [],
        creatorId: userId,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        sourceMessageId: input.messageId,
      })
      .returning();

    if (!task) {
      throw new Error("Failed to create task from message");
    }

    if (input.taskListId) {
      await db.insert(taskListItems).values({
        taskListId: input.taskListId,
        taskId: task.id,
        position: 0,
      });
    }

    return task;
  }

  async getTasks(orgId: string, query: TasksQueryInput) {
    const conditions = [
      eq(tasks.orgId, orgId),
      isNull(tasks.deletedAt),
    ];

    if (query.status) {
      conditions.push(eq(tasks.status, query.status));
    }

    if (query.assignee) {
      conditions.push(
        sql`${query.assignee} = ANY(${tasks.assigneeIds})`
      );
    }

    if (query.dueBefore) {
      conditions.push(lte(tasks.dueDate, new Date(query.dueBefore)));
    }

    if (query.dueAfter) {
      conditions.push(gte(tasks.dueDate, new Date(query.dueAfter)));
    }

    if (query.parentTaskId) {
      conditions.push(eq(tasks.parentTaskId, query.parentTaskId));
    }

    let baseQuery = db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(desc(tasks.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    if (query.listId) {
      // Filter by task list membership
      const listItemRows = await db
        .select({ taskId: taskListItems.taskId })
        .from(taskListItems)
        .where(eq(taskListItems.taskListId, query.listId));

      const taskIds = listItemRows.map((r) => r.taskId);
      if (taskIds.length === 0) {
        return [];
      }

      conditions.push(inArray(tasks.id, taskIds));

      return db
        .select()
        .from(tasks)
        .where(and(...conditions))
        .orderBy(desc(tasks.createdAt))
        .limit(query.limit)
        .offset(query.offset);
    }

    return baseQuery;
  }

  async getTaskById(taskId: string) {
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt)));
    return task || null;
  }

  async updateTask(taskId: string, input: UpdateTaskInput, userId: string) {
    const existing = await this.getTaskById(taskId);
    if (!existing) return null;

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (input.title !== undefined) updates.title = input.title;
    if (input.description !== undefined) updates.description = input.description;
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.assigneeIds !== undefined) updates.assigneeIds = input.assigneeIds;
    if (input.dueDate !== undefined)
      updates.dueDate = input.dueDate ? new Date(input.dueDate) : null;
    if (input.startDate !== undefined)
      updates.startDate = input.startDate ? new Date(input.startDate) : null;
    if (input.parentTaskId !== undefined) updates.parentTaskId = input.parentTaskId;
    if (input.customFields !== undefined) updates.customFields = input.customFields;
    if (input.recurrenceRule !== undefined) updates.recurrenceRule = input.recurrenceRule;

    if (input.status !== undefined) {
      updates.status = input.status;
      if (input.status === "done" && existing.status !== "done") {
        updates.completedAt = new Date();
      } else if (input.status !== "done") {
        updates.completedAt = null;
      }
    }

    const [updated] = await db
      .update(tasks)
      .set(updates)
      .where(eq(tasks.id, taskId))
      .returning();

    return updated || null;
  }

  async deleteTask(taskId: string) {
    const [deleted] = await db
      .update(tasks)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt)))
      .returning();
    return deleted || null;
  }

  // ============ TASK LIST OPERATIONS ============

  async createTaskList(
    input: { name: string; settings?: Record<string, unknown> },
    userId: string,
    orgId: string
  ) {
    const [list] = await db
      .insert(taskLists)
      .values({
        orgId,
        name: input.name,
        ownerId: userId,
        settings: input.settings ?? {},
      })
      .returning();
    return list!;
  }

  async getTaskLists(orgId: string) {
    return db
      .select()
      .from(taskLists)
      .where(and(eq(taskLists.orgId, orgId), isNull(taskLists.deletedAt)))
      .orderBy(asc(taskLists.name));
  }

  // ============ TASK COMMENTS ============

  async addComment(taskId: string, userId: string, content: string) {
    const [comment] = await db
      .insert(taskComments)
      .values({ taskId, userId, content })
      .returning();
    return comment!;
  }

  async getComments(taskId: string) {
    return db
      .select()
      .from(taskComments)
      .where(
        and(eq(taskComments.taskId, taskId), isNull(taskComments.deletedAt))
      )
      .orderBy(asc(taskComments.createdAt));
  }

  // ============ TASK DEPENDENCIES ============

  async addDependency(
    taskId: string,
    dependsOnTaskId: string,
    type: "fs" | "ss" | "ff" | "sf" = "fs"
  ) {
    const [dep] = await db
      .insert(taskDependencies)
      .values({ taskId, dependsOnTaskId, type })
      .returning();
    return dep!;
  }

  async getDependencies(taskId: string) {
    return db
      .select()
      .from(taskDependencies)
      .where(eq(taskDependencies.taskId, taskId));
  }
}

export const tasksService = new TasksService();
