import { FastifyInstance } from "fastify";
import { db } from "../db";
import {
  wikiSpaces,
  wikiSpaceMembers,
  wikiPages,
  documents,
  documentPermissions,
  users,
} from "../db/schema";
import { eq, and, desc, sql, isNull, asc, inArray } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { randomUUID } from "crypto";

// UUID validation regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Valid space types
const VALID_SPACE_TYPES = ["private", "public"] as const;
type SpaceType = (typeof VALID_SPACE_TYPES)[number];

// Valid member roles
const VALID_MEMBER_ROLES = ["admin", "editor", "viewer"] as const;
type MemberRole = (typeof VALID_MEMBER_ROLES)[number];

interface CreateSpaceBody {
  name: string;
  description?: string;
  icon?: string;
  type?: SpaceType;
}

interface CreatePageBody {
  title: string;
  parentPageId?: string;
}

interface MovePageBody {
  parentPageId?: string | null;
  position?: number;
}

/**
 * Check if user is a member of the wiki space and get their role
 */
async function getUserSpaceRole(
  spaceId: string,
  userId: string
): Promise<MemberRole | null> {
  const [membership] = await db
    .select({ role: wikiSpaceMembers.role })
    .from(wikiSpaceMembers)
    .where(
      and(
        eq(wikiSpaceMembers.spaceId, spaceId),
        eq(wikiSpaceMembers.userId, userId)
      )
    )
    .limit(1);

  return membership?.role as MemberRole | null;
}

/**
 * Check if user can access the space (member or public space in same org)
 */
async function canAccessSpace(
  spaceId: string,
  userId: string,
  orgId: string
): Promise<boolean> {
  // Check if user is a member
  const role = await getUserSpaceRole(spaceId, userId);
  if (role) return true;

  // Check if it's a public space in the user's org
  const [space] = await db
    .select({ type: wikiSpaces.type })
    .from(wikiSpaces)
    .where(
      and(
        eq(wikiSpaces.id, spaceId),
        eq(wikiSpaces.orgId, orgId),
        eq(wikiSpaces.type, "public")
      )
    )
    .limit(1);

  return !!space;
}

/**
 * Build page tree from flat page list
 */
function buildPageTree(
  pages: Array<{
    id: string;
    spaceId: string;
    documentId: string;
    parentPageId: string | null;
    position: number;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
    documentTitle: string;
  }>
): Array<{
  id: string;
  documentId: string;
  title: string;
  position: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  children: ReturnType<typeof buildPageTree>;
}> {
  // Group pages by parent
  const pagesByParent = new Map<string | null, typeof pages>();
  for (const page of pages) {
    const parentId = page.parentPageId;
    if (!pagesByParent.has(parentId)) {
      pagesByParent.set(parentId, []);
    }
    pagesByParent.get(parentId)!.push(page);
  }

  // Build tree recursively
  function buildChildren(parentId: string | null): ReturnType<typeof buildPageTree> {
    const children = pagesByParent.get(parentId) || [];
    return children
      .sort((a, b) => a.position - b.position)
      .map((page) => ({
        id: page.id,
        documentId: page.documentId,
        title: page.documentTitle,
        position: page.position,
        createdBy: page.createdBy,
        createdAt: page.createdAt,
        updatedAt: page.updatedAt,
        children: buildChildren(page.id),
      }));
  }

  return buildChildren(null);
}

