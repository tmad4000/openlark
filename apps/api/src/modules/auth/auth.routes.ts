import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { authService } from "./auth.service.js";
import { registerSchema, loginSchema } from "./auth.schemas.js";
import { authenticate } from "./middleware.js";
import { ZodError } from "zod";
import { config } from "../../config.js";
import { formatZodError } from "../../utils/validation.js";

export async function authRoutes(app: FastifyInstance) {
  // Register rate-limited routes (register, login) in a sub-scope
  // This keeps rate limiting isolated from authenticated routes
  await app.register(async (rateLimitedApp) => {
    // Higher limit in test mode to avoid test interference
    const isTest = config.NODE_ENV === "test";
    await rateLimitedApp.register(rateLimit, {
      max: isTest ? 1000 : 10, // 10 requests per minute in production, 1000 in test
      timeWindow: "1 minute",
      errorResponseBuilder: (_request, context) => ({
        statusCode: 429,
        error: "Too Many Requests",
        code: "RATE_LIMITED",
        message: `Too many requests. Please try again in ${context.after}.`,
      }),
    });

    // POST /auth/register - Create new org + user
    rateLimitedApp.post("/register", async (req, reply) => {
      try {
        const input = registerSchema.parse(req.body);
        const result = await authService.register(input);

        return reply.status(201).send({ data: result });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }

        // Handle unique constraint violations (duplicate email)
        if (
          error instanceof Error &&
          error.message.includes("unique constraint")
        ) {
          return reply.status(409).send({
            code: "EMAIL_EXISTS",
            message: "A user with this email already exists",
          });
        }

        throw error;
      }
    });

    // POST /auth/login - Authenticate user
    rateLimitedApp.post("/login", async (req, reply) => {
      try {
        const input = loginSchema.parse(req.body);
        const result = await authService.login(input);

        if (!result) {
          return reply.status(401).send({
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password",
          });
        }

        return reply.send({ data: result });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    });
  });

  // Non-rate-limited routes (authenticated routes)
  // These routes require valid auth and don't need brute-force protection

  // POST /auth/logout - Revoke session
  app.post("/logout", { preHandler: authenticate }, async (req, reply) => {
    await authService.logout(req.user!.sessionId);
    return reply.send({ data: { success: true } });
  });

  // GET /auth/me - Get current user
  app.get("/me", { preHandler: authenticate }, async (req, reply) => {
    const [user, organization] = await Promise.all([
      authService.getUserById(req.user!.id),
      authService.getOrganizationById(req.user!.orgId),
    ]);

    if (!user || !organization) {
      return reply.status(404).send({
        code: "NOT_FOUND",
        message: "User or organization not found",
      });
    }

    return reply.send({
      data: {
        user,
        organization,
      },
    });
  });

  // GET /auth/sessions - List user's active sessions
  // FR-1.10: Session management — view active sessions
  app.get("/sessions", { preHandler: authenticate }, async (req, reply) => {
    const sessions = await authService.getUserSessions(req.user!.id);

    // Mark current session
    const currentSessionId = req.user!.sessionId;
    const sessionsWithCurrent = sessions.map((s) => ({
      ...s,
      isCurrent: s.id === currentSessionId,
    }));

    return reply.send({ data: { sessions: sessionsWithCurrent } });
  });

  // DELETE /auth/sessions/:id - Revoke a specific session
  // FR-1.10: Session management — revoke remotely
  app.delete<{ Params: { id: string } }>(
    "/sessions/:id",
    { preHandler: authenticate },
    async (req, reply) => {
      const sessionId = req.params.id;
      const userId = req.user!.id;
      const currentSessionId = req.user!.sessionId;

      // Prevent revoking current session via this endpoint (use /logout instead)
      if (sessionId === currentSessionId) {
        return reply.status(400).send({
          code: "CANNOT_REVOKE_CURRENT",
          message: "Cannot revoke current session. Use logout instead.",
        });
      }

      const revoked = await authService.revokeSession(sessionId, userId);

      if (!revoked) {
        return reply.status(404).send({
          code: "SESSION_NOT_FOUND",
          message: "Session not found or already revoked",
        });
      }

      return reply.send({ data: { success: true } });
    }
  );

  // GET /auth/users - Search users in the same organization
  // Used for attendee selection in calendar events, chat member selection, etc.
  app.get<{ Querystring: { q?: string; limit?: string } }>(
    "/users",
    { preHandler: authenticate },
    async (req, reply) => {
      const query = req.query.q;
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;

      const users = await authService.searchOrgUsers(
        req.user!.orgId,
        query,
        Math.min(limit, 50) // Cap at 50
      );

      return reply.send({ data: { users } });
    }
  );
}
