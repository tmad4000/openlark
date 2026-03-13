import { FastifyInstance } from "fastify";
import { db } from "../db";
import {
  tasks,
  taskLists,
  taskListItems,
  taskDependencies,
  taskComments,
  messages,
  users,
} from "../db/schema";
import { eq, and, desc, lt, inArray, sql } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_STATUSES = ["todo", "in_progress", "done"] as const;
const VALID_PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
const VALID_DEP_TYPES = ["fs", "ss", "ff", "sf"] as const;

interface CreateTaskBody {
  title: string;
  description?: string;
  status?: (typeof VALID_STATUSES)[number];
  priority?: (typeof VALID_PRIORITIES)[number];
  assignee_ids?: string[];
  due_date?: string;
  start_date?: string;
  parent_task_id?: string;
  custom_fields?: Record<string, unknown>;
  recurrence_rule?: string;
  list_id?: string;
}

interface UpdateTaskBody {
  title?: string;
  description?: string;
  status?: (typeof VALID_STATUSES)[number];
  priority?: (typeof VALID_PRIORITIES)[number];
  assignee_ids?: string[];
  due_date?: string | null;
  start_date?: string | null;
  parent_task_id?: string | null;
  custom_fields?: Record<string, unknown>;
  recurrence_rule?: string | null;
}

interface TasksQuery {
  cursor?: string;
  limit?: string;
  status?: string;
  assignee?: string;
  due_date?: string;
  list?: string;
}

interface CreateFromMessageBody {
  message_id: string;
  title?: string;
  assignee_ids?: string[];
  due_date?: string;
  priority?: (typeof VALID_PRIORITIES)[number];
}

interface CreateCommentBody {
  content: string;
}

