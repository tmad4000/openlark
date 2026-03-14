import type { FastifyInstance } from "fastify";
import { authenticate } from "../auth/middleware.js";
import { filesService } from "./files.service.js";

/**
 * File upload routes
 * Mounted under /files
 */
export async function filesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // POST /files/upload - Upload a file (multipart stub)
  // In production this would handle multipart/form-data and stream to S3
  app.post<{
    Body: { name: string; mimeType: string; size: number };
  }>("/upload", async (req, reply) => {
    const { name, mimeType, size } = req.body as {
      name: string;
      mimeType: string;
      size: number;
    };

    if (!name || !mimeType || !size) {
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: "name, mimeType, and size are required",
      });
    }

    const file = await filesService.createFile({
      orgId: req.user!.orgId,
      uploaderId: req.user!.id,
      name,
      mimeType,
      size,
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

    // In production, verify org access
    return reply.send({ data: { file } });
  });
}
