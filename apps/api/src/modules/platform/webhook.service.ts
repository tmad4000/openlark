import { createHmac } from "crypto";
import { db } from "../../db/index.js";
import { eventSubscriptions, webhookDeliveries, apps } from "../../db/schema/platform.js";
import { eq, and, desc } from "drizzle-orm";

const RETRY_DELAYS = [1000, 5000, 30000, 300000, 1800000]; // 1s, 5s, 30s, 5m, 30m
const MAX_ATTEMPTS = 5;

export interface WebhookEvent {
  eventType: string;
  payload: Record<string, unknown>;
  orgId: string;
}

class WebhookService {
  /**
   * Dispatch an event to all subscribed apps.
   * Creates delivery records and attempts immediate delivery.
   */
  async dispatch(event: WebhookEvent): Promise<void> {
    // Find all active subscriptions for this event type
    const subs = await db
      .select({
        id: eventSubscriptions.id,
        appId: eventSubscriptions.appId,
        callbackUrl: eventSubscriptions.callbackUrl,
      })
      .from(eventSubscriptions)
      .where(
        and(
          eq(eventSubscriptions.eventType, event.eventType),
          eq(eventSubscriptions.status, "active")
        )
      );

    // For each subscription, verify it belongs to the same org and create a delivery
    for (const sub of subs) {
      const [app] = await db
        .select({ orgId: apps.orgId, appSecretHash: apps.appSecretHash })
        .from(apps)
        .where(eq(apps.id, sub.appId));

      if (!app || app.orgId !== event.orgId) continue;

      const [delivery] = await db
        .insert(webhookDeliveries)
        .values({
          subscriptionId: sub.id,
          eventType: event.eventType,
          payload: event.payload,
          status: "pending",
          attempts: 0,
        })
        .returning();

      if (delivery) {
        // Attempt immediate delivery (fire-and-forget with retry)
        this.attemptDelivery(delivery.id, sub.callbackUrl, event.payload, app.appSecretHash).catch(
          () => {}
        );
      }
    }
  }

  /**
   * Attempt to deliver a webhook with retry logic.
   */
  async attemptDelivery(
    deliveryId: string,
    callbackUrl: string,
    payload: unknown,
    secretHash: string
  ): Promise<void> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        const delay = RETRY_DELAYS[attempt - 1] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1]!;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      try {
        const body = JSON.stringify(payload);
        const signature = createHmac("sha256", secretHash).update(body).digest("hex");

        const response = await fetch(callbackUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-OpenLark-Signature": signature,
            "X-OpenLark-Event-Id": deliveryId,
          },
          body,
          signal: AbortSignal.timeout(10000),
        });

        await db
          .update(webhookDeliveries)
          .set({
            status: response.ok ? "delivered" : (attempt + 1 >= MAX_ATTEMPTS ? "failed" : "pending"),
            attempts: attempt + 1,
            lastAttemptAt: new Date(),
            responseStatus: response.status,
            responseBody: await response.text().catch(() => null),
          })
          .where(eq(webhookDeliveries.id, deliveryId));

        if (response.ok) return;
      } catch {
        await db
          .update(webhookDeliveries)
          .set({
            status: attempt + 1 >= MAX_ATTEMPTS ? "failed" : "pending",
            attempts: attempt + 1,
            lastAttemptAt: new Date(),
            responseBody: "Connection error",
          })
          .where(eq(webhookDeliveries.id, deliveryId));
      }
    }
  }

  /**
   * Get delivery logs for an app's subscriptions.
   */
  async getDeliveries(appId: string, limit = 50, offset = 0) {
    const rows = await db
      .select({
        id: webhookDeliveries.id,
        subscriptionId: webhookDeliveries.subscriptionId,
        eventType: webhookDeliveries.eventType,
        payload: webhookDeliveries.payload,
        status: webhookDeliveries.status,
        attempts: webhookDeliveries.attempts,
        lastAttemptAt: webhookDeliveries.lastAttemptAt,
        responseStatus: webhookDeliveries.responseStatus,
        createdAt: webhookDeliveries.createdAt,
      })
      .from(webhookDeliveries)
      .innerJoin(
        eventSubscriptions,
        eq(webhookDeliveries.subscriptionId, eventSubscriptions.id)
      )
      .where(eq(eventSubscriptions.appId, appId))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(limit)
      .offset(offset);

    return rows;
  }
}

export const webhookService = new WebhookService();
