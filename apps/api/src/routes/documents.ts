import { FastifyInstance } from "fastify";
import { db } from "../db";
import {
  documents,
  documentPermissions,
  documentVersions,
  users,
  departmentMembers,
  departments,
  organizations,
} from "../db/schema";
import { eq, and, or, inArray, desc, sql, isNull, ilike } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { randomUUID } from "crypto";

// UUID validation regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Valid document types
const VALID_DOC_TYPES = ["doc", "sheet", "slide", "mindnote", "board"] as const;
type DocType = (typeof VALID_DOC_TYPES)[number];

// Valid permission roles
const VALID_ROLES = ["viewer", "editor", "manager", "owner"] as const;
type PermissionRole = (typeof VALID_ROLES)[number];

// Valid principal types
const VALID_PRINCIPAL_TYPES = ["user", "department", "org"] as const;
type PrincipalType = (typeof VALID_PRINCIPAL_TYPES)[number];

interface CreateDocumentBody {
  title: string;
  type: DocType;
}

interface UpdateDocumentBody {
  title?: string;
  settings?: {
    defaultFont?: string;
    defaultFontSize?: number;
    pageSize?: "A4" | "Letter" | "Legal";
    orientation?: "portrait" | "landscape";
    theme?: "light" | "dark" | "system";
  };
}

interface GetDocumentsQuery {
  limit?: number;
  offset?: number;
  type?: DocType;
}

interface AddPermissionBody {
  principalId: string;
  principalType: PrincipalType;
  role: PermissionRole;
}

interface UpdatePermissionBody {
  role: PermissionRole;
}

/**
 * Check if user has permission to access a document
 * Returns the highest role the user has (owner > manager > editor > viewer)
 */
async function getUserDocumentRole(
  documentId: string,
  userId: string,
  orgId: string
): Promise<PermissionRole | null> {
  // First check if user is the owner
  const [doc] = await db
    .select({ ownerId: documents.ownerId })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (doc?.ownerId === userId) {
    return "owner";
  }

  // Get user's department IDs
  const userMemberships = await db
    .select({ departmentId: departmentMembers.departmentId })
    .from(departmentMembers)
    .where(eq(departmentMembers.userId, userId));

  const departmentIds = userMemberships
    .map((m) => m.departmentId)
    .filter((id): id is string => id !== null);

  // Check permissions - user, department, and org level
  const permissions = await db
    .select({ role: documentPermissions.role })
    .from(documentPermissions)
    .where(
      and(
        eq(documentPermissions.documentId, documentId),
        or(
          // Direct user permission
          and(
            eq(documentPermissions.principalType, "user"),
            eq(documentPermissions.principalId, userId)
          ),
          // Department permissions
          ...(departmentIds.length > 0
            ? [
                and(
                  eq(documentPermissions.principalType, "department"),
                  inArray(documentPermissions.principalId, departmentIds)
                ),
              ]
            : []),
          // Org-wide permission
          and(
            eq(documentPermissions.principalType, "org"),
            eq(documentPermissions.principalId, orgId)
          )
        )
      )
    );

  if (permissions.length === 0) {
    return null;
  }

  // Return the highest role
  const roleOrder: Record<PermissionRole, number> = {
    viewer: 1,
    editor: 2,
    manager: 3,
    owner: 4,
  };

  let highestRole: PermissionRole = "viewer";
  for (const perm of permissions) {
    if (roleOrder[perm.role as PermissionRole] > roleOrder[highestRole]) {
      highestRole = perm.role as PermissionRole;
    }
  }

  return highestRole;
}

/**
 * Check if user can manage document permissions (owner or manager role)
 */
async function canManagePermissions(
  documentId: string,
  userId: string,
  orgId: string
): Promise<boolean> {
  const role = await getUserDocumentRole(documentId, userId, orgId);
  return role === "owner" || role === "manager";
}

