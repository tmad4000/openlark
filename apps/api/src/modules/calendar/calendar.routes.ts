import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { calendarService } from "./calendar.service.js";
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
} from "./calendar.schemas.js";
import { authenticate, requireAdmin } from "../auth/middleware.js";
import { formatZodError } from "../../utils/validation.js";

export async function calendarRoutes(app: FastifyInstance) {
  // All calendar routes require authentication
  app.addHook("preHandler", authenticate);

  // ============ CALENDAR ENDPOINTS ============

  // GET /calendar/calendars - List user's calendars
  app.get("/calendars", async (req, reply) => {
    const calendars = await calendarService.getUserCalendars(
      req.user!.id,
      req.user!.orgId
    );
    return reply.send({ data: { calendars } });
  });

  // POST /calendar/calendars - Create a new calendar
  app.post("/calendars", async (req, reply) => {
    try {
      const input = createCalendarSchema.parse(req.body);
      const calendar = await calendarService.createCalendar(
        input,
        req.user!.id,
        req.user!.orgId
      );
      return reply.status(201).send({ data: { calendar } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // GET /calendar/calendars/:id - Get calendar details
  app.get<{ Params: { id: string } }>("/calendars/:id", async (req, reply) => {
    const calendar = await calendarService.getCalendarById(
      req.params.id,
      req.user!.id
    );

    if (!calendar) {
      return reply.status(404).send({
        code: "CALENDAR_NOT_FOUND",
        message: "Calendar not found or not accessible",
      });
    }

    return reply.send({ data: { calendar } });
  });

  // PATCH /calendar/calendars/:id - Update a calendar
  app.patch<{ Params: { id: string } }>(
    "/calendars/:id",
    async (req, reply) => {
      try {
        const input = updateCalendarSchema.parse(req.body);
        const calendar = await calendarService.updateCalendar(
          req.params.id,
          input,
          req.user!.id
        );

        if (!calendar) {
          return reply.status(404).send({
            code: "CALENDAR_NOT_FOUND",
            message: "Calendar not found",
          });
        }

        return reply.send({ data: { calendar } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        if (error instanceof Error && error.message.includes("Not authorized")) {
          return reply.status(403).send({
            code: "NOT_AUTHORIZED",
            message: error.message,
          });
        }
        throw error;
      }
    }
  );

  // DELETE /calendar/calendars/:id - Delete a calendar
  app.delete<{ Params: { id: string } }>(
    "/calendars/:id",
    async (req, reply) => {
      try {
        const deleted = await calendarService.deleteCalendar(
          req.params.id,
          req.user!.id
        );

        if (!deleted) {
          return reply.status(404).send({
            code: "CALENDAR_NOT_FOUND",
            message: "Calendar not found",
          });
        }

        return reply.status(204).send();
      } catch (error) {
        if (error instanceof Error && error.message.includes("Not authorized")) {
          return reply.status(403).send({
            code: "NOT_AUTHORIZED",
            message: error.message,
          });
        }
        throw error;
      }
    }
  );

  // ============ SUBSCRIPTION ENDPOINTS ============

  // GET /calendar/subscriptions - List user's subscriptions
  app.get("/subscriptions", async (req, reply) => {
    const subscriptions = await calendarService.getUserSubscriptions(
      req.user!.id
    );
    return reply.send({ data: { subscriptions } });
  });

  // POST /calendar/subscriptions - Subscribe to a calendar
  app.post("/subscriptions", async (req, reply) => {
    try {
      const input = subscribeCalendarSchema.parse(req.body);
      const subscription = await calendarService.subscribeToCalendar(
        input,
        req.user!.id
      );
      return reply.status(201).send({ data: { subscription } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      if (error instanceof Error) {
        if (error.message === "Calendar not found") {
          return reply.status(404).send({
            code: "CALENDAR_NOT_FOUND",
            message: error.message,
          });
        }
        if (error.message.includes("Cannot subscribe")) {
          return reply.status(403).send({
            code: "NOT_AUTHORIZED",
            message: error.message,
          });
        }
      }
      throw error;
    }
  });

  // PATCH /calendar/subscriptions/:id - Update subscription
  app.patch<{ Params: { id: string } }>(
    "/subscriptions/:id",
    async (req, reply) => {
      try {
        const input = updateSubscriptionSchema.parse(req.body);
        const subscription = await calendarService.updateSubscription(
          req.params.id,
          input,
          req.user!.id
        );

        if (!subscription) {
          return reply.status(404).send({
            code: "SUBSCRIPTION_NOT_FOUND",
            message: "Subscription not found",
          });
        }

        return reply.send({ data: { subscription } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        if (error instanceof Error && error.message.includes("Not authorized")) {
          return reply.status(403).send({
            code: "NOT_AUTHORIZED",
            message: error.message,
          });
        }
        throw error;
      }
    }
  );

  // DELETE /calendar/subscriptions/:calendarId - Unsubscribe
  app.delete<{ Params: { calendarId: string } }>(
    "/subscriptions/:calendarId",
    async (req, reply) => {
      const unsubscribed = await calendarService.unsubscribe(
        req.params.calendarId,
        req.user!.id
      );

      if (!unsubscribed) {
        return reply.status(404).send({
          code: "SUBSCRIPTION_NOT_FOUND",
          message: "Subscription not found",
        });
      }

      return reply.status(204).send();
    }
  );

  // ============ MEETING ROOM ENDPOINTS ============

  // GET /calendar/rooms - List meeting rooms
  app.get("/rooms", async (req, reply) => {
    try {
      const query = roomSearchSchema.parse(req.query);
      const rooms = query.capacity || query.equipment || query.floor
        ? await calendarService.searchMeetingRooms(req.user!.orgId, query)
        : await calendarService.getMeetingRooms(req.user!.orgId);
      return reply.send({ data: { rooms } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // POST /calendar/rooms - Create a meeting room (admin only)
  app.post("/rooms", { preHandler: requireAdmin }, async (req, reply) => {
    try {
      const input = createMeetingRoomSchema.parse(req.body);
      const room = await calendarService.createMeetingRoom(
        input,
        req.user!.orgId
      );
      return reply.status(201).send({ data: { room } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // PATCH /calendar/rooms/:id - Update a meeting room (admin only)
  app.patch<{ Params: { id: string } }>(
    "/rooms/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      try {
        const input = updateMeetingRoomSchema.parse(req.body);
        const room = await calendarService.updateMeetingRoom(
          req.params.id,
          input,
          req.user!.orgId
        );

        if (!room) {
          return reply.status(404).send({
            code: "ROOM_NOT_FOUND",
            message: "Meeting room not found",
          });
        }

        return reply.send({ data: { room } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // DELETE /calendar/rooms/:id - Delete a meeting room (admin only)
  app.delete<{ Params: { id: string } }>(
    "/rooms/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const deleted = await calendarService.deleteMeetingRoom(
        req.params.id,
        req.user!.orgId
      );

      if (!deleted) {
        return reply.status(404).send({
          code: "ROOM_NOT_FOUND",
          message: "Meeting room not found",
        });
      }

      return reply.status(204).send();
    }
  );

  // ============ EVENT ENDPOINTS ============

  // GET /calendar/events - List events
  app.get("/events", async (req, reply) => {
    try {
      const query = eventsQuerySchema.parse(req.query);
      const events = await calendarService.getEvents(
        req.user!.id,
        req.user!.orgId,
        query
      );
      return reply.send({ data: { events } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // POST /calendar/events - Create an event
  app.post("/events", async (req, reply) => {
    try {
      const input = createEventSchema.parse(req.body);
      const result = await calendarService.createEvent(
        input,
        req.user!.id,
        req.user!.orgId
      );
      return reply.status(201).send({ data: result });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      if (error instanceof Error) {
        if (error.message === "Calendar not found or not accessible") {
          return reply.status(404).send({
            code: "CALENDAR_NOT_FOUND",
            message: error.message,
          });
        }
        if (error.message.includes("not available")) {
          return reply.status(409).send({
            code: "ROOM_CONFLICT",
            message: error.message,
          });
        }
      }
      throw error;
    }
  });

  // GET /calendar/events/:id - Get event details
  app.get<{ Params: { id: string } }>("/events/:id", async (req, reply) => {
    const event = await calendarService.getEventById(req.params.id);

    if (!event) {
      return reply.status(404).send({
        code: "EVENT_NOT_FOUND",
        message: "Event not found",
      });
    }

    // Check access
    const canAccess = await calendarService.canAccessEvent(
      req.params.id,
      req.user!.id
    );
    if (!canAccess) {
      return reply.status(403).send({
        code: "NOT_AUTHORIZED",
        message: "Not authorized to view this event",
      });
    }

    return reply.send({ data: { event } });
  });

  // PATCH /calendar/events/:id - Update an event
  app.patch<{ Params: { id: string } }>("/events/:id", async (req, reply) => {
    try {
      const input = updateEventSchema.parse(req.body);
      const event = await calendarService.updateEvent(
        req.params.id,
        input,
        req.user!.id
      );

      if (!event) {
        return reply.status(404).send({
          code: "EVENT_NOT_FOUND",
          message: "Event not found",
        });
      }

      return reply.send({ data: { event } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      if (error instanceof Error) {
        if (error.message.includes("Not authorized")) {
          return reply.status(403).send({
            code: "NOT_AUTHORIZED",
            message: error.message,
          });
        }
        if (error.message.includes("not available")) {
          return reply.status(409).send({
            code: "ROOM_CONFLICT",
            message: error.message,
          });
        }
      }
      throw error;
    }
  });

  // DELETE /calendar/events/:id - Delete an event
  app.delete<{ Params: { id: string } }>("/events/:id", async (req, reply) => {
    try {
      const deleted = await calendarService.deleteEvent(
        req.params.id,
        req.user!.id
      );

      if (!deleted) {
        return reply.status(404).send({
          code: "EVENT_NOT_FOUND",
          message: "Event not found",
        });
      }

      return reply.status(204).send();
    } catch (error) {
      if (error instanceof Error && error.message.includes("Not authorized")) {
        return reply.status(403).send({
          code: "NOT_AUTHORIZED",
          message: error.message,
        });
      }
      throw error;
    }
  });

  // ============ RSVP ENDPOINT ============

  // POST /calendar/events/:id/rsvp - RSVP to an event
  app.post<{ Params: { id: string } }>(
    "/events/:id/rsvp",
    async (req, reply) => {
      try {
        const input = rsvpSchema.parse(req.body);
        const attendee = await calendarService.rsvp(
          req.params.id,
          input,
          req.user!.id
        );

        if (!attendee) {
          return reply.status(404).send({
            code: "NOT_ATTENDEE",
            message: "You are not an attendee of this event",
          });
        }

        return reply.send({ data: { attendee } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // ============ ATTENDEE ENDPOINTS ============

  // GET /calendar/events/:id/attendees - Get event attendees
  app.get<{ Params: { id: string } }>(
    "/events/:id/attendees",
    async (req, reply) => {
      const canAccess = await calendarService.canAccessEvent(
        req.params.id,
        req.user!.id
      );
      if (!canAccess) {
        return reply.status(403).send({
          code: "NOT_AUTHORIZED",
          message: "Not authorized to view this event",
        });
      }

      const attendees = await calendarService.getEventAttendeesWithUserInfo(
        req.params.id
      );
      return reply.send({ data: { attendees } });
    }
  );

  // POST /calendar/events/:id/attendees - Add an attendee
  app.post<{ Params: { id: string } }>(
    "/events/:id/attendees",
    async (req, reply) => {
      try {
        const input = addAttendeeSchema.parse(req.body);
        const attendee = await calendarService.addAttendee(
          req.params.id,
          input,
          req.user!.id
        );
        return reply.status(201).send({ data: { attendee } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        if (error instanceof Error) {
          if (error.message === "Event not found") {
            return reply.status(404).send({
              code: "EVENT_NOT_FOUND",
              message: error.message,
            });
          }
          if (error.message.includes("Not authorized")) {
            return reply.status(403).send({
              code: "NOT_AUTHORIZED",
              message: error.message,
            });
          }
        }
        throw error;
      }
    }
  );

  // DELETE /calendar/events/:eventId/attendees/:userId - Remove an attendee
  app.delete<{ Params: { eventId: string; userId: string } }>(
    "/events/:eventId/attendees/:userId",
    async (req, reply) => {
      try {
        const removed = await calendarService.removeAttendee(
          req.params.eventId,
          req.params.userId,
          req.user!.id
        );

        if (!removed) {
          return reply.status(404).send({
            code: "ATTENDEE_NOT_FOUND",
            message: "Attendee not found",
          });
        }

        return reply.status(204).send();
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes("Not authorized")) {
            return reply.status(403).send({
              code: "NOT_AUTHORIZED",
              message: error.message,
            });
          }
          if (error.message.includes("organizer")) {
            return reply.status(400).send({
              code: "CANNOT_REMOVE_ORGANIZER",
              message: error.message,
            });
          }
        }
        throw error;
      }
    }
  );

  // ============ AVAILABILITY ENDPOINT ============

  // POST /calendar/availability - Find available time slots
  app.post("/availability", async (req, reply) => {
    try {
      const input = availabilitySearchSchema.parse(req.body);
      const slots = await calendarService.findAvailability(
        input,
        req.user!.orgId
      );
      return reply.send({ data: { slots } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });
}
