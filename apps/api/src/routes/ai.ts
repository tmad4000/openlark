import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware } from "../middleware/auth";
import { db } from "../db";
import { aiJobs } from "../db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { aiComplete, AiActionType } from "../lib/ai";
import { redis } from "../lib/redis";

const VALID_ACTIONS: AiActionType[] = ["complete", "rewrite", "summarize", "expand", "adjust_tone"];

// AI usage quota: 200 requests per user per day
const AI_QUOTA_MAX = 200;
const AI_QUOTA_WINDOW_SECONDS = 86400; // 24 hours

async function checkAiQuota(userId: string, reply: FastifyReply): Promise<boolean> {
  const key = `ai_quota:${userId}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, AI_QUOTA_WINDOW_SECONDS);
  }
  if (count > AI_QUOTA_MAX) {
    reply.status(429).send({
      error: "AI usage quota exceeded. Maximum 200 requests per day.",
      remaining: 0,
    });
    return false;
  }
  return true;
}

interface AiCompleteBody {
  prompt?: string;
  context?: string;
  text?: string;
  action?: AiActionType;
  tone?: string;
}

interface AiUsageQuery {
  period?: string;
}

export async function aiRoutes(fastify: FastifyInstance) {
  // POST /ai/complete — run AI completion/rewrite/summarize/expand/adjust_tone
  fastify.post<{ Body: AiCompleteBody }>(
    "/ai/complete",
    { preHandler: authMiddleware },
    async (request: FastifyRequest<{ Body: AiCompleteBody }>, reply) => {
      const user = request.user;
      const org = request.org;
      const { prompt, context, text, action = "complete", tone } = request.body || {};

      // Validate action
      if (!VALID_ACTIONS.includes(action)) {
        return reply.status(400).send({
          error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}`,
        });
      }

      // Validate input
      if (!prompt && !text) {
        return reply.status(400).send({
          error: "Either prompt or text is required",
        });
      }

      // Check quota
      const allowed = await checkAiQuota(user.id, reply);
      if (!allowed) return;

      // Create job record
      const [job] = await db
        .insert(aiJobs)
        .values({
          orgId: org?.id || user.orgId || user.id,
          userId: user.id,
          type: action,
          input: { prompt, context, text, tone },
          status: "processing",
        })
        .returning();

      try {
        // Call AI service
        const result = await aiComplete({
          prompt,
          context,
          text,
          action,
          tone,
        });

        // Update job with result
        await db
          .update(aiJobs)
          .set({
            output: { text: result.text },
            status: "completed",
            model: result.model,
            costTokens: result.tokensUsed,
          })
          .where(eq(aiJobs.id, job.id));

        return reply.status(201).send({
          id: job.id,
          action,
          text: result.text,
          model: result.model,
          tokensUsed: result.tokensUsed,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        // Update job with error
        await db
          .update(aiJobs)
          .set({
            output: { error: errorMessage },
            status: "failed",
          })
          .where(eq(aiJobs.id, job.id));

        return reply.status(500).send({
          error: "AI processing failed",
          details: errorMessage,
        });
      }
    }
  );

  // GET /ai/usage — get AI usage stats for the current user
  fastify.get<{ Querystring: AiUsageQuery }>(
    "/ai/usage",
    { preHandler: authMiddleware },
    async (request: FastifyRequest<{ Querystring: AiUsageQuery }>, reply) => {
      const user = request.user;

      // Get usage count from Redis
      const key = `ai_quota:${user.id}`;
      const usedStr = await redis.get(key);
      const used = usedStr ? parseInt(usedStr, 10) : 0;

      // Get total token usage from DB (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [tokenStats] = await db
        .select({
          totalTokens: sql<number>`COALESCE(SUM(${aiJobs.costTokens}), 0)`,
          totalJobs: sql<number>`COUNT(*)`,
        })
        .from(aiJobs)
        .where(
          and(
            eq(aiJobs.userId, user.id),
            gte(aiJobs.createdAt, thirtyDaysAgo)
          )
        );

      return reply.send({
        dailyUsed: used,
        dailyLimit: AI_QUOTA_MAX,
        dailyRemaining: Math.max(0, AI_QUOTA_MAX - used),
        last30Days: {
          totalTokens: Number(tokenStats?.totalTokens || 0),
          totalJobs: Number(tokenStats?.totalJobs || 0),
        },
      });
    }
  );
}
