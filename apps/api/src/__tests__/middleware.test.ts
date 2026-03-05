import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

describe("Auth Middleware", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("authenticate middleware", () => {
    it("rejects requests without Authorization header", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("UNAUTHORIZED");
      expect(body.message).toContain("authorization header");
    });

    it("rejects requests with non-Bearer authorization", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: {
          authorization: "Basic dXNlcjpwYXNz",
        },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("UNAUTHORIZED");
    });

    it("rejects requests with invalid JWT token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: {
          authorization: "Bearer invalid.jwt.token",
        },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("INVALID_TOKEN");
    });

    it("rejects requests with empty Bearer token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: {
          authorization: "Bearer ",
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // Rate limiting tests require database access since they hit actual endpoints
  // These are skipped when SKIP_DB_TESTS is set
  describe.skipIf(process.env.SKIP_DB_TESTS === "true")("rate limiting", () => {
    it("returns rate limit error after exceeding limit", async () => {
      // Make 15 sequential requests (limit is 10 per minute)
      // Using sequential requests ensures they all hit the same rate limit window
      const responses = [];
      for (let i = 0; i < 15; i++) {
        const res = await app.inject({
          method: "POST",
          url: "/api/v1/auth/login",
          payload: {
            email: "test@example.com",
            password: "TestPassword123",
          },
        });
        responses.push(res);
      }

      // At least one should be rate limited (429)
      const rateLimited = responses.filter((r) => r.statusCode === 429);
      expect(rateLimited.length).toBeGreaterThan(0);

      // The rate-limited response should have the correct error format
      const limitedBody = JSON.parse(rateLimited[0].body);
      expect(limitedBody.code).toBe("RATE_LIMITED");
    });
  });
});
