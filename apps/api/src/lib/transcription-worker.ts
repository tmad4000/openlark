import { Queue, Worker, Job } from "bullmq";
import { db } from "../db";
import { meetingRecordings, minutes } from "../db/schema";
import { eq } from "drizzle-orm";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

const parseRedisUrl = (url: string) => {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379", 10),
    password: parsed.password || undefined,
  };
};

const redisConnection = parseRedisUrl(redisUrl);

// Transcription job queue
export const transcriptionQueue = new Queue("transcriptions", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 500,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
  },
});

export interface TranscriptionJobData {
  recordingId: string;
  meetingId: string;
}

/**
 * Queue a transcription job for a completed recording
 */
export async function queueTranscriptionJob(
  recordingId: string,
  meetingId: string
): Promise<string> {
  const job = await transcriptionQueue.add("transcribe", {
    recordingId,
    meetingId,
  });
  return job.id || "";
}

/**
 * Process a transcription job:
 * 1. Update recording status to processing
 * 2. (Placeholder) Run Whisper ASR on the recording
 * 3. Create minutes record with transcript
 * 4. Update recording status to ready
 */
async function processTranscriptionJob(job: Job<TranscriptionJobData>): Promise<void> {
  const { recordingId, meetingId } = job.data;

  // Mark recording as processing
  await db
    .update(meetingRecordings)
    .set({ transcriptionStatus: "processing" })
    .where(eq(meetingRecordings.id, recordingId));

  try {
    // Create a pending minutes record
    await db.insert(minutes).values({
      meetingId,
      recordingId,
      status: "pending",
      language: "en",
    });

    // Mark recording transcription as ready
    // (Actual Whisper ASR integration is handled in US-094)
    await db
      .update(meetingRecordings)
      .set({ transcriptionStatus: "ready" })
      .where(eq(meetingRecordings.id, recordingId));
  } catch (error) {
    // Mark as failed on error
    await db
      .update(meetingRecordings)
      .set({ transcriptionStatus: "failed" })
      .where(eq(meetingRecordings.id, recordingId));

    throw error;
  }
}

// Worker instance
let transcriptionWorker: Worker<TranscriptionJobData> | null = null;

/**
 * Start the transcription worker
 */
export function startTranscriptionWorker(): void {
  if (transcriptionWorker) {
    return;
  }

  transcriptionWorker = new Worker<TranscriptionJobData>(
    "transcriptions",
    processTranscriptionJob,
    {
      connection: redisConnection,
      concurrency: 5,
    }
  );

  transcriptionWorker.on("completed", (job: Job<TranscriptionJobData>) => {
    console.log(`Transcription job ${job.id} completed for recording ${job.data.recordingId}`);
  });

  transcriptionWorker.on("failed", (job: Job<TranscriptionJobData> | undefined, error: Error) => {
    console.error(`Transcription job ${job?.id} failed:`, error.message);
  });

  console.log("Transcription worker started");
}

/**
 * Stop the transcription worker
 */
export async function stopTranscriptionWorker(): Promise<void> {
  if (transcriptionWorker) {
    await transcriptionWorker.close();
    transcriptionWorker = null;
    console.log("Transcription worker stopped");
  }
  await transcriptionQueue.close();
}
