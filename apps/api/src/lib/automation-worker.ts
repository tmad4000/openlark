import { Queue, Worker, Job } from "bullmq";
import { db } from "../db";
import {
  baseAutomations,
  automationRuns,
  baseRecords,
  baseTables,
  bases,
  messages,
  chatMembers,
  type AutomationTrigger,
  type AutomationAction,
} from "../db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { publish, getChatChannel } from "./redis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

// Parse Redis URL for BullMQ connection
const parseRedisUrl = (url: string) => {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379", 10),
    password: parsed.password || undefined,
  };
};

const redisConnection = parseRedisUrl(redisUrl);

// Automation job queue
export const automationQueue = new Queue("automations", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 500,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
  },
});

// Job data types
export interface AutomationJobData {
  automationId: string;
  triggerEvent: {
    type: string;
    recordId?: string;
    tableId?: string;
    data?: Record<string, unknown>;
    previousData?: Record<string, unknown>;
  };
  runId?: string;
}

// Timeout for automation execution (30 seconds as noted in prd.json)
const AUTOMATION_TIMEOUT_MS = 30000;

/**
 * Execute a single automation action
 */
async function executeAction(
  action: AutomationAction,
  context: {
    recordId?: string;
    tableId?: string;
    recordData?: Record<string, unknown>;
    baseId: string;
    orgId: string;
    ownerId: string;
  }
): Promise<void> {
  switch (action.type) {
    case "update_record": {
      const targetRecordId = action.recordId || context.recordId;
      if (!targetRecordId) {
        throw new Error("update_record action requires a recordId");
      }

      // Substitute template variables in updates
      const updates = substituteVariables(action.updates, context);

      // Get current record data
      const [record] = await db
        .select({ data: baseRecords.data })
        .from(baseRecords)
        .where(eq(baseRecords.id, targetRecordId))
        .limit(1);

      if (!record) {
        throw new Error(`Record ${targetRecordId} not found`);
      }

      const currentData = (record.data ?? {}) as Record<string, unknown>;
      const newData = { ...currentData, ...updates };

      await db
        .update(baseRecords)
        .set({
          data: newData,
          updatedAt: new Date(),
        })
        .where(eq(baseRecords.id, targetRecordId));

      break;
    }

    case "create_record": {
      // Substitute template variables in data
      const recordData = substituteVariables(action.data, context);

      await db.insert(baseRecords).values({
        tableId: action.tableId,
        data: recordData,
        createdBy: context.ownerId,
      });

      break;
    }

    case "send_message": {
      const content = substituteVariables(action.content, context);

      // Verify chat membership for the base owner
      const [membership] = await db
        .select()
        .from(chatMembers)
        .where(
          and(
            eq(chatMembers.chatId, action.chatId),
            eq(chatMembers.userId, context.ownerId)
          )
        )
        .limit(1);

      if (!membership) {
        throw new Error(`User is not a member of chat ${action.chatId}`);
      }

      // Create the message
      const [newMessage] = await db
        .insert(messages)
        .values({
          chatId: action.chatId,
          senderId: context.ownerId,
          type: "text",
          content,
        })
        .returning();

      // Publish to chat channel for real-time delivery
      await publish(getChatChannel(action.chatId), {
        type: "message",
        message: newMessage,
      });

      break;
    }

    case "http_request": {
      // Substitute template variables in URL, headers, and body
      const url = substituteVariablesInString(action.url, context);
      const headers: Record<string, string> = {};
      if (action.headers) {
        for (const [key, value] of Object.entries(action.headers)) {
          headers[key] = substituteVariablesInString(value, context);
        }
      }
      const body = action.body ? substituteVariables(action.body, context) : undefined;

      const response = await fetch(url, {
        method: action.method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000), // 10 second timeout per request
      });

      if (!response.ok) {
        throw new Error(`HTTP request failed: ${response.status} ${response.statusText}`);
      }

      break;
    }

    default:
      throw new Error(`Unknown action type: ${(action as AutomationAction).type}`);
  }
}

/**
 * Substitute template variables like {{record.fieldId}} in values
 */
function substituteVariables<T>(
  value: T,
  context: {
    recordId?: string;
    tableId?: string;
    recordData?: Record<string, unknown>;
  }
): T {
  if (typeof value === "string") {
    return substituteVariablesInString(value, context) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => substituteVariables(item, context)) as T;
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = substituteVariables(val, context);
    }
    return result as T;
  }

  return value;
}

/**
 * Substitute template variables in a string
 * Supports: {{record.fieldId}}, {{recordId}}, {{tableId}}
 */