export async function documentsRoutes(fastify: FastifyInstance) {
  /**
   * POST /documents - Create a new document
   * Body: { title: string, type: DocType }
   * Returns: Document with owner permission created
   */
  fastify.post<{ Body: CreateDocumentBody }>(
    "/documents",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { title, type } = request.body;

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

      // Validate type
      if (!type || !VALID_DOC_TYPES.includes(type)) {
        return reply.status(400).send({
          error: `type must be one of: ${VALID_DOC_TYPES.join(", ")}`,
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization to create documents",
        });
      }

      const currentUserId = request.user.id;
      const orgId = request.user.orgId;

      // Generate a unique yjs_doc_id
      const yjsDocId = `doc-${randomUUID()}`;

      // Create the document
      const [newDoc] = await db
        .insert(documents)
        .values({
          title: title.trim(),
          type,
          orgId,
          ownerId: currentUserId,
          yjsDocId,
        })
        .returning();

      // Create owner permission for the creator
      await db.insert(documentPermissions).values({
        documentId: newDoc.id,
        principalId: currentUserId,
        principalType: "user",
        role: "owner",
      });

      return reply.status(201).send({
        id: newDoc.id,
        title: newDoc.title,
        type: newDoc.type,
        yjsDocId: newDoc.yjsDocId,
        ownerId: newDoc.ownerId,
        settings: newDoc.settings,
        createdAt: newDoc.createdAt,
        updatedAt: newDoc.updatedAt,
      });
    }
  );

  /**
   * GET /documents - Get user's documents (owned + shared)
   * Query: { limit?: number, offset?: number, type?: DocType }
   * Returns: Paginated list of documents
   */
  fastify.get<{ Querystring: GetDocumentsQuery }>(
    "/documents",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { limit = 50, offset = 0, type } = request.query;

      // Validate limit and offset
      const parsedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
      const parsedOffset = Math.max(Number(offset) || 0, 0);

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const currentUserId = request.user.id;
      const orgId = request.user.orgId;

      // Get user's department IDs
      const userMemberships = await db
        .select({ departmentId: departmentMembers.departmentId })
        .from(departmentMembers)
        .where(eq(departmentMembers.userId, currentUserId));

      const departmentIds = userMemberships
        .map((m) => m.departmentId)
        .filter((id): id is string => id !== null);

      // Build the permission conditions
      const permissionConditions = or(
        // Documents user owns
        eq(documents.ownerId, currentUserId),
        // Documents with explicit user permission
        sql`EXISTS (
          SELECT 1 FROM document_permissions dp
          WHERE dp.document_id = ${documents.id}
          AND dp.principal_type = 'user'
          AND dp.principal_id = ${currentUserId}
        )`,
        // Documents with department permission
        ...(departmentIds.length > 0
          ? [
              sql`EXISTS (
                SELECT 1 FROM document_permissions dp
                WHERE dp.document_id = ${documents.id}
                AND dp.principal_type = 'department'
                AND dp.principal_id = ANY(${departmentIds})
              )`,
            ]
          : []),
        // Documents with org-wide permission
        sql`EXISTS (
          SELECT 1 FROM document_permissions dp
          WHERE dp.document_id = ${documents.id}
          AND dp.principal_type = 'org'
          AND dp.principal_id = ${orgId}
        )`
      );

      // Build where conditions
      const whereConditions = and(
        eq(documents.orgId, orgId),
        isNull(documents.deletedAt),
        permissionConditions,
        type ? eq(documents.type, type) : undefined
      );

      // Get total count
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(documents)
        .where(whereConditions);

      const total = countResult?.count ?? 0;

      // Get documents with owner info
      const docs = await db
        .select({
          id: documents.id,
          title: documents.title,
          type: documents.type,
          yjsDocId: documents.yjsDocId,
          ownerId: documents.ownerId,
          settings: documents.settings,
          createdAt: documents.createdAt,
          updatedAt: documents.updatedAt,
          ownerName: users.displayName,
          ownerAvatarUrl: users.avatarUrl,
        })
        .from(documents)
        .innerJoin(users, eq(documents.ownerId, users.id))
        .where(whereConditions)
        .orderBy(desc(documents.updatedAt))
        .limit(parsedLimit)
        .offset(parsedOffset);

      return reply.status(200).send({
        documents: docs.map((doc) => ({
          id: doc.id,
          title: doc.title,
          type: doc.type,
          yjsDocId: doc.yjsDocId,
          ownerId: doc.ownerId,
          settings: doc.settings,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
          owner: {
            id: doc.ownerId,
            displayName: doc.ownerName,
            avatarUrl: doc.ownerAvatarUrl,
          },
        })),
        pagination: {
          total,
          limit: parsedLimit,
          offset: parsedOffset,
          hasMore: parsedOffset + docs.length < total,
        },
      });
    }
  );

  /**
   * GET /documents/:id - Get document metadata and permissions
   * Returns: Document with permissions array
   */
  fastify.get<{ Params: { id: string } }>(
    "/documents/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid document ID format",
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

      // Get the document
      const [doc] = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.id, id),
            eq(documents.orgId, orgId),
            isNull(documents.deletedAt)
          )
        )
        .limit(1);

      if (!doc) {
        return reply.status(404).send({
          error: "Document not found",
        });
      }

      // Check if user has access
      const userRole = await getUserDocumentRole(id, currentUserId, orgId);
      if (!userRole) {
        return reply.status(403).send({
          error: "Access denied - no permission to view this document",
        });
      }

      // Get owner info
      const [owner] = await db
        .select({
          id: users.id,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(eq(users.id, doc.ownerId))
        .limit(1);

      // Get all permissions
      const permissions = await db
        .select()
        .from(documentPermissions)
        .where(eq(documentPermissions.documentId, id));

      return reply.status(200).send({
        id: doc.id,
        title: doc.title,
        type: doc.type,
        yjsDocId: doc.yjsDocId,
        ownerId: doc.ownerId,
        settings: doc.settings,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        owner,
        currentUserRole: userRole,
        permissions: permissions.map((p) => ({
          id: p.id,
          principalId: p.principalId,
          principalType: p.principalType,
          role: p.role,
          createdAt: p.createdAt,
        })),
      });
    }
  );

  /**
   * PATCH /documents/:id - Update document title and settings
   * Body: { title?: string, settings?: DocumentSettings }
   * Returns: Updated document
   */
  fastify.patch<{ Params: { id: string }; Body: UpdateDocumentBody }>(
    "/documents/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { title, settings } = request.body;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid document ID format",
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

      // Get the document
      const [doc] = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.id, id),
            eq(documents.orgId, orgId),
            isNull(documents.deletedAt)
          )
        )
        .limit(1);

      if (!doc) {
        return reply.status(404).send({
          error: "Document not found",
        });
      }

      // Check if user has edit permission
      const userRole = await getUserDocumentRole(id, currentUserId, orgId);
      if (!userRole || userRole === "viewer") {
        return reply.status(403).send({
          error: "Access denied - need editor permission or higher",
        });
      }

      // Build update object
      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (title !== undefined) {
        if (typeof title !== "string" || title.trim().length === 0) {
          return reply.status(400).send({
            error: "title must be a non-empty string",
          });
        }
        if (title.length > 500) {
          return reply.status(400).send({
            error: "title must be at most 500 characters",
          });
        }
        updates.title = title.trim();
      }

      if (settings !== undefined) {
        // Merge with existing settings
        const existingSettings = (doc.settings ?? {}) as Record<string, unknown>;
        const newSettings = { ...existingSettings };

        if (settings.defaultFont !== undefined) {
          newSettings.defaultFont = settings.defaultFont;
        }
        if (settings.defaultFontSize !== undefined) {
          newSettings.defaultFontSize = settings.defaultFontSize;
        }
        if (settings.pageSize !== undefined) {
          if (!["A4", "Letter", "Legal"].includes(settings.pageSize)) {
            return reply.status(400).send({
              error: "pageSize must be one of: A4, Letter, Legal",
            });
          }
          newSettings.pageSize = settings.pageSize;
        }
        if (settings.orientation !== undefined) {
          if (!["portrait", "landscape"].includes(settings.orientation)) {
            return reply.status(400).send({
              error: "orientation must be one of: portrait, landscape",
            });
          }
          newSettings.orientation = settings.orientation;
        }
        if (settings.theme !== undefined) {
          if (!["light", "dark", "system"].includes(settings.theme)) {
            return reply.status(400).send({
              error: "theme must be one of: light, dark, system",
            });
          }
          newSettings.theme = settings.theme;
        }

        updates.settings = newSettings;
      }

      // If no updates provided, return current document
      if (Object.keys(updates).length === 1) {
        // only updatedAt
        return reply.status(200).send({
          id: doc.id,
          title: doc.title,
          type: doc.type,
          yjsDocId: doc.yjsDocId,
          ownerId: doc.ownerId,
          settings: doc.settings,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        });
      }

      // Update the document
      const [updatedDoc] = await db
        .update(documents)
        .set(updates)
        .where(eq(documents.id, id))
        .returning();

      return reply.status(200).send({
        id: updatedDoc.id,
        title: updatedDoc.title,
        type: updatedDoc.type,
        yjsDocId: updatedDoc.yjsDocId,
        ownerId: updatedDoc.ownerId,
        settings: updatedDoc.settings,
        createdAt: updatedDoc.createdAt,
        updatedAt: updatedDoc.updatedAt,
      });
    }
  );

  /**
   * DELETE /documents/:id - Soft-delete a document
   * Returns: { success: true }
   */
  fastify.delete<{ Params: { id: string } }>(
    "/documents/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid document ID format",
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

      // Get the document
      const [doc] = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.id, id),
            eq(documents.orgId, orgId),
            isNull(documents.deletedAt)
          )
        )
        .limit(1);

      if (!doc) {
        return reply.status(404).send({
          error: "Document not found",
        });
      }

      // Only owner can delete
      if (doc.ownerId !== currentUserId) {
        return reply.status(403).send({
          error: "Only the document owner can delete it",
        });
      }

      // Soft-delete the document
      await db
        .update(documents)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(documents.id, id));

      return reply.status(200).send({ success: true });
    }
  );

  /**
   * POST /documents/:id/permissions - Add a permission entry
   * Body: { principalId: string, principalType: PrincipalType, role: PermissionRole }
   * Returns: Created permission
   */
  fastify.post<{ Params: { id: string }; Body: AddPermissionBody }>(
    "/documents/:id/permissions",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { principalId, principalType, role } = request.body;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid document ID format",
        });
      }

      // Validate principalId
      if (!principalId || !UUID_REGEX.test(principalId)) {
        return reply.status(400).send({
          error: "principalId is required and must be a valid UUID",
        });
      }

      // Validate principalType
      if (!principalType || !VALID_PRINCIPAL_TYPES.includes(principalType)) {
        return reply.status(400).send({
          error: `principalType must be one of: ${VALID_PRINCIPAL_TYPES.join(", ")}`,
        });
      }

      // Validate role
      if (!role || !VALID_ROLES.includes(role)) {
        return reply.status(400).send({
          error: `role must be one of: ${VALID_ROLES.join(", ")}`,
        });
      }

      // Cannot assign owner role via permissions API
      if (role === "owner") {
        return reply.status(400).send({
          error: "Cannot assign owner role via permissions API",
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

      // Get the document
      const [doc] = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.id, id),
            eq(documents.orgId, orgId),
            isNull(documents.deletedAt)
          )
        )
        .limit(1);

      if (!doc) {
        return reply.status(404).send({
          error: "Document not found",
        });
      }

      // Check if user can manage permissions
      const canManage = await canManagePermissions(id, currentUserId, orgId);
      if (!canManage) {
        return reply.status(403).send({
          error: "Access denied - need manager or owner permission",
        });
      }

      // Check if permission already exists
      const [existing] = await db
        .select()
        .from(documentPermissions)
        .where(
          and(
            eq(documentPermissions.documentId, id),
            eq(documentPermissions.principalId, principalId),
            eq(documentPermissions.principalType, principalType)
          )
        )
        .limit(1);

      if (existing) {
        return reply.status(409).send({
          error: "Permission already exists for this principal",
        });
      }

      // Create the permission
      const [newPermission] = await db
        .insert(documentPermissions)
        .values({
          documentId: id,
          principalId,
          principalType,
          role,
        })
        .returning();

      return reply.status(201).send({
        id: newPermission.id,
        documentId: newPermission.documentId,
        principalId: newPermission.principalId,
        principalType: newPermission.principalType,
        role: newPermission.role,
        createdAt: newPermission.createdAt,
      });
    }
  );

  /**
   * PATCH /documents/:id/permissions/:permissionId - Update a permission role
   * Body: { role: PermissionRole }
   * Returns: Updated permission
   */
  fastify.patch<{
    Params: { id: string; permissionId: string };
    Body: UpdatePermissionBody;
  }>(
    "/documents/:id/permissions/:permissionId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id, permissionId } = request.params;
      const { role } = request.body;

      // Validate UUID formats
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid document ID format",
        });
      }

      if (!UUID_REGEX.test(permissionId)) {
        return reply.status(400).send({
          error: "Invalid permission ID format",
        });
      }

      // Validate role
      if (!role || !VALID_ROLES.includes(role)) {
        return reply.status(400).send({
          error: `role must be one of: ${VALID_ROLES.join(", ")}`,
        });
      }

      // Cannot assign owner role via permissions API
      if (role === "owner") {
        return reply.status(400).send({
          error: "Cannot assign owner role via permissions API",
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

      // Get the document
      const [doc] = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.id, id),
            eq(documents.orgId, orgId),
            isNull(documents.deletedAt)
          )
        )
        .limit(1);

      if (!doc) {
        return reply.status(404).send({
          error: "Document not found",
        });
      }

      // Check if user can manage permissions
      const canManage = await canManagePermissions(id, currentUserId, orgId);
      if (!canManage) {
        return reply.status(403).send({
          error: "Access denied - need manager or owner permission",
        });
      }

      // Get the permission
      const [permission] = await db
        .select()
        .from(documentPermissions)
        .where(
          and(
            eq(documentPermissions.id, permissionId),
            eq(documentPermissions.documentId, id)
          )
        )
        .limit(1);

      if (!permission) {
        return reply.status(404).send({
          error: "Permission not found",
        });
      }

      // Cannot modify owner permission
      if (permission.role === "owner") {
        return reply.status(400).send({
          error: "Cannot modify owner permission",
        });
      }

      // Update the permission
      const [updatedPermission] = await db
        .update(documentPermissions)
        .set({
          role,
          updatedAt: new Date(),
        })
        .where(eq(documentPermissions.id, permissionId))
        .returning();

      return reply.status(200).send({
        id: updatedPermission.id,
        documentId: updatedPermission.documentId,
        principalId: updatedPermission.principalId,
        principalType: updatedPermission.principalType,
        role: updatedPermission.role,
        createdAt: updatedPermission.createdAt,
        updatedAt: updatedPermission.updatedAt,
      });
    }
  );

  /**
   * DELETE /documents/:id/permissions/:permissionId - Remove a permission
   * Returns: { success: true }
   */
  fastify.delete<{ Params: { id: string; permissionId: string } }>(
    "/documents/:id/permissions/:permissionId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id, permissionId } = request.params;

      // Validate UUID formats
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid document ID format",
        });
      }

      if (!UUID_REGEX.test(permissionId)) {
        return reply.status(400).send({
          error: "Invalid permission ID format",
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

      // Get the document
      const [doc] = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.id, id),
            eq(documents.orgId, orgId),
            isNull(documents.deletedAt)
          )
        )
        .limit(1);

      if (!doc) {
        return reply.status(404).send({
          error: "Document not found",
        });
      }

      // Check if user can manage permissions
      const canManage = await canManagePermissions(id, currentUserId, orgId);
      if (!canManage) {
        return reply.status(403).send({
          error: "Access denied - need manager or owner permission",
        });
      }

      // Get the permission
      const [permission] = await db
        .select()
        .from(documentPermissions)
        .where(
          and(
            eq(documentPermissions.id, permissionId),
            eq(documentPermissions.documentId, id)
          )
        )
        .limit(1);

      if (!permission) {
        return reply.status(404).send({
          error: "Permission not found",
        });
      }

      // Cannot delete owner permission
      if (permission.role === "owner") {
        return reply.status(400).send({
          error: "Cannot delete owner permission",
        });
      }

      // Delete the permission
      await db
        .delete(documentPermissions)
        .where(eq(documentPermissions.id, permissionId));

      return reply.status(200).send({ success: true });
    }
  );

  /**
   * GET /documents/:id/collaborators - Get enriched collaborator list
   * Returns: Permissions with user/department/org details
   */
  fastify.get<{ Params: { id: string } }>(
    "/documents/:id/collaborators",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid document ID format",
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

      // Get the document
      const [doc] = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.id, id),
            eq(documents.orgId, orgId),
            isNull(documents.deletedAt)
          )
        )
        .limit(1);

      if (!doc) {
        return reply.status(404).send({
          error: "Document not found",
        });
      }

      // Check if user has access
      const userRole = await getUserDocumentRole(id, currentUserId, orgId);
      if (!userRole) {
        return reply.status(403).send({
          error: "Access denied - no permission to view this document",
        });
      }

      // Get all permissions
      const permissions = await db
        .select()
        .from(documentPermissions)
        .where(eq(documentPermissions.documentId, id));

      // Enrich with details
      const enrichedCollaborators = await Promise.all(
        permissions.map(async (p) => {
          let principalDetails: {
            id: string;
            name: string;
            avatarUrl: string | null;
            email?: string;
            memberCount?: number;
          };

          if (p.principalType === "user") {
            const [user] = await db
              .select({
                id: users.id,
                displayName: users.displayName,
                email: users.email,
                avatarUrl: users.avatarUrl,
              })
              .from(users)
              .where(eq(users.id, p.principalId))
              .limit(1);

            principalDetails = user
              ? {
                  id: user.id,
                  name: user.displayName || user.email,
                  email: user.email,
                  avatarUrl: user.avatarUrl,
                }
              : {
                  id: p.principalId,
                  name: "Unknown User",
                  avatarUrl: null,
                };
          } else if (p.principalType === "department") {
            const [dept] = await db
              .select({
                id: departments.id,
                name: departments.name,
              })
              .from(departments)
              .where(eq(departments.id, p.principalId))
              .limit(1);

            // Get member count
            const [countResult] = await db
              .select({ count: sql<number>`count(*)::int` })
              .from(departmentMembers)
              .where(eq(departmentMembers.departmentId, p.principalId));

            principalDetails = dept
              ? {
                  id: dept.id,
                  name: dept.name,
                  avatarUrl: null,
                  memberCount: countResult?.count ?? 0,
                }
              : {
                  id: p.principalId,
                  name: "Unknown Department",
                  avatarUrl: null,
                };
          } else {
            // org type
            const [org] = await db
              .select({
                id: organizations.id,
                name: organizations.name,
                logoUrl: organizations.logoUrl,
              })
              .from(organizations)
              .where(eq(organizations.id, p.principalId))
              .limit(1);

            principalDetails = org
              ? {
                  id: org.id,
                  name: org.name,
                  avatarUrl: org.logoUrl,
                }
              : {
                  id: p.principalId,
                  name: "Unknown Organization",
                  avatarUrl: null,
                };
          }

          return {
            id: p.id,
            principalId: p.principalId,
            principalType: p.principalType,
            role: p.role,
            createdAt: p.createdAt,
            principal: principalDetails,
          };
        })
      );

      // Get owner info separately (not in permissions table as explicit entry)
      const [owner] = await db
        .select({
          id: users.id,
          displayName: users.displayName,
          email: users.email,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(eq(users.id, doc.ownerId))
        .limit(1);

      return reply.status(200).send({
        documentId: id,
        owner: owner
          ? {
              id: owner.id,
              name: owner.displayName || owner.email,
              email: owner.email,
              avatarUrl: owner.avatarUrl,
            }
          : null,
        collaborators: enrichedCollaborators,
        currentUserRole: userRole,
        canManage: userRole === "owner" || userRole === "manager",
      });
    }
  );

  /**
   * GET /documents/:id/search-principals - Search users and departments to add as collaborators
   * Query: { q: string, type?: 'user' | 'department' }
   */
  fastify.get<{ Params: { id: string }; Querystring: { q?: string; type?: string } }>(
    "/documents/:id/search-principals",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { q, type } = request.query;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid document ID format",
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

      // Check if user can manage permissions
      const canManage = await canManagePermissions(id, currentUserId, orgId);
      if (!canManage) {
        return reply.status(403).send({
          error: "Access denied - need manager or owner permission",
        });
      }

      // Get existing permission principal IDs to exclude
      const existingPermissions = await db
        .select({ principalId: documentPermissions.principalId })
        .from(documentPermissions)
        .where(eq(documentPermissions.documentId, id));

      const excludedIds = new Set(existingPermissions.map((p) => p.principalId));

      // Get document owner to exclude
      const [doc] = await db
        .select({ ownerId: documents.ownerId })
        .from(documents)
        .where(eq(documents.id, id))
        .limit(1);

      if (doc) {
        excludedIds.add(doc.ownerId);
      }

      const results: Array<{
        id: string;
        type: "user" | "department";
        name: string;
        email?: string;
        avatarUrl: string | null;
        memberCount?: number;
      }> = [];

      // Search users if type is not specified or is 'user'
      if (!type || type === "user") {
        const searchTerm = q ? `%${q.trim()}%` : "%";
        const userResults = await db
          .select({
            id: users.id,
            displayName: users.displayName,
            email: users.email,
            avatarUrl: users.avatarUrl,
          })
          .from(users)
          .where(
            and(
              eq(users.orgId, orgId),
              isNull(users.deletedAt),
              or(
                ilike(users.displayName, searchTerm),
                ilike(users.email, searchTerm)
              )
            )
          )
          .limit(10);

        for (const user of userResults) {
          if (!excludedIds.has(user.id)) {
            results.push({
              id: user.id,
              type: "user",
              name: user.displayName || user.email,
              email: user.email,
              avatarUrl: user.avatarUrl,
            });
          }
        }
      }

      // Search departments if type is not specified or is 'department'
      if (!type || type === "department") {
        const searchTerm = q ? `%${q.trim()}%` : "%";
        const deptResults = await db
          .select({
            id: departments.id,
            name: departments.name,
          })
          .from(departments)
          .where(
            and(
              eq(departments.orgId, orgId),
              ilike(departments.name, searchTerm)
            )
          )
          .limit(10);

        for (const dept of deptResults) {
          if (!excludedIds.has(dept.id)) {
            // Get member count
            const [countResult] = await db
              .select({ count: sql<number>`count(*)::int` })
              .from(departmentMembers)
              .where(eq(departmentMembers.departmentId, dept.id));

            results.push({
              id: dept.id,
              type: "department",
              name: dept.name,
              avatarUrl: null,
              memberCount: countResult?.count ?? 0,
            });
          }
        }
      }

      return reply.status(200).send({
        results,
      });
    }
  );

  /**
   * POST /documents/:id/copy-link - Generate a shareable link with specified permission
   * Body: { role: 'viewer' | 'editor' }
   * Returns: { link: string }
   */
  fastify.post<{ Params: { id: string }; Body: { role: "viewer" | "editor" } }>(
    "/documents/:id/copy-link",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { role } = request.body;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid document ID format",
        });
      }

      // Validate role
      if (!role || !["viewer", "editor"].includes(role)) {
        return reply.status(400).send({
          error: "role must be one of: viewer, editor",
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

      // Check if document exists
      const [doc] = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.id, id),
            eq(documents.orgId, orgId),
            isNull(documents.deletedAt)
          )
        )
        .limit(1);

      if (!doc) {
        return reply.status(404).send({
          error: "Document not found",
        });
      }

      // Check if user can manage permissions
      const canManage = await canManagePermissions(id, currentUserId, orgId);
      if (!canManage) {
        return reply.status(403).send({
          error: "Access denied - need manager or owner permission",
        });
      }

      // Check if org-wide permission already exists
      const [existingOrgPerm] = await db
        .select()
        .from(documentPermissions)
        .where(
          and(
            eq(documentPermissions.documentId, id),
            eq(documentPermissions.principalType, "org"),
            eq(documentPermissions.principalId, orgId)
          )
        )
        .limit(1);

      if (existingOrgPerm) {
        // Update the role if different
        if (existingOrgPerm.role !== role) {
          await db
            .update(documentPermissions)
            .set({ role, updatedAt: new Date() })
            .where(eq(documentPermissions.id, existingOrgPerm.id));
        }
      } else {
        // Create org-wide permission
        await db.insert(documentPermissions).values({
          documentId: id,
          principalId: orgId,
          principalType: "org",
          role,
        });
      }

      // Generate the link (using the frontend URL pattern)
      const link = `/app/docs/${id}`;

      return reply.status(200).send({
        link,
        message: `Anyone in your organization can now ${role === "viewer" ? "view" : "edit"} this document`,
      });
    }
  );

  /**
   * POST /documents/:id/versions - Create a named snapshot of current document state
   * Body: { name: string }
   * Returns: Created version
   */
  fastify.post<{ Params: { id: string }; Body: { name: string } }>(
    "/documents/:id/versions",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { name } = request.body;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid document ID format",
        });
      }

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

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const currentUserId = request.user.id;
      const orgId = request.user.orgId;

      // Get the document
      const [doc] = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.id, id),
            eq(documents.orgId, orgId),
            isNull(documents.deletedAt)
          )
        )
        .limit(1);

      if (!doc) {
        return reply.status(404).send({
          error: "Document not found",
        });
      }

      // Check if user has edit permission
      const userRole = await getUserDocumentRole(id, currentUserId, orgId);
      if (!userRole || userRole === "viewer") {
        return reply.status(403).send({
          error: "Access denied - need editor permission or higher to create versions",
        });
      }

      // Get current Yjs state from document
      const snapshotBlob = doc.yjsState;

      if (!snapshotBlob) {
        return reply.status(400).send({
          error: "Document has no content to snapshot",
        });
      }

      // Create the version
      const [newVersion] = await db
        .insert(documentVersions)
        .values({
          documentId: id,
          name: name.trim(),
          snapshotBlob,
          createdBy: currentUserId,
        })
        .returning();

      // Get creator info
      const [creator] = await db
        .select({
          id: users.id,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(eq(users.id, currentUserId))
        .limit(1);

      return reply.status(201).send({
        id: newVersion.id,
        documentId: newVersion.documentId,
        name: newVersion.name,
        createdAt: newVersion.createdAt,
        creator: creator
          ? {
              id: creator.id,
              displayName: creator.displayName,
              avatarUrl: creator.avatarUrl,
            }
          : null,
      });
    }
  );

  /**
   * GET /documents/:id/versions - List all versions of a document
   * Returns: Array of versions with creator info
   */
  fastify.get<{ Params: { id: string } }>(
    "/documents/:id/versions",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid document ID format",
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

      // Get the document
      const [doc] = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.id, id),
            eq(documents.orgId, orgId),
            isNull(documents.deletedAt)
          )
        )
        .limit(1);

      if (!doc) {
        return reply.status(404).send({
          error: "Document not found",
        });
      }

      // Check if user has access
      const userRole = await getUserDocumentRole(id, currentUserId, orgId);
      if (!userRole) {
        return reply.status(403).send({
          error: "Access denied - no permission to view this document",
        });
      }

      // Get all versions with creator info
      const versions = await db
        .select({
          id: documentVersions.id,
          documentId: documentVersions.documentId,
          name: documentVersions.name,
          createdAt: documentVersions.createdAt,
          creatorId: documentVersions.createdBy,
          creatorDisplayName: users.displayName,
          creatorAvatarUrl: users.avatarUrl,
        })
        .from(documentVersions)
        .innerJoin(users, eq(documentVersions.createdBy, users.id))
        .where(eq(documentVersions.documentId, id))
        .orderBy(desc(documentVersions.createdAt));

      return reply.status(200).send({
        versions: versions.map((v) => ({
          id: v.id,
          documentId: v.documentId,
          name: v.name,
          createdAt: v.createdAt,
          creator: {
            id: v.creatorId,
            displayName: v.creatorDisplayName,
            avatarUrl: v.creatorAvatarUrl,
          },
        })),
      });
    }
  );

  /**
   * GET /documents/:id/versions/:versionId - Get a specific version's content
   * Returns: Version with snapshot blob for preview
   */
  fastify.get<{ Params: { id: string; versionId: string } }>(
    "/documents/:id/versions/:versionId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id, versionId } = request.params;

      // Validate UUID formats
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid document ID format",
        });
      }

      if (!UUID_REGEX.test(versionId)) {
        return reply.status(400).send({
          error: "Invalid version ID format",
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

      // Get the document
      const [doc] = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.id, id),
            eq(documents.orgId, orgId),
            isNull(documents.deletedAt)
          )
        )
        .limit(1);

      if (!doc) {
        return reply.status(404).send({
          error: "Document not found",
        });
      }

      // Check if user has access
      const userRole = await getUserDocumentRole(id, currentUserId, orgId);
      if (!userRole) {
        return reply.status(403).send({
          error: "Access denied - no permission to view this document",
        });
      }

      // Get the version
      const [version] = await db
        .select()
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.id, versionId),
            eq(documentVersions.documentId, id)
          )
        )
        .limit(1);

      if (!version) {
        return reply.status(404).send({
          error: "Version not found",
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
        .where(eq(users.id, version.createdBy))
        .limit(1);

      // Return version with snapshot as base64 encoded string for frontend
      return reply.status(200).send({
        id: version.id,
        documentId: version.documentId,
        name: version.name,
        createdAt: version.createdAt,
        creator: creator
          ? {
              id: creator.id,
              displayName: creator.displayName,
              avatarUrl: creator.avatarUrl,
            }
          : null,
        snapshot: version.snapshotBlob
          ? version.snapshotBlob.toString("base64")
          : null,
      });
    }
  );

  /**
   * POST /documents/:id/versions/:versionId/restore - Restore document to a specific version
   * Returns: { success: true }
   */
  fastify.post<{ Params: { id: string; versionId: string } }>(
    "/documents/:id/versions/:versionId/restore",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id, versionId } = request.params;

      // Validate UUID formats
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid document ID format",
        });
      }

      if (!UUID_REGEX.test(versionId)) {
        return reply.status(400).send({
          error: "Invalid version ID format",
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

      // Get the document
      const [doc] = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.id, id),
            eq(documents.orgId, orgId),
            isNull(documents.deletedAt)
          )
        )
        .limit(1);

      if (!doc) {
        return reply.status(404).send({
          error: "Document not found",
        });
      }

      // Check if user has edit permission
      const userRole = await getUserDocumentRole(id, currentUserId, orgId);
      if (!userRole || userRole === "viewer") {
        return reply.status(403).send({
          error: "Access denied - need editor permission or higher to restore versions",
        });
      }

      // Get the version
      const [version] = await db
        .select()
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.id, versionId),
            eq(documentVersions.documentId, id)
          )
        )
        .limit(1);

      if (!version) {
        return reply.status(404).send({
          error: "Version not found",
        });
      }

      if (!version.snapshotBlob) {
        return reply.status(400).send({
          error: "Version has no snapshot data",
        });
      }

      // Update the document's Yjs state with the version's snapshot
      await db
        .update(documents)
        .set({
          yjsState: version.snapshotBlob,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, id));

      return reply.status(200).send({
        success: true,
        message: `Document restored to version "${version.name}"`,
      });
    }
  );
}
