import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware } from "../middleware/auth";
import { db } from "../db";
import { translationPreferences } from "../db/schema";
import { eq } from "drizzle-orm";
import { translateText } from "../lib/translation";
import { redis } from "../lib/redis";

const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_SECONDS = 3600; // 1 hour

async function checkTranslationRateLimit(
  userId: string,
  reply: FastifyReply
): Promise<boolean> {
  const key = `ratelimit:translate:${userId}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
  }
  if (count > RATE_LIMIT_MAX) {
    reply.status(429).send({
      error: "Rate limit exceeded. Maximum 100 translations per hour.",
    });
    return false;
  }
  return true;
}

interface TranslateBody {
  text: string;
  source_lang?: string;
  target_lang: string;
}

interface PatchPreferencesBody {
  auto_translate_enabled?: boolean;
  target_language?: string;
}

export async function translationRoutes(fastify: FastifyInstance) {
  // POST /translate — translate text
  fastify.post<{ Body: TranslateBody }>(
    "/translate",
    { preHandler: authMiddleware },
    async (request: FastifyRequest<{ Body: TranslateBody }>, reply) => {
      const user = request.user;
      const { text, source_lang, target_lang } = request.body || {};

      if (!text || !text.trim()) {
        return reply.status(400).send({ error: "text is required" });
      }

      if (!target_lang || !target_lang.trim()) {
        return reply.status(400).send({ error: "target_lang is required" });
      }

      // Rate limit check
      const allowed = await checkTranslationRateLimit(user.id, reply);
      if (!allowed) return;

      try {
        const result = await translateText(
          text,
          target_lang,
          source_lang || undefined
        );

        return reply.status(200).send({
          translated_text: result.translatedText,
          detected_language: result.detectedLanguage || null,
          source_lang: source_lang || result.detectedLanguage || null,
          target_lang,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Translation failed";
        return reply.status(502).send({ error: message });
      }
    }
  );

  // GET /users/me/translation-preferences
  fastify.get(
    "/users/me/translation-preferences",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;

      const [prefs] = await db
        .select()
        .from(translationPreferences)
        .where(eq(translationPreferences.userId, user.id))
        .limit(1);

      if (!prefs) {
        return reply.status(200).send({
          auto_translate_enabled: false,
          target_language: "en",
        });
      }

      return reply.status(200).send({
        auto_translate_enabled: prefs.autoTranslateEnabled,
        target_language: prefs.targetLanguage,
      });
    }
  );

  // PATCH /users/me/translation-preferences
  fastify.patch<{ Body: PatchPreferencesBody }>(
    "/users/me/translation-preferences",
    { preHandler: authMiddleware },
    async (
      request: FastifyRequest<{ Body: PatchPreferencesBody }>,
      reply
    ) => {
      const user = request.user;
      const { auto_translate_enabled, target_language } =
        request.body || {};

      if (
        auto_translate_enabled === undefined &&
        target_language === undefined
      ) {
        return reply
          .status(400)
          .send({
            error:
              "At least one of auto_translate_enabled or target_language is required",
          });
      }

      if (
        target_language !== undefined &&
        (typeof target_language !== "string" || !target_language.trim())
      ) {
        return reply
          .status(400)
          .send({ error: "target_language must be a non-empty string" });
      }

      // Upsert preferences
      const [existing] = await db
        .select()
        .from(translationPreferences)
        .where(eq(translationPreferences.userId, user.id))
        .limit(1);

      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      if (auto_translate_enabled !== undefined) {
        updates.autoTranslateEnabled = auto_translate_enabled;
      }
      if (target_language !== undefined) {
        updates.targetLanguage = target_language;
      }

      if (existing) {
        const [updated] = await db
          .update(translationPreferences)
          .set(updates)
          .where(eq(translationPreferences.userId, user.id))
          .returning();

        return reply.status(200).send({
          auto_translate_enabled: updated.autoTranslateEnabled,
          target_language: updated.targetLanguage,
        });
      } else {
        const [created] = await db
          .insert(translationPreferences)
          .values({
            userId: user.id,
            autoTranslateEnabled:
              auto_translate_enabled !== undefined
                ? auto_translate_enabled
                : false,
            targetLanguage: target_language || "en",
          })
          .returning();

        return reply.status(200).send({
          auto_translate_enabled: created.autoTranslateEnabled,
          target_language: created.targetLanguage,
        });
      }
    }
  );
}
