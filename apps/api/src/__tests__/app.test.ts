import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

describe("API app", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /health", () => {
    it("returns ok status", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/health",
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("ok");
      expect(body.timestamp).toBeDefined();
    });
  });

  describe("GET /api/v1/ping", () => {
    it("returns pong", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/ping",
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.pong).toBe(true);
    });
  });

  describe("unknown routes", () => {
    it("returns 404 for unknown paths", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/nonexistent",
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
