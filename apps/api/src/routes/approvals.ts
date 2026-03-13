import { FastifyInstance } from "fastify";
import { db } from "../db";
import {
  approvalTemplates,
  approvalRequests,
  approvalSteps,
  users,
  chats,
  chatMembers,
  messages,
} from "../db/schema";
import { eq, and, or, inArray, desc, sql } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { publish, getChatChannel, getUserPresenceChannel } from "../lib/redis";
import { createNotification } from "../lib/notifications";

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

/**
 * Find or create a DM chat between two users in an org
 */
async function findOrCreateDm(userId1: string, userId2: string, orgId: string): Promise<string> {
  // Find existing DM
  const userDmChats = await db
    .select({ chatId: chatMembers.chatId })
    .from(chatMembers)
    .innerJoin(chats, eq(chatMembers.chatId, chats.id))
    .where(
      and(
        eq(chats.type, "dm"),
        eq(chats.orgId, orgId),
        or(eq(chatMembers.userId, userId1), eq(chatMembers.userId, userId2))
      )
    );

  const chatIds = [...new Set(userDmChats.map((r) => r.chatId))];
  for (const chatId of chatIds) {
    const membersInChat = await db
      .select({ userId: chatMembers.userId })
      .from(chatMembers)
      .where(eq(chatMembers.chatId, chatId));
    const memberIds = membersInChat.map((m) => m.userId);
    if (memberIds.length === 2 && memberIds.includes(userId1) && memberIds.includes(userId2)) {
      return chatId;
    }
  }

  // Create new DM
  const [newChat] = await db
    .insert(chats)
    .values({ type: "dm", orgId, maxMembers: 2 })
    .returning();

  await db.insert(chatMembers).values([
    { chatId: newChat.id, userId: userId1, role: "member" },
    { chatId: newChat.id, userId: userId2, role: "member" },
  ]);

  return newChat.id;
}

/**
 * Send an approval card message to a user's DM
 */
async function sendApprovalCardMessage(params: {
  senderId: string;
  recipientId: string;
  orgId: string;
  approvalRequestId: string;
  templateName: string;
  requesterName: string;
  formData: Record<string, unknown>;
  status: string;
  stepId: string;
}): Promise<string> {
  const { senderId, recipientId, orgId, approvalRequestId, templateName, requesterName, formData, status, stepId } = params;

  const chatId = await findOrCreateDm(senderId, recipientId, orgId);

  const content: Record<string, unknown> = {
    card_type: "approval",
    approval_request_id: approvalRequestId,
    step_id: stepId,
    template_name: templateName,
    requester_name: requesterName,
    form_data: formData,
    status,
    text: `Approval Request: ${templateName}`,
  };

  const [message] = await db
    .insert(messages)
    .values({
      chatId,
      senderId,
      type: "card",
      content,
    })
    .returning();

  // Publish to chat channel for real-time delivery
  await publish(getChatChannel(chatId), {
    type: "message",
    payload: message,
  });

  return message.id;
}

/**
 * Update an existing approval card message with new status
 */
async function updateApprovalCardMessages(approvalRequestId: string, newStatus: string, decidedByName: string, comment: string | null) {
  // Find all card messages for this approval
  const cardMessages = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.type, "card"),
        sql`${messages.content}->>'card_type' = 'approval' AND ${messages.content}->>'approval_request_id' = ${approvalRequestId}`
      )
    );

  for (const msg of cardMessages) {
    const updatedContent = {
      ...(msg.content as Record<string, unknown>),
      status: newStatus,
      decided_by_name: decidedByName,
      decided_comment: comment,
    };

    await db
      .update(messages)
      .set({ content: updatedContent, editedAt: new Date() })
      .where(eq(messages.id, msg.id));

    // Publish update to chat channel
    await publish(getChatChannel(msg.chatId), {
      type: "message_updated",
      payload: { ...msg, content: updatedContent, editedAt: new Date().toISOString() },
    });
  }
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

      // Send approval card messages to each approver's DM
      const requesterName = user.displayName || user.email;
      for (const step of steps) {
        for (const approverId of step.approverIds) {
          if (approverId !== user.id) {
            await sendApprovalCardMessage({
              senderId: user.id,
              recipientId: approverId,
              orgId: user.orgId!,
              approvalRequestId: approvalRequest.id,
              templateName: template.name,
              requesterName,
              formData: form_data,
              status: "pending",
              stepId: step.id,
            });
          }
        }
      }

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

      // Update all approval card messages with the new status
      const deciderName = user.displayName || user.email;
      await updateApprovalCardMessages(id, updatedRequest.status, deciderName, comment || null);

      // Notify the requester about the decision
      if (approvalRequest.requesterId !== user.id) {
        // Look up template name for the notification
        const [template] = await db
          .select({ name: approvalTemplates.name })
          .from(approvalTemplates)
          .where(eq(approvalTemplates.id, approvalRequest.templateId))
          .limit(1);

        const templateName = template?.name || "Approval request";
        const decisionLabel = decision === "approve" ? "approved" : "rejected";

        await createNotification({
          userId: approvalRequest.requesterId,
          type: "approval_pending",
          title: `${deciderName} ${decisionLabel} your request`,
          body: templateName,
          entityType: "approval",
          entityId: id,
        });
      }

      return reply.send({ step: updatedStep, request: updatedRequest });
    }
  );
}
