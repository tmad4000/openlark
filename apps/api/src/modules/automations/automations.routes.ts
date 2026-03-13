import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  createAutomationSchema,
  updateAutomationSchema,
} from "./automations.schemas.js";
import { authenticate } from "../auth/middleware.js";
import { formatZodError } from "../../utils/validation.js";
import { automationsService } from "./automations.service.js";
import { baseService } from "../base/base.service.js";
import { ZodError } from "zod";

export async function automationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // List automations for a base
  app.get<{ Params: { baseId: string } }>(
    "/bases/:baseId/automations",
    async (req, reply) => {
      const canAccess = await baseService.canAccessBase(
        req.params.baseId,
        req.user!.orgId
      );
      if (!canAccess) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You do not have access to this base",
        });
      }

      const automations = await automationsService.getAutomationsByBase(
        req.params.baseId
      );
      return { data: { automations } };
    }
  );

  // Create automation
  app.post<{ Params: { baseId: string } }>(
    "/bases/:baseId/automations",
    async (req, reply) => {
      try {
        const canAccess = await baseService.canAccessBase(
          req.params.baseId,
          req.user!.orgId
        );
        if (!canAccess) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: "You do not have access to this base",
          });
        }

        const input = createAutomationSchema.parse(req.body);
        const automation = await automationsService.createAutomation(
          req.params.baseId,
          input
        );
        return reply.status(201).send({ data: { automation } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // Get automation
  app.get<{ Params: { id: string } }>(
    "/automations/:id",
    async (req, reply) => {
      const automation = await automationsService.getAutomationById(
        req.params.id
      );
      if (!automation) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Automation not found",
        });
      }

      const canAccess = await baseService.canAccessBase(
        automation.baseId,
        req.user!.orgId
      );
      if (!canAccess) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You do not have access to this base",
        });
      }

      return { data: { automation } };
    }
  );

  // Update automation
  app.patch<{ Params: { id: string } }>(
    "/automations/:id",
    async (req, reply) => {
      try {
        const automation = await automationsService.getAutomationById(
          req.params.id
        );
        if (!automation) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Automation not found",
          });
        }

        const canAccess = await baseService.canAccessBase(
          automation.baseId,
          req.user!.orgId
        );
        if (!canAccess) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: "You do not have access to this base",
          });
        }

        const input = updateAutomationSchema.parse(req.body);
        const updated = await automationsService.updateAutomation(
          req.params.id,
          input
        );

        if (!updated) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Automation not found",
          });
        }

        return { data: { automation: updated } };
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // Delete automation
  app.delete<{ Params: { id: string } }>(
    "/automations/:id",
    async (req, reply) => {
      const automation = await automationsService.getAutomationById(
        req.params.id
      );
      if (!automation) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Automation not found",
        });
      }

      const canAccess = await baseService.canAccessBase(
        automation.baseId,
        req.user!.orgId
      );
      if (!canAccess) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You do not have access to this base",
        });
      }

      const deleted = await automationsService.deleteAutomation(req.params.id);
      if (!deleted) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Automation not found",
        });
      }

      return reply.status(204).send();
    }
  );

  // Get automation runs
  app.get<{ Params: { id: string } }>(
    "/automations/:id/runs",
    async (req, reply) => {
      const automation = await automationsService.getAutomationById(
        req.params.id
      );
      if (!automation) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Automation not found",
        });
      }

      const canAccess = await baseService.canAccessBase(
        automation.baseId,
        req.user!.orgId
      );
      if (!canAccess) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You do not have access to this base",
        });
      }

      const runs = await automationsService.getRunsByAutomation(req.params.id);
      return { data: { runs } };
    }
  );
}
