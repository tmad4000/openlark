import { db } from "../../db/index.js";
import {
  approvalTemplates,
  approvalRequests,
  approvalSteps,
} from "../../db/schema/index.js";
import { eq, and, or, sql } from "drizzle-orm";
import type {
  CreateTemplateInput,
  CreateRequestInput,
  DecideStepInput,
  RequestsQueryInput,
} from "./approvals.schemas.js";

export class ApprovalsService {
  // ============ TEMPLATES ============

  async createTemplate(input: CreateTemplateInput, orgId: string) {
    const [template] = await db
      .insert(approvalTemplates)
      .values({
        orgId,
        name: input.name,
        formSchema: input.formSchema,
        workflow: input.workflow,
        category: input.category,
      })
      .returning();

    if (!template) {
      throw new Error("Failed to create approval template");
    }
    return template;
  }

  async getTemplateById(templateId: string) {
    const [template] = await db
      .select()
      .from(approvalTemplates)
      .where(eq(approvalTemplates.id, templateId));
    return template || null;
  }

  async getTemplatesByOrg(orgId: string) {
    return db
      .select()
      .from(approvalTemplates)
      .where(eq(approvalTemplates.orgId, orgId));
  }

  // ============ REQUESTS ============

  async createRequest(
    input: CreateRequestInput,
    userId: string,
    orgId: string
  ) {
    const template = await this.getTemplateById(input.templateId);
    if (!template) return null;

    const [request] = await db
      .insert(approvalRequests)
      .values({
        templateId: input.templateId,
        requesterId: userId,
        orgId,
        formData: input.formData,
        status: "pending",
      })
      .returning();

    if (!request) {
      throw new Error("Failed to create approval request");
    }

    // Create steps from template workflow
    const workflow = template.workflow as Array<{
      approverIds?: string[];
      type?: "sequential" | "parallel";
    }>;

    if (workflow.length > 0) {
      const stepValues = workflow.map((step, idx) => ({
        requestId: request.id,
        stepIndex: idx,
        approverIds: step.approverIds || [],
        type: (step.type || "sequential") as "sequential" | "parallel",
        status: "pending" as const,
      }));

      await db.insert(approvalSteps).values(stepValues);
    }

    return this.getRequestById(request.id);
  }

  async getRequestById(requestId: string) {
    const [request] = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, requestId));

    if (!request) return null;

    const steps = await db
      .select()
      .from(approvalSteps)
      .where(eq(approvalSteps.requestId, requestId))
      .orderBy(approvalSteps.stepIndex);

    return { ...request, steps };
  }

  async getRequests(
    userId: string,
    orgId: string,
    query: RequestsQueryInput
  ) {
    const conditions = [eq(approvalRequests.orgId, orgId)];

    if (query.status) {
      conditions.push(eq(approvalRequests.status, query.status));
    }

    // Get requests where user is requester OR is an approver on a step
    const requests = await db
      .select()
      .from(approvalRequests)
      .where(and(...conditions))
      .orderBy(approvalRequests.createdAt)
      .limit(query.limit)
      .offset(query.offset);

    // Filter to requests where user is requester or approver
    const results = [];
    for (const request of requests) {
      const steps = await db
        .select()
        .from(approvalSteps)
        .where(eq(approvalSteps.requestId, request.id))
        .orderBy(approvalSteps.stepIndex);

      const isRequester = request.requesterId === userId;
      const isApprover = steps.some((s) => s.approverIds.includes(userId));

      if (isRequester || isApprover) {
        results.push({ ...request, steps });
      }
    }

    return results;
  }

  // ============ STEPS ============

  async decideStep(
    requestId: string,
    stepId: string,
    input: DecideStepInput,
    userId: string
  ) {
    // Get the step
    const [step] = await db
      .select()
      .from(approvalSteps)
      .where(
        and(
          eq(approvalSteps.id, stepId),
          eq(approvalSteps.requestId, requestId)
        )
      );

    if (!step) return null;

    // Verify the user is an approver
    if (!step.approverIds.includes(userId)) {
      return { error: "not_approver" as const };
    }

    // Must be pending
    if (step.status !== "pending") {
      return { error: "already_decided" as const };
    }

    const newStatus = input.decision === "approve" ? "approved" : "rejected";

    // Update the step
    const [updated] = await db
      .update(approvalSteps)
      .set({
        status: newStatus,
        decidedBy: userId,
        decidedAt: new Date(),
        comment: input.comment || null,
      })
      .where(eq(approvalSteps.id, stepId))
      .returning();

    // Update overall request status based on step outcomes
    await this.updateRequestStatus(requestId);

    return updated;
  }

  private async updateRequestStatus(requestId: string) {
    const steps = await db
      .select()
      .from(approvalSteps)
      .where(eq(approvalSteps.requestId, requestId))
      .orderBy(approvalSteps.stepIndex);

    if (steps.length === 0) return;

    // If any step is rejected, the whole request is rejected
    if (steps.some((s) => s.status === "rejected")) {
      await db
        .update(approvalRequests)
        .set({ status: "rejected" })
        .where(eq(approvalRequests.id, requestId));
      return;
    }

    // If all steps are approved, the request is approved
    if (steps.every((s) => s.status === "approved")) {
      await db
        .update(approvalRequests)
        .set({ status: "approved" })
        .where(eq(approvalRequests.id, requestId));
      return;
    }

    // Otherwise, still pending
  }
}

export const approvalsService = new ApprovalsService();
