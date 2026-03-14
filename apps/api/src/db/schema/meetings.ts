import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users } from "./auth";

// ============ ENUMS ============

export const meetingTypeEnum = pgEnum("meeting_type", [
  "instant",
  "scheduled",
  "recurring",
]);

export const meetingStatusEnum = pgEnum("meeting_status", [
  "waiting",
  "active",
  "ended",
  "cancelled",
]);

export const meetingParticipantRoleEnum = pgEnum("meeting_participant_role", [
  "host",
  "co_host",
  "participant",
]);

// ============ MEETINGS ============

export const meetings = pgTable(
  "meetings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    title: varchar("title", { length: 255 }).notNull(),
    hostId: uuid("host_id")
      .notNull()
      .references(() => users.id),
    type: meetingTypeEnum("type").notNull().default("instant"),
    status: meetingStatusEnum("status").notNull().default("waiting"),
    roomId: varchar("room_id", { length: 255 }).notNull(),
    settings: jsonb("settings").default({}),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("meetings_org_id_idx").on(table.orgId),
    index("meetings_host_id_idx").on(table.hostId),
    index("meetings_status_idx").on(table.status),
    index("meetings_room_id_idx").on(table.roomId),
  ]
);

// ============ MEETING PARTICIPANTS ============

export const meetingParticipants = pgTable(
  "meeting_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: meetingParticipantRoleEnum("role").notNull().default("participant"),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    leftAt: timestamp("left_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("meeting_participants_unique_idx").on(
      table.meetingId,
      table.userId
    ),
    index("meeting_participants_meeting_id_idx").on(table.meetingId),
    index("meeting_participants_user_id_idx").on(table.userId),
  ]
);

// ============ RELATIONS ============

export const meetingsRelations = relations(meetings, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [meetings.orgId],
    references: [organizations.id],
  }),
  host: one(users, {
    fields: [meetings.hostId],
    references: [users.id],
  }),
  participants: many(meetingParticipants),
}));

export const meetingParticipantsRelations = relations(
  meetingParticipants,
  ({ one }) => ({
    meeting: one(meetings, {
      fields: [meetingParticipants.meetingId],
      references: [meetings.id],
    }),
    user: one(users, {
      fields: [meetingParticipants.userId],
      references: [users.id],
    }),
  })
);

// ============ TYPE EXPORTS ============

export type Meeting = typeof meetings.$inferSelect;
export type NewMeeting = typeof meetings.$inferInsert;

export type MeetingParticipant = typeof meetingParticipants.$inferSelect;
export type NewMeetingParticipant = typeof meetingParticipants.$inferInsert;
