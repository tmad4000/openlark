import { FastifyInstance } from "fastify";
import { db } from "../db";
import {
  okrCycles,
  objectives,
  keyResults,
  okrCheckins,
  okrAlignments,
} from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_CYCLE_STATUSES = ["creating", "aligning", "following_up", "reviewing"];
const VALID_OBJECTIVE_VISIBILITIES = ["everyone", "leaders", "team"];
const VALID_OBJECTIVE_STATUSES = ["draft", "active", "completed"];

// --- Interfaces ---

interface CreateCycleBody {
  name: string;
  start_date: string;
  end_date: string;
  status?: string;
}

interface UpdateCycleBody {
  name?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
}

interface CreateObjectiveBody {
  cycle_id: string;
  title: string;
  description?: string;
  parent_objective_id?: string;
  visibility?: string;
  status?: string;
}

interface UpdateObjectiveBody {
  title?: string;
  description?: string;
  parent_objective_id?: string | null;
  visibility?: string;
  status?: string;
}

interface CreateKeyResultBody {
  objective_id: string;
  title: string;
  target_value: string;
  current_value?: string;
  weight?: string;
  unit?: string;
}

interface UpdateKeyResultBody {
  title?: string;
  target_value?: string;
  current_value?: string;
  weight?: string;
  score?: string;
  unit?: string;
}

interface CreateCheckinBody {
  key_result_id: string;
  value: string;
  notes?: string;
}

interface CreateAlignmentBody {
  objective_id: string;
  aligned_to_objective_id: string;
}

interface CyclesQuery {
  status?: string;
}

interface ObjectivesQuery {
  cycle_id?: string;
  owner_id?: string;
  status?: string;
}

