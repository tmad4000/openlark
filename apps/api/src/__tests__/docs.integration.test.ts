/**
 * Docs Integration Tests
 *
 * These tests require a running PostgreSQL database.
 * They are skipped if SKIP_DB_TESTS=true is set.
 *
 * To run:
 * 1. Start Docker: pnpm docker:up
 * 2. Run migrations: pnpm db:migrate (or drizzle-kit push)
 * 3. Run tests: pnpm test
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import {
  users,
  organizations,
  sessions,
} from "../db/schema/auth.js";
import {
  chats,
  chatMembers,
  messages,
  messageReactions,
  messageReadReceipts,
  pins,
  favorites,
} from "../db/schema/messenger.js";
import {
  documents,
  documentPermissions,
  documentVersions,
  documentComments,
  yjsUpdates,
} from "../db/schema/docs.js";

const SKIP_DB_TESTS = process.env.SKIP_DB_TESTS === "true";

describe.skipIf(SKIP_DB_TESTS)("Docs API - Integration", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    // Clean up test data before each test (order matters due to foreign keys)
    // Docs tables first (they reference auth tables)
    await db.delete(yjsUpdates);
    await db.delete(documentComments);
    await db.delete(documentVersions);
    await db.delete(documentPermissions);
    await db.delete(documents);
    // Messenger tables (they reference auth tables)
    await db.delete(favorites);
    await db.delete(pins);
    await db.delete(messageReadReceipts);
    await db.delete(messageReactions);
    await db.delete(messages);
    await db.delete(chatMembers);
    await db.delete(chats);
    // Then auth tables
    await db.delete(sessions);
    await db.delete(users);
    await db.delete(organizations);
  });

  // Helper to register a user and get their token
  async function registerUser(email: string, orgName: string): Promise<{ token: string; userId: string; orgId: string }> {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email,
        password: "SecurePass123!",
        displayName: email.split("@")[0],
        orgName,
      },
    });
    const body = JSON.parse(res.body);
    return {
      token: body.data.token,
      userId: body.data.user.id,
      orgId: body.data.organization.id,
    };
  }

  // Helper to create a document
  async function createDocument(token: string, title: string = "Test Document"): Promise<{ documentId: string }> {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/docs/documents",
      headers: { Authorization: `Bearer ${token}` },
      payload: { title },
    });
    const body = JSON.parse(res.body);
    if (res.statusCode !== 201) {
      throw new Error(`Failed to create document: ${res.statusCode} ${JSON.stringify(body)}`);
    }
    return { documentId: body.data.document.id };
  }

  // Helper to add permission to a document
  async function addPermission(
    token: string,
    documentId: string,
    principalId: string,
    role: string
  ): Promise<{ permissionId: string }> {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/docs/documents/${documentId}/permissions`,
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        principalId,
        principalType: "user",
        role,
      },
    });
    const body = JSON.parse(res.body);
    if (res.statusCode !== 201) {
      throw new Error(`Failed to add permission: ${res.statusCode} ${JSON.stringify(body)}`);
    }
    return { permissionId: body.data.permission.id };
  }

  describe("Permission Authorization", () => {
    describe("PATCH /permissions/:permissionId", () => {
      it("allows document manager to update permissions", async () => {
        // User1 creates doc, gives User2 viewer role
        const user1 = await registerUser("owner@example.com", "Test Org");
        const user2 = await registerUser("viewer@example.com", "Another Org");

        const { documentId } = await createDocument(user1.token, "Shared Doc");
        const { permissionId } = await addPermission(
          user1.token,
          documentId,
          user2.userId,
          "viewer"
        );

        // Owner (has manager+ role) should be able to update the permission
        const res = await app.inject({
          method: "PATCH",
          url: `/api/v1/docs/permissions/${permissionId}`,
          headers: { Authorization: `Bearer ${user1.token}` },
          payload: { role: "editor" },
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.data.permission.role).toBe("editor");
      });

      it("rejects permission update from non-manager user", async () => {
        // User1 creates doc, gives User2 viewer role
        const user1 = await registerUser("owner@example.com", "Test Org");
        const user2 = await registerUser("viewer@example.com", "Another Org");

        const { documentId } = await createDocument(user1.token, "Shared Doc");
        const { permissionId } = await addPermission(
          user1.token,
          documentId,
          user2.userId,
          "viewer"
        );

        // User2 (viewer role) should NOT be able to update their own permission
        const res = await app.inject({
          method: "PATCH",
          url: `/api/v1/docs/permissions/${permissionId}`,
          headers: { Authorization: `Bearer ${user2.token}` },
          payload: { role: "owner" },
        });

        expect(res.statusCode).toBe(403);
        const body = JSON.parse(res.body);
        expect(body.error).toBe("Forbidden");
      });

      it("rejects permission update from user with no access to document", async () => {
        // User1 creates doc with permission for User2
        // User3 (no access) tries to modify User2's permission
        const user1 = await registerUser("owner@example.com", "Test Org");
        const user2 = await registerUser("viewer@example.com", "Another Org");
        const user3 = await registerUser("attacker@example.com", "Evil Org");

        const { documentId } = await createDocument(user1.token, "Private Doc");
        const { permissionId } = await addPermission(
          user1.token,
          documentId,
          user2.userId,
          "viewer"
        );

        // User3 (no access) should NOT be able to update any permission
        const res = await app.inject({
          method: "PATCH",
          url: `/api/v1/docs/permissions/${permissionId}`,
          headers: { Authorization: `Bearer ${user3.token}` },
          payload: { role: "owner" },
        });

        expect(res.statusCode).toBe(403);
        const body = JSON.parse(res.body);
        expect(body.error).toBe("Forbidden");
      });

      it("allows editor to NOT update permissions (editor < manager)", async () => {
        // User1 creates doc, gives User2 editor role, User3 viewer role
        const user1 = await registerUser("owner@example.com", "Test Org");
        const user2 = await registerUser("editor@example.com", "Another Org");
        const user3 = await registerUser("viewer@example.com", "Third Org");

        const { documentId } = await createDocument(user1.token, "Shared Doc");
        await addPermission(user1.token, documentId, user2.userId, "editor");
        const { permissionId } = await addPermission(
          user1.token,
          documentId,
          user3.userId,
          "viewer"
        );

        // User2 (editor) should NOT be able to modify permissions
        const res = await app.inject({
          method: "PATCH",
          url: `/api/v1/docs/permissions/${permissionId}`,
          headers: { Authorization: `Bearer ${user2.token}` },
          payload: { role: "editor" },
        });

        expect(res.statusCode).toBe(403);
      });
    });

    describe("DELETE /permissions/:permissionId", () => {
      it("allows document manager to delete permissions", async () => {
        const user1 = await registerUser("owner@example.com", "Test Org");
        const user2 = await registerUser("viewer@example.com", "Another Org");

        const { documentId } = await createDocument(user1.token, "Shared Doc");
        const { permissionId } = await addPermission(
          user1.token,
          documentId,
          user2.userId,
          "viewer"
        );

        // Owner should be able to delete the permission
        const res = await app.inject({
          method: "DELETE",
          url: `/api/v1/docs/permissions/${permissionId}`,
          headers: { Authorization: `Bearer ${user1.token}` },
        });

        expect(res.statusCode).toBe(204);
      });

      it("rejects permission deletion from non-manager user", async () => {
        const user1 = await registerUser("owner@example.com", "Test Org");
        const user2 = await registerUser("viewer@example.com", "Another Org");

        const { documentId } = await createDocument(user1.token, "Shared Doc");
        const { permissionId } = await addPermission(
          user1.token,
          documentId,
          user2.userId,
          "viewer"
        );

        // User2 should NOT be able to delete their own permission (escalation attempt)
        const res = await app.inject({
          method: "DELETE",
          url: `/api/v1/docs/permissions/${permissionId}`,
          headers: { Authorization: `Bearer ${user2.token}` },
        });

        expect(res.statusCode).toBe(403);
        const body = JSON.parse(res.body);
        expect(body.error).toBe("Forbidden");
      });

      it("rejects permission deletion from user with no access to document", async () => {
        const user1 = await registerUser("owner@example.com", "Test Org");
        const user2 = await registerUser("viewer@example.com", "Another Org");
        const user3 = await registerUser("attacker@example.com", "Evil Org");

        const { documentId } = await createDocument(user1.token, "Private Doc");
        const { permissionId } = await addPermission(
          user1.token,
          documentId,
          user2.userId,
          "viewer"
        );

        // User3 should NOT be able to delete permissions on a doc they have no access to
        const res = await app.inject({
          method: "DELETE",
          url: `/api/v1/docs/permissions/${permissionId}`,
          headers: { Authorization: `Bearer ${user3.token}` },
        });

        expect(res.statusCode).toBe(403);
        const body = JSON.parse(res.body);
        expect(body.error).toBe("Forbidden");
      });

      it("returns 404 for non-existent permission", async () => {
        const user1 = await registerUser("owner@example.com", "Test Org");

        const res = await app.inject({
          method: "DELETE",
          url: "/api/v1/docs/permissions/00000000-0000-0000-0000-000000000000",
          headers: { Authorization: `Bearer ${user1.token}` },
        });

        expect(res.statusCode).toBe(404);
      });
    });
  });

  describe("Document CRUD", () => {
    it("creates a document", async () => {
      const user = await registerUser("test@example.com", "Test Org");

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/docs/documents",
        headers: { Authorization: `Bearer ${user.token}` },
        payload: { title: "My New Document", type: "doc" },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.document.title).toBe("My New Document");
      expect(body.data.document.type).toBe("doc");
      expect(body.data.document.ownerId).toBe(user.userId);
    });

    it("lists user documents", async () => {
      const user = await registerUser("test@example.com", "Test Org");

      await createDocument(user.token, "Doc 1");
      await createDocument(user.token, "Doc 2");

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/docs/documents",
        headers: { Authorization: `Bearer ${user.token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.documents).toHaveLength(2);
    });

    it("gets a single document", async () => {
      const user = await registerUser("test@example.com", "Test Org");
      const { documentId } = await createDocument(user.token, "Test Doc");

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/docs/documents/${documentId}`,
        headers: { Authorization: `Bearer ${user.token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.document.id).toBe(documentId);
      expect(body.data.document.title).toBe("Test Doc");
    });

    it("returns 403 when user has no access to document", async () => {
      const user1 = await registerUser("owner@example.com", "Test Org");
      const user2 = await registerUser("other@example.com", "Another Org");

      const { documentId } = await createDocument(user1.token, "Private Doc");

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/docs/documents/${documentId}`,
        headers: { Authorization: `Bearer ${user2.token}` },
      });

      expect(res.statusCode).toBe(403);
    });
  });
});
