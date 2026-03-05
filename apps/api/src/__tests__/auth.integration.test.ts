/**
 * Auth Integration Tests
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
  chats,
  chatMembers,
  messages,
  messageReactions,
  messageReadReceipts,
  pins,
  favorites,
} from "../db/schema/index.js";

const SKIP_DB_TESTS = process.env.SKIP_DB_TESTS === "true";

describe.skipIf(SKIP_DB_TESTS)("Auth API - Integration", () => {
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
    // Messenger tables first (they reference auth tables)
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

  describe("POST /api/v1/auth/register", () => {
    it("creates a new organization and user with valid data", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "founder@newcompany.com",
          password: "SecurePass123!",
          displayName: "Test Founder",
          orgName: "New Company Inc",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.user.email).toBe("founder@newcompany.com");
      expect(body.data.user.displayName).toBe("Test Founder");
      expect(body.data.user.role).toBe("primary_admin");
      expect(body.data.organization.name).toBe("New Company Inc");
      expect(body.data.token).toBeDefined();
      // Password should never be returned
      expect(body.data.user.passwordHash).toBeUndefined();
    });

    it("allows same email in different organizations", async () => {
      // First registration
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "founder@company.com",
          password: "SecurePass123!",
          orgName: "Company A",
        },
      });

      // Try to register same email with different org
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "founder@company.com",
          password: "SecurePass123!",
          orgName: "Company B",
        },
      });

      // Should succeed because it's a different org
      // (Lark allows same email across orgs)
      expect(res.statusCode).toBe(201);
    });
  });

  describe("POST /api/v1/auth/login", () => {
    it("logs in with valid credentials", async () => {
      // Register first
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "user@test.com",
          password: "SecurePass123!",
          orgName: "Test Org",
        },
      });

      // Login
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {
          email: "user@test.com",
          password: "SecurePass123!",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.user.email).toBe("user@test.com");
      expect(body.data.token).toBeDefined();
    });

    it("returns 401 for wrong password", async () => {
      // Register first
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "user@test.com",
          password: "SecurePass123!",
          orgName: "Test Org",
        },
      });

      // Login with wrong password
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {
          email: "user@test.com",
          password: "WrongPassword123!",
        },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("INVALID_CREDENTIALS");
    });

    it("returns 401 for non-existent user", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {
          email: "nonexistent@example.com",
          password: "SomePassword123!",
        },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("INVALID_CREDENTIALS");
    });
  });

  describe("Auth flow", () => {
    it("completes full register -> login -> me -> logout flow", async () => {
      // Register
      const regRes = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "flow@test.com",
          password: "SecurePass123!",
          orgName: "Flow Test Org",
        },
      });
      expect(regRes.statusCode).toBe(201);
      const regBody = JSON.parse(regRes.body);
      const token = regBody.data.token;

      // Get current user
      const meRes = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: {
          authorization: `Bearer ${token}`,
        },
      });
      expect(meRes.statusCode).toBe(200);
      const meBody = JSON.parse(meRes.body);
      expect(meBody.data.user.email).toBe("flow@test.com");

      // Logout
      const logoutRes = await app.inject({
        method: "POST",
        url: "/api/v1/auth/logout",
        headers: {
          authorization: `Bearer ${token}`,
        },
      });
      expect(logoutRes.statusCode).toBe(200);

      // Token should no longer work after logout
      const postLogoutRes = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: {
          authorization: `Bearer ${token}`,
        },
      });
      expect(postLogoutRes.statusCode).toBe(401);
    });
  });

  describe("Session management (FR-1.10)", () => {
    it("lists active sessions for the user", async () => {
      // Register
      const regRes = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "sessions@test.com",
          password: "SecurePass123!",
          orgName: "Sessions Test Org",
        },
      });
      const regBody = JSON.parse(regRes.body);
      const token = regBody.data.token;

      // Get sessions
      const sessionsRes = await app.inject({
        method: "GET",
        url: "/api/v1/auth/sessions",
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(sessionsRes.statusCode).toBe(200);
      const sessionsBody = JSON.parse(sessionsRes.body);
      expect(sessionsBody.data.sessions).toHaveLength(1);
      expect(sessionsBody.data.sessions[0].isCurrent).toBe(true);
    });

    it("shows multiple sessions when logged in from multiple devices", async () => {
      // Register
      const regRes = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "multi@test.com",
          password: "SecurePass123!",
          orgName: "Multi Session Org",
        },
      });
      expect(regRes.statusCode).toBe(201);
      const regBody = JSON.parse(regRes.body);
      const token1 = regBody.data.token;

      // Login again (simulating another device)
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {
          email: "multi@test.com",
          password: "SecurePass123!",
        },
      });

      // Get sessions using first token
      const sessionsRes = await app.inject({
        method: "GET",
        url: "/api/v1/auth/sessions",
        headers: {
          authorization: `Bearer ${token1}`,
        },
      });

      expect(sessionsRes.statusCode).toBe(200);
      const sessionsBody = JSON.parse(sessionsRes.body);
      expect(sessionsBody.data.sessions).toHaveLength(2);

      // Exactly one should be marked as current
      const currentSessions = sessionsBody.data.sessions.filter(
        (s: { isCurrent: boolean }) => s.isCurrent
      );
      expect(currentSessions).toHaveLength(1);
    });

    it("revokes another session but not current one", async () => {
      // Register
      const regRes = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "revoke@test.com",
          password: "SecurePass123!",
          orgName: "Revoke Test Org",
        },
      });
      expect(regRes.statusCode).toBe(201);
      const regBody = JSON.parse(regRes.body);
      const token1 = regBody.data.token;
      const session1Id = regBody.data.session.id;

      // Login again
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {
          email: "revoke@test.com",
          password: "SecurePass123!",
        },
      });
      const loginBody = JSON.parse(loginRes.body);
      const token2 = loginBody.data.token;

      // Revoke first session from second session
      const revokeRes = await app.inject({
        method: "DELETE",
        url: `/api/v1/auth/sessions/${session1Id}`,
        headers: {
          authorization: `Bearer ${token2}`,
        },
      });
      expect(revokeRes.statusCode).toBe(200);

      // First session should no longer work
      const meRes = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: {
          authorization: `Bearer ${token1}`,
        },
      });
      expect(meRes.statusCode).toBe(401);

      // Second session should still work
      const me2Res = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: {
          authorization: `Bearer ${token2}`,
        },
      });
      expect(me2Res.statusCode).toBe(200);
    });

    it("cannot revoke current session via DELETE endpoint", async () => {
      // Register
      const regRes = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "current@test.com",
          password: "SecurePass123!",
          orgName: "Current Test Org",
        },
      });
      expect(regRes.statusCode).toBe(201);
      const regBody = JSON.parse(regRes.body);
      const token = regBody.data.token;
      const sessionId = regBody.data.session.id;

      // Try to revoke current session
      const revokeRes = await app.inject({
        method: "DELETE",
        url: `/api/v1/auth/sessions/${sessionId}`,
        headers: {
          authorization: `Bearer ${token}`,
        },
      });
      expect(revokeRes.statusCode).toBe(400);
      const revokeBody = JSON.parse(revokeRes.body);
      expect(revokeBody.code).toBe("CANNOT_REVOKE_CURRENT");
    });

    it("returns 404 when revoking non-existent session", async () => {
      // Register
      const regRes = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "notfound@test.com",
          password: "SecurePass123!",
          orgName: "Not Found Test Org",
        },
      });
      expect(regRes.statusCode).toBe(201);
      const regBody = JSON.parse(regRes.body);
      const token = regBody.data.token;

      // Try to revoke non-existent session
      const revokeRes = await app.inject({
        method: "DELETE",
        url: "/api/v1/auth/sessions/00000000-0000-0000-0000-000000000000",
        headers: {
          authorization: `Bearer ${token}`,
        },
      });
      expect(revokeRes.statusCode).toBe(404);
      const revokeBody = JSON.parse(revokeRes.body);
      expect(revokeBody.code).toBe("SESSION_NOT_FOUND");
    });
  });
});
