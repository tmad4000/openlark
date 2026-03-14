import { FastifyInstance } from "fastify";
import {
  createTemplateSchema,
  createRequestSchema,
  decideStepSchema,
  requestsQuerySchema,
} from "./approvals.schemas.js";
import { authenticate } from "../auth/middleware.js";
import { formatZodError } from "../../utils/validation.js";
import { approvalsService } from "./approvals.service.js";
import { messengerService } from "../messenger/messenger.service.js";
import { notificationsService } from "../notifications/notifications.service.js";
import { publishMessageEvent } from "../messenger/websocket.js";
import { db } from "../../db/index.js";
import { users, messages } from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import { ZodError } from "zod";

/** Look up a user's display name or email */
async function getUserDisplayName(userId: string): Promise<string> {
  const [user] = await db
    .select({ displayName: users.displayName, email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  return user?.displayName || user?.email || "Unknown";
}

/** Build the contentJson for an approval card message */
function buildApprovalCardContent(opts: {
  requestId: string;
  stepId: string;
  templateName: string;
  requesterName: string;
  formData: Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
  decidedBy?: string;
}) {
  // Extract up to 4 key form fields for display
  const formEntries = Object.entries(opts.formData).slice(0, 4);

  return {
    cardType: "approval" as const,
    requestId: opts.requestId,
    stepId: opts.stepId,
    templateName: opts.templateName,
    requesterName: opts.requesterName,
    formFields: formEntries.map(([key, value]) => ({
      label: key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()),
      value: String(value ?? ""),
    })),
    status: opts.status,
    decidedBy: opts.decidedBy,
    text: `Approval request: ${opts.templateName} from ${opts.requesterName}`,
  };
}

export async function approvalsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // ============ TEMPLATES ============

  // POST /approvals/templates — create template
  app.post("/templates", async (req, reply) => {
    try {
      const input = createTemplateSchema.parse(req.body);
      const template = await approvalsService.createTemplate(
        input,
        req.user!.orgId
      );
      return reply.status(201).send({ data: { template } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /approvals/templates — list org templates
  app.get("/templates", async (req, reply) => {
    const templates = await approvalsService.getTemplatesByOrg(
      req.user!.orgId
    );
    return reply.send({ data: { templates } });
  });

  // ============ REQUESTS ============

  // POST /approvals/requests — submit new request
  app.post("/requests", async (req, reply) => {
    try {
      const input = createRequestSchema.parse(req.body);
      const request = await approvalsService.createRequest(
        input,
        req.user!.id,
        req.user!.orgId
      );
      if (!request) {
        return reply.status(404).send({
          code: "TEMPLATE_NOT_FOUND",
          message: "Approval template not found",
        });
      }

      // Send approval card messages to each approver's DM
      const template = await approvalsService.getTemplateById(
        input.templateId
      );
      const requesterName = await getUserDisplayName(req.user!.id);

      if (template && request.steps && request.steps.length > 0) {
        // Send cards for approvers on the first pending step
        const firstStep = request.steps[0]!;
        for (const approverId of firstStep.approverIds) {
          if (approverId === req.user!.id) continue; // Don't send card to self

          // Find or create DM between requester and approver
          const { chat } = await messengerService.createChat(
            { type: "dm", memberIds: [approverId], isPublic: false },
            req.user!.id,
            req.user!.orgId
          );

          const cardContent = buildApprovalCardContent({
            requestId: request.id,
            stepId: firstStep.id,
            templateName: template.name,
            requesterName,
            formData: (request.formData || {}) as Record<string, unknown>,
            status: "pending",
          });

          const cardMessage = await messengerService.sendCardMessage(
            chat.id,
            req.user!.id,
            cardContent
          );

          // Publish real-time event so it appears instantly
          await publishMessageEvent(chat.id, {
            type: "message:new",
            chatId: chat.id,
            message: cardMessage,
          });

          // Create approval_pending notification
          await notificationsService.createNotification({
            userId: approverId,
            type: "approval_pending",
            title: `Approval request from ${requesterName}`,
            body: `${template.name} — review and approve or reject`,
            entityType: "approval_request",
            entityId: request.id,
          });
        }
      }

      return reply.status(201).send({ data: { request } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /approvals/requests — list user's pending approvals
  app.get("/requests", async (req, reply) => {
    try {
      const query = requestsQuerySchema.parse(req.query);
      const requests = await approvalsService.getRequests(
        req.user!.id,
        req.user!.orgId,
        query
      );
      return reply.send({ data: { requests } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /approvals/requests/:id — get single request
  app.get<{ Params: { id: string } }>(
    "/requests/:id",
    async (req, reply) => {
      const request = await approvalsService.getRequestById(req.params.id);
      if (!request) {
        return reply.status(404).send({
          code: "REQUEST_NOT_FOUND",
          message: "Approval request not found",
        });
      }
      return reply.send({ data: { request } });
    }
  );

  // ============ STEPS ============

  // POST /approvals/requests/:id/steps/:stepId/decide
  app.post<{ Params: { id: string; stepId: string } }>(
    "/requests/:id/steps/:stepId/decide",
    async (req, reply) => {
      try {
        const input = decideStepSchema.parse(req.body);
        const result = await approvalsService.decideStep(
          req.params.id,
          req.params.stepId,
          input,
          req.user!.id
        );

        if (!result) {
          return reply.status(404).send({
            code: "STEP_NOT_FOUND",
            message: "Approval step not found",
          });
        }

        if ("error" in result) {
          if (result.error === "not_approver") {
            return reply.status(403).send({
              code: "NOT_APPROVER",
              message: "You are not an approver for this step",
            });
          }
          if (result.error === "already_decided") {
            return reply.status(409).send({
              code: "ALREADY_DECIDED",
              message: "This step has already been decided",
            });
          }
        }

        // Update any card messages in DMs that reference this step
        const approverName = await getUserDisplayName(req.user!.id);
        const request = await approvalsService.getRequestById(req.params.id);

        if (request) {
          const template = await approvalsService.getTemplateById(
            request.templateId
          );
          const requesterName = await getUserDisplayName(request.requesterId);

          // Find card messages for this step in all DM chats and update them
          const cardMessages = await db
            .select()
            .from(messages)
            .where(eq(messages.type, "card"));

          for (const msg of cardMessages) {
            const content = msg.contentJson as Record<string, unknown>;
            if (
              content?.cardType === "approval" &&
              content?.requestId === req.params.id &&
              content?.stepId === req.params.stepId
            ) {
              const updatedContent = buildApprovalCardContent({
                requestId: req.params.id,
                stepId: req.params.stepId,
                templateName: template?.name || "Approval",
                requesterName,
                formData: (request.formData || {}) as Record<string, unknown>,
                status: input.decision === "approve" ? "approved" : "rejected",
                decidedBy: approverName,
              });

              await messengerService.updateMessageContent(
                msg.id,
                updatedContent
              );

              // Publish real-time update so card refreshes in chat
              await publishMessageEvent(msg.chatId, {
                type: "message:edited",
                chatId: msg.chatId,
                message: { ...msg, contentJson: updatedContent },
              });
            }
          }

          // Send notification to the requester about the decision
          await notificationsService.createNotification({
            userId: request.requesterId,
            type: "approval_pending",
            title: `${approverName} ${input.decision === "approve" ? "approved" : "rejected"} your request`,
            body: template
              ? `${template.name}${input.comment ? ` — "${input.comment}"` : ""}`
              : undefined,
            entityType: "approval_request",
            entityId: req.params.id,
          });
        }

        return reply.send({ data: { step: result } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );
}
