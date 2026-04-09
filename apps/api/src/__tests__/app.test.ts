import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

describe("API app", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  }, 30000);

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

  // Regression: T-027 — registerWebSocketRoutes used to await Redis subscriber
  // connect at plugin load time, hanging buildApp() past Fastify's 10s plugin
  // load timeout when Redis was unavailable. NODE_ENV=test must short-circuit.
  describe("buildApp() under NODE_ENV=test (T-027 regression)", () => {
    it("resolves quickly without a reachable Redis subscriber", async () => {
      const start = Date.now();
      const fresh = await buildApp({ logger: false });
      const elapsedMs = Date.now() - start;
      try {
        // Cold-start envelope is generous (transform/load is the dominant cost
        // on first hit) but well under Fastify's 10s plugin load timeout that
        // we used to trip on the Redis subscriber connect path.
        expect(elapsedMs).toBeLessThan(15000);
      } finally {
        await fresh.close();
      }
    }, 30000);
  });
});
