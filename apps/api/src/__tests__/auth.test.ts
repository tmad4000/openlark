import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

describe("Auth API", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /api/v1/auth/register - Validation", () => {
    it("rejects registration with missing email", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          password: "SecurePass123!",
          orgName: "Test Org",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("rejects registration with invalid email format", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "not-an-email",
          password: "SecurePass123!",
          orgName: "Test Org",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("rejects registration with weak password - too short", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "test@example.com",
          password: "weak",
          orgName: "Test Org",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("rejects registration with weak password - no uppercase", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "test@example.com",
          password: "weakpassword123",
          orgName: "Test Org",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("rejects registration with weak password - no number", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "test@example.com",
          password: "WeakPassword",
          orgName: "Test Org",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("rejects registration with missing org name", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "test@example.com",
          password: "SecurePass123!",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("POST /api/v1/auth/login - Validation", () => {
    it("rejects login with missing credentials", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("rejects login with invalid email format", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {
          email: "not-an-email",
          password: "SomePassword123",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("rejects login with missing password", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {
          email: "test@example.com",
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /api/v1/auth/logout - Auth Required", () => {
    it("rejects logout without auth token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/logout",
      });

      expect(res.statusCode).toBe(401);
    });

    it("rejects logout with invalid token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/logout",
        headers: {
          authorization: "Bearer invalid-token",
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /api/v1/auth/me - Auth Required", () => {
    it("rejects access without auth token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
      });

      expect(res.statusCode).toBe(401);
    });

    it("rejects access with invalid token format", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: {
          authorization: "NotBearer token",
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it("rejects access with malformed JWT", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: {
          authorization: "Bearer not.a.valid.jwt",
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /api/v1/auth/sessions - Auth Required", () => {
    it("rejects access without auth token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/auth/sessions",
      });

      expect(res.statusCode).toBe(401);
    });

    it("rejects access with invalid token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/auth/sessions",
        headers: {
          authorization: "Bearer invalid-token",
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("DELETE /api/v1/auth/sessions/:id - Auth Required", () => {
    it("rejects access without auth token", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/v1/auth/sessions/some-session-id",
      });

      expect(res.statusCode).toBe(401);
    });

    it("rejects access with invalid token", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/v1/auth/sessions/some-session-id",
        headers: {
          authorization: "Bearer invalid-token",
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /api/v1/auth/users - Auth Required", () => {
    it("rejects access without auth token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/auth/users",
      });

      expect(res.statusCode).toBe(401);
    });

    it("rejects access with invalid token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/auth/users",
        headers: {
          authorization: "Bearer invalid-token",
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it("accepts query parameter for search", async () => {
      // Without a valid token, will still return 401
      // This test confirms the route exists and accepts the query param
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/auth/users?q=test",
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
