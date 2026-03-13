import { Queue, Worker, Job } from "bullmq";
import { db } from "../db";
import { meetingRecordings, minutes, meetings, meetingParticipants } from "../db/schema";
import { eq } from "drizzle-orm";
import { transcribeAudio, generateMinutes } from "./ai";
import { createMinutesReadyNotification } from "./notifications";

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
 * 1. Download audio from storage URL
 * 2. Run Whisper ASR to generate transcript with speaker labels and timestamps
 * 3. Run LLM to generate summary, action items, and chapters
 * 4. Store results in minutes table
 * 5. Notify meeting participants when minutes are ready
 */
async function processTranscriptionJob(job: Job<TranscriptionJobData>): Promise<void> {
  const { recordingId, meetingId } = job.data;

  // Mark recording as processing
  await db
    .update(meetingRecordings)
    .set({ transcriptionStatus: "processing" })
    .where(eq(meetingRecordings.id, recordingId));

  try {
    // Fetch the recording to get storage URL
    const [recording] = await db
      .select()
      .from(meetingRecordings)
      .where(eq(meetingRecordings.id, recordingId))
      .limit(1);

    if (!recording) {
      throw new Error(`Recording ${recordingId} not found`);
    }

    // Create a processing minutes record
    const [minutesRecord] = await db.insert(minutes).values({
      meetingId,
      recordingId,
      status: "processing",
      language: "en",
    }).returning();

    await job.updateProgress(10);

    // Step 1: Run Whisper ASR on the recording
    const transcript = await transcribeAudio(recording.storageUrl);
    await job.updateProgress(50);

    // Update minutes with transcript
    await db
      .update(minutes)
      .set({ transcript })
      .where(eq(minutes.id, minutesRecord.id));

    // Step 2: Run LLM to generate summary, chapters, and action items
    const minutesData = await generateMinutes(transcript);
    await job.updateProgress(80);

    // Step 3: Store complete results in minutes table
    await db
      .update(minutes)
      .set({
        summary: minutesData.summary,
        chapters: minutesData.chapters,
        actionItems: minutesData.actionItems,
        status: "ready",
      })
      .where(eq(minutes.id, minutesRecord.id));

    // Mark recording transcription as ready
    await db
      .update(meetingRecordings)
      .set({ transcriptionStatus: "ready" })
      .where(eq(meetingRecordings.id, recordingId));

    await job.updateProgress(90);

    // Step 4: Notify all meeting participants
    const [meeting] = await db
      .select({ title: meetings.title })
      .from(meetings)
      .where(eq(meetings.id, meetingId))
      .limit(1);

    const participants = await db
      .select({ userId: meetingParticipants.userId })
      .from(meetingParticipants)
      .where(eq(meetingParticipants.meetingId, meetingId));

    const meetingTitle = meeting?.title || "Meeting";
    await Promise.all(
      participants.map((p) =>
        createMinutesReadyNotification({
          userId: p.userId,
          meetingId,
          meetingTitle,
        })
      )
    );

    await job.updateProgress(100);
  } catch (error) {
    // Mark recording and minutes as failed on error
    await db
      .update(meetingRecordings)
      .set({ transcriptionStatus: "failed" })
      .where(eq(meetingRecordings.id, recordingId));

    await db
      .update(minutes)
      .set({ status: "failed" })
      .where(eq(minutes.recordingId, recordingId));

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
