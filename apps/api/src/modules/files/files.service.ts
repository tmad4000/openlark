import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { files } from "../../db/schema/index.js";
import { randomUUID } from "crypto";
import { uploadToS3, getPresignedDownloadUrl, deleteFromS3 } from "./s3.js";

// 50 MB max file size
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "application/zip",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "video/mp4",
  "video/webm",
];

class FilesService {
  /**
   * Upload a file to S3 and create a metadata record.
   */
  async createFile(data: {
    orgId: string;
    uploaderId: string;
    name: string;
    mimeType: string;
    size: number;
    buffer: Buffer;
  }) {
    const storageKey = `uploads/${data.orgId}/${randomUUID()}/${data.name}`;

    await uploadToS3(storageKey, data.buffer, data.mimeType);

    const [file] = await db
      .insert(files)
      .values({
        orgId: data.orgId,
        uploaderId: data.uploaderId,
        name: data.name,
        mimeType: data.mimeType,
        size: data.size,
        storageKey,
      })
      .returning();
    return file;
  }

  async getFile(fileId: string) {
    const [file] = await db
      .select()
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1);
    return file || null;
  }

  /**
   * Get a presigned download URL for a file.
   */
  async getDownloadUrl(fileId: string): Promise<string | null> {
    const file = await this.getFile(fileId);
    if (!file) return null;
    return getPresignedDownloadUrl(file.storageKey);
  }

  /**
   * Delete a file from S3 and the database.
   */
  async deleteFile(fileId: string, orgId: string): Promise<boolean> {
    const file = await this.getFile(fileId);
    if (!file || file.orgId !== orgId) return false;

    await deleteFromS3(file.storageKey);
    await db.delete(files).where(eq(files.id, fileId));
    return true;
  }

  validateMimeType(mimeType: string): boolean {
    return ALLOWED_MIME_TYPES.includes(mimeType);
  }

  validateFileSize(size: number): boolean {
    return size > 0 && size <= MAX_FILE_SIZE;
  }

  getMaxFileSize(): number {
    return MAX_FILE_SIZE;
  }
}

export const filesService = new FilesService();
