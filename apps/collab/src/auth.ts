import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { db } from "./db.js";
import { eq, and } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  text,
  pgEnum,
  index,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Minimal schema definitions for auth validation and document permissions
// We define them here to avoid depending on the API package

const bytea = customType<{
  data: Uint8Array;
  driverData: Buffer;
}>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Uint8Array): Buffer {
    return Buffer.from(value);
  },
  fromDriver(value: Buffer): Uint8Array {
    return new Uint8Array(value);
  },
});

// Sessions table (minimal for validation)
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// Document permissions table
const documentPermissionRoleEnum = pgEnum("document_permission_role", [
  "viewer",
  "editor",
  "manager",
  "owner",
]);

const principalTypeEnum = pgEnum("principal_type", [
  "user",
  "department",
  "org",
]);

export const documentPermissions = pgTable(
  "document_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id").notNull(),
    principalId: uuid("principal_id").notNull(),
    principalType: principalTypeEnum("principal_type").notNull(),
    role: documentPermissionRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid("created_by").notNull(),
  },
  (table) => [
    index("document_permissions_document_id_idx").on(table.documentId),
    uniqueIndex("document_permissions_unique_idx")
      .on(table.documentId, table.principalId, table.principalType)
      .where(sql`true`),
  ]
);

// Documents table (minimal for Yjs state)
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  yjsState: bytea("yjs_state"),
  lastEditedBy: uuid("last_edited_by"),
  lastEditedAt: timestamp("last_edited_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export interface TokenPayload {
  sub: string;
  orgId: string;
  email: string;
  role: string;
  sessionId: string;
  iat: number;
  exp: number;
}

/**
 * Verify JWT token and validate session
 */
export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as TokenPayload;

    // Validate session still exists and is not revoked
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, payload.sessionId));

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

const ROLE_HIERARCHY = ["viewer", "editor", "manager", "owner"];

/**
 * Check if user has at least the specified role on a document
 */
export async function checkPermission(
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

  const userRoleIndex = ROLE_HIERARCHY.indexOf(permission.role);
  const requiredRoleIndex = ROLE_HIERARCHY.indexOf(requiredRole);

  return userRoleIndex >= requiredRoleIndex;
}
