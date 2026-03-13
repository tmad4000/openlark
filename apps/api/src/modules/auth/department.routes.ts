import type { FastifyInstance } from "fastify";
import { authenticate, requireAdmin } from "./middleware.js";
import { authService } from "./auth.service.js";
import {
  createDepartmentSchema,
  updateDepartmentSchema,
  addDepartmentMemberSchema,
} from "./auth.schemas.js";
import { ZodError } from "zod";
import { formatZodError } from "../../utils/validation.js";

interface DeptTree {
  id: string;
  name: string;
  parentId: string | null;
  children: DeptTree[];
  createdAt: Date;
  updatedAt: Date;
}

function buildTree(
  depts: Array<{ id: string; name: string; parentId: string | null; createdAt: Date; updatedAt: Date }>
): DeptTree[] {
  const map = new Map<string, DeptTree>();
  const roots: DeptTree[] = [];

  for (const d of depts) {
    map.set(d.id, { ...d, children: [] });
  }

  for (const d of depts) {
    const node = map.get(d.id)!;
    if (d.parentId && map.has(d.parentId)) {
      map.get(d.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Department routes mounted under /orgs/:id/departments
 */
export async function departmentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /orgs/:id/departments — returns department tree
  app.get<{ Params: { id: string } }>(
    "/",
    async (req, reply) => {
      const orgId = req.params.id;

      if (orgId !== req.user!.orgId) {
        return reply.status(403).send({ code: "FORBIDDEN", message: "Access denied" });
      }

      const depts = await authService.getOrgDepartments(orgId);
      const tree = buildTree(depts);

      return reply.send({ data: { departments: tree } });
    }
  );

  // POST /orgs/:id/departments — create department
  app.post<{ Params: { id: string } }>(
    "/",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const orgId = req.params.id;

      if (orgId !== req.user!.orgId) {
        return reply.status(403).send({ code: "FORBIDDEN", message: "Access denied" });
      }

      try {
        const input = createDepartmentSchema.parse(req.body);
        const dept = await authService.createDepartment(orgId, input, req.user!.id);

        if (!dept) {
          return reply.status(400).send({
            code: "INVALID_PARENT",
            message: "Parent department not found",
          });
        }

        return reply.status(201).send({ data: { department: dept } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // PATCH /orgs/:id/departments/:deptId — update department
  app.patch<{ Params: { id: string; deptId: string } }>(
    "/:deptId",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const orgId = req.params.id;

      if (orgId !== req.user!.orgId) {
        return reply.status(403).send({ code: "FORBIDDEN", message: "Access denied" });
      }

      try {
        const input = updateDepartmentSchema.parse(req.body);
        const dept = await authService.updateDepartment(req.params.deptId, orgId, input);

        if (!dept) {
          return reply.status(404).send({
            code: "NOT_FOUND",
            message: "Department not found or invalid parent",
          });
        }

        return reply.send({ data: { department: dept } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // DELETE /orgs/:id/departments/:deptId — soft-delete (only if no members)
  app.delete<{ Params: { id: string; deptId: string } }>(
    "/:deptId",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const orgId = req.params.id;

      if (orgId !== req.user!.orgId) {
        return reply.status(403).send({ code: "FORBIDDEN", message: "Access denied" });
      }

      const result = await authService.deleteDepartment(req.params.deptId, orgId);

      if (!result.success) {
        const status = result.reason?.includes("members") ? 409 : 404;
        return reply.status(status).send({
          code: status === 409 ? "HAS_MEMBERS" : "NOT_FOUND",
          message: result.reason,
        });
      }

      return reply.send({ data: { success: true } });
    }
  );

  // POST /orgs/:id/departments/:deptId/members — add user to department
  app.post<{ Params: { id: string; deptId: string } }>(
    "/:deptId/members",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const orgId = req.params.id;

      if (orgId !== req.user!.orgId) {
        return reply.status(403).send({ code: "FORBIDDEN", message: "Access denied" });
      }

      // Verify department exists
      const dept = await authService.getDepartmentById(req.params.deptId, orgId);
      if (!dept) {
        return reply.status(404).send({ code: "NOT_FOUND", message: "Department not found" });
      }

      try {
        const input = addDepartmentMemberSchema.parse(req.body);
        const member = await authService.addDepartmentMember(
          req.params.deptId,
          input.userId,
          input.role
        );

        if (!member) {
          return reply.status(409).send({
            code: "ALREADY_MEMBER",
            message: "User is already a member of this department",
          });
        }

        return reply.status(201).send({ data: { member } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // DELETE /orgs/:id/departments/:deptId/members/:userId — remove user
  app.delete<{ Params: { id: string; deptId: string; userId: string } }>(
    "/:deptId/members/:userId",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const orgId = req.params.id;

      if (orgId !== req.user!.orgId) {
        return reply.status(403).send({ code: "FORBIDDEN", message: "Access denied" });
      }

      const removed = await authService.removeDepartmentMember(
        req.params.deptId,
        req.params.userId
      );

      if (!removed) {
        return reply.status(404).send({
          code: "NOT_FOUND",
          message: "Member not found in this department",
        });
      }

      return reply.send({ data: { success: true } });
    }
  );
}
