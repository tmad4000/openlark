import { db } from "../../db/index.js";
import { auditLogs } from "../../db/schema/audit.js";
import { users } from "../../db/schema/auth.js";
import { eq, and, gte, lte, ilike, desc, sql, or } from "drizzle-orm";

export interface AuditLogEntry {
  orgId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string;
  diff?: unknown;
  ip?: string;
  userAgent?: string | null;
}

export interface AuditLogQuery {
  orgId: string;
  actorId?: string;
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface AuditLogWithActor {
  id: string;
  orgId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  diff: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  actorEmail: string | null;
  actorName: string | null;
}

class AuditService {
  async log(entry: AuditLogEntry): Promise<void> {
    await db.insert(auditLogs).values({
      orgId: entry.orgId,
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      diff: entry.diff ?? null,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
    });
  }

  async query(params: AuditLogQuery): Promise<{ logs: AuditLogWithActor[]; total: number }> {
    const conditions = [eq(auditLogs.orgId, params.orgId)];

    if (params.actorId) {
      conditions.push(eq(auditLogs.actorId, params.actorId));
    }
    if (params.action) {
      conditions.push(eq(auditLogs.action, params.action));
    }
    if (params.entityType) {
      conditions.push(eq(auditLogs.entityType, params.entityType));
    }
    if (params.from) {
      conditions.push(gte(auditLogs.createdAt, new Date(params.from)));
    }
    if (params.to) {
      conditions.push(lte(auditLogs.createdAt, new Date(params.to)));
    }
    if (params.search) {
      conditions.push(
        or(
          ilike(auditLogs.action, `%${params.search}%`),
          ilike(auditLogs.entityType, `%${params.search}%`),
          ilike(auditLogs.entityId, `%${params.search}%`)
        )!
      );
    }

    const where = and(...conditions);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(where);

    const rows = await db
      .select({
        id: auditLogs.id,
        orgId: auditLogs.orgId,
        actorId: auditLogs.actorId,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        diff: auditLogs.diff,
        ip: auditLogs.ip,
        userAgent: auditLogs.userAgent,
        createdAt: auditLogs.createdAt,
        actorEmail: users.email,
        actorName: users.displayName,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorId, users.id))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(params.limit ?? 50)
      .offset(params.offset ?? 0);

    return {
      logs: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
      total: countResult?.count ?? 0,
    };
  }

  async getDistinctActions(orgId: string): Promise<string[]> {
    const rows = await db
      .selectDistinct({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.orgId, orgId))
      .orderBy(auditLogs.action);
    return rows.map((r) => r.action);
  }

  async getDistinctEntityTypes(orgId: string): Promise<string[]> {
    const rows = await db
      .selectDistinct({ entityType: auditLogs.entityType })
      .from(auditLogs)
      .where(eq(auditLogs.orgId, orgId))
      .orderBy(auditLogs.entityType);
    return rows.map((r) => r.entityType);
  }
}

export const auditService = new AuditService();