export async function tasksRoutes(fastify: FastifyInstance) {
  // POST /tasks - Create a task
  fastify.post<{ Body: CreateTaskBody }>(
    "/tasks",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { title, description, status, priority, assignee_ids, due_date, start_date, parent_task_id, custom_fields, recurrence_rule, list_id } = request.body || {};

      if (!title || typeof title !== "string" || title.trim().length === 0) {
        return reply.status(400).send({ error: "Title is required" });
      }
      if (title.length > 500) {
        return reply.status(400).send({ error: "Title must be 500 characters or less" });
      }
      if (status && !VALID_STATUSES.includes(status)) {
        return reply.status(400).send({ error: "Invalid status" });
      }
      if (priority && !VALID_PRIORITIES.includes(priority)) {
        return reply.status(400).send({ error: "Invalid priority" });
      }
      if (assignee_ids && !Array.isArray(assignee_ids)) {
        return reply.status(400).send({ error: "assignee_ids must be an array" });
      }
      if (assignee_ids) {
        for (const id of assignee_ids) {
          if (!UUID_REGEX.test(id)) {
            return reply.status(400).send({ error: "Invalid assignee ID format" });
          }
        }
      }
      if (parent_task_id && !UUID_REGEX.test(parent_task_id)) {
        return reply.status(400).send({ error: "Invalid parent_task_id format" });
      }

      const [task] = await db
        .insert(tasks)
        .values({
          orgId: user.orgId!,
          title: title.trim(),
          description: description || null,
          status: status || "todo",
          priority: priority || "none",
          assigneeIds: assignee_ids || [],
          creatorId: user.id,
          dueDate: due_date ? new Date(due_date) : null,
          startDate: start_date ? new Date(start_date) : null,
          parentTaskId: parent_task_id || null,
          customFields: custom_fields || {},
          recurrenceRule: recurrence_rule || null,
          completedAt: status === "done" ? new Date() : null,
        })
        .returning();

      // If list_id provided, add to list
      if (list_id && UUID_REGEX.test(list_id)) {
        const [list] = await db
          .select()
          .from(taskLists)
          .where(and(eq(taskLists.id, list_id), eq(taskLists.orgId, user.orgId!)))
          .limit(1);

        if (list) {
          // Get max position
          const [maxPos] = await db
            .select({ max: sql<number>`COALESCE(MAX(${taskListItems.position}), -1)` })
            .from(taskListItems)
            .where(eq(taskListItems.taskListId, list_id));

          await db.insert(taskListItems).values({
            taskListId: list_id,
            taskId: task.id,
            position: (maxPos?.max ?? -1) + 1,
          });
        }
      }

      return reply.status(201).send({ task });
    }
  );

  // GET /tasks - List tasks with filtering
  fastify.get<{ Querystring: TasksQuery }>(
    "/tasks",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { cursor, limit: limitStr, status, assignee, due_date, list } = request.query;

      const limit = Math.min(Math.max(parseInt(limitStr || "50", 10) || 50, 1), 100);

      const conditions = [eq(tasks.orgId, user.orgId!)];

      if (status && VALID_STATUSES.includes(status as any)) {
        conditions.push(eq(tasks.status, status as any));
      }
      if (assignee && UUID_REGEX.test(assignee)) {
        conditions.push(sql`${assignee}::uuid = ANY(${tasks.assigneeIds})`);
      }
      if (due_date) {
        const dueDate = new Date(due_date);
        if (!isNaN(dueDate.getTime())) {
          // Filter tasks due on or before this date
          const nextDay = new Date(dueDate);
          nextDay.setDate(nextDay.getDate() + 1);
          conditions.push(lt(tasks.dueDate, nextDay));
        }
      }
      if (cursor && UUID_REGEX.test(cursor)) {
        // Get the created_at of the cursor task for keyset pagination
        const [cursorTask] = await db
          .select({ createdAt: tasks.createdAt })
          .from(tasks)
          .where(eq(tasks.id, cursor))
          .limit(1);
        if (cursorTask) {
          conditions.push(lt(tasks.createdAt, cursorTask.createdAt));
        }
      }

      let query = db
        .select()
        .from(tasks)
        .where(and(...conditions))
        .orderBy(desc(tasks.createdAt))
        .limit(limit + 1);

      // If filtering by list, join with task_list_items
      if (list && UUID_REGEX.test(list)) {
        const listItemRows = await db
          .select({ taskId: taskListItems.taskId })
          .from(taskListItems)
          .where(eq(taskListItems.taskListId, list));

        const taskIds = listItemRows.map((r) => r.taskId);
        if (taskIds.length === 0) {
          return reply.send({ tasks: [], nextCursor: null, hasMore: false });
        }
        conditions.push(inArray(tasks.id, taskIds));

        query = db
          .select()
          .from(tasks)
          .where(and(...conditions))
          .orderBy(desc(tasks.createdAt))
          .limit(limit + 1);
      }

      const rows = await query;
      const hasMore = rows.length > limit;
      const results = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? results[results.length - 1]?.id : null;

      return reply.send({ tasks: results, nextCursor, hasMore });
    }
  );

  // GET /tasks/:id - Get a single task
  fastify.get<{ Params: { id: string } }>(
    "/tasks/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid task ID" });
      }

      const [task] = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, id), eq(tasks.orgId, request.user.orgId!)))
        .limit(1);

      if (!task) {
        return reply.status(404).send({ error: "Task not found" });
      }

      return reply.send({ task });
    }
  );

  // PATCH /tasks/:id - Update a task
  fastify.patch<{ Params: { id: string }; Body: UpdateTaskBody }>(
    "/tasks/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid task ID" });
      }

      const [existing] = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, id), eq(tasks.orgId, request.user.orgId!)))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ error: "Task not found" });
      }

      const body = request.body || {};
      const updates: Record<string, unknown> = { updatedAt: new Date() };

      if (body.title !== undefined) {
        if (typeof body.title !== "string" || body.title.trim().length === 0) {
          return reply.status(400).send({ error: "Title cannot be empty" });
        }
        updates.title = body.title.trim();
      }
      if (body.description !== undefined) {
        updates.description = body.description;
      }
      if (body.status !== undefined) {
        if (!VALID_STATUSES.includes(body.status)) {
          return reply.status(400).send({ error: "Invalid status" });
        }
        updates.status = body.status;
        if (body.status === "done" && existing.status !== "done") {
          updates.completedAt = new Date();
        } else if (body.status !== "done") {
          updates.completedAt = null;
        }
      }
      if (body.priority !== undefined) {
        if (!VALID_PRIORITIES.includes(body.priority)) {
          return reply.status(400).send({ error: "Invalid priority" });
        }
        updates.priority = body.priority;
      }
      if (body.assignee_ids !== undefined) {
        if (!Array.isArray(body.assignee_ids)) {
          return reply.status(400).send({ error: "assignee_ids must be an array" });
        }
        updates.assigneeIds = body.assignee_ids;
      }
      if (body.due_date !== undefined) {
        updates.dueDate = body.due_date ? new Date(body.due_date) : null;
      }
      if (body.start_date !== undefined) {
        updates.startDate = body.start_date ? new Date(body.start_date) : null;
      }
      if (body.parent_task_id !== undefined) {
        updates.parentTaskId = body.parent_task_id;
      }
      if (body.custom_fields !== undefined) {
        updates.customFields = body.custom_fields;
      }
      if (body.recurrence_rule !== undefined) {
        updates.recurrenceRule = body.recurrence_rule;
      }

      const [updated] = await db
        .update(tasks)
        .set(updates)
        .where(eq(tasks.id, id))
        .returning();

      return reply.send({ task: updated });
    }
  );

  // DELETE /tasks/:id - Delete a task
  fastify.delete<{ Params: { id: string } }>(
    "/tasks/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid task ID" });
      }

      const [existing] = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.id, id), eq(tasks.orgId, request.user.orgId!)))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ error: "Task not found" });
      }

      await db.delete(tasks).where(eq(tasks.id, id));

      return reply.send({ success: true });
    }
  );

  // POST /tasks/from-message - Create a task from a chat message
  fastify.post<{ Body: CreateFromMessageBody }>(
    "/tasks/from-message",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { message_id, title, assignee_ids, due_date, priority } = request.body || {};

      if (!message_id || !UUID_REGEX.test(message_id)) {
        return reply.status(400).send({ error: "Valid message_id is required" });
      }

      if (priority && !VALID_PRIORITIES.includes(priority)) {
        return reply.status(400).send({ error: "Invalid priority" });
      }

      // Fetch the message
      const [message] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, message_id))
        .limit(1);

      if (!message) {
        return reply.status(404).send({ error: "Message not found" });
      }

      // Derive title from message content if not provided
      const taskTitle =
        title?.trim() ||
        (typeof (message.content as any)?.text === "string"
          ? (message.content as any).text.slice(0, 500)
          : "Task from message");

      const [task] = await db
        .insert(tasks)
        .values({
          orgId: user.orgId!,
          title: taskTitle,
          description: `Created from message ${message_id}`,
          status: "todo",
          priority: priority || "none",
          assigneeIds: assignee_ids || [],
          creatorId: user.id,
          dueDate: due_date ? new Date(due_date) : null,
          customFields: { source_message_id: message_id, source_chat_id: message.chatId },
        })
        .returning();

      return reply.status(201).send({ task });
    }
  );

  // GET /tasks/:id/comments - List comments for a task
  fastify.get<{ Params: { id: string }; Querystring: { cursor?: string; limit?: string } }>(
    "/tasks/:id/comments",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid task ID" });
      }

      // Verify task exists and belongs to org
      const [task] = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.id, id), eq(tasks.orgId, request.user.orgId!)))
        .limit(1);

      if (!task) {
        return reply.status(404).send({ error: "Task not found" });
      }

      const limit = Math.min(Math.max(parseInt(request.query.limit || "50", 10) || 50, 1), 100);
      const conditions = [eq(taskComments.taskId, id)];

      if (request.query.cursor && UUID_REGEX.test(request.query.cursor)) {
        const [cursorComment] = await db
          .select({ createdAt: taskComments.createdAt })
          .from(taskComments)
          .where(eq(taskComments.id, request.query.cursor))
          .limit(1);
        if (cursorComment) {
          conditions.push(lt(taskComments.createdAt, cursorComment.createdAt));
        }
      }

      const rows = await db
        .select({
          id: taskComments.id,
          taskId: taskComments.taskId,
          userId: taskComments.userId,
          content: taskComments.content,
          createdAt: taskComments.createdAt,
          userName: users.displayName,
        })
        .from(taskComments)
        .leftJoin(users, eq(taskComments.userId, users.id))
        .where(and(...conditions))
        .orderBy(desc(taskComments.createdAt))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const results = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? results[results.length - 1]?.id : null;

      return reply.send({ comments: results, nextCursor, hasMore });
    }
  );

  // POST /tasks/:id/comments - Add a comment to a task
  fastify.post<{ Params: { id: string }; Body: CreateCommentBody }>(
    "/tasks/:id/comments",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid task ID" });
      }

      const { content } = request.body || {};
      if (!content || typeof content !== "string" || content.trim().length === 0) {
        return reply.status(400).send({ error: "Content is required" });
      }

      // Verify task exists and belongs to org
      const [task] = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.id, id), eq(tasks.orgId, request.user.orgId!)))
        .limit(1);

      if (!task) {
        return reply.status(404).send({ error: "Task not found" });
      }

      const [comment] = await db
        .insert(taskComments)
        .values({
          taskId: id,
          userId: request.user.id,
          content: content.trim(),
        })
        .returning();

      return reply.status(201).send({ comment });
    }
  );

  // Task Lists CRUD
  // POST /task-lists - Create a task list
  fastify.post<{ Body: { name: string; settings?: Record<string, unknown> } }>(
    "/task-lists",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { name, settings } = request.body || {};

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return reply.status(400).send({ error: "Name is required" });
      }

      const [list] = await db
        .insert(taskLists)
        .values({
          orgId: request.user.orgId!,
          name: name.trim(),
          ownerId: request.user.id,
          settings: settings || {},
        })
        .returning();

      return reply.status(201).send({ taskList: list });
    }
  );

  // GET /task-lists - List task lists
  fastify.get(
    "/task-lists",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const lists = await db
        .select()
        .from(taskLists)
        .where(eq(taskLists.orgId, request.user.orgId!))
        .orderBy(desc(taskLists.createdAt));

      return reply.send({ taskLists: lists });
    }
  );
}
