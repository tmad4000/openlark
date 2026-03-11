import { db } from "../../db/index.js";
import {
  documents,
  documentPermissions,
  documentVersions,
  documentComments,
  yjsUpdates,
  type Document,
  type DocumentPermission,
  type DocumentVersion,
  type DocumentComment,
} from "../../db/schema/index.js";
import { eq, and, isNull, desc, lt, inArray } from "drizzle-orm";
import type {
  CreateDocumentInput,
  UpdateDocumentInput,
  AddPermissionInput,
  UpdatePermissionInput,
  CreateVersionInput,
  CreateCommentInput,
  UpdateCommentInput,
  DocumentsQueryInput,
} from "./docs.schemas.js";
import * as Y from "yjs";

export class DocsService {
  // ============ DOCUMENT CRUD ============

  /**
   * Create a new document
   */
  async createDocument(
    input: CreateDocumentInput,
    userId: string,
    orgId: string
  ): Promise<Document> {
    // Initialize empty Yjs document
    const ydoc = new Y.Doc();
    const state = Y.encodeStateAsUpdate(ydoc);

    const [document] = await db
      .insert(documents)
      .values({
        title: input.title,
        type: input.type,
        templateId: input.templateId,
        ownerId: userId,
        orgId,
        yjsState: state,
        lastEditedBy: userId,
        lastEditedAt: new Date(),
      })
      .returning();

    if (!document) {
      throw new Error("Failed to create document");
    }

    // Add owner permission
    await db.insert(documentPermissions).values({
      documentId: document.id,
      principalId: userId,
      principalType: "user",
      role: "owner",
      createdBy: userId,
    });

    return document;
  }

