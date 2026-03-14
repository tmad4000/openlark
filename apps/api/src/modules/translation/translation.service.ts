import { db } from "../../db/index.js";
import {
  translationPreferences,
  translationUsage,
} from "../../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import type {
  TranslateInput,
  UpdatePreferencesInput,
} from "./translation.schemas.js";
import { config } from "../../config.js";

// ============ TRANSLATION BACKENDS ============

interface TranslationBackend {
  translate(
    text: string,
    targetLang: string,
    sourceLang?: string
  ): Promise<{ translatedText: string; detectedSourceLang: string }>;
}

class LibreTranslateBackend implements TranslationBackend {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async translate(text: string, targetLang: string, sourceLang?: string) {
    const body = {
      q: text,
      source: sourceLang ?? "auto",
      target: targetLang,
      format: "text",
    };

    const response = await fetch(`${this.baseUrl}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`LibreTranslate error: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      translatedText: string;
      detectedLanguage?: { language: string };
    };
    return {
      translatedText: data.translatedText,
      detectedSourceLang:
        data.detectedLanguage?.language ?? sourceLang ?? "unknown",
    };
  }
}

class StubTranslateBackend implements TranslationBackend {
  async translate(text: string, targetLang: string, sourceLang?: string) {
    // Stub backend for development/testing — returns text unchanged
    return {
      translatedText: text,
      detectedSourceLang: sourceLang ?? "en",
    };
  }
}

// ============ SERVICE ============

const RATE_LIMIT_PER_HOUR = 100;

export class TranslationService {
  private backend: TranslationBackend;

  constructor() {
    const libreTranslateUrl = (config as Record<string, unknown>)
      .LIBRETRANSLATE_URL as string | undefined;
    if (libreTranslateUrl) {
      this.backend = new LibreTranslateBackend(libreTranslateUrl);
    } else {
      this.backend = new StubTranslateBackend();
    }
  }

  // ============ TRANSLATE ============

  async translate(input: TranslateInput, userId: string) {
    // Check rate limit
    const rateLimitResult = await this.checkRateLimit(userId);
    if (!rateLimitResult.allowed) {
      return {
        error: "RATE_LIMITED" as const,
        message: `Rate limit exceeded. Maximum ${RATE_LIMIT_PER_HOUR} translations per hour. Try again in ${rateLimitResult.retryAfterMinutes} minutes.`,
      };
    }

    // Perform translation
    const result = await this.backend.translate(
      input.text,
      input.target_lang,
      input.source_lang
    );

    // Increment usage count
    await this.incrementUsage(userId);

    return {
      translated_text: result.translatedText,
      source_lang: result.detectedSourceLang,
      target_lang: input.target_lang,
    };
  }

  // ============ RATE LIMITING ============

  private async checkRateLimit(
    userId: string
  ): Promise<{ allowed: boolean; retryAfterMinutes?: number }> {
    const currentHour = this.getCurrentHourTimestamp();

    const [usage] = await db
      .select()
      .from(translationUsage)
      .where(
        and(
          eq(translationUsage.userId, userId),
          eq(translationUsage.hour, currentHour)
        )
      );

    if (!usage || usage.count < RATE_LIMIT_PER_HOUR) {
      return { allowed: true };
    }

    const minutesUntilReset =
      60 - new Date().getMinutes();
    return { allowed: false, retryAfterMinutes: minutesUntilReset };
  }

  private async incrementUsage(userId: string): Promise<void> {
    const currentHour = this.getCurrentHourTimestamp();

    const [existing] = await db
      .select()
      .from(translationUsage)
      .where(
        and(
          eq(translationUsage.userId, userId),
          eq(translationUsage.hour, currentHour)
        )
      );

    if (existing) {
      await db
        .update(translationUsage)
        .set({ count: existing.count + 1 })
        .where(eq(translationUsage.id, existing.id));
    } else {
      await db.insert(translationUsage).values({
        userId,
        hour: currentHour,
        count: 1,
      });
    }
  }

  private getCurrentHourTimestamp(): Date {
    const now = new Date();
    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      0,
      0,
      0
    );
  }

  // ============ PREFERENCES ============

  async getPreferences(userId: string) {
    const [prefs] = await db
      .select()
      .from(translationPreferences)
      .where(eq(translationPreferences.userId, userId));

    if (!prefs) {
      // Return defaults
      return {
        auto_translate_enabled: false,
        target_language: "en",
      };
    }

    return {
      auto_translate_enabled: prefs.autoTranslateEnabled,
      target_language: prefs.targetLanguage,
    };
  }

  async updatePreferences(input: UpdatePreferencesInput, userId: string) {
    const [existing] = await db
      .select()
      .from(translationPreferences)
      .where(eq(translationPreferences.userId, userId));

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (input.auto_translate_enabled !== undefined) {
      updates.autoTranslateEnabled = input.auto_translate_enabled;
    }
    if (input.target_language !== undefined) {
      updates.targetLanguage = input.target_language;
    }

    if (existing) {
      const [updated] = await db
        .update(translationPreferences)
        .set(updates)
        .where(eq(translationPreferences.id, existing.id))
        .returning();
      return {
        auto_translate_enabled: updated!.autoTranslateEnabled,
        target_language: updated!.targetLanguage,
      };
    }

    const [created] = await db
      .insert(translationPreferences)
      .values({
        userId,
        autoTranslateEnabled: input.auto_translate_enabled ?? false,
        targetLanguage: input.target_language ?? "en",
      })
      .returning();

    return {
      auto_translate_enabled: created!.autoTranslateEnabled,
      target_language: created!.targetLanguage,
    };
  }
}

export const translationService = new TranslationService();
