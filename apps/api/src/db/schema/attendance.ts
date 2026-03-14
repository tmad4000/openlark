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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users } from "./auth";

// ============ ENUMS ============

export const clockTypeEnum = pgEnum("clock_type", ["clock_in", "clock_out"]);

export const clockMethodEnum = pgEnum("clock_method", [
  "gps",
  "wifi",
  "manual",
]);

export const leaveRequestStatusEnum = pgEnum("leave_request_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

// ============ TABLES ============

export const attendanceGroups = pgTable(
  "attendance_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("attendance_groups_org_id_idx").on(table.orgId),
  ]
);

export const attendanceLocations = pgTable(
  "attendance_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: varchar("name", { length: 255 }).notNull(),
    latitude: numeric("latitude").notNull(),
    longitude: numeric("longitude").notNull(),
    radiusMeters: integer("radius_meters").notNull().default(200),
    address: text("address"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("attendance_locations_org_id_idx").on(table.orgId),
  ]
);

export const shifts = pgTable(
  "shifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: varchar("name", { length: 255 }).notNull(),
    startTime: varchar("start_time", { length: 5 }).notNull(), // "HH:MM"
    endTime: varchar("end_time", { length: 5 }).notNull(), // "HH:MM"
    flexMinutes: integer("flex_minutes").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("shifts_org_id_idx").on(table.orgId),
  ]
);

export const shiftAssignments = pgTable(
  "shift_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shiftId: uuid("shift_id")
      .notNull()
      .references(() => shifts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => attendanceGroups.id, {
      onDelete: "set null",
    }),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("shift_assignments_shift_id_idx").on(table.shiftId),
    index("shift_assignments_user_id_idx").on(table.userId),
    index("shift_assignments_group_id_idx").on(table.groupId),
  ]
);

export const clockRecords = pgTable(
  "clock_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    type: clockTypeEnum("type").notNull(),
    method: clockMethodEnum("method").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true })
      .notNull()
      .defaultNow(),
    latitude: numeric("latitude"),
    longitude: numeric("longitude"),
    locationId: uuid("location_id").references(() => attendanceLocations.id),
    isLate: boolean("is_late").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("clock_records_user_id_idx").on(table.userId),
    index("clock_records_org_id_idx").on(table.orgId),
    index("clock_records_timestamp_idx").on(table.timestamp),
    index("clock_records_user_timestamp_idx").on(table.userId, table.timestamp),
  ]
);

export const leaveTypes = pgTable(
  "leave_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: varchar("name", { length: 255 }).notNull(),
    isPaid: boolean("is_paid").notNull().default(true),
    defaultDaysPerYear: integer("default_days_per_year").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("leave_types_org_id_idx").on(table.orgId),
  ]
);

export const leaveBalances = pgTable(
  "leave_balances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    leaveTypeId: uuid("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    totalDays: numeric("total_days").notNull(),
    usedDays: numeric("used_days").notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("leave_balances_user_id_idx").on(table.userId),
    index("leave_balances_leave_type_id_idx").on(table.leaveTypeId),
    index("leave_balances_year_idx").on(table.year),
  ]
);

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    leaveTypeId: uuid("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }).notNull(),
    days: numeric("days").notNull(),
    reason: text("reason"),
    status: leaveRequestStatusEnum("status").notNull().default("pending"),
    reviewerId: uuid("reviewer_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("leave_requests_user_id_idx").on(table.userId),
    index("leave_requests_org_id_idx").on(table.orgId),
    index("leave_requests_status_idx").on(table.status),
  ]
);

export const overtimeRecords = pgTable(
  "overtime_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    date: timestamp("date", { withTimezone: true }).notNull(),
    hours: numeric("hours").notNull(),
    reason: text("reason"),
    approved: boolean("approved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("overtime_records_user_id_idx").on(table.userId),
    index("overtime_records_org_id_idx").on(table.orgId),
    index("overtime_records_date_idx").on(table.date),
  ]
);