function substituteVariablesInString(
  str: string,
  context: {
    recordId?: string;
    tableId?: string;
    recordData?: Record<string, unknown>;
  }
): string {
  return str.replace(/\{\{(\w+(?:\.\w+)?)\}\}/g, (match, path) => {
    const parts = path.split(".");

    if (parts[0] === "record" && parts[1] && context.recordData) {
      const fieldValue = context.recordData[parts[1]];
      return fieldValue !== undefined ? String(fieldValue) : match;
    }

    if (parts[0] === "recordId" && context.recordId) {
      return context.recordId;
    }

    if (parts[0] === "tableId" && context.tableId) {
      return context.tableId;
    }

    return match;
  });
}

/**
 * Check if a record matches a filter condition
 */
function matchesCondition(
  recordData: Record<string, unknown>,
  condition: { fieldId: string; op: string; value: unknown }
): boolean {
  const fieldValue = recordData[condition.fieldId];

  switch (condition.op) {
    case "eq":
      return fieldValue === condition.value;
    case "neq":
      return fieldValue !== condition.value;
    case "gt":
      return Number(fieldValue) > Number(condition.value);
    case "gte":
      return Number(fieldValue) >= Number(condition.value);
    case "lt":
      return Number(fieldValue) < Number(condition.value);
    case "lte":
      return Number(fieldValue) <= Number(condition.value);
    case "contains":
      return String(fieldValue || "").toLowerCase().includes(String(condition.value).toLowerCase());
    case "not_contains":
      return !String(fieldValue || "").toLowerCase().includes(String(condition.value).toLowerCase());
    case "is_empty":
      return fieldValue === null || fieldValue === undefined || fieldValue === "";
    case "is_not_empty":
      return fieldValue !== null && fieldValue !== undefined && fieldValue !== "";
    default:
      return false;
  }
}

/**
 * Process an automation job
 */
async function processAutomationJob(job: Job<AutomationJobData>): Promise<void> {
  const { automationId, triggerEvent, runId } = job.data;

  // Get or create run record
  let actualRunId = runId;
  if (!actualRunId) {
    const [run] = await db
      .insert(automationRuns)
      .values({
        automationId,
        triggerEvent,
        status: "running",
        startedAt: new Date(),
      })
      .returning();
    actualRunId = run.id;
  } else {
    // Update existing run to running
    await db
      .update(automationRuns)
      .set({ status: "running" })
      .where(eq(automationRuns.id, actualRunId));
  }

  try {
    // Get the automation
    const [automation] = await db
      .select({
        id: baseAutomations.id,
        baseId: baseAutomations.baseId,
        trigger: baseAutomations.trigger,
        actions: baseAutomations.actions,
        enabled: baseAutomations.enabled,
      })
      .from(baseAutomations)
      .where(eq(baseAutomations.id, automationId))
      .limit(1);

    if (!automation) {
      throw new Error(`Automation ${automationId} not found`);
    }

    if (!automation.enabled) {
      throw new Error(`Automation ${automationId} is disabled`);
    }

    // Get base info for context
    const [base] = await db
      .select({
        id: bases.id,
        orgId: bases.orgId,
        ownerId: bases.ownerId,
      })
      .from(bases)
      .where(eq(bases.id, automation.baseId))
      .limit(1);

    if (!base) {
      throw new Error(`Base ${automation.baseId} not found`);
    }

    // Get record data if available
    let recordData: Record<string, unknown> | undefined;
    if (triggerEvent.recordId) {
      const [record] = await db
        .select({ data: baseRecords.data })
        .from(baseRecords)
        .where(eq(baseRecords.id, triggerEvent.recordId))
        .limit(1);
      recordData = (record?.data ?? {}) as Record<string, unknown>;
    }

    // Check record_matches_condition trigger
    const trigger = automation.trigger as AutomationTrigger;
    if (trigger.type === "record_matches_condition" && recordData) {
      if (!matchesCondition(recordData, trigger.condition)) {
        // Condition not met, skip execution
        await db
          .update(automationRuns)
          .set({
            status: "success",
            completedAt: new Date(),
            error: "Condition not met - skipped",
          })
          .where(eq(automationRuns.id, actualRunId));
        return;
      }
    }

    // Execute actions with timeout
    const context = {
      recordId: triggerEvent.recordId,
      tableId: triggerEvent.tableId,
      recordData,
      baseId: base.id,
      orgId: base.orgId,
      ownerId: base.ownerId,
    };

    const actions = automation.actions as AutomationAction[];
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Automation execution timed out")), AUTOMATION_TIMEOUT_MS);
    });

    const executionPromise = (async () => {
      for (const action of actions) {
        await executeAction(action, context);
      }
    })();

    await Promise.race([executionPromise, timeoutPromise]);

    // Mark run as successful
    await db
      .update(automationRuns)
      .set({
        status: "success",
        completedAt: new Date(),
      })
      .where(eq(automationRuns.id, actualRunId));
  } catch (error) {
    // Mark run as failed
    const errorMessage = error instanceof Error ? error.message : String(error);
    await db
      .update(automationRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        error: errorMessage.slice(0, 2000),
      })
      .where(eq(automationRuns.id, actualRunId));

    throw error; // Re-throw to trigger BullMQ retry logic
  }
}

