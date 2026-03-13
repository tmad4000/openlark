import { FastifyInstance, FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import { randomUUID } from "crypto";
import { db } from "../db/index.js";
import { files } from "../db/schema/files.js";
import { eq, and } from "drizzle-orm";
import { uploadToS3, getPresignedDownloadUrl } from "../lib/s3.js";
import { authMiddleware } from "../middleware/auth.js";

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || "100", 10) * 1024 * 1024;

const ALLOWED_CONTENT_TYPES = [
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  // Archives
  "application/zip",
  "application/vnd.rar",
  "application/x-7z-compressed",
  // Other
  "application/json",
  "application/xml",
  "application/octet-stream",
  // Audio/Video
  "audio/mpeg",
  "audio/wav",
  "video/mp4",
  "video/webm",
];

function generateS3Key(orgId: string, filename: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const ext = filename.includes(".") ? filename.substring(filename.lastIndexOf(".")) : "";
  return `${orgId}/${year}/${month}/${randomUUID()}${ext}`;
}

export async function filesRoutes(fastify: FastifyInstance) {
  await fastify.register(multipart, {
    limits: { fileSize: MAX_FILE_SIZE },
  });

  /**
   * POST /files/upload - Upload a file
   * Stores in S3 with org_id/year/month/uuid.ext key, saves metadata to DB
   */
  fastify.post(
    "/files/upload",
    { preHandler: authMiddleware },
    async (request: FastifyRequest, reply) => {
      const user = request.user;
      const orgId = user.orgId || "default";

      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: "No file provided" });
      }

      const { filename, mimetype, file } = data;

      if (!ALLOWED_CONTENT_TYPES.includes(mimetype)) {
        return reply.status(400).send({
          error: "Content type not allowed",
          contentType: mimetype,
        });
      }

      const chunks: Buffer[] = [];
      for await (const chunk of file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      if (buffer.length > MAX_FILE_SIZE) {
        return reply.status(400).send({
          error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
        });
      }

      const s3Key = generateS3Key(orgId, filename);
      await uploadToS3(s3Key, buffer, mimetype);

      const [inserted] = await db
        .insert(files)
        .values({
          orgId,
          uploaderId: user.id,
          filename,
          s3Key,
          size: buffer.length,
          contentType: mimetype,
        })
        .returning();

      return reply.status(201).send({
        id: inserted.id,
        url: await getPresignedDownloadUrl(s3Key),
        filename: inserted.filename,
        size: inserted.size,
        contentType: inserted.contentType,
      });
    }
  );

  /**
   * GET /files/:id - Get signed download URL for a file
   */
  fastify.get<{ Params: { id: string } }>(
    "/files/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const orgId = user.orgId || "default";

      const [file] = await db
        .select()
        .from(files)
        .where(and(eq(files.id, request.params.id), eq(files.orgId, orgId)))
        .limit(1);

      if (!file) {
        return reply.status(404).send({ error: "File not found" });
      }

      const url = await getPresignedDownloadUrl(file.s3Key);

      return reply.status(200).send({
        id: file.id,
        url,
        filename: file.filename,
        size: file.size,
        contentType: file.contentType,
      });
    }
  );
}
