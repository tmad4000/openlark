import { db } from "../../db/index.js";
import {
  okrCycles,
  objectives,
  keyResults,
  okrCheckins,
  okrAlignments,
} from "../../db/schema/index.js";
import { eq, and, isNull, desc } from "drizzle-orm";
import type {
  CreateCycleInput,
  UpdateCycleInput,
  CyclesQueryInput,
  CreateObjectiveInput,
  UpdateObjectiveInput,
  ObjectivesQueryInput,
  CreateKeyResultInput,
  UpdateKeyResultInput,
  CreateCheckinInput,
  CreateAlignmentInput,
} from "./okrs.schemas.js";

export class OkrsService {
  // ============ CYCLES ============

  async createCycle(input: CreateCycleInput, orgId: string) {
    const [cycle] = await db
      .insert(okrCycles)
      .values({
        orgId,
        name: input.name,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        status: input.status,
      })
      .returning();

    if (!cycle) throw new Error("Failed to create OKR cycle");
    return cycle;
  }

  async getCycleById(cycleId: string) {
    const [cycle] = await db
      .select()
      .from(okrCycles)
      .where(eq(okrCycles.id, cycleId));
    return cycle || null;
  }

  async getCycles(orgId: string, query: CyclesQueryInput) {
    const conditions = [eq(okrCycles.orgId, orgId)];
    if (query.status) conditions.push(eq(okrCycles.status, query.status));

    return db
      .select()
      .from(okrCycles)
      .where(and(...conditions))
      .orderBy(desc(okrCycles.createdAt))
      .limit(query.limit)
      .offset(query.offset);
  }

  async updateCycle(cycleId: string, input: UpdateCycleInput) {
    const updates: Record<string, unknown> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.startDate !== undefined)
      updates.startDate = new Date(input.startDate);
    if (input.endDate !== undefined) updates.endDate = new Date(input.endDate);
    if (input.status !== undefined) updates.status = input.status;

    if (Object.keys(updates).length === 0) return this.getCycleById(cycleId);

    const [updated] = await db
      .update(okrCycles)
      .set(updates)
      .where(eq(okrCycles.id, cycleId))
      .returning();

