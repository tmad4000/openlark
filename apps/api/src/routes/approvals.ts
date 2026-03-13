import { FastifyInstance } from "fastify";
import { db } from "../db";
import {
  approvalTemplates,
  approvalRequests,
  approvalSteps,
  users,
} from "../db/schema";
import { eq, and, or, inArray, desc, sql } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CreateTemplateBody {
  name: string;
  form_schema: Record<string, unknown>;
  workflow: WorkflowStep[];
  category?: string;
}

interface WorkflowStep {
  approver_type: "user" | "role" | "department";
  approver_id: string;
  type: "sequential" | "parallel";
}

interface CreateRequestBody {
  template_id: string;
  form_data: Record<string, unknown>;
}

interface DecideBody {
  decision: "approve" | "reject";
  comment?: string;
}

interface ApprovalsQuery {
  status?: string;
}

export async function approvalsRoutes(fastify: FastifyInstance) {
  // POST /approvals/templates - Create approval template
  fastify.post<{ Body: CreateTemplateBody }>(
    "/approvals/templates",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { name, form_schema, workflow, category } = request.body || {};

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return reply.status(400).send({ error: "Name is required" });
      }

      if (!form_schema || typeof form_schema !== "object") {
        return reply.status(400).send({ error: "form_schema is required and must be an object" });
      }

      if (!workflow || !Array.isArray(workflow) || workflow.length === 0) {
        return reply.status(400).send({ error: "workflow is required and must be a non-empty array" });
      }

      const validApproverTypes = ["user", "role", "department"];
      const validStepTypes = ["sequential", "parallel"];
      for (const step of workflow) {
        if (!validApproverTypes.includes(step.approver_type)) {
          return reply.status(400).send({ error: `Invalid approver_type: ${step.approver_type}` });
        }
        if (!validStepTypes.includes(step.type)) {
          return reply.status(400).send({ error: `Invalid step type: ${step.type}` });
        }
      }

      const [template] = await db
        .insert(approvalTemplates)
        .values({
          orgId: user.orgId!,
          name: name.trim(),
          formSchema: form_schema,
          workflow: workflow,
          category: category?.trim() || null,
        })
        .returning();

      return reply.status(201).send({ template });
    }
  );

  // GET /approvals/templates - List templates for org
  fastify.get(
    "/approvals/templates",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;

      const templates = await db
        .select()
        .from(approvalTemplates)
        .where(eq(approvalTemplates.orgId, user.orgId!))
        .orderBy(desc(approvalTemplates.createdAt));

      return reply.send({ templates });
    }
  );

  // POST /approvals/requests - Submit new approval request
  fastify.post<{ Body: CreateRequestBody }>(
    "/approvals/requests",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { template_id, form_data } = request.body || {};

      if (!template_id || !UUID_REGEX.test(template_id)) {
        return reply.status(400).send({ error: "Valid template_id is required" });
      }

      if (!form_data || typeof form_data !== "object") {
        return reply.status(400).send({ error: "form_data is required and must be an object" });
      }

      // Verify template exists and belongs to user's org
      const [template] = await db
        .select()
        .from(approvalTemplates)
        .where(
          and(
            eq(approvalTemplates.id, template_id),
            eq(approvalTemplates.orgId, user.orgId!)
          )
        )
        .limit(1);

      if (!template) {
        return reply.status(404).send({ error: "Template not found" });
      }

      // Create the approval request
      const [approvalRequest] = await db
        .insert(approvalRequests)
        .values({
          templateId: template_id,
          requesterId: user.id,
          formData: form_data,
          status: "pending",
        })
        .returning();

      // Create approval steps from template workflow
      const workflowSteps = template.workflow as WorkflowStep[];
      if (workflowSteps && workflowSteps.length > 0) {
        const stepValues = workflowSteps.map((step, index) => ({
          requestId: approvalRequest.id,
          stepIndex: index,
          approverIds: [step.approver_id],
          type: step.type as "sequential" | "parallel",
          status: "pending" as const,
        }));

        await db.insert(approvalSteps).values(stepValues);
      }

      // Fetch the created steps
      const steps = await db
        .select()
        .from(approvalSteps)
        .where(eq(approvalSteps.requestId, approvalRequest.id))
        .orderBy(approvalSteps.stepIndex);

      return reply.status(201).send({
        request: { ...approvalRequest, steps },
      });
    }
  );

  // GET /approvals/requests - List approval requests
  fastify.get<{ Querystring: ApprovalsQuery }>(
    "/approvals/requests",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { status } = request.query;

      const validStatuses = ["pending", "approved", "rejected", "cancelled"];
      if (status && !validStatuses.includes(status)) {
        return reply.status(400).send({ error: `Invalid status: ${status}` });
      }

      // Get all approval steps where user is an approver
      const userSteps = await db
        .select({ requestId: approvalSteps.requestId })
        .from(approvalSteps)
        .where(sql`${user.id} = ANY(${approvalSteps.approverIds})`);

      const approverRequestIds = userSteps.map((s) => s.requestId);

      // Build conditions: requests where user is requester OR approver
      const conditions = [];
      if (approverRequestIds.length > 0) {
        conditions.push(
          or(
            eq(approvalRequests.requesterId, user.id),
            inArray(approvalRequests.id, approverRequestIds)
          )!
        );
      } else {
        conditions.push(eq(approvalRequests.requesterId, user.id));
      }

      if (status) {
        conditions.push(
          eq(
            approvalRequests.status,
            status as "pending" | "approved" | "rejected" | "cancelled"
          )
        );
      }

      const requests = await db
        .select()
        .from(approvalRequests)
        .where(and(...conditions))
        .orderBy(desc(approvalRequests.createdAt));

      return reply.send({ requests });
    }
  );

  // GET /approvals/requests/:id - Get single approval request with steps
  fastify.get<{ Params: { id: string } }>(
    "/approvals/requests/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid request ID" });
      }

      const [approvalRequest] = await db
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.id, id))
        .limit(1);

      if (!approvalRequest) {
        return reply.status(404).send({ error: "Approval request not found" });
      }

      const steps = await db
        .select()
        .from(approvalSteps)
        .where(eq(approvalSteps.requestId, id))
        .orderBy(approvalSteps.stepIndex);

      return reply.send({ request: { ...approvalRequest, steps } });
    }
  );

  // POST /approvals/requests/:id/steps/:stepId/decide - Approve or reject a step
  fastify.post<{ Params: { id: string; stepId: string }; Body: DecideBody }>(
    "/approvals/requests/:id/steps/:stepId/decide",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { id, stepId } = request.params;
      const { decision, comment } = request.body || {};

      if (!UUID_REGEX.test(id) || !UUID_REGEX.test(stepId)) {
        return reply.status(400).send({ error: "Invalid ID format" });
      }

      if (!decision || !["approve", "reject"].includes(decision)) {
        return reply
          .status(400)
          .send({ error: "decision must be 'approve' or 'reject'" });
      }

      // Verify the request exists
      const [approvalRequest] = await db
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.id, id))
        .limit(1);

      if (!approvalRequest) {
        return reply.status(404).send({ error: "Approval request not found" });
      }

      if (approvalRequest.status !== "pending") {
        return reply
          .status(400)
          .send({ error: "This request has already been resolved" });
      }

      // Verify the step exists and user is an approver
      const [step] = await db
        .select()
        .from(approvalSteps)
        .where(
          and(
            eq(approvalSteps.id, stepId),
            eq(approvalSteps.requestId, id)
          )
        )
        .limit(1);

      if (!step) {
        return reply.status(404).send({ error: "Approval step not found" });
      }

      if (step.status !== "pending") {
        return reply
          .status(400)
          .send({ error: "This step has already been decided" });
      }

      const isApprover = step.approverIds.includes(user.id);
      if (!isApprover) {
        return reply
          .status(403)
          .send({ error: "You are not an approver for this step" });
      }

      // Update the step
      const stepStatus = decision === "approve" ? "approved" : "rejected";
      const [updatedStep] = await db
        .update(approvalSteps)
        .set({
          status: stepStatus,
          decidedBy: user.id,
          decidedAt: new Date(),
          comment: comment || null,
        })
        .where(eq(approvalSteps.id, stepId))
        .returning();

      // If rejected, reject the entire request
      if (decision === "reject") {
        await db
          .update(approvalRequests)
          .set({ status: "rejected" })
          .where(eq(approvalRequests.id, id));
      } else {
        // Check if all steps are approved
        const allSteps = await db
          .select()
          .from(approvalSteps)
          .where(eq(approvalSteps.requestId, id));

        const allApproved = allSteps.every((s) => s.status === "approved");
        if (allApproved) {
          await db
            .update(approvalRequests)
            .set({ status: "approved" })
            .where(eq(approvalRequests.id, id));
        }
      }

      // Fetch updated request
      const [updatedRequest] = await db
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.id, id))
        .limit(1);

      return reply.send({ step: updatedStep, request: updatedRequest });
    }
  );
}
