import { FastifyInstance } from "fastify";
import crypto from "crypto";
import { db } from "../db";
import {
  organizations,
  users,
  departments,
  departmentMembers,
  invitations,
  roles,
  auditLogs,
} from "../db/schema";
import { eq, and, isNull, ilike, sql, desc, gte, lte } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Admin guard: checks that the requesting user is an owner or admin of their org.
 * Returns the org or sends a 403 and returns null.
 */
async function requireAdmin(request: any, reply: any): Promise<boolean> {
  if (!request.user.orgId) {
    reply.status(403).send({ error: "No organization" });
    return false;
  }
  if (request.user.role !== "owner" && request.user.role !== "admin") {
    reply.status(403).send({ error: "Admin access required" });
    return false;
  }
  return true;
}

// ── Interfaces ──────────────────────────────────────────────────────

interface UpdateOrgBody {
  name?: string;
  logo_url?: string;
  domain?: string;
  industry?: string;
}

interface MembersQuery {
  search?: string;
}

interface UserParams {
  userId: string;
}

interface ChangeRoleBody {
  role: "owner" | "admin" | "member";
}

interface InviteMembersBody {
  emails: string[];
}

interface DeptParams {
  deptId: string;
}

interface CreateDeptBody {
  name: string;
  parent_id?: string | null;
}

interface UpdateDeptBody {
  name?: string;
  parent_id?: string | null;
}

interface DeptMemberBody {
  user_id: string;
}

interface RoleParams {
  roleId: string;
}

interface CreateRoleBody {
  name: string;
  description?: string;
  permissions: Record<string, string[]>;
}

interface UpdateRoleBody {
  name?: string;
  description?: string;
  permissions?: Record<string, string[]>;
}

