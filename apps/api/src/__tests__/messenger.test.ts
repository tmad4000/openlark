import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import {
  createChatSchema,
  updateChatSchema,
  sendMessageSchema,
  editMessageSchema,
  reactionSchema,
  paginationSchema,
  addMemberSchema,
  updateMemberSchema,
} from "../modules/messenger/messenger.schemas.js";

describe("Messenger Schema Validation", () => {
  describe("createChatSchema", () => {
    it("should validate a valid group chat input", () => {
      const input = {
        type: "group",
        name: "Test Group",
        memberIds: ["123e4567-e89b-12d3-a456-426614174000"],
      };
      const result = createChatSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate a DM with exactly one member", () => {
      const input = {
        type: "dm",
        memberIds: ["123e4567-e89b-12d3-a456-426614174000"],
      };
      const result = createChatSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject DM with more than one member", () => {
      const input = {
        type: "dm",
        memberIds: [
          "123e4567-e89b-12d3-a456-426614174000",
          "223e4567-e89b-12d3-a456-426614174001",
        ],
      };
      const result = createChatSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject empty memberIds", () => {
      const input = {
        type: "group",
        name: "Test",
        memberIds: [],
      };
      const result = createChatSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject invalid chat type", () => {
      const input = {
        type: "invalid",
        memberIds: ["123e4567-e89b-12d3-a456-426614174000"],
      };
      const result = createChatSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject maxMembers exceeding 50000", () => {
      const input = {
        type: "supergroup",
        name: "Huge Group",
        memberIds: ["123e4567-e89b-12d3-a456-426614174000"],
        maxMembers: 60000,
      };
      const result = createChatSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should accept valid supergroup with maxMembers", () => {
      const input = {
        type: "supergroup",
        name: "Large Group",
        memberIds: ["123e4567-e89b-12d3-a456-426614174000"],
        maxMembers: 50000,
      };
      const result = createChatSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe("updateChatSchema", () => {
    it("should validate partial update", () => {
      const input = { name: "New Name" };
      const result = updateChatSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should allow null avatarUrl", () => {
      const input = { avatarUrl: null };
      const result = updateChatSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject name exceeding 255 chars", () => {
      const input = { name: "x".repeat(256) };
      const result = updateChatSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("sendMessageSchema", () => {
    it("should validate simple text message", () => {
      const input = { content: "Hello world" };
      const result = sendMessageSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("text"); // default
      }
    });

    it("should validate rich text message with JSON content", () => {
      const input = {
        type: "rich_text",
        content: { blocks: [{ type: "paragraph", text: "Hello" }] },
      };
      const result = sendMessageSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate message with thread reference", () => {
      const input = {
        content: "Thread reply",
        threadId: "123e4567-e89b-12d3-a456-426614174000",
      };
      const result = sendMessageSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate message with reply reference", () => {
      const input = {
        content: "Reply",
        replyToId: "123e4567-e89b-12d3-a456-426614174000",
      };
      const result = sendMessageSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject empty content", () => {
      const input = { content: "" };
      const result = sendMessageSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject content exceeding 10000 chars", () => {
      const input = { content: "x".repeat(10001) };
      const result = sendMessageSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should validate scheduled message", () => {
      const input = {
        content: "Scheduled",
        scheduledFor: "2026-03-06T12:00:00Z",
      };
      const result = sendMessageSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe("editMessageSchema", () => {
    it("should validate text content", () => {
      const input = { content: "Edited text" };
      const result = editMessageSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate JSON content", () => {
      const input = { content: { text: "Edited", format: "bold" } };
      const result = editMessageSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject empty content", () => {
      const input = { content: "" };
      const result = editMessageSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("reactionSchema", () => {
    it("should validate simple emoji", () => {
      const input = { emoji: "👍" };
      const result = reactionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate text emoji", () => {
      const input = { emoji: ":thumbsup:" };
      const result = reactionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject empty emoji", () => {
      const input = { emoji: "" };
      const result = reactionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject emoji exceeding 32 chars", () => {
      const input = { emoji: "x".repeat(33) };
      const result = reactionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("paginationSchema", () => {
    it("should apply default limit", () => {
      const input = {};
      const result = paginationSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
      }
    });

    it("should parse limit from string", () => {
      const input = { limit: "25" };
      const result = paginationSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(25);
      }
    });

    it("should reject limit exceeding 100", () => {
      const input = { limit: 150 };
      const result = paginationSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should validate cursor params", () => {
      const input = {
        before: "123e4567-e89b-12d3-a456-426614174000",
        limit: 20,
      };
      const result = paginationSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe("addMemberSchema", () => {
    it("should validate with userId only", () => {
      const input = { userId: "123e4567-e89b-12d3-a456-426614174000" };
      const result = addMemberSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.role).toBe("member"); // default
      }
    });

    it("should validate with role", () => {
      const input = {
        userId: "123e4567-e89b-12d3-a456-426614174000",
        role: "admin",
      };
      const result = addMemberSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject invalid role", () => {
      const input = {
        userId: "123e4567-e89b-12d3-a456-426614174000",
        role: "superadmin",
      };
      const result = addMemberSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("updateMemberSchema", () => {
    it("should validate muted update", () => {
      const input = { muted: true };
      const result = updateMemberSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate role update", () => {
      const input = { role: "admin" };
      const result = updateMemberSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate label update", () => {
      const input = { label: "Important" };
      const result = updateMemberSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should allow null label", () => {
      const input = { label: null };
      const result = updateMemberSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });
});

describe("Messenger Routes - Auth Requirements", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
  });

  it("GET /messenger/chats requires authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/messenger/chats",
    });
    expect(response.statusCode).toBe(401);
  });

  it("POST /messenger/chats requires authentication", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/messenger/chats",
      payload: {
        type: "group",
        name: "Test",
        memberIds: ["123e4567-e89b-12d3-a456-426614174000"],
      },
    });
    expect(response.statusCode).toBe(401);
  });

  it("GET /messenger/chats/:chatId/messages requires authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/messenger/chats/123e4567-e89b-12d3-a456-426614174000/messages",
    });
    expect(response.statusCode).toBe(401);
  });

  it("POST /messenger/chats/:chatId/messages requires authentication", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/messenger/chats/123e4567-e89b-12d3-a456-426614174000/messages",
      payload: { content: "Hello" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("GET /messenger/favorites requires authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/messenger/favorites",
    });
    expect(response.statusCode).toBe(401);
  });

  it("POST /messenger/messages/:messageId/reactions requires authentication", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/messenger/messages/123e4567-e89b-12d3-a456-426614174000/reactions",
      payload: { emoji: "👍" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("POST /messenger/messages/:messageId/read requires authentication", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/messenger/messages/123e4567-e89b-12d3-a456-426614174000/read",
    });
    expect(response.statusCode).toBe(401);
  });
});
