/**
 * Messenger Integration Tests
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
  chatTabs,
  announcements,
  documents,
  documentPermissions,
  documentVersions,
  documentComments,
  yjsUpdates,
} from "../db/schema/index.js";

const SKIP_DB_TESTS = process.env.SKIP_DB_TESTS === "true";

/**
 * Helper to register a user and return their token
 */
async function registerUser(
  app: FastifyInstance,
  email: string,
  orgName: string
): Promise<{ token: string; userId: string; orgId: string }> {
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

/**
 * Helper to add a user to an existing org
 */
async function addUserToOrg(
  app: FastifyInstance,
  email: string,
  _orgId: string
): Promise<{ token: string; userId: string }> {
  // For this test, we create a separate org then use the userId
  // In production, users would be invited via invite flow
  // For integration tests, we'll register in a new org and use shared test patterns
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      email,
      password: "SecurePass123!",
      displayName: email.split("@")[0],
      orgName: `${email}-org`, // Temporary org
    },
  });

  const body = JSON.parse(res.body);
  return {
    token: body.data.token,
    userId: body.data.user.id,
  };
}

describe.skipIf(SKIP_DB_TESTS)("Messenger API - Integration", () => {
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
    await db.delete(announcements);
    await db.delete(chatTabs);
    await db.delete(favorites);
    await db.delete(pins);
    await db.delete(messageReadReceipts);
    await db.delete(messageReactions);
    await db.delete(messages);
    await db.delete(chatMembers);
    await db.delete(chats);
    // Auth tables
    await db.delete(sessions);
    await db.delete(users);
    await db.delete(organizations);
  });

  describe("Chat CRUD operations", () => {
    it("creates a group chat with members", async () => {
      const user1 = await registerUser(app, "creator@test.com", "Test Org");
      const user2 = await addUserToOrg(app, "member@test.com", user1.orgId);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/messenger/chats",
        headers: { authorization: `Bearer ${user1.token}` },
        payload: {
          type: "group",
          name: "My Group",
          memberIds: [user2.userId],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.chat.type).toBe("group");
      expect(body.data.chat.name).toBe("My Group");
      expect(body.data.members).toHaveLength(2);

      // Creator should be owner
      const ownerMember = body.data.members.find(
        (m: { userId: string }) => m.userId === user1.userId
      );
      expect(ownerMember.role).toBe("owner");
    });

    it("creates a DM between two users", async () => {
      const user1 = await registerUser(app, "sender@test.com", "Test Org");
      const user2 = await addUserToOrg(app, "receiver@test.com", user1.orgId);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/messenger/chats",
        headers: { authorization: `Bearer ${user1.token}` },
        payload: {
          type: "dm",
          memberIds: [user2.userId],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.chat.type).toBe("dm");
      expect(body.data.chat.name).toBeNull();
      expect(body.data.members).toHaveLength(2);
    });

    it("deduplicates DM chats between same users", async () => {
      const user1 = await registerUser(app, "dm1@test.com", "Test Org");
      const user2 = await addUserToOrg(app, "dm2@test.com", user1.orgId);

      // Create first DM
      const res1 = await app.inject({
        method: "POST",
        url: "/api/v1/messenger/chats",
        headers: { authorization: `Bearer ${user1.token}` },
        payload: {
          type: "dm",
          memberIds: [user2.userId],
        },
      });
      const chat1 = JSON.parse(res1.body).data.chat;

      // Try to create another DM with same users
      const res2 = await app.inject({
        method: "POST",
        url: "/api/v1/messenger/chats",
        headers: { authorization: `Bearer ${user1.token}` },
        payload: {
          type: "dm",
          memberIds: [user2.userId],
        },
      });

      expect(res2.statusCode).toBe(201);
      const chat2 = JSON.parse(res2.body).data.chat;

      // Should return the same chat ID (deduplication)
      expect(chat2.id).toBe(chat1.id);
    });

    it("lists user chats", async () => {
      const user = await registerUser(app, "chatlist@test.com", "Test Org");
      const other = await addUserToOrg(app, "other@test.com", user.orgId);

      // Create a chat
      await app.inject({
        method: "POST",
        url: "/api/v1/messenger/chats",
        headers: { authorization: `Bearer ${user.token}` },
        payload: {
          type: "group",
          name: "First Group",
          memberIds: [other.userId],
        },
      });

      // List chats
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/messenger/chats",
        headers: { authorization: `Bearer ${user.token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.chats).toHaveLength(1);
      expect(body.data.chats[0].name).toBe("First Group");
    });

    it("updates chat settings (owner only)", async () => {
      const owner = await registerUser(app, "owner@test.com", "Test Org");
      const member = await addUserToOrg(app, "member@test.com", owner.orgId);

      // Create chat
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/messenger/chats",
        headers: { authorization: `Bearer ${owner.token}` },
        payload: {
          type: "group",
          name: "Original Name",
          memberIds: [member.userId],
        },
      });
      const chatId = JSON.parse(createRes.body).data.chat.id;

      // Owner updates chat
      const updateRes = await app.inject({
        method: "PATCH",
        url: `/api/v1/messenger/chats/${chatId}`,
        headers: { authorization: `Bearer ${owner.token}` },
        payload: { name: "Updated Name" },
      });

      expect(updateRes.statusCode).toBe(200);
      expect(JSON.parse(updateRes.body).data.chat.name).toBe("Updated Name");

      // Member cannot update chat
      const memberUpdateRes = await app.inject({
        method: "PATCH",
        url: `/api/v1/messenger/chats/${chatId}`,
        headers: { authorization: `Bearer ${member.token}` },
        payload: { name: "Member Update" },
      });

      expect(memberUpdateRes.statusCode).toBe(403);
    });

    it("deletes chat (owner only)", async () => {
      const owner = await registerUser(app, "delete@test.com", "Test Org");
      const member = await addUserToOrg(app, "nomember@test.com", owner.orgId);

      // Create chat
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/messenger/chats",
        headers: { authorization: `Bearer ${owner.token}` },
        payload: {
          type: "group",
          name: "To Delete",
          memberIds: [member.userId],
        },
      });
      const chatId = JSON.parse(createRes.body).data.chat.id;

      // Member cannot delete
      const memberDeleteRes = await app.inject({
        method: "DELETE",
        url: `/api/v1/messenger/chats/${chatId}`,
        headers: { authorization: `Bearer ${member.token}` },
      });
      expect(memberDeleteRes.statusCode).toBe(403);

      // Owner can delete
      const ownerDeleteRes = await app.inject({
        method: "DELETE",
        url: `/api/v1/messenger/chats/${chatId}`,
        headers: { authorization: `Bearer ${owner.token}` },
      });
      expect(ownerDeleteRes.statusCode).toBe(200);

      // Chat should no longer be found
      const getRes = await app.inject({
        method: "GET",
        url: `/api/v1/messenger/chats/${chatId}`,
        headers: { authorization: `Bearer ${owner.token}` },
      });
      expect(getRes.statusCode).toBe(404);
    });
  });

  describe("Message operations", () => {
    it("sends a text message", async () => {
      const user1 = await registerUser(app, "sender@test.com", "Test Org");
      const user2 = await addUserToOrg(app, "receiver@test.com", user1.orgId);

      // Create chat
      const chatRes = await app.inject({
        method: "POST",
        url: "/api/v1/messenger/chats",
        headers: { authorization: `Bearer ${user1.token}` },
        payload: {
          type: "group",
          name: "Message Test",
          memberIds: [user2.userId],
        },
      });
      const chatId = JSON.parse(chatRes.body).data.chat.id;

      // Send message
      const msgRes = await app.inject({
        method: "POST",
        url: `/api/v1/messenger/chats/${chatId}/messages`,
        headers: { authorization: `Bearer ${user1.token}` },
        payload: { content: "Hello world!" },
      });

      expect(msgRes.statusCode).toBe(201);
      const body = JSON.parse(msgRes.body);
      expect(body.data.message.contentJson).toEqual({ text: "Hello world!" });
      expect(body.data.message.type).toBe("text");
      expect(body.data.message.senderId).toBe(user1.userId);
    });

    it("gets messages with pagination", async () => {
      const user = await registerUser(app, "paginate@test.com", "Test Org");
      const other = await addUserToOrg(app, "other@test.com", user.orgId);

      // Create chat
      const chatRes = await app.inject({
        method: "POST",
        url: "/api/v1/messenger/chats",
        headers: { authorization: `Bearer ${user.token}` },
        payload: {
          type: "group",
          name: "Pagination Test",
          memberIds: [other.userId],
        },
      });
      const chatId = JSON.parse(chatRes.body).data.chat.id;

      // Send 5 messages
      for (let i = 1; i <= 5; i++) {
        await app.inject({
          method: "POST",
          url: `/api/v1/messenger/chats/${chatId}/messages`,
          headers: { authorization: `Bearer ${user.token}` },
          payload: { content: `Message ${i}` },
        });
      }

      // Get messages with limit
      const msgRes = await app.inject({
        method: "GET",
        url: `/api/v1/messenger/chats/${chatId}/messages?limit=3`,
        headers: { authorization: `Bearer ${user.token}` },
      });

      expect(msgRes.statusCode).toBe(200);
      const body = JSON.parse(msgRes.body);
      expect(body.data.messages).toHaveLength(3);
      // Most recent first
      expect(body.data.messages[0].contentJson.text).toBe("Message 5");
    });

    it("edits a message within constraints", async () => {
      const user = await registerUser(app, "editor@test.com", "Test Org");
      const other = await addUserToOrg(app, "other@test.com", user.orgId);

      // Create chat and send message
      const chatRes = await app.inject({
        method: "POST",
        url: "/api/v1/messenger/chats",
        headers: { authorization: `Bearer ${user.token}` },
        payload: {
          type: "group",
          name: "Edit Test",
          memberIds: [other.userId],
        },
      });
      const chatId = JSON.parse(chatRes.body).data.chat.id;

      const msgRes = await app.inject({
        method: "POST",
        url: `/api/v1/messenger/chats/${chatId}/messages`,
        headers: { authorization: `Bearer ${user.token}` },
        payload: { content: "Original" },
      });
      const messageId = JSON.parse(msgRes.body).data.message.id;

      // Edit message
      const editRes = await app.inject({
        method: "PATCH",
        url: `/api/v1/messenger/messages/${messageId}`,
        headers: { authorization: `Bearer ${user.token}` },
        payload: { content: "Edited" },
      });

      expect(editRes.statusCode).toBe(200);
      const body = JSON.parse(editRes.body);
      expect(body.data.message.contentJson.text).toBe("Edited");
      expect(body.data.message.editCount).toBe(1);
      expect(body.data.message.editedAt).toBeDefined();
    });

    it("prevents editing other user's message", async () => {
      const user1 = await registerUser(app, "sender@test.com", "Test Org");
      const user2 = await addUserToOrg(app, "attacker@test.com", user1.orgId);

      // Create chat
      const chatRes = await app.inject({
        method: "POST",
        url: "/api/v1/messenger/chats",
        headers: { authorization: `Bearer ${user1.token}` },
        payload: {
          type: "group",
          name: "Edit Test",
          memberIds: [user2.userId],
        },
      });
      const chatId = JSON.parse(chatRes.body).data.chat.id;

      // User1 sends message
      const msgRes = await app.inject({
        method: "POST",
        url: `/api/v1/messenger/chats/${chatId}/messages`,
        headers: { authorization: `Bearer ${user1.token}` },
        payload: { content: "User1's message" },
      });
      const messageId = JSON.parse(msgRes.body).data.message.id;

      // User2 tries to edit User1's message
      const editRes = await app.inject({
        method: "PATCH",
        url: `/api/v1/messenger/messages/${messageId}`,
        headers: { authorization: `Bearer ${user2.token}` },
        payload: { content: "Hacked!" },
      });

      expect(editRes.statusCode).toBe(403);
    });

    it("recalls a message (sender)", async () => {
      const user = await registerUser(app, "recall@test.com", "Test Org");
      const other = await addUserToOrg(app, "other@test.com", user.orgId);

      // Create chat and send message
      const chatRes = await app.inject({
        method: "POST",
        url: "/api/v1/messenger/chats",
        headers: { authorization: `Bearer ${user.token}` },
        payload: {
          type: "group",
          name: "Recall Test",
          memberIds: [other.userId],
        },
      });
      const chatId = JSON.parse(chatRes.body).data.chat.id;

      const msgRes = await app.inject({
        method: "POST",
        url: `/api/v1/messenger/chats/${chatId}/messages`,
        headers: { authorization: `Bearer ${user.token}` },
        payload: { content: "To be recalled" },
      });
      const messageId = JSON.parse(msgRes.body).data.message.id;

      // Recall message
      const recallRes = await app.inject({
        method: "DELETE",
        url: `/api/v1/messenger/messages/${messageId}`,
        headers: { authorization: `Bearer ${user.token}` },
      });

      expect(recallRes.statusCode).toBe(200);

      // Verify message is recalled
      const getRes = await app.inject({
        method: "GET",
        url: `/api/v1/messenger/messages/${messageId}`,
        headers: { authorization: `Bearer ${user.token}` },
      });
      const body = JSON.parse(getRes.body);
      expect(body.data.message.recalledAt).toBeDefined();
    });
  });

  describe("Member operations", () => {
    it("adds a member to a chat", async () => {
      const owner = await registerUser(app, "owner@test.com", "Test Org");
      const member1 = await addUserToOrg(app, "member1@test.com", owner.orgId);
      const member2 = await addUserToOrg(app, "member2@test.com", owner.orgId);

      // Create chat with member1
      const chatRes = await app.inject({
        method: "POST",
        url: "/api/v1/messenger/chats",
        headers: { authorization: `Bearer ${owner.token}` },
        payload: {
          type: "group",
          name: "Member Test",
          memberIds: [member1.userId],
        },
      });
      const chatId = JSON.parse(chatRes.body).data.chat.id;

      // Add member2
      const addRes = await app.inject({
        method: "POST",
        url: `/api/v1/messenger/chats/${chatId}/members`,
        headers: { authorization: `Bearer ${owner.token}` },
        payload: { userId: member2.userId },
      });

      expect(addRes.statusCode).toBe(201);
      expect(JSON.parse(addRes.body).data.member.userId).toBe(member2.userId);

      // Verify member count
      const membersRes = await app.inject({
        method: "GET",
        url: `/api/v1/messenger/chats/${chatId}/members`,
        headers: { authorization: `Bearer ${owner.token}` },
      });
      expect(JSON.parse(membersRes.body).data.members).toHaveLength(3);
    });

    it("prevents non-admin from adding members", async () => {
      const owner = await registerUser(app, "owner@test.com", "Test Org");
      const member = await addUserToOrg(app, "member@test.com", owner.orgId);
      const outsider = await addUserToOrg(app, "outsider@test.com", owner.orgId);

      // Create chat
      const chatRes = await app.inject({
        method: "POST",
        url: "/api/v1/messenger/chats",
        headers: { authorization: `Bearer ${owner.token}` },
        payload: {
          type: "group",
          name: "Restricted",
          memberIds: [member.userId],
        },
      });
      const chatId = JSON.parse(chatRes.body).data.chat.id;

      // Member tries to add outsider
      const addRes = await app.inject({
        method: "POST",
        url: `/api/v1/messenger/chats/${chatId}/members`,
        headers: { authorization: `Bearer ${member.token}` },
        payload: { userId: outsider.userId },
      });

      expect(addRes.statusCode).toBe(403);
    });

    it("allows user to leave chat", async () => {
      const owner = await registerUser(app, "owner@test.com", "Test Org");
      const member = await addUserToOrg(app, "member@test.com", owner.orgId);

      // Create chat
      const chatRes = await app.inject({
        method: "POST",
        url: "/api/v1/messenger/chats",
        headers: { authorization: `Bearer ${owner.token}` },
        payload: {
          type: "group",
          name: "Leave Test",
          memberIds: [member.userId],
        },
      });
      const chatId = JSON.parse(chatRes.body).data.chat.id;

      // Member leaves
      const leaveRes = await app.inject({
        method: "DELETE",
        url: `/api/v1/messenger/chats/${chatId}/members/${member.userId}`,
        headers: { authorization: `Bearer ${member.token}` },
      });

      expect(leaveRes.statusCode).toBe(200);

      // Member can no longer access chat
      const getRes = await app.inject({
        method: "GET",
        url: `/api/v1/messenger/chats/${chatId}`,
        headers: { authorization: `Bearer ${member.token}` },
      });
      expect(getRes.statusCode).toBe(403);
    });
  });

  describe("Reactions and read receipts", () => {
    it("adds and removes reactions", async () => {
      const user1 = await registerUser(app, "reactor@test.com", "Test Org");
      const user2 = await addUserToOrg(app, "other@test.com", user1.orgId);

      // Create chat and message
      const chatRes = await app.inject({
        method: "POST",
        url: "/api/v1/messenger/chats",
        headers: { authorization: `Bearer ${user1.token}` },
        payload: {
          type: "group",
          name: "Reaction Test",
          memberIds: [user2.userId],
        },
      });
      const chatId = JSON.parse(chatRes.body).data.chat.id;

      const msgRes = await app.inject({
        method: "POST",
        url: `/api/v1/messenger/chats/${chatId}/messages`,
        headers: { authorization: `Bearer ${user1.token}` },
        payload: { content: "React to me!" },
      });
      const messageId = JSON.parse(msgRes.body).data.message.id;

      // Add reaction
      const addRes = await app.inject({
        method: "POST",
        url: `/api/v1/messenger/messages/${messageId}/reactions`,
        headers: { authorization: `Bearer ${user2.token}` },
        payload: { emoji: "👍" },
      });
      expect(addRes.statusCode).toBe(201);

      // Get reactions
      const getRes = await app.inject({
        method: "GET",
        url: `/api/v1/messenger/messages/${messageId}/reactions`,
        headers: { authorization: `Bearer ${user1.token}` },
      });
      const reactions = JSON.parse(getRes.body).data.reactions;
      expect(reactions).toHaveLength(1);
      expect(reactions[0].emoji).toBe("👍");
      expect(reactions[0].userId).toBe(user2.userId);

      // Remove reaction
      const removeRes = await app.inject({
        method: "DELETE",
        url: `/api/v1/messenger/messages/${messageId}/reactions/👍`,
        headers: { authorization: `Bearer ${user2.token}` },
      });
      expect(removeRes.statusCode).toBe(200);

      // Verify removed
      const afterRemoveRes = await app.inject({
        method: "GET",
        url: `/api/v1/messenger/messages/${messageId}/reactions`,
        headers: { authorization: `Bearer ${user1.token}` },
      });
      expect(JSON.parse(afterRemoveRes.body).data.reactions).toHaveLength(0);
    });

    it("marks message as read", async () => {
      const user1 = await registerUser(app, "sender@test.com", "Test Org");
      const user2 = await addUserToOrg(app, "reader@test.com", user1.orgId);

      // Create chat and message
      const chatRes = await app.inject({
        method: "POST",
        url: "/api/v1/messenger/chats",
        headers: { authorization: `Bearer ${user1.token}` },
        payload: {
          type: "group",
          name: "Read Test",
          memberIds: [user2.userId],
        },
      });
      const chatId = JSON.parse(chatRes.body).data.chat.id;

      const msgRes = await app.inject({
        method: "POST",
        url: `/api/v1/messenger/chats/${chatId}/messages`,
        headers: { authorization: `Bearer ${user1.token}` },
        payload: { content: "Read me!" },
      });
      const messageId = JSON.parse(msgRes.body).data.message.id;

      // Mark as read
      const readRes = await app.inject({
        method: "POST",
        url: `/api/v1/messenger/messages/${messageId}/read`,
        headers: { authorization: `Bearer ${user2.token}` },
      });
      expect(readRes.statusCode).toBe(200);

      // Get read receipts
      const receiptsRes = await app.inject({
        method: "GET",
        url: `/api/v1/messenger/messages/${messageId}/read-receipts`,
        headers: { authorization: `Bearer ${user1.token}` },
      });
      const receipts = JSON.parse(receiptsRes.body).data.receipts;
      expect(receipts).toHaveLength(1);
      expect(receipts[0].userId).toBe(user2.userId);
    });
  });

  describe("Pins and favorites", () => {
    it("pins and unpins a message (admin only)", async () => {
      const owner = await registerUser(app, "owner@test.com", "Test Org");
      const member = await addUserToOrg(app, "member@test.com", owner.orgId);

      // Create chat and message
      const chatRes = await app.inject({
        method: "POST",
        url: "/api/v1/messenger/chats",
        headers: { authorization: `Bearer ${owner.token}` },
        payload: {
          type: "group",
          name: "Pin Test",
          memberIds: [member.userId],
        },
      });
      const chatId = JSON.parse(chatRes.body).data.chat.id;

      const msgRes = await app.inject({
        method: "POST",
        url: `/api/v1/messenger/chats/${chatId}/messages`,
        headers: { authorization: `Bearer ${member.token}` },
        payload: { content: "Pin this!" },
      });
      const messageId = JSON.parse(msgRes.body).data.message.id;

      // Member cannot pin
      const memberPinRes = await app.inject({
        method: "POST",
        url: `/api/v1/messenger/chats/${chatId}/pins`,
        headers: { authorization: `Bearer ${member.token}` },
        payload: { messageId },
      });
      expect(memberPinRes.statusCode).toBe(403);

      // Owner can pin
      const ownerPinRes = await app.inject({
        method: "POST",
        url: `/api/v1/messenger/chats/${chatId}/pins`,
        headers: { authorization: `Bearer ${owner.token}` },
        payload: { messageId },
      });
      expect(ownerPinRes.statusCode).toBe(201);

      // Verify pinned
      const pinsRes = await app.inject({
        method: "GET",
        url: `/api/v1/messenger/chats/${chatId}/pins`,
        headers: { authorization: `Bearer ${member.token}` },
      });
      const pins = JSON.parse(pinsRes.body).data.pins;
      expect(pins).toHaveLength(1);
      expect(pins[0].message.id).toBe(messageId);

      // Unpin
      const unpinRes = await app.inject({
        method: "DELETE",
        url: `/api/v1/messenger/chats/${chatId}/pins/${messageId}`,
        headers: { authorization: `Bearer ${owner.token}` },
      });
      expect(unpinRes.statusCode).toBe(200);

      // Verify unpinned
      const afterUnpinRes = await app.inject({
        method: "GET",
        url: `/api/v1/messenger/chats/${chatId}/pins`,
        headers: { authorization: `Bearer ${member.token}` },
      });
      expect(JSON.parse(afterUnpinRes.body).data.pins).toHaveLength(0);
    });

    it("favorites and unfavorites a message (personal)", async () => {
      const user1 = await registerUser(app, "faver@test.com", "Test Org");
      const user2 = await addUserToOrg(app, "other@test.com", user1.orgId);

      // Create chat and message
      const chatRes = await app.inject({
        method: "POST",
        url: "/api/v1/messenger/chats",
        headers: { authorization: `Bearer ${user1.token}` },
        payload: {
          type: "group",
          name: "Fav Test",
          memberIds: [user2.userId],
        },
      });
      const chatId = JSON.parse(chatRes.body).data.chat.id;

      const msgRes = await app.inject({
        method: "POST",
        url: `/api/v1/messenger/chats/${chatId}/messages`,
        headers: { authorization: `Bearer ${user2.token}` },
        payload: { content: "Save this!" },
      });
      const messageId = JSON.parse(msgRes.body).data.message.id;

      // Favorite
      const favRes = await app.inject({
        method: "POST",
        url: `/api/v1/messenger/messages/${messageId}/favorite`,
        headers: { authorization: `Bearer ${user1.token}` },
      });
      expect(favRes.statusCode).toBe(201);

      // Get favorites (should only show user1's favorites)
      const getFavsRes = await app.inject({
        method: "GET",
        url: "/api/v1/messenger/favorites",
        headers: { authorization: `Bearer ${user1.token}` },
      });
      const favs = JSON.parse(getFavsRes.body).data.favorites;
      expect(favs).toHaveLength(1);
      expect(favs[0].message.id).toBe(messageId);

      // User2's favorites should be empty
      const user2FavsRes = await app.inject({
        method: "GET",
        url: "/api/v1/messenger/favorites",
        headers: { authorization: `Bearer ${user2.token}` },
      });
      expect(JSON.parse(user2FavsRes.body).data.favorites).toHaveLength(0);

      // Unfavorite
      const unfavRes = await app.inject({
        method: "DELETE",
        url: `/api/v1/messenger/messages/${messageId}/favorite`,
        headers: { authorization: `Bearer ${user1.token}` },
      });
      expect(unfavRes.statusCode).toBe(200);

      // Verify unfavorited
      const afterUnfavRes = await app.inject({
        method: "GET",
        url: "/api/v1/messenger/favorites",
        headers: { authorization: `Bearer ${user1.token}` },
      });
      expect(JSON.parse(afterUnfavRes.body).data.favorites).toHaveLength(0);
    });
  });

  describe("Chat tabs (FR-2.15, FR-2.16)", () => {
    it("creates and lists custom tabs (admin only)", async () => {
      const owner = await registerUser(app, "owner@test.com", "Test Org");
      const member = await addUserToOrg(app, "member@test.com", owner.orgId);

      // Create chat
      const chatRes = await app.inject({
        method: "POST",
        url: "/api/v1/messenger/chats",
        headers: { authorization: `Bearer ${owner.token}` },
        payload: {
          type: "group",
          name: "Tab Test",
          memberIds: [member.userId],
        },
      });
      const chatId = JSON.parse(chatRes.body).data.chat.id;

      // Member cannot create tab
      const memberTabRes = await app.inject({
        method: "POST",
        url: `/api/v1/messenger/chats/${chatId}/tabs`,
        headers: { authorization: `Bearer ${member.token}` },
        payload: { name: "My Tab", url: "https://example.com" },
      });
      expect(memberTabRes.statusCode).toBe(403);

      // Owner can create tab
      const ownerTabRes = await app.inject({
        method: "POST",
        url: `/api/v1/messenger/chats/${chatId}/tabs`,
        headers: { authorization: `Bearer ${owner.token}` },
        payload: { name: "Google Docs", url: "https://docs.google.com" },
      });
      expect(ownerTabRes.statusCode).toBe(201);
      const tab = JSON.parse(ownerTabRes.body).data.tab;
      expect(tab.name).toBe("Google Docs");
      expect(tab.type).toBe("custom");

      // List tabs
      const listRes = await app.inject({
        method: "GET",
        url: `/api/v1/messenger/chats/${chatId}/tabs`,
        headers: { authorization: `Bearer ${member.token}` },
      });
      expect(listRes.statusCode).toBe(200);
      const tabs = JSON.parse(listRes.body).data.tabs;
      expect(tabs).toHaveLength(1);
      expect(tabs[0].name).toBe("Google Docs");
    });

    it("updates and deletes custom tabs", async () => {
      const owner = await registerUser(app, "owner@test.com", "Test Org");
      const member = await addUserToOrg(app, "member@test.com", owner.orgId);

      // Create chat and tab
      const chatRes = await app.inject({
        method: "POST",
        url: "/api/v1/messenger/chats",
        headers: { authorization: `Bearer ${owner.token}` },
        payload: {
          type: "group",
          name: "Tab Update Test",
          memberIds: [member.userId],
        },
      });
      const chatId = JSON.parse(chatRes.body).data.chat.id;

      const createRes = await app.inject({
        method: "POST",
        url: `/api/v1/messenger/chats/${chatId}/tabs`,
        headers: { authorization: `Bearer ${owner.token}` },
        payload: { name: "Original", url: "https://original.com" },
      });
      const tabId = JSON.parse(createRes.body).data.tab.id;

      // Update tab
      const updateRes = await app.inject({
        method: "PATCH",
        url: `/api/v1/messenger/tabs/${tabId}`,
        headers: { authorization: `Bearer ${owner.token}` },
        payload: { name: "Updated", url: "https://updated.com" },
      });
      expect(updateRes.statusCode).toBe(200);
      expect(JSON.parse(updateRes.body).data.tab.name).toBe("Updated");

      // Delete tab
      const deleteRes = await app.inject({
        method: "DELETE",
        url: `/api/v1/messenger/tabs/${tabId}`,
        headers: { authorization: `Bearer ${owner.token}` },
      });
      expect(deleteRes.statusCode).toBe(200);

      // Verify deleted
      const listRes = await app.inject({
        method: "GET",
        url: `/api/v1/messenger/chats/${chatId}/tabs`,
        headers: { authorization: `Bearer ${owner.token}` },
      });
      expect(JSON.parse(listRes.body).data.tabs).toHaveLength(0);
    });
  });

  describe("Announcements (FR-2.18)", () => {
    it("creates and lists announcements (admin only)", async () => {
      const owner = await registerUser(app, "owner@test.com", "Test Org");
      const member = await addUserToOrg(app, "member@test.com", owner.orgId);

      // Create chat
      const chatRes = await app.inject({
        method: "POST",
        url: "/api/v1/messenger/chats",
        headers: { authorization: `Bearer ${owner.token}` },
        payload: {
          type: "group",
          name: "Announcement Test",
          memberIds: [member.userId],
        },
      });
      const chatId = JSON.parse(chatRes.body).data.chat.id;

      // Member cannot create announcement
      const memberAnnouncementRes = await app.inject({
        method: "POST",
        url: `/api/v1/messenger/chats/${chatId}/announcements`,
        headers: { authorization: `Bearer ${member.token}` },
        payload: { content: "Unauthorized announcement" },
      });
      expect(memberAnnouncementRes.statusCode).toBe(403);

      // Owner can create announcement
      const ownerAnnouncementRes = await app.inject({
        method: "POST",
        url: `/api/v1/messenger/chats/${chatId}/announcements`,
        headers: { authorization: `Bearer ${owner.token}` },
        payload: { content: "Important team announcement!" },
      });
      expect(ownerAnnouncementRes.statusCode).toBe(201);
      const announcement = JSON.parse(ownerAnnouncementRes.body).data.announcement;
      expect(announcement.content).toBe("Important team announcement!");
      expect(announcement.isPinned).toBe(true);

      // List announcements (any member can view)
      const listRes = await app.inject({
        method: "GET",
        url: `/api/v1/messenger/chats/${chatId}/announcements`,
        headers: { authorization: `Bearer ${member.token}` },
      });
      expect(listRes.statusCode).toBe(200);
      const announcements = JSON.parse(listRes.body).data.announcements;
      expect(announcements).toHaveLength(1);
      expect(announcements[0].content).toBe("Important team announcement!");
    });

    it("updates and deletes announcements", async () => {
      const owner = await registerUser(app, "owner@test.com", "Test Org");
      const member = await addUserToOrg(app, "member@test.com", owner.orgId);

      // Create chat and announcement
      const chatRes = await app.inject({
        method: "POST",
        url: "/api/v1/messenger/chats",
        headers: { authorization: `Bearer ${owner.token}` },
        payload: {
          type: "group",
          name: "Announcement Update Test",
          memberIds: [member.userId],
        },
      });
      const chatId = JSON.parse(chatRes.body).data.chat.id;

      const createRes = await app.inject({
        method: "POST",
        url: `/api/v1/messenger/chats/${chatId}/announcements`,
        headers: { authorization: `Bearer ${owner.token}` },
        payload: { content: "Original announcement" },
      });
      const announcementId = JSON.parse(createRes.body).data.announcement.id;

      // Update announcement
      const updateRes = await app.inject({
        method: "PATCH",
        url: `/api/v1/messenger/announcements/${announcementId}`,
        headers: { authorization: `Bearer ${owner.token}` },
        payload: { content: "Updated announcement", isPinned: false },
      });
      expect(updateRes.statusCode).toBe(200);
      const updated = JSON.parse(updateRes.body).data.announcement;
      expect(updated.content).toBe("Updated announcement");
      expect(updated.isPinned).toBe(false);

      // Delete announcement
      const deleteRes = await app.inject({
        method: "DELETE",
        url: `/api/v1/messenger/announcements/${announcementId}`,
        headers: { authorization: `Bearer ${owner.token}` },
      });
      expect(deleteRes.statusCode).toBe(200);

      // Verify deleted
      const listRes = await app.inject({
        method: "GET",
        url: `/api/v1/messenger/chats/${chatId}/announcements`,
        headers: { authorization: `Bearer ${owner.token}` },
      });
      expect(JSON.parse(listRes.body).data.announcements).toHaveLength(0);
    });

    it("allows author to update their own announcement", async () => {
      const owner = await registerUser(app, "owner@test.com", "Test Org");
      const admin = await addUserToOrg(app, "admin@test.com", owner.orgId);

      // Create chat
      const chatRes = await app.inject({
        method: "POST",
        url: "/api/v1/messenger/chats",
        headers: { authorization: `Bearer ${owner.token}` },
        payload: {
          type: "group",
          name: "Author Test",
          memberIds: [admin.userId],
        },
      });
      const chatId = JSON.parse(chatRes.body).data.chat.id;

      // Promote admin
      await app.inject({
        method: "PATCH",
        url: `/api/v1/messenger/chats/${chatId}/members/${admin.userId}`,
        headers: { authorization: `Bearer ${owner.token}` },
        payload: { role: "admin" },
      });

      // Admin creates announcement
      const createRes = await app.inject({
        method: "POST",
        url: `/api/v1/messenger/chats/${chatId}/announcements`,
        headers: { authorization: `Bearer ${admin.token}` },
        payload: { content: "Admin's announcement" },
      });
      const announcementId = JSON.parse(createRes.body).data.announcement.id;

      // Admin can update their own announcement
      const updateRes = await app.inject({
        method: "PATCH",
        url: `/api/v1/messenger/announcements/${announcementId}`,
        headers: { authorization: `Bearer ${admin.token}` },
        payload: { content: "Updated by author" },
      });
      expect(updateRes.statusCode).toBe(200);
      expect(JSON.parse(updateRes.body).data.announcement.content).toBe("Updated by author");
    });
  });

  describe("Access control", () => {
    it("prevents non-members from accessing chat messages", async () => {
      const owner = await registerUser(app, "owner@test.com", "Test Org");
      const member = await addUserToOrg(app, "member@test.com", owner.orgId);
      const outsider = await addUserToOrg(app, "outsider@test.com", owner.orgId);

      // Create chat without outsider
      const chatRes = await app.inject({
        method: "POST",
        url: "/api/v1/messenger/chats",
        headers: { authorization: `Bearer ${owner.token}` },
        payload: {
          type: "group",
          name: "Private Chat",
          memberIds: [member.userId],
        },
      });
      const chatId = JSON.parse(chatRes.body).data.chat.id;

      // Send a message
      await app.inject({
        method: "POST",
        url: `/api/v1/messenger/chats/${chatId}/messages`,
        headers: { authorization: `Bearer ${owner.token}` },
        payload: { content: "Secret message" },
      });

      // Outsider cannot see messages
      const msgRes = await app.inject({
        method: "GET",
        url: `/api/v1/messenger/chats/${chatId}/messages`,
        headers: { authorization: `Bearer ${outsider.token}` },
      });
      expect(msgRes.statusCode).toBe(403);
    });

    it("prevents non-members from sending messages", async () => {
      const owner = await registerUser(app, "owner@test.com", "Test Org");
      const member = await addUserToOrg(app, "member@test.com", owner.orgId);
      const outsider = await addUserToOrg(app, "outsider@test.com", owner.orgId);

      // Create chat without outsider
      const chatRes = await app.inject({
        method: "POST",
        url: "/api/v1/messenger/chats",
        headers: { authorization: `Bearer ${owner.token}` },
        payload: {
          type: "group",
          name: "Private Chat",
          memberIds: [member.userId],
        },
      });
      const chatId = JSON.parse(chatRes.body).data.chat.id;

      // Outsider cannot send messages
      const msgRes = await app.inject({
        method: "POST",
        url: `/api/v1/messenger/chats/${chatId}/messages`,
        headers: { authorization: `Bearer ${outsider.token}` },
        payload: { content: "Sneaky message" },
      });
      expect(msgRes.statusCode).toBe(403);
    });
  });
});