    return updated || null;
  }

  async deleteCycle(cycleId: string) {
    const [deleted] = await db
      .delete(okrCycles)
      .where(eq(okrCycles.id, cycleId))
      .returning();
    return deleted || null;
  }

  // ============ OBJECTIVES ============

  async createObjective(input: CreateObjectiveInput, userId: string) {
    const [objective] = await db
      .insert(objectives)
      .values({
        cycleId: input.cycleId,
        ownerId: userId,
        title: input.title,
        description: input.description,
        parentObjectiveId: input.parentObjectiveId,
        visibility: input.visibility,
        status: input.status,
      })
      .returning();

    if (!objective) throw new Error("Failed to create objective");
    return objective;
  }

  async getObjectiveById(objectiveId: string) {
    const [objective] = await db
      .select()
      .from(objectives)
      .where(eq(objectives.id, objectiveId));

    if (!objective) return null;

    const krs = await db
      .select()
      .from(keyResults)
      .where(eq(keyResults.objectiveId, objectiveId));

    return { ...objective, keyResults: krs };
  }

  async getObjectives(orgId: string, query: ObjectivesQueryInput) {
    const conditions: ReturnType<typeof eq>[] = [];
    if (query.cycleId) conditions.push(eq(objectives.cycleId, query.cycleId));
    if (query.ownerId) conditions.push(eq(objectives.ownerId, query.ownerId));
    if (query.status) conditions.push(eq(objectives.status, query.status));

    // Filter by org via cycle
    const cycleIds = await db
      .select({ id: okrCycles.id })
      .from(okrCycles)
      .where(eq(okrCycles.orgId, orgId));

    if (cycleIds.length === 0) return [];

    const allObjectives = await db
      .select()
      .from(objectives)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(objectives.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    // Filter to only objectives in this org's cycles
    const orgCycleIds = new Set(cycleIds.map((c) => c.id));
    return allObjectives.filter((o) => orgCycleIds.has(o.cycleId));
  }

  async updateObjective(objectiveId: string, input: UpdateObjectiveInput) {
    const updates: Record<string, unknown> = {};
    if (input.title !== undefined) updates.title = input.title;
    if (input.description !== undefined) updates.description = input.description;
    if (input.parentObjectiveId !== undefined)
      updates.parentObjectiveId = input.parentObjectiveId;
    if (input.visibility !== undefined) updates.visibility = input.visibility;
    if (input.status !== undefined) updates.status = input.status;

    if (Object.keys(updates).length === 0)
      return this.getObjectiveById(objectiveId);

    const [updated] = await db
      .update(objectives)
      .set(updates)
      .where(eq(objectives.id, objectiveId))
      .returning();

    return updated ? this.getObjectiveById(updated.id) : null;
  }

  async deleteObjective(objectiveId: string) {
    const [deleted] = await db
      .delete(objectives)
      .where(eq(objectives.id, objectiveId))
      .returning();
    return deleted || null;
  }

  // ============ KEY RESULTS ============

  async createKeyResult(input: CreateKeyResultInput) {
    const [kr] = await db
      .insert(keyResults)
      .values({
        objectiveId: input.objectiveId,
        title: input.title,
        targetValue: String(input.targetValue),
        currentValue: String(input.currentValue),
        weight: String(input.weight),
        unit: input.unit,
      })
      .returning();

    if (!kr) throw new Error("Failed to create key result");
    return kr;
  }

  async getKeyResultById(keyResultId: string) {
    const [kr] = await db
      .select()
      .from(keyResults)
      .where(eq(keyResults.id, keyResultId));
    return kr || null;
  }

  async getKeyResultsByObjective(objectiveId: string) {
    return db
      .select()
      .from(keyResults)
      .where(eq(keyResults.objectiveId, objectiveId));
  }

  async updateKeyResult(keyResultId: string, input: UpdateKeyResultInput) {
    const updates: Record<string, unknown> = {};
    if (input.title !== undefined) updates.title = input.title;
    if (input.targetValue !== undefined)
      updates.targetValue = String(input.targetValue);
    if (input.currentValue !== undefined)
      updates.currentValue = String(input.currentValue);
    if (input.weight !== undefined) updates.weight = String(input.weight);
    if (input.unit !== undefined) updates.unit = input.unit;

    // Recalculate score if current or target value changed
    if (input.currentValue !== undefined || input.targetValue !== undefined) {
      const existing = await this.getKeyResultById(keyResultId);
      if (existing) {
        const target =
          input.targetValue !== undefined
            ? input.targetValue
            : Number(existing.targetValue);
        const current =
          input.currentValue !== undefined
            ? input.currentValue
            : Number(existing.currentValue);
        const score = target > 0 ? Math.min(current / target, 1) : 0;
        updates.score = String(score);
      }
    }

    if (Object.keys(updates).length === 0)
      return this.getKeyResultById(keyResultId);

    const [updated] = await db
      .update(keyResults)
      .set(updates)
      .where(eq(keyResults.id, keyResultId))
      .returning();

    return updated || null;
  }

  async deleteKeyResult(keyResultId: string) {
    const [deleted] = await db
      .delete(keyResults)
      .where(eq(keyResults.id, keyResultId))
      .returning();
    return deleted || null;
  }

  // ============ CHECKINS ============

  async createCheckin(input: CreateCheckinInput, userId: string) {
    const [checkin] = await db
      .insert(okrCheckins)
      .values({
        keyResultId: input.keyResultId,
        userId,
        value: String(input.value),
        notes: input.notes,
      })
      .returning();

    if (!checkin) throw new Error("Failed to create checkin");

    // Update the key result's current value
    await db
      .update(keyResults)
      .set({ currentValue: String(input.value) })
      .where(eq(keyResults.id, input.keyResultId));

    // Recalculate score
    const kr = await this.getKeyResultById(input.keyResultId);
    if (kr) {
      const target = Number(kr.targetValue);
      const score = target > 0 ? Math.min(input.value / target, 1) : 0;
      await db
        .update(keyResults)
        .set({ score: String(score) })
        .where(eq(keyResults.id, input.keyResultId));
    }

    return checkin;
  }

  async getCheckinsByKeyResult(keyResultId: string) {
    return db
      .select()
      .from(okrCheckins)
      .where(eq(okrCheckins.keyResultId, keyResultId))
      .orderBy(desc(okrCheckins.createdAt));
  }

  // ============ ALIGNMENTS ============

  async createAlignment(input: CreateAlignmentInput) {
    const [alignment] = await db
      .insert(okrAlignments)
      .values({
        objectiveId: input.objectiveId,
        alignedToObjectiveId: input.alignedToObjectiveId,
        confirmed: false,
      })
      .returning();

    if (!alignment) throw new Error("Failed to create alignment");
    return alignment;
  }

  async confirmAlignment(
    objectiveId: string,
    alignedToObjectiveId: string,
    confirmed: boolean
  ) {
    const [updated] = await db
      .update(okrAlignments)
      .set({ confirmed })
      .where(
        and(
          eq(okrAlignments.objectiveId, objectiveId),
          eq(okrAlignments.alignedToObjectiveId, alignedToObjectiveId)
        )
      )
      .returning();

    return updated || null;
  }

  async getAlignmentsByObjective(objectiveId: string) {
    return db
      .select()
      .from(okrAlignments)
      .where(eq(okrAlignments.objectiveId, objectiveId));
  }

  async deleteAlignment(objectiveId: string, alignedToObjectiveId: string) {
    const [deleted] = await db
      .delete(okrAlignments)
      .where(
        and(
          eq(okrAlignments.objectiveId, objectiveId),
          eq(okrAlignments.alignedToObjectiveId, alignedToObjectiveId)
        )
      )
      .returning();
    return deleted || null;
  }
}

export const okrsService = new OkrsService();
