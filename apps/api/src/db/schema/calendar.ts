import { pgTable, uuid, varchar, text, timestamp, jsonb, pgEnum, index, primaryKey, integer } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

// Calendar type enum
export const calendarTypeEnum = pgEnum("calendar_type", ["personal", "public", "all_staff", "shared"]);

// RSVP status enum
export const rsvpStatusEnum = pgEnum("rsvp_status", ["pending", "yes", "no", "maybe"]);

// Calendars table
export const calendars = pgTable("calendars", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  type: calendarTypeEnum("type").notNull().default("personal"),
  name: varchar("name", { length: 255 }).notNull(),
  color: varchar("color", { length: 7 }), // hex color like #FF5733
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("calendars_org_id_idx").on(table.orgId),
  index("calendars_owner_id_idx").on(table.ownerId),
  index("calendars_type_idx").on(table.type),
]);

export type Calendar = typeof calendars.$inferSelect;
export type InsertCalendar = typeof calendars.$inferInsert;

// Calendar subscriptions table
export const calendarSubscriptions = pgTable("calendar_subscriptions", {
  calendarId: uuid("calendar_id").notNull().references(() => calendars.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subscribedAt: timestamp("subscribed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.calendarId, table.userId] }),
  index("calendar_subscriptions_user_id_idx").on(table.userId),
]);

export type CalendarSubscription = typeof calendarSubscriptions.$inferSelect;
export type InsertCalendarSubscription = typeof calendarSubscriptions.$inferInsert;

// Meeting rooms table
export const meetingRooms = pgTable("meeting_rooms", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  capacity: integer("capacity"),
  equipment: jsonb("equipment").$type<string[]>(), // array of equipment names
  location: varchar("location", { length: 255 }),
  floor: varchar("floor", { length: 50 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("meeting_rooms_org_id_idx").on(table.orgId),
]);

export type MeetingRoom = typeof meetingRooms.$inferSelect;
export type InsertMeetingRoom = typeof meetingRooms.$inferInsert;

// Calendar events table
export const calendarEvents = pgTable("calendar_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  calendarId: uuid("calendar_id").references(() => calendars.id, { onDelete: "set null" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  timezone: varchar("timezone", { length: 50 }).notNull().default("UTC"),
  location: varchar("location", { length: 255 }),
  recurrenceRule: varchar("recurrence_rule", { length: 255 }), // iCal RRULE format
  creatorId: uuid("creator_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  meetingId: uuid("meeting_id"), // reference to a chat or video meeting
  roomId: uuid("room_id").references(() => meetingRooms.id, { onDelete: "set null" }),
  settings: jsonb("settings").$type<{
    isAllDay?: boolean;
    reminders?: Array<{ type: "email" | "push"; minutes: number }>;
    conferenceLink?: string;
    visibility?: "public" | "private" | "busy";
  }>(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("calendar_events_org_id_idx").on(table.orgId),
  index("calendar_events_calendar_id_idx").on(table.calendarId),
  index("calendar_events_creator_id_idx").on(table.creatorId),
  index("calendar_events_start_time_idx").on(table.startTime),
  index("calendar_events_end_time_idx").on(table.endTime),
  index("calendar_events_room_id_idx").on(table.roomId),
]);

export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type InsertCalendarEvent = typeof calendarEvents.$inferInsert;

// Event attendees table
export const eventAttendees = pgTable("event_attendees", {
  eventId: uuid("event_id").notNull().references(() => calendarEvents.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rsvp: rsvpStatusEnum("rsvp").notNull().default("pending"),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.eventId, table.userId] }),
  index("event_attendees_user_id_idx").on(table.userId),
  index("event_attendees_rsvp_idx").on(table.rsvp),
]);

export type EventAttendee = typeof eventAttendees.$inferSelect;
export type InsertEventAttendee = typeof eventAttendees.$inferInsert;
