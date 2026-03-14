import { db } from "../../db/index.js";
import {
  clockRecords,
  attendanceLocations,
  leaveRequests,
  leaveTypes,
  leaveBalances,
  overtimeRecords,
} from "../../db/schema/index.js";
import { eq, and, gte, lt, sql, desc } from "drizzle-orm";
import type {
  ClockInput,
  MyRecordsQuery,
  StatsQuery,
  CreateLeaveTypeInput,
  CreateLeaveRequestInput,
  LeaveRequestsQueryInput,
  ReviewLeaveRequestInput,
} from "./attendance.schemas.js";

export class AttendanceService {
  // ============ CLOCK ============

  async clock(input: ClockInput, userId: string, orgId: string) {
    // If GPS method, validate against configured locations
    if (input.method === "gps" && input.location) {
      const valid = await this.validateGpsLocation(
        input.location.latitude,
        input.location.longitude,
        orgId
      );
      if (!valid) {
        return { error: "OUTSIDE_LOCATION", message: "You are not within any configured attendance location radius" };
      }
    }

    const [record] = await db
      .insert(clockRecords)
      .values({
        userId,
        orgId,
        type: input.type,
        method: input.method,
        latitude: input.location ? String(input.location.latitude) : null,
        longitude: input.location ? String(input.location.longitude) : null,
        notes: input.notes,
      })
      .returning();

    if (!record) throw new Error("Failed to create clock record");
    return { record };
  }

  private async validateGpsLocation(
    lat: number,
    lng: number,
    orgId: string
  ): Promise<boolean> {
    const locations = await db
      .select()
      .from(attendanceLocations)
      .where(eq(attendanceLocations.orgId, orgId));

    if (locations.length === 0) {
      // No locations configured — allow clock-in from anywhere
      return true;
    }

    for (const loc of locations) {
      const distance = this.haversineDistance(
        lat,
        lng,
        Number(loc.latitude),
        Number(loc.longitude)
      );
      if (distance <= loc.radiusMeters) {
        return true;
      }
    }

    return false;
  }

  private haversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371000; // Earth radius in meters
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // ============ MY RECORDS ============

  async getMyRecords(userId: string, query: MyRecordsQuery) {
    const { startDate, endDate } = this.parseMonth(query.month);

    return db
      .select()
      .from(clockRecords)
      .where(
        and(
          eq(clockRecords.userId, userId),
          gte(clockRecords.timestamp, startDate),
          lt(clockRecords.timestamp, endDate)
        )
      )
      .orderBy(clockRecords.timestamp);
  }

  // ============ STATS ============

