import { db } from "../../db/index.js";
import {
  clockRecords,
  attendanceLocations,
  leaveRequests,
  overtimeRecords,
} from "../../db/schema/index.js";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import type { ClockInput, MyRecordsQuery, StatsQuery } from "./attendance.schemas.js";

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
}

export const attendanceService = new AttendanceService();
