import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  createDocumentSchema,
  updateDocumentSchema,
  addPermissionSchema,
  updatePermissionSchema,
  createVersionSchema,
  createCommentSchema,
  updateCommentSchema,
  documentsQuerySchema,
} from "./docs.schemas.js";
import { authenticate } from "../auth/middleware.js";
import { formatZodError } from "../../utils/validation.js";
import { docsService } from "./hocuspocus.js";

export async function docsRoutes(app: FastifyInstance) {
  // Apply authentication to all routes in this plugin
  app.addHook("preHandler", authenticate);

  // ============ DOCUMENT ROUTES ============

  // List documents
  app.get("/documents", async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = documentsQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }

    const documents = await docsService.getUserDocuments(
      req.user!.id,
      req.user!.orgId,
      parseResult.data
    );

    return {
      data: {
        documents,
        nextCursor:
          documents.length === parseResult.data.limit
            ? documents[documents.length - 1]?.id
            : null,
      },
    };
  });

  // Create document
  app.post("/documents", async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = createDocumentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }

    const document = await docsService.createDocument(
      parseResult.data,
      req.user!.id,
      req.user!.orgId
    );

    return reply.status(201).send({ data: { document } });
  });

  // Get document
  app.get<{ Params: { documentId: string } }>(
    "/documents/:documentId",
    async (req, reply) => {
      const { documentId } = req.params;

      const hasPermission = await docsService.checkPermission(
        documentId,
        req.user!.id,
        "viewer"
      );

      if (!hasPermission) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You do not have permission to view this document",
        });
      }

      const document = await docsService.getDocumentById(documentId);
      if (!document) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Document not found",
        });
      }

      // Get user's permission level
      const permission = await docsService.getUserPermission(
        documentId,
        req.user!.id
      );

      return {
        data: {
          document,
          permission: permission?.role,
        },
      };
    }
  );

  // Update document
  app.patch<{ Params: { documentId: string } }>(
    "/documents/:documentId",
    async (req, reply) => {
      const { documentId } = req.params;

      const hasPermission = await docsService.checkPermission(
        documentId,
        req.user!.id,
        "editor"
      );

      if (!hasPermission) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You do not have permission to edit this document",
        });
      }

      const parseResult = updateDocumentSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send(formatZodError(parseResult.error));
      }

      const document = await docsService.updateDocument(
        documentId,
        parseResult.data,
        req.user!.id
      );

      if (!document) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Document not found",
        });
      }

      return { data: { document } };
    }
  );

  // Delete document
  app.delete<{ Params: { documentId: string } }>(
    "/documents/:documentId",
    async (req, reply) => {
      const { documentId } = req.params;

      const hasPermission = await docsService.checkPermission(
        documentId,
        req.user!.id,
        "owner"
      );

      if (!hasPermission) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "Only the owner can delete this document",
        });
      }

      const deleted = await docsService.deleteDocument(documentId);
      if (!deleted) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Document not found",
        });
      }

      return reply.status(204).send();
    }
  );

  // ============ PERMISSION ROUTES ============

  // Get document permissions
  app.get<{ Params: { documentId: string } }>(
    "/documents/:documentId/permissions",
    async (req, reply) => {
      const { documentId } = req.params;

      const hasPermission = await docsService.checkPermission(
        documentId,
        req.user!.id,
        "manager"
      );

      if (!hasPermission) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You do not have permission to view document permissions",
        });
      }

      const permissions = await docsService.getDocumentPermissions(documentId);
      return { data: { permissions } };
    }
  );

  // Add permission
  app.post<{ Params: { documentId: string } }>(
    "/documents/:documentId/permissions",
    async (req, reply) => {
      const { documentId } = req.params;

      const hasPermission = await docsService.checkPermission(
        documentId,
        req.user!.id,
        "manager"
      );

      if (!hasPermission) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You do not have permission to manage document permissions",
        });
      }

      const parseResult = addPermissionSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send(formatZodError(parseResult.error));
      }

      const permission = await docsService.addPermission(
        documentId,
        parseResult.data,
        req.user!.id
      );

      return reply.status(201).send({ data: { permission } });
    }
  );

  // Update permission
  app.patch<{ Params: { permissionId: string } }>(
    "/permissions/:permissionId",
    async (req, reply) => {
      const parseResult = updatePermissionSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send(formatZodError(parseResult.error));
      }

      // Fetch permission to get documentId for authorization check
      const existingPermission = await docsService.getPermissionById(
        req.params.permissionId
      );

      if (!existingPermission) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Permission not found",
        });
      }

      // Check if user has manager role on the document
      const hasManagerPermission = await docsService.checkPermission(
        existingPermission.documentId,
        req.user!.id,
        "manager"
      );

      if (!hasManagerPermission) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You need manager permission to modify document permissions",
        });
      }

      const permission = await docsService.updatePermission(
        req.params.permissionId,
        parseResult.data
      );

      return { data: { permission } };
    }
  );

  // Remove permission
  app.delete<{ Params: { permissionId: string } }>(
    "/permissions/:permissionId",
    async (req, reply) => {
      // Fetch permission to get documentId for authorization check
      const existingPermission = await docsService.getPermissionById(
        req.params.permissionId
      );

      if (!existingPermission) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Permission not found",
        });
      }

      // Check if user has manager role on the document
      const hasManagerPermission = await docsService.checkPermission(
        existingPermission.documentId,
        req.user!.id,
        "manager"
      );

      if (!hasManagerPermission) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You need manager permission to delete document permissions",
        });
      }

      await docsService.removePermission(req.params.permissionId);

      return reply.status(204).send();
    }
  );

  // ============ VERSION ROUTES ============

  // Get document versions
  app.get<{ Params: { documentId: string } }>(
    "/documents/:documentId/versions",
    async (req, reply) => {
      const { documentId } = req.params;

      const hasPermission = await docsService.checkPermission(
        documentId,
        req.user!.id,
        "viewer"
      );

      if (!hasPermission) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You do not have permission to view this document",
        });
      }

      const versions = await docsService.getDocumentVersions(documentId);
      return { data: { versions } };
    }
  );

  // Create version (snapshot)
  app.post<{ Params: { documentId: string } }>(
    "/documents/:documentId/versions",
    async (req, reply) => {
      const { documentId } = req.params;

      const hasPermission = await docsService.checkPermission(
        documentId,
        req.user!.id,
        "editor"
      );

      if (!hasPermission) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You do not have permission to create versions",
        });
      }

      const parseResult = createVersionSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send(formatZodError(parseResult.error));
      }

      try {
        const version = await docsService.createVersion(
          documentId,
          parseResult.data,
          req.user!.id
        );
        return reply.status(201).send({ data: { version } });
      } catch {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Document not found",
        });
      }
    }
  );

  // Restore version
  app.post<{ Params: { documentId: string; versionId: string } }>(
    "/documents/:documentId/versions/:versionId/restore",
    async (req, reply) => {
      const { documentId, versionId } = req.params;

      const hasPermission = await docsService.checkPermission(
        documentId,
        req.user!.id,
        "manager"
      );

      if (!hasPermission) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You do not have permission to restore versions",
        });
      }

      const restored = await docsService.restoreVersion(documentId, versionId);
      if (!restored) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Version not found",
        });
      }

      return { data: { success: true } };
    }
  );

  // ============ COMMENT ROUTES ============

  // Get document comments
  app.get<{ Params: { documentId: string } }>(
    "/documents/:documentId/comments",
    async (req, reply) => {
      const { documentId } = req.params;

      const hasPermission = await docsService.checkPermission(
        documentId,
        req.user!.id,
        "viewer"
      );

      if (!hasPermission) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You do not have permission to view this document",
        });
      }

      const comments = await docsService.getDocumentComments(documentId);
      return { data: { comments } };
    }
  );

  // Create comment
  app.post<{ Params: { documentId: string } }>(
    "/documents/:documentId/comments",
    async (req, reply) => {
      const { documentId } = req.params;

      const hasPermission = await docsService.checkPermission(
        documentId,
        req.user!.id,
        "viewer"
      );

      if (!hasPermission) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You do not have permission to comment on this document",
        });
      }

      const parseResult = createCommentSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send(formatZodError(parseResult.error));
      }

      const comment = await docsService.createComment(
        documentId,
        parseResult.data,
        req.user!.id
      );

      return reply.status(201).send({ data: { comment } });
    }
  );

  // Update comment
  app.patch<{ Params: { commentId: string } }>(
    "/comments/:commentId",
    async (req, reply) => {
      const parseResult = updateCommentSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send(formatZodError(parseResult.error));
      }

      const comment = await docsService.updateComment(
        req.params.commentId,
        parseResult.data,
        req.user!.id
      );

      if (!comment) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Comment not found or you cannot edit it",
        });
      }

      return { data: { comment } };
    }
  );

  // Resolve/unresolve comment
  app.post<{ Params: { commentId: string } }>(
    "/comments/:commentId/resolve",
    async (req, reply) => {
      const comment = await docsService.resolveComment(
        req.params.commentId,
        true
      );

      if (!comment) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Comment not found",
        });
      }

      return { data: { comment } };
    }
  );

  app.post<{ Params: { commentId: string } }>(
    "/comments/:commentId/unresolve",
    async (req, reply) => {
      const comment = await docsService.resolveComment(
        req.params.commentId,
        false
      );

      if (!comment) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Comment not found",
        });
      }

      return { data: { comment } };
    }
  );

  // Delete comment
  app.delete<{ Params: { commentId: string } }>(
    "/comments/:commentId",
    async (req, reply) => {
      const deleted = await docsService.deleteComment(
        req.params.commentId,
        req.user!.id
      );

      if (!deleted) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Comment not found or you cannot delete it",
        });
      }

      return reply.status(204).send();
    }
  );
}
