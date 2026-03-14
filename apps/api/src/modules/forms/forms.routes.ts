import { FastifyInstance } from "fastify";
import {
  createFormSchema,
  formsQuerySchema,
  submitResponseSchema,
  responsesQuerySchema,
} from "./forms.schemas.js";
import { authenticate } from "../auth/middleware.js";
import { formatZodError } from "../../utils/validation.js";
import { formsService } from "./forms.service.js";
import { ZodError } from "zod";

export async function formsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // ============ FORMS ============

  // POST /forms — create a form
  app.post("/", async (req, reply) => {
    try {
      const input = createFormSchema.parse(req.body);
      const form = await formsService.createForm(
        input,
        req.user!.id,
        req.user!.orgId
      );
      return reply.status(201).send({ data: { form } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /forms — list user's forms
  app.get("/", async (req, reply) => {
    try {
      const query = formsQuerySchema.parse(req.query);
      const forms = await formsService.getFormsByUser(
        req.user!.id,
        req.user!.orgId,
        query
      );
      return reply.send({ data: { forms } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /forms/:id — get a single form with questions
  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const form = await formsService.getFormById(req.params.id);
    if (!form) {
      return reply.status(404).send({
        code: "FORM_NOT_FOUND",
        message: "Form not found",
      });
    }
    return reply.send({ data: { form } });
  });

  // ============ RESPONSES ============

  // POST /forms/:id/responses — submit a response
  app.post<{ Params: { id: string } }>(
    "/:id/responses",
    async (req, reply) => {
      try {
        const input = submitResponseSchema.parse(req.body);
        const result = await formsService.submitResponse(
          req.params.id,
          input,
          req.user!.id
        );

        if (!result) {
          return reply.status(404).send({
            code: "FORM_NOT_FOUND",
            message: "Form not found",
          });
        }

        if ("error" in result) {
          if (result.error === "missing_required") {
            return reply.status(400).send({
              code: "MISSING_REQUIRED",
              message: `Required question ${result.questionId} is missing an answer`,
            });
          }
          if (result.error === "response_limit_reached") {
            return reply.status(409).send({
              code: "RESPONSE_LIMIT_REACHED",
              message: "This form has reached its maximum number of responses",
            });
          }
        }

        return reply.status(201).send({ data: { response: result } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // GET /forms/:id/responses — list responses with pagination
  app.get<{ Params: { id: string } }>(
    "/:id/responses",
    async (req, reply) => {
      try {
        const query = responsesQuerySchema.parse(req.query);
        const responses = await formsService.getResponses(
          req.params.id,
          query
        );
        return reply.send({ data: { responses } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );
}
