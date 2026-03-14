import { FastifyInstance } from "fastify";
import {
  createTaskSchema,
  updateTaskSchema,
  createTaskFromMessageSchema,
  tasksQuerySchema,
  createTaskListSchema,
  createTaskCommentSchema,
  createTaskDependencySchema,
} from "./tasks.schemas.js";
import { authenticate } from "../auth/middleware.js";
import { formatZodError } from "../../utils/validation.js";
import { tasksService } from "./tasks.service.js";
import { ZodError } from "zod";

export async function taskRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // ============ TASKS ============

  // POST /tasks
  app.post("/tasks", async (req, reply) => {
    try {
      const input = createTaskSchema.parse(req.body);
      const task = await tasksService.createTask(
        input,
        req.user!.id,
        req.user!.orgId
      );
      return reply.status(201).send({ data: { task } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // POST /tasks/from-message
  app.post("/tasks/from-message", async (req, reply) => {
    try {
      const input = createTaskFromMessageSchema.parse(req.body);
      const task = await tasksService.createTaskFromMessage(
        input,
        req.user!.id,
        req.user!.orgId
      );
      if (!task) {
        return reply.status(404).send({
          code: "MESSAGE_NOT_FOUND",
          message: "Message not found",
        });
      }
      return reply.status(201).send({ data: { task } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /tasks
  app.get("/tasks", async (req, reply) => {
    try {
      const query = tasksQuerySchema.parse(req.query);
      const taskList = await tasksService.getTasks(req.user!.orgId, query);
      return reply.send({ data: { tasks: taskList } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /tasks/:id
  app.get<{ Params: { id: string } }>(
    "/tasks/:id",
    async (req, reply) => {
      const task = await tasksService.getTaskById(req.params.id);
      if (!task) {
        return reply.status(404).send({
          code: "TASK_NOT_FOUND",
          message: "Task not found",
        });
      }
      return reply.send({ data: { task } });
    }
  );

  // PATCH /tasks/:id
  app.patch<{ Params: { id: string } }>(
    "/tasks/:id",
    async (req, reply) => {
      try {
        const input = updateTaskSchema.parse(req.body);
        const task = await tasksService.updateTask(
          req.params.id,
          input,
          req.user!.id
        );
        if (!task) {
          return reply.status(404).send({
            code: "TASK_NOT_FOUND",
            message: "Task not found",
          });
        }
        return reply.send({ data: { task } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // DELETE /tasks/:id
  app.delete<{ Params: { id: string } }>(
    "/tasks/:id",
    async (req, reply) => {
      const task = await tasksService.deleteTask(req.params.id);
      if (!task) {
        return reply.status(404).send({
          code: "TASK_NOT_FOUND",
          message: "Task not found",
        });
      }
      return reply.status(204).send();
    }
  );

  // ============ TASK COMMENTS ============

  // POST /tasks/:id/comments
  app.post<{ Params: { id: string } }>(
    "/tasks/:id/comments",
    async (req, reply) => {
      try {
        const input = createTaskCommentSchema.parse(req.body);
        const task = await tasksService.getTaskById(req.params.id);
        if (!task) {
          return reply.status(404).send({
            code: "TASK_NOT_FOUND",
            message: "Task not found",
          });
        }
        const comment = await tasksService.addComment(
          req.params.id,
          req.user!.id,
          input.content
        );
        return reply.status(201).send({ data: { comment } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // GET /tasks/:id/comments
  app.get<{ Params: { id: string } }>(
    "/tasks/:id/comments",
    async (req, reply) => {
      const comments = await tasksService.getComments(req.params.id);
      return reply.send({ data: { comments } });
    }
  );

  // ============ TASK DEPENDENCIES ============

  // POST /tasks/:id/dependencies
  app.post<{ Params: { id: string } }>(
    "/tasks/:id/dependencies",
    async (req, reply) => {
      try {
        const input = createTaskDependencySchema.parse(req.body);
        const task = await tasksService.getTaskById(req.params.id);
        if (!task) {
          return reply.status(404).send({
            code: "TASK_NOT_FOUND",
            message: "Task not found",
          });
        }
        const dependency = await tasksService.addDependency(
          req.params.id,
          input.dependsOnTaskId,
          input.type
        );
        return reply.status(201).send({ data: { dependency } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // GET /tasks/:id/dependencies
  app.get<{ Params: { id: string } }>(
    "/tasks/:id/dependencies",
    async (req, reply) => {
      const dependencies = await tasksService.getDependencies(req.params.id);
      return reply.send({ data: { dependencies } });
    }
  );

  // ============ TASK LISTS ============

  // POST /task-lists
  app.post("/task-lists", async (req, reply) => {
    try {
      const input = createTaskListSchema.parse(req.body);
      const list = await tasksService.createTaskList(
        input,
        req.user!.id,
        req.user!.orgId
      );
      return reply.status(201).send({ data: { taskList: list } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /task-lists
  app.get("/task-lists", async (req, reply) => {
    const lists = await tasksService.getTaskLists(req.user!.orgId);
    return reply.send({ data: { taskLists: lists } });
  });
}
