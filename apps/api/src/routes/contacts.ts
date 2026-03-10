import { FastifyInstance } from "fastify";
import { db } from "../db";
import { users, departments, departmentMembers } from "../db/schema";
import { eq, and, isNull, ilike, or, gt, sql, count } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import type { Department } from "../db/schema";

interface ContactsQuery {
  q?: string;
  cursor?: string;
  limit?: string;
}

interface DepartmentsQuery {
  cursor?: string;
  limit?: string;
}

// UUID validation regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Default page size
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// Helper type for department tree node with member count
interface DepartmentTreeNode extends Department {
  memberCount: number;
  children: DepartmentTreeNode[];
}

/**
 * Build a department tree from flat list with member counts
 */
function buildDepartmentTreeWithCounts(
  depts: (Department & { memberCount: number })[],
  parentId: string | null = null
): DepartmentTreeNode[] {
  return depts
    .filter((d) => d.parentId === parentId)
    .map((d) => ({
      ...d,
      children: buildDepartmentTreeWithCounts(depts, d.id),
    }));
}

export async function contactsRoutes(fastify: FastifyInstance) {
  /**
   * GET /contacts - Search and browse organization contacts
   * Query params:
   *   - q: search query (matches name or email)
   *   - cursor: pagination cursor (user id)
   *   - limit: number of results (default 20, max 100)
   */
  fastify.get<{ Querystring: ContactsQuery }>(
    "/contacts",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { q, cursor, limit: limitParam } = request.query;

      // User must belong to an organization to search contacts
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization to search contacts",
        });
      }

      const orgId = request.user.orgId;

      // Parse and validate limit
      let limit = DEFAULT_LIMIT;
      if (limitParam) {
        const parsed = parseInt(limitParam, 10);
        if (!isNaN(parsed) && parsed > 0) {
          limit = Math.min(parsed, MAX_LIMIT);
        }
      }

      // Validate cursor if provided
      if (cursor && !UUID_REGEX.test(cursor)) {
        return reply.status(400).send({
          error: "Invalid cursor format",
        });
      }

      // Build base conditions: same org, not deleted
      const conditions = [
        eq(users.orgId, orgId),
        isNull(users.deletedAt),
      ];

      // Add cursor condition for pagination (cursor is the last user ID)
      if (cursor) {
        conditions.push(gt(users.id, cursor));
      }

      // Add search condition if query provided
      if (q && q.trim().length > 0) {
        const searchTerm = `%${q.trim()}%`;
        conditions.push(
          or(
            ilike(users.displayName, searchTerm),
            ilike(users.email, searchTerm)
          )!
        );
      }

      // Fetch users with pagination
      const contactsList = await db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          status: users.status,
        })
        .from(users)
        .where(and(...conditions))
        .orderBy(users.id)
        .limit(limit + 1); // Fetch one extra to check if there are more

      // Check if there are more results
      const hasMore = contactsList.length > limit;
      const results = hasMore ? contactsList.slice(0, limit) : contactsList;

      // Get next cursor
      const nextCursor = hasMore ? results[results.length - 1]?.id : null;

      return reply.status(200).send({
        contacts: results,
        pagination: {
          hasMore,
          nextCursor,
          limit,
        },
      });
    }
  );

  /**
   * GET /contacts/departments - Returns department tree with member counts
   * Query params:
   *   - cursor: pagination cursor (department id) - for flat list pagination
   *   - limit: number of results (default 20, max 100)
   */
  fastify.get<{ Querystring: DepartmentsQuery }>(
    "/contacts/departments",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { cursor, limit: limitParam } = request.query;

      // User must belong to an organization to view department contacts
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization to view departments",
        });
      }

      const orgId = request.user.orgId;

      // Parse and validate limit
      let limit = DEFAULT_LIMIT;
      if (limitParam) {
        const parsed = parseInt(limitParam, 10);
        if (!isNaN(parsed) && parsed > 0) {
          limit = Math.min(parsed, MAX_LIMIT);
        }
      }

      // Validate cursor if provided
      if (cursor && !UUID_REGEX.test(cursor)) {
        return reply.status(400).send({
          error: "Invalid cursor format",
        });
      }

      // Build conditions
      const conditions = [eq(departments.orgId, orgId)];

      if (cursor) {
        conditions.push(gt(departments.id, cursor));
      }

      // Get departments for the user's organization with member counts
      const deptsWithCounts = await db
        .select({
          id: departments.id,
          name: departments.name,
          parentId: departments.parentId,
          orgId: departments.orgId,
          createdAt: departments.createdAt,
          updatedAt: departments.updatedAt,
          memberCount: sql<number>`count(${departmentMembers.userId})::int`,
        })
        .from(departments)
        .leftJoin(
          departmentMembers,
          eq(departments.id, departmentMembers.departmentId)
        )
        .where(and(...conditions))
        .groupBy(departments.id)
        .orderBy(departments.id)
        .limit(limit + 1);

      // Check if there are more results (for flat pagination)
      const hasMore = deptsWithCounts.length > limit;
      const results = hasMore
        ? deptsWithCounts.slice(0, limit)
        : deptsWithCounts;

      // Get next cursor for flat pagination
      const nextCursor = hasMore ? results[results.length - 1]?.id : null;

      // Build tree structure from results
      const tree = buildDepartmentTreeWithCounts(results);

      return reply.status(200).send({
        departments: tree,
        pagination: {
          hasMore,
          nextCursor,
          limit,
        },
      });
    }
  );
}
