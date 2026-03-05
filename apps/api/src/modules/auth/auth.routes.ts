import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { authService } from "./auth.service.js";
import { registerSchema, loginSchema } from "./auth.schemas.js";
import { authenticate } from "./middleware.js";
import { ZodError } from "zod";

function formatZodError(error: ZodError) {
  return {
    code: "VALIDATION_ERROR",
    message: "Validation failed",
    details: error.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    })),
  };
}

export async function authRoutes(app: FastifyInstance) {
  // Register rate-limited routes (register, login) in a sub-scope
  // This keeps rate limiting isolated from authenticated routes
  await app.register(async (rateLimitedApp) => {
    await rateLimitedApp.register(rateLimit, {
      max: 10, // 10 requests per minute
      timeWindow: "1 minute",
      errorResponseBuilder: () => ({
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
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
    const user = await authService.getUserById(req.user!.id);
    const organization = await authService.getOrganizationById(req.user!.orgId);

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
}