export async function wikiRoutes(fastify: FastifyInstance) {
  /**
   * POST /wiki/spaces - Create a new wiki space
   * Body: { name: string, description?: string, icon?: string, type?: SpaceType }
   * Returns: Created space with creator as admin
   */
  fastify.post<{ Body: CreateSpaceBody }>(
    "/wiki/spaces",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { name, description, icon, type = "private" } = request.body;

      // Validate name
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return reply.status(400).send({
          error: "name is required and must be a non-empty string",
        });
      }

      if (name.length > 255) {
        return reply.status(400).send({
          error: "name must be at most 255 characters",
        });
      }

      // Validate type
      if (!VALID_SPACE_TYPES.includes(type)) {
        return reply.status(400).send({
          error: `type must be one of: ${VALID_SPACE_TYPES.join(", ")}`,
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization to create wiki spaces",
        });
      }

      const currentUserId = request.user.id;
      const orgId = request.user.orgId;

      // Create the space
      const [newSpace] = await db
        .insert(wikiSpaces)
        .values({
          name: name.trim(),
          description: description?.trim(),
          icon,
          type,
          orgId,
        })
        .returning();

      // Add creator as admin
      await db.insert(wikiSpaceMembers).values({
        spaceId: newSpace.id,
        userId: currentUserId,
        role: "admin",
      });

      // Get member count
      const memberCount = 1;

      return reply.status(201).send({
        id: newSpace.id,
        name: newSpace.name,
        description: newSpace.description,
        icon: newSpace.icon,
        type: newSpace.type,
        settings: newSpace.settings,
        memberCount,
        currentUserRole: "admin",
        createdAt: newSpace.createdAt,
        updatedAt: newSpace.updatedAt,
      });
    }
  );

  /**
   * GET /wiki/spaces - Get user's wiki spaces
   * Returns: List of spaces user is a member of or can access (public)
   */
  fastify.get(
    "/wiki/spaces",
    { preHandler: authMiddleware },
    async (request, reply) => {
      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const currentUserId = request.user.id;
      const orgId = request.user.orgId;

      // Get spaces where user is a member
      const memberSpaces = await db
        .select({
          id: wikiSpaces.id,
          name: wikiSpaces.name,
          description: wikiSpaces.description,
          icon: wikiSpaces.icon,
          type: wikiSpaces.type,
          settings: wikiSpaces.settings,
          createdAt: wikiSpaces.createdAt,
          updatedAt: wikiSpaces.updatedAt,
          userRole: wikiSpaceMembers.role,
        })
        .from(wikiSpaces)
        .innerJoin(
          wikiSpaceMembers,
          and(
            eq(wikiSpaceMembers.spaceId, wikiSpaces.id),
            eq(wikiSpaceMembers.userId, currentUserId)
          )
        )
        .where(eq(wikiSpaces.orgId, orgId))
        .orderBy(desc(wikiSpaces.updatedAt));

      // Get public spaces in org that user is NOT a member of
      const memberSpaceIds = memberSpaces.map((s) => s.id);

      let publicSpacesRaw: Array<{
        id: string;
        name: string;
        description: string | null;
        icon: string | null;
        type: "public" | "private";
        settings: typeof wikiSpaces.$inferSelect.settings;
        createdAt: Date;
        updatedAt: Date;
      }> = [];

      if (memberSpaceIds.length > 0) {
        publicSpacesRaw = await db
          .select({
            id: wikiSpaces.id,
            name: wikiSpaces.name,
            description: wikiSpaces.description,
            icon: wikiSpaces.icon,
            type: wikiSpaces.type,
            settings: wikiSpaces.settings,
            createdAt: wikiSpaces.createdAt,
            updatedAt: wikiSpaces.updatedAt,
          })
          .from(wikiSpaces)
          .where(
            and(
              eq(wikiSpaces.orgId, orgId),
              eq(wikiSpaces.type, "public"),
              sql`${wikiSpaces.id} NOT IN (${sql.join(memberSpaceIds.map(id => sql`${id}`), sql`, `)})`
            )
          )
          .orderBy(desc(wikiSpaces.updatedAt));
      } else {
        publicSpacesRaw = await db
          .select({
            id: wikiSpaces.id,
            name: wikiSpaces.name,
            description: wikiSpaces.description,
            icon: wikiSpaces.icon,
            type: wikiSpaces.type,
            settings: wikiSpaces.settings,
            createdAt: wikiSpaces.createdAt,
            updatedAt: wikiSpaces.updatedAt,
          })
          .from(wikiSpaces)
          .where(
            and(
              eq(wikiSpaces.orgId, orgId),
              eq(wikiSpaces.type, "public")
            )
          )
          .orderBy(desc(wikiSpaces.updatedAt));
      }

      // Convert to same structure with null userRole
      const publicSpaces = publicSpacesRaw.map((s) => ({
        ...s,
        userRole: null as string | null,
      }));

      // Combine and get member counts
      const allSpaces = [...memberSpaces, ...publicSpaces];

      const spacesWithCounts = await Promise.all(
        allSpaces.map(async (space) => {
          const [countResult] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(wikiSpaceMembers)
            .where(eq(wikiSpaceMembers.spaceId, space.id));

          return {
            id: space.id,
            name: space.name,
            description: space.description,
            icon: space.icon,
            type: space.type,
            settings: space.settings,
            memberCount: countResult?.count ?? 0,
            currentUserRole: space.userRole,
            createdAt: space.createdAt,
            updatedAt: space.updatedAt,
          };
        })
      );

      return reply.status(200).send({
        spaces: spacesWithCounts,
      });
    }
  );

  /**
   * GET /wiki/spaces/:id - Get a specific wiki space
   * Returns: Space details with pages tree
   */
  fastify.get<{ Params: { id: string } }>(
    "/wiki/spaces/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid space ID format",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const currentUserId = request.user.id;
      const orgId = request.user.orgId;

      // Get the space
      const [space] = await db
        .select()
        .from(wikiSpaces)
        .where(and(eq(wikiSpaces.id, id), eq(wikiSpaces.orgId, orgId)))
        .limit(1);

      if (!space) {
        return reply.status(404).send({
          error: "Wiki space not found",
        });
      }

      // Check access
      const canAccess = await canAccessSpace(id, currentUserId, orgId);
      if (!canAccess) {
        return reply.status(403).send({
          error: "Access denied - you are not a member of this private space",
        });
      }

      // Get user's role
      const userRole = await getUserSpaceRole(id, currentUserId);

      // Get member count
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(wikiSpaceMembers)
        .where(eq(wikiSpaceMembers.spaceId, id));

      return reply.status(200).send({
        id: space.id,
        name: space.name,
        description: space.description,
        icon: space.icon,
        type: space.type,
        settings: space.settings,
        memberCount: countResult?.count ?? 0,
        currentUserRole: userRole,
        createdAt: space.createdAt,
        updatedAt: space.updatedAt,
      });
    }
  );

  /**
   * POST /wiki/spaces/:id/pages - Create a page in a wiki space
   * Body: { title: string, parentPageId?: string }
   * Returns: Created page with linked document
   */
  fastify.post<{ Params: { id: string }; Body: CreatePageBody }>(
    "/wiki/spaces/:id/pages",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { title, parentPageId } = request.body;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid space ID format",
        });
      }

      // Validate title
      if (!title || typeof title !== "string" || title.trim().length === 0) {
        return reply.status(400).send({
          error: "title is required and must be a non-empty string",
        });
      }

      if (title.length > 500) {
        return reply.status(400).send({
          error: "title must be at most 500 characters",
        });
      }

      // Validate parentPageId if provided
      if (parentPageId && !UUID_REGEX.test(parentPageId)) {
        return reply.status(400).send({
          error: "Invalid parent page ID format",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const currentUserId = request.user.id;
      const orgId = request.user.orgId;

      // Get the space
      const [space] = await db
        .select()
        .from(wikiSpaces)
        .where(and(eq(wikiSpaces.id, id), eq(wikiSpaces.orgId, orgId)))
        .limit(1);

      if (!space) {
        return reply.status(404).send({
          error: "Wiki space not found",
        });
      }

      // Check if user can create pages (need admin or editor role)
      const userRole = await getUserSpaceRole(id, currentUserId);
      if (!userRole || userRole === "viewer") {
        return reply.status(403).send({
          error: "Access denied - need editor or admin permission to create pages",
        });
      }

      // Validate parent page exists in this space if provided
      if (parentPageId) {
        const [parentPage] = await db
          .select()
          .from(wikiPages)
          .where(
            and(
              eq(wikiPages.id, parentPageId),
              eq(wikiPages.spaceId, id)
            )
          )
          .limit(1);

        if (!parentPage) {
          return reply.status(400).send({
            error: "Parent page not found in this space",
          });
        }
      }

      // Generate a unique yjs_doc_id
      const yjsDocId = `wiki-${randomUUID()}`;

      // Create the linked document
      const [newDoc] = await db
        .insert(documents)
        .values({
          title: title.trim(),
          type: "doc",
          orgId,
          ownerId: currentUserId,
          yjsDocId,
        })
        .returning();

      // Create owner permission for the document
      await db.insert(documentPermissions).values({
        documentId: newDoc.id,
        principalId: currentUserId,
        principalType: "user",
        role: "owner",
      });

      // Get the max position for siblings
      const [maxPosResult] = await db
        .select({ maxPos: sql<number>`COALESCE(MAX(position), -1)::int` })
        .from(wikiPages)
        .where(
          and(
            eq(wikiPages.spaceId, id),
            parentPageId
              ? eq(wikiPages.parentPageId, parentPageId)
              : isNull(wikiPages.parentPageId)
          )
        );

      const position = (maxPosResult?.maxPos ?? -1) + 1;

      // Create the wiki page
      const [newPage] = await db
        .insert(wikiPages)
        .values({
          spaceId: id,
          documentId: newDoc.id,
          parentPageId: parentPageId || null,
          position,
          createdBy: currentUserId,
        })
        .returning();

      // Update space updatedAt
      await db
        .update(wikiSpaces)
        .set({ updatedAt: new Date() })
        .where(eq(wikiSpaces.id, id));

      return reply.status(201).send({
        id: newPage.id,
        spaceId: newPage.spaceId,
        documentId: newPage.documentId,
        parentPageId: newPage.parentPageId,
        position: newPage.position,
        title: newDoc.title,
        yjsDocId: newDoc.yjsDocId,
        createdBy: newPage.createdBy,
        createdAt: newPage.createdAt,
        updatedAt: newPage.updatedAt,
      });
    }
  );

  /**
   * GET /wiki/spaces/:id/pages - Get page tree for a wiki space
   * Returns: Hierarchical tree of pages
   */
  fastify.get<{ Params: { id: string } }>(
    "/wiki/spaces/:id/pages",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid space ID format",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const currentUserId = request.user.id;
      const orgId = request.user.orgId;

      // Get the space
      const [space] = await db
        .select()
        .from(wikiSpaces)
        .where(and(eq(wikiSpaces.id, id), eq(wikiSpaces.orgId, orgId)))
        .limit(1);

      if (!space) {
        return reply.status(404).send({
          error: "Wiki space not found",
        });
      }

      // Check access
      const canAccess = await canAccessSpace(id, currentUserId, orgId);
      if (!canAccess) {
        return reply.status(403).send({
          error: "Access denied - you are not a member of this private space",
        });
      }

      // Get all pages with document titles
      const pages = await db
        .select({
          id: wikiPages.id,
          spaceId: wikiPages.spaceId,
          documentId: wikiPages.documentId,
          parentPageId: wikiPages.parentPageId,
          position: wikiPages.position,
          createdBy: wikiPages.createdBy,
          createdAt: wikiPages.createdAt,
          updatedAt: wikiPages.updatedAt,
          documentTitle: documents.title,
        })
        .from(wikiPages)
        .innerJoin(documents, eq(wikiPages.documentId, documents.id))
        .where(
          and(
            eq(wikiPages.spaceId, id),
            isNull(documents.deletedAt)
          )
        )
        .orderBy(asc(wikiPages.position));

      // Build tree
      const tree = buildPageTree(pages);

      return reply.status(200).send({
        pages: tree,
      });
    }
  );

  /**
   * PATCH /wiki/pages/:id - Move or reorder a wiki page
   * Body: { parentPageId?: string | null, position?: number }
   * Returns: Updated page
   */
  fastify.patch<{ Params: { id: string }; Body: MovePageBody }>(
    "/wiki/pages/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { parentPageId, position } = request.body;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid page ID format",
        });
      }

      // Validate parentPageId if provided and not null
      if (parentPageId !== undefined && parentPageId !== null && !UUID_REGEX.test(parentPageId)) {
        return reply.status(400).send({
          error: "Invalid parent page ID format",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const currentUserId = request.user.id;
      const orgId = request.user.orgId;

      // Get the page
      const [page] = await db
        .select()
        .from(wikiPages)
        .where(eq(wikiPages.id, id))
        .limit(1);

      if (!page) {
        return reply.status(404).send({
          error: "Wiki page not found",
        });
      }

      // Get the space
      const [space] = await db
        .select()
        .from(wikiSpaces)
        .where(
          and(
            eq(wikiSpaces.id, page.spaceId),
            eq(wikiSpaces.orgId, orgId)
          )
        )
        .limit(1);

      if (!space) {
        return reply.status(404).send({
          error: "Wiki space not found",
        });
      }

      // Check if user can edit pages
      const userRole = await getUserSpaceRole(page.spaceId, currentUserId);
      if (!userRole || userRole === "viewer") {
        return reply.status(403).send({
          error: "Access denied - need editor or admin permission to move pages",
        });
      }

      // Build update object
      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      // Handle parent change
      if (parentPageId !== undefined) {
        // Prevent moving page to be its own descendant
        if (parentPageId !== null) {
          // Check if new parent is a descendant of this page
          let checkId: string | null = parentPageId;
          while (checkId) {
            if (checkId === id) {
              return reply.status(400).send({
                error: "Cannot move page to be a descendant of itself",
              });
            }
            const [checkPage] = await db
              .select({ parentPageId: wikiPages.parentPageId })
              .from(wikiPages)
              .where(eq(wikiPages.id, checkId))
              .limit(1);
            checkId = checkPage?.parentPageId ?? null;
          }

          // Verify new parent is in the same space
          const [newParent] = await db
            .select()
            .from(wikiPages)
            .where(
              and(
                eq(wikiPages.id, parentPageId),
                eq(wikiPages.spaceId, page.spaceId)
              )
            )
            .limit(1);

          if (!newParent) {
            return reply.status(400).send({
              error: "Parent page not found in this space",
            });
          }
        }

        updates.parentPageId = parentPageId;
      }

      // Handle position change
      if (position !== undefined) {
        if (typeof position !== "number" || position < 0) {
          return reply.status(400).send({
            error: "position must be a non-negative number",
          });
        }
        updates.position = position;
      }

      // If no updates provided, return current page
      if (Object.keys(updates).length === 1) {
        const [doc] = await db
          .select({ title: documents.title })
          .from(documents)
          .where(eq(documents.id, page.documentId))
          .limit(1);

        return reply.status(200).send({
          id: page.id,
          spaceId: page.spaceId,
          documentId: page.documentId,
          parentPageId: page.parentPageId,
          position: page.position,
          title: doc?.title,
          createdBy: page.createdBy,
          createdAt: page.createdAt,
          updatedAt: page.updatedAt,
        });
      }

      // Update the page
      const [updatedPage] = await db
        .update(wikiPages)
        .set(updates)
        .where(eq(wikiPages.id, id))
        .returning();

      // Update space updatedAt
      await db
        .update(wikiSpaces)
        .set({ updatedAt: new Date() })
        .where(eq(wikiSpaces.id, page.spaceId));

      // Get document title
      const [doc] = await db
        .select({ title: documents.title })
        .from(documents)
        .where(eq(documents.id, updatedPage.documentId))
        .limit(1);

      return reply.status(200).send({
        id: updatedPage.id,
        spaceId: updatedPage.spaceId,
        documentId: updatedPage.documentId,
        parentPageId: updatedPage.parentPageId,
        position: updatedPage.position,
        title: doc?.title,
        createdBy: updatedPage.createdBy,
        createdAt: updatedPage.createdAt,
        updatedAt: updatedPage.updatedAt,
      });
    }
  );

  /**
   * GET /wiki/pages/:id - Get a specific wiki page
   * Returns: Page details with document info
   */
  fastify.get<{ Params: { id: string } }>(
    "/wiki/pages/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid page ID format",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const currentUserId = request.user.id;
      const orgId = request.user.orgId;

      // Get the page with document
      const [page] = await db
        .select({
          id: wikiPages.id,
          spaceId: wikiPages.spaceId,
          documentId: wikiPages.documentId,
          parentPageId: wikiPages.parentPageId,
          position: wikiPages.position,
          createdBy: wikiPages.createdBy,
          createdAt: wikiPages.createdAt,
          updatedAt: wikiPages.updatedAt,
          documentTitle: documents.title,
          yjsDocId: documents.yjsDocId,
        })
        .from(wikiPages)
        .innerJoin(documents, eq(wikiPages.documentId, documents.id))
        .where(
          and(
            eq(wikiPages.id, id),
            isNull(documents.deletedAt)
          )
        )
        .limit(1);

      if (!page) {
        return reply.status(404).send({
          error: "Wiki page not found",
        });
      }

      // Get the space and check org
      const [space] = await db
        .select()
        .from(wikiSpaces)
        .where(
          and(
            eq(wikiSpaces.id, page.spaceId),
            eq(wikiSpaces.orgId, orgId)
          )
        )
        .limit(1);

      if (!space) {
        return reply.status(404).send({
          error: "Wiki space not found",
        });
      }

      // Check access
      const canAccess = await canAccessSpace(page.spaceId, currentUserId, orgId);
      if (!canAccess) {
        return reply.status(403).send({
          error: "Access denied - you are not a member of this private space",
        });
      }

      // Get creator info
      const [creator] = await db
        .select({
          id: users.id,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(eq(users.id, page.createdBy))
        .limit(1);

      // Build breadcrumb (parent pages)
      const breadcrumb: Array<{ id: string; title: string }> = [];
      let currentParentId = page.parentPageId;
      while (currentParentId) {
        const [parent] = await db
          .select({
            id: wikiPages.id,
            parentPageId: wikiPages.parentPageId,
            title: documents.title,
          })
          .from(wikiPages)
          .innerJoin(documents, eq(wikiPages.documentId, documents.id))
          .where(eq(wikiPages.id, currentParentId))
          .limit(1);

        if (parent) {
          breadcrumb.unshift({ id: parent.id, title: parent.title });
          currentParentId = parent.parentPageId;
        } else {
          break;
        }
      }

      return reply.status(200).send({
        id: page.id,
        spaceId: page.spaceId,
        documentId: page.documentId,
        parentPageId: page.parentPageId,
        position: page.position,
        title: page.documentTitle,
        yjsDocId: page.yjsDocId,
        createdBy: page.createdBy,
        creator: creator
          ? {
              id: creator.id,
              displayName: creator.displayName,
              avatarUrl: creator.avatarUrl,
            }
          : null,
        breadcrumb,
        space: {
          id: space.id,
          name: space.name,
          icon: space.icon,
        },
        createdAt: page.createdAt,
        updatedAt: page.updatedAt,
      });
    }
  );

  /**
   * DELETE /wiki/pages/:id - Delete a wiki page
   * Returns: { success: true }
   */
  fastify.delete<{ Params: { id: string } }>(
    "/wiki/pages/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid page ID format",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const currentUserId = request.user.id;
      const orgId = request.user.orgId;

      // Get the page
      const [page] = await db
        .select()
        .from(wikiPages)
        .where(eq(wikiPages.id, id))
        .limit(1);

      if (!page) {
        return reply.status(404).send({
          error: "Wiki page not found",
        });
      }

      // Get the space and check org
      const [space] = await db
        .select()
        .from(wikiSpaces)
        .where(
          and(
            eq(wikiSpaces.id, page.spaceId),
            eq(wikiSpaces.orgId, orgId)
          )
        )
        .limit(1);

      if (!space) {
        return reply.status(404).send({
          error: "Wiki space not found",
        });
      }

      // Check if user can delete pages (need admin role or be the creator)
      const userRole = await getUserSpaceRole(page.spaceId, currentUserId);
      const isCreator = page.createdBy === currentUserId;

      if (!userRole || (userRole === "viewer") || (userRole === "editor" && !isCreator)) {
        return reply.status(403).send({
          error: "Access denied - need admin permission or be the page creator to delete pages",
        });
      }

      // Move children to deleted page's parent
      await db
        .update(wikiPages)
        .set({
          parentPageId: page.parentPageId,
          updatedAt: new Date(),
        })
        .where(eq(wikiPages.parentPageId, id));

      // Delete the page
      await db.delete(wikiPages).where(eq(wikiPages.id, id));

      // Soft-delete the linked document
      await db
        .update(documents)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(documents.id, page.documentId));

      // Update space updatedAt
      await db
        .update(wikiSpaces)
        .set({ updatedAt: new Date() })
        .where(eq(wikiSpaces.id, page.spaceId));

      return reply.status(200).send({ success: true });
    }
  );

  /**
   * PATCH /wiki/spaces/:id - Update wiki space settings
   * Body: { name?: string, description?: string, icon?: string, type?: SpaceType }
   * Returns: Updated space
   */
  fastify.patch<{ Params: { id: string }; Body: Partial<CreateSpaceBody> }>(
    "/wiki/spaces/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { name, description, icon, type } = request.body;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid space ID format",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const currentUserId = request.user.id;
      const orgId = request.user.orgId;

      // Get the space
      const [space] = await db
        .select()
        .from(wikiSpaces)
        .where(and(eq(wikiSpaces.id, id), eq(wikiSpaces.orgId, orgId)))
        .limit(1);

      if (!space) {
        return reply.status(404).send({
          error: "Wiki space not found",
        });
      }

      // Check if user is admin
      const userRole = await getUserSpaceRole(id, currentUserId);
      if (userRole !== "admin") {
        return reply.status(403).send({
          error: "Access denied - only admins can update space settings",
        });
      }

      // Build update object
      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (name !== undefined) {
        if (typeof name !== "string" || name.trim().length === 0) {
          return reply.status(400).send({
            error: "name must be a non-empty string",
          });
        }
        if (name.length > 255) {
          return reply.status(400).send({
            error: "name must be at most 255 characters",
          });
        }
        updates.name = name.trim();
      }

      if (description !== undefined) {
        updates.description = description?.trim() || null;
      }

      if (icon !== undefined) {
        updates.icon = icon || null;
      }

      if (type !== undefined) {
        if (!VALID_SPACE_TYPES.includes(type)) {
          return reply.status(400).send({
            error: `type must be one of: ${VALID_SPACE_TYPES.join(", ")}`,
          });
        }
        updates.type = type;
      }

      // Update the space
      const [updatedSpace] = await db
        .update(wikiSpaces)
        .set(updates)
        .where(eq(wikiSpaces.id, id))
        .returning();

      // Get member count
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(wikiSpaceMembers)
        .where(eq(wikiSpaceMembers.spaceId, id));

      return reply.status(200).send({
        id: updatedSpace.id,
        name: updatedSpace.name,
        description: updatedSpace.description,
        icon: updatedSpace.icon,
        type: updatedSpace.type,
        settings: updatedSpace.settings,
        memberCount: countResult?.count ?? 0,
        currentUserRole: "admin",
        createdAt: updatedSpace.createdAt,
        updatedAt: updatedSpace.updatedAt,
      });
    }
  );

  /**
   * DELETE /wiki/spaces/:id - Delete a wiki space
   * Returns: { success: true }
   */
  fastify.delete<{ Params: { id: string } }>(
    "/wiki/spaces/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid space ID format",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const currentUserId = request.user.id;
      const orgId = request.user.orgId;

      // Get the space
      const [space] = await db
        .select()
        .from(wikiSpaces)
        .where(and(eq(wikiSpaces.id, id), eq(wikiSpaces.orgId, orgId)))
        .limit(1);

      if (!space) {
        return reply.status(404).send({
          error: "Wiki space not found",
        });
      }

      // Check if user is admin
      const userRole = await getUserSpaceRole(id, currentUserId);
      if (userRole !== "admin") {
        return reply.status(403).send({
          error: "Access denied - only admins can delete spaces",
        });
      }

      // Soft-delete all documents linked to pages in this space
      const pages = await db
        .select({ documentId: wikiPages.documentId })
        .from(wikiPages)
        .where(eq(wikiPages.spaceId, id));

      if (pages.length > 0) {
        const documentIds = pages.map((p) => p.documentId);
        await db
          .update(documents)
          .set({
            deletedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(inArray(documents.id, documentIds));
      }

      // Delete all pages (cascade will handle wiki_pages deletion)
      await db.delete(wikiPages).where(eq(wikiPages.spaceId, id));

      // Delete all members (cascade will handle wiki_space_members deletion)
      await db.delete(wikiSpaceMembers).where(eq(wikiSpaceMembers.spaceId, id));

      // Delete the space
      await db.delete(wikiSpaces).where(eq(wikiSpaces.id, id));

      return reply.status(200).send({ success: true });
    }
  );

  /**
   * POST /wiki/spaces/:id/members - Add member to wiki space
   * Body: { userId: string, role: MemberRole }
   * Returns: Created membership
   */
  fastify.post<{ Params: { id: string }; Body: { userId: string; role?: MemberRole } }>(
    "/wiki/spaces/:id/members",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { userId, role = "viewer" } = request.body;

      // Validate UUID formats
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid space ID format",
        });
      }

      if (!userId || !UUID_REGEX.test(userId)) {
        return reply.status(400).send({
          error: "userId is required and must be a valid UUID",
        });
      }

      // Validate role
      if (!VALID_MEMBER_ROLES.includes(role)) {
        return reply.status(400).send({
          error: `role must be one of: ${VALID_MEMBER_ROLES.join(", ")}`,
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const currentUserId = request.user.id;
      const orgId = request.user.orgId;

      // Get the space
      const [space] = await db
        .select()
        .from(wikiSpaces)
        .where(and(eq(wikiSpaces.id, id), eq(wikiSpaces.orgId, orgId)))
        .limit(1);

      if (!space) {
        return reply.status(404).send({
          error: "Wiki space not found",
        });
      }

      // Check if current user is admin
      const currentUserRole = await getUserSpaceRole(id, currentUserId);
      if (currentUserRole !== "admin") {
        return reply.status(403).send({
          error: "Access denied - only admins can add members",
        });
      }

      // Check if target user exists in same org
      const [targetUser] = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.id, userId),
            eq(users.orgId, orgId),
            isNull(users.deletedAt)
          )
        )
        .limit(1);

      if (!targetUser) {
        return reply.status(400).send({
          error: "User not found in your organization",
        });
      }

      // Check if already a member
      const existingMembership = await getUserSpaceRole(id, userId);
      if (existingMembership) {
        return reply.status(409).send({
          error: "User is already a member of this space",
        });
      }

      // Add member
      await db.insert(wikiSpaceMembers).values({
        spaceId: id,
        userId,
        role,
      });

      return reply.status(201).send({
        spaceId: id,
        userId,
        role,
        user: {
          id: targetUser.id,
          displayName: targetUser.displayName,
          email: targetUser.email,
          avatarUrl: targetUser.avatarUrl,
        },
      });
    }
  );

  /**
   * DELETE /wiki/spaces/:id/members/:userId - Remove member from wiki space
   * Returns: { success: true }
   */
  fastify.delete<{ Params: { id: string; userId: string } }>(
    "/wiki/spaces/:id/members/:userId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id, userId } = request.params;

      // Validate UUID formats
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid space ID format",
        });
      }

      if (!UUID_REGEX.test(userId)) {
        return reply.status(400).send({
          error: "Invalid user ID format",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const currentUserId = request.user.id;
      const orgId = request.user.orgId;

      // Get the space
      const [space] = await db
        .select()
        .from(wikiSpaces)
        .where(and(eq(wikiSpaces.id, id), eq(wikiSpaces.orgId, orgId)))
        .limit(1);

      if (!space) {
        return reply.status(404).send({
          error: "Wiki space not found",
        });
      }

      // Check permissions: admin can remove anyone, user can remove themselves
      const currentUserRole = await getUserSpaceRole(id, currentUserId);
      const isRemovingSelf = userId === currentUserId;

      if (!isRemovingSelf && currentUserRole !== "admin") {
        return reply.status(403).send({
          error: "Access denied - only admins can remove other members",
        });
      }

      // Check if target user is a member
      const targetRole = await getUserSpaceRole(id, userId);
      if (!targetRole) {
        return reply.status(404).send({
          error: "User is not a member of this space",
        });
      }

      // Prevent removing the last admin
      if (targetRole === "admin") {
        const [adminCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(wikiSpaceMembers)
          .where(
            and(
              eq(wikiSpaceMembers.spaceId, id),
              eq(wikiSpaceMembers.role, "admin")
            )
          );

        if ((adminCount?.count ?? 0) <= 1) {
          return reply.status(400).send({
            error: "Cannot remove the last admin from the space",
          });
        }
      }

      // Remove member
      await db
        .delete(wikiSpaceMembers)
        .where(
          and(
            eq(wikiSpaceMembers.spaceId, id),
            eq(wikiSpaceMembers.userId, userId)
          )
        );

      return reply.status(200).send({ success: true });
    }
  );
}
