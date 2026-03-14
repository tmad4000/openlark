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