  /**
   * Get a document by ID
   */
  async getDocumentById(documentId: string): Promise<Document | null> {
    const [document] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)));

    return document ?? null;
  }

  /**
   * Get documents for a user (owned and shared)
   */
  async getUserDocuments(
    userId: string,
    orgId: string,
    query: DocumentsQueryInput
  ): Promise<Document[]> {
    // Get document IDs that user has permission to access
    const permissionRows = await db
      .select({ documentId: documentPermissions.documentId })
      .from(documentPermissions)
      .where(
        and(
          eq(documentPermissions.principalId, userId),
          eq(documentPermissions.principalType, "user")
        )
      );

    const permittedDocIds = permissionRows.map((r) => r.documentId);

    if (permittedDocIds.length === 0) {
      return [];
    }

    // Build query for documents
    let queryBuilder = db
      .select()
      .from(documents)
      .where(
        and(
          inArray(documents.id, permittedDocIds),
          eq(documents.orgId, orgId),
          isNull(documents.deletedAt),
          query.type ? eq(documents.type, query.type) : undefined
        )
      )
      .orderBy(desc(documents.updatedAt))
      .limit(query.limit);

    // Apply cursor if provided
    if (query.cursor) {
      const [cursorDoc] = await db
        .select({ updatedAt: documents.updatedAt })
        .from(documents)
        .where(eq(documents.id, query.cursor));

      if (cursorDoc) {
        queryBuilder = db
          .select()
          .from(documents)
          .where(
            and(
              inArray(documents.id, permittedDocIds),
              eq(documents.orgId, orgId),
              isNull(documents.deletedAt),
              query.type ? eq(documents.type, query.type) : undefined,
              lt(documents.updatedAt, cursorDoc.updatedAt)
            )
          )
          .orderBy(desc(documents.updatedAt))
          .limit(query.limit);
      }
    }

    return queryBuilder;
  }

  /**
   * Update a document
   */
  async updateDocument(
    documentId: string,
    input: UpdateDocumentInput,
    userId: string
  ): Promise<Document | null> {
    const [updated] = await db
      .update(documents)
      .set({
        ...input,
        lastEditedBy: userId,
        lastEditedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)))
      .returning();

    return updated ?? null;
  }

  /**
   * Delete a document (soft delete)
   */
  async deleteDocument(documentId: string): Promise<boolean> {
    const result = await db
      .update(documents)
      .set({ deletedAt: new Date() })
      .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)))
      .returning({ id: documents.id });

    return result.length > 0;
  }

  // ============ PERMISSION OPERATIONS ============

  /**
   * Check if user has at least the specified role on a document
   */
  async checkPermission(
    documentId: string,
    userId: string,
    requiredRole: "viewer" | "editor" | "manager" | "owner"
  ): Promise<boolean> {
    const [permission] = await db
      .select()
      .from(documentPermissions)
      .where(
        and(
          eq(documentPermissions.documentId, documentId),
          eq(documentPermissions.principalId, userId),
          eq(documentPermissions.principalType, "user")
        )
      );

    if (!permission) return false;

    const roleHierarchy = ["viewer", "editor", "manager", "owner"];
    const userRoleIndex = roleHierarchy.indexOf(permission.role);
    const requiredRoleIndex = roleHierarchy.indexOf(requiredRole);

    return userRoleIndex >= requiredRoleIndex;
  }

  /**
   * Get user's permission on a document
   */
  async getUserPermission(
    documentId: string,
    userId: string
  ): Promise<DocumentPermission | null> {
    const [permission] = await db
      .select()
      .from(documentPermissions)
      .where(
        and(
          eq(documentPermissions.documentId, documentId),
          eq(documentPermissions.principalId, userId),
          eq(documentPermissions.principalType, "user")
        )
      );

    return permission ?? null;
  }

  /**
   * Get all permissions for a document
   */
  async getDocumentPermissions(
    documentId: string
  ): Promise<DocumentPermission[]> {
    return db
      .select()
      .from(documentPermissions)
      .where(eq(documentPermissions.documentId, documentId));
  }

  /**
   * Add permission to a document
   */
  async addPermission(
    documentId: string,
    input: AddPermissionInput,
    createdBy: string
  ): Promise<DocumentPermission> {
    const [permission] = await db
      .insert(documentPermissions)
      .values({
        documentId,
        principalId: input.principalId,
        principalType: input.principalType,
        role: input.role,
        createdBy,
      })
      .onConflictDoUpdate({
        target: [
          documentPermissions.documentId,
          documentPermissions.principalId,
          documentPermissions.principalType,
        ],
        set: {
          role: input.role,
        },
      })
      .returning();

    if (!permission) {
      throw new Error("Failed to add permission");
    }

    return permission;
  }

  /**
   * Get a permission by ID
   */
  async getPermissionById(permissionId: string): Promise<DocumentPermission | null> {
    const [permission] = await db
      .select()
      .from(documentPermissions)
      .where(eq(documentPermissions.id, permissionId));

    return permission ?? null;
  }

  /**
   * Update a permission
   */
  async updatePermission(
    permissionId: string,
    input: UpdatePermissionInput
  ): Promise<DocumentPermission | null> {
    const [updated] = await db
      .update(documentPermissions)
      .set({ role: input.role })
      .where(eq(documentPermissions.id, permissionId))
      .returning();

    return updated ?? null;
  }

  /**
   * Remove a permission
   */
  async removePermission(permissionId: string): Promise<boolean> {
    const result = await db
      .delete(documentPermissions)
      .where(eq(documentPermissions.id, permissionId))
      .returning({ id: documentPermissions.id });

    return result.length > 0;
  }

  // ============ VERSION OPERATIONS ============

  /**
   * Create a document version (snapshot)
   */
  async createVersion(
    documentId: string,
    input: CreateVersionInput,
    userId: string
  ): Promise<DocumentVersion> {
    // Get current document state
    const document = await this.getDocumentById(documentId);
    if (!document || !document.yjsState) {
      throw new Error("Document not found or has no state");
    }

    const [version] = await db
      .insert(documentVersions)
      .values({
        documentId,
        name: input.name,
        snapshotBlob: document.yjsState,
        createdBy: userId,
      })
      .returning();

    if (!version) {
      throw new Error("Failed to create version");
    }

    return version;
  }

  /**
   * Get versions for a document
   */
  async getDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
    return db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, documentId))
      .orderBy(desc(documentVersions.createdAt));
  }

  /**
   * Get a specific version
   */
  async getVersionById(versionId: string): Promise<DocumentVersion | null> {
    const [version] = await db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.id, versionId));

    return version ?? null;
  }

  /**
   * Restore a document to a version
   */
  async restoreVersion(documentId: string, versionId: string): Promise<boolean> {
    const version = await this.getVersionById(versionId);
    if (!version || version.documentId !== documentId) {
      return false;
    }

    const result = await db
      .update(documents)
      .set({
        yjsState: version.snapshotBlob,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId))
      .returning({ id: documents.id });

    return result.length > 0;
  }

  // ============ COMMENT OPERATIONS ============

  /**
   * Create a comment
   */
  async createComment(
    documentId: string,
    input: CreateCommentInput,
    userId: string
  ): Promise<DocumentComment> {
    const [comment] = await db
      .insert(documentComments)
      .values({
        documentId,
        userId,
        content: input.content,
        blockId: input.blockId,
        anchorJson: input.anchorJson,
        threadId: input.threadId,
      })
      .returning();

    if (!comment) {
      throw new Error("Failed to create comment");
    }

    return comment;
  }

  /**
   * Get comments for a document
   */
  async getDocumentComments(documentId: string): Promise<DocumentComment[]> {
    return db
      .select()
      .from(documentComments)
      .where(
        and(
          eq(documentComments.documentId, documentId),
          isNull(documentComments.deletedAt)
        )
      )
      .orderBy(desc(documentComments.createdAt));
  }

  /**
   * Update a comment
   */
  async updateComment(
    commentId: string,
    input: UpdateCommentInput,
    userId: string
  ): Promise<DocumentComment | null> {
    const [updated] = await db
      .update(documentComments)
      .set({
        content: input.content,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(documentComments.id, commentId),
          eq(documentComments.userId, userId),
          isNull(documentComments.deletedAt)
        )
      )
      .returning();

    return updated ?? null;
  }

  /**
   * Resolve/unresolve a comment
   */
  async resolveComment(
    commentId: string,
    resolved: boolean
  ): Promise<DocumentComment | null> {
    const [updated] = await db
      .update(documentComments)
      .set({
        resolved: resolved ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(documentComments.id, commentId),
          isNull(documentComments.deletedAt)
        )
      )
      .returning();

    return updated ?? null;
  }

  /**
   * Delete a comment (soft delete)
   */
  async deleteComment(commentId: string, userId: string): Promise<boolean> {
    const result = await db
      .update(documentComments)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(documentComments.id, commentId),
          eq(documentComments.userId, userId),
          isNull(documentComments.deletedAt)
        )
      )
      .returning({ id: documentComments.id });

    return result.length > 0;
  }

  // ============ YJS PERSISTENCE (for Hocuspocus) ============

  /**
   * Load document state for Hocuspocus
   */
  async loadYjsState(documentId: string): Promise<Uint8Array | null> {
    const document = await this.getDocumentById(documentId);
    if (!document) return null;

    // If we have a stored state, return it
    if (document.yjsState) {
      return document.yjsState;
    }

    // Otherwise return empty state
    return null;
  }

  /**
   * Store document state from Hocuspocus
   */
  async storeYjsState(
    documentId: string,
    state: Uint8Array,
    userId?: string
  ): Promise<void> {
    await db
      .update(documents)
      .set({
        yjsState: state,
        updatedAt: new Date(),
        lastEditedAt: new Date(),
        ...(userId ? { lastEditedBy: userId } : {}),
      })
      .where(eq(documents.id, documentId));
  }

  /**
   * Store a Yjs update (incremental)
   */
  async storeYjsUpdate(documentId: string, update: Uint8Array): Promise<void> {
    await db.insert(yjsUpdates).values({
      documentId,
      updateData: update,
    });
  }

  /**
   * Get all Yjs updates for a document (for replay/merge)
   */
  async getYjsUpdates(documentId: string): Promise<Uint8Array[]> {
    const updates = await db
      .select({ updateData: yjsUpdates.updateData })
      .from(yjsUpdates)
      .where(eq(yjsUpdates.documentId, documentId))
      .orderBy(yjsUpdates.createdAt);

    return updates.map((u) => u.updateData);
  }

  /**
   * Clear Yjs updates after compaction
   */
  async clearYjsUpdates(documentId: string): Promise<void> {
    await db.delete(yjsUpdates).where(eq(yjsUpdates.documentId, documentId));
  }
}
