import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { files } from "../../db/schema/index.js";
import { randomUUID } from "crypto";

class FilesService {
  /**
   * Create a file record after upload.
   * In production, `storageKey` would be the S3 key returned after uploading the actual bytes.
   */
  async createFile(data: {
    orgId: string;
    uploaderId: string;
    name: string;
    mimeType: string;
    size: number;
  }) {
    const storageKey = `uploads/${data.orgId}/${randomUUID()}/${data.name}`;

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
}

export const filesService = new FilesService();
