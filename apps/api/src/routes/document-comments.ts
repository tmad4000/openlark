import { FastifyInstance } from "fastify";
import { db } from "../db";
import {
  documentComments,
  documents,
  documentPermissions,
  users,
  departmentMembers,
} from "../db/schema";
import { eq, and, or, inArray, desc, isNull, asc, sql } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";

// UUID validation regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Valid permission roles
type PermissionRole = "viewer" | "editor" | "manager" | "owner";

/**
 * Check if user has permission to access a document
 * Returns the highest role the user has
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

interface CreateCommentBody {
  content: string;
  blockId?: string;
  threadId?: string;
}

interface UpdateCommentBody {
  content?: string;
  resolved?: boolean;
}

interface GetCommentsQuery {
  resolved?: string;
  limit?: number;
  offset?: number;
}

export async function documentCommentsRoutes(fastify: FastifyInstance) {
  /**
   * GET /documents/:documentId/comments - Get all comments for a document
   * Query: { resolved?: 'true'|'false', limit?: number, offset?: number }
   * Returns: Paginated list of comments with author info and replies
   */
  fastify.get<{ Params: { documentId: string }; Querystring: GetCommentsQuery }>(
    "/documents/:documentId/comments",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { documentId } = request.params;
      const { resolved, limit = 50, offset = 0 } = request.query;

      // Validate UUID format
      if (!UUID_REGEX.test(documentId)) {
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
            eq(documents.id, documentId),
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
      const userRole = await getUserDocumentRole(documentId, currentUserId, orgId);
      if (!userRole) {
        return reply.status(403).send({
          error: "Access denied - no permission to view this document",
        });
      }

      // Validate pagination
      const parsedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
      const parsedOffset = Math.max(Number(offset) || 0, 0);

      // Build where conditions for top-level comments (no threadId)
      const whereConditions = and(
        eq(documentComments.documentId, documentId),
        isNull(documentComments.threadId), // Only top-level comments
        resolved === "true"
          ? eq(documentComments.resolved, true)
          : resolved === "false"
          ? eq(documentComments.resolved, false)
          : undefined
      );

      // Get total count
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(documentComments)
        .where(whereConditions);

      const total = countResult?.count ?? 0;

      // Get top-level comments with author info
      const commentsData = await db
        .select({
          id: documentComments.id,
          documentId: documentComments.documentId,
          blockId: documentComments.blockId,
          userId: documentComments.userId,
          content: documentComments.content,
          resolved: documentComments.resolved,
          threadId: documentComments.threadId,
          createdAt: documentComments.createdAt,
          updatedAt: documentComments.updatedAt,
          authorName: users.displayName,
          authorAvatarUrl: users.avatarUrl,
          authorEmail: users.email,
        })
        .from(documentComments)
        .innerJoin(users, eq(documentComments.userId, users.id))
        .where(whereConditions)
        .orderBy(desc(documentComments.createdAt))
        .limit(parsedLimit)
        .offset(parsedOffset);

      // Get reply counts for each comment
      const commentIds = commentsData.map((c) => c.id);

      let replyCounts: Record<string, number> = {};
      if (commentIds.length > 0) {
        const replyCountsData = await db
          .select({
            threadId: documentComments.threadId,
            count: sql<number>`count(*)::int`,
          })
          .from(documentComments)
          .where(inArray(documentComments.threadId, commentIds))
          .groupBy(documentComments.threadId);

        replyCounts = replyCountsData.reduce((acc, r) => {
          if (r.threadId) {
            acc[r.threadId] = r.count;
          }
          return acc;
        }, {} as Record<string, number>);
      }

      const comments = commentsData.map((comment) => ({
        id: comment.id,
        documentId: comment.documentId,
        blockId: comment.blockId,
        content: comment.content,
        resolved: comment.resolved,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        author: {
          id: comment.userId,
          displayName: comment.authorName,
          avatarUrl: comment.authorAvatarUrl,
          email: comment.authorEmail,
        },
        replyCount: replyCounts[comment.id] || 0,
      }));

      return reply.status(200).send({
        comments,
        pagination: {
          total,
          limit: parsedLimit,
          offset: parsedOffset,
          hasMore: parsedOffset + comments.length < total,
        },
      });
    }
  );

  /**
   * GET /documents/:documentId/comments/:commentId - Get a specific comment with its replies
   * Returns: Comment with author info and all replies
   */
  fastify.get<{ Params: { documentId: string; commentId: string } }>(
    "/documents/:documentId/comments/:commentId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { documentId, commentId } = request.params;

      // Validate UUID formats
      if (!UUID_REGEX.test(documentId) || !UUID_REGEX.test(commentId)) {
        return reply.status(400).send({
          error: "Invalid ID format",
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

      // Check if user has access to the document
      const userRole = await getUserDocumentRole(documentId, currentUserId, orgId);
      if (!userRole) {
        return reply.status(403).send({
          error: "Access denied - no permission to view this document",
        });
      }

      // Get the comment with author info
      const [commentData] = await db
        .select({
          id: documentComments.id,
          documentId: documentComments.documentId,
          blockId: documentComments.blockId,
          userId: documentComments.userId,
          content: documentComments.content,
          resolved: documentComments.resolved,
          threadId: documentComments.threadId,
          createdAt: documentComments.createdAt,
          updatedAt: documentComments.updatedAt,
          authorName: users.displayName,
          authorAvatarUrl: users.avatarUrl,
          authorEmail: users.email,
        })
        .from(documentComments)
        .innerJoin(users, eq(documentComments.userId, users.id))
        .where(
          and(
            eq(documentComments.id, commentId),
            eq(documentComments.documentId, documentId)
          )
        )
        .limit(1);

      if (!commentData) {
        return reply.status(404).send({
          error: "Comment not found",
        });
      }

      // Get replies for this comment
      const repliesData = await db
        .select({
          id: documentComments.id,
          documentId: documentComments.documentId,
          blockId: documentComments.blockId,
          userId: documentComments.userId,
          content: documentComments.content,
          resolved: documentComments.resolved,
          threadId: documentComments.threadId,
          createdAt: documentComments.createdAt,
          updatedAt: documentComments.updatedAt,
          authorName: users.displayName,
          authorAvatarUrl: users.avatarUrl,
          authorEmail: users.email,
        })
        .from(documentComments)
        .innerJoin(users, eq(documentComments.userId, users.id))
        .where(eq(documentComments.threadId, commentId))
        .orderBy(asc(documentComments.createdAt));

      const replies = repliesData.map((reply) => ({
        id: reply.id,
        content: reply.content,
        createdAt: reply.createdAt,
        updatedAt: reply.updatedAt,
        author: {
          id: reply.userId,
          displayName: reply.authorName,
          avatarUrl: reply.authorAvatarUrl,
          email: reply.authorEmail,
        },
      }));

      return reply.status(200).send({
        comment: {
          id: commentData.id,
          documentId: commentData.documentId,
          blockId: commentData.blockId,
          content: commentData.content,
          resolved: commentData.resolved,
          createdAt: commentData.createdAt,
          updatedAt: commentData.updatedAt,
          author: {
            id: commentData.userId,
            displayName: commentData.authorName,
            avatarUrl: commentData.authorAvatarUrl,
            email: commentData.authorEmail,
          },
          replies,
        },
      });
    }
  );

  /**
   * POST /documents/:documentId/comments - Create a new comment
   * Body: { content: string, blockId?: string, threadId?: string }
   * Returns: Created comment with author info
   */
  fastify.post<{ Params: { documentId: string }; Body: CreateCommentBody }>(
    "/documents/:documentId/comments",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { documentId } = request.params;
      const { content, blockId, threadId } = request.body;

      // Validate UUID format
      if (!UUID_REGEX.test(documentId)) {
        return reply.status(400).send({
          error: "Invalid document ID format",
        });
      }

      // Validate content
      if (!content || typeof content !== "string" || content.trim().length === 0) {
        return reply.status(400).send({
          error: "content is required and must be a non-empty string",
        });
      }

      if (content.length > 10000) {
        return reply.status(400).send({
          error: "content must be at most 10000 characters",
        });
      }

      // Validate threadId if provided
      if (threadId && !UUID_REGEX.test(threadId)) {
        return reply.status(400).send({
          error: "Invalid threadId format",
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
            eq(documents.id, documentId),
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

      // Check if user has access (at least viewer can comment)
      const userRole = await getUserDocumentRole(documentId, currentUserId, orgId);
      if (!userRole) {
        return reply.status(403).send({
          error: "Access denied - no permission to view this document",
        });
      }

      // If threadId is provided, verify the parent comment exists
      if (threadId) {
        const [parentComment] = await db
          .select({ id: documentComments.id })
          .from(documentComments)
          .where(
            and(
              eq(documentComments.id, threadId),
              eq(documentComments.documentId, documentId)
            )
          )
          .limit(1);

        if (!parentComment) {
          return reply.status(404).send({
            error: "Parent comment not found",
          });
        }
      }

      // Create the comment
      const [newComment] = await db
        .insert(documentComments)
        .values({
          documentId,
          blockId: blockId || null,
          userId: currentUserId,
          content: content.trim(),
          threadId: threadId || null,
        })
        .returning();

      // Get user info for response
      const [userData] = await db
        .select({
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          email: users.email,
        })
        .from(users)
        .where(eq(users.id, currentUserId))
        .limit(1);

      return reply.status(201).send({
        comment: {
          id: newComment.id,
          documentId: newComment.documentId,
          blockId: newComment.blockId,
          content: newComment.content,
          resolved: newComment.resolved,
          threadId: newComment.threadId,
          createdAt: newComment.createdAt,
          updatedAt: newComment.updatedAt,
          author: {
            id: currentUserId,
            displayName: userData?.displayName,
            avatarUrl: userData?.avatarUrl,
            email: userData?.email,
          },
        },
      });
    }
  );

  /**
   * PATCH /documents/:documentId/comments/:commentId - Update a comment
   * Body: { content?: string, resolved?: boolean }
   * Returns: Updated comment
   */
  fastify.patch<{
    Params: { documentId: string; commentId: string };
    Body: UpdateCommentBody;
  }>(
    "/documents/:documentId/comments/:commentId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { documentId, commentId } = request.params;
      const { content, resolved } = request.body;

      // Validate UUID formats
      if (!UUID_REGEX.test(documentId) || !UUID_REGEX.test(commentId)) {
        return reply.status(400).send({
          error: "Invalid ID format",
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

      // Check if user has access to the document
      const userRole = await getUserDocumentRole(documentId, currentUserId, orgId);
      if (!userRole) {
        return reply.status(403).send({
          error: "Access denied - no permission to view this document",
        });
      }

      // Get the comment
      const [comment] = await db
        .select()
        .from(documentComments)
        .where(
          and(
            eq(documentComments.id, commentId),
            eq(documentComments.documentId, documentId)
          )
        )
        .limit(1);

      if (!comment) {
        return reply.status(404).send({
          error: "Comment not found",
        });
      }

      // Build update object
      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      // Only the comment author can update content
      if (content !== undefined) {
        if (comment.userId !== currentUserId) {
          return reply.status(403).send({
            error: "Only the comment author can edit the content",
          });
        }

        if (typeof content !== "string" || content.trim().length === 0) {
          return reply.status(400).send({
            error: "content must be a non-empty string",
          });
        }

        if (content.length > 10000) {
          return reply.status(400).send({
            error: "content must be at most 10000 characters",
          });
        }

        updates.content = content.trim();
      }

      // Anyone with document access can resolve/reopen comments
      if (resolved !== undefined) {
        if (typeof resolved !== "boolean") {
          return reply.status(400).send({
            error: "resolved must be a boolean",
          });
        }
        updates.resolved = resolved;
      }

      // If no updates provided, return current comment
      if (Object.keys(updates).length === 1) {
        return reply.status(200).send({
          comment: {
            id: comment.id,
            documentId: comment.documentId,
            blockId: comment.blockId,
            content: comment.content,
            resolved: comment.resolved,
            threadId: comment.threadId,
            createdAt: comment.createdAt,
            updatedAt: comment.updatedAt,
          },
        });
      }

      // Update the comment
      const [updatedComment] = await db
        .update(documentComments)
        .set(updates)
        .where(eq(documentComments.id, commentId))
        .returning();

      return reply.status(200).send({
        comment: {
          id: updatedComment.id,
          documentId: updatedComment.documentId,
          blockId: updatedComment.blockId,
          content: updatedComment.content,
          resolved: updatedComment.resolved,
          threadId: updatedComment.threadId,
          createdAt: updatedComment.createdAt,
          updatedAt: updatedComment.updatedAt,
        },
      });
    }
  );

  /**
   * DELETE /documents/:documentId/comments/:commentId - Delete a comment
   * Returns: { success: true }
   */
  fastify.delete<{ Params: { documentId: string; commentId: string } }>(
    "/documents/:documentId/comments/:commentId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { documentId, commentId } = request.params;

      // Validate UUID formats
      if (!UUID_REGEX.test(documentId) || !UUID_REGEX.test(commentId)) {
        return reply.status(400).send({
          error: "Invalid ID format",
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
            eq(documents.id, documentId),
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

      // Check user's role
      const userRole = await getUserDocumentRole(documentId, currentUserId, orgId);
      if (!userRole) {
        return reply.status(403).send({
          error: "Access denied - no permission to view this document",
        });
      }

      // Get the comment
      const [comment] = await db
        .select()
        .from(documentComments)
        .where(
          and(
            eq(documentComments.id, commentId),
            eq(documentComments.documentId, documentId)
          )
        )
        .limit(1);

      if (!comment) {
        return reply.status(404).send({
          error: "Comment not found",
        });
      }

      // Only the comment author or document owner/manager can delete
      const canDelete =
        comment.userId === currentUserId ||
        userRole === "owner" ||
        userRole === "manager";

      if (!canDelete) {
        return reply.status(403).send({
          error: "Only the comment author or document managers can delete comments",
        });
      }

      // Delete all replies first (cascade delete should handle this but being explicit)
      await db
        .delete(documentComments)
        .where(eq(documentComments.threadId, commentId));

      // Delete the comment
      await db
        .delete(documentComments)
        .where(eq(documentComments.id, commentId));

      return reply.status(200).send({ success: true });
    }
  );
}
