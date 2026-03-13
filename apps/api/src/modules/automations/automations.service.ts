import { db } from "../../db/index.js";
import {
  baseAutomations,
  automationRuns,
  baseRecords,
  bases,
} from "../../db/schema/index.js";
import { eq, and, isNull, asc, sql } from "drizzle-orm";
import type {
  BaseAutomation,
  AutomationRun,
} from "../../db/schema/index.js";
import type {
  CreateAutomationInput,
  UpdateAutomationInput,
  TriggerType,
} from "./automations.schemas.js";

export class AutomationsService {
  async createAutomation(
    baseId: string,
    input: CreateAutomationInput
  ): Promise<BaseAutomation> {
    const [automation] = await db
      .insert(baseAutomations)
      .values({
        baseId,
        name: input.name,
        trigger: input.trigger,
        actions: input.actions,
        type: input.type,
        enabled: input.enabled,
      })
      .returning();

    if (!automation) throw new Error("Failed to create automation");
    return automation;
  }

  async getAutomationsByBase(baseId: string): Promise<BaseAutomation[]> {
    return db
      .select()
      .from(baseAutomations)
      .where(eq(baseAutomations.baseId, baseId))
      .orderBy(asc(baseAutomations.createdAt));
  }

  async getAutomationById(id: string): Promise<BaseAutomation | null> {
    const [automation] = await db
      .select()
      .from(baseAutomations)
      .where(eq(baseAutomations.id, id));
    return automation ?? null;
  }

  async updateAutomation(
    id: string,
    input: UpdateAutomationInput
  ): Promise<BaseAutomation | null> {
    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.trigger !== undefined) updateData.trigger = input.trigger;
    if (input.actions !== undefined) updateData.actions = input.actions;
    if (input.enabled !== undefined) updateData.enabled = input.enabled;

    if (Object.keys(updateData).length === 0) return null;

    const [updated] = await db
      .update(baseAutomations)
      .set(updateData)
      .where(eq(baseAutomations.id, id))
      .returning();

    return updated ?? null;
  }

  async deleteAutomation(id: string): Promise<boolean> {
    const result = await db
      .delete(baseAutomations)
      .where(eq(baseAutomations.id, id))
      .returning({ id: baseAutomations.id });
    return result.length > 0;
  }

  async getAutomationBaseId(automationId: string): Promise<string | null> {
    const automation = await this.getAutomationById(automationId);
    return automation?.baseId ?? null;
  }

  async findMatchingAutomations(
    baseId: string,
    triggerType: TriggerType,
    tableId?: string
  ): Promise<BaseAutomation[]> {
    const automations = await db
      .select()
      .from(baseAutomations)
      .where(
        and(
          eq(baseAutomations.baseId, baseId),
          eq(baseAutomations.enabled, true)
        )
      );

    return automations.filter((a) => {
      const trigger = a.trigger as { type: string; tableId?: string };
      if (trigger.type !== triggerType) return false;
      if (tableId && trigger.tableId && trigger.tableId !== tableId)
        return false;
      return true;
    });
  }

  async createRun(
    automationId: string,
    triggerEvent: Record<string, unknown>,
    status: "success" | "failed",
    error?: string
  ): Promise<AutomationRun> {
    const [run] = await db
      .insert(automationRuns)
      .values({
        automationId,
        triggerEvent,
        status,
        error: error ?? null,
        completedAt: new Date(),
      })
      .returning();

    if (!run) throw new Error("Failed to create automation run");
    return run;
  }

  async getRunsByAutomation(automationId: string): Promise<AutomationRun[]> {
    return db
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.automationId, automationId))
      .orderBy(asc(automationRuns.startedAt));
  }
}

export const automationsService = new AutomationsService();
