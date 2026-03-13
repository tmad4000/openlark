import { Queue, Worker, Job } from "bullmq";
import crypto from "crypto";
import { db } from "../db";
import { webhookDeliveries, eventSubscriptions, oauthApps } from "../db/schema";
import { eq, and } from "drizzle-orm";

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

// Retry delays: 1s, 5s, 30s, 5m, 30m
const RETRY_DELAYS = [1000, 5000, 30000, 300000, 1800000];

export interface WebhookJobData {
  deliveryId: string;
  subscriptionId: string;
  callbackUrl: string;
  payload: Record<string, unknown>;
  appSecretHash: string;
}

// Webhook delivery queue
export const webhookQueue = new Queue<WebhookJobData>("webhooks", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 200,
    removeOnFail: 1000,
    attempts: 5,
    backoff: {
      type: "custom",
    },
  },
});

/**
 * Process a webhook delivery job
 */
async function processWebhookJob(job: Job<WebhookJobData>): Promise<void> {
  const { deliveryId, callbackUrl, payload, appSecretHash } = job.data;

  // Generate HMAC signature using the app secret hash as key
  const payloadStr = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signatureBody = `${timestamp}.${payloadStr}`;
  const signature = crypto
    .createHmac("sha256", appSecretHash)
    .update(signatureBody)
    .digest("hex");

  // Update attempt count
  await db
    .update(webhookDeliveries)
    .set({
      attempts: job.attemptsMade + 1,
      lastAttemptAt: new Date(),
    })
    .where(eq(webhookDeliveries.id, deliveryId));

  // Deliver the webhook
  const response = await fetch(callbackUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-OpenLark-Signature": `sha256=${signature}`,
      "X-OpenLark-Timestamp": timestamp,
      "X-OpenLark-Delivery-Id": deliveryId,
    },
    body: payloadStr,
    signal: AbortSignal.timeout(15000), // 15 second timeout
  });

  if (!response.ok) {
    // Mark as failed if final attempt
    if (job.attemptsMade + 1 >= 5) {
      await db
        .update(webhookDeliveries)
        .set({ status: "failed" })
        .where(eq(webhookDeliveries.id, deliveryId));
    }
    throw new Error(`Webhook delivery failed: ${response.status} ${response.statusText}`);
  }

  // Mark as delivered
  await db
    .update(webhookDeliveries)
    .set({ status: "delivered" })
    .where(eq(webhookDeliveries.id, deliveryId));
}

// Custom backoff strategy
function customBackoff(attemptsMade: number): number {
  return RETRY_DELAYS[Math.min(attemptsMade, RETRY_DELAYS.length - 1)];
}

let webhookWorker: Worker<WebhookJobData> | null = null;

/**
 * Start the webhook delivery worker
 */
export function startWebhookWorker(): void {
  if (webhookWorker) return;

  webhookWorker = new Worker<WebhookJobData>("webhooks", processWebhookJob, {
    connection: redisConnection,
    concurrency: 10,
    settings: {
      backoffStrategy: customBackoff,
    },
  });

  webhookWorker.on("completed", (job: Job<WebhookJobData>) => {
    console.log(`Webhook delivery ${job.data.deliveryId} completed`);
  });

  webhookWorker.on("failed", (job: Job<WebhookJobData> | undefined, error: Error) => {
    console.error(`Webhook delivery ${job?.data?.deliveryId} failed:`, error.message);
  });

  console.log("Webhook worker started");
}

/**
 * Stop the webhook delivery worker
 */
export async function stopWebhookWorker(): Promise<void> {
  if (webhookWorker) {
    await webhookWorker.close();
    webhookWorker = null;
    console.log("Webhook worker stopped");
  }
  await webhookQueue.close();
}

/**
 * Dispatch a webhook event to all matching subscriptions
 */
export async function dispatchWebhookEvent(
  eventType: string,
  orgId: string,
  data: Record<string, unknown>
): Promise<void> {
  // Find all active subscriptions for this event type from apps in this org
  const subscriptions = await db
    .select({
      subscriptionId: eventSubscriptions.id,
      callbackUrl: eventSubscriptions.callbackUrl,
      appId: eventSubscriptions.appId,
      appSecretHash: oauthApps.appSecretHash,
      appClientId: oauthApps.appId,
    })
    .from(eventSubscriptions)
    .innerJoin(oauthApps, eq(eventSubscriptions.appId, oauthApps.id))
    .where(
      and(
        eq(eventSubscriptions.eventType, eventType),
        eq(eventSubscriptions.status, "active"),
        eq(oauthApps.orgId, orgId)
      )
    );

  for (const sub of subscriptions) {
    const payload = {
      type: eventType,
      timestamp: new Date().toISOString(),
      orgId,
      appId: sub.appClientId,
      data,
    };

    // Create delivery record
    const [delivery] = await db
      .insert(webhookDeliveries)
      .values({
        subscriptionId: sub.subscriptionId,
        eventType,
        payload,
        status: "pending",
        attempts: 0,
      })
      .returning({ id: webhookDeliveries.id });

    // Queue the delivery job
    await webhookQueue.add("deliver", {
      deliveryId: delivery.id,
      subscriptionId: sub.subscriptionId,
      callbackUrl: sub.callbackUrl,
      payload,
      appSecretHash: sub.appSecretHash,
    });
  }
}
