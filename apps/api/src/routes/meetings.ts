import { FastifyInstance } from "fastify";
import { db } from "../db";
import { meetings, meetingParticipants, users } from "../db/schema";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { AccessToken, VideoGrant } from "livekit-server-sdk";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "devkey";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "secret";
const LIVEKIT_URL = process.env.LIVEKIT_URL || "ws://localhost:7880";

async function createLiveKitToken(roomName: string, participantName: string, participantIdentity: string): Promise<string> {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participantIdentity,
    name: participantName,
  });
  const grant: VideoGrant = {
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  };
  at.addGrant(grant);
  at.ttl = "1h";
  return await at.toJwt();
}

export const meetingsRoutes = async (fastify: FastifyInstance) => {
  /**
   * POST /meetings - Create a meeting and LiveKit room; returns join token
   */
  fastify.post<{
    Body: {
      title: string;
      type?: "instant" | "scheduled" | "recurring";
      settings?: {
        muteOnJoin?: boolean;
        cameraOffOnJoin?: boolean;
        allowScreenShare?: boolean;
        allowRecording?: boolean;
        maxParticipants?: number;
      };
    };
  }>(
    "/meetings",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { title, type = "instant", settings } = request.body;

      if (!title || title.trim().length === 0) {
        return reply.status(400).send({ error: "Title is required" });
      }

      if (!user.orgId) {
        return reply.status(400).send({ error: "User must belong to an organization" });
      }

      // Create the meeting
      const roomId = `meeting-${crypto.randomUUID()}`;

      const [meeting] = await db.insert(meetings).values({
        orgId: user.orgId,
        title: title.trim(),
        hostId: user.id,
        type,
        status: "active",
        roomId,
        settings: settings || {},
        startedAt: new Date(),
      }).returning();

      // Add host as participant
      await db.insert(meetingParticipants).values({
        meetingId: meeting.id,
        userId: user.id,
        role: "host",
        joinedAt: new Date(),
      });

      // Generate LiveKit token for the host
      const token = await createLiveKitToken(roomId, user.displayName || user.email, user.id);

      return reply.status(201).send({
        meeting,
        token,
        livekitUrl: LIVEKIT_URL,
      });
    }
  );

  /**
   * GET /meetings/:id/join - Generate LiveKit access token for current user
   */
  fastify.get<{
    Params: { id: string };
  }>(
    "/meetings/:id/join",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { id } = request.params;

      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid meeting ID" });
      }

      // Fetch the meeting
      const [meeting] = await db.select().from(meetings).where(eq(meetings.id, id)).limit(1);

      if (!meeting) {
        return reply.status(404).send({ error: "Meeting not found" });
      }

      if (meeting.status === "ended") {
        return reply.status(410).send({ error: "Meeting has ended" });
      }

      // Add/update participant record
      await db.insert(meetingParticipants).values({
        meetingId: meeting.id,
        userId: user.id,
        role: meeting.hostId === user.id ? "host" : "participant",
        joinedAt: new Date(),
      }).onConflictDoUpdate({
        target: [meetingParticipants.meetingId, meetingParticipants.userId],
        set: { joinedAt: new Date(), leftAt: null },
      });

      // Generate LiveKit token
      const token = await createLiveKitToken(meeting.roomId!, user.displayName || user.email, user.id);

      // Get participant list
      const participants = await db.select({
        userId: meetingParticipants.userId,
        role: meetingParticipants.role,
        joinedAt: meetingParticipants.joinedAt,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
        .from(meetingParticipants)
        .innerJoin(users, eq(meetingParticipants.userId, users.id))
        .where(eq(meetingParticipants.meetingId, meeting.id));

      return reply.send({
        meeting,
        token,
        livekitUrl: LIVEKIT_URL,
        participants,
      });
    }
  );

  /**
   * POST /meetings/:id/end - End a meeting (host only)
   */
  fastify.post<{
    Params: { id: string };
  }>(
    "/meetings/:id/end",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { id } = request.params;

      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid meeting ID" });
      }

      const [meeting] = await db.select().from(meetings).where(eq(meetings.id, id)).limit(1);

      if (!meeting) {
        return reply.status(404).send({ error: "Meeting not found" });
      }

      if (meeting.hostId !== user.id) {
        return reply.status(403).send({ error: "Only the host can end the meeting" });
      }

      const [updated] = await db.update(meetings).set({
        status: "ended",
        endedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(meetings.id, id)).returning();

      return reply.send({ meeting: updated });
    }
  );
};
