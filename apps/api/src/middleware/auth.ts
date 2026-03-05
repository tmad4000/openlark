import { FastifyRequest, FastifyReply } from "fastify";
import crypto from "crypto";
import { db } from "../db";
import { sessions, users, organizations } from "../db/schema";
import { eq, and, gt } from "drizzle-orm";
import type { User, Organization } from "../db/schema";

// Extend Fastify request to include user and org
declare module "fastify" {
  interface FastifyRequest {
    user: Omit<User, "passwordHash">;
    org: Organization | null;
    sessionId: string;
  }
}

/**
 * Auth middleware that validates session tokens.
 * Reads Authorization: Bearer <token> header, validates the session,
 * and attaches user and org to the request context.
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  // Check for Authorization header
  if (!authHeader) {
    return reply.status(401).send({
      error: "Authorization header required",
    });
  }

  // Check for Bearer token format
  if (!authHeader.startsWith("Bearer ")) {
    return reply.status(401).send({
      error: "Invalid authorization format. Use: Bearer <token>",
    });
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  if (!token) {
    return reply.status(401).send({
      error: "Token required",
    });
  }

  // Hash the token before lookup to prevent timing attacks
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  // Look up session by token hash
  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        gt(sessions.expiresAt, new Date()) // Session not expired
      )
    )
    .limit(1);

  if (!session) {
    return reply.status(401).send({
      error: "Invalid or expired session",
    });
  }

  // Look up user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user) {
    return reply.status(401).send({
      error: "User not found",
    });
  }

  // Check if user is soft-deleted
  if (user.deletedAt) {
    return reply.status(401).send({
      error: "User account has been deleted",
    });
  }

  // Look up organization if user has one
  let org: Organization | null = null;
  if (user.orgId) {
    const [foundOrg] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, user.orgId))
      .limit(1);
    org = foundOrg || null;
  }

  // Attach user (without password hash), org, and sessionId to request
  const { passwordHash: _, ...userWithoutPassword } = user;
  request.user = userWithoutPassword;
  request.org = org;
  request.sessionId = session.id;
}
