import type { FastifyInstance } from "fastify";
import { authenticate, requireAdmin } from "./middleware.js";
import { authService } from "./auth.service.js";
import {
  createInvitationsSchema,
  acceptInvitationSchema,
} from "./auth.schemas.js";
import { ZodError } from "zod";
import { formatZodError } from "../../utils/validation.js";
import { config } from "../../config.js";

/**
 * Invitation routes mounted under /orgs/:id/invitations (authenticated, admin-only)
 */
export async function invitationRoutes(app: FastifyInstance) {
  // All invitation management routes require auth
  app.addHook("preHandler", authenticate);

  // POST /orgs/:id/invitations - Create invitations
  app.post<{ Params: { id: string } }>(
    "/",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const orgId = req.params.id;

      if (orgId !== req.user!.orgId) {
        return reply.status(403).send({
          code: "FORBIDDEN",
          message: "Access denied",
        });
      }

      try {
        const input = createInvitationsSchema.parse(req.body);
        const results = await authService.createInvitations(
          orgId,
          input.emails,
          req.user!.id
        );

        const baseUrl =
          config.NODE_ENV === "production"
            ? "https://app.openlark.com"
            : `http://localhost:${config.PORT}`;

        const invitationLinks = results.map((r) => ({
          id: r.id,
          email: r.email,
          link: `${baseUrl}/auth/accept-invite/${r.token}`,
        }));

        return reply.status(201).send({ data: { invitations: invitationLinks } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // GET /orgs/:id/invitations - List pending invitations
  app.get<{ Params: { id: string } }>(
    "/",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const orgId = req.params.id;

      if (orgId !== req.user!.orgId) {
        return reply.status(403).send({
          code: "FORBIDDEN",
          message: "Access denied",
        });
      }

      const pendingInvitations =
        await authService.getOrgInvitations(orgId);

      return reply.send({ data: { invitations: pendingInvitations } });
    }
  );

  // DELETE /orgs/:id/invitations/:invitationId - Revoke invitation
  app.delete<{ Params: { id: string; invitationId: string } }>(
    "/:invitationId",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const orgId = req.params.id;

      if (orgId !== req.user!.orgId) {
        return reply.status(403).send({
          code: "FORBIDDEN",
          message: "Access denied",
        });
      }

      const revoked = await authService.revokeInvitation(
        req.params.invitationId,
        orgId
      );

      if (!revoked) {
        return reply.status(404).send({
          code: "NOT_FOUND",
          message: "Invitation not found or already used/revoked",
        });
      }

      return reply.send({ data: { success: true } });
    }
  );
}

/**
 * Accept-invitation routes mounted under /auth (public, no auth required)
 */
export async function acceptInviteRoutes(app: FastifyInstance) {
  // GET /auth/accept-invite/:token - Validate invitation and return org info
  app.get<{ Params: { token: string } }>(
    "/accept-invite/:token",
    async (req, reply) => {
      const invitation = await authService.getInvitationByToken(
        req.params.token
      );

      if (!invitation) {
        return reply.status(404).send({
          code: "INVALID_INVITATION",
          message: "Invitation is invalid, expired, or already used",
        });
      }

      const org = await authService.getOrganizationById(invitation.orgId);

      return reply.send({
        data: {
          invitation: {
            id: invitation.id,
            email: invitation.email,
            role: invitation.role,
            expiresAt: invitation.expiresAt,
            organizationName: org?.name,
          },
        },
      });
    }
  );

  // POST /auth/accept-invite/:token - Accept invitation and create/login user
  app.post<{ Params: { token: string } }>(
    "/accept-invite/:token",
    async (req, reply) => {
      try {
        const input = acceptInvitationSchema.parse(req.body);
        const result = await authService.acceptInvitation(
          req.params.token,
          input
        );

        if (!result) {
          return reply.status(404).send({
            code: "INVALID_INVITATION",
            message: "Invitation is invalid, expired, or already used",
          });
        }

        return reply.status(201).send({ data: result });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        if (
          error instanceof Error &&
          error.message.includes("unique constraint")
        ) {
          return reply.status(409).send({
            code: "EMAIL_EXISTS",
            message:
              "A user with this email already exists in this organization",
          });
        }
        throw error;
      }
    }
  );
}