export async function adminRoutes(fastify: FastifyInstance) {
  // ─── Organization Settings ────────────────────────────────────────

  /**
   * GET /admin/org - Get current user's organization details
   */
  fastify.get(
    "/admin/org",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, request.user.orgId!))
        .limit(1);

      if (!org) {
        return reply.status(404).send({ error: "Organization not found" });
      }

      return reply.status(200).send({ org });
    }
  );

  /**
   * PATCH /admin/org - Update organization settings
   */
  fastify.patch<{ Body: UpdateOrgBody }>(
    "/admin/org",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const { name, logo_url, domain, industry } = request.body;

      const updates: Record<string, any> = { updatedAt: new Date() };

      if (name !== undefined) {
        if (name.trim().length === 0) {
          return reply
            .status(400)
            .send({ error: "Organization name cannot be empty" });
        }
        updates.name = name.trim();
      }

      if (logo_url !== undefined) updates.logoUrl = logo_url;
      if (industry !== undefined) updates.industry = industry;

      if (domain !== undefined) {
        if (domain) {
          const [existing] = await db
            .select({ id: organizations.id })
            .from(organizations)
            .where(
              and(
                eq(organizations.domain, domain.toLowerCase()),
                sql`${organizations.id} != ${request.user.orgId!}`
              )
            )
            .limit(1);
          if (existing) {
            return reply.status(409).send({ error: "Domain already in use" });
          }
          updates.domain = domain.toLowerCase();
        } else {
          updates.domain = null;
        }
      }

      const [updatedOrg] = await db
        .update(organizations)
        .set(updates)
        .where(eq(organizations.id, request.user.orgId!))
        .returning();

      return reply.status(200).send({ org: updatedOrg });
    }
  );

  // ─── Security Settings ──────────────────────────────────────────

  interface SecuritySettingsBody {
    passwordMinLength?: number;
    passwordRequireUppercase?: boolean;
    passwordRequireNumber?: boolean;
    passwordRequireSpecial?: boolean;
    passwordExpiryDays?: number;
    require2FA?: boolean;
    allowExternalComm?: boolean;
    sessionTimeoutMinutes?: number;
  }

  /**
   * PATCH /admin/org/security - Update organization security settings
   * Saves to the `settings` JSONB column under `settings.security`
   */
  fastify.patch<{ Body: SecuritySettingsBody }>(
    "/admin/org/security",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const orgId = request.user.orgId!;

      // Fetch current org to merge settings
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);

      if (!org) {
        return reply.status(404).send({ error: "Organization not found" });
      }

      const currentSettings = (org.settings as Record<string, unknown>) || {};
      const body = request.body;

      const securitySettings: Record<string, unknown> = {
        passwordMinLength: body.passwordMinLength ?? 8,
        passwordRequireUppercase: body.passwordRequireUppercase ?? false,
        passwordRequireNumber: body.passwordRequireNumber ?? false,
        passwordRequireSpecial: body.passwordRequireSpecial ?? false,
        passwordExpiryDays: body.passwordExpiryDays ?? 0,
        require2FA: body.require2FA ?? false,
        allowExternalComm: body.allowExternalComm ?? true,
        sessionTimeoutMinutes: body.sessionTimeoutMinutes ?? 0,
      };

      const updatedSettings = {
        ...currentSettings,
        security: securitySettings,
      };

      const [updatedOrg] = await db
        .update(organizations)
        .set({ settings: updatedSettings, updatedAt: new Date() })
        .where(eq(organizations.id, orgId))
        .returning();

      return reply.status(200).send({ org: updatedOrg });
    }
  );

  // ─── Members Management ───────────────────────────────────────────

  /**
   * GET /admin/members - List all members with optional search
   */
  fastify.get<{ Querystring: MembersQuery }>(
    "/admin/members",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const { search } = request.query;
      const orgId = request.user.orgId!;

      let query = db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          role: users.role,
          status: users.status,
          createdAt: users.createdAt,
          deletedAt: users.deletedAt,
        })
        .from(users)
        .where(
          and(eq(users.orgId, orgId), isNull(users.deletedAt))
        )
        .$dynamic();

      if (search && search.trim()) {
        const term = `%${search.trim()}%`;
        query = query.where(
          and(
            eq(users.orgId, orgId),
            isNull(users.deletedAt),
            sql`(${users.displayName} ILIKE ${term} OR ${users.email} ILIKE ${term})`
          )
        );
      }

      const members = await query;
      return reply.status(200).send({ members });
    }
  );

  /**
   * PATCH /admin/members/:userId/role - Change a member's role
   */
  fastify.patch<{ Params: UserParams; Body: ChangeRoleBody }>(
    "/admin/members/:userId/role",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const { userId } = request.params;
      const { role } = request.body;

      if (!UUID_REGEX.test(userId)) {
        return reply.status(400).send({ error: "Invalid user ID" });
      }

      if (!["owner", "admin", "member"].includes(role)) {
        return reply.status(400).send({ error: "Invalid role" });
      }

      // Only owners can assign owner role
      if (role === "owner" && request.user.role !== "owner") {
        return reply
          .status(403)
          .send({ error: "Only owners can assign owner role" });
      }

      // Cannot change own role
      if (userId === request.user.id) {
        return reply.status(400).send({ error: "Cannot change your own role" });
      }

      const [target] = await db
        .select()
        .from(users)
        .where(
          and(eq(users.id, userId), eq(users.orgId, request.user.orgId!))
        )
        .limit(1);

      if (!target) {
        return reply.status(404).send({ error: "User not found" });
      }

      const [updated] = await db
        .update(users)
        .set({ role, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          role: users.role,
        });

      return reply.status(200).send({ user: updated });
    }
  );

  /**
   * POST /admin/members/:userId/deactivate - Soft-delete (deactivate) a member
   */
  fastify.post<{ Params: UserParams }>(
    "/admin/members/:userId/deactivate",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const { userId } = request.params;
      if (!UUID_REGEX.test(userId)) {
        return reply.status(400).send({ error: "Invalid user ID" });
      }

      if (userId === request.user.id) {
        return reply
          .status(400)
          .send({ error: "Cannot deactivate yourself" });
      }

      const [target] = await db
        .select()
        .from(users)
        .where(
          and(eq(users.id, userId), eq(users.orgId, request.user.orgId!))
        )
        .limit(1);

      if (!target) {
        return reply.status(404).send({ error: "User not found" });
      }

      await db
        .update(users)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, userId));

      return reply.status(200).send({ success: true });
    }
  );

  /**
   * POST /admin/members/invite - Invite members by email
   */
  fastify.post<{ Body: InviteMembersBody }>(
    "/admin/members/invite",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const { emails } = request.body;
      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        return reply
          .status(400)
          .send({ error: "At least one email is required" });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const invalid = emails.filter((e) => !emailRegex.test(e));
      if (invalid.length > 0) {
        return reply
          .status(400)
          .send({ error: `Invalid email: ${invalid.join(", ")}` });
      }

      const orgId = request.user.orgId!;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const results: Array<{ email: string; token: string }> = [];

      for (const email of emails) {
        const normalized = email.toLowerCase().trim();

        // Skip existing org members
        const [existing] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.email, normalized), eq(users.orgId, orgId)))
          .limit(1);
        if (existing) continue;

        // Skip existing pending invitations
        const [pendingInv] = await db
          .select({ id: invitations.id })
          .from(invitations)
          .where(
            and(
              eq(invitations.orgId, orgId),
              eq(invitations.email, normalized),
              eq(invitations.status, "pending")
            )
          )
          .limit(1);
        if (pendingInv) continue;

        const token = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto
          .createHash("sha256")
          .update(token)
          .digest("hex");

        await db.insert(invitations).values({
          orgId,
          email: normalized,
          tokenHash,
          invitedById: request.user.id,
          expiresAt,
        });

        results.push({ email: normalized, token });
      }

      return reply.status(201).send({ invited: results });
    }
  );

  // ─── Department Management ────────────────────────────────────────

  /**
   * GET /admin/departments - Get department tree
   */
  fastify.get(
    "/admin/departments",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const orgId = request.user.orgId!;

      const allDepts = await db
        .select()
        .from(departments)
        .where(eq(departments.orgId, orgId));

      // Get members for each department
      const deptIds = allDepts.map((d) => d.id);
      let allMembers: any[] = [];
      if (deptIds.length > 0) {
        allMembers = await db
          .select({
            departmentId: departmentMembers.departmentId,
            userId: departmentMembers.userId,
            role: departmentMembers.role,
            displayName: users.displayName,
            email: users.email,
          })
          .from(departmentMembers)
          .innerJoin(users, eq(departmentMembers.userId, users.id))
          .where(
            sql`${departmentMembers.departmentId} IN (${sql.join(
              deptIds.map((id) => sql`${id}`),
              sql`, `
            )})`
          );
      }

      // Build tree structure
      const deptMap = allDepts.map((d) => ({
        ...d,
        members: allMembers.filter((m) => m.departmentId === d.id),
      }));

      return reply.status(200).send({ departments: deptMap });
    }
  );

  /**
   * POST /admin/departments - Create department
   */
  fastify.post<{ Body: CreateDeptBody }>(
    "/admin/departments",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const { name, parent_id } = request.body;
      if (!name || name.trim().length === 0) {
        return reply
          .status(400)
          .send({ error: "Department name is required" });
      }

      const orgId = request.user.orgId!;

      if (parent_id) {
        if (!UUID_REGEX.test(parent_id)) {
          return reply.status(400).send({ error: "Invalid parent ID" });
        }
        const [parent] = await db
          .select({ id: departments.id })
          .from(departments)
          .where(
            and(eq(departments.id, parent_id), eq(departments.orgId, orgId))
          )
          .limit(1);
        if (!parent) {
          return reply
            .status(404)
            .send({ error: "Parent department not found" });
        }
      }

      const [dept] = await db
        .insert(departments)
        .values({
          name: name.trim(),
          parentId: parent_id || null,
          orgId,
        })
        .returning();

      return reply.status(201).send({ department: dept });
    }
  );

  /**
   * PATCH /admin/departments/:deptId - Rename or move department
   */
  fastify.patch<{ Params: DeptParams; Body: UpdateDeptBody }>(
    "/admin/departments/:deptId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const { deptId } = request.params;
      if (!UUID_REGEX.test(deptId)) {
        return reply.status(400).send({ error: "Invalid department ID" });
      }

      const orgId = request.user.orgId!;
      const { name, parent_id } = request.body;

      const [dept] = await db
        .select()
        .from(departments)
        .where(and(eq(departments.id, deptId), eq(departments.orgId, orgId)))
        .limit(1);

      if (!dept) {
        return reply.status(404).send({ error: "Department not found" });
      }

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (name !== undefined) {
        if (name.trim().length === 0) {
          return reply
            .status(400)
            .send({ error: "Department name cannot be empty" });
        }
        updates.name = name.trim();
      }

      if (parent_id !== undefined) {
        if (parent_id === deptId) {
          return reply
            .status(400)
            .send({ error: "Department cannot be its own parent" });
        }
        updates.parentId = parent_id || null;
      }

      const [updated] = await db
        .update(departments)
        .set(updates)
        .where(eq(departments.id, deptId))
        .returning();

      return reply.status(200).send({ department: updated });
    }
  );

  /**
   * DELETE /admin/departments/:deptId - Delete department
   */
  fastify.delete<{ Params: DeptParams }>(
    "/admin/departments/:deptId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const { deptId } = request.params;
      if (!UUID_REGEX.test(deptId)) {
        return reply.status(400).send({ error: "Invalid department ID" });
      }

      const orgId = request.user.orgId!;

      const [dept] = await db
        .select()
        .from(departments)
        .where(and(eq(departments.id, deptId), eq(departments.orgId, orgId)))
        .limit(1);

      if (!dept) {
        return reply.status(404).send({ error: "Department not found" });
      }

      // Check for children
      const children = await db
        .select({ id: departments.id })
        .from(departments)
        .where(eq(departments.parentId, deptId))
        .limit(1);

      if (children.length > 0) {
        return reply
          .status(400)
          .send({ error: "Cannot delete department with sub-departments" });
      }

      // Remove members first
      await db
        .delete(departmentMembers)
        .where(eq(departmentMembers.departmentId, deptId));

      await db.delete(departments).where(eq(departments.id, deptId));

      return reply.status(200).send({ success: true });
    }
  );

  /**
   * POST /admin/departments/:deptId/members - Add member to department
   */
  fastify.post<{ Params: DeptParams; Body: DeptMemberBody }>(
    "/admin/departments/:deptId/members",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const { deptId } = request.params;
      const { user_id } = request.body;

      if (!UUID_REGEX.test(deptId) || !UUID_REGEX.test(user_id)) {
        return reply.status(400).send({ error: "Invalid ID format" });
      }

      const orgId = request.user.orgId!;

      // Verify dept belongs to org
      const [dept] = await db
        .select({ id: departments.id })
        .from(departments)
        .where(and(eq(departments.id, deptId), eq(departments.orgId, orgId)))
        .limit(1);

      if (!dept) {
        return reply.status(404).send({ error: "Department not found" });
      }

      // Verify user belongs to org
      const [targetUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, user_id), eq(users.orgId, orgId)))
        .limit(1);

      if (!targetUser) {
        return reply.status(404).send({ error: "User not found in org" });
      }

      // Insert (ignore conflict)
      await db
        .insert(departmentMembers)
        .values({ departmentId: deptId, userId: user_id })
        .onConflictDoNothing();

      return reply.status(201).send({ success: true });
    }
  );

  /**
   * DELETE /admin/departments/:deptId/members/:userId - Remove member
   */
  fastify.delete<{ Params: DeptParams & UserParams }>(
    "/admin/departments/:deptId/members/:userId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const { deptId, userId } = request.params;

      await db
        .delete(departmentMembers)
        .where(
          and(
            eq(departmentMembers.departmentId, deptId),
            eq(departmentMembers.userId, userId)
          )
        );

      return reply.status(200).send({ success: true });
    }
  );

  // ─── Custom Roles ─────────────────────────────────────────────────

  /**
   * GET /admin/roles - List custom roles
   */
  fastify.get(
    "/admin/roles",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const orgId = request.user.orgId!;
      const allRoles = await db
        .select()
        .from(roles)
        .where(eq(roles.orgId, orgId));

      return reply.status(200).send({ roles: allRoles });
    }
  );

  /**
   * POST /admin/roles - Create a custom role
   */
  fastify.post<{ Body: CreateRoleBody }>(
    "/admin/roles",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const { name, description, permissions } = request.body;

      if (!name || name.trim().length === 0) {
        return reply.status(400).send({ error: "Role name is required" });
      }

      const orgId = request.user.orgId!;

      const [role] = await db
        .insert(roles)
        .values({
          orgId,
          name: name.trim(),
          description: description || null,
          permissions: permissions || {},
        })
        .returning();

      return reply.status(201).send({ role });
    }
  );

  /**
   * PATCH /admin/roles/:roleId - Update a custom role
   */
  fastify.patch<{ Params: RoleParams; Body: UpdateRoleBody }>(
    "/admin/roles/:roleId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const { roleId } = request.params;
      if (!UUID_REGEX.test(roleId)) {
        return reply.status(400).send({ error: "Invalid role ID" });
      }

      const orgId = request.user.orgId!;
      const { name, description, permissions } = request.body;

      const [existing] = await db
        .select()
        .from(roles)
        .where(and(eq(roles.id, roleId), eq(roles.orgId, orgId)))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ error: "Role not found" });
      }

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (name !== undefined) updates.name = name.trim();
      if (description !== undefined) updates.description = description;
      if (permissions !== undefined) updates.permissions = permissions;

      const [updated] = await db
        .update(roles)
        .set(updates)
        .where(eq(roles.id, roleId))
        .returning();

      return reply.status(200).send({ role: updated });
    }
  );

  /**
   * DELETE /admin/roles/:roleId - Delete a custom role
   */
  fastify.delete<{ Params: RoleParams }>(
    "/admin/roles/:roleId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const { roleId } = request.params;
      if (!UUID_REGEX.test(roleId)) {
        return reply.status(400).send({ error: "Invalid role ID" });
      }

      const orgId = request.user.orgId!;

      const [existing] = await db
        .select()
        .from(roles)
        .where(and(eq(roles.id, roleId), eq(roles.orgId, orgId)))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ error: "Role not found" });
      }

      await db.delete(roles).where(eq(roles.id, roleId));

      return reply.status(200).send({ success: true });
    }
  );

  // ─── Audit Logs ──────────────────────────────────────────────────

  interface AuditLogsQuery {
    actor_id?: string;
    action?: string;
    entity_type?: string;
    from?: string;
    to?: string;
    cursor?: string;
    limit?: string;
    search?: string;
  }

  /**
   * GET /admin/audit-logs - List audit logs with filtering
   */
  fastify.get<{ Querystring: AuditLogsQuery }>(
    "/admin/audit-logs",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const orgId = request.user.orgId!;
      const {
        actor_id,
        action,
        entity_type,
        from,
        to,
        cursor,
        limit: limitStr,
        search,
      } = request.query;

      const pageLimit = Math.min(parseInt(limitStr || "50", 10), 200);

      const conditions = [eq(auditLogs.orgId, orgId)];

      if (actor_id && UUID_REGEX.test(actor_id)) {
        conditions.push(eq(auditLogs.actorId, actor_id));
      }
      if (action) {
        conditions.push(eq(auditLogs.action, action));
      }
      if (entity_type) {
        conditions.push(eq(auditLogs.entityType, entity_type));
      }
      if (from) {
        const fromDate = new Date(from);
        if (!isNaN(fromDate.getTime())) {
          conditions.push(gte(auditLogs.createdAt, fromDate));
        }
      }
      if (to) {
        const toDate = new Date(to);
        if (!isNaN(toDate.getTime())) {
          conditions.push(lte(auditLogs.createdAt, toDate));
        }
      }
      if (cursor && UUID_REGEX.test(cursor)) {
        // Cursor-based: get the createdAt of the cursor item
        const [cursorLog] = await db
          .select({ createdAt: auditLogs.createdAt })
          .from(auditLogs)
          .where(eq(auditLogs.id, cursor))
          .limit(1);
        if (cursorLog) {
          conditions.push(lte(auditLogs.createdAt, cursorLog.createdAt));
          conditions.push(sql`${auditLogs.id} != ${cursor}`);
        }
      }
      if (search && search.trim()) {
        const term = `%${search.trim()}%`;
        conditions.push(
          sql`(${auditLogs.action} ILIKE ${term} OR ${auditLogs.entityType} ILIKE ${term} OR ${auditLogs.entityId}::text ILIKE ${term})`
        );
      }

      const logs = await db
        .select({
          id: auditLogs.id,
          actorId: auditLogs.actorId,
          actorName: users.displayName,
          actorEmail: users.email,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          diff: auditLogs.diff,
          ip: auditLogs.ip,
          userAgent: auditLogs.userAgent,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.actorId, users.id))
        .where(and(...conditions))
        .orderBy(desc(auditLogs.createdAt))
        .limit(pageLimit + 1);

      const hasMore = logs.length > pageLimit;
      const results = hasMore ? logs.slice(0, pageLimit) : logs;
      const nextCursor = hasMore ? results[results.length - 1].id : null;

      return reply.status(200).send({
        logs: results,
        nextCursor,
        hasMore,
      });
    }
  );

  /**
   * GET /admin/audit-logs/actions - Get distinct action types for filter dropdown
   */
  fastify.get(
    "/admin/audit-logs/actions",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const orgId = request.user.orgId!;
      const actions = await db
        .selectDistinct({ action: auditLogs.action })
        .from(auditLogs)
        .where(eq(auditLogs.orgId, orgId))
        .orderBy(auditLogs.action);

      return reply
        .status(200)
        .send({ actions: actions.map((a) => a.action) });
    }
  );

  /**
   * GET /admin/audit-logs/entity-types - Get distinct entity types for filter dropdown
   */
  fastify.get(
    "/admin/audit-logs/entity-types",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const orgId = request.user.orgId!;
      const types = await db
        .selectDistinct({ entityType: auditLogs.entityType })
        .from(auditLogs)
        .where(eq(auditLogs.orgId, orgId))
        .orderBy(auditLogs.entityType);

      return reply
        .status(200)
        .send({ entityTypes: types.map((t) => t.entityType) });
    }
  );

  /**
   * POST /admin/audit-logs/export - Export filtered audit logs as CSV
   */
  fastify.post<{ Body: AuditLogsQuery }>(
    "/admin/audit-logs/export",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const orgId = request.user.orgId!;
      const { actor_id, action, entity_type, from, to } = request.body || {};

      const conditions = [eq(auditLogs.orgId, orgId)];

      if (actor_id && UUID_REGEX.test(actor_id)) {
        conditions.push(eq(auditLogs.actorId, actor_id));
      }
      if (action) {
        conditions.push(eq(auditLogs.action, action));
      }
      if (entity_type) {
        conditions.push(eq(auditLogs.entityType, entity_type));
      }
      if (from) {
        const fromDate = new Date(from);
        if (!isNaN(fromDate.getTime())) {
          conditions.push(gte(auditLogs.createdAt, fromDate));
        }
      }
      if (to) {
        const toDate = new Date(to);
        if (!isNaN(toDate.getTime())) {
          conditions.push(lte(auditLogs.createdAt, toDate));
        }
      }

      const logs = await db
        .select({
          id: auditLogs.id,
          actorId: auditLogs.actorId,
          actorName: users.displayName,
          actorEmail: users.email,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          diff: auditLogs.diff,
          ip: auditLogs.ip,
          userAgent: auditLogs.userAgent,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.actorId, users.id))
        .where(and(...conditions))
        .orderBy(desc(auditLogs.createdAt))
        .limit(10000);

      // Build CSV
      const escCsv = (v: string | null | undefined) => {
        if (v == null) return "";
        const s = String(v);
        if (s.includes(",") || s.includes('"') || s.includes("\n")) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };

      const header =
        "ID,Timestamp,Actor Name,Actor Email,Action,Entity Type,Entity ID,IP,User Agent,Changes";
      const rows = logs.map(
        (l) =>
          [
            escCsv(l.id),
            escCsv(l.createdAt?.toISOString()),
            escCsv(l.actorName),
            escCsv(l.actorEmail),
            escCsv(l.action),
            escCsv(l.entityType),
            escCsv(l.entityId),
            escCsv(l.ip),
            escCsv(l.userAgent),
            escCsv(l.diff ? JSON.stringify(l.diff) : ""),
          ].join(",")
      );

      const csv = [header, ...rows].join("\n");

      return reply
        .status(200)
        .header("Content-Type", "text/csv; charset=utf-8")
        .header(
          "Content-Disposition",
          `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`
        )
        .send(csv);
    }
  );
}
