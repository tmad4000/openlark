import type { FastifyInstance } from "fastify";
import { authenticate } from "../auth/middleware.js";
import { searchService } from "./search.service.js";

export async function searchRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /search?q=query&category=all&limit=20
  app.get("/", async (req, reply) => {
    const { q, category, limit } = req.query as {
      q?: string;
      category?: string;
      limit?: string;
    };

    if (!q || !q.trim()) {
      return reply.send({ data: { results: [] } });
    }

    const result = await searchService.search({
      query: q,
      category: category || "all",
      limit: limit ? parseInt(limit, 10) : 20,
      userId: req.user!.id,
      orgId: req.user!.orgId,
    });

    return reply.send({ data: result });
  });
}
