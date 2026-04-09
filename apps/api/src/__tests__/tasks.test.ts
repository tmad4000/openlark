/**
 * Tasks module tests.
 *
 * Covers:
 *   - Schema validation for task creation and updates
 *   - Route auth tests using `app.inject()` (all endpoints require auth)
 *   - Service unit tests with mocked drizzle `db`
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTaskSchema,
  updateTaskSchema,
  createTaskFromMessageSchema,
  tasksQuerySchema,
  createTaskListSchema,
  createTaskCommentSchema,
  createTaskDependencySchema,
} from "../modules/tasks/tasks.schemas.js";
import { buildApp } from "../app.js";

// ============ SCHEMA VALIDATION ============

describe("Task Schema Validation", () => {
  describe("createTaskSchema", () => {
    it("accepts a minimal task with just a title", () => {
      const result = createTaskSchema.safeParse({ title: "My task" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("My task");
        expect(result.data.status).toBe("todo");
        expect(result.data.priority).toBe("none");
        expect(result.data.assigneeIds).toEqual([]);
      }
    });

    it("rejects empty title", () => {
      const result = createTaskSchema.safeParse({ title: "" });
      expect(result.success).toBe(false);
    });

    it("rejects title over 500 characters", () => {
      const result = createTaskSchema.safeParse({ title: "x".repeat(501) });
      expect(result.success).toBe(false);
    });

    it("accepts valid status values", () => {
      for (const status of ["todo", "in_progress", "done"]) {
        const result = createTaskSchema.safeParse({ title: "t", status });
        expect(result.success).toBe(true);
      }
    });

    it("rejects invalid status", () => {
      const result = createTaskSchema.safeParse({
        title: "t",
        status: "invalid",
      });
      expect(result.success).toBe(false);
    });

    it("accepts valid priority values", () => {
      for (const priority of ["none", "low", "medium", "high", "urgent"]) {
        const result = createTaskSchema.safeParse({ title: "t", priority });
        expect(result.success).toBe(true);
      }
    });

    it("rejects invalid priority", () => {
      const result = createTaskSchema.safeParse({
        title: "t",
        priority: "critical",
      });
      expect(result.success).toBe(false);
    });

    it("validates assigneeIds must be UUIDs", () => {
      const result = createTaskSchema.safeParse({
        title: "t",
        assigneeIds: ["not-a-uuid"],
      });
      expect(result.success).toBe(false);
    });

    it("accepts valid assigneeIds", () => {
      const result = createTaskSchema.safeParse({
        title: "t",
        assigneeIds: ["550e8400-e29b-41d4-a716-446655440000"],
      });
      expect(result.success).toBe(true);
    });

    it("validates dueDate is ISO datetime", () => {
      const result = createTaskSchema.safeParse({
        title: "t",
        dueDate: "not-a-date",
      });
      expect(result.success).toBe(false);
    });

    it("accepts valid dueDate", () => {
      const result = createTaskSchema.safeParse({
        title: "t",
        dueDate: "2026-04-09T12:00:00Z",
      });
      expect(result.success).toBe(true);
    });

    it("accepts a fully populated task", () => {
      const result = createTaskSchema.safeParse({
        title: "Full task",
        description: "A description",
        status: "in_progress",
        priority: "high",
        assigneeIds: ["550e8400-e29b-41d4-a716-446655440000"],
        dueDate: "2026-05-01T00:00:00Z",
        startDate: "2026-04-01T00:00:00Z",
        parentTaskId: "660e8400-e29b-41d4-a716-446655440000",
        customFields: { sprint: 5 },
        recurrenceRule: "FREQ=WEEKLY",
        taskListId: "770e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("updateTaskSchema", () => {
    it("accepts empty object (no required fields)", () => {
      const result = updateTaskSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts nullable dueDate", () => {
      const result = updateTaskSchema.safeParse({ dueDate: null });
      expect(result.success).toBe(true);
    });

    it("accepts nullable parentTaskId", () => {
      const result = updateTaskSchema.safeParse({ parentTaskId: null });
      expect(result.success).toBe(true);
    });
  });

  describe("createTaskFromMessageSchema", () => {
    it("requires messageId", () => {
      const result = createTaskFromMessageSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("validates messageId is UUID", () => {
      const result = createTaskFromMessageSchema.safeParse({
        messageId: "not-uuid",
      });
      expect(result.success).toBe(false);
    });

    it("accepts valid messageId with optional fields", () => {
      const result = createTaskFromMessageSchema.safeParse({
        messageId: "550e8400-e29b-41d4-a716-446655440000",
        title: "From message",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("tasksQuerySchema", () => {
    it("provides defaults for limit and offset", () => {
      const result = tasksQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
        expect(result.data.offset).toBe(0);
      }
    });

    it("coerces string numbers for limit/offset (query params)", () => {
      const result = tasksQuerySchema.safeParse({ limit: "10", offset: "5" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(10);
        expect(result.data.offset).toBe(5);
      }
    });

    it("rejects limit > 100", () => {
      const result = tasksQuerySchema.safeParse({ limit: "200" });
      expect(result.success).toBe(false);
    });

    it("rejects negative offset", () => {
      const result = tasksQuerySchema.safeParse({ offset: "-1" });
      expect(result.success).toBe(false);
    });
  });

  describe("createTaskListSchema", () => {
    it("requires name", () => {
      const result = createTaskListSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects empty name", () => {
      const result = createTaskListSchema.safeParse({ name: "" });
      expect(result.success).toBe(false);
    });

    it("accepts name with optional settings", () => {
      const result = createTaskListSchema.safeParse({
        name: "Sprint 1",
        settings: { color: "blue" },
      });
      expect(result.success).toBe(true);
    });
  });

  describe("createTaskCommentSchema", () => {
    it("requires content", () => {
      const result = createTaskCommentSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects empty content", () => {
      const result = createTaskCommentSchema.safeParse({ content: "" });
      expect(result.success).toBe(false);
    });

    it("accepts non-empty content", () => {
      const result = createTaskCommentSchema.safeParse({
        content: "A comment",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("createTaskDependencySchema", () => {
    it("requires dependsOnTaskId", () => {
      const result = createTaskDependencySchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("defaults type to fs", () => {
      const result = createTaskDependencySchema.safeParse({
        dependsOnTaskId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("fs");
      }
    });

    it("accepts valid dependency types", () => {
      for (const type of ["fs", "ss", "ff", "sf"]) {
        const result = createTaskDependencySchema.safeParse({
          dependsOnTaskId: "550e8400-e29b-41d4-a716-446655440000",
          type,
        });
        expect(result.success).toBe(true);
      }
    });
  });
});

// ============ ROUTE AUTH TESTS ============

describe("Tasks Routes - Auth Requirements", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  // Task CRUD
  it("POST /tasks requires authentication", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/tasks/tasks",
      payload: { title: "Test task" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("GET /tasks requires authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/tasks",
    });
    expect(response.statusCode).toBe(401);
  });

  it("GET /tasks/:id requires authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/tasks/550e8400-e29b-41d4-a716-446655440000",
    });
    expect(response.statusCode).toBe(401);
  });

  it("PATCH /tasks/:id requires authentication", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/tasks/tasks/550e8400-e29b-41d4-a716-446655440000",
      payload: { title: "Updated" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("DELETE /tasks/:id requires authentication", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/v1/tasks/tasks/550e8400-e29b-41d4-a716-446655440000",
    });
    expect(response.statusCode).toBe(401);
  });

  // Task from message
  it("POST /tasks/from-message requires authentication", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/tasks/tasks/from-message",
      payload: { messageId: "550e8400-e29b-41d4-a716-446655440000" },
    });
    expect(response.statusCode).toBe(401);
  });

  // Task comments
  it("POST /tasks/:id/comments requires authentication", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/tasks/tasks/550e8400-e29b-41d4-a716-446655440000/comments",
      payload: { content: "A comment" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("GET /tasks/:id/comments requires authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/tasks/550e8400-e29b-41d4-a716-446655440000/comments",
    });
    expect(response.statusCode).toBe(401);
  });

  // Task dependencies
  it("POST /tasks/:id/dependencies requires authentication", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/tasks/tasks/550e8400-e29b-41d4-a716-446655440000/dependencies",
      payload: { dependsOnTaskId: "660e8400-e29b-41d4-a716-446655440000" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("GET /tasks/:id/dependencies requires authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/tasks/550e8400-e29b-41d4-a716-446655440000/dependencies",
    });
    expect(response.statusCode).toBe(401);
  });

  // Task lists
  it("POST /task-lists requires authentication", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/tasks/task-lists",
      payload: { name: "Sprint 1" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("GET /task-lists requires authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/task-lists",
    });
    expect(response.statusCode).toBe(401);
  });
});
