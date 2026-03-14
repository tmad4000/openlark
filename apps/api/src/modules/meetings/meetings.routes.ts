import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { meetingsService } from "./meetings.service.js";
import { createMeetingSchema, startMeetingFromChatSchema } from "./meetings.schemas.js";
import { authenticate } from "../auth/middleware.js";
import { formatZodError } from "../../utils/validation.js";
import { messengerService } from "../messenger/messenger.service.js";
import { publishMessageEvent } from "../messenger/websocket.js";

// LiveKit recording webhook — no auth (verified by LiveKit signature in production)
export async function meetingsWebhookRoutes(app: FastifyInstance) {
  app.post("/livekit/recording", async (req, reply) => {
    const body = req.body as {
      event?: string;
      egressInfo?: {
        roomName?: string;
        fileResults?: Array<{
          filename?: string;
          duration?: number;
          size?: number;
        }>;
      };
    };

    if (body.event !== "egress_ended" || !body.egressInfo) {
      return reply.status(200).send({ ok: true });
    }

    const { roomName, fileResults } = body.egressInfo;
    if (!roomName || !fileResults?.length) {
      return reply.status(200).send({ ok: true });
    }

    // Find meeting by room ID
    const meeting = await meetingsService.getMeetingByRoomId(roomName);
    if (!meeting) {
      return reply.status(200).send({ ok: true, skipped: "meeting_not_found" });
    }

    const file = fileResults[0]!;
    await meetingsService.handleRecordingComplete(
      meeting.id,
      file.filename ?? roomName,
      file.duration ? Math.round(file.duration) : undefined,
      file.size ? Number(file.size) : undefined
    );

    return reply.status(200).send({ ok: true });
  });
}

export async function meetingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // POST /meetings/from-chat - Start a meeting from a chat
  app.post("/from-chat", async (req, reply) => {
    try {
      const input = startMeetingFromChatSchema.parse(req.body);
      const chatId = input.chatId;

      // Get chat members to add as participants
      const members = await messengerService.getChatMembers(chatId);

      // Create the meeting
      const title = input.title || "Meeting";
      const result = await meetingsService.createMeeting(
        { title, type: "instant" },
        req.user!.id,
        req.user!.orgId,
        req.user!.email
      );

      const meeting = result.meeting!;

      // Add all other chat members as meeting participants
      for (const member of members) {
        if (member.userId !== req.user!.id) {
          await meetingsService.addParticipant(
            meeting.id,
            member.userId
          );
        }
      }

      // Post a system message in the chat with meeting info
      const systemMessage = await messengerService.sendCardMessage(
        chatId,
        req.user!.id,
        {
          cardType: "meeting",
          meetingId: meeting.id,
          title,
          hostId: req.user!.id,
          status: "active",
          text: `Meeting started: ${title}`,
        },
        "system"
      );

      // Broadcast the system message via WebSocket
      await publishMessageEvent(chatId, {
        type: "new_message",
        chatId,
        message: systemMessage,
      });

      return reply.status(201).send({
        data: {
          meeting,
          token: result.token,
          systemMessage,
        },
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // POST /meetings - Create a meeting and get join token
  app.post("/", async (req, reply) => {
    try {
      const input = createMeetingSchema.parse(req.body);
      const result = await meetingsService.createMeeting(
        input,
        req.user!.id,
        req.user!.orgId,
        req.user!.email
      );
      return reply.status(201).send({ data: result });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /meetings/:id - Get meeting details
  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const meeting = await meetingsService.getMeeting(req.params.id);
    if (!meeting) {
      return reply.status(404).send({
        code: "MEETING_NOT_FOUND",
        message: "Meeting not found",
      });
    }
    return reply.send({ data: { meeting } });
  });

  // GET /meetings/:id/join - Join a meeting and get access token
  app.get<{ Params: { id: string } }>("/:id/join", async (req, reply) => {
    const result = await meetingsService.joinMeeting(
      req.params.id,
      req.user!.id,
      req.user!.email
    );
    if (!result) {
      return reply.status(404).send({
        code: "MEETING_NOT_FOUND",
        message: "Meeting not found",
      });
    }
    return reply.send({ data: result });
  });

  // GET /meetings/:id/participants - List participants
  app.get<{ Params: { id: string } }>(
    "/:id/participants",
    async (req, reply) => {
      const participants = await meetingsService.getParticipants(req.params.id);
      return reply.send({ data: { participants } });
    }
  );

  // POST /meetings/:id/end - End a meeting (host only)
  app.post<{ Params: { id: string } }>("/:id/end", async (req, reply) => {
    try {
      const meeting = await meetingsService.endMeeting(
        req.params.id,
        req.user!.id
      );
      if (!meeting) {
        return reply.status(404).send({
          code: "MEETING_NOT_FOUND",
          message: "Meeting not found",
        });
      }
      return reply.send({ data: { meeting } });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Not authorized")
      ) {
        return reply.status(403).send({
          code: "NOT_AUTHORIZED",
          message: error.message,
        });
      }
      throw error;
    }
  });
}
