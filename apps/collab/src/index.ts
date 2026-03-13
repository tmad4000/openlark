import { Server } from "@hocuspocus/server";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import crypto from "crypto";
import http from "http";
import { eq, and, gt, or } from "drizzle-orm";
import * as Y from "yjs";

// Database connection
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

const db = drizzle(client);

// Import schema types (we'll inline the necessary table definitions since we can't import from api)
import { pgTable, uuid, varchar, timestamp, pgEnum, customType } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
});

// Sessions table (inline definition for auth)
const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// Users table (minimal definition for auth)
const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  orgId: uuid("org_id"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// Documents table (minimal definition for persistence)
const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  yjsDocId: varchar("yjs_doc_id", { length: 255 }).unique(),
  yjsState: bytea("yjs_state"),
  orgId: uuid("org_id").notNull(),
});

// Document permission enums
const documentPrincipalTypeEnum = pgEnum("document_principal_type", ["user", "department", "org"]);
const documentRoleEnum = pgEnum("document_role", ["viewer", "editor", "manager", "owner"]);

// Document permissions table
const documentPermissions = pgTable("document_permissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id").notNull(),
  principalId: uuid("principal_id").notNull(),
  principalType: documentPrincipalTypeEnum("principal_type").notNull(),
  role: documentRoleEnum("role").notNull(),
});

// Department members table (for checking department-based permissions)
const departmentMembers = pgTable("department_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  departmentId: uuid("department_id").notNull(),
  userId: uuid("user_id").notNull(),
});

interface AuthenticatedUser {
  id: string;
  displayName: string;
  email: string;
  orgId: string | null;
}

interface DocumentInfo {
  id: string;
  yjsDocId: string | null;
  yjsState: Buffer | null;
  orgId: string;
}

/**
 * Validate session token and return user info
 */
async function validateSession(token: string): Promise<AuthenticatedUser | null> {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        gt(sessions.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!session) {
    return null;
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user || user.deletedAt) {
    return null;
  }

  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    orgId: user.orgId,
  };
}

/**
 * Check if user has at least viewer permission on the document
 */
async function checkDocumentPermission(
  userId: string,
  userOrgId: string | null,
  documentId: string
): Promise<{ canRead: boolean; canWrite: boolean }> {
  // Get user's department memberships
  const userDepartments = await db
    .select({ departmentId: departmentMembers.departmentId })
    .from(departmentMembers)
    .where(eq(departmentMembers.userId, userId));

  const departmentIds = userDepartments.map((d) => d.departmentId);

  // Check all permissions for this document
  const permissions = await db
    .select()
    .from(documentPermissions)
    .where(eq(documentPermissions.documentId, documentId));

  let canRead = false;
  let canWrite = false;

  for (const perm of permissions) {
    // Check if this permission applies to the user
    let applies = false;

    if (perm.principalType === "user" && perm.principalId === userId) {
      applies = true;
    } else if (perm.principalType === "department" && departmentIds.includes(perm.principalId)) {
      applies = true;
    } else if (perm.principalType === "org" && perm.principalId === userOrgId) {
      applies = true;
    }

    if (applies) {
      canRead = true;
      if (perm.role === "editor" || perm.role === "manager" || perm.role === "owner") {
        canWrite = true;
      }
    }
  }

  return { canRead, canWrite };
}

/**
 * Get document by yjs_doc_id
 */
async function getDocumentByYjsId(yjsDocId: string): Promise<DocumentInfo | null> {
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.yjsDocId, yjsDocId))
    .limit(1);

  return doc || null;
}

/**
 * Save Yjs state to database
 */
async function saveYjsState(yjsDocId: string, state: Uint8Array): Promise<void> {
  await db
    .update(documents)
    .set({ yjsState: Buffer.from(state) })
    .where(eq(documents.yjsDocId, yjsDocId));
}

const PORT = parseInt(process.env.COLLAB_PORT || "1234", 10);

const server = Server.configure({
  port: PORT,

  async onAuthenticate(data) {
    const { token, documentName } = data;

    // Validate session token
    const user = await validateSession(token);
    if (!user) {
      throw new Error("Invalid or expired session");
    }

    // Get document by yjs_doc_id
    const document = await getDocumentByYjsId(documentName);
    if (!document) {
      throw new Error("Document not found");
    }

    // Check permissions
    const { canRead, canWrite } = await checkDocumentPermission(
      user.id,
      user.orgId,
      document.id
    );

    if (!canRead) {
      throw new Error("Access denied");
    }

    // Store user info and permissions in context
    return {
      user: {
        id: user.id,
        name: user.displayName,
        email: user.email,
      },
      documentId: document.id,
      readOnly: !canWrite,
    };
  },

  async onLoadDocument(data) {
    const { documentName, document } = data;

    // Load existing Yjs state from database
    const docInfo = await getDocumentByYjsId(documentName);

    if (docInfo?.yjsState) {
      const update = new Uint8Array(docInfo.yjsState);
      Y.applyUpdate(document, update);
    }

    return document;
  },

  async onStoreDocument(data) {
    const { documentName, document } = data;

    // Encode the current document state
    const state = Y.encodeStateAsUpdate(document);

    // Persist to database
    await saveYjsState(documentName, state);
  },

  // Awareness is handled automatically by Hocuspocus
  // User info from onAuthenticate is broadcast to all connected clients
});

// Health check HTTP server (separate port to avoid conflict with Hocuspocus WebSocket server)
const HEALTH_PORT = parseInt(process.env.COLLAB_HEALTH_PORT || String(PORT + 1), 10);
const healthServer = http.createServer((_req, res) => {
  if (_req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "healthy" }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

healthServer.listen(HEALTH_PORT, () => {
  console.log(`Health check endpoint available at http://0.0.0.0:${HEALTH_PORT}/health`);
});

server.listen().then(() => {
  console.log(`🔮 Hocuspocus collaboration server running on port ${PORT}`);
});

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log("Shutting down collaboration server...");
  healthServer.close();
  await server.destroy();
  await client.end();
  process.exit(0);
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
