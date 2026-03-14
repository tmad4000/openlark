import { z } from "zod";

// ============ CYCLES ============

export const createCycleSchema = z.object({
  name: z.string().min(1).max(255),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  status: z
    .enum(["creating", "aligning", "following_up", "reviewing"])
    .optional()
    .default("creating"),
});

export type CreateCycleInput = z.infer<typeof createCycleSchema>;

export const updateCycleSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: z
    .enum(["creating", "aligning", "following_up", "reviewing"])
    .optional(),
});

export type UpdateCycleInput = z.infer<typeof updateCycleSchema>;

export const cyclesQuerySchema = z.object({
  status: z
    .enum(["creating", "aligning", "following_up", "reviewing"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type CyclesQueryInput = z.infer<typeof cyclesQuerySchema>;

// ============ OBJECTIVES ============

export const createObjectiveSchema = z.object({
  cycleId: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  parentObjectiveId: z.string().uuid().optional(),
  visibility: z.enum(["everyone", "leaders", "team"]).optional().default("everyone"),
  status: z.enum(["draft", "active", "completed"]).optional().default("draft"),
});

export type CreateObjectiveInput = z.infer<typeof createObjectiveSchema>;

export const updateObjectiveSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  parentObjectiveId: z.string().uuid().nullable().optional(),
  visibility: z.enum(["everyone", "leaders", "team"]).optional(),
  status: z.enum(["draft", "active", "completed"]).optional(),
});

export type UpdateObjectiveInput = z.infer<typeof updateObjectiveSchema>;

export const objectivesQuerySchema = z.object({
  cycleId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  status: z.enum(["draft", "active", "completed"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type ObjectivesQueryInput = z.infer<typeof objectivesQuerySchema>;

// ============ KEY RESULTS ============

export const createKeyResultSchema = z.object({
  objectiveId: z.string().uuid(),
  title: z.string().min(1).max(500),
  targetValue: z.number(),
  currentValue: z.number().optional().default(0),
  weight: z.number().optional().default(1),
  unit: z.string().max(50).optional(),
});

export type CreateKeyResultInput = z.infer<typeof createKeyResultSchema>;

export const updateKeyResultSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  targetValue: z.number().optional(),
  currentValue: z.number().optional(),
  weight: z.number().optional(),
  unit: z.string().max(50).nullable().optional(),
});

export type UpdateKeyResultInput = z.infer<typeof updateKeyResultSchema>;

// ============ CHECKINS ============

export const createCheckinSchema = z.object({
  keyResultId: z.string().uuid(),
  value: z.number(),
  notes: z.string().optional(),
});

export type CreateCheckinInput = z.infer<typeof createCheckinSchema>;

// ============ ALIGNMENTS ============

export const createAlignmentSchema = z.object({
  objectiveId: z.string().uuid(),
  alignedToObjectiveId: z.string().uuid(),
});

export type CreateAlignmentInput = z.infer<typeof createAlignmentSchema>;

export const confirmAlignmentSchema = z.object({
  confirmed: z.boolean(),
});

export type ConfirmAlignmentInput = z.infer<typeof confirmAlignmentSchema>;
