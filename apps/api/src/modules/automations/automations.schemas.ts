import { z } from "zod";

export const triggerTypeEnum = z.enum([
  "record_created",
  "record_updated",
  "record_matches_condition",
  "scheduled",
  "button_clicked",
  "webhook_received",
]);

export const actionTypeEnum = z.enum([
  "update_record",
  "create_record",
  "send_message",
  "http_request",
]);

export const triggerSchema = z.object({
  type: triggerTypeEnum,
  tableId: z.string().uuid().optional(),
  condition: z.record(z.unknown()).optional(),
  schedule: z.string().optional(),
  webhookId: z.string().optional(),
});

export const actionSchema = z.object({
  type: actionTypeEnum,
  config: z.record(z.unknown()).default({}),
});

export const createAutomationSchema = z.object({
  name: z.string().min(1).max(255),
  trigger: triggerSchema,
  actions: z.array(actionSchema).min(1),
  type: z.enum(["automation", "workflow"]).default("automation"),
  enabled: z.boolean().default(true),
});

export const updateAutomationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  trigger: triggerSchema.optional(),
  actions: z.array(actionSchema).min(1).optional(),
  enabled: z.boolean().optional(),
});

export type CreateAutomationInput = z.infer<typeof createAutomationSchema>;
export type UpdateAutomationInput = z.infer<typeof updateAutomationSchema>;
export type TriggerType = z.infer<typeof triggerTypeEnum>;
export type ActionType = z.infer<typeof actionTypeEnum>;
