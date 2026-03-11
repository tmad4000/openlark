import { FastifyInstance, FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import {
  uploadToS3,
  generateFileKey,
  getMimeType,
  getPresignedUploadUrl,
} from "../lib/s3.js";
import { authMiddleware } from "../middleware/auth.js";

interface PresignedUrlBody {
  filename: string;
  contentType?: string;
  folder?: "documents" | "avatars" | "attachments";
}

// Allowed file types for uploads
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];

const ALLOWED_FILE_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/json",
  "application/xml",
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function uploadsRoutes(fastify: FastifyInstance) {
  // Register multipart support
  await fastify.register(multipart, {
    limits: {
      fileSize: MAX_FILE_SIZE,
    },
  });

  /**
   * POST /uploads/file - Direct file upload
   * Uploads a file directly to S3 and returns the URL
   */
  fastify.post(
    "/uploads/file",
    { preHandler: authMiddleware },
    async (request: FastifyRequest, reply) => {
      const user = request.user;
      const organizationId = user?.orgId || "default";

      try {
        const data = await request.file();

        if (!data) {
          return reply.status(400).send({ error: "No file provided" });
        }

        const { filename, mimetype, file } = data;

        // Validate file type
        if (!ALLOWED_FILE_TYPES.includes(mimetype)) {
          return reply.status(400).send({
            error: "File type not allowed",
            allowed: ALLOWED_FILE_TYPES,
          });
        }

        // Read the file buffer
        const chunks: Buffer[] = [];
        for await (const chunk of file) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        // Determine folder based on file type
        const folder: "documents" | "attachments" = ALLOWED_IMAGE_TYPES.includes(
          mimetype
        )
          ? "documents"
          : "attachments";

        // Generate unique key and upload
        const key = generateFileKey(organizationId, folder, filename);
        const url = await uploadToS3(key, buffer, mimetype);

        return reply.status(200).send({
          url,
          key,
          filename,
          size: buffer.length,
          contentType: mimetype,
        });
      } catch (error) {
        console.error("File upload error:", error);
        return reply.status(500).send({ error: "Upload failed" });
      }
    }
  );

  /**
   * POST /uploads/presigned - Get a presigned URL for direct upload
   * Returns a presigned URL that the client can use to upload directly to S3
   */
  fastify.post<{ Body: PresignedUrlBody }>(
    "/uploads/presigned",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const organizationId = user?.orgId || "default";
      const { filename, contentType, folder = "documents" } = request.body;

      if (!filename) {
        return reply.status(400).send({ error: "Filename is required" });
      }

      // Determine content type
      const mimeType = contentType || getMimeType(filename);

      // Validate file type
      if (!ALLOWED_FILE_TYPES.includes(mimeType)) {
        return reply.status(400).send({
          error: "File type not allowed",
          allowed: ALLOWED_FILE_TYPES,
        });
      }

      // Generate unique key
      const key = generateFileKey(organizationId, folder, filename);

      try {
        const uploadUrl = await getPresignedUploadUrl(key, mimeType);

        // Return both the upload URL and the final URL where the file will be accessible
        const publicUrl = process.env.S3_PUBLIC_URL
          ? `${process.env.S3_PUBLIC_URL}/${key}`
          : `https://${process.env.S3_BUCKET || "openlark-uploads"}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${key}`;

        return reply.status(200).send({
          uploadUrl,
          publicUrl,
          key,
          contentType: mimeType,
        });
      } catch (error) {
        console.error("Presigned URL generation error:", error);
        return reply.status(500).send({ error: "Failed to generate upload URL" });
      }
    }
  );

  /**
   * POST /uploads/image - Dedicated image upload endpoint
   * Validates that only images are uploaded
   */
  fastify.post(
    "/uploads/image",
    { preHandler: authMiddleware },
    async (request: FastifyRequest, reply) => {
      const user = request.user;
      const organizationId = user?.orgId || "default";

      try {
        const data = await request.file();

        if (!data) {
          return reply.status(400).send({ error: "No file provided" });
        }

        const { filename, mimetype, file } = data;

        // Only allow images
        if (!ALLOWED_IMAGE_TYPES.includes(mimetype)) {
          return reply.status(400).send({
            error: "Only images are allowed",
            allowed: ALLOWED_IMAGE_TYPES,
          });
        }

        // Read the file buffer
        const chunks: Buffer[] = [];
        for await (const chunk of file) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        // Upload to documents folder
        const key = generateFileKey(organizationId, "documents", filename);
        const url = await uploadToS3(key, buffer, mimetype);

        return reply.status(200).send({
          url,
          key,
          filename,
          size: buffer.length,
          contentType: mimetype,
        });
      } catch (error) {
        console.error("Image upload error:", error);
        return reply.status(500).send({ error: "Upload failed" });
      }
    }
  );
}