// ============ RELATIONS ============

export const attendanceGroupsRelations = relations(
  attendanceGroups,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [attendanceGroups.orgId],
      references: [organizations.id],
    }),
    shiftAssignments: many(shiftAssignments),
  })
);

export const attendanceLocationsRelations = relations(
  attendanceLocations,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [attendanceLocations.orgId],
      references: [organizations.id],
    }),
  })
);

export const shiftsRelations = relations(shifts, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [shifts.orgId],
    references: [organizations.id],
  }),
  assignments: many(shiftAssignments),
}));

export const shiftAssignmentsRelations = relations(
  shiftAssignments,
  ({ one }) => ({
    shift: one(shifts, {
      fields: [shiftAssignments.shiftId],
      references: [shifts.id],
    }),
    user: one(users, {
      fields: [shiftAssignments.userId],
      references: [users.id],
    }),
    group: one(attendanceGroups, {
      fields: [shiftAssignments.groupId],
      references: [attendanceGroups.id],
    }),
  })
);

export const clockRecordsRelations = relations(clockRecords, ({ one }) => ({
  user: one(users, {
    fields: [clockRecords.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [clockRecords.orgId],
    references: [organizations.id],
  }),
  location: one(attendanceLocations, {
    fields: [clockRecords.locationId],
    references: [attendanceLocations.id],
  }),
}));

export const leaveTypesRelations = relations(leaveTypes, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [leaveTypes.orgId],
    references: [organizations.id],
  }),
  balances: many(leaveBalances),
  requests: many(leaveRequests),
}));

export const leaveBalancesRelations = relations(leaveBalances, ({ one }) => ({
  user: one(users, {
    fields: [leaveBalances.userId],
    references: [users.id],
  }),
  leaveType: one(leaveTypes, {
    fields: [leaveBalances.leaveTypeId],
    references: [leaveTypes.id],
  }),
}));

export const leaveRequestsRelations = relations(leaveRequests, ({ one }) => ({
  user: one(users, {
    fields: [leaveRequests.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [leaveRequests.orgId],
    references: [organizations.id],
  }),
  leaveType: one(leaveTypes, {
    fields: [leaveRequests.leaveTypeId],
    references: [leaveTypes.id],
  }),
  reviewer: one(users, {
    fields: [leaveRequests.reviewerId],
    references: [users.id],
    relationName: "leaveReviewer",
  }),
}));

export const overtimeRecordsRelations = relations(
  overtimeRecords,
  ({ one }) => ({
    user: one(users, {
      fields: [overtimeRecords.userId],
      references: [users.id],
    }),
    organization: one(organizations, {
      fields: [overtimeRecords.orgId],
      references: [organizations.id],
    }),
  })
);

// ============ TYPES ============

export type AttendanceGroup = typeof attendanceGroups.$inferSelect;
export type NewAttendanceGroup = typeof attendanceGroups.$inferInsert;
export type AttendanceLocation = typeof attendanceLocations.$inferSelect;
export type NewAttendanceLocation = typeof attendanceLocations.$inferInsert;
export type Shift = typeof shifts.$inferSelect;
export type NewShift = typeof shifts.$inferInsert;
export type ShiftAssignment = typeof shiftAssignments.$inferSelect;
export type NewShiftAssignment = typeof shiftAssignments.$inferInsert;
export type ClockRecord = typeof clockRecords.$inferSelect;
export type NewClockRecord = typeof clockRecords.$inferInsert;
export type LeaveType = typeof leaveTypes.$inferSelect;
export type NewLeaveType = typeof leaveTypes.$inferInsert;
export type LeaveBalance = typeof leaveBalances.$inferSelect;
export type NewLeaveBalance = typeof leaveBalances.$inferInsert;
export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type NewLeaveRequest = typeof leaveRequests.$inferInsert;
export type OvertimeRecord = typeof overtimeRecords.$inferSelect;
export type NewOvertimeRecord = typeof overtimeRecords.$inferInsert;
