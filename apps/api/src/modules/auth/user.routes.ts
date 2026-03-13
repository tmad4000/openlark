import type { FastifyInstance } from "fastify";
import { authenticate } from "./middleware.js";
import { authService } from "./auth.service.js";
import { updateProfileSchema } from "./auth.schemas.js";
import { ZodError } from "zod";
import { formatZodError } from "../../utils/validation.js";

export async function userRoutes(app: FastifyInstance) {
  // All user routes require authentication
  app.addHook("preHandler", authenticate);

  // GET /users/me - Get current user's full profile with departments
  app.get("/me", async (req, reply) => {
    const profile = await authService.getUserProfile(req.user!.id);
    if (!profile) {
      return reply.status(404).send({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }
    return reply.send({ data: { user: profile } });
  });

  // PATCH /users/me - Update current user's profile
  app.patch("/me", async (req, reply) => {
    try {
      const input = updateProfileSchema.parse(req.body);
      const user = await authService.updateUserProfile(req.user!.id, input);
      if (!user) {
        return reply.status(404).send({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }
      return reply.send({ data: { user } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /users/:id - Get public profile of another user (same org only)
  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const profile = await authService.getPublicProfile(
      req.params.id,
      req.user!.orgId
    );
    if (!profile) {
      return reply.status(404).send({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }
    return reply.send({ data: { user: profile } });
  });
}
