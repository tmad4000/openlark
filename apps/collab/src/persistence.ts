import { db } from "./db.js";
import { documents } from "./auth.js";
import { eq, isNull, and } from "drizzle-orm";

/**
 * Load Yjs document state from PostgreSQL
 */
export async function loadYjsState(
  documentId: string
): Promise<Uint8Array | null> {
  const [doc] = await db
    .select({ yjsState: documents.yjsState })
    .from(documents)
    .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)));

  return doc?.yjsState ?? null;
}

/**
 * Store Yjs document state to PostgreSQL
 */
export async function storeYjsState(
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
