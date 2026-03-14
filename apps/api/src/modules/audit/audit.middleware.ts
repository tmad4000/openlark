import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { auditService } from "./audit.service.js";

// Map HTTP method + route pattern to action and entity type
function deriveAuditInfo(
  method: string,
  url: string,
  body: unknown
): { action: string; entityType: string; entityId?: string } | null {
  // Only log state-changing methods
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return null;
  }

  // Parse the URL path after /api/v1/
  const path = url.replace(/\?.*$/, "").replace(/^\/api\/v1\//, "");
  const segments = path.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  // Skip health/ping endpoints
  if (segments[0] === "ping" || segments[0] === "health") return null;

  // Skip webhooks
  if (segments[0] === "webhooks") return null;

  // Derive entity type from the first segment
  const entityType = segments[0]!;

  // Derive action from method
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

  // Refine action from URL patterns
  if (segments.includes("deactivate")) action = "deactivate";
  else if (segments.includes("reactivate")) action = "reactivate";
  else if (segments.includes("role")) action = "update_role";
  else if (segments.includes("login")) action = "login";
  else if (segments.includes("register")) action = "register";
  else if (segments.includes("logout")) action = "logout";
  else if (segments.includes("revoke")) action = "revoke";
  else if (segments.includes("invite") || segments.includes("invitations"))
    action = method === "POST" ? "invite" : action;

  // Try to find entity ID (typically a UUID in the path)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const foundId = segments.find((s) => uuidRegex.test(s));

  return { action: `${entityType}.${action}`, entityType, ...(foundId ? { entityId: foundId } : {}) };
}

/**
 * Register audit logging middleware on a Fastify instance.
 * Hooks into onResponse to log all state-changing API calls.
 */
export function registerAuditMiddleware(app: FastifyInstance) {
  app.addHook("onResponse", async (req: FastifyRequest, reply: FastifyReply) => {
    // Only log successful state-changing requests
    if (reply.statusCode >= 400) return;
    if (!req.user) return;

    const info = deriveAuditInfo(req.method, req.url, req.body);
    if (!info) return;

    // Fire and forget — don't block the response
    auditService.log({
      orgId: req.user.orgId,
      actorId: req.user.id,
      action: info.action,
      entityType: info.entityType,
      entityId: info.entityId,
      diff: req.method !== "DELETE" ? (req.body as unknown) : null,
      ip: req.ip,
      userAgent: req.headers["user-agent"] ?? null,
    }).catch(() => {
      // Silently ignore audit log failures
    });
  });
}
