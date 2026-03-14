import { eq, and } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  minutes,
  minutesComments,
  meetingRecordings,
  meetings,
} from "../../db/schema/meetings.js";
import { users } from "../../db/schema/auth.js";

class MinutesService {
  async getMinutes(minutesId: string) {
    const [result] = await db
      .select()
      .from(minutes)
      .where(eq(minutes.id, minutesId));
    if (!result) return null;

    // Get the meeting info
    const [meeting] = await db
      .select()
      .from(meetings)
      .where(eq(meetings.id, result.meetingId));

    // Get the recording info
    let recording = null;
    if (result.recordingId) {
      const [rec] = await db
        .select()
        .from(meetingRecordings)
        .where(eq(meetingRecordings.id, result.recordingId));
      recording = rec ?? null;
    }

    return { minutes: result, meeting: meeting ?? null, recording };
  }

  async getMinutesByMeeting(meetingId: string) {
    const results = await db
      .select()
      .from(minutes)
      .where(eq(minutes.meetingId, meetingId));
    return results;
  }

  async getComments(minutesId: string) {
    const results = await db
      .select({
        id: minutesComments.id,
        minutesId: minutesComments.minutesId,
        userId: minutesComments.userId,
        paragraphIndex: minutesComments.paragraphIndex,
        content: minutesComments.content,
        createdAt: minutesComments.createdAt,
        userName: users.displayName,
        userAvatar: users.avatarUrl,
      })
      .from(minutesComments)
      .leftJoin(users, eq(minutesComments.userId, users.id))
      .where(eq(minutesComments.minutesId, minutesId))
      .orderBy(minutesComments.createdAt);
    return results;
  }

  async addComment(
    minutesId: string,
    userId: string,
    paragraphIndex: number,
    content: string
  ) {
    const [comment] = await db
      .insert(minutesComments)
      .values({ minutesId, userId, paragraphIndex, content })
      .returning();
    return comment;
  }

  async deleteComment(commentId: string, userId: string) {
    const [comment] = await db
      .select()
      .from(minutesComments)
      .where(eq(minutesComments.id, commentId));

    if (!comment) return null;
    if (comment.userId !== userId) {
      throw new Error("Not authorized: can only delete your own comments");
    }

    await db
      .delete(minutesComments)
      .where(eq(minutesComments.id, commentId));

    return comment;
  }
}

export const minutesService = new MinutesService();
