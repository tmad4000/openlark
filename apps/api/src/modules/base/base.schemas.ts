import { z } from "zod";

// ============ BASES ============

export const createBaseSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  icon: z.string().max(100).optional(),
});

export const updateBaseSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  icon: z.string().max(100).optional(),
});

// ============ TABLES ============

export const createTableSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  position: z.number().int().min(0).optional(),
});

export const updateTableSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  position: z.number().int().min(0).optional(),
});

// ============ FIELDS ============

export const createFieldSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  type: z.string().min(1).max(50),
  config: z.record(z.unknown()).optional(),
  position: z.number().int().min(0).optional(),
});

export const updateFieldSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  type: z.string().min(1).max(50).optional(),
  config: z.record(z.unknown()).optional(),
  position: z.number().int().min(0).optional(),
});

// ============ RECORDS ============

export const createRecordSchema = z.object({
  data: z.record(z.unknown()).default({}),
});

export const updateRecordSchema = z.object({
  data: z.record(z.unknown()),
});

// ============ QUERY ============

const filterOpSchema = z.object({
  op: z.enum(["eq", "gt", "lt", "contains", "in"]),
  value: z.unknown(),
});

export const recordsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).optional().default("asc"),
  filter: z.string().optional(), // JSON-encoded filter object
});

// ============ TYPE EXPORTS ============

export type CreateBaseInput = z.infer<typeof createBaseSchema>;
export type UpdateBaseInput = z.infer<typeof updateBaseSchema>;
export type CreateTableInput = z.infer<typeof createTableSchema>;
export type UpdateTableInput = z.infer<typeof updateTableSchema>;
export type CreateFieldInput = z.infer<typeof createFieldSchema>;
export type UpdateFieldInput = z.infer<typeof updateFieldSchema>;
export type CreateRecordInput = z.infer<typeof createRecordSchema>;
export type UpdateRecordInput = z.infer<typeof updateRecordSchema>;
