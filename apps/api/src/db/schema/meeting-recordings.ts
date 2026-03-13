import { pgTable, uuid, varchar, integer, timestamp, jsonb, text, pgEnum, index } from "drizzle-orm/pg-core";
import { meetings } from "./meetings";
import { users } from "./users";

// Transcription status enum
export const transcriptionStatusEnum = pgEnum("transcription_status", [
  "pending",
  "processing",
  "ready",
  "failed",
]);

// Minutes status enum
export const minutesStatusEnum = pgEnum("minutes_status", [
  "pending",
  "processing",
  "ready",
  "failed",
]);

// Meeting recordings table
export const meetingRecordings = pgTable("meeting_recordings", {
  id: uuid("id").defaultRandom().primaryKey(),
  meetingId: uuid("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
  storageUrl: varchar("storage_url", { length: 2048 }).notNull(),
  duration: integer("duration"), // seconds
  size: integer("size"), // bytes
  transcriptionStatus: transcriptionStatusEnum("transcription_status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("meeting_recordings_meeting_id_idx").on(table.meetingId),
]);

export type MeetingRecording = typeof meetingRecordings.$inferSelect;
export type InsertMeetingRecording = typeof meetingRecordings.$inferInsert;

// Meeting minutes table
export const minutes = pgTable("minutes", {
  id: uuid("id").defaultRandom().primaryKey(),
  meetingId: uuid("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
  recordingId: uuid("recording_id").references(() => meetingRecordings.id, { onDelete: "set null" }),
  transcript: jsonb("transcript").$type<{
    paragraphs: Array<{
      speaker: string;
      speakerId?: string;
      text: string;
      startTime: number;
      endTime: number;
    }>;
  }>(),
  summary: jsonb("summary").$type<{
    overview: string;
    keyPoints: string[];
    decisions: string[];
  }>(),
  chapters: jsonb("chapters").$type<Array<{
    title: string;
    startTime: number;
    endTime: number;
    summary: string;
  }>>(),
  actionItems: jsonb("action_items").$type<Array<{
    text: string;
    assignee?: string;
    assigneeId?: string;
    dueDate?: string;
  }>>(),
  language: varchar("language", { length: 10 }).default("en"),
  status: minutesStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("minutes_meeting_id_idx").on(table.meetingId),
  index("minutes_recording_id_idx").on(table.recordingId),
]);

export type Minutes = typeof minutes.$inferSelect;
export type InsertMinutes = typeof minutes.$inferInsert;

// Minutes comments table
export const minutesComments = pgTable("minutes_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  minutesId: uuid("minutes_id").notNull().references(() => minutes.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  paragraphIndex: integer("paragraph_index").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("minutes_comments_minutes_id_idx").on(table.minutesId),
  index("minutes_comments_user_id_idx").on(table.userId),
]);

export type MinutesComment = typeof minutesComments.$inferSelect;
export type InsertMinutesComment = typeof minutesComments.$inferInsert;
