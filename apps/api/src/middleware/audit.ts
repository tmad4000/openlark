import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../db";
import { auditLogs } from "../db/schema";

/**
 * Determines the entity type and action from the request URL and method.
 * Returns null if this request should not be logged.
 */
function parseAuditInfo(
  method: string,
  url: string
): { action: string; entityType: string; entityId?: string } | null {
  // Only log state-changing methods
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return null;

  // Skip auth endpoints (login/register generate their own context)
  if (url.startsWith("/auth/")) return null;
  // Skip health/root
  if (url === "/" || url === "/health") return null;
  // Skip WebSocket upgrades
  if (url.startsWith("/ws")) return null;

  // Extract path segments (strip query params)
  const path = url.split("?")[0];
  const segments = path.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Build action string from method
  let action: string;
  switch (method) {
    case "POST":
      action = "create";
      break;
    case "PUT":
    case "PATCH":
      action = "update";
      break;
    case "DELETE":
      action = "delete";
      break;
    default:
      action = method.toLowerCase();
  }

  // Determine entity type and ID from URL segments
  let entityType = segments[0];
  let entityId: string | undefined;

  // Walk segments to find the deepest resource
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (UUID_RE.test(seg)) {
      entityId = seg;
    } else if (seg !== "admin" && seg !== "api") {
      entityType = seg;
      // Check if a sub-action follows (e.g., /members/:id/deactivate)
      if (i > 0 && UUID_RE.test(segments[i - 1])) {
        action = seg; // Use sub-resource as action (e.g., "deactivate", "role")
        entityId = segments[i - 1];
        entityType = segments[i - 2] || segments[0];
      }
    }
  }

  // Clean up entity type - singularize common patterns
  entityType = entityType.replace(/s$/, "");

  return { action: `${method.toLowerCase()}.${entityType}`, entityType, entityId };
}

/**
 * Fastify plugin that automatically logs all state-changing API calls.
 * Must be registered AFTER the auth middleware sets request.user.
 */
export async function auditLogPlugin(fastify: FastifyInstance) {
  fastify.addHook(
    "onResponse",
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Only log successful state-changing requests (2xx/3xx)
      if (reply.statusCode >= 400) return;

      const info = parseAuditInfo(request.method, request.url);
      if (!info) return;

      // Need an authenticated user context
      if (!request.user?.id || !request.user?.orgId) return;

      try {
        await db.insert(auditLogs).values({
          orgId: request.user.orgId,
          actorId: request.user.id,
          action: info.action,
          entityType: info.entityType,
          entityId: info.entityId || null,
          diff: request.method !== "DELETE" && request.body
            ? (typeof request.body === "object" ? request.body as Record<string, unknown> : null)
            : null,
          ip: request.ip,
          userAgent: request.headers["user-agent"] || null,
        });
      } catch {
        // Audit logging should never break the request
        request.log.error("Failed to write audit log");
      }
    }
  );
}
