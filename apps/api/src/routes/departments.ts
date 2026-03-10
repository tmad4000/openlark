import { FastifyInstance } from "fastify";
import { db } from "../db";
import {
  departments,
  departmentMembers,
  users,
  organizations,
} from "../db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import type { Department, DepartmentMember } from "../db/schema";

interface OrgParams {
  id: string;
}

interface DepartmentParams {
  id: string;
}

interface DepartmentMemberParams {
  id: string;
  userId: string;
}

interface CreateDepartmentBody {
  name: string;
  parent_id?: string;
}

interface UpdateDepartmentBody {
  name?: string;
  parent_id?: string | null;
}

interface AddMemberBody {
  user_id: string;
  role?: "head" | "member";
}

// UUID validation regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Helper type for department tree node
interface DepartmentTreeNode extends Department {
  children: DepartmentTreeNode[];
}

/**
 * Build a department tree from flat list
 */
function buildDepartmentTree(
  depts: Department[],
  parentId: string | null = null
): DepartmentTreeNode[] {
  return depts
    .filter((d) => d.parentId === parentId)
    .map((d) => ({
      ...d,
      children: buildDepartmentTree(depts, d.id),
    }));
}

export async function departmentsRoutes(fastify: FastifyInstance) {
  /**
   * GET /orgs/:id/departments - Returns department tree for organization
   */
  fastify.get<{ Params: OrgParams }>(
    "/orgs/:id/departments",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid organization ID format",
        });
      }

      // Check organization exists and user belongs to it
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, id))
        .limit(1);

      if (!org) {
        return reply.status(404).send({
          error: "Organization not found",
        });
      }

      if (request.user.orgId !== org.id) {
        return reply.status(403).send({
          error: "Access denied",
        });
      }

      // Get all departments for the organization
      const depts = await db
        .select()
        .from(departments)
        .where(eq(departments.orgId, id));

      // Build tree structure
      const tree = buildDepartmentTree(depts);

      return reply.status(200).send({
        departments: tree,
      });
    }
  );

  /**
   * POST /orgs/:id/departments - Create a new department
   */
  fastify.post<{ Params: OrgParams; Body: CreateDepartmentBody }>(
    "/orgs/:id/departments",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { name, parent_id } = request.body;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid organization ID format",
        });
      }

      // Validate name
      if (!name || name.trim().length === 0) {
        return reply.status(400).send({
          error: "Department name is required",
        });
      }

      // Check organization exists and user belongs to it
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, id))
        .limit(1);

      if (!org) {
        return reply.status(404).send({
          error: "Organization not found",
        });
      }

      if (request.user.orgId !== org.id) {
        return reply.status(403).send({
          error: "Access denied",
        });
      }

      // Validate parent department if provided
      if (parent_id) {
        if (!UUID_REGEX.test(parent_id)) {
          return reply.status(400).send({
            error: "Invalid parent department ID format",
          });
        }

        const [parentDept] = await db
          .select()
          .from(departments)
          .where(
            and(eq(departments.id, parent_id), eq(departments.orgId, id))
          )
          .limit(1);

        if (!parentDept) {
          return reply.status(404).send({
            error: "Parent department not found",
          });
        }
      }

      // Create department
      const [department] = await db
        .insert(departments)
        .values({
          name: name.trim(),
          parentId: parent_id || null,
          orgId: id,
        })
        .returning();

      return reply.status(201).send({
        department,
      });
    }
  );

  /**
   * PATCH /departments/:id - Update department name or parent
   */
  fastify.patch<{ Params: DepartmentParams; Body: UpdateDepartmentBody }>(
    "/departments/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { name, parent_id } = request.body;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid department ID format",
        });
      }

      // Find department
      const [dept] = await db
        .select()
        .from(departments)
        .where(eq(departments.id, id))
        .limit(1);

      if (!dept) {
        return reply.status(404).send({
          error: "Department not found",
        });
      }

      // Check user belongs to same organization
      if (request.user.orgId !== dept.orgId) {
        return reply.status(403).send({
          error: "Access denied",
        });
      }

      // Build update object
      const updates: Partial<{
        name: string;
        parentId: string | null;
        updatedAt: Date;
      }> = {
        updatedAt: new Date(),
      };

      if (name !== undefined) {
        if (name.trim().length === 0) {
          return reply.status(400).send({
            error: "Department name cannot be empty",
          });
        }
        updates.name = name.trim();
      }

      if (parent_id !== undefined) {
        if (parent_id === null) {
          // Moving to root level
          updates.parentId = null;
        } else {
          if (!UUID_REGEX.test(parent_id)) {
            return reply.status(400).send({
              error: "Invalid parent department ID format",
            });
          }

          // Prevent setting self as parent
          if (parent_id === id) {
            return reply.status(400).send({
              error: "Department cannot be its own parent",
            });
          }

          // Validate parent exists and is in same org
          const [parentDept] = await db
            .select()
            .from(departments)
            .where(
              and(
                eq(departments.id, parent_id),
                eq(departments.orgId, dept.orgId)
              )
            )
            .limit(1);

          if (!parentDept) {
            return reply.status(404).send({
              error: "Parent department not found",
            });
          }

          // Check for circular reference - ensure parent is not a descendant
          const allDepts = await db
            .select()
            .from(departments)
            .where(eq(departments.orgId, dept.orgId));

          const isDescendant = (
            targetId: string,
            currentId: string
          ): boolean => {
            const children = allDepts.filter((d) => d.parentId === currentId);
            for (const child of children) {
              if (child.id === targetId) return true;
              if (isDescendant(targetId, child.id)) return true;
            }
            return false;
          };

          if (isDescendant(parent_id, id)) {
            return reply.status(400).send({
              error: "Cannot set a descendant as parent (circular reference)",
            });
          }

          updates.parentId = parent_id;
        }
      }

      // Update department
      const [updatedDept] = await db
        .update(departments)
        .set(updates)
        .where(eq(departments.id, id))
        .returning();

      return reply.status(200).send({
        department: updatedDept,
      });
    }
  );

  /**
   * DELETE /departments/:id - Soft delete department (only if no members)
   */
  fastify.delete<{ Params: DepartmentParams }>(
    "/departments/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid department ID format",
        });
      }

      // Find department
      const [dept] = await db
        .select()
        .from(departments)
        .where(eq(departments.id, id))
        .limit(1);

      if (!dept) {
        return reply.status(404).send({
          error: "Department not found",
        });
      }

      // Check user belongs to same organization
      if (request.user.orgId !== dept.orgId) {
        return reply.status(403).send({
          error: "Access denied",
        });
      }

      // Check for members
      const members = await db
        .select()
        .from(departmentMembers)
        .where(eq(departmentMembers.departmentId, id))
        .limit(1);

      if (members.length > 0) {
        return reply.status(400).send({
          error: "Cannot delete department with members",
        });
      }

      // Check for child departments
      const children = await db
        .select()
        .from(departments)
        .where(eq(departments.parentId, id))
        .limit(1);

      if (children.length > 0) {
        return reply.status(400).send({
          error: "Cannot delete department with child departments",
        });
      }

      // Delete department (hard delete since schema doesn't have deletedAt)
      await db.delete(departments).where(eq(departments.id, id));

      return reply.status(200).send({
        message: "Department deleted successfully",
      });
    }
  );

  /**
   * POST /departments/:id/members - Add user to department
   */
  fastify.post<{ Params: DepartmentParams; Body: AddMemberBody }>(
    "/departments/:id/members",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { user_id, role = "member" } = request.body;

      // Validate UUID formats
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid department ID format",
        });
      }

      if (!user_id || !UUID_REGEX.test(user_id)) {
        return reply.status(400).send({
          error: "Invalid user ID format",
        });
      }

      // Find department
      const [dept] = await db
        .select()
        .from(departments)
        .where(eq(departments.id, id))
        .limit(1);

      if (!dept) {
        return reply.status(404).send({
          error: "Department not found",
        });
      }

      // Check user belongs to same organization
      if (request.user.orgId !== dept.orgId) {
        return reply.status(403).send({
          error: "Access denied",
        });
      }

      // Find target user and verify they're in the same org
      const [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, user_id))
        .limit(1);

      if (!targetUser) {
        return reply.status(404).send({
          error: "User not found",
        });
      }

      if (targetUser.orgId !== dept.orgId) {
        return reply.status(400).send({
          error: "User must be in the same organization",
        });
      }

      // Check if already a member
      const [existingMember] = await db
        .select()
        .from(departmentMembers)
        .where(
          and(
            eq(departmentMembers.departmentId, id),
            eq(departmentMembers.userId, user_id)
          )
        )
        .limit(1);

      if (existingMember) {
        return reply.status(409).send({
          error: "User is already a member of this department",
        });
      }

      // Add member
      const [member] = await db
        .insert(departmentMembers)
        .values({
          departmentId: id,
          userId: user_id,
          role,
        })
        .returning();

      return reply.status(201).send({
        member,
      });
    }
  );

  /**
   * DELETE /departments/:id/members/:userId - Remove user from department
   */
  fastify.delete<{ Params: DepartmentMemberParams }>(
    "/departments/:id/members/:userId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id, userId } = request.params;

      // Validate UUID formats
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid department ID format",
        });
      }

      if (!UUID_REGEX.test(userId)) {
        return reply.status(400).send({
          error: "Invalid user ID format",
        });
      }

      // Find department
      const [dept] = await db
        .select()
        .from(departments)
        .where(eq(departments.id, id))
        .limit(1);

      if (!dept) {
        return reply.status(404).send({
          error: "Department not found",
        });
      }

      // Check user belongs to same organization
      if (request.user.orgId !== dept.orgId) {
        return reply.status(403).send({
          error: "Access denied",
        });
      }

      // Check if member exists
      const [existingMember] = await db
        .select()
        .from(departmentMembers)
        .where(
          and(
            eq(departmentMembers.departmentId, id),
            eq(departmentMembers.userId, userId)
          )
        )
        .limit(1);

      if (!existingMember) {
        return reply.status(404).send({
          error: "User is not a member of this department",
        });
      }

      // Remove member
      await db
        .delete(departmentMembers)
        .where(
          and(
            eq(departmentMembers.departmentId, id),
            eq(departmentMembers.userId, userId)
          )
        );

      return reply.status(200).send({
        message: "User removed from department successfully",
      });
    }
  );
}
