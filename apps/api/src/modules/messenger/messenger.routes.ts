import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { messengerService } from "./messenger.service.js";
import {
  createChatSchema,
  updateChatSchema,
  addMemberSchema,
  updateMemberSchema,
  sendMessageSchema,
  editMessageSchema,
  reactionSchema,
  paginationSchema,
  pinMessageSchema,
  createChatTabSchema,
  updateChatTabSchema,
  createAnnouncementSchema,
  updateAnnouncementSchema,
} from "./messenger.schemas.js";
import { authenticate } from "../auth/middleware.js";
import { formatZodError } from "../../utils/validation.js";
import { publishMessageEvent, notifyUserJoinedChat } from "./websocket.js";

export async function messengerRoutes(app: FastifyInstance) {
  // All messenger routes require authentication
  app.addHook("preHandler", authenticate);

  // ============ CHAT ENDPOINTS ============

  // GET /messenger/chats - List user's chats
  app.get("/chats", async (req, reply) => {
    const chats = await messengerService.getUserChats(
      req.user!.id,
      req.user!.orgId
    );
    return reply.send({ data: { chats } });
  });

  // POST /messenger/chats - Create a new chat
  app.post("/chats", async (req, reply) => {
    try {
      const input = createChatSchema.parse(req.body);
      const result = await messengerService.createChat(
        input,
        req.user!.id,
        req.user!.orgId
      );

      // Notify all members about the new chat (excluding the creator)
      for (const memberId of input.memberIds) {
        await notifyUserJoinedChat(result.chat.id, memberId);
      }

      return reply.status(201).send({ data: result });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /messenger/chats/:chatId - Get chat details
  app.get<{ Params: { chatId: string } }>(
    "/chats/:chatId",
    async (req, reply) => {
      const chat = await messengerService.getChatById(req.params.chatId);
      if (!chat) {
        return reply.status(404).send({
          code: "CHAT_NOT_FOUND",
          message: "Chat not found",
        });
      }

      // Verify user is a member
      const isMember = await messengerService.isChatMember(
        chat.id,
        req.user!.id
      );
      if (!isMember) {
        return reply.status(403).send({
          code: "NOT_A_MEMBER",
          message: "You are not a member of this chat",
        });
      }

      const members = await messengerService.getChatMembers(chat.id);
      return reply.send({ data: { chat, members } });
    }
  );

  // PATCH /messenger/chats/:chatId - Update chat settings
  app.patch<{ Params: { chatId: string } }>(
    "/chats/:chatId",
    async (req, reply) => {
      try {
        const input = updateChatSchema.parse(req.body);
        const chat = await messengerService.updateChat(
          req.params.chatId,
          input,
          req.user!.id
        );

        if (!chat) {
          return reply.status(403).send({
            code: "FORBIDDEN",
            message: "You do not have permission to update this chat",
          });
        }

        return reply.send({ data: { chat } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // DELETE /messenger/chats/:chatId - Delete a chat
  app.delete<{ Params: { chatId: string } }>(
    "/chats/:chatId",
    async (req, reply) => {
      const deleted = await messengerService.deleteChat(
        req.params.chatId,
        req.user!.id
      );

      if (!deleted) {
        return reply.status(403).send({
          code: "FORBIDDEN",
          message: "You do not have permission to delete this chat",
        });
      }

      return reply.send({ data: { success: true } });
    }
  );

  // ============ MEMBER ENDPOINTS ============

  // GET /messenger/chats/:chatId/members - List chat members
  app.get<{ Params: { chatId: string } }>(
    "/chats/:chatId/members",
    async (req, reply) => {
      const isMember = await messengerService.isChatMember(
        req.params.chatId,
        req.user!.id
      );
      if (!isMember) {
        return reply.status(403).send({
          code: "NOT_A_MEMBER",
          message: "You are not a member of this chat",
        });
      }

      const members = await messengerService.getChatMembersWithUserInfo(req.params.chatId);
      return reply.send({ data: { members } });
    }
  );

  // POST /messenger/chats/:chatId/members - Add a member
  app.post<{ Params: { chatId: string } }>(
    "/chats/:chatId/members",
    async (req, reply) => {
      try {
        const input = addMemberSchema.parse(req.body);
        const member = await messengerService.addMember(
          req.params.chatId,
          input,
          req.user!.id
        );

        if (!member) {
          return reply.status(403).send({
            code: "FORBIDDEN",
            message: "You do not have permission to add members",
          });
        }

        // Notify the new member via WebSocket
        await notifyUserJoinedChat(req.params.chatId, input.userId);

        return reply.status(201).send({ data: { member } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        if (error instanceof Error && error.message.includes("maximum")) {
          return reply.status(400).send({
            code: "MAX_MEMBERS_REACHED",
            message: error.message,
          });
        }
        throw error;
      }
    }
  );

  // PATCH /messenger/chats/:chatId/members/:userId - Update member settings
  app.patch<{ Params: { chatId: string; userId: string } }>(
    "/chats/:chatId/members/:userId",
    async (req, reply) => {
      try {
        const input = updateMemberSchema.parse(req.body);
        const member = await messengerService.updateMember(
          req.params.chatId,
          req.params.userId,
          input,
          req.user!.id
        );

        if (!member) {
          return reply.status(403).send({
            code: "FORBIDDEN",
            message: "You do not have permission to update this member",
          });
        }

        return reply.send({ data: { member } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // DELETE /messenger/chats/:chatId/members/:userId - Remove member
  app.delete<{ Params: { chatId: string; userId: string } }>(
    "/chats/:chatId/members/:userId",
    async (req, reply) => {
      const removed = await messengerService.removeMember(
        req.params.chatId,
        req.params.userId,
        req.user!.id
      );

      if (!removed) {
        return reply.status(403).send({
          code: "FORBIDDEN",
          message: "You do not have permission to remove this member",
        });
      }

      return reply.send({ data: { success: true } });
    }
  );

  // ============ MESSAGE ENDPOINTS ============

  // GET /messenger/chats/:chatId/messages - Get messages
  app.get<{ Params: { chatId: string }; Querystring: Record<string, unknown> }>(
    "/chats/:chatId/messages",
    async (req, reply) => {
      const isMember = await messengerService.isChatMember(
        req.params.chatId,
        req.user!.id
      );
      if (!isMember) {
        return reply.status(403).send({
          code: "NOT_A_MEMBER",
          message: "You are not a member of this chat",
        });
      }

      try {
        const pagination = paginationSchema.parse(req.query);
        const messages = await messengerService.getMessages(
          req.params.chatId,
          pagination
        );
        return reply.send({ data: { messages } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // POST /messenger/chats/:chatId/messages - Send a message
  app.post<{ Params: { chatId: string } }>(
    "/chats/:chatId/messages",
    async (req, reply) => {
      try {
        const input = sendMessageSchema.parse(req.body);
        const message = await messengerService.sendMessage(
          req.params.chatId,
          input,
          req.user!.id
        );

        if (!message) {
          return reply.status(403).send({
            code: "NOT_A_MEMBER",
            message: "You are not a member of this chat",
          });
        }

        // Publish real-time event
        await publishMessageEvent(req.params.chatId, {
          type: "message:new",
          chatId: req.params.chatId,
          message,
        });

        return reply.status(201).send({ data: { message } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // GET /messenger/messages/:messageId - Get a single message
  app.get<{ Params: { messageId: string } }>(
    "/messages/:messageId",
    async (req, reply) => {
      const message = await messengerService.getMessageById(
        req.params.messageId
      );
      if (!message) {
        return reply.status(404).send({
          code: "MESSAGE_NOT_FOUND",
          message: "Message not found",
        });
      }

      const isMember = await messengerService.isChatMember(
        message.chatId,
        req.user!.id
      );
      if (!isMember) {
        return reply.status(403).send({
          code: "NOT_A_MEMBER",
          message: "You are not a member of this chat",
        });
      }

      return reply.send({ data: { message } });
    }
  );

  // PATCH /messenger/messages/:messageId - Edit a message
  app.patch<{ Params: { messageId: string } }>(
    "/messages/:messageId",
    async (req, reply) => {
      try {
        const input = editMessageSchema.parse(req.body);
        const message = await messengerService.editMessage(
          req.params.messageId,
          input,
          req.user!.id
        );

        if (!message) {
          return reply.status(403).send({
            code: "FORBIDDEN",
            message: "You cannot edit this message",
          });
        }

        // Publish real-time event
        await publishMessageEvent(message.chatId, {
          type: "message:edited",
          chatId: message.chatId,
          messageId: message.id,
          message,
        });

        return reply.send({ data: { message } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        if (
          error instanceof Error &&
          (error.message.includes("24 hours") ||
            error.message.includes("Maximum edit"))
        ) {
          return reply.status(400).send({
            code: "EDIT_NOT_ALLOWED",
            message: error.message,
          });
        }
        throw error;
      }
    }
  );

  // DELETE /messenger/messages/:messageId - Recall (unsend) a message
  app.delete<{ Params: { messageId: string } }>(
    "/messages/:messageId",
    async (req, reply) => {
      const message = await messengerService.getMessageById(
        req.params.messageId
      );
      if (!message) {
        return reply.status(404).send({
          code: "MESSAGE_NOT_FOUND",
          message: "Message not found",
        });
      }

      try {
        const recalled = await messengerService.recallMessage(
          req.params.messageId,
          req.user!.id,
          message.chatId
        );

        if (!recalled) {
          return reply.status(403).send({
            code: "FORBIDDEN",
            message: "You cannot recall this message",
          });
        }

        // Publish real-time event
        await publishMessageEvent(message.chatId, {
          type: "message:recalled",
          chatId: message.chatId,
          messageId: message.id,
        });

        return reply.send({ data: { success: true } });
      } catch (error) {
        if (error instanceof Error && error.message.includes("24 hours")) {
          return reply.status(400).send({
            code: "RECALL_NOT_ALLOWED",
            message: error.message,
          });
        }
        throw error;
      }
    }
  );

  // ============ REACTION ENDPOINTS ============

  // POST /messenger/messages/:messageId/reactions - Add reaction
  app.post<{ Params: { messageId: string } }>(
    "/messages/:messageId/reactions",
    async (req, reply) => {
      try {
        const input = reactionSchema.parse(req.body);
        const added = await messengerService.addReaction(
          req.params.messageId,
          input.emoji,
          req.user!.id
        );

        if (!added) {
          return reply.status(400).send({
            code: "REACTION_FAILED",
            message: "Could not add reaction",
          });
        }

        return reply.status(201).send({ data: { success: true } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // DELETE /messenger/messages/:messageId/reactions/:emoji - Remove reaction
  app.delete<{ Params: { messageId: string; emoji: string } }>(
    "/messages/:messageId/reactions/:emoji",
    async (req, reply) => {
      const removed = await messengerService.removeReaction(
        req.params.messageId,
        req.params.emoji,
        req.user!.id
      );

      if (!removed) {
        return reply.status(404).send({
          code: "REACTION_NOT_FOUND",
          message: "Reaction not found",
        });
      }

      return reply.send({ data: { success: true } });
    }
  );

  // GET /messenger/messages/:messageId/reactions - Get reactions
  app.get<{ Params: { messageId: string } }>(
    "/messages/:messageId/reactions",
    async (req, reply) => {
      const message = await messengerService.getMessageById(
        req.params.messageId
      );
      if (!message) {
        return reply.status(404).send({
          code: "MESSAGE_NOT_FOUND",
          message: "Message not found",
        });
      }

      const isMember = await messengerService.isChatMember(
        message.chatId,
        req.user!.id
      );
      if (!isMember) {
        return reply.status(403).send({
          code: "NOT_A_MEMBER",
          message: "You are not a member of this chat",
        });
      }

      const reactions = await messengerService.getMessageReactions(
        req.params.messageId
      );
      return reply.send({ data: { reactions } });
    }
  );

  // ============ READ RECEIPT ENDPOINTS ============

  // POST /messenger/messages/:messageId/read - Mark as read
  app.post<{ Params: { messageId: string } }>(
    "/messages/:messageId/read",
    async (req, reply) => {
      const marked = await messengerService.markAsRead(
        req.params.messageId,
        req.user!.id
      );

      // Always return success (idempotent operation)
      return reply.send({ data: { success: true, alreadyRead: !marked } });
    }
  );

  // GET /messenger/messages/:messageId/read-receipts - Get read receipts
  app.get<{ Params: { messageId: string } }>(
    "/messages/:messageId/read-receipts",
    async (req, reply) => {
      const message = await messengerService.getMessageById(
        req.params.messageId
      );
      if (!message) {
        return reply.status(404).send({
          code: "MESSAGE_NOT_FOUND",
          message: "Message not found",
        });
      }

      const isMember = await messengerService.isChatMember(
        message.chatId,
        req.user!.id
      );
      if (!isMember) {
        return reply.status(403).send({
          code: "NOT_A_MEMBER",
          message: "You are not a member of this chat",
        });
      }

      const receipts = await messengerService.getReadReceipts(
        req.params.messageId
      );
      return reply.send({ data: { receipts } });
    }
  );

  // ============ PIN ENDPOINTS ============

  // GET /messenger/chats/:chatId/pins - Get pinned messages
  app.get<{ Params: { chatId: string } }>(
    "/chats/:chatId/pins",
    async (req, reply) => {
      const isMember = await messengerService.isChatMember(
        req.params.chatId,
        req.user!.id
      );
      if (!isMember) {
        return reply.status(403).send({
          code: "NOT_A_MEMBER",
          message: "You are not a member of this chat",
        });
      }

      const pins = await messengerService.getPinnedMessages(req.params.chatId);
      return reply.send({ data: { pins } });
    }
  );

  // POST /messenger/chats/:chatId/pins - Pin a message
  app.post<{ Params: { chatId: string } }>(
    "/chats/:chatId/pins",
    async (req, reply) => {
      try {
        const input = pinMessageSchema.parse(req.body);
        const pinned = await messengerService.pinMessage(
          req.params.chatId,
          input.messageId,
          req.user!.id
        );

        if (!pinned) {
          return reply.status(403).send({
            code: "FORBIDDEN",
            message: "You do not have permission to pin messages",
          });
        }

        return reply.status(201).send({ data: { success: true } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // DELETE /messenger/chats/:chatId/pins/:messageId - Unpin a message
  app.delete<{ Params: { chatId: string; messageId: string } }>(
    "/chats/:chatId/pins/:messageId",
    async (req, reply) => {
      const unpinned = await messengerService.unpinMessage(
        req.params.chatId,
        req.params.messageId,
        req.user!.id
      );

      if (!unpinned) {
        return reply.status(403).send({
          code: "FORBIDDEN",
          message: "You do not have permission to unpin messages",
        });
      }

      return reply.send({ data: { success: true } });
    }
  );

  // ============ FAVORITES ENDPOINTS ============

  // GET /messenger/favorites - Get user's favorites
  app.get("/favorites", async (req, reply) => {
    const favorites = await messengerService.getUserFavorites(req.user!.id);
    return reply.send({ data: { favorites } });
  });

  // POST /messenger/messages/:messageId/favorite - Favorite a message
  app.post<{ Params: { messageId: string } }>(
    "/messages/:messageId/favorite",
    async (req, reply) => {
      const added = await messengerService.favoriteMessage(
        req.params.messageId,
        req.user!.id
      );

      if (!added) {
        return reply.status(400).send({
          code: "FAVORITE_FAILED",
          message: "Could not favorite message",
        });
      }

      return reply.status(201).send({ data: { success: true } });
    }
  );

  // DELETE /messenger/messages/:messageId/favorite - Unfavorite a message
  app.delete<{ Params: { messageId: string } }>(
    "/messages/:messageId/favorite",
    async (req, reply) => {
      const removed = await messengerService.unfavoriteMessage(
        req.params.messageId,
        req.user!.id
      );

      if (!removed) {
        return reply.status(404).send({
          code: "FAVORITE_NOT_FOUND",
          message: "Message not in favorites",
        });
      }

      return reply.send({ data: { success: true } });
    }
  );

  // ============ CHAT TAB ENDPOINTS (FR-2.15, FR-2.16) ============

  // GET /messenger/chats/:chatId/tabs - Get chat tabs
  app.get<{ Params: { chatId: string } }>(
    "/chats/:chatId/tabs",
    async (req, reply) => {
      const isMember = await messengerService.isChatMember(
        req.params.chatId,
        req.user!.id
      );
      if (!isMember) {
        return reply.status(403).send({
          code: "NOT_A_MEMBER",
          message: "You are not a member of this chat",
        });
      }

      const tabs = await messengerService.getChatTabs(req.params.chatId);
      return reply.send({ data: { tabs } });
    }
  );

  // POST /messenger/chats/:chatId/tabs - Create a custom tab
  app.post<{ Params: { chatId: string } }>(
    "/chats/:chatId/tabs",
    async (req, reply) => {
      try {
        const input = createChatTabSchema.parse(req.body);
        const tab = await messengerService.createChatTab(
          req.params.chatId,
          input,
          req.user!.id
        );

        if (!tab) {
          return reply.status(403).send({
            code: "FORBIDDEN",
            message: "You do not have permission to create tabs",
          });
        }

        return reply.status(201).send({ data: { tab } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        if (error instanceof Error && error.message.includes("Maximum")) {
          return reply.status(400).send({
            code: "MAX_TABS_REACHED",
            message: error.message,
          });
        }
        throw error;
      }
    }
  );

  // PATCH /messenger/tabs/:tabId - Update a tab
  app.patch<{ Params: { tabId: string } }>(
    "/tabs/:tabId",
    async (req, reply) => {
      try {
        const input = updateChatTabSchema.parse(req.body);
        const tab = await messengerService.updateChatTab(
          req.params.tabId,
          input,
          req.user!.id
        );

        if (!tab) {
          return reply.status(403).send({
            code: "FORBIDDEN",
            message: "You cannot update this tab",
          });
        }

        return reply.send({ data: { tab } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // DELETE /messenger/tabs/:tabId - Delete a tab
  app.delete<{ Params: { tabId: string } }>(
    "/tabs/:tabId",
    async (req, reply) => {
      const deleted = await messengerService.deleteChatTab(
        req.params.tabId,
        req.user!.id
      );

      if (!deleted) {
        return reply.status(403).send({
          code: "FORBIDDEN",
          message: "You cannot delete this tab",
        });
      }

      return reply.send({ data: { success: true } });
    }
  );

  // ============ ANNOUNCEMENT ENDPOINTS (FR-2.18) ============

  // GET /messenger/chats/:chatId/announcements - Get announcements
  app.get<{ Params: { chatId: string } }>(
    "/chats/:chatId/announcements",
    async (req, reply) => {
      const isMember = await messengerService.isChatMember(
        req.params.chatId,
        req.user!.id
      );
      if (!isMember) {
        return reply.status(403).send({
          code: "NOT_A_MEMBER",
          message: "You are not a member of this chat",
        });
      }

      const announcements = await messengerService.getAnnouncements(
        req.params.chatId
      );
      return reply.send({ data: { announcements } });
    }
  );

  // POST /messenger/chats/:chatId/announcements - Create an announcement
  app.post<{ Params: { chatId: string } }>(
    "/chats/:chatId/announcements",
    async (req, reply) => {
      try {
        const input = createAnnouncementSchema.parse(req.body);
        const announcement = await messengerService.createAnnouncement(
          req.params.chatId,
          input,
          req.user!.id
        );

        if (!announcement) {
          return reply.status(403).send({
            code: "FORBIDDEN",
            message: "You do not have permission to create announcements",
          });
        }

        return reply.status(201).send({ data: { announcement } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // PATCH /messenger/announcements/:announcementId - Update an announcement
  app.patch<{ Params: { announcementId: string } }>(
    "/announcements/:announcementId",
    async (req, reply) => {
      try {
        const input = updateAnnouncementSchema.parse(req.body);
        const announcement = await messengerService.updateAnnouncement(
          req.params.announcementId,
          input,
          req.user!.id
        );

        if (!announcement) {
          return reply.status(403).send({
            code: "FORBIDDEN",
            message: "You cannot update this announcement",
          });
        }

        return reply.send({ data: { announcement } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // DELETE /messenger/announcements/:announcementId - Delete an announcement
  app.delete<{ Params: { announcementId: string } }>(
    "/announcements/:announcementId",
    async (req, reply) => {
      const deleted = await messengerService.deleteAnnouncement(
        req.params.announcementId,
        req.user!.id
      );

      if (!deleted) {
        return reply.status(403).send({
          code: "FORBIDDEN",
          message: "You cannot delete this announcement",
        });
      }

      return reply.send({ data: { success: true } });
    }
  );
}