// Create the worker
let automationWorker: Worker<AutomationJobData> | null = null;

/**
 * Start the automation worker
 */
export function startAutomationWorker(): void {
  if (automationWorker) {
    return;
  }

  automationWorker = new Worker<AutomationJobData>(
    "automations",
    processAutomationJob,
    {
      connection: redisConnection,
      concurrency: 10,
    }
  );

  automationWorker.on("completed", (job: Job<AutomationJobData>) => {
    console.log(`Automation job ${job.id} completed`);
  });

  automationWorker.on("failed", (job: Job<AutomationJobData> | undefined, error: Error) => {
    console.error(`Automation job ${job?.id} failed:`, error.message);
  });

  console.log("Automation worker started");
}

/**
 * Stop the automation worker
 */
export async function stopAutomationWorker(): Promise<void> {
  if (automationWorker) {
    await automationWorker.close();
    automationWorker = null;
    console.log("Automation worker stopped");
  }
  await automationQueue.close();
}

/**
 * Queue an automation for execution based on a trigger event
 */
export async function queueAutomation(
  automationId: string,
  triggerEvent: AutomationJobData["triggerEvent"]
): Promise<string> {
  const job = await automationQueue.add("execute", {
    automationId,
    triggerEvent,
  });
  return job.id || "";
}

/**
 * Find and queue all automations that match a record event
 */
export async function triggerRecordAutomations(
  tableId: string,
  eventType: "record_created" | "record_updated",
  recordId: string,
  data: Record<string, unknown>,
  previousData?: Record<string, unknown>
): Promise<void> {
  // Get the base ID for this table
  const [table] = await db
    .select({ baseId: baseTables.baseId })
    .from(baseTables)
    .where(eq(baseTables.id, tableId))
    .limit(1);

  if (!table) {
    return;
  }

  // Find matching automations
  const automations = await db
    .select({
      id: baseAutomations.id,
      trigger: baseAutomations.trigger,
    })
    .from(baseAutomations)
    .where(
      and(
        eq(baseAutomations.baseId, table.baseId),
        eq(baseAutomations.enabled, true)
      )
    );

  for (const automation of automations) {
    const trigger = automation.trigger as AutomationTrigger;

    let shouldTrigger = false;

    if (trigger.type === eventType && trigger.tableId === tableId) {
      shouldTrigger = true;

      // For record_updated, check if specific fields changed
      if (trigger.type === "record_updated" && trigger.fieldIds && trigger.fieldIds.length > 0 && previousData) {
        const changedFieldIds = Object.keys(data).filter(
          (key) => data[key] !== previousData[key]
        );
        shouldTrigger = trigger.fieldIds.some((fid) => changedFieldIds.includes(fid));
      }
    }

    // Check record_matches_condition triggers
    if (trigger.type === "record_matches_condition" && trigger.tableId === tableId) {
      // Only trigger on create or update events
      if (eventType === "record_created" || eventType === "record_updated") {
        if (matchesCondition(data, trigger.condition)) {
          shouldTrigger = true;
        }
      }
    }

    if (shouldTrigger) {
      await queueAutomation(automation.id, {
        type: eventType,
        recordId,
        tableId,
        data,
        previousData,
      });
    }
  }
}

/**
 * Trigger button click automations
 */
export async function triggerButtonAutomation(
  tableId: string,
  fieldId: string,
  recordId: string,
  data: Record<string, unknown>
): Promise<void> {
  // Get the base ID for this table
  const [table] = await db
    .select({ baseId: baseTables.baseId })
    .from(baseTables)
    .where(eq(baseTables.id, tableId))
    .limit(1);

  if (!table) {
    return;
  }

  // Find matching button automations
  const automations = await db
    .select({ id: baseAutomations.id })
    .from(baseAutomations)
    .where(
      and(
        eq(baseAutomations.baseId, table.baseId),
        eq(baseAutomations.enabled, true),
        sql`${baseAutomations.trigger}->>'type' = 'button_clicked'`,
        sql`${baseAutomations.trigger}->>'tableId' = ${tableId}`,
        sql`${baseAutomations.trigger}->>'fieldId' = ${fieldId}`
      )
    );

  for (const automation of automations) {
    await queueAutomation(automation.id, {
      type: "button_clicked",
      recordId,
      tableId,
      data,
    });
  }
}
