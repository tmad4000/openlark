import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { authenticate } from "../auth/middleware.js";
import { filesService } from "./files.service.js";

/**
 * File upload routes
 * Mounted under /files
 */
export async function filesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // Register multipart support with 50 MB limit
  await app.register(multipart, {
    limits: {
      fileSize: filesService.getMaxFileSize(),
      files: 1,
    },
  });

  // POST /files/upload - Upload a file via multipart/form-data
  app.post("/upload", async (req, reply) => {
    const data = await req.file();

    if (!data) {
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: "No file provided. Send a multipart/form-data request with a file field.",
      });
    }

    const mimeType = data.mimetype;
    if (!filesService.validateMimeType(mimeType)) {
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: `Unsupported file type: ${mimeType}`,
      });
    }

    const buffer = await data.toBuffer();
    const size = buffer.length;

    if (!filesService.validateFileSize(size)) {
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: `File too large. Maximum size is ${filesService.getMaxFileSize()} bytes.`,
      });
    }

    const file = await filesService.createFile({
      orgId: req.user!.orgId,
      uploaderId: req.user!.id,
      name: data.filename,
      mimeType,
      size,
      buffer,
    });

    return reply.status(201).send({ data: { file } });
  });

  // GET /files/:id - Get file metadata
  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const file = await filesService.getFile(req.params.id);

    if (!file) {
      return reply.status(404).send({
        code: "NOT_FOUND",
        message: "File not found",
      });
    }

    if (file.orgId !== req.user!.orgId) {
      return reply.status(403).send({
        code: "FORBIDDEN",
        message: "Access denied",
      });
    }

    return reply.send({ data: { file } });
  });

  // GET /files/:id/download - Get presigned download URL
  app.get<{ Params: { id: string } }>("/:id/download", async (req, reply) => {
    const file = await filesService.getFile(req.params.id);

    if (!file) {
      return reply.status(404).send({
        code: "NOT_FOUND",
        message: "File not found",
      });
    }

    if (file.orgId !== req.user!.orgId) {
      return reply.status(403).send({
        code: "FORBIDDEN",
        message: "Access denied",
      });
    }

    const url = await filesService.getDownloadUrl(file.id);
    return reply.send({ data: { url } });
  });

  // DELETE /files/:id - Delete a file
  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const deleted = await filesService.deleteFile(
      req.params.id,
      req.user!.orgId,
    );

    if (!deleted) {
      return reply.status(404).send({
        code: "NOT_FOUND",
        message: "File not found",
      });
    }

    return reply.status(204).send();
  });
}
