import type { FastifyRequest, FastifyReply } from "fastify";
import { authService } from "./auth.service.js";

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

/**
 * Auth middleware - extracts and validates JWT from Authorization header.
 * Verifies the session is still valid and not revoked.
 * Attaches user context to req.user on success.
 */
export async function authenticate(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
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
}

/**
 * Require admin role middleware.
 * Must be used after authenticate middleware.
 */
export async function requireAdmin(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!req.user) {
    return reply.status(401).send({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }

  if (req.user.role !== "primary_admin" && req.user.role !== "admin") {
    return reply.status(403).send({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
}

/**
 * Require primary admin role middleware.
 * Must be used after authenticate middleware.
 */
export async function requirePrimaryAdmin(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!req.user) {
    return reply.status(401).send({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }

  if (req.user.role !== "primary_admin") {
    return reply.status(403).send({
      code: "FORBIDDEN",
      message: "Primary admin access required",
    });
  }
}
