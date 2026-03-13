import { z } from "zod";

// Create wiki space
export const createWikiSpaceSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().max(2000).optional(),
  icon: z.string().max(100).optional(),
  type: z.enum(["private", "public"]).optional().default("private"),
});

// Update wiki space
export const updateWikiSpaceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  icon: z.string().max(100).optional(),
  type: z.enum(["private", "public"]).optional(),
  settingsJson: z.record(z.unknown()).optional(),
});

// Create wiki page
export const createWikiPageSchema = z.object({
  title: z.string().min(1).max(500).optional().default("Untitled"),
  parentPageId: z.string().uuid().optional(),
  position: z.number().int().min(0).optional(),
});

// Move/reorder wiki page
export const updateWikiPageSchema = z.object({
  parentPageId: z.string().uuid().nullable().optional(),
  position: z.number().int().min(0).optional(),
});

// Type exports
export type CreateWikiSpaceInput = z.infer<typeof createWikiSpaceSchema>;
export type UpdateWikiSpaceInput = z.infer<typeof updateWikiSpaceSchema>;
export type CreateWikiPageInput = z.infer<typeof createWikiPageSchema>;
export type UpdateWikiPageInput = z.infer<typeof updateWikiPageSchema>;
