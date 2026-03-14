import { z } from "zod";

// ============ FORMS ============

export const createFormSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  baseId: z.string().uuid().optional(),
  tableId: z.string().uuid().optional(),
  settings: z.record(z.unknown()).optional().default({}),
  theme: z.record(z.unknown()).optional().default({}),
  questions: z
    .array(
      z.object({
        type: z.enum([
          "text",
          "single_select",
          "multi_choice",
          "rating",
          "nps",
          "location",
          "date",
          "person",
          "file",
          "number",
        ]),
        config: z.record(z.unknown()).optional().default({}),
        position: z.number().int().min(0).optional(),
        required: z.boolean().optional().default(false),
        displayCondition: z.record(z.unknown()).optional(),
      })
    )
    .optional()
    .default([]),
});

export type CreateFormInput = z.infer<typeof createFormSchema>;

export const formsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type FormsQueryInput = z.infer<typeof formsQuerySchema>;

// ============ RESPONSES ============

export const submitResponseSchema = z.object({
  answers: z.record(z.unknown()),
});

export type SubmitResponseInput = z.infer<typeof submitResponseSchema>;

export const responsesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type ResponsesQueryInput = z.infer<typeof responsesQuerySchema>;
