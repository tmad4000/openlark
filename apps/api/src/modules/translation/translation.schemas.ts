import { z } from "zod";

// ============ TRANSLATE ============

export const translateSchema = z.object({
  text: z.string().min(1).max(10000),
  source_lang: z.string().min(2).max(10).optional(),
  target_lang: z.string().min(2).max(10),
});

export type TranslateInput = z.infer<typeof translateSchema>;

// ============ PREFERENCES ============

export const updatePreferencesSchema = z.object({
  auto_translate_enabled: z.boolean().optional(),
  target_language: z.string().min(2).max(10).optional(),
});

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
