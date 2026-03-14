import type { FastifyInstance } from "fastify";
import { authenticate } from "../auth/middleware.js";
import { statusService } from "./status.service.js";

/**
 * User status and working hours routes
 * Mounted under /users/me/status
 */
export async function statusRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /users/me/status - Get current user's custom status
  app.get("/", async (req, reply) => {
    const status = await statusService.getStatus(req.user!.id);
    return reply.send({ data: { status } });
  });

  // PUT /users/me/status - Set custom status (emoji + text + expiry)
  app.put<{
    Body: {
      emoji?: string;
      text?: string;
      expiresAt?: string;
      workingHoursStart?: string;
      workingHoursEnd?: string;
    };
  }>("/", async (req, reply) => {
    const body = req.body as {
      emoji?: string;
      text?: string;
      expiresAt?: string;
      workingHoursStart?: string;
      workingHoursEnd?: string;
    };

    const status = await statusService.setStatus(req.user!.id, body);
    return reply.send({ data: { status } });
  });
}
