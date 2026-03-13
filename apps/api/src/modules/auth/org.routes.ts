import type { FastifyInstance } from "fastify";
import { authenticate, requireAdmin } from "./middleware.js";
import { authService } from "./auth.service.js";
import { createOrgSchema, updateOrgSchema } from "./auth.schemas.js";
import { ZodError } from "zod";
import { formatZodError } from "../../utils/validation.js";

export async function orgRoutes(app: FastifyInstance) {
  // All org routes require authentication
  app.addHook("preHandler", authenticate);

  // POST /orgs - Create a new organization; creator becomes primary admin
  app.post("/", async (req, reply) => {
    try {
      const input = createOrgSchema.parse(req.body);
      const result = await authService.createOrganization(
        input,
        req.user!.id
      );
      return reply.status(201).send({ data: { organization: result } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      if (
        error instanceof Error &&
        error.message.includes("unique constraint")
      ) {
        return reply.status(409).send({
          code: "DOMAIN_EXISTS",
          message: "An organization with this domain already exists",
        });
      }
      throw error;
    }
  });

  // GET /orgs/:id - Get organization details (must be member of the org)
  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const orgId = req.params.id;

    // Users can only view their own organization
    if (orgId !== req.user!.orgId) {
      return reply.status(403).send({
        code: "FORBIDDEN",
        message: "Access denied",
      });
    }

    const org = await authService.getOrganizationById(orgId);
    if (!org) {
      return reply.status(404).send({
        code: "NOT_FOUND",
        message: "Organization not found",
      });
    }

    return reply.send({ data: { organization: org } });
  });

  // PATCH /orgs/:id - Update organization (admin or primary_admin only)
  app.patch<{ Params: { id: string } }>(
    "/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const orgId = req.params.id;

      // Users can only update their own organization
      if (orgId !== req.user!.orgId) {
        return reply.status(403).send({
          code: "FORBIDDEN",
          message: "Access denied",
        });
      }

      try {
        const input = updateOrgSchema.parse(req.body);
        const org = await authService.updateOrganization(orgId, input);

        if (!org) {
          return reply.status(404).send({
            code: "NOT_FOUND",
            message: "Organization not found",
          });
        }

        return reply.send({ data: { organization: org } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        if (
          error instanceof Error &&
          error.message.includes("unique constraint")
        ) {
          return reply.status(409).send({
            code: "DOMAIN_EXISTS",
            message: "An organization with this domain already exists",
          });
        }
        throw error;
      }
    }
  );
}
