import { FastifyInstance } from "fastify";
import {
  clockSchema,
  myRecordsQuerySchema,
  statsQuerySchema,
} from "./attendance.schemas.js";
import { authenticate } from "../auth/middleware.js";
import { formatZodError } from "../../utils/validation.js";
import { attendanceService } from "./attendance.service.js";
import { ZodError } from "zod";

export async function attendanceRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // POST /attendance/clock — clock in or out
  app.post("/clock", async (req, reply) => {
    try {
      const input = clockSchema.parse(req.body);
      const result = await attendanceService.clock(
        input,
        req.user!.id,
        req.user!.orgId
      );

      if ("error" in result) {
        return reply
          .status(400)
          .send({ code: result.error, message: result.message });
      }

      return reply.status(201).send({ data: { record: result.record } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /attendance/my-records?month=YYYY-MM — get user's clock records for a month
  app.get("/my-records", async (req, reply) => {
    try {
      const query = myRecordsQuerySchema.parse(req.query);
      const records = await attendanceService.getMyRecords(
        req.user!.id,
        query
      );
      return reply.send({ data: { records } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /attendance/stats?month=YYYY-MM — get attendance summary for the month
  app.get("/stats", async (req, reply) => {
    try {
      const query = statsQuerySchema.parse(req.query);
      const stats = await attendanceService.getStats(
        req.user!.id,
        req.user!.orgId,
        query
      );
      return reply.send({ data: { stats } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });
}
