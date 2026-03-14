import { z } from "zod";

// ============ TEMPLATES ============

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  formSchema: z.record(z.unknown()).optional().default({}),
  workflow: z.array(z.record(z.unknown())).optional().default([]),
  category: z.string().max(100).optional(),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

// ============ REQUESTS ============

export const createRequestSchema = z.object({
  templateId: z.string().uuid(),
  formData: z.record(z.unknown()).optional().default({}),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export const requestsQuerySchema = z.object({
  status: z
    .enum(["pending", "approved", "rejected", "cancelled"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type RequestsQueryInput = z.infer<typeof requestsQuerySchema>;

// ============ STEPS ============

export const decideStepSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  comment: z.string().optional(),
});

export type DecideStepInput = z.infer<typeof decideStepSchema>;
