import type { FastifyInstance } from "fastify";
import { authenticate, requireAdmin, requirePrimaryAdmin } from "./middleware.js";
import { authService } from "./auth.service.js";

/**
 * Admin routes for organization management
 * Mounted under /admin
 */
export async function adminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /admin/members - List all org members with roles/status
  app.get<{ Querystring: { q?: string } }>(
    "/members",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const members = await authService.listOrgMembers(
        req.user!.orgId,
        req.query.q
      );
      return reply.send({ data: { members } });
    }
  );

  // PATCH /admin/members/:userId/role - Update user role
  app.patch<{ Params: { userId: string }; Body: { role: string } }>(
    "/members/:userId/role",
    { preHandler: requirePrimaryAdmin },
    async (req, reply) => {
      const { userId } = req.params;
      const { role } = req.body as { role: string };

      if (!["primary_admin", "admin", "member"].includes(role)) {
        return reply.status(400).send({
          code: "INVALID_ROLE",
          message: "Role must be primary_admin, admin, or member",
        });
      }

      // Cannot change own role
      if (userId === req.user!.id) {
        return reply.status(400).send({
          code: "CANNOT_CHANGE_OWN_ROLE",
          message: "Cannot change your own role",
        });
      }

      const result = await authService.updateUserRole(
        userId,
        req.user!.orgId,
        role as "primary_admin" | "admin" | "member"
      );

      if (!result) {
        return reply.status(404).send({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      return reply.send({ data: { user: result } });
    }
  );

  // POST /admin/members/:userId/deactivate - Deactivate user
  app.post<{ Params: { userId: string } }>(
    "/members/:userId/deactivate",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { userId } = req.params;

      if (userId === req.user!.id) {
        return reply.status(400).send({
          code: "CANNOT_DEACTIVATE_SELF",
          message: "Cannot deactivate yourself",
        });
      }

      const result = await authService.deactivateUser(userId, req.user!.orgId);

      if (!result) {
        return reply.status(404).send({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      return reply.send({ data: { user: result } });
    }
  );

  // POST /admin/members/:userId/reactivate - Reactivate user
  app.post<{ Params: { userId: string } }>(
    "/members/:userId/reactivate",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { userId } = req.params;

      const result = await authService.reactivateUser(userId, req.user!.orgId);

      if (!result) {
        return reply.status(404).send({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      return reply.send({ data: { user: result } });
    }
  );
}
