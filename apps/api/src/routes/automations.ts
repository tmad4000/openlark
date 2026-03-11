import { FastifyInstance } from "fastify";
import { db } from "../db";
import {
  baseAutomations,
  automationRuns,
  bases,
  baseTables,
  type AutomationTrigger,
  type AutomationAction,
} from "../db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { queueAutomation } from "../lib/automation-worker";

// UUID validation regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Valid trigger types
const VALID_TRIGGER_TYPES = [
  "record_created",
  "record_updated",
  "record_matches_condition",
  "scheduled",
  "button_clicked",
  "webhook_received",
] as const;

// Valid action types
const VALID_ACTION_TYPES = [
  "update_record",
  "create_record",
  "send_message",
  "http_request",
] as const;

interface CreateAutomationBody {
  name: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  enabled?: boolean;
  type?: "automation" | "workflow";
}

interface UpdateAutomationBody {
  name?: string;
  trigger?: AutomationTrigger;
  actions?: AutomationAction[];
  enabled?: boolean;
}

export async function automationsRoutes(fastify: FastifyInstance) {
  /**
   * GET /bases/:id/automations - List automations for a base
   * Returns: Array of automations
   */
  fastify.get<{ Params: { id: string } }>(
    "/bases/:id/automations",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid base ID format",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const orgId = request.user.orgId;

      // Check if base exists and belongs to user's org
      const [base] = await db
        .select()
        .from(bases)
        .where(and(eq(bases.id, id), eq(bases.orgId, orgId)))
        .limit(1);

      if (!base) {
        return reply.status(404).send({
          error: "Base not found",
        });
      }

      // Get automations
      const automations = await db
        .select({
          id: baseAutomations.id,
          baseId: baseAutomations.baseId,
          name: baseAutomations.name,
          trigger: baseAutomations.trigger,
          actions: baseAutomations.actions,
          enabled: baseAutomations.enabled,
          type: baseAutomations.type,
          createdAt: baseAutomations.createdAt,
          updatedAt: baseAutomations.updatedAt,
        })
        .from(baseAutomations)
        .where(eq(baseAutomations.baseId, id))
        .orderBy(desc(baseAutomations.createdAt));

      return reply.status(200).send({
        automations,
      });
    }
  );

  /**
   * POST /bases/:id/automations - Create an automation
   * Body: { name, trigger, actions, enabled?, type? }
   * Returns: Created automation
   */
  fastify.post<{ Params: { id: string }; Body: CreateAutomationBody }>(
    "/bases/:id/automations",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { name, trigger, actions, enabled = true, type = "automation" } = request.body;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid base ID format",
        });
      }

      // Validate name
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return reply.status(400).send({
          error: "name is required and must be a non-empty string",
        });
      }

      if (name.length > 255) {
        return reply.status(400).send({
          error: "name must be at most 255 characters",
        });
      }

      // Validate trigger
      if (!trigger || typeof trigger !== "object" || !trigger.type) {
        return reply.status(400).send({
          error: "trigger is required and must have a type property",
        });
      }

      if (!VALID_TRIGGER_TYPES.includes(trigger.type as (typeof VALID_TRIGGER_TYPES)[number])) {
        return reply.status(400).send({
          error: `trigger.type must be one of: ${VALID_TRIGGER_TYPES.join(", ")}`,
        });
      }

      // Validate actions
      if (!actions || !Array.isArray(actions) || actions.length === 0) {
        return reply.status(400).send({
          error: "actions is required and must be a non-empty array",
        });
      }

      for (const action of actions) {
        if (!action || typeof action !== "object" || !action.type) {
          return reply.status(400).send({
            error: "Each action must have a type property",
          });
        }

        if (!VALID_ACTION_TYPES.includes(action.type as (typeof VALID_ACTION_TYPES)[number])) {
          return reply.status(400).send({
            error: `action.type must be one of: ${VALID_ACTION_TYPES.join(", ")}`,
          });
        }
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const orgId = request.user.orgId;

      // Check if base exists and belongs to user's org
      const [base] = await db
        .select()
        .from(bases)
        .where(and(eq(bases.id, id), eq(bases.orgId, orgId)))
        .limit(1);

      if (!base) {
        return reply.status(404).send({
          error: "Base not found",
        });
      }

      // Create the automation
      const [automation] = await db
        .insert(baseAutomations)
        .values({
          baseId: id,
          name: name.trim(),
          trigger,
          actions,
          enabled,
          type,
        })
        .returning();

      return reply.status(201).send({
        id: automation.id,
        baseId: automation.baseId,
        name: automation.name,
        trigger: automation.trigger,
        actions: automation.actions,
        enabled: automation.enabled,
        type: automation.type,
        createdAt: automation.createdAt,
        updatedAt: automation.updatedAt,
      });
    }
  );

  /**
   * GET /automations/:id - Get a specific automation
   * Returns: Automation with recent runs
   */
  fastify.get<{ Params: { id: string } }>(
    "/automations/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid automation ID format",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const orgId = request.user.orgId;

      // Get the automation with base info
      const [result] = await db
        .select({
          id: baseAutomations.id,
          baseId: baseAutomations.baseId,
          name: baseAutomations.name,
          trigger: baseAutomations.trigger,
          actions: baseAutomations.actions,
          enabled: baseAutomations.enabled,
          type: baseAutomations.type,
          createdAt: baseAutomations.createdAt,
          updatedAt: baseAutomations.updatedAt,
          baseOrgId: bases.orgId,
        })
        .from(baseAutomations)
        .innerJoin(bases, eq(baseAutomations.baseId, bases.id))
        .where(eq(baseAutomations.id, id))
        .limit(1);

      if (!result) {
        return reply.status(404).send({
          error: "Automation not found",
        });
      }

      // Check org access
      if (result.baseOrgId !== orgId) {
        return reply.status(403).send({
          error: "Access denied",
        });
      }

      // Get recent runs
      const runs = await db
        .select({
          id: automationRuns.id,
          triggerEvent: automationRuns.triggerEvent,
          status: automationRuns.status,
          error: automationRuns.error,
          startedAt: automationRuns.startedAt,
          completedAt: automationRuns.completedAt,
        })
        .from(automationRuns)
        .where(eq(automationRuns.automationId, id))
        .orderBy(desc(automationRuns.startedAt))
        .limit(10);

      return reply.status(200).send({
        id: result.id,
        baseId: result.baseId,
        name: result.name,
        trigger: result.trigger,
        actions: result.actions,
        enabled: result.enabled,
        type: result.type,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
        recentRuns: runs,
      });
    }
  );

  /**
   * PATCH /automations/:id - Update an automation
   * Body: { name?, trigger?, actions?, enabled? }
   * Returns: Updated automation
   */
  fastify.patch<{ Params: { id: string }; Body: UpdateAutomationBody }>(
    "/automations/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { name, trigger, actions, enabled } = request.body;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid automation ID format",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const orgId = request.user.orgId;

      // Get the automation with base info
      const [existing] = await db
        .select({
          id: baseAutomations.id,
          baseOrgId: bases.orgId,
        })
        .from(baseAutomations)
        .innerJoin(bases, eq(baseAutomations.baseId, bases.id))
        .where(eq(baseAutomations.id, id))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({
          error: "Automation not found",
        });
      }

      // Check org access
      if (existing.baseOrgId !== orgId) {
        return reply.status(403).send({
          error: "Access denied",
        });
      }

      // Build update object
      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (name !== undefined) {
        if (typeof name !== "string" || name.trim().length === 0) {
          return reply.status(400).send({
            error: "name must be a non-empty string",
          });
        }
        if (name.length > 255) {
          return reply.status(400).send({
            error: "name must be at most 255 characters",
          });
        }
        updates.name = name.trim();
      }

      if (trigger !== undefined) {
        if (!trigger || typeof trigger !== "object" || !trigger.type) {
          return reply.status(400).send({
            error: "trigger must have a type property",
          });
        }
        if (!VALID_TRIGGER_TYPES.includes(trigger.type as (typeof VALID_TRIGGER_TYPES)[number])) {
          return reply.status(400).send({
            error: `trigger.type must be one of: ${VALID_TRIGGER_TYPES.join(", ")}`,
          });
        }
        updates.trigger = trigger;
      }

      if (actions !== undefined) {
        if (!Array.isArray(actions) || actions.length === 0) {
          return reply.status(400).send({
            error: "actions must be a non-empty array",
          });
        }
        for (const action of actions) {
          if (!action || typeof action !== "object" || !action.type) {
            return reply.status(400).send({
              error: "Each action must have a type property",
            });
          }
          if (!VALID_ACTION_TYPES.includes(action.type as (typeof VALID_ACTION_TYPES)[number])) {
            return reply.status(400).send({
              error: `action.type must be one of: ${VALID_ACTION_TYPES.join(", ")}`,
            });
          }
        }
        updates.actions = actions;
      }

      if (enabled !== undefined) {
        updates.enabled = Boolean(enabled);
      }

      // Update the automation
      const [updated] = await db
        .update(baseAutomations)
        .set(updates)
        .where(eq(baseAutomations.id, id))
        .returning();

      return reply.status(200).send({
        id: updated.id,
        baseId: updated.baseId,
        name: updated.name,
        trigger: updated.trigger,
        actions: updated.actions,
        enabled: updated.enabled,
        type: updated.type,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      });
    }
  );

  /**
   * DELETE /automations/:id - Delete an automation
   * Returns: { success: true }
   */
  fastify.delete<{ Params: { id: string } }>(
    "/automations/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid automation ID format",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const orgId = request.user.orgId;

      // Get the automation with base info
      const [existing] = await db
        .select({
          id: baseAutomations.id,
          baseOrgId: bases.orgId,
        })
        .from(baseAutomations)
        .innerJoin(bases, eq(baseAutomations.baseId, bases.id))
        .where(eq(baseAutomations.id, id))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({
          error: "Automation not found",
        });
      }

      // Check org access
      if (existing.baseOrgId !== orgId) {
        return reply.status(403).send({
          error: "Access denied",
        });
      }

      // Delete the automation (cascade deletes runs)
      await db.delete(baseAutomations).where(eq(baseAutomations.id, id));

      return reply.status(200).send({ success: true });
    }
  );

  /**
   * POST /automations/:id/test - Test run an automation
   * Body: { sampleData?: Record<string, unknown> }
   * Returns: Run result
   */
  fastify.post<{
    Params: { id: string };
    Body: { sampleData?: Record<string, unknown> };
  }>(
    "/automations/:id/test",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { sampleData } = request.body;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid automation ID format",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const orgId = request.user.orgId;

      // Get the automation with base info
      const [automation] = await db
        .select({
          id: baseAutomations.id,
          baseId: baseAutomations.baseId,
          trigger: baseAutomations.trigger,
          baseOrgId: bases.orgId,
        })
        .from(baseAutomations)
        .innerJoin(bases, eq(baseAutomations.baseId, bases.id))
        .where(eq(baseAutomations.id, id))
        .limit(1);

      if (!automation) {
        return reply.status(404).send({
          error: "Automation not found",
        });
      }

      // Check org access
      if (automation.baseOrgId !== orgId) {
        return reply.status(403).send({
          error: "Access denied",
        });
      }

      // Create a test run
      const trigger = automation.trigger as AutomationTrigger;
      const triggerEvent = {
        type: trigger.type,
        tableId: "tableId" in trigger ? trigger.tableId : undefined,
        data: sampleData || {},
      };

      // Create run record
      const [run] = await db
        .insert(automationRuns)
        .values({
          automationId: id,
          triggerEvent,
          status: "pending",
          startedAt: new Date(),
        })
        .returning();

      // Queue the automation for execution
      await queueAutomation(id, {
        ...triggerEvent,
        runId: run.id,
      } as { type: string; tableId?: string; data: Record<string, unknown> });

      return reply.status(200).send({
        runId: run.id,
        status: "pending",
        message: "Test run queued",
      });
    }
  );

  /**
   * GET /automations/:id/runs - Get automation run history
   * Query: { limit?, cursor? }
   * Returns: Paginated list of runs
   */
  fastify.get<{
    Params: { id: string };
    Querystring: { limit?: number; cursor?: string };
  }>(
    "/automations/:id/runs",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { limit = 50, cursor } = request.query;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid automation ID format",
        });
      }

      // Validate limit
      const parsedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const orgId = request.user.orgId;

      // Get the automation with base info
      const [automation] = await db
        .select({
          id: baseAutomations.id,
          baseOrgId: bases.orgId,
        })
        .from(baseAutomations)
        .innerJoin(bases, eq(baseAutomations.baseId, bases.id))
        .where(eq(baseAutomations.id, id))
        .limit(1);

      if (!automation) {
        return reply.status(404).send({
          error: "Automation not found",
        });
      }

      // Check org access
      if (automation.baseOrgId !== orgId) {
        return reply.status(403).send({
          error: "Access denied",
        });
      }

      // Build conditions
      const conditions = [eq(automationRuns.automationId, id)];

      // Handle cursor
      if (cursor && UUID_REGEX.test(cursor)) {
        const [cursorRun] = await db
          .select({ startedAt: automationRuns.startedAt })
          .from(automationRuns)
          .where(eq(automationRuns.id, cursor))
          .limit(1);

        if (cursorRun) {
          conditions.push(sql`${automationRuns.startedAt} < ${cursorRun.startedAt}`);
        }
      }

      // Get runs
      const runs = await db
        .select({
          id: automationRuns.id,
          triggerEvent: automationRuns.triggerEvent,
          status: automationRuns.status,
          error: automationRuns.error,
          startedAt: automationRuns.startedAt,
          completedAt: automationRuns.completedAt,
        })
        .from(automationRuns)
        .where(and(...conditions))
        .orderBy(desc(automationRuns.startedAt))
        .limit(parsedLimit + 1);

      const hasMore = runs.length > parsedLimit;
      const resultRuns = hasMore ? runs.slice(0, parsedLimit) : runs;
      const nextCursor = hasMore && resultRuns.length > 0 ? resultRuns[resultRuns.length - 1]?.id : null;

      return reply.status(200).send({
        runs: resultRuns,
        pagination: {
          limit: parsedLimit,
          cursor: cursor || null,
          nextCursor,
          hasMore,
        },
      });
    }
  );

  /**
   * GET /automation-runs/:id - Get a specific run
   * Returns: Run details
   */
  fastify.get<{ Params: { id: string } }>(
    "/automation-runs/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid run ID format",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const orgId = request.user.orgId;

      // Get the run with automation and base info
      const [result] = await db
        .select({
          id: automationRuns.id,
          automationId: automationRuns.automationId,
          triggerEvent: automationRuns.triggerEvent,
          status: automationRuns.status,
          error: automationRuns.error,
          startedAt: automationRuns.startedAt,
          completedAt: automationRuns.completedAt,
          automationName: baseAutomations.name,
          baseOrgId: bases.orgId,
        })
        .from(automationRuns)
        .innerJoin(baseAutomations, eq(automationRuns.automationId, baseAutomations.id))
        .innerJoin(bases, eq(baseAutomations.baseId, bases.id))
        .where(eq(automationRuns.id, id))
        .limit(1);

      if (!result) {
        return reply.status(404).send({
          error: "Run not found",
        });
      }

      // Check org access
      if (result.baseOrgId !== orgId) {
        return reply.status(403).send({
          error: "Access denied",
        });
      }

      return reply.status(200).send({
        id: result.id,
        automationId: result.automationId,
        automationName: result.automationName,
        triggerEvent: result.triggerEvent,
        status: result.status,
        error: result.error,
        startedAt: result.startedAt,
        completedAt: result.completedAt,
      });
    }
  );
}
