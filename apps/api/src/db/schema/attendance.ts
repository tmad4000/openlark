import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  numeric,
  integer,
  boolean,
  jsonb,
  pgEnum,
  index,
  date,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

// Clock method enum
export const clockMethodEnum = pgEnum("clock_method", [
  "gps",
  "wifi",
  "manual",
]);

// Clock type enum
export const clockTypeEnum = pgEnum("clock_type", [
  "clock_in",
  "clock_out",
]);

// Leave request status enum
export const leaveRequestStatusEnum = pgEnum("leave_request_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

// Shift type enum
export const shiftTypeEnum = pgEnum("shift_type", [
  "fixed",
  "flexible",
  "free",
]);

// Attendance groups table
export const attendanceGroups = pgTable(
  "attendance_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("attendance_groups_org_id_idx").on(table.orgId),
  ]
);

export type AttendanceGroup = typeof attendanceGroups.$inferSelect;
export type NewAttendanceGroup = typeof attendanceGroups.$inferInsert;

// Attendance locations table
export const attendanceLocations = pgTable(
  "attendance_locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .references(() => attendanceGroups.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    latitude: numeric("latitude").notNull(),
    longitude: numeric("longitude").notNull(),
    radius: integer("radius").notNull().default(200), // meters
    address: text("address"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("attendance_locations_org_id_idx").on(table.orgId),
    index("attendance_locations_group_id_idx").on(table.groupId),
  ]
);

export type AttendanceLocation = typeof attendanceLocations.$inferSelect;
export type NewAttendanceLocation = typeof attendanceLocations.$inferInsert;

// Shifts table
export const shifts = pgTable(
  "shifts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    type: shiftTypeEnum("type").notNull().default("fixed"),
    startTime: varchar("start_time", { length: 5 }).notNull(), // HH:MM
    endTime: varchar("end_time", { length: 5 }).notNull(), // HH:MM
    lateThresholdMinutes: integer("late_threshold_minutes").default(15),
    earlyLeaveThresholdMinutes: integer("early_leave_threshold_minutes").default(15),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("shifts_org_id_idx").on(table.orgId),
  ]
);

export type Shift = typeof shifts.$inferSelect;
export type NewShift = typeof shifts.$inferInsert;

// Shift assignments table
export const shiftAssignments = pgTable(
  "shift_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shiftId: uuid("shift_id")
      .notNull()
      .references(() => shifts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    effectiveDate: date("effective_date").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("shift_assignments_shift_id_idx").on(table.shiftId),
    index("shift_assignments_user_id_idx").on(table.userId),
  ]
);

export type ShiftAssignment = typeof shiftAssignments.$inferSelect;
export type NewShiftAssignment = typeof shiftAssignments.$inferInsert;

// Clock records table
export const clockRecords = pgTable(
  "clock_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: clockTypeEnum("type").notNull(),
    method: clockMethodEnum("method").notNull(),
    latitude: numeric("latitude"),
    longitude: numeric("longitude"),
    locationId: uuid("location_id")
      .references(() => attendanceLocations.id, { onDelete: "set null" }),
    locationVerified: boolean("location_verified").default(false),
    note: text("note"),
    clockedAt: timestamp("clocked_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("clock_records_org_id_idx").on(table.orgId),
    index("clock_records_user_id_idx").on(table.userId),
    index("clock_records_clocked_at_idx").on(table.clockedAt),
  ]
);

export type ClockRecord = typeof clockRecords.$inferSelect;
export type NewClockRecord = typeof clockRecords.$inferInsert;

// Leave types table
export const leaveTypes = pgTable(
  "leave_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    paid: boolean("paid").notNull().default(true),
    defaultDays: numeric("default_days").notNull().default("0"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("leave_types_org_id_idx").on(table.orgId),
  ]
);

export type LeaveType = typeof leaveTypes.$inferSelect;
export type NewLeaveType = typeof leaveTypes.$inferInsert;

// Leave balances table
export const leaveBalances = pgTable(
  "leave_balances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    leaveTypeId: uuid("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    totalDays: numeric("total_days").notNull().default("0"),
    usedDays: numeric("used_days").notNull().default("0"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("leave_balances_user_id_idx").on(table.userId),
    index("leave_balances_leave_type_id_idx").on(table.leaveTypeId),
  ]
);

export type LeaveBalance = typeof leaveBalances.$inferSelect;
export type NewLeaveBalance = typeof leaveBalances.$inferInsert;

// Leave requests table
export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    leaveTypeId: uuid("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    reason: text("reason"),
    status: leaveRequestStatusEnum("status").notNull().default("pending"),
    reviewerId: uuid("reviewer_id")
      .references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("leave_requests_org_id_idx").on(table.orgId),
    index("leave_requests_user_id_idx").on(table.userId),
    index("leave_requests_status_idx").on(table.status),
  ]
);

export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type NewLeaveRequest = typeof leaveRequests.$inferInsert;

// Overtime records table
export const overtimeRecords = pgTable(
  "overtime_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    hours: numeric("hours").notNull(),
    reason: text("reason"),
    approved: boolean("approved").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("overtime_records_org_id_idx").on(table.orgId),
    index("overtime_records_user_id_idx").on(table.userId),
    index("overtime_records_date_idx").on(table.date),
  ]
);

export type OvertimeRecord = typeof overtimeRecords.$inferSelect;
export type NewOvertimeRecord = typeof overtimeRecords.$inferInsert;
