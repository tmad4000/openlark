import { FastifyInstance } from "fastify";
import { db } from "../db";
import {
  clockRecords,
  attendanceLocations,
  leaveRequests,
  overtimeRecords,
} from "../db/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_CLOCK_TYPES = ["clock_in", "clock_out"];
const VALID_CLOCK_METHODS = ["gps", "wifi", "manual"];

// --- Interfaces ---

interface ClockBody {
  type: string;
  method: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  note?: string;
}

interface MyRecordsQuery {
  month?: string; // YYYY-MM
}

interface StatsQuery {
  month?: string; // YYYY-MM
}

// Haversine distance in meters
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getMonthRange(monthStr: string): { start: Date; end: Date } | null {
  const match = monthStr.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  if (month < 1 || month > 12) return null;
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1); // first day of next month
  return { start, end };
}

export async function attendanceRoutes(fastify: FastifyInstance) {
  // ========================
  // Clock In / Clock Out
  // ========================

  // POST /attendance/clock - Clock in or out
  fastify.post<{ Body: ClockBody }>(
    "/attendance/clock",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { type, method, location, note } = request.body || {};

      if (!type || !VALID_CLOCK_TYPES.includes(type)) {
        return reply
          .status(400)
          .send({ error: "type must be clock_in or clock_out" });
      }

      if (!method || !VALID_CLOCK_METHODS.includes(method)) {
        return reply
          .status(400)
          .send({ error: "method must be gps, wifi, or manual" });
      }

      let locationVerified = false;
      let matchedLocationId: string | null = null;

      // GPS clock-in: validate coordinates against configured locations
      if (method === "gps") {
        if (
          !location ||
          typeof location.latitude !== "number" ||
          typeof location.longitude !== "number"
        ) {
          return reply
            .status(400)
            .send({ error: "GPS clock requires location with latitude and longitude" });
        }

        // Find org attendance locations
        const orgLocations = await db
          .select()
          .from(attendanceLocations)
          .where(eq(attendanceLocations.orgId, user.orgId!));

        // Check if user is within any configured location radius
        for (const loc of orgLocations) {
          const dist = haversineDistance(
            location.latitude,
            location.longitude,
            parseFloat(loc.latitude),
            parseFloat(loc.longitude)
          );
          if (dist <= loc.radius) {
            locationVerified = true;
            matchedLocationId = loc.id;
            break;
          }
        }

        if (!locationVerified) {
          return reply.status(400).send({
            error: "You are not within any allowed attendance location",
          });
        }
      }

      const [record] = await db
        .insert(clockRecords)
        .values({
          orgId: user.orgId!,
          userId: user.id,
          type: type as typeof clockRecords.$inferInsert.type,
          method: method as typeof clockRecords.$inferInsert.method,
          latitude: location?.latitude != null ? String(location.latitude) : null,
          longitude: location?.longitude != null ? String(location.longitude) : null,
          locationId: matchedLocationId,
          locationVerified,
          note: note?.trim() || null,
        })
        .returning();

      return reply.status(201).send({ record });
    }
  );

  // ========================
  // My Records
  // ========================

  // GET /attendance/my-records?month=YYYY-MM - Get user's clock records for a month
  fastify.get<{ Querystring: MyRecordsQuery }>(
    "/attendance/my-records",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { month } = request.query;

      if (!month) {
        return reply
          .status(400)
          .send({ error: "month query parameter is required (YYYY-MM)" });
      }

      const range = getMonthRange(month);
      if (!range) {
        return reply
          .status(400)
          .send({ error: "Invalid month format. Use YYYY-MM" });
      }

      const records = await db
        .select()
        .from(clockRecords)
        .where(
          and(
            eq(clockRecords.userId, user.id),
            eq(clockRecords.orgId, user.orgId!),
            gte(clockRecords.clockedAt, range.start),
            lte(clockRecords.clockedAt, range.end)
          )
        )
        .orderBy(desc(clockRecords.clockedAt));

      return reply.send({ records });
    }
  );

  // ========================
  // Stats
  // ========================

  // GET /attendance/stats?month=YYYY-MM - Get attendance summary
  fastify.get<{ Querystring: StatsQuery }>(
    "/attendance/stats",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { month } = request.query;

      if (!month) {
        return reply
          .status(400)
          .send({ error: "month query parameter is required (YYYY-MM)" });
      }

      const range = getMonthRange(month);
      if (!range) {
        return reply
          .status(400)
          .send({ error: "Invalid month format. Use YYYY-MM" });
      }

      // Get all clock-in records for the month
      const clockIns = await db
        .select()
        .from(clockRecords)
        .where(
          and(
            eq(clockRecords.userId, user.id),
            eq(clockRecords.orgId, user.orgId!),
            eq(clockRecords.type, "clock_in"),
            gte(clockRecords.clockedAt, range.start),
            lte(clockRecords.clockedAt, range.end)
          )
        );

      // Count unique days present (days with at least one clock_in)
      const daysPresent = new Set(
        clockIns.map((r) => r.clockedAt.toISOString().slice(0, 10))
      ).size;

      // Count late days (clock-in after 9:00 AM - simplified threshold)
      const lateDays = new Set(
        clockIns
          .filter((r) => r.clockedAt.getHours() >= 9 && r.clockedAt.getMinutes() > 0)
          .map((r) => r.clockedAt.toISOString().slice(0, 10))
      ).size;

      // Count working days in the month (Mon-Fri)
      let totalWorkingDays = 0;
      const current = new Date(range.start);
      const today = new Date();
      const endDate = range.end < today ? range.end : today;
      while (current < endDate) {
        const dayOfWeek = current.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          totalWorkingDays++;
        }
        current.setDate(current.getDate() + 1);
      }

      const absentDays = Math.max(0, totalWorkingDays - daysPresent);

      // Get leave days count
      const monthStart = range.start.toISOString().slice(0, 10);
      const monthEnd = new Date(range.end.getTime() - 86400000)
        .toISOString()
        .slice(0, 10);

      const leaveResults = await db
        .select()
        .from(leaveRequests)
        .where(
          and(
            eq(leaveRequests.userId, user.id),
            eq(leaveRequests.orgId, user.orgId!),
            eq(leaveRequests.status, "approved"),
            lte(leaveRequests.startDate, monthEnd),
            gte(leaveRequests.endDate, monthStart)
          )
        );

      let leaveDays = 0;
      for (const lr of leaveResults) {
        const lStart = new Date(lr.startDate);
        const lEnd = new Date(lr.endDate);
        const overlapStart = lStart > range.start ? lStart : range.start;
        const overlapEnd = lEnd < range.end ? lEnd : range.end;
        const diffTime = overlapEnd.getTime() - overlapStart.getTime();
        leaveDays += Math.max(0, Math.ceil(diffTime / 86400000) + 1);
      }

      // Get overtime hours
      const overtimeResults = await db
        .select({
          totalHours: sql<string>`COALESCE(SUM(${overtimeRecords.hours}::numeric), 0)`,
        })
        .from(overtimeRecords)
        .where(
          and(
            eq(overtimeRecords.userId, user.id),
            eq(overtimeRecords.orgId, user.orgId!),
            eq(overtimeRecords.approved, true),
            gte(overtimeRecords.date, monthStart),
            lte(overtimeRecords.date, monthEnd)
          )
        );

      const overtimeHours = parseFloat(overtimeResults[0]?.totalHours || "0");

      return reply.send({
        stats: {
          month,
          days_present: daysPresent,
          days_late: lateDays,
          days_absent: absentDays,
          days_leave: leaveDays,
          overtime_hours: overtimeHours,
          total_working_days: totalWorkingDays,
        },
      });
    }
  );
}