export async function okrsRoutes(fastify: FastifyInstance) {
  // ========================
  // OKR Cycles
  // ========================

  // POST /okrs/cycles - Create cycle
  fastify.post<{ Body: CreateCycleBody }>(
    "/okrs/cycles",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { name, start_date, end_date, status } = request.body || {};

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return reply.status(400).send({ error: "Name is required" });
      }

      if (!start_date || !end_date) {
        return reply.status(400).send({ error: "start_date and end_date are required" });
      }

      const startDate = new Date(start_date);
      const endDate = new Date(end_date);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return reply.status(400).send({ error: "Invalid date format" });
      }

      if (endDate <= startDate) {
        return reply.status(400).send({ error: "end_date must be after start_date" });
      }

      if (status && !VALID_CYCLE_STATUSES.includes(status)) {
        return reply.status(400).send({ error: `Invalid status: ${status}` });
      }

      const [cycle] = await db
        .insert(okrCycles)
        .values({
          orgId: user.orgId!,
          name: name.trim(),
          startDate,
          endDate,
          status: (status as typeof okrCycles.$inferInsert.status) || "creating",
        })
        .returning();

      return reply.status(201).send({ cycle });
    }
  );

  // GET /okrs/cycles - List cycles
  fastify.get<{ Querystring: CyclesQuery }>(
    "/okrs/cycles",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { status } = request.query;

      const conditions = [eq(okrCycles.orgId, user.orgId!)];

      if (status && VALID_CYCLE_STATUSES.includes(status)) {
        conditions.push(eq(okrCycles.status, status as typeof okrCycles.$inferSelect.status));
      }

      const cycles = await db
        .select()
        .from(okrCycles)
        .where(and(...conditions))
        .orderBy(desc(okrCycles.createdAt));

      return reply.send({ cycles });
    }
  );

  // GET /okrs/cycles/:id - Get single cycle
  fastify.get<{ Params: { id: string } }>(
    "/okrs/cycles/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { id } = request.params;

      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid cycle ID" });
      }

      const [cycle] = await db
        .select()
        .from(okrCycles)
        .where(and(eq(okrCycles.id, id), eq(okrCycles.orgId, user.orgId!)))
        .limit(1);

      if (!cycle) {
        return reply.status(404).send({ error: "Cycle not found" });
      }

      return reply.send({ cycle });
    }
  );

  // PATCH /okrs/cycles/:id - Update cycle
  fastify.patch<{ Params: { id: string }; Body: UpdateCycleBody }>(
    "/okrs/cycles/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { id } = request.params;
      const body = request.body || {};

      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid cycle ID" });
      }

      const [existing] = await db
        .select()
        .from(okrCycles)
        .where(and(eq(okrCycles.id, id), eq(okrCycles.orgId, user.orgId!)))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ error: "Cycle not found" });
      }

      const updates: Record<string, unknown> = {};

      if (body.name !== undefined) {
        if (typeof body.name !== "string" || body.name.trim().length === 0) {
          return reply.status(400).send({ error: "Name cannot be empty" });
        }
        updates.name = body.name.trim();
      }

      if (body.start_date !== undefined) {
        const d = new Date(body.start_date);
        if (isNaN(d.getTime())) {
          return reply.status(400).send({ error: "Invalid start_date format" });
        }
        updates.startDate = d;
      }

      if (body.end_date !== undefined) {
        const d = new Date(body.end_date);
        if (isNaN(d.getTime())) {
          return reply.status(400).send({ error: "Invalid end_date format" });
        }
        updates.endDate = d;
      }

      if (body.status !== undefined) {
        if (!VALID_CYCLE_STATUSES.includes(body.status)) {
          return reply.status(400).send({ error: `Invalid status: ${body.status}` });
        }
        updates.status = body.status;
      }

      const [updated] = await db
        .update(okrCycles)
        .set(updates)
        .where(eq(okrCycles.id, id))
        .returning();

      return reply.send({ cycle: updated });
    }
  );

  // DELETE /okrs/cycles/:id - Delete cycle
  fastify.delete<{ Params: { id: string } }>(
    "/okrs/cycles/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { id } = request.params;

      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid cycle ID" });
      }

      const [existing] = await db
        .select()
        .from(okrCycles)
        .where(and(eq(okrCycles.id, id), eq(okrCycles.orgId, user.orgId!)))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ error: "Cycle not found" });
      }

      await db.delete(okrCycles).where(eq(okrCycles.id, id));

      return reply.send({ success: true });
    }
  );

  // ========================
  // Objectives
  // ========================

  // POST /okrs/objectives - Create objective
  fastify.post<{ Body: CreateObjectiveBody }>(
    "/okrs/objectives",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { cycle_id, title, description, parent_objective_id, visibility, status } =
        request.body || {};

      if (!cycle_id || !UUID_REGEX.test(cycle_id)) {
        return reply.status(400).send({ error: "Valid cycle_id is required" });
      }

      if (!title || typeof title !== "string" || title.trim().length === 0) {
        return reply.status(400).send({ error: "Title is required" });
      }

      // Verify cycle exists and belongs to user's org
      const [cycle] = await db
        .select()
        .from(okrCycles)
        .where(and(eq(okrCycles.id, cycle_id), eq(okrCycles.orgId, user.orgId!)))
        .limit(1);

      if (!cycle) {
        return reply.status(404).send({ error: "Cycle not found" });
      }

      if (parent_objective_id && !UUID_REGEX.test(parent_objective_id)) {
        return reply.status(400).send({ error: "Invalid parent_objective_id" });
      }

      if (visibility && !VALID_OBJECTIVE_VISIBILITIES.includes(visibility)) {
        return reply.status(400).send({ error: `Invalid visibility: ${visibility}` });
      }

      if (status && !VALID_OBJECTIVE_STATUSES.includes(status)) {
        return reply.status(400).send({ error: `Invalid status: ${status}` });
      }

      const [objective] = await db
        .insert(objectives)
        .values({
          cycleId: cycle_id,
          ownerId: user.id,
          title: title.trim(),
          description: description?.trim() || null,
          parentObjectiveId: parent_objective_id || null,
          visibility: (visibility as typeof objectives.$inferInsert.visibility) || "everyone",
          status: (status as typeof objectives.$inferInsert.status) || "draft",
        })
        .returning();

      return reply.status(201).send({ objective });
    }
  );

  // GET /okrs/objectives - List objectives
  fastify.get<{ Querystring: ObjectivesQuery }>(
    "/okrs/objectives",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { cycle_id, owner_id, status } = request.query;

      const conditions = [];

      if (cycle_id) {
        if (!UUID_REGEX.test(cycle_id)) {
          return reply.status(400).send({ error: "Invalid cycle_id" });
        }
        conditions.push(eq(objectives.cycleId, cycle_id));
      }

      if (owner_id) {
        if (!UUID_REGEX.test(owner_id)) {
          return reply.status(400).send({ error: "Invalid owner_id" });
        }
        conditions.push(eq(objectives.ownerId, owner_id));
      }

      if (status && VALID_OBJECTIVE_STATUSES.includes(status)) {
        conditions.push(eq(objectives.status, status as typeof objectives.$inferSelect.status));
      }

      const rows = await db
        .select()
        .from(objectives)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(objectives.createdAt));

      return reply.send({ objectives: rows });
    }
  );

  // GET /okrs/objectives/:id - Get single objective with key results
  fastify.get<{ Params: { id: string } }>(
    "/okrs/objectives/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid objective ID" });
      }

      const [objective] = await db
        .select()
        .from(objectives)
        .where(eq(objectives.id, id))
        .limit(1);

      if (!objective) {
        return reply.status(404).send({ error: "Objective not found" });
      }

      const krs = await db
        .select()
        .from(keyResults)
        .where(eq(keyResults.objectiveId, id))
        .orderBy(keyResults.createdAt);

      return reply.send({ objective: { ...objective, key_results: krs } });
    }
  );

  // PATCH /okrs/objectives/:id - Update objective
  fastify.patch<{ Params: { id: string }; Body: UpdateObjectiveBody }>(
    "/okrs/objectives/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body || {};

      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid objective ID" });
      }

      const [existing] = await db
        .select()
        .from(objectives)
        .where(eq(objectives.id, id))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ error: "Objective not found" });
      }

      const updates: Record<string, unknown> = {};

      if (body.title !== undefined) {
        if (typeof body.title !== "string" || body.title.trim().length === 0) {
          return reply.status(400).send({ error: "Title cannot be empty" });
        }
        updates.title = body.title.trim();
      }

      if (body.description !== undefined) {
        updates.description = body.description?.trim() || null;
      }

      if (body.parent_objective_id !== undefined) {
        if (body.parent_objective_id !== null && !UUID_REGEX.test(body.parent_objective_id)) {
          return reply.status(400).send({ error: "Invalid parent_objective_id" });
        }
        updates.parentObjectiveId = body.parent_objective_id;
      }

      if (body.visibility !== undefined) {
        if (!VALID_OBJECTIVE_VISIBILITIES.includes(body.visibility)) {
          return reply.status(400).send({ error: `Invalid visibility: ${body.visibility}` });
        }
        updates.visibility = body.visibility;
      }

      if (body.status !== undefined) {
        if (!VALID_OBJECTIVE_STATUSES.includes(body.status)) {
          return reply.status(400).send({ error: `Invalid status: ${body.status}` });
        }
        updates.status = body.status;
      }

      const [updated] = await db
        .update(objectives)
        .set(updates)
        .where(eq(objectives.id, id))
        .returning();

      return reply.send({ objective: updated });
    }
  );

  // DELETE /okrs/objectives/:id - Delete objective
  fastify.delete<{ Params: { id: string } }>(
    "/okrs/objectives/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid objective ID" });
      }

      const [existing] = await db
        .select()
        .from(objectives)
        .where(eq(objectives.id, id))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ error: "Objective not found" });
      }

      await db.delete(objectives).where(eq(objectives.id, id));

      return reply.send({ success: true });
    }
  );

  // ========================
  // Key Results
  // ========================

  // POST /okrs/key-results - Create key result
  fastify.post<{ Body: CreateKeyResultBody }>(
    "/okrs/key-results",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { objective_id, title, target_value, current_value, weight, unit } =
        request.body || {};

      if (!objective_id || !UUID_REGEX.test(objective_id)) {
        return reply.status(400).send({ error: "Valid objective_id is required" });
      }

      if (!title || typeof title !== "string" || title.trim().length === 0) {
        return reply.status(400).send({ error: "Title is required" });
      }

      if (target_value === undefined || target_value === null) {
        return reply.status(400).send({ error: "target_value is required" });
      }

      // Verify objective exists
      const [objective] = await db
        .select()
        .from(objectives)
        .where(eq(objectives.id, objective_id))
        .limit(1);

      if (!objective) {
        return reply.status(404).send({ error: "Objective not found" });
      }

      const [kr] = await db
        .insert(keyResults)
        .values({
          objectiveId: objective_id,
          title: title.trim(),
          targetValue: String(target_value),
          currentValue: current_value !== undefined ? String(current_value) : "0",
          weight: weight !== undefined ? String(weight) : "1",
          unit: unit?.trim() || null,
        })
        .returning();

      return reply.status(201).send({ key_result: kr });
    }
  );

  // PATCH /okrs/key-results/:id - Update key result
  fastify.patch<{ Params: { id: string }; Body: UpdateKeyResultBody }>(
    "/okrs/key-results/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body || {};

      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid key result ID" });
      }

      const [existing] = await db
        .select()
        .from(keyResults)
        .where(eq(keyResults.id, id))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ error: "Key result not found" });
      }

      const updates: Record<string, unknown> = {};

      if (body.title !== undefined) {
        if (typeof body.title !== "string" || body.title.trim().length === 0) {
          return reply.status(400).send({ error: "Title cannot be empty" });
        }
        updates.title = body.title.trim();
      }

      if (body.target_value !== undefined) updates.targetValue = String(body.target_value);
      if (body.current_value !== undefined) updates.currentValue = String(body.current_value);
      if (body.weight !== undefined) updates.weight = String(body.weight);
      if (body.score !== undefined) updates.score = String(body.score);
      if (body.unit !== undefined) updates.unit = body.unit?.trim() || null;

      const [updated] = await db
        .update(keyResults)
        .set(updates)
        .where(eq(keyResults.id, id))
        .returning();

      return reply.send({ key_result: updated });
    }
  );

  // DELETE /okrs/key-results/:id - Delete key result
  fastify.delete<{ Params: { id: string } }>(
    "/okrs/key-results/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid key result ID" });
      }

      const [existing] = await db
        .select()
        .from(keyResults)
        .where(eq(keyResults.id, id))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ error: "Key result not found" });
      }

      await db.delete(keyResults).where(eq(keyResults.id, id));

      return reply.send({ success: true });
    }
  );

  // ========================
  // OKR Check-ins
  // ========================

  // POST /okrs/checkins - Create check-in
  fastify.post<{ Body: CreateCheckinBody }>(
    "/okrs/checkins",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { key_result_id, value, notes } = request.body || {};

      if (!key_result_id || !UUID_REGEX.test(key_result_id)) {
        return reply.status(400).send({ error: "Valid key_result_id is required" });
      }

      if (value === undefined || value === null) {
        return reply.status(400).send({ error: "value is required" });
      }

      // Verify key result exists
      const [kr] = await db
        .select()
        .from(keyResults)
        .where(eq(keyResults.id, key_result_id))
        .limit(1);

      if (!kr) {
        return reply.status(404).send({ error: "Key result not found" });
      }

      // Create check-in
      const [checkin] = await db
        .insert(okrCheckins)
        .values({
          keyResultId: key_result_id,
          userId: user.id,
          value: String(value),
          notes: notes?.trim() || null,
        })
        .returning();

      // Update current_value on the key result
      await db
        .update(keyResults)
        .set({ currentValue: String(value) })
        .where(eq(keyResults.id, key_result_id));

      // Recalculate score (current / target, clamped to 0-1)
      const target = parseFloat(kr.targetValue);
      const current = parseFloat(String(value));
      if (target > 0) {
        const score = Math.min(Math.max(current / target, 0), 1);
        await db
          .update(keyResults)
          .set({ score: String(score) })
          .where(eq(keyResults.id, key_result_id));
      }

      return reply.status(201).send({ checkin });
    }
  );

  // GET /okrs/checkins - List check-ins for a key result
  fastify.get<{ Querystring: { key_result_id?: string } }>(
    "/okrs/checkins",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { key_result_id } = request.query;

      if (!key_result_id || !UUID_REGEX.test(key_result_id)) {
        return reply.status(400).send({ error: "Valid key_result_id query parameter is required" });
      }

      const checkins = await db
        .select()
        .from(okrCheckins)
        .where(eq(okrCheckins.keyResultId, key_result_id))
        .orderBy(desc(okrCheckins.createdAt));

      return reply.send({ checkins });
    }
  );

  // ========================
  // OKR Alignments
  // ========================

  // POST /okrs/alignments - Create alignment
  fastify.post<{ Body: CreateAlignmentBody }>(
    "/okrs/alignments",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { objective_id, aligned_to_objective_id } = request.body || {};

      if (!objective_id || !UUID_REGEX.test(objective_id)) {
        return reply.status(400).send({ error: "Valid objective_id is required" });
      }

      if (!aligned_to_objective_id || !UUID_REGEX.test(aligned_to_objective_id)) {
        return reply.status(400).send({ error: "Valid aligned_to_objective_id is required" });
      }

      if (objective_id === aligned_to_objective_id) {
        return reply.status(400).send({ error: "Cannot align an objective to itself" });
      }

      // Verify both objectives exist
      const [obj1] = await db
        .select()
        .from(objectives)
        .where(eq(objectives.id, objective_id))
        .limit(1);

      if (!obj1) {
        return reply.status(404).send({ error: "Objective not found" });
      }

      const [obj2] = await db
        .select()
        .from(objectives)
        .where(eq(objectives.id, aligned_to_objective_id))
        .limit(1);

      if (!obj2) {
        return reply.status(404).send({ error: "Aligned-to objective not found" });
      }

      const [alignment] = await db
        .insert(okrAlignments)
        .values({
          objectiveId: objective_id,
          alignedToObjectiveId: aligned_to_objective_id,
          confirmed: false,
        })
        .onConflictDoNothing()
        .returning();

      if (!alignment) {
        return reply.status(409).send({ error: "Alignment already exists" });
      }

      return reply.status(201).send({ alignment });
    }
  );

  // PATCH /okrs/alignments/:objectiveId/:alignedToObjectiveId/confirm - Confirm alignment
  fastify.patch<{ Params: { objectiveId: string; alignedToObjectiveId: string } }>(
    "/okrs/alignments/:objectiveId/:alignedToObjectiveId/confirm",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { objectiveId, alignedToObjectiveId } = request.params;

      if (!UUID_REGEX.test(objectiveId) || !UUID_REGEX.test(alignedToObjectiveId)) {
        return reply.status(400).send({ error: "Invalid ID format" });
      }

      const [updated] = await db
        .update(okrAlignments)
        .set({ confirmed: true })
        .where(
          and(
            eq(okrAlignments.objectiveId, objectiveId),
            eq(okrAlignments.alignedToObjectiveId, alignedToObjectiveId)
          )
        )
        .returning();

      if (!updated) {
        return reply.status(404).send({ error: "Alignment not found" });
      }

      return reply.send({ alignment: updated });
    }
  );

  // GET /okrs/alignments - List alignments for an objective
  fastify.get<{ Querystring: { objective_id?: string } }>(
    "/okrs/alignments",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { objective_id } = request.query;

      if (!objective_id || !UUID_REGEX.test(objective_id)) {
        return reply.status(400).send({ error: "Valid objective_id query parameter is required" });
      }

      const alignments = await db
        .select()
        .from(okrAlignments)
        .where(eq(okrAlignments.objectiveId, objective_id));

      return reply.send({ alignments });
    }
  );

  // DELETE /okrs/alignments/:objectiveId/:alignedToObjectiveId - Remove alignment
  fastify.delete<{ Params: { objectiveId: string; alignedToObjectiveId: string } }>(
    "/okrs/alignments/:objectiveId/:alignedToObjectiveId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { objectiveId, alignedToObjectiveId } = request.params;

      if (!UUID_REGEX.test(objectiveId) || !UUID_REGEX.test(alignedToObjectiveId)) {
        return reply.status(400).send({ error: "Invalid ID format" });
      }

      await db
        .delete(okrAlignments)
        .where(
          and(
            eq(okrAlignments.objectiveId, objectiveId),
            eq(okrAlignments.alignedToObjectiveId, alignedToObjectiveId)
          )
        );

      return reply.send({ success: true });
    }
  );
}
