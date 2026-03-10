import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  pgEnum,
  boolean,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users } from "./auth";

// ============ ENUMS ============

export const calendarTypeEnum = pgEnum("calendar_type", [
  "personal",
  "public",
  "all_staff",
  "shared",
]);

export const rsvpStatusEnum = pgEnum("rsvp_status", [
  "pending",
  "yes",
  "no",
  "maybe",
]);

// ============ CALENDARS ============

/**
 * Calendars can be personal, public, all-staff, or shared.
 * FR-6.8, FR-6.9, FR-6.10
 */
export const calendars = pgTable(
  "calendars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    type: calendarTypeEnum("type").notNull().default("personal"),
    name: varchar("name", { length: 255 }).notNull(),
    color: varchar("color", { length: 20 }).default("#3B82F6"), // Default blue
    description: text("description"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("calendars_org_id_idx").on(table.orgId),
    index("calendars_owner_id_idx").on(table.ownerId),
    index("calendars_type_idx").on(table.type),
  ]
);

// ============ CALENDAR SUBSCRIPTIONS ============

/**
 * Users can subscribe to calendars to see events in their view.
 * FR-6.8, FR-6.9
 */
export const calendarSubscriptions = pgTable(
  "calendar_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    color: varchar("color", { length: 20 }), // Override color for subscriber
    isVisible: boolean("is_visible").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("calendar_subscriptions_unique_idx").on(
      table.calendarId,
      table.userId
    ),
    index("calendar_subscriptions_user_id_idx").on(table.userId),
  ]
);

// ============ MEETING ROOMS ============

/**
 * Meeting rooms for booking during events.
 * FR-6.4
 */
export const meetingRooms = pgTable(
  "meeting_rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: varchar("name", { length: 255 }).notNull(),
    capacity: integer("capacity").notNull().default(10),
    equipmentJson: jsonb("equipment_json").default([]), // ["projector", "whiteboard", "videoconference"]
    location: varchar("location", { length: 255 }),
    floor: varchar("floor", { length: 50 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("meeting_rooms_org_id_idx").on(table.orgId),
    index("meeting_rooms_capacity_idx").on(table.capacity),
  ]
);

// ============ CALENDAR EVENTS ============

/**
 * Calendar events with support for recurring events.
 * FR-6.1, FR-6.2
 */
export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    timezone: varchar("timezone", { length: 100 }).notNull().default("UTC"),
    location: varchar("location", { length: 255 }),
    // RFC 5545 recurrence rule (e.g., "FREQ=WEEKLY;BYDAY=MO,WE,FR")
    recurrenceRule: text("recurrence_rule"),
    // For recurring events, this is the parent event ID
    recurringEventId: uuid("recurring_event_id"),
    // Meeting room booking
    roomId: uuid("room_id").references(() => meetingRooms.id),
    // Meeting link (for video meetings)
    meetingId: uuid("meeting_id"),
    meetingLink: text("meeting_link"),
    // Event creator
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id),
    // Chat created for this event
    chatId: uuid("chat_id"),
    // Settings
    settingsJson: jsonb("settings_json").default({}),
    // Reminder settings (array of minutes before event)
    reminders: jsonb("reminders").default([15, 5]),
    // Status
    isCancelled: boolean("is_cancelled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("calendar_events_org_id_idx").on(table.orgId),
    index("calendar_events_calendar_id_idx").on(table.calendarId),
    index("calendar_events_creator_id_idx").on(table.creatorId),
    index("calendar_events_start_time_idx").on(table.startTime),
    index("calendar_events_end_time_idx").on(table.endTime),
    index("calendar_events_room_id_idx").on(table.roomId),
    index("calendar_events_recurring_event_id_idx").on(table.recurringEventId),
    // Index for finding events in a time range
    index("calendar_events_time_range_idx").on(table.startTime, table.endTime),
  ]
);

// ============ EVENT ATTENDEES ============

/**
 * Attendees for calendar events with RSVP status.
 * FR-6.3
 */
export const eventAttendees = pgTable(
  "event_attendees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => calendarEvents.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rsvp: rsvpStatusEnum("rsvp").notNull().default("pending"),
    isRequired: boolean("is_required").notNull().default(true),
    isOrganizer: boolean("is_organizer").notNull().default(false),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("event_attendees_unique_idx").on(table.eventId, table.userId),
    index("event_attendees_event_id_idx").on(table.eventId),
    index("event_attendees_user_id_idx").on(table.userId),
    index("event_attendees_rsvp_idx").on(table.rsvp),
  ]
);

// ============ RELATIONS ============

export const calendarsRelations = relations(calendars, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [calendars.orgId],
    references: [organizations.id],
  }),
  owner: one(users, {
    fields: [calendars.ownerId],
    references: [users.id],
  }),
  events: many(calendarEvents),
  subscriptions: many(calendarSubscriptions),
}));

export const calendarSubscriptionsRelations = relations(
  calendarSubscriptions,
  ({ one }) => ({
    calendar: one(calendars, {
      fields: [calendarSubscriptions.calendarId],
      references: [calendars.id],
    }),
    user: one(users, {
      fields: [calendarSubscriptions.userId],
      references: [users.id],
    }),
  })
);

export const meetingRoomsRelations = relations(meetingRooms, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [meetingRooms.orgId],
    references: [organizations.id],
  }),
  events: many(calendarEvents),
}));

export const calendarEventsRelations = relations(
  calendarEvents,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [calendarEvents.orgId],
      references: [organizations.id],
    }),
    calendar: one(calendars, {
      fields: [calendarEvents.calendarId],
      references: [calendars.id],
    }),
    creator: one(users, {
      fields: [calendarEvents.creatorId],
      references: [users.id],
    }),
    room: one(meetingRooms, {
      fields: [calendarEvents.roomId],
      references: [meetingRooms.id],
    }),
    recurringParent: one(calendarEvents, {
      fields: [calendarEvents.recurringEventId],
      references: [calendarEvents.id],
      relationName: "recurringInstances",
    }),
    recurringInstances: many(calendarEvents, {
      relationName: "recurringInstances",
    }),
    attendees: many(eventAttendees),
  })
);

export const eventAttendeesRelations = relations(eventAttendees, ({ one }) => ({
  event: one(calendarEvents, {
    fields: [eventAttendees.eventId],
    references: [calendarEvents.id],
  }),
  user: one(users, {
    fields: [eventAttendees.userId],
    references: [users.id],
  }),
}));

// ============ TYPE EXPORTS ============

export type Calendar = typeof calendars.$inferSelect;
export type NewCalendar = typeof calendars.$inferInsert;

export type CalendarSubscription = typeof calendarSubscriptions.$inferSelect;
export type NewCalendarSubscription = typeof calendarSubscriptions.$inferInsert;

export type MeetingRoom = typeof meetingRooms.$inferSelect;
export type NewMeetingRoom = typeof meetingRooms.$inferInsert;

export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type NewCalendarEvent = typeof calendarEvents.$inferInsert;

export type EventAttendee = typeof eventAttendees.$inferSelect;
export type NewEventAttendee = typeof eventAttendees.$inferInsert;
