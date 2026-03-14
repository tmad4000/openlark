import type { FastifyInstance } from "fastify";
import { authenticate, requireAdmin } from "../auth/middleware.js";
import { auditService } from "./audit.service.js";

/**
 * Audit log routes for admin console
 * Mounted under /admin/audit-logs
 */
export async function auditRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /admin/audit-logs - Query audit logs with filters
  app.get<{
    Querystring: {
      actorId?: string;
      action?: string;
      entityType?: string;
      from?: string;
      to?: string;
      search?: string;
      limit?: string;
      offset?: string;
    };
  }>("/", { preHandler: requireAdmin }, async (req, reply) => {
    const result = await auditService.query({
      orgId: req.user!.orgId,
      actorId: req.query.actorId,
      action: req.query.action,
      entityType: req.query.entityType,
      from: req.query.from,
      to: req.query.to,
      search: req.query.search,
      limit: req.query.limit ? parseInt(req.query.limit) : 50,
      offset: req.query.offset ? parseInt(req.query.offset) : 0,
    });
    return reply.send({ data: result });
  });

  // GET /admin/audit-logs/actions - Get distinct action types
  app.get("/actions", { preHandler: requireAdmin }, async (req, reply) => {
    const actions = await auditService.getDistinctActions(req.user!.orgId);
    return reply.send({ data: { actions } });
  });

  // GET /admin/audit-logs/entity-types - Get distinct entity types
  app.get("/entity-types", { preHandler: requireAdmin }, async (req, reply) => {
    const entityTypes = await auditService.getDistinctEntityTypes(req.user!.orgId);
    return reply.send({ data: { entityTypes } });
  });

  // GET /admin/audit-logs/export - Export logs as CSV
  app.get<{
    Querystring: {
      actorId?: string;
      action?: string;
      entityType?: string;
      from?: string;
      to?: string;
      search?: string;
    };
  }>("/export", { preHandler: requireAdmin }, async (req, reply) => {
    const result = await auditService.query({
      orgId: req.user!.orgId,
      actorId: req.query.actorId,
      action: req.query.action,
      entityType: req.query.entityType,
      from: req.query.from,
      to: req.query.to,
      search: req.query.search,
      limit: 10000,
      offset: 0,
    });

    const header = "Timestamp,Actor Email,Actor Name,Action,Entity Type,Entity ID,IP Address\n";
    const rows = result.logs.map((log) => {
      const escape = (v: string | null | undefined) => {
        if (!v) return "";
        if (v.includes(",") || v.includes('"') || v.includes("\n")) {
          return `"${v.replace(/"/g, '""')}"`;
        }
        return v;
      };
      return [
        log.createdAt,
        escape(log.actorEmail),
        escape(log.actorName),
        escape(log.action),
        escape(log.entityType),
        escape(log.entityId),
        escape(log.ip),
      ].join(",");
    });

    const csv = header + rows.join("\n");

    return reply
      .header("Content-Type", "text/csv")
      .header("Content-Disposition", `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`)
      .send(csv);
  });
}
