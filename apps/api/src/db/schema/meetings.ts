import { pgTable, uuid, varchar, timestamp, jsonb, pgEnum, index, primaryKey } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

// Meeting type enum
export const meetingTypeEnum = pgEnum("meeting_type", ["instant", "scheduled", "recurring"]);

// Meeting status enum
export const meetingStatusEnum = pgEnum("meeting_status", ["waiting", "active", "ended"]);

// Meeting participant role enum
export const meetingParticipantRoleEnum = pgEnum("meeting_participant_role", ["host", "co_host", "participant"]);

// Meetings table
export const meetings = pgTable("meetings", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  hostId: uuid("host_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: meetingTypeEnum("type").notNull().default("instant"),
  status: meetingStatusEnum("status").notNull().default("waiting"),
  roomId: varchar("room_id", { length: 255 }),
  settings: jsonb("settings").$type<{
    muteOnJoin?: boolean;
    cameraOffOnJoin?: boolean;
    allowScreenShare?: boolean;
    allowRecording?: boolean;
    maxParticipants?: number;
  }>(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("meetings_org_id_idx").on(table.orgId),
  index("meetings_host_id_idx").on(table.hostId),
  index("meetings_status_idx").on(table.status),
]);

export type Meeting = typeof meetings.$inferSelect;
export type InsertMeeting = typeof meetings.$inferInsert;

// Meeting participants table
export const meetingParticipants = pgTable("meeting_participants", {
  meetingId: uuid("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: meetingParticipantRoleEnum("role").notNull().default("participant"),
  joinedAt: timestamp("joined_at", { withTimezone: true }),
  leftAt: timestamp("left_at", { withTimezone: true }),
}, (table) => [
  primaryKey({ columns: [table.meetingId, table.userId] }),
  index("meeting_participants_user_id_idx").on(table.userId),
]);

export type MeetingParticipant = typeof meetingParticipants.$inferSelect;
export type InsertMeetingParticipant = typeof meetingParticipants.$inferInsert;