  async getStats(userId: string, orgId: string, query: StatsQuery) {
    const { startDate, endDate } = this.parseMonth(query.month);

    // Get clock records for the month
    const records = await db
      .select()
      .from(clockRecords)
      .where(
        and(
          eq(clockRecords.userId, userId),
          gte(clockRecords.timestamp, startDate),
          lt(clockRecords.timestamp, endDate)
        )
      )
      .orderBy(clockRecords.timestamp);

    // Get leave requests for the month
    const leaves = await db
      .select()
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.userId, userId),
          eq(leaveRequests.status, "approved"),
          gte(leaveRequests.startDate, startDate),
          lt(leaveRequests.startDate, endDate)
        )
      );

    // Get overtime for the month
    const overtime = await db
      .select()
      .from(overtimeRecords)
      .where(
        and(
          eq(overtimeRecords.userId, userId),
          eq(overtimeRecords.approved, true),
          gte(overtimeRecords.date, startDate),
          lt(overtimeRecords.date, endDate)
        )
      );

    // Calculate stats
    const clockInDays = new Set<string>();
    let lateDays = 0;

    for (const r of records) {
      const day = r.timestamp.toISOString().slice(0, 10);
      if (r.type === "clock_in") {
        clockInDays.add(day);
        if (r.isLate) lateDays++;
      }
    }

    // Count working days in month (Mon-Fri)
    const workingDays = this.countWorkingDays(startDate, endDate);
    const leaveDays = leaves.reduce((sum, l) => sum + Number(l.days), 0);
    const overtimeHours = overtime.reduce(
      (sum, o) => sum + Number(o.hours),
      0
    );
    const daysPresent = clockInDays.size;
    const daysAbsent = Math.max(
      0,
      workingDays - daysPresent - leaveDays
    );

    return {
      month: query.month,
      workingDays,
      daysPresent,
      daysLate: lateDays,
      daysAbsent,
      leaveDays,
      overtimeHours,
    };
  }

  private parseMonth(month: string) {
    const [year, mon] = month.split("-").map(Number);
    const startDate = new Date(Date.UTC(year!, mon! - 1, 1));
    const endDate = new Date(Date.UTC(year!, mon!, 1));
    return { startDate, endDate };
  }

  private countWorkingDays(start: Date, end: Date): number {
    let count = 0;
    const current = new Date(start);
    while (current < end) {
      const day = current.getUTCDay();
      if (day !== 0 && day !== 6) count++;
      current.setUTCDate(current.getUTCDate() + 1);
    }
    return count;
  }

  // ============ LEAVE TYPES ============

  async createLeaveType(input: CreateLeaveTypeInput, orgId: string) {
    const [lt] = await db
      .insert(leaveTypes)
      .values({
        orgId,
        name: input.name,
        isPaid: input.isPaid,
        defaultDaysPerYear: input.defaultDaysPerYear,
      })
      .returning();
    if (!lt) throw new Error("Failed to create leave type");
    return lt;
  }

  async getLeaveTypes(orgId: string) {
    return db
      .select()
      .from(leaveTypes)
      .where(eq(leaveTypes.orgId, orgId));
  }

  // ============ LEAVE BALANCES ============

  async getLeaveBalances(userId: string, year: number) {
    return db
      .select({
        id: leaveBalances.id,
        leaveTypeId: leaveBalances.leaveTypeId,
        year: leaveBalances.year,
        totalDays: leaveBalances.totalDays,
        usedDays: leaveBalances.usedDays,
        leaveTypeName: leaveTypes.name,
        isPaid: leaveTypes.isPaid,
      })
      .from(leaveBalances)
      .innerJoin(leaveTypes, eq(leaveBalances.leaveTypeId, leaveTypes.id))
      .where(
        and(
          eq(leaveBalances.userId, userId),
          eq(leaveBalances.year, year)
        )
      );
  }

  async initializeBalances(userId: string, orgId: string, year: number) {
    const types = await this.getLeaveTypes(orgId);
    const existing = await this.getLeaveBalances(userId, year);
    const existingTypeIds = new Set(existing.map((b) => b.leaveTypeId));

    const toCreate = types.filter((t) => !existingTypeIds.has(t.id));
    if (toCreate.length === 0) return existing;

    await db.insert(leaveBalances).values(
      toCreate.map((t) => ({
        userId,
        leaveTypeId: t.id,
        year,
        totalDays: String(t.defaultDaysPerYear),
        usedDays: "0",
      }))
    );

    return this.getLeaveBalances(userId, year);
  }

  // ============ LEAVE REQUESTS ============

  async createLeaveRequest(
    input: CreateLeaveRequestInput,
    userId: string,
    orgId: string
  ) {
    // Check balance
    const year = new Date(input.startDate).getUTCFullYear();
    const balances = await this.getLeaveBalances(userId, year);
    const balance = balances.find((b) => b.leaveTypeId === input.leaveTypeId);
    if (balance) {
      const remaining =
        Number(balance.totalDays) - Number(balance.usedDays);
      if (input.days > remaining) {
        return {
          error: "INSUFFICIENT_BALANCE" as const,
          message: `Only ${remaining} days remaining`,
        };
      }
    }

    const [request] = await db
      .insert(leaveRequests)
      .values({
        userId,
        orgId,
        leaveTypeId: input.leaveTypeId,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        days: String(input.days),
        reason: input.reason,
        status: "pending",
      })
      .returning();

    if (!request) throw new Error("Failed to create leave request");
    return { request };
  }

  async getLeaveRequests(
    userId: string,
    orgId: string,
    query: LeaveRequestsQueryInput
  ) {
    const conditions = [
      eq(leaveRequests.orgId, orgId),
      eq(leaveRequests.userId, userId),
    ];
    if (query.status) {
      conditions.push(eq(leaveRequests.status, query.status));
    }

    return db
      .select({
        id: leaveRequests.id,
        userId: leaveRequests.userId,
        orgId: leaveRequests.orgId,
        leaveTypeId: leaveRequests.leaveTypeId,
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
        days: leaveRequests.days,
        reason: leaveRequests.reason,
        status: leaveRequests.status,
        reviewerId: leaveRequests.reviewerId,
        reviewedAt: leaveRequests.reviewedAt,
        createdAt: leaveRequests.createdAt,
        leaveTypeName: leaveTypes.name,
      })
      .from(leaveRequests)
      .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
      .where(and(...conditions))
      .orderBy(desc(leaveRequests.createdAt))
      .limit(query.limit)
      .offset(query.offset);
  }

  async reviewLeaveRequest(
    requestId: string,
    input: ReviewLeaveRequestInput,
    reviewerId: string
  ) {
    const [request] = await db
      .select()
      .from(leaveRequests)
      .where(eq(leaveRequests.id, requestId));

    if (!request) return null;

    if (request.status !== "pending") {
      return { error: "ALREADY_DECIDED" as const, message: "Already reviewed" };
    }

    const [updated] = await db
      .update(leaveRequests)
      .set({
        status: input.decision,
        reviewerId,
        reviewedAt: new Date(),
      })
      .where(eq(leaveRequests.id, requestId))
      .returning();

    // If approved, update balance
    if (input.decision === "approved" && updated) {
      const year = updated.startDate.getUTCFullYear();
      await db
        .update(leaveBalances)
        .set({
          usedDays: sql`${leaveBalances.usedDays}::numeric + ${Number(updated.days)}`,
        })
        .where(
          and(
            eq(leaveBalances.userId, updated.userId),
            eq(leaveBalances.leaveTypeId, updated.leaveTypeId),
            eq(leaveBalances.year, year)
          )
        );
    }

    return { request: updated };
  }

  async getOrgLeaveRequests(orgId: string, query: LeaveRequestsQueryInput) {
    const conditions = [eq(leaveRequests.orgId, orgId)];
    if (query.status) {
      conditions.push(eq(leaveRequests.status, query.status));
    }

    return db
      .select({
        id: leaveRequests.id,
        userId: leaveRequests.userId,
        orgId: leaveRequests.orgId,
        leaveTypeId: leaveRequests.leaveTypeId,
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
        days: leaveRequests.days,
        reason: leaveRequests.reason,
        status: leaveRequests.status,
        reviewerId: leaveRequests.reviewerId,
        reviewedAt: leaveRequests.reviewedAt,
        createdAt: leaveRequests.createdAt,
        leaveTypeName: leaveTypes.name,
      })
      .from(leaveRequests)
      .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
      .where(and(...conditions))
      .orderBy(desc(leaveRequests.createdAt))
      .limit(query.limit)
      .offset(query.offset);
  }
}

export const attendanceService = new AttendanceService();
