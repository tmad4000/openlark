/**
 * Wiki module tests.
 *
 * Covers:
 *   - Schema validation for wiki spaces and pages
 *   - Route auth tests using `app.inject()` (all endpoints require auth)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createWikiSpaceSchema,
  updateWikiSpaceSchema,
  createWikiPageSchema,
  updateWikiPageSchema,
} from "../modules/wiki/wiki.schemas.js";
import { buildApp } from "../app.js";

// ============ SCHEMA VALIDATION ============

describe("Wiki Schema Validation", () => {
  describe("createWikiSpaceSchema", () => {
    it("requires a name", () => {
      const result = createWikiSpaceSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects empty name", () => {
      const result = createWikiSpaceSchema.safeParse({ name: "" });
      expect(result.success).toBe(false);
    });

    it("rejects name over 255 characters", () => {
      const result = createWikiSpaceSchema.safeParse({
        name: "x".repeat(256),
      });
      expect(result.success).toBe(false);
    });

    it("defaults type to private", () => {
      const result = createWikiSpaceSchema.safeParse({ name: "My Space" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("private");
      }
    });

    it("accepts public type", () => {
      const result = createWikiSpaceSchema.safeParse({
        name: "Public KB",
        type: "public",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid type", () => {
      const result = createWikiSpaceSchema.safeParse({
        name: "Space",
        type: "shared",
      });
      expect(result.success).toBe(false);
    });

    it("accepts optional description and icon", () => {
      const result = createWikiSpaceSchema.safeParse({
        name: "Space",
        description: "A wiki space",
        icon: "book",
      });
      expect(result.success).toBe(true);
    });

    it("rejects description over 2000 characters", () => {
      const result = createWikiSpaceSchema.safeParse({
        name: "Space",
        description: "x".repeat(2001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("updateWikiSpaceSchema", () => {
    it("accepts empty object (all fields optional)", () => {
      const result = updateWikiSpaceSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts partial updates", () => {
      const result = updateWikiSpaceSchema.safeParse({
        name: "New Name",
      });
      expect(result.success).toBe(true);
    });

    it("accepts settingsJson", () => {
      const result = updateWikiSpaceSchema.safeParse({
        settingsJson: { theme: "dark" },
      });
      expect(result.success).toBe(true);
    });
  });

  describe("createWikiPageSchema", () => {
    it("defaults title to Untitled", () => {
      const result = createWikiPageSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Untitled");
      }
    });

    it("accepts a custom title", () => {
      const result = createWikiPageSchema.safeParse({
        title: "Getting Started",
      });
      expect(result.success).toBe(true);
    });

    it("rejects title over 500 characters", () => {
      const result = createWikiPageSchema.safeParse({
        title: "x".repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it("validates parentPageId is UUID", () => {
      const result = createWikiPageSchema.safeParse({
        parentPageId: "not-uuid",
      });
      expect(result.success).toBe(false);
    });

    it("accepts valid parentPageId", () => {
      const result = createWikiPageSchema.safeParse({
        parentPageId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.success).toBe(true);
    });

    it("validates position is non-negative integer", () => {
      const result = createWikiPageSchema.safeParse({ position: -1 });
      expect(result.success).toBe(false);
    });

    it("accepts valid position", () => {
      const result = createWikiPageSchema.safeParse({ position: 0 });
      expect(result.success).toBe(true);
    });
  });

  describe("updateWikiPageSchema", () => {
    it("accepts empty object", () => {
      const result = updateWikiPageSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts nullable parentPageId (move to root)", () => {
      const result = updateWikiPageSchema.safeParse({ parentPageId: null });
      expect(result.success).toBe(true);
    });

    it("accepts position update", () => {
      const result = updateWikiPageSchema.safeParse({ position: 3 });
      expect(result.success).toBe(true);
    });
  });
});

// ============ ROUTE AUTH TESTS ============

describe("Wiki Routes - Auth Requirements", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  // Space CRUD
  it("GET /wiki/spaces requires authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/wiki/spaces",
    });
    expect(response.statusCode).toBe(401);
  });

  it("POST /wiki/spaces requires authentication", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/wiki/spaces",
      payload: { name: "Test Space" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("GET /wiki/spaces/:id requires authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/wiki/spaces/550e8400-e29b-41d4-a716-446655440000",
    });
    expect(response.statusCode).toBe(401);
  });

  it("PATCH /wiki/spaces/:id requires authentication", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/wiki/spaces/550e8400-e29b-41d4-a716-446655440000",
      payload: { name: "Updated" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("DELETE /wiki/spaces/:id requires authentication", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/v1/wiki/spaces/550e8400-e29b-41d4-a716-446655440000",
    });
    expect(response.statusCode).toBe(401);
  });

  // Page routes
  it("GET /wiki/spaces/:id/pages requires authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/wiki/spaces/550e8400-e29b-41d4-a716-446655440000/pages",
    });
    expect(response.statusCode).toBe(401);
  });

  it("POST /wiki/spaces/:id/pages requires authentication", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/wiki/spaces/550e8400-e29b-41d4-a716-446655440000/pages",
      payload: { title: "Test Page" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("PATCH /wiki/pages/:id requires authentication", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/wiki/pages/550e8400-e29b-41d4-a716-446655440000",
      payload: { position: 1 },
    });
    expect(response.statusCode).toBe(401);
  });

  it("DELETE /wiki/pages/:id requires authentication", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/v1/wiki/pages/550e8400-e29b-41d4-a716-446655440000",
    });
    expect(response.statusCode).toBe(401);
  });
});
