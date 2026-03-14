import type { FastifyInstance } from "fastify";
import { authenticate, requireAdmin } from "../auth/middleware.js";
import { ssoService } from "./sso.service.js";

/**
 * SSO configuration routes
 * Mounted under /admin/sso
 */
export async function ssoRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /admin/sso - Get SSO config for the org
  app.get(
    "/",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const config = await ssoService.getConfig(req.user!.orgId);
      return reply.send({ data: { config } });
    }
  );

  // POST /admin/sso - Create SSO config
  app.post<{
    Body: { entityId: string; ssoUrl: string; certificate: string };
  }>(
    "/",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { entityId, ssoUrl, certificate } = req.body as {
        entityId: string;
        ssoUrl: string;
        certificate: string;
      };

      if (!entityId || !ssoUrl || !certificate) {
        return reply.status(400).send({
          code: "VALIDATION_ERROR",
          message: "entityId, ssoUrl, and certificate are required",
        });
      }

      const config = await ssoService.createConfig(req.user!.orgId, {
        entityId,
        ssoUrl,
        certificate,
      });
      return reply.status(201).send({ data: { config } });
    }
  );

  // PATCH /admin/sso - Update SSO config
  app.patch<{
    Body: {
      entityId?: string;
      ssoUrl?: string;
      certificate?: string;
      isEnabled?: boolean;
    };
  }>(
    "/",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const body = req.body as {
        entityId?: string;
        ssoUrl?: string;
        certificate?: string;
        isEnabled?: boolean;
      };

      const config = await ssoService.updateConfig(req.user!.orgId, body);
      if (!config) {
        return reply.status(404).send({
          code: "NOT_FOUND",
          message: "SSO configuration not found",
        });
      }
      return reply.send({ data: { config } });
    }
  );
}

/**
 * SAML callback route (stub)
 * Mounted under /auth
 */
export async function samlCallbackRoutes(app: FastifyInstance) {
  // POST /auth/saml/callback - SAML assertion consumer endpoint (stub)
  app.post("/saml/callback", async (_req, reply) => {
    // Stub: In production, this would validate the SAML assertion,
    // extract user attributes, find/create user, and issue a JWT.
    return reply.status(501).send({
      code: "NOT_IMPLEMENTED",
      message: "SAML callback processing is not yet implemented",
    });
  });
}
