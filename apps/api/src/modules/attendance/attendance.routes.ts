import { FastifyInstance } from "fastify";
import {
  clockSchema,
  myRecordsQuerySchema,
  statsQuerySchema,
  createLeaveTypeSchema,
  createLeaveRequestSchema,
  leaveRequestsQuerySchema,
  reviewLeaveRequestSchema,
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

  // ============ LEAVE TYPES ============

  // POST /attendance/leave-types — create leave type (admin)
  app.post("/leave-types", async (req, reply) => {
    try {
      const input = createLeaveTypeSchema.parse(req.body);
      const leaveType = await attendanceService.createLeaveType(
        input,
        req.user!.orgId
      );
      return reply.status(201).send({ data: { leaveType } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /attendance/leave-types — list leave types for org
  app.get("/leave-types", async (req, reply) => {
    const leaveTypes = await attendanceService.getLeaveTypes(req.user!.orgId);
    return reply.send({ data: { leaveTypes } });
  });

  // ============ LEAVE BALANCES ============

  // GET /attendance/leave-balances?year=YYYY — get user's leave balances
  app.get("/leave-balances", async (req, reply) => {
    const year = Number((req.query as Record<string, string>).year) || new Date().getFullYear();
    // Initialize balances if not yet created for this year
    const balances = await attendanceService.initializeBalances(
      req.user!.id,
      req.user!.orgId,
      year
    );
    return reply.send({ data: { balances } });
  });

  // ============ LEAVE REQUESTS ============

  // POST /attendance/leaves — submit leave request
  app.post("/leaves", async (req, reply) => {
    try {
      const input = createLeaveRequestSchema.parse(req.body);
      const result = await attendanceService.createLeaveRequest(
        input,
        req.user!.id,
        req.user!.orgId
      );
      if ("error" in result) {
        return reply
          .status(400)
          .send({ code: result.error, message: result.message });
      }
      return reply.status(201).send({ data: { request: result.request } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /attendance/leaves — list my leave requests
  app.get("/leaves", async (req, reply) => {
    try {
      const query = leaveRequestsQuerySchema.parse(req.query);
      const requests = await attendanceService.getLeaveRequests(
        req.user!.id,
        req.user!.orgId,
        query
      );
      return reply.send({ data: { requests } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /attendance/leaves/org — list all leave requests for org (admin)
  app.get("/leaves/org", async (req, reply) => {
    try {
      const query = leaveRequestsQuerySchema.parse(req.query);
      const requests = await attendanceService.getOrgLeaveRequests(
        req.user!.orgId,
        query
      );
      return reply.send({ data: { requests } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // POST /attendance/leaves/:id/review — approve or reject
  app.post<{ Params: { id: string } }>(
    "/leaves/:id/review",
    async (req, reply) => {
      try {
        const input = reviewLeaveRequestSchema.parse(req.body);
        const result = await attendanceService.reviewLeaveRequest(
          req.params.id,
          input,
          req.user!.id
        );
        if (!result) {
          return reply.status(404).send({
            code: "NOT_FOUND",
            message: "Leave request not found",
          });
        }
        if ("error" in result) {
          return reply.status(409).send({
            code: result.error,
            message: result.message,
          });
        }
        return reply.send({ data: { request: result.request } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );
}
