import { Queue, Worker, Job } from "bullmq";
import { db } from "../db";
import { messages, chatMembers, chats, users } from "../db/schema";
import { eq, and, isNotNull, lte, isNull } from "drizzle-orm";
import { publish, getChatChannel } from "./redis";
import {
  createDmReceivedNotification,
  createMentionNotification,
  createThreadReplyNotification,
} from "./notifications";
import { dispatchWebhookEvent } from "./webhook-worker";

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

export interface ScheduledMessageJobData {
  messageId: string;
}

// Scheduled message delivery queue
export const scheduledMessageQueue = new Queue<ScheduledMessageJobData>(
  "scheduled-messages",
  {
    connection: redisConnection,
    defaultJobOptions: {
      removeOnComplete: 200,
      removeOnFail: 1000,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
    },
  }
);

/**
 * Process a scheduled message job - deliver the message at its scheduled time
 */
async function processScheduledMessageJob(
  job: Job<ScheduledMessageJobData>
): Promise<void> {
  const { messageId } = job.data;

  // Fetch the scheduled message
  const [message] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!message) {
    console.log(`Scheduled message ${messageId} not found, skipping`);
    return;
  }

  // If scheduledFor is null, it was already sent or cancelled
  if (!message.scheduledFor) {
    console.log(`Scheduled message ${messageId} already sent or cancelled`);
    return;
  }

  // Clear the scheduledFor field to mark it as sent
  await db
    .update(messages)
    .set({ scheduledFor: null })
    .where(eq(messages.id, messageId));

  // Fetch sender info
  const [sender] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(eq(users.id, message.senderId))
    .limit(1);

  // Update sender's last_read_message_id
  await db
    .update(chatMembers)
    .set({ lastReadMessageId: message.id })
    .where(
      and(
        eq(chatMembers.chatId, message.chatId),
        eq(chatMembers.userId, message.senderId)
      )
    );

  // Reopen "done" chats for all members
  await db
    .update(chatMembers)
    .set({ done: false })
    .where(
      and(eq(chatMembers.chatId, message.chatId), eq(chatMembers.done, true))
    );

  // Publish to Redis for real-time delivery
  await publish(getChatChannel(message.chatId), {
    type: "message",
    payload: {
      ...message,
      scheduledFor: null,
      sender: sender
        ? {
            id: sender.id,
            displayName: sender.displayName,
            avatarUrl: sender.avatarUrl,
          }
        : { id: message.senderId, displayName: null, avatarUrl: null },
    },
  });

  // Get chat info for notifications
  const [chatInfo] = await db
    .select({ name: chats.name, type: chats.type, orgId: chats.orgId })
    .from(chats)
    .where(eq(chats.id, message.chatId))
    .limit(1);

  // Dispatch webhook event
  if (chatInfo?.orgId) {
    dispatchWebhookEvent("message.created", chatInfo.orgId, {
      messageId: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      type: message.type,
      content: message.content,
      threadId: message.threadId,
      createdAt: message.createdAt,
    }).catch(() => {});
  }

  // Handle notifications (same as immediate send)
  const content = message.content as Record<string, unknown>;
  const messagePreview =
    typeof content.text === "string"
      ? content.text
      : typeof content.html === "string"
        ? (content.html as string).replace(/<[^>]*>/g, "").substring(0, 100)
        : "New message";

  const notifiedUserIds = new Set<string>();
  notifiedUserIds.add(message.senderId);

  // Handle mention notifications
  const mentions = content.mentions as
    | Array<{ id: string; displayName: string }>
    | undefined;
  if (mentions && mentions.length > 0) {
    for (const mention of mentions) {
      if (mention.id !== message.senderId) {
        notifiedUserIds.add(mention.id);
        createMentionNotification({
          mentionedUserId: mention.id,
          mentionedByName:
            sender?.displayName || "Someone",
          chatId: message.chatId,
          chatName: chatInfo?.name || "Chat",
          messageId: message.id,
          messagePreview,
        }).catch(() => {});
      }
    }
  }

  // Handle thread reply notifications
  if (message.threadId) {
    const [threadMsg] = await db
      .select({ senderId: messages.senderId })
      .from(messages)
      .where(eq(messages.id, message.threadId))
      .limit(1);

    if (
      threadMsg &&
      threadMsg.senderId !== message.senderId &&
      !notifiedUserIds.has(threadMsg.senderId)
    ) {
      notifiedUserIds.add(threadMsg.senderId);
      createThreadReplyNotification({
        recipientId: threadMsg.senderId,
        replierName:
          sender?.displayName || "Someone",
        chatId: message.chatId,
        chatName: chatInfo?.name || "Chat",
        messageId: message.id,
        threadId: message.threadId,
        messagePreview,
      }).catch(() => {});
    }
  }

  // Handle DM notifications
  if (chatInfo?.type === "dm") {
    const members = await db
      .select({ userId: chatMembers.userId })
      .from(chatMembers)
      .where(eq(chatMembers.chatId, message.chatId));

    for (const member of members) {
      if (!notifiedUserIds.has(member.userId)) {
        createDmReceivedNotification({
          recipientId: member.userId,
          senderId: message.senderId,
          senderName:
            sender?.displayName || "Someone",
          chatId: message.chatId,
          messageId: message.id,
          messagePreview,
        }).catch(() => {});
      }
    }
  }

  console.log(`Scheduled message ${messageId} delivered to chat ${message.chatId}`);
}

let scheduledMessageWorker: Worker<ScheduledMessageJobData> | null = null;

/**
 * Start the scheduled message delivery worker
 */
export function startScheduledMessageWorker(): void {
  if (scheduledMessageWorker) return;

  scheduledMessageWorker = new Worker<ScheduledMessageJobData>(
    "scheduled-messages",
    processScheduledMessageJob,
    {
      connection: redisConnection,
      concurrency: 5,
    }
  );

  scheduledMessageWorker.on("completed", (job: Job<ScheduledMessageJobData>) => {
    console.log(`Scheduled message ${job.data.messageId} delivery completed`);
  });

  scheduledMessageWorker.on(
    "failed",
    (job: Job<ScheduledMessageJobData> | undefined, error: Error) => {
      console.error(
        `Scheduled message ${job?.data?.messageId} delivery failed:`,
        error.message
      );
    }
  );

  console.log("Scheduled message worker started");
}

/**
 * Stop the scheduled message delivery worker
 */
export async function stopScheduledMessageWorker(): Promise<void> {
  if (scheduledMessageWorker) {
    await scheduledMessageWorker.close();
    scheduledMessageWorker = null;
    console.log("Scheduled message worker stopped");
  }
  await scheduledMessageQueue.close();
}

/**
 * Queue a message for scheduled delivery
 */
export async function queueScheduledMessage(
  messageId: string,
  scheduledFor: Date
): Promise<string> {
  const delay = Math.max(0, scheduledFor.getTime() - Date.now());

  const job = await scheduledMessageQueue.add(
    "deliver",
    { messageId },
    { delay, jobId: `scheduled-msg-${messageId}` }
  );

  return job.id || messageId;
}

/**
 * Cancel a scheduled message job
 */
export async function cancelScheduledMessage(
  messageId: string
): Promise<boolean> {
  const jobId = `scheduled-msg-${messageId}`;
  const job = await scheduledMessageQueue.getJob(jobId);
  if (job) {
    await job.remove();
    return true;
  }
  return false;
}
