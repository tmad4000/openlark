import { FastifyInstance } from "fastify";
import { db } from "../db";
import { meetings, meetingParticipants, meetingRecordings, minutes, minutesComments, users } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { AccessToken, VideoGrant } from "livekit-server-sdk";
import { queueTranscriptionJob } from "../lib/transcription-worker";

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

  /**
   * POST /meetings/livekit-webhook - LiveKit Egress webhook callback
   * Called when a recording completes; saves to meeting_recordings and queues transcription
   */
  fastify.post<{
    Body: {
      event: string;
      egressInfo?: {
        egressId: string;
        roomName: string;
        status: number;
        file?: {
          filename: string;
          duration: number;
          size: string;
          location: string;
        };
      };
    };
  }>(
    "/meetings/livekit-webhook",
    async (request, reply) => {
      const { event, egressInfo } = request.body;

      // Only handle egress_ended events (recording complete)
      if (event !== "egress_ended" || !egressInfo) {
        return reply.status(200).send({ ok: true });
      }

      // Extract meeting ID from room name (format: "meeting-<uuid>")
      const roomName = egressInfo.roomName;
      if (!roomName) {
        return reply.status(400).send({ error: "Missing roomName" });
      }

      // Find the meeting by roomId
      const [meeting] = await db
        .select()
        .from(meetings)
        .where(eq(meetings.roomId, roomName))
        .limit(1);

      if (!meeting) {
        return reply.status(404).send({ error: "Meeting not found for room" });
      }

      const file = egressInfo.file;
      const storageUrl = file?.location || `egress/${egressInfo.egressId}`;
      const duration = file ? Math.round(file.duration / 1e9) : null; // nanoseconds to seconds
      const size = file ? parseInt(file.size, 10) : null;

      // Save recording to DB
      const [recording] = await db
        .insert(meetingRecordings)
        .values({
          meetingId: meeting.id,
          storageUrl,
          duration,
          size,
          transcriptionStatus: "pending",
        })
        .returning();

      // Queue transcription job
      await queueTranscriptionJob(recording.id, meeting.id);

      return reply.status(201).send({ recording });
    }
  );

  /**
   * GET /minutes/:id - Get minutes by ID with meeting info and recording
   */
  fastify.get<{
    Params: { id: string };
  }>(
    "/minutes/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid minutes ID" });
      }

      const [minutesRecord] = await db
        .select()
        .from(minutes)
        .where(eq(minutes.id, id))
        .limit(1);

      if (!minutesRecord) {
        return reply.status(404).send({ error: "Minutes not found" });
      }

      // Fetch meeting info
      const [meeting] = await db
        .select()
        .from(meetings)
        .where(eq(meetings.id, minutesRecord.meetingId))
        .limit(1);

      // Fetch recording info
      let recording = null;
      if (minutesRecord.recordingId) {
        const [rec] = await db
          .select()
          .from(meetingRecordings)
          .where(eq(meetingRecordings.id, minutesRecord.recordingId))
          .limit(1);
        recording = rec || null;
      }

      // Fetch participants
      const participants = await db
        .select({
          userId: meetingParticipants.userId,
          role: meetingParticipants.role,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(meetingParticipants)
        .innerJoin(users, eq(meetingParticipants.userId, users.id))
        .where(eq(meetingParticipants.meetingId, minutesRecord.meetingId));

      // Fetch comments with user info
      const comments = await db
        .select({
          id: minutesComments.id,
          paragraphIndex: minutesComments.paragraphIndex,
          content: minutesComments.content,
          createdAt: minutesComments.createdAt,
          userId: minutesComments.userId,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(minutesComments)
        .innerJoin(users, eq(minutesComments.userId, users.id))
        .where(eq(minutesComments.minutesId, id));

      return reply.send({
        minutes: minutesRecord,
        meeting,
        recording,
        participants,
        comments,
      });
    }
  );

  /**
   * GET /meetings/:id/minutes - Get minutes for a meeting
   */
  fastify.get<{
    Params: { id: string };
  }>(
    "/meetings/:id/minutes",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid meeting ID" });
      }

      const minutesList = await db
        .select()
        .from(minutes)
        .where(eq(minutes.meetingId, id));

      return reply.send({ minutes: minutesList });
    }
  );

  /**
   * POST /minutes/:id/comments - Add a comment to a transcript paragraph
   */
  fastify.post<{
    Params: { id: string };
    Body: { paragraphIndex: number; content: string };
  }>(
    "/minutes/:id/comments",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { id } = request.params;
      const { paragraphIndex, content } = request.body;

      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid minutes ID" });
      }

      if (typeof paragraphIndex !== "number" || paragraphIndex < 0) {
        return reply.status(400).send({ error: "Invalid paragraph index" });
      }

      if (!content || content.trim().length === 0) {
        return reply.status(400).send({ error: "Comment content is required" });
      }

      // Verify minutes exist
      const [minutesRecord] = await db
        .select()
        .from(minutes)
        .where(eq(minutes.id, id))
        .limit(1);

      if (!minutesRecord) {
        return reply.status(404).send({ error: "Minutes not found" });
      }

      const [comment] = await db
        .insert(minutesComments)
        .values({
          minutesId: id,
          userId: user.id,
          paragraphIndex,
          content: content.trim(),
        })
        .returning();

      return reply.status(201).send({ comment });
    }
  );
};
