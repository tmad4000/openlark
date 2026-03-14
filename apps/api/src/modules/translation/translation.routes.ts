import { FastifyInstance } from "fastify";
import {
  translateSchema,
  updatePreferencesSchema,
} from "./translation.schemas.js";
import { authenticate } from "../auth/middleware.js";
import { formatZodError } from "../../utils/validation.js";
import { translationService } from "./translation.service.js";
import { ZodError } from "zod";

export async function translationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // POST /translate — translate text
  app.post("/translate", async (req, reply) => {
    try {
      const input = translateSchema.parse(req.body);
      const result = await translationService.translate(input, req.user!.id);

      if ("error" in result) {
        return reply
          .status(429)
          .send({ code: result.error, message: result.message });
      }

      return reply.send({ data: result });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /translate/preferences — get user translation preferences
  app.get("/preferences", async (req, reply) => {
    const preferences = await translationService.getPreferences(req.user!.id);
    return reply.send({ data: { preferences } });
  });

  // PATCH /translate/preferences — update user translation preferences
  app.patch("/preferences", async (req, reply) => {
    try {
      const input = updatePreferencesSchema.parse(req.body);
      const preferences = await translationService.updatePreferences(
        input,
        req.user!.id
      );
      return reply.send({ data: { preferences } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });
}
