import { FastifyInstance } from "fastify";
import { db } from "../db";
import {
  leaveTypes,
  leaveBalances,
  leaveRequests,
  approvalTemplates,
  approvalRequests,
  approvalSteps,
  users,
} from "../db/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Interfaces ---

interface CreateLeaveTypeBody {
  name: string;
  paid: boolean;
  default_days: number;
}

interface UpdateLeaveTypeBody {
  name?: string;
  paid?: boolean;
  default_days?: number;
}

interface CreateLeaveRequestBody {
  leave_type_id: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  reason?: string;
}

interface LeaveCalendarQuery {
  month?: string; // YYYY-MM
}

function getMonthRange(monthStr: string): { start: string; end: string } | null {
  const match = monthStr.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  if (month < 1 || month > 12) return null;
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

function calculateLeaveDays(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let days = 0;
  const current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      days++;
    }
    current.setDate(current.getDate() + 1);
  }
  return days;
}

export async function leaveRoutes(fastify: FastifyInstance) {
  // ========================
  // Leave Types (Admin)
  // ========================

  // POST /leave/types - Create leave type
  fastify.post<{ Body: CreateLeaveTypeBody }>(
    "/leave/types",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { name, paid, default_days } = request.body || {};

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return reply.status(400).send({ error: "Name is required" });
      }

      if (typeof paid !== "boolean") {
        return reply.status(400).send({ error: "paid must be a boolean" });
      }

      if (typeof default_days !== "number" || default_days < 0) {
        return reply.status(400).send({ error: "default_days must be a non-negative number" });
      }

      const [leaveType] = await db
        .insert(leaveTypes)
        .values({
          orgId: user.orgId!,
          name: name.trim(),
          paid,
          defaultDays: String(default_days),
        })
        .returning();

      return reply.status(201).send({ leaveType });
    }
  );

  // GET /leave/types - List leave types for org
  fastify.get(
    "/leave/types",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;

      const types = await db
        .select()
        .from(leaveTypes)
        .where(eq(leaveTypes.orgId, user.orgId!))
        .orderBy(leaveTypes.name);

      return reply.send({ leaveTypes: types });
    }
  );

  // PUT /leave/types/:id - Update leave type
  fastify.put<{ Params: { id: string }; Body: UpdateLeaveTypeBody }>(
    "/leave/types/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { id } = request.params;
      const { name, paid, default_days } = request.body || {};

      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid leave type ID" });
      }

      const [existing] = await db
        .select()
        .from(leaveTypes)
        .where(and(eq(leaveTypes.id, id), eq(leaveTypes.orgId, user.orgId!)))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ error: "Leave type not found" });
      }

      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name.trim();
      if (paid !== undefined) updates.paid = paid;
      if (default_days !== undefined) updates.defaultDays = String(default_days);

      const [updated] = await db
        .update(leaveTypes)
        .set(updates)
        .where(eq(leaveTypes.id, id))
        .returning();

      return reply.send({ leaveType: updated });
    }
  );

  // DELETE /leave/types/:id - Delete leave type
  fastify.delete<{ Params: { id: string } }>(
    "/leave/types/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { id } = request.params;

      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid leave type ID" });
      }

      const [existing] = await db
        .select()
        .from(leaveTypes)
        .where(and(eq(leaveTypes.id, id), eq(leaveTypes.orgId, user.orgId!)))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ error: "Leave type not found" });
      }

      await db.delete(leaveTypes).where(eq(leaveTypes.id, id));

      return reply.status(204).send();
    }
  );

  // ========================
  // Leave Balances
  // ========================

  // GET /leave/balances - Get current user's leave balances
  fastify.get(
    "/leave/balances",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const currentYear = new Date().getFullYear();

      // Get all leave types for the org
      const types = await db
        .select()
        .from(leaveTypes)
        .where(eq(leaveTypes.orgId, user.orgId!));

      // Get existing balances for current year
      const existingBalances = await db
        .select()
        .from(leaveBalances)
        .where(
          and(
            eq(leaveBalances.userId, user.id),
            eq(leaveBalances.year, currentYear)
          )
        );

      const balanceMap = new Map(
        existingBalances.map((b) => [b.leaveTypeId, b])
      );

      // For any leave type without a balance record, auto-create one
      const result = [];
      for (const lt of types) {
        let balance = balanceMap.get(lt.id);
        if (!balance) {
          const [newBalance] = await db
            .insert(leaveBalances)
            .values({
              userId: user.id,
              leaveTypeId: lt.id,
              year: currentYear,
              totalDays: lt.defaultDays,
              usedDays: "0",
            })
            .returning();
          balance = newBalance;
        }
        result.push({
          ...balance,
          leaveTypeName: lt.name,
          paid: lt.paid,
          remaining: (
            parseFloat(balance.totalDays) - parseFloat(balance.usedDays)
          ).toFixed(1),
        });
      }

      return reply.send({ balances: result });
    }
  );

  // ========================
  // Leave Requests
  // ========================

  // POST /leave/requests - Submit leave request (creates approval request)
  fastify.post<{ Body: CreateLeaveRequestBody }>(
    "/leave/requests",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { leave_type_id, start_date, end_date, reason } =
        request.body || {};

      if (!leave_type_id || !UUID_REGEX.test(leave_type_id)) {
        return reply.status(400).send({ error: "Valid leave_type_id is required" });
      }

      if (!start_date || !end_date) {
        return reply
          .status(400)
          .send({ error: "start_date and end_date are required (YYYY-MM-DD)" });
      }

      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(start_date) || !dateRegex.test(end_date)) {
        return reply.status(400).send({ error: "Dates must be in YYYY-MM-DD format" });
      }

      if (new Date(start_date) > new Date(end_date)) {
        return reply
          .status(400)
          .send({ error: "start_date must be before or equal to end_date" });
      }

      // Verify leave type exists
      const [leaveType] = await db
        .select()
        .from(leaveTypes)
        .where(
          and(
            eq(leaveTypes.id, leave_type_id),
            eq(leaveTypes.orgId, user.orgId!)
          )
        )
        .limit(1);

      if (!leaveType) {
        return reply.status(404).send({ error: "Leave type not found" });
      }

      // Check balance
      const currentYear = new Date().getFullYear();
      const [balance] = await db
        .select()
        .from(leaveBalances)
        .where(
          and(
            eq(leaveBalances.userId, user.id),
            eq(leaveBalances.leaveTypeId, leave_type_id),
            eq(leaveBalances.year, currentYear)
          )
        )
        .limit(1);

      const requestedDays = calculateLeaveDays(start_date, end_date);
      if (balance) {
        const remaining =
          parseFloat(balance.totalDays) - parseFloat(balance.usedDays);
        if (requestedDays > remaining) {
          return reply.status(400).send({
            error: `Insufficient leave balance. Requested ${requestedDays} days but only ${remaining.toFixed(1)} remaining.`,
          });
        }
      }

      // Create leave request
      const [leaveRequest] = await db
        .insert(leaveRequests)
        .values({
          orgId: user.orgId!,
          userId: user.id,
          leaveTypeId: leave_type_id,
          startDate: start_date,
          endDate: end_date,
          reason: reason?.trim() || null,
          status: "pending",
        })
        .returning();

      // Try to find a "Leave Request" approval template
      const [approvalTemplate] = await db
        .select()
        .from(approvalTemplates)
        .where(
          and(
            eq(approvalTemplates.orgId, user.orgId!),
            sql`LOWER(${approvalTemplates.name}) LIKE '%leave%'`
          )
        )
        .limit(1);

      let approvalRequest = null;
      if (approvalTemplate) {
        // Create approval request linked to leave
        const [ar] = await db
          .insert(approvalRequests)
          .values({
            templateId: approvalTemplate.id,
            requesterId: user.id,
            formData: {
              leave_request_id: leaveRequest.id,
              leave_type: leaveType.name,
              start_date,
              end_date,
              days: requestedDays,
              reason: reason || "",
            },
            status: "pending",
          })
          .returning();
        approvalRequest = ar;

        // Create approval steps from template workflow
        const workflowSteps = approvalTemplate.workflow as Array<{
          approver_type: string;
          approver_id: string;
          type: string;
        }>;
        if (workflowSteps && workflowSteps.length > 0) {
          const stepValues = workflowSteps.map((step, index) => ({
            requestId: ar.id,
            stepIndex: index,
            approverIds: [step.approver_id],
            type: step.type as "sequential" | "parallel",
            status: "pending" as const,
          }));
          await db.insert(approvalSteps).values(stepValues);
        }
      }

      return reply.status(201).send({
        leaveRequest,
        approvalRequest,
        days: requestedDays,
      });
    }
  );

  // GET /leave/requests - List user's leave requests
  fastify.get(
    "/leave/requests",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;

      const requests = await db
        .select({
          id: leaveRequests.id,
          orgId: leaveRequests.orgId,
          userId: leaveRequests.userId,
          leaveTypeId: leaveRequests.leaveTypeId,
          startDate: leaveRequests.startDate,
          endDate: leaveRequests.endDate,
          reason: leaveRequests.reason,
          status: leaveRequests.status,
          reviewerId: leaveRequests.reviewerId,
          reviewedAt: leaveRequests.reviewedAt,
          createdAt: leaveRequests.createdAt,
          leaveTypeName: leaveTypes.name,
        })
        .from(leaveRequests)
        .leftJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
        .where(
          and(
            eq(leaveRequests.userId, user.id),
            eq(leaveRequests.orgId, user.orgId!)
          )
        )
        .orderBy(desc(leaveRequests.createdAt));

      return reply.send({ requests });
    }
  );

  // POST /leave/requests/:id/cancel - Cancel a pending leave request
  fastify.post<{ Params: { id: string } }>(
    "/leave/requests/:id/cancel",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { id } = request.params;

      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid request ID" });
      }

      const [lr] = await db
        .select()
        .from(leaveRequests)
        .where(
          and(
            eq(leaveRequests.id, id),
            eq(leaveRequests.userId, user.id)
          )
        )
        .limit(1);

      if (!lr) {
        return reply.status(404).send({ error: "Leave request not found" });
      }

      if (lr.status !== "pending") {
        return reply
          .status(400)
          .send({ error: "Only pending leave requests can be cancelled" });
      }

      const [updated] = await db
        .update(leaveRequests)
        .set({ status: "cancelled" })
        .where(eq(leaveRequests.id, id))
        .returning();

      return reply.send({ leaveRequest: updated });
    }
  );

  // POST /leave/requests/:id/approve - Approve a leave request (admin/reviewer)
  fastify.post<{ Params: { id: string } }>(
    "/leave/requests/:id/approve",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { id } = request.params;

      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid request ID" });
      }

      const [lr] = await db
        .select()
        .from(leaveRequests)
        .where(
          and(
            eq(leaveRequests.id, id),
            eq(leaveRequests.orgId, user.orgId!)
          )
        )
        .limit(1);

      if (!lr) {
        return reply.status(404).send({ error: "Leave request not found" });
      }

      if (lr.status !== "pending") {
        return reply
          .status(400)
          .send({ error: "Only pending leave requests can be approved" });
      }

      // Approve the leave request
      const [updated] = await db
        .update(leaveRequests)
        .set({
          status: "approved",
          reviewerId: user.id,
          reviewedAt: new Date(),
        })
        .where(eq(leaveRequests.id, id))
        .returning();

      // Update leave balance - deduct used days
      const leaveDays = calculateLeaveDays(lr.startDate, lr.endDate);
      const currentYear = new Date().getFullYear();
      await db
        .update(leaveBalances)
        .set({
          usedDays: sql`${leaveBalances.usedDays}::numeric + ${leaveDays}`,
        })
        .where(
          and(
            eq(leaveBalances.userId, lr.userId),
            eq(leaveBalances.leaveTypeId, lr.leaveTypeId),
            eq(leaveBalances.year, currentYear)
          )
        );

      return reply.send({ leaveRequest: updated });
    }
  );

  // POST /leave/requests/:id/reject - Reject a leave request
  fastify.post<{ Params: { id: string }; Body: { reason?: string } }>(
    "/leave/requests/:id/reject",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { id } = request.params;
      const { reason } = request.body || {};

      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid request ID" });
      }

      const [lr] = await db
        .select()
        .from(leaveRequests)
        .where(
          and(
            eq(leaveRequests.id, id),
            eq(leaveRequests.orgId, user.orgId!)
          )
        )
        .limit(1);

      if (!lr) {
        return reply.status(404).send({ error: "Leave request not found" });
      }

      if (lr.status !== "pending") {
        return reply
          .status(400)
          .send({ error: "Only pending leave requests can be rejected" });
      }

      const [updated] = await db
        .update(leaveRequests)
        .set({
          status: "rejected",
          reviewerId: user.id,
          reviewedAt: new Date(),
        })
        .where(eq(leaveRequests.id, id))
        .returning();

      return reply.send({ leaveRequest: updated });
    }
  );

  // ========================
  // Calendar Integration
  // ========================

  // GET /leave/calendar?month=YYYY-MM - Get approved leave days for calendar
  fastify.get<{ Querystring: LeaveCalendarQuery }>(
    "/leave/calendar",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { month } = request.query;

      if (!month) {
        return reply
          .status(400)
          .send({ error: "month query parameter is required (YYYY-MM)" });
      }

      const range = getMonthRange(month);
      if (!range) {
        return reply
          .status(400)
          .send({ error: "Invalid month format. Use YYYY-MM" });
      }

      // Get all approved leave requests overlapping with the month
      const approvedLeaves = await db
        .select({
          id: leaveRequests.id,
          startDate: leaveRequests.startDate,
          endDate: leaveRequests.endDate,
          leaveTypeName: leaveTypes.name,
          userId: leaveRequests.userId,
          userName: users.displayName,
        })
        .from(leaveRequests)
        .leftJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
        .leftJoin(users, eq(leaveRequests.userId, users.id))
        .where(
          and(
            eq(leaveRequests.orgId, user.orgId!),
            eq(leaveRequests.status, "approved"),
            lte(leaveRequests.startDate, range.end),
            gte(leaveRequests.endDate, range.start)
          )
        );

      // Build day-by-day leave entries
      const leaveDays: Array<{
        date: string;
        leaveType: string | null;
        userName: string | null;
        userId: string;
      }> = [];

      for (const leave of approvedLeaves) {
        const start = new Date(leave.startDate);
        const end = new Date(leave.endDate);
        const rangeStart = new Date(range.start);
        const rangeEnd = new Date(range.end);

        const effectiveStart = start > rangeStart ? start : rangeStart;
        const effectiveEnd = end < rangeEnd ? end : rangeEnd;

        const current = new Date(effectiveStart);
        while (current <= effectiveEnd) {
          const dayOfWeek = current.getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            leaveDays.push({
              date: current.toISOString().slice(0, 10),
              leaveType: leave.leaveTypeName,
              userName: leave.userName,
              userId: leave.userId,
            });
          }
          current.setDate(current.getDate() + 1);
        }
      }

      return reply.send({ leaveDays });
    }
  );
}
