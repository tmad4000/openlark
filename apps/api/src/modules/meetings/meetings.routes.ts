import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { meetingsService } from "./meetings.service.js";
import { createMeetingSchema } from "./meetings.schemas.js";
import { authenticate } from "../auth/middleware.js";
import { formatZodError } from "../../utils/validation.js";

export async function meetingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // POST /meetings - Create a meeting and get join token
  app.post("/", async (req, reply) => {
    try {
      const input = createMeetingSchema.parse(req.body);
      const result = await meetingsService.createMeeting(
        input,
        req.user!.id,
        req.user!.orgId,
        req.user!.email
      );
      return reply.status(201).send({ data: result });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /meetings/:id - Get meeting details
  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const meeting = await meetingsService.getMeeting(req.params.id);
    if (!meeting) {
      return reply.status(404).send({
        code: "MEETING_NOT_FOUND",
        message: "Meeting not found",
      });
    }
    return reply.send({ data: { meeting } });
  });

  // GET /meetings/:id/join - Join a meeting and get access token
  app.get<{ Params: { id: string } }>("/:id/join", async (req, reply) => {
    const result = await meetingsService.joinMeeting(
      req.params.id,
      req.user!.id,
      req.user!.email
    );
    if (!result) {
      return reply.status(404).send({
        code: "MEETING_NOT_FOUND",
        message: "Meeting not found",
      });
    }
    return reply.send({ data: result });
  });

  // GET /meetings/:id/participants - List participants
  app.get<{ Params: { id: string } }>(
    "/:id/participants",
    async (req, reply) => {
      const participants = await meetingsService.getParticipants(req.params.id);
      return reply.send({ data: { participants } });
    }
  );

  // POST /meetings/:id/end - End a meeting (host only)
  app.post<{ Params: { id: string } }>("/:id/end", async (req, reply) => {
    try {
      const meeting = await meetingsService.endMeeting(
        req.params.id,
        req.user!.id
      );
      if (!meeting) {
        return reply.status(404).send({
          code: "MEETING_NOT_FOUND",
          message: "Meeting not found",
        });
      }
      return reply.send({ data: { meeting } });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Not authorized")
      ) {
        return reply.status(403).send({
          code: "NOT_AUTHORIZED",
          message: error.message,
        });
      }
      throw error;
    }
  });
}
