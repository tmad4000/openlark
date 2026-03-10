import { z } from "zod";

// ============ CALENDAR SCHEMAS ============

export const calendarTypeSchema = z.enum([
  "personal",
  "public",
  "all_staff",
  "shared",
]);

export const createCalendarSchema = z.object({
  name: z.string().min(1).max(255),
  type: calendarTypeSchema.optional().default("personal"),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color")
    .optional(),
  description: z.string().max(1000).optional(),
});

export const updateCalendarSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color")
    .optional(),
  description: z.string().max(1000).optional(),
  isDefault: z.boolean().optional(),
});

// ============ MEETING ROOM SCHEMAS ============

export const createMeetingRoomSchema = z.object({
  name: z.string().min(1).max(255),
  capacity: z.number().int().min(1).max(1000).optional().default(10),
  equipment: z.array(z.string().max(100)).max(20).optional().default([]),
  location: z.string().max(255).optional(),
  floor: z.string().max(50).optional(),
});

export const updateMeetingRoomSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  capacity: z.number().int().min(1).max(1000).optional(),
  equipment: z.array(z.string().max(100)).max(20).optional(),
  location: z.string().max(255).optional(),
  floor: z.string().max(50).optional(),
  isActive: z.boolean().optional(),
});

// ============ EVENT SCHEMAS ============

export const rsvpStatusSchema = z.enum(["pending", "yes", "no", "maybe"]);

export const createEventSchema = z
  .object({
    calendarId: z.string().uuid(),
    title: z.string().min(1).max(255),
    description: z.string().max(5000).optional(),
    startTime: z.string().datetime({ message: "Must be ISO 8601 datetime" }),
    endTime: z.string().datetime({ message: "Must be ISO 8601 datetime" }),
    timezone: z.string().max(100).optional().default("UTC"),
    location: z.string().max(255).optional(),
    // RFC 5545 recurrence rule (e.g., "FREQ=WEEKLY;BYDAY=MO,WE,FR")
    recurrenceRule: z.string().max(500).optional(),
    roomId: z.string().uuid().optional(),
    // Attendee user IDs (creator is automatically added as organizer)
    attendeeIds: z.array(z.string().uuid()).max(500).optional().default([]),
    // Reminder settings (minutes before event)
    reminders: z.array(z.number().int().min(0).max(10080)).max(5).optional(),
    // Create a meeting chat for this event (FR-6.11)
    createMeetingChat: z.boolean().optional().default(false),
    // Generate a meeting link (FR-6.12)
    generateMeetingLink: z.boolean().optional().default(false),
  })
  .refine(
    (data) => new Date(data.startTime) < new Date(data.endTime),
    {
      message: "Start time must be before end time",
      path: ["endTime"],
    }
  );

export const updateEventSchema = z
  .object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().max(5000).optional().nullable(),
    startTime: z
      .string()
      .datetime({ message: "Must be ISO 8601 datetime" })
      .optional(),
    endTime: z
      .string()
      .datetime({ message: "Must be ISO 8601 datetime" })
      .optional(),
    timezone: z.string().max(100).optional(),
    location: z.string().max(255).optional().nullable(),
    recurrenceRule: z.string().max(500).optional().nullable(),
    roomId: z.string().uuid().optional().nullable(),
    reminders: z.array(z.number().int().min(0).max(10080)).max(5).optional(),
    isCancelled: z.boolean().optional(),
  })
  .refine(
    (data) => {
      // If both times are provided, validate order
      if (data.startTime && data.endTime) {
        return new Date(data.startTime) < new Date(data.endTime);
      }
      return true;
    },
    {
      message: "Start time must be before end time",
      path: ["endTime"],
    }
  );

export const rsvpSchema = z.object({
  response: rsvpStatusSchema,
});

// ============ ATTENDEE SCHEMAS ============

export const addAttendeeSchema = z.object({
  userId: z.string().uuid(),
  isRequired: z.boolean().optional().default(true),
});

// ============ SUBSCRIPTION SCHEMAS ============

export const subscribeCalendarSchema = z.object({
  calendarId: z.string().uuid(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color")
    .optional(),
});

export const updateSubscriptionSchema = z.object({
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color")
    .optional(),
  isVisible: z.boolean().optional(),
});

// ============ QUERY SCHEMAS ============

export const eventsQuerySchema = z.object({
  calendarId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().uuid().optional(),
});

export const roomSearchSchema = z.object({
  capacity: z.coerce.number().int().min(1).optional(),
  equipment: z.string().optional(), // Comma-separated equipment
  floor: z.string().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
});

export const availabilitySearchSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(50),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  duration: z.coerce.number().int().min(15).max(480), // Duration in minutes
});

// ============ TYPE EXPORTS ============

export type CreateCalendarInput = z.infer<typeof createCalendarSchema>;
export type UpdateCalendarInput = z.infer<typeof updateCalendarSchema>;
export type CreateMeetingRoomInput = z.infer<typeof createMeetingRoomSchema>;
export type UpdateMeetingRoomInput = z.infer<typeof updateMeetingRoomSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type RsvpInput = z.infer<typeof rsvpSchema>;
export type AddAttendeeInput = z.infer<typeof addAttendeeSchema>;
export type SubscribeCalendarInput = z.infer<typeof subscribeCalendarSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
export type EventsQueryInput = z.infer<typeof eventsQuerySchema>;
export type RoomSearchInput = z.infer<typeof roomSearchSchema>;
export type AvailabilitySearchInput = z.infer<typeof availabilitySearchSchema>;
