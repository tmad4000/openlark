import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createDocumentSchema,
  updateDocumentSchema,
  addPermissionSchema,
  updatePermissionSchema,
  createVersionSchema,
  createCommentSchema,
  updateCommentSchema,
  documentsQuerySchema,
} from "../modules/docs/docs.schemas.js";

// ============ SCHEMA VALIDATION TESTS ============

describe("Docs Schema Validation", () => {
  describe("createDocumentSchema", () => {
    it("should validate a valid document input", () => {
      const input = {
        title: "My Document",
      };
      const result = createDocumentSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should use default type 'doc' when not specified", () => {
      const input = { title: "Test Document" };
      const result = createDocumentSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("doc");
      }
    });

    it("should validate sheet type", () => {
      const input = {
        title: "Budget Spreadsheet",
        type: "sheet",
      };
      const result = createDocumentSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate slide type", () => {
      const input = {
        title: "Q4 Presentation",
        type: "slide",
      };
      const result = createDocumentSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate mindnote type", () => {
      const input = {
        title: "Project Ideas",
        type: "mindnote",
      };
      const result = createDocumentSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate board type", () => {
      const input = {
        title: "Whiteboard",
        type: "board",
      };
      const result = createDocumentSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject invalid document type", () => {
      const input = {
        title: "Test",
        type: "invalid_type",
      };
      const result = createDocumentSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should use default title 'Untitled' when title not provided", () => {
      const input = {};
      const result = createDocumentSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Untitled");
      }
    });

    it("should accept optional templateId as UUID", () => {
      const input = {
        title: "From Template",
        templateId: "550e8400-e29b-41d4-a716-446655440000",
      };
      const result = createDocumentSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject invalid templateId format", () => {
      const input = {
        title: "Test",
        templateId: "not-a-uuid",
      };
      const result = createDocumentSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("updateDocumentSchema", () => {
    it("should validate partial update with title only", () => {
      const input = { title: "New Title" };
      const result = updateDocumentSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate empty update object", () => {
      const input = {};
      const result = updateDocumentSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate settingsJson update", () => {
      const input = { settingsJson: { theme: "dark", fontSize: 14 } };
      const result = updateDocumentSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject empty title string", () => {
      const input = { title: "" };
      const result = updateDocumentSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("addPermissionSchema", () => {
    it("should validate permission with user principal", () => {
      const input = {
        principalType: "user",
        principalId: "550e8400-e29b-41d4-a716-446655440000",
        role: "editor",
      };
      const result = addPermissionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate permission with department principal", () => {
      const input = {
        principalType: "department",
        principalId: "550e8400-e29b-41d4-a716-446655440000",
        role: "viewer",
      };
      const result = addPermissionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate permission with org principal", () => {
      const input = {
        principalType: "org",
        principalId: "550e8400-e29b-41d4-a716-446655440000",
        role: "viewer",
      };
      const result = addPermissionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate owner role", () => {
      const input = {
        principalType: "user",
        principalId: "550e8400-e29b-41d4-a716-446655440000",
        role: "owner",
      };
      const result = addPermissionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate manager role", () => {
      const input = {
        principalType: "user",
        principalId: "550e8400-e29b-41d4-a716-446655440000",
        role: "manager",
      };
      const result = addPermissionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject invalid principal type", () => {
      const input = {
        principalType: "team",
        principalId: "550e8400-e29b-41d4-a716-446655440000",
        role: "editor",
      };
      const result = addPermissionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject invalid role", () => {
      const input = {
        principalType: "user",
        principalId: "550e8400-e29b-41d4-a716-446655440000",
        role: "admin",
      };
      const result = addPermissionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject missing required fields", () => {
      const input = {
        principalType: "user",
      };
      const result = addPermissionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject non-UUID principalId", () => {
      const input = {
        principalType: "user",
        principalId: "not-a-uuid",
        role: "editor",
      };
      const result = addPermissionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("updatePermissionSchema", () => {
    it("should validate role update", () => {
      const input = { role: "manager" };
      const result = updatePermissionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject invalid role update", () => {
      const input = { role: "superuser" };
      const result = updatePermissionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("createVersionSchema", () => {
    it("should validate version with name", () => {
      const input = { name: "v1.0" };
      const result = createVersionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should allow version without name (optional)", () => {
      const input = {};
      const result = createVersionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should allow empty version name (optional field)", () => {
      const input = { name: "" };
      const result = createVersionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe("createCommentSchema", () => {
    it("should validate comment with content only", () => {
      const input = { content: "This is a great point!" };
      const result = createCommentSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate comment with blockId", () => {
      const input = {
        content: "Consider rewording this",
        blockId: "block-123",
      };
      const result = createCommentSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate comment with anchorJson", () => {
      const input = {
        content: "Anchored comment",
        anchorJson: { start: 100, end: 150 },
      };
      const result = createCommentSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate reply comment with threadId", () => {
      const input = {
        content: "I agree with this suggestion",
        threadId: "550e8400-e29b-41d4-a716-446655440000",
      };
      const result = createCommentSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject empty comment content", () => {
      const input = { content: "" };
      const result = createCommentSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject invalid threadId format", () => {
      const input = {
        content: "Reply comment",
        threadId: "not-a-uuid",
      };
      const result = createCommentSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("updateCommentSchema", () => {
    it("should validate content update", () => {
      const input = { content: "Updated comment text" };
      const result = updateCommentSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject empty content update", () => {
      const input = { content: "" };
      const result = updateCommentSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("documentsQuerySchema", () => {
    it("should validate empty query (use defaults)", () => {
      const input = {};
      const result = documentsQuerySchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(20);
      }
    });

    it("should validate cursor-based pagination with UUID", () => {
      const input = {
        cursor: "550e8400-e29b-41d4-a716-446655440000",
        limit: "25",
      };
      const result = documentsQuerySchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate type filter", () => {
      const input = { type: "sheet" };
      const result = documentsQuerySchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should transform limit string to number", () => {
      const input = { limit: "30" };
      const result = documentsQuerySchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(30);
      }
    });

    it("should cap limit at 100", () => {
      const input = { limit: "200" };
      const result = documentsQuerySchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(100);
      }
    });

    it("should enforce minimum limit of 1", () => {
      const input = { limit: "0" };
      const result = documentsQuerySchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(1);
      }
    });

    it("should reject invalid type filter", () => {
      const input = { type: "unknown" };
      const result = documentsQuerySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject non-UUID cursor", () => {
      const input = { cursor: "not-a-uuid" };
      const result = documentsQuerySchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});

// ============ API ROUTE TESTS ============

describe("Docs API Routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const { buildApp } = await import("../app.js");
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("Authentication", () => {
    it("should require authentication for all document routes", async () => {
      const routes = [
        { method: "GET", url: "/api/v1/docs/documents" },
        { method: "POST", url: "/api/v1/docs/documents" },
        { method: "GET", url: "/api/v1/docs/documents/test-id" },
        { method: "PATCH", url: "/api/v1/docs/documents/test-id" },
        { method: "DELETE", url: "/api/v1/docs/documents/test-id" },
        { method: "GET", url: "/api/v1/docs/documents/test-id/permissions" },
        { method: "POST", url: "/api/v1/docs/documents/test-id/permissions" },
        { method: "GET", url: "/api/v1/docs/documents/test-id/versions" },
        { method: "POST", url: "/api/v1/docs/documents/test-id/versions" },
        { method: "GET", url: "/api/v1/docs/documents/test-id/comments" },
        { method: "POST", url: "/api/v1/docs/documents/test-id/comments" },
      ];

      for (const route of routes) {
        const response = await app.inject({
          method: route.method as "GET" | "POST" | "PATCH" | "DELETE",
          url: route.url,
        });
        expect(response.statusCode).toBe(401);
      }
    });
  });
});
