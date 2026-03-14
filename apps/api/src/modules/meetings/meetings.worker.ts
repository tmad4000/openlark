import { Queue, Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { config } from "../../config.js";
import { db } from "../../db/index.js";
import {
  meetingRecordings,
  minutes,
} from "../../db/schema/meetings.js";

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
      const { recordingId, meetingId } = job.data;

      // Mark recording as processing
      await db
        .update(meetingRecordings)
        .set({ transcriptionStatus: "processing" })
        .where(eq(meetingRecordings.id, recordingId));

      try {
        // Placeholder: In production, this would call an external transcription
        // service (e.g., Deepgram, AssemblyAI, Whisper) with the recording URL.
        // For now, we create the minutes entry with pending status.
        const [minutesEntry] = await db
          .insert(minutes)
          .values({
            meetingId,
            recordingId,
            transcript: [],
            summary: {},
            chapters: [],
            actionItems: [],
            status: "pending",
          })
          .returning();

        // Mark recording transcription as ready
        await db
          .update(meetingRecordings)
          .set({ transcriptionStatus: "ready" })
          .where(eq(meetingRecordings.id, recordingId));

        // Mark minutes as ready
        await db
          .update(minutes)
          .set({ status: "ready" })
          .where(eq(minutes.id, minutesEntry!.id));

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
