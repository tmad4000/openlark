import { Queue, Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { config } from "../../config.js";
import { db } from "../../db/index.js";
import {
  meetingRecordings,
  meetingParticipants,
  meetings,
  minutes,
} from "../../db/schema/meetings.js";
import { notificationsService } from "../notifications/notifications.service.js";
import { transcribeAndSummarize } from "./transcription.service.js";

const QUEUE_NAME = "transcription";

const connectionOpts = {
  connection: {
    host: new URL(config.REDIS_URL).hostname || "localhost",
    port: parseInt(new URL(config.REDIS_URL).port || "6379", 10),
  },
};

export const transcriptionQueue = new Queue(QUEUE_NAME, connectionOpts);

export interface TranscriptionJobData {
  recordingId: string;
  meetingId: string;
  storageUrl: string;
}

export function createTranscriptionWorker(): Worker<TranscriptionJobData> {
  const worker = new Worker<TranscriptionJobData>(
    QUEUE_NAME,
    async (job) => {
      const { recordingId, meetingId, storageUrl } = job.data;

      // Mark recording as processing
      await db
        .update(meetingRecordings)
        .set({ transcriptionStatus: "processing" })
        .where(eq(meetingRecordings.id, recordingId));

      try {
        // Step 1: Run Whisper ASR + LLM summarization
        const result = await transcribeAndSummarize(storageUrl);

        // Step 2: Store results in minutes table
        const [minutesEntry] = await db
          .insert(minutes)
          .values({
            meetingId,
            recordingId,
            transcript: result.transcript,
            summary: result.summary,
            chapters: result.chapters,
            actionItems: result.actionItems,
            status: "ready",
          })
          .returning();

        // Mark recording transcription as ready
        await db
          .update(meetingRecordings)
          .set({ transcriptionStatus: "ready" })
          .where(eq(meetingRecordings.id, recordingId));

        // Step 3: Notify all meeting participants
        const meeting = await db
          .select({ title: meetings.title })
          .from(meetings)
          .where(eq(meetings.id, meetingId))
          .then((rows) => rows[0]);

        const participants = await db
          .select({ userId: meetingParticipants.userId })
          .from(meetingParticipants)
          .where(eq(meetingParticipants.meetingId, meetingId));

        const meetingTitle = meeting?.title ?? "Meeting";
        await Promise.all(
          participants.map((p) =>
            notificationsService.createNotification({
              userId: p.userId,
              type: "minutes_ready",
              title: `Meeting minutes ready: ${meetingTitle}`,
              body: `Transcript, summary, and action items are now available for "${meetingTitle}".`,
              entityType: "minutes",
              entityId: minutesEntry!.id,
            })
          )
        );

        return { minutesId: minutesEntry!.id };
      } catch (err) {
        // Mark as failed on error
        await db
          .update(meetingRecordings)
          .set({ transcriptionStatus: "failed" })
          .where(eq(meetingRecordings.id, recordingId));

        throw err;
      }
    },
    connectionOpts
  );

  return worker;
}

export async function enqueueTranscription(
  data: TranscriptionJobData
): Promise<void> {
  await transcriptionQueue.add("transcribe-recording", data);
}
