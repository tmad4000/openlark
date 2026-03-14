import { FastifyInstance } from "fastify";
import {
  sendEmailSchema,
  listMessagesQuerySchema,
  updateMessageSchema,
} from "./email.schemas.js";
import { authenticate } from "../auth/middleware.js";
import { formatZodError } from "../../utils/validation.js";
import { emailService } from "./email.service.js";
import { ZodError } from "zod";

export async function emailRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // POST /email/send — send an email
  app.post("/send", async (req, reply) => {
    try {
      const input = sendEmailSchema.parse(req.body);
      const result = await emailService.sendEmail(
        input,
        req.user!.id,
        req.user!.orgId
      );

      if ("error" in result) {
        return reply
          .status(400)
          .send({ code: result.error, message: result.message });
      }

      return reply.status(201).send({ data: { message: result.message } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /email/messages?folder=inbox — list messages in folder
  app.get("/messages", async (req, reply) => {
    try {
      const query = listMessagesQuerySchema.parse(req.query);
      const messages = await emailService.listMessages(
        req.user!.id,
        req.user!.orgId,
        query
      );
      return reply.send({ data: { messages } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /email/messages/:id — get full email with body
  app.get<{ Params: { id: string } }>("/messages/:id", async (req, reply) => {
    const message = await emailService.getMessage(
      req.params.id,
      req.user!.id,
      req.user!.orgId
    );
    if (!message) {
      return reply
        .status(404)
        .send({ code: "NOT_FOUND", message: "Email not found" });
    }
    return reply.send({ data: { message } });
  });

  // PATCH /email/messages/:id — mark read, flag, move to folder
  app.patch<{ Params: { id: string } }>(
    "/messages/:id",
    async (req, reply) => {
      try {
        const input = updateMessageSchema.parse(req.body);
        const message = await emailService.updateMessage(
          req.params.id,
          input,
          req.user!.id,
          req.user!.orgId
        );
        if (!message) {
          return reply
            .status(404)
            .send({ code: "NOT_FOUND", message: "Email not found" });
        }
        return reply.send({ data: { message } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // DELETE /email/messages/:id — move to trash (or hard delete if already in trash)
  app.delete<{ Params: { id: string } }>(
    "/messages/:id",
    async (req, reply) => {
      const result = await emailService.deleteMessage(
        req.params.id,
        req.user!.id,
        req.user!.orgId
      );
      if (!result) {
        return reply
          .status(404)
          .send({ code: "NOT_FOUND", message: "Email not found" });
      }
      if ("deleted" in result) {
        return reply.status(204).send();
      }
      return reply.send({ data: { message: result } });
    }
  );
}
