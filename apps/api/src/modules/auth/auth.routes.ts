import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authService } from "./auth.service.js";
import { registerSchema, loginSchema } from "./auth.schemas.js";
import { ZodError } from "zod";

// Extend FastifyRequest to include auth context
declare module "fastify" {
  interface FastifyRequest {
    user?: {
      id: string;
      orgId: string;
      sessionId: string;
      email: string;
      role: string;
    };
  }
}

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
  // Auth middleware - extracts and validates JWT
  const authenticate = async (req: FastifyRequest, reply: FastifyReply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({
        code: "UNAUTHORIZED",
        message: "Missing or invalid authorization header",
      });
    }

    const token = authHeader.slice(7);
    try {
      const payload = authService.verifyToken(token);

      // Verify session is still valid
      const session = await authService.getSessionById(payload.sessionId);
      if (!session) {
        return reply.status(401).send({
          code: "SESSION_EXPIRED",
          message: "Session has expired or been revoked",
        });
      }

      req.user = {
        id: payload.sub,
        orgId: payload.orgId,
        sessionId: payload.sessionId,
        email: payload.email,
        role: payload.role,
      };
    } catch {
      return reply.status(401).send({
        code: "INVALID_TOKEN",
        message: "Invalid or expired token",
      });
    }
  };

  // POST /auth/register - Create new org + user
  app.post("/register", async (req, reply) => {
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
  app.post("/login", async (req, reply) => {
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

  // POST /auth/logout - Revoke session
  app.post(
    "/logout",
    { preHandler: authenticate },
    async (req, reply) => {
      await authService.logout(req.user!.sessionId);
      return reply.send({ data: { success: true } });
    }
  );

  // GET /auth/me - Get current user
  app.get(
    "/me",
    { preHandler: authenticate },
    async (req, reply) => {
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
    }
  );
}
