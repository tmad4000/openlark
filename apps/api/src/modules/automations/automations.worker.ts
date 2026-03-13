import { Queue, Worker } from "bullmq";
import { config } from "../../config.js";
import { automationsService } from "./automations.service.js";
import { baseService } from "../base/base.service.js";

const QUEUE_NAME = "automations";

const connectionOpts = {
  connection: {
    host: new URL(config.REDIS_URL).hostname || "localhost",
    port: parseInt(new URL(config.REDIS_URL).port || "6379", 10),
  },
};

export const automationQueue = new Queue(QUEUE_NAME, connectionOpts);

export interface AutomationJobData {
  automationId: string;
  triggerEvent: Record<string, unknown>;
}

async function executeAction(
  action: { type: string; config: Record<string, unknown> },
  triggerEvent: Record<string, unknown>
): Promise<void> {
  switch (action.type) {
    case "update_record": {
      const { recordId, data } = action.config as {
        recordId: string;
        data: Record<string, unknown>;
      };
      if (recordId && data) {
        await baseService.updateRecord(recordId, data);
      }
      break;
    }
    case "create_record": {
      const { tableId, data } = action.config as {
        tableId: string;
        data: Record<string, unknown>;
      };
      if (tableId && data) {
        await baseService.createRecord(
          tableId,
          { data },
          "system"
        );
      }
      break;
    }
    case "send_message": {
      // Placeholder: in a full implementation, this would call the messenger service
      // to send a message to a chat/channel
      break;
    }
    case "http_request": {
      const { url, method, headers, body } = action.config as {
        url?: string;
        method?: string;
        headers?: Record<string, string>;
        body?: unknown;
      };
      if (url) {
        await fetch(url, {
          method: method || "POST",
          headers: {
            "Content-Type": "application/json",
            ...(headers || {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      }
      break;
    }
  }
}

export function createAutomationWorker(): Worker<AutomationJobData> {
  const worker = new Worker<AutomationJobData>(
    QUEUE_NAME,
    async (job) => {
      const { automationId, triggerEvent } = job.data;

      const automation = await automationsService.getAutomationById(automationId);
      if (!automation || !automation.enabled) return;

      const actions = automation.actions as Array<{
        type: string;
        config: Record<string, unknown>;
      }>;

      try {
        for (const action of actions) {
          await executeAction(action, triggerEvent);
        }

        await automationsService.createRun(
          automationId,
          triggerEvent,
          "success"
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await automationsService.createRun(
          automationId,
          triggerEvent,
          "failed",
          errorMsg
        );
        throw err;
      }
    },
    connectionOpts
  );

  return worker;
}

export async function enqueueAutomation(
  automationId: string,
  triggerEvent: Record<string, unknown>
): Promise<void> {
  await automationQueue.add("run-automation", {
    automationId,
    triggerEvent,
  });
}
