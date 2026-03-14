import { z } from "zod";

// ============ CLOCK ============

export const clockSchema = z.object({
  type: z.enum(["clock_in", "clock_out"]),
  method: z.enum(["gps", "wifi", "manual"]),
  location: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .optional(),
  notes: z.string().optional(),
});

export type ClockInput = z.infer<typeof clockSchema>;

// ============ QUERIES ============

export const myRecordsQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Format: YYYY-MM"),
});

export type MyRecordsQuery = z.infer<typeof myRecordsQuerySchema>;

export const statsQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Format: YYYY-MM"),
});

export type StatsQuery = z.infer<typeof statsQuerySchema>;

// ============ LEAVE TYPES ============

export const createLeaveTypeSchema = z.object({
  name: z.string().min(1).max(255),
  isPaid: z.boolean().optional().default(true),
  defaultDaysPerYear: z.number().int().min(0).optional().default(0),
});

export type CreateLeaveTypeInput = z.infer<typeof createLeaveTypeSchema>;

// ============ LEAVE REQUESTS ============

export const createLeaveRequestSchema = z.object({
  leaveTypeId: z.string().uuid(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  days: z.number().positive(),
  reason: z.string().optional(),
});

export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;

export const leaveRequestsQuerySchema = z.object({
  status: z
    .enum(["pending", "approved", "rejected", "cancelled"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type LeaveRequestsQueryInput = z.infer<typeof leaveRequestsQuerySchema>;

export const reviewLeaveRequestSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
});

export type ReviewLeaveRequestInput = z.infer<typeof reviewLeaveRequestSchema>;
