import { FastifyInstance } from "fastify";
import {
  createCycleSchema,
  updateCycleSchema,
  cyclesQuerySchema,
  createObjectiveSchema,
  updateObjectiveSchema,
  objectivesQuerySchema,
  createKeyResultSchema,
  updateKeyResultSchema,
  createCheckinSchema,
  createAlignmentSchema,
  confirmAlignmentSchema,
} from "./okrs.schemas.js";
import { authenticate } from "../auth/middleware.js";
import { formatZodError } from "../../utils/validation.js";
import { okrsService } from "./okrs.service.js";
import { ZodError } from "zod";

export async function okrRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // ============ CYCLES ============

  // POST /okrs/cycles — create cycle
  app.post("/cycles", async (req, reply) => {
    try {
      const input = createCycleSchema.parse(req.body);
      const cycle = await okrsService.createCycle(input, req.user!.orgId);
      return reply.status(201).send({ data: { cycle } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /okrs/cycles — list cycles
  app.get("/cycles", async (req, reply) => {
    try {
      const query = cyclesQuerySchema.parse(req.query);
      const cycles = await okrsService.getCycles(req.user!.orgId, query);
      return reply.send({ data: { cycles } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /okrs/cycles/:id — get cycle
  app.get<{ Params: { id: string } }>("/cycles/:id", async (req, reply) => {
    const cycle = await okrsService.getCycleById(req.params.id);
    if (!cycle) {
      return reply
        .status(404)
        .send({ code: "CYCLE_NOT_FOUND", message: "OKR cycle not found" });
    }
    return reply.send({ data: { cycle } });
  });

  // PATCH /okrs/cycles/:id — update cycle
  app.patch<{ Params: { id: string } }>("/cycles/:id", async (req, reply) => {
    try {
      const input = updateCycleSchema.parse(req.body);
      const cycle = await okrsService.updateCycle(req.params.id, input);
      if (!cycle) {
        return reply
          .status(404)
          .send({ code: "CYCLE_NOT_FOUND", message: "OKR cycle not found" });
      }
      return reply.send({ data: { cycle } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // DELETE /okrs/cycles/:id — delete cycle
  app.delete<{ Params: { id: string } }>("/cycles/:id", async (req, reply) => {
    const cycle = await okrsService.deleteCycle(req.params.id);
    if (!cycle) {
      return reply
        .status(404)
        .send({ code: "CYCLE_NOT_FOUND", message: "OKR cycle not found" });
    }
    return reply.status(204).send();
  });

  // ============ OBJECTIVES ============

  // POST /okrs/objectives — create objective
  app.post("/objectives", async (req, reply) => {
    try {
      const input = createObjectiveSchema.parse(req.body);
      const objective = await okrsService.createObjective(
        input,
        req.user!.id
      );
      return reply.status(201).send({ data: { objective } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /okrs/objectives — list objectives
  app.get("/objectives", async (req, reply) => {
    try {
      const query = objectivesQuerySchema.parse(req.query);
      const objectivesList = await okrsService.getObjectives(
        req.user!.orgId,
        query
      );
      return reply.send({ data: { objectives: objectivesList } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /okrs/objectives/:id — get objective with key results
  app.get<{ Params: { id: string } }>(
    "/objectives/:id",
    async (req, reply) => {
      const objective = await okrsService.getObjectiveById(req.params.id);
      if (!objective) {
        return reply.status(404).send({
          code: "OBJECTIVE_NOT_FOUND",
          message: "Objective not found",
        });
      }
      return reply.send({ data: { objective } });
    }
  );

  // PATCH /okrs/objectives/:id — update objective
  app.patch<{ Params: { id: string } }>(
    "/objectives/:id",
    async (req, reply) => {
      try {
        const input = updateObjectiveSchema.parse(req.body);
        const objective = await okrsService.updateObjective(
          req.params.id,
          input
        );
        if (!objective) {
          return reply.status(404).send({
            code: "OBJECTIVE_NOT_FOUND",
            message: "Objective not found",
          });
        }
        return reply.send({ data: { objective } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // DELETE /okrs/objectives/:id — delete objective
  app.delete<{ Params: { id: string } }>(
    "/objectives/:id",
    async (req, reply) => {
      const objective = await okrsService.deleteObjective(req.params.id);
      if (!objective) {
        return reply.status(404).send({
          code: "OBJECTIVE_NOT_FOUND",
          message: "Objective not found",
        });
      }
      return reply.status(204).send();
    }
  );

  // ============ KEY RESULTS ============

  // POST /okrs/key-results — create key result
  app.post("/key-results", async (req, reply) => {
    try {
      const input = createKeyResultSchema.parse(req.body);
      const keyResult = await okrsService.createKeyResult(input);
      return reply.status(201).send({ data: { keyResult } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /okrs/objectives/:id/key-results — list key results for objective
  app.get<{ Params: { id: string } }>(
    "/objectives/:id/key-results",
    async (req, reply) => {
      const keyResultsList = await okrsService.getKeyResultsByObjective(
        req.params.id
      );
      return reply.send({ data: { keyResults: keyResultsList } });
    }
  );

  // GET /okrs/key-results/:id — get key result
  app.get<{ Params: { id: string } }>(
    "/key-results/:id",
    async (req, reply) => {
      const keyResult = await okrsService.getKeyResultById(req.params.id);
      if (!keyResult) {
        return reply.status(404).send({
          code: "KEY_RESULT_NOT_FOUND",
          message: "Key result not found",
        });
      }
      return reply.send({ data: { keyResult } });
    }
  );

  // PATCH /okrs/key-results/:id — update key result
  app.patch<{ Params: { id: string } }>(
    "/key-results/:id",
    async (req, reply) => {
      try {
        const input = updateKeyResultSchema.parse(req.body);
        const keyResult = await okrsService.updateKeyResult(
          req.params.id,
          input
        );
        if (!keyResult) {
          return reply.status(404).send({
            code: "KEY_RESULT_NOT_FOUND",
            message: "Key result not found",
          });
        }
        return reply.send({ data: { keyResult } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // DELETE /okrs/key-results/:id — delete key result
  app.delete<{ Params: { id: string } }>(
    "/key-results/:id",
    async (req, reply) => {
      const keyResult = await okrsService.deleteKeyResult(req.params.id);
      if (!keyResult) {
        return reply.status(404).send({
          code: "KEY_RESULT_NOT_FOUND",
          message: "Key result not found",
        });
      }
      return reply.status(204).send();
    }
  );

  // ============ CHECKINS ============

  // POST /okrs/checkins — create checkin
  app.post("/checkins", async (req, reply) => {
    try {
      const input = createCheckinSchema.parse(req.body);
      const checkin = await okrsService.createCheckin(input, req.user!.id);
      return reply.status(201).send({ data: { checkin } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /okrs/key-results/:id/checkins — list checkins for key result
  app.get<{ Params: { id: string } }>(
    "/key-results/:id/checkins",
    async (req, reply) => {
      const checkins = await okrsService.getCheckinsByKeyResult(req.params.id);
      return reply.send({ data: { checkins } });
    }
  );

  // ============ ALIGNMENTS ============

  // POST /okrs/alignments — create alignment
  app.post("/alignments", async (req, reply) => {
    try {
      const input = createAlignmentSchema.parse(req.body);
      const alignment = await okrsService.createAlignment(input);
      return reply.status(201).send({ data: { alignment } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /okrs/objectives/:id/alignments — list alignments for objective
  app.get<{ Params: { id: string } }>(
    "/objectives/:id/alignments",
    async (req, reply) => {
      const alignments = await okrsService.getAlignmentsByObjective(
        req.params.id
      );
      return reply.send({ data: { alignments } });
    }
  );

  // PATCH /okrs/alignments/:objectiveId/:alignedToId — confirm/reject alignment
  app.patch<{ Params: { objectiveId: string; alignedToId: string } }>(
    "/alignments/:objectiveId/:alignedToId",
    async (req, reply) => {
      try {
        const input = confirmAlignmentSchema.parse(req.body);
        const alignment = await okrsService.confirmAlignment(
          req.params.objectiveId,
          req.params.alignedToId,
          input.confirmed
        );
        if (!alignment) {
          return reply.status(404).send({
            code: "ALIGNMENT_NOT_FOUND",
            message: "Alignment not found",
          });
        }
        return reply.send({ data: { alignment } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // DELETE /okrs/alignments/:objectiveId/:alignedToId — delete alignment
  app.delete<{ Params: { objectiveId: string; alignedToId: string } }>(
    "/alignments/:objectiveId/:alignedToId",
    async (req, reply) => {
      const alignment = await okrsService.deleteAlignment(
        req.params.objectiveId,
        req.params.alignedToId
      );
      if (!alignment) {
        return reply.status(404).send({
          code: "ALIGNMENT_NOT_FOUND",
          message: "Alignment not found",
        });
      }
      return reply.status(204).send();
    }
  );
}
