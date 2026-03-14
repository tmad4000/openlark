import { eq, and } from "drizzle-orm";
import { AccessToken } from "livekit-server-sdk";
import { db } from "../../db/index.js";
import {
  meetings,
  meetingParticipants,
} from "../../db/schema/meetings.js";
import { config } from "../../config.js";
import type { CreateMeetingInput } from "./meetings.schemas.js";

function generateRoomId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "meeting-";
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function createLiveKitToken(
  roomName: string,
  identity: string,
  name: string
): Promise<string> {
  const token = new AccessToken(
    config.LIVEKIT_API_KEY,
    config.LIVEKIT_API_SECRET,
    {
      identity,
      name,
      ttl: "4h",
    }
  );
  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  return await token.toJwt();
}

class MeetingsService {
  async createMeeting(
    input: CreateMeetingInput,
    userId: string,
    orgId: string,
    userName: string
  ) {
    const roomId = generateRoomId();

    const [meeting] = await db
      .insert(meetings)
      .values({
        orgId,
        title: input.title,
        hostId: userId,
        type: input.type ?? "instant",
        status: "waiting",
        roomId,
        settings: input.settings ?? {},
      })
      .returning();

    // Add host as participant
    await db.insert(meetingParticipants).values({
      meetingId: meeting!.id,
      userId,
      role: "host",
    });

    // Generate join token for the host
    const token = await createLiveKitToken(roomId, userId, userName);

    return { meeting, token };
  }

  async getMeeting(meetingId: string) {
    const [meeting] = await db
      .select()
      .from(meetings)
      .where(eq(meetings.id, meetingId));
    return meeting ?? null;
  }

  async joinMeeting(meetingId: string, userId: string, userName: string) {
    const meeting = await this.getMeeting(meetingId);
    if (!meeting) return null;

    // Upsert participant
    await db
      .insert(meetingParticipants)
      .values({
        meetingId,
        userId,
        role: "participant",
        joinedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [meetingParticipants.meetingId, meetingParticipants.userId],
        set: { joinedAt: new Date(), leftAt: null },
      });

    // Update meeting status to active if waiting
    if (meeting.status === "waiting") {
      await db
        .update(meetings)
        .set({ status: "active", startedAt: new Date() })
        .where(eq(meetings.id, meetingId));
    }

    const token = await createLiveKitToken(meeting.roomId, userId, userName);

    return { meeting, token };
  }

  async getParticipants(meetingId: string) {
    return db
      .select()
      .from(meetingParticipants)
      .where(eq(meetingParticipants.meetingId, meetingId));
  }

  async endMeeting(meetingId: string, userId: string) {
    const meeting = await this.getMeeting(meetingId);
    if (!meeting) return null;
    if (meeting.hostId !== userId) {
      throw new Error("Not authorized: only the host can end the meeting");
    }

    const [updated] = await db
      .update(meetings)
      .set({ status: "ended", endedAt: new Date() })
      .where(eq(meetings.id, meetingId))
      .returning();

    return updated;
  }
}

export const meetingsService = new MeetingsService();
