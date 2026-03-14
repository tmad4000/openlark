import { FastifyInstance } from "fastify";
import {
  createTemplateSchema,
  createRequestSchema,
  decideStepSchema,
  requestsQuerySchema,
} from "./approvals.schemas.js";
import { authenticate } from "../auth/middleware.js";
import { formatZodError } from "../../utils/validation.js";
import { approvalsService } from "./approvals.service.js";
import { ZodError } from "zod";

export async function approvalsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // ============ TEMPLATES ============

  // POST /approvals/templates — create template
  app.post("/templates", async (req, reply) => {
    try {
      const input = createTemplateSchema.parse(req.body);
      const template = await approvalsService.createTemplate(
        input,
        req.user!.orgId
      );
      return reply.status(201).send({ data: { template } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /approvals/templates — list org templates
  app.get("/templates", async (req, reply) => {
    const templates = await approvalsService.getTemplatesByOrg(
      req.user!.orgId
    );
    return reply.send({ data: { templates } });
  });

  // ============ REQUESTS ============

  // POST /approvals/requests — submit new request
  app.post("/requests", async (req, reply) => {
    try {
      const input = createRequestSchema.parse(req.body);
      const request = await approvalsService.createRequest(
        input,
        req.user!.id,
        req.user!.orgId
      );
      if (!request) {
        return reply.status(404).send({
          code: "TEMPLATE_NOT_FOUND",
          message: "Approval template not found",
        });
      }
      return reply.status(201).send({ data: { request } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /approvals/requests — list user's pending approvals
  app.get("/requests", async (req, reply) => {
    try {
      const query = requestsQuerySchema.parse(req.query);
      const requests = await approvalsService.getRequests(
        req.user!.id,
        req.user!.orgId,
        query
      );
      return reply.send({ data: { requests } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /approvals/requests/:id — get single request
  app.get<{ Params: { id: string } }>(
    "/requests/:id",
    async (req, reply) => {
      const request = await approvalsService.getRequestById(req.params.id);
      if (!request) {
        return reply.status(404).send({
          code: "REQUEST_NOT_FOUND",
          message: "Approval request not found",
        });
      }
      return reply.send({ data: { request } });
    }
  );

  // ============ STEPS ============

  // POST /approvals/requests/:id/steps/:stepId/decide
  app.post<{ Params: { id: string; stepId: string } }>(
    "/requests/:id/steps/:stepId/decide",
    async (req, reply) => {
      try {
        const input = decideStepSchema.parse(req.body);
        const result = await approvalsService.decideStep(
          req.params.id,
          req.params.stepId,
          input,
          req.user!.id
        );

        if (!result) {
          return reply.status(404).send({
            code: "STEP_NOT_FOUND",
            message: "Approval step not found",
          });
        }

        if ("error" in result) {
          if (result.error === "not_approver") {
            return reply.status(403).send({
              code: "NOT_APPROVER",
              message: "You are not an approver for this step",
            });
          }
          if (result.error === "already_decided") {
            return reply.status(409).send({
              code: "ALREADY_DECIDED",
              message: "This step has already been decided",
            });
          }
        }

        return reply.send({ data: { step: result } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );
}
