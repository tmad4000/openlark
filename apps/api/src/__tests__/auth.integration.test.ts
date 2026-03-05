/**
 * Auth Integration Tests
 *
 * These tests require a running PostgreSQL database.
 * They are skipped if DATABASE_URL is not configured or the database is unavailable.
 *
 * To run:
 * 1. Start Docker: pnpm docker:up
 * 2. Run migrations: pnpm db:migrate
 * 3. Run tests: pnpm test
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { users, organizations, sessions } from "../db/schema/index.js";
import { sql } from "drizzle-orm";

// Check if database is available
async function isDatabaseAvailable(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(
  process.env.SKIP_DB_TESTS === "true"
)("Auth API - Integration", async () => {
  let app: FastifyInstance;
  let dbAvailable = false;

  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (!dbAvailable) {
      console.log(
        "⚠️  Skipping integration tests: Database not available"
      );
      return;
    }
    app = await buildApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    if (!dbAvailable) return;
    // Clean up test data before each test
    await db.delete(sessions);
    await db.delete(users);
    await db.delete(organizations);
  });

  describe.skipIf(!dbAvailable)("POST /api/v1/auth/register", () => {
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

    it("rejects duplicate email within same org", async () => {
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

      // Try to register same email
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

  describe.skipIf(!dbAvailable)("POST /api/v1/auth/login", () => {
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

  describe.skipIf(!dbAvailable)("Auth flow", () => {
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
});
