import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import {
  createCalendarSchema,
  updateCalendarSchema,
  createMeetingRoomSchema,
  updateMeetingRoomSchema,
  createEventSchema,
  updateEventSchema,
  rsvpSchema,
  addAttendeeSchema,
  subscribeCalendarSchema,
  updateSubscriptionSchema,
  eventsQuerySchema,
  roomSearchSchema,
  availabilitySearchSchema,
} from "../modules/calendar/calendar.schemas.js";

// ============ SCHEMA VALIDATION TESTS ============

describe("Calendar Schema Validation", () => {
  describe("createCalendarSchema", () => {
    it("should validate a valid personal calendar input", () => {
      const input = {
        name: "My Calendar",
        type: "personal",
      };
      const result = createCalendarSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should use default type personal when not specified", () => {
      const input = { name: "Work Calendar" };
      const result = createCalendarSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("personal");
      }
    });

    it("should validate public calendar type", () => {
      const input = {
        name: "Company Events",
        type: "public",
        description: "Company-wide events and holidays",
      };
      const result = createCalendarSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject invalid calendar type", () => {
      const input = {
        name: "Test",
        type: "invalid_type",
      };
      const result = createCalendarSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject empty calendar name", () => {
      const input = {
        name: "",
        type: "personal",
      };
      const result = createCalendarSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should validate hex color format", () => {
      const input = {
        name: "Colored Calendar",
        color: "#FF5733",
      };
      const result = createCalendarSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject invalid color format", () => {
      const input = {
        name: "Bad Color",
        color: "red", // Not a hex color
      };
      const result = createCalendarSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject color with wrong length", () => {
      const input = {
        name: "Bad Color",
        color: "#FFF", // Too short
      };
      const result = createCalendarSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("updateCalendarSchema", () => {
    it("should validate partial update with name only", () => {
      const input = { name: "New Name" };
      const result = updateCalendarSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate partial update with color only", () => {
      const input = { color: "#00FF00" };
      const result = updateCalendarSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate setting isDefault", () => {
      const input = { isDefault: true };
      const result = updateCalendarSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should allow empty object (no changes)", () => {
      const input = {};
      const result = updateCalendarSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });
});

describe("Meeting Room Schema Validation", () => {
  describe("createMeetingRoomSchema", () => {
    it("should validate a minimal meeting room", () => {
      const input = { name: "Conference Room A" };
      const result = createMeetingRoomSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should use default capacity of 10", () => {
      const input = { name: "Small Room" };
      const result = createMeetingRoomSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.capacity).toBe(10);
      }
    });

    it("should validate a fully specified meeting room", () => {
      const input = {
        name: "Executive Boardroom",
        capacity: 20,
        equipment: ["projector", "whiteboard", "videoconference"],
        location: "Building A",
        floor: "3",
      };
      const result = createMeetingRoomSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject capacity above 1000", () => {
      const input = {
        name: "Huge Room",
        capacity: 1001,
      };
      const result = createMeetingRoomSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject capacity below 1", () => {
      const input = {
        name: "Tiny Room",
        capacity: 0,
      };
      const result = createMeetingRoomSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject empty room name", () => {
      const input = { name: "" };
      const result = createMeetingRoomSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject too many equipment items", () => {
      const input = {
        name: "Room",
        equipment: Array.from({ length: 21 }, (_, i) => `item${i}`),
      };
      const result = createMeetingRoomSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("updateMeetingRoomSchema", () => {
    it("should validate partial update", () => {
      const input = { capacity: 15 };
      const result = updateMeetingRoomSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate setting isActive", () => {
      const input = { isActive: false };
      const result = updateMeetingRoomSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });
});

describe("Event Schema Validation", () => {
  const validEventInput = {
    calendarId: "123e4567-e89b-12d3-a456-426614174000",
    title: "Team Meeting",
    startTime: "2026-03-15T10:00:00Z",
    endTime: "2026-03-15T11:00:00Z",
  };

  describe("createEventSchema", () => {
    it("should validate a minimal event input", () => {
      const result = createEventSchema.safeParse(validEventInput);
      expect(result.success).toBe(true);
    });

    it("should validate a fully specified event", () => {
      const input = {
        ...validEventInput,
        description: "Weekly team sync",
        timezone: "America/New_York",
        location: "Conference Room B",
        recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
        roomId: "223e4567-e89b-12d3-a456-426614174001",
        attendeeIds: [
          "323e4567-e89b-12d3-a456-426614174002",
          "423e4567-e89b-12d3-a456-426614174003",
        ],
        reminders: [30, 15, 5],
        createMeetingChat: true,
        generateMeetingLink: true,
      };
      const result = createEventSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject event with end time before start time", () => {
      const input = {
        calendarId: "123e4567-e89b-12d3-a456-426614174000",
        title: "Bad Event",
        startTime: "2026-03-15T11:00:00Z",
        endTime: "2026-03-15T10:00:00Z", // Before start
      };
      const result = createEventSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain("endTime");
      }
    });

    it("should reject empty title", () => {
      const input = {
        ...validEventInput,
        title: "",
      };
      const result = createEventSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject invalid calendarId format", () => {
      const input = {
        ...validEventInput,
        calendarId: "not-a-uuid",
      };
      const result = createEventSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject invalid datetime format", () => {
      const input = {
        ...validEventInput,
        startTime: "2026-03-15 10:00:00", // Missing T and Z
      };
      const result = createEventSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject too many attendees", () => {
      const input = {
        ...validEventInput,
        attendeeIds: Array.from(
          { length: 501 },
          (_, i) => `${i.toString().padStart(8, "0")}-e89b-12d3-a456-426614174000`
        ),
      };
      const result = createEventSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject invalid reminder value", () => {
      const input = {
        ...validEventInput,
        reminders: [10081], // Over max (1 week in minutes)
      };
      const result = createEventSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should default to empty attendeeIds", () => {
      const result = createEventSchema.safeParse(validEventInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.attendeeIds).toEqual([]);
      }
    });

    it("should default createMeetingChat to false", () => {
      const result = createEventSchema.safeParse(validEventInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.createMeetingChat).toBe(false);
      }
    });
  });

  describe("updateEventSchema", () => {
    it("should validate partial update with title only", () => {
      const input = { title: "Updated Meeting" };
      const result = updateEventSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should allow setting description to null", () => {
      const input = { description: null };
      const result = updateEventSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate updating both times", () => {
      const input = {
        startTime: "2026-03-15T14:00:00Z",
        endTime: "2026-03-15T15:00:00Z",
      };
      const result = updateEventSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject if new times are invalid order", () => {
      const input = {
        startTime: "2026-03-15T16:00:00Z",
        endTime: "2026-03-15T14:00:00Z", // Before start
      };
      const result = updateEventSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should allow updating only startTime", () => {
      const input = { startTime: "2026-03-15T09:00:00Z" };
      const result = updateEventSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate cancellation", () => {
      const input = { isCancelled: true };
      const result = updateEventSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });
});

describe("RSVP Schema Validation", () => {
  describe("rsvpSchema", () => {
    it("should validate 'yes' response", () => {
      const result = rsvpSchema.safeParse({ response: "yes" });
      expect(result.success).toBe(true);
    });

    it("should validate 'no' response", () => {
      const result = rsvpSchema.safeParse({ response: "no" });
      expect(result.success).toBe(true);
    });

    it("should validate 'maybe' response", () => {
      const result = rsvpSchema.safeParse({ response: "maybe" });
      expect(result.success).toBe(true);
    });

    it("should validate 'pending' response", () => {
      const result = rsvpSchema.safeParse({ response: "pending" });
      expect(result.success).toBe(true);
    });

    it("should reject invalid response", () => {
      const result = rsvpSchema.safeParse({ response: "definitely" });
      expect(result.success).toBe(false);
    });
  });
});

describe("Attendee Schema Validation", () => {
  describe("addAttendeeSchema", () => {
    it("should validate a valid attendee", () => {
      const input = {
        userId: "123e4567-e89b-12d3-a456-426614174000",
      };
      const result = addAttendeeSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should default isRequired to true", () => {
      const input = {
        userId: "123e4567-e89b-12d3-a456-426614174000",
      };
      const result = addAttendeeSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isRequired).toBe(true);
      }
    });

    it("should validate optional attendee", () => {
      const input = {
        userId: "123e4567-e89b-12d3-a456-426614174000",
        isRequired: false,
      };
      const result = addAttendeeSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject invalid userId", () => {
      const input = { userId: "not-a-uuid" };
      const result = addAttendeeSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});

describe("Calendar Subscription Schema Validation", () => {
  describe("subscribeCalendarSchema", () => {
    it("should validate a valid subscription", () => {
      const input = {
        calendarId: "123e4567-e89b-12d3-a456-426614174000",
      };
      const result = subscribeCalendarSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate subscription with custom color", () => {
      const input = {
        calendarId: "123e4567-e89b-12d3-a456-426614174000",
        color: "#FF0000",
      };
      const result = subscribeCalendarSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject invalid calendarId", () => {
      const input = { calendarId: "bad" };
      const result = subscribeCalendarSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("updateSubscriptionSchema", () => {
    it("should validate visibility update", () => {
      const input = { isVisible: false };
      const result = updateSubscriptionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate color update", () => {
      const input = { color: "#00FF00" };
      const result = updateSubscriptionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });
});

describe("Query Schema Validation", () => {
  describe("eventsQuerySchema", () => {
    it("should validate empty query (defaults)", () => {
      const result = eventsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
      }
    });

    it("should validate date range query", () => {
      const input = {
        startDate: "2026-03-01T00:00:00Z",
        endDate: "2026-03-31T23:59:59Z",
      };
      const result = eventsQuerySchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate calendar filter", () => {
      const input = {
        calendarId: "123e4567-e89b-12d3-a456-426614174000",
      };
      const result = eventsQuerySchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject limit over 100", () => {
      const input = { limit: 101 };
      const result = eventsQuerySchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("roomSearchSchema", () => {
    it("should validate capacity search", () => {
      const input = { capacity: 10 };
      const result = roomSearchSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate equipment search", () => {
      const input = { equipment: "projector,whiteboard" };
      const result = roomSearchSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate availability search with time range", () => {
      const input = {
        startTime: "2026-03-15T10:00:00Z",
        endTime: "2026-03-15T11:00:00Z",
      };
      const result = roomSearchSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe("availabilitySearchSchema", () => {
    it("should validate availability search", () => {
      const input = {
        userIds: [
          "123e4567-e89b-12d3-a456-426614174000",
          "223e4567-e89b-12d3-a456-426614174001",
        ],
        startDate: "2026-03-15T08:00:00Z",
        endDate: "2026-03-15T18:00:00Z",
        duration: 60,
      };
      const result = availabilitySearchSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject empty userIds", () => {
      const input = {
        userIds: [],
        startDate: "2026-03-15T08:00:00Z",
        endDate: "2026-03-15T18:00:00Z",
        duration: 60,
      };
      const result = availabilitySearchSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject too many users", () => {
      const input = {
        userIds: Array.from(
          { length: 51 },
          (_, i) => `${i.toString().padStart(8, "0")}-e89b-12d3-a456-426614174000`
        ),
        startDate: "2026-03-15T08:00:00Z",
        endDate: "2026-03-15T18:00:00Z",
        duration: 60,
      };
      const result = availabilitySearchSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject duration under 15 minutes", () => {
      const input = {
        userIds: ["123e4567-e89b-12d3-a456-426614174000"],
        startDate: "2026-03-15T08:00:00Z",
        endDate: "2026-03-15T18:00:00Z",
        duration: 10,
      };
      const result = availabilitySearchSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject duration over 480 minutes (8 hours)", () => {
      const input = {
        userIds: ["123e4567-e89b-12d3-a456-426614174000"],
        startDate: "2026-03-15T08:00:00Z",
        endDate: "2026-03-15T18:00:00Z",
        duration: 500,
      };
      const result = availabilitySearchSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});

// ============ API ROUTE TESTS (Auth Requirements) ============

describe("Calendar API Routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ logger: false });
  });

  describe("Calendar CRUD endpoints", () => {
    it("GET /api/v1/calendar/calendars should require auth", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/calendar/calendars",
      });
      expect(response.statusCode).toBe(401);
    });

    it("POST /api/v1/calendar/calendars should require auth", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/calendar/calendars",
        payload: { name: "Test Calendar" },
      });
      expect(response.statusCode).toBe(401);
    });

    it("PATCH /api/v1/calendar/calendars/:id should require auth", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/calendar/calendars/123e4567-e89b-12d3-a456-426614174000",
        payload: { name: "Updated" },
      });
      expect(response.statusCode).toBe(401);
    });

    it("DELETE /api/v1/calendar/calendars/:id should require auth", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/calendar/calendars/123e4567-e89b-12d3-a456-426614174000",
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe("Event CRUD endpoints", () => {
    it("GET /api/v1/calendar/events should require auth", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/calendar/events",
      });
      expect(response.statusCode).toBe(401);
    });

    it("POST /api/v1/calendar/events should require auth", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/calendar/events",
        payload: {
          calendarId: "123e4567-e89b-12d3-a456-426614174000",
          title: "Test Event",
          startTime: "2026-03-15T10:00:00Z",
          endTime: "2026-03-15T11:00:00Z",
        },
      });
      expect(response.statusCode).toBe(401);
    });

    it("GET /api/v1/calendar/events/:id should require auth", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/calendar/events/123e4567-e89b-12d3-a456-426614174000",
      });
      expect(response.statusCode).toBe(401);
    });

    it("PATCH /api/v1/calendar/events/:id should require auth", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/calendar/events/123e4567-e89b-12d3-a456-426614174000",
        payload: { title: "Updated" },
      });
      expect(response.statusCode).toBe(401);
    });

    it("DELETE /api/v1/calendar/events/:id should require auth", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/calendar/events/123e4567-e89b-12d3-a456-426614174000",
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe("RSVP endpoint", () => {
    it("POST /api/v1/calendar/events/:id/rsvp should require auth", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/calendar/events/123e4567-e89b-12d3-a456-426614174000/rsvp",
        payload: { response: "yes" },
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe("Attendee endpoints", () => {
    it("GET /api/v1/calendar/events/:id/attendees should require auth", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/calendar/events/123e4567-e89b-12d3-a456-426614174000/attendees",
      });
      expect(response.statusCode).toBe(401);
    });

    it("POST /api/v1/calendar/events/:id/attendees should require auth", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/calendar/events/123e4567-e89b-12d3-a456-426614174000/attendees",
        payload: { userId: "223e4567-e89b-12d3-a456-426614174001" },
      });
      expect(response.statusCode).toBe(401);
    });

    it("DELETE /api/v1/calendar/events/:eventId/attendees/:userId should require auth", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/calendar/events/123e4567-e89b-12d3-a456-426614174000/attendees/223e4567-e89b-12d3-a456-426614174001",
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe("Meeting Room endpoints", () => {
    it("GET /api/v1/calendar/rooms should require auth", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/calendar/rooms",
      });
      expect(response.statusCode).toBe(401);
    });

    it("POST /api/v1/calendar/rooms should require auth", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/calendar/rooms",
        payload: { name: "Conference Room A" },
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe("Calendar Subscription endpoints", () => {
    it("GET /api/v1/calendar/subscriptions should require auth", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/calendar/subscriptions",
      });
      expect(response.statusCode).toBe(401);
    });

    it("POST /api/v1/calendar/subscriptions should require auth", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/calendar/subscriptions",
        payload: { calendarId: "123e4567-e89b-12d3-a456-426614174000" },
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe("Availability endpoint", () => {
    it("POST /api/v1/calendar/availability should require auth", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/calendar/availability",
        payload: {
          userIds: ["123e4567-e89b-12d3-a456-426614174000"],
          startDate: "2026-03-15T08:00:00Z",
          endDate: "2026-03-15T18:00:00Z",
          duration: 60,
        },
      });
      expect(response.statusCode).toBe(401);
    });
  });
});
