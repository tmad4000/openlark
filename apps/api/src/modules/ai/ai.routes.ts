import type { FastifyInstance } from "fastify";
import { authenticate } from "../auth/middleware.js";
import { aiService, type AiCompleteInput } from "./ai.service.js";

export async function aiRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // POST /ai/complete - Generate AI text
  app.post<{
    Body: {
      prompt: string;
      context?: string;
      type?: "rewrite" | "summarize" | "expand" | "tone" | "complete";
      toneStyle?: string;
    };
  }>("/complete", async (req, reply) => {
    const body = req.body as AiCompleteInput & { prompt: string };

    if (!body.prompt?.trim()) {
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: "prompt is required",
      });
    }

    try {
      const result = await aiService.complete(req.user!.orgId, req.user!.id, {
        prompt: body.prompt,
        context: body.context,
        type: body.type || "complete",
        toneStyle: body.toneStyle,
      });

      return reply.send({ data: result });
    } catch (error) {
      return reply.status(500).send({
        code: "AI_ERROR",
        message: "AI generation failed",
      });
    }
  });

  // GET /ai/usage - Get current user's AI usage stats
  app.get("/usage", async (req, reply) => {
    const usage = await aiService.getUserUsage(req.user!.id, req.user!.orgId);
    return reply.send({ data: { usage } });
  });
}
