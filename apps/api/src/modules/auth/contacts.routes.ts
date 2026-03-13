import type { FastifyInstance } from "fastify";
import { authenticate } from "./middleware.js";
import { authService } from "./auth.service.js";

interface DeptTreeNode {
  id: string;
  name: string;
  parentId: string | null;
  memberCount: number;
  children: DeptTreeNode[];
  createdAt: Date;
  updatedAt: Date;
}

function buildTree(
  depts: Array<{
    id: string;
    name: string;
    parentId: string | null;
    memberCount: number;
    createdAt: Date;
    updatedAt: Date;
  }>
): DeptTreeNode[] {
  const map = new Map<string, DeptTreeNode>();
  const roots: DeptTreeNode[] = [];

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
 * Contacts directory routes mounted under /contacts
 */
export async function contactsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /contacts?q=search&cursor=xxx&limit=50
  app.get<{
    Querystring: { q?: string; cursor?: string; limit?: string };
  }>("/", async (req, reply) => {
    const orgId = req.user!.orgId;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;

    const result = await authService.searchContacts(orgId, {
      q: req.query.q,
      cursor: req.query.cursor,
      limit,
    });

    return reply.send({
      data: {
        contacts: result.items,
        pagination: {
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
        },
      },
    });
  });

  // GET /contacts/departments — department tree with member counts
  app.get("/departments", async (req, reply) => {
    const orgId = req.user!.orgId;
    const depts = await authService.getDepartmentTreeWithCounts(orgId);
    const tree = buildTree(depts);

    return reply.send({ data: { departments: tree } });
  });
}
