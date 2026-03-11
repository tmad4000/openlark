import { FastifyInstance, FastifyRequest } from "fastify";
import { db } from "../db";
import {
  calendarEvents,
  eventAttendees,
  calendars,
  calendarSubscriptions,
  meetingRooms,
  users,
  notifications,
} from "../db/schema";
import { and, eq, gte, lte, or, inArray, isNull, sql } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { publish, getChatChannel } from "../lib/redis";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const eventsRoutes = async (fastify: FastifyInstance) => {
  /**
   * POST /events - Create a new calendar event
   * Body: {
   *   title: string,
   *   description?: string,
   *   start_time: string (ISO 8601),
   *   end_time: string (ISO 8601),
   *   timezone?: string,
   *   location?: string,
   *   attendee_ids?: string[],
   *   room_id?: string,
   *   recurrence_rule?: string,
   *   calendar_id?: string,
   *   settings?: object
   * }
   */
  fastify.post<{
    Body: {
      title: string;
      description?: string;
      start_time: string;
      end_time: string;
      timezone?: string;
      location?: string;
      attendee_ids?: string[];
      room_id?: string;
      recurrence_rule?: string;
      calendar_id?: string;
      settings?: {
        isAllDay?: boolean;
        reminders?: Array<{ type: "email" | "push"; minutes: number }>;
        conferenceLink?: string;
        visibility?: "public" | "private" | "busy";
      };
    };
  }>(
    "/events",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const {
        title,
        description,
        start_time,
        end_time,
        timezone = "UTC",
        location,
        attendee_ids,
        room_id,
        recurrence_rule,
        calendar_id,
        settings,
      } = request.body;

      // Validate required fields
      if (!title || typeof title !== "string" || title.trim().length === 0) {
        return reply.status(400).send({
          error: "title is required",
        });
      }

      if (!start_time || !end_time) {
        return reply.status(400).send({
          error: "start_time and end_time are required",
        });
      }

      const startDate = new Date(start_time);
      const endDate = new Date(end_time);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return reply.status(400).send({
          error: "Invalid date format for start_time or end_time",
        });
      }

      if (endDate <= startDate) {
        return reply.status(400).send({
          error: "end_time must be after start_time",
        });
      }

      const currentUserId = request.user.id;
      const orgId = request.user.orgId;

      if (!orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      // Validate room_id if provided
      if (room_id) {
        if (!UUID_REGEX.test(room_id)) {
          return reply.status(400).send({
            error: "Invalid room_id format",
          });
        }

        const [room] = await db
          .select()
          .from(meetingRooms)
          .where(and(eq(meetingRooms.id, room_id), eq(meetingRooms.orgId, orgId)))
          .limit(1);

        if (!room) {
          return reply.status(404).send({
            error: "Meeting room not found",
          });
        }
      }

      // Validate calendar_id if provided
      if (calendar_id) {
        if (!UUID_REGEX.test(calendar_id)) {
          return reply.status(400).send({
            error: "Invalid calendar_id format",
          });
        }

        const [calendar] = await db
          .select()
          .from(calendars)
          .where(and(eq(calendars.id, calendar_id), eq(calendars.orgId, orgId)))
          .limit(1);

        if (!calendar) {
          return reply.status(404).send({
            error: "Calendar not found",
          });
        }
      }

      // Validate attendee_ids if provided
      if (attendee_ids && attendee_ids.length > 0) {
        for (const id of attendee_ids) {
          if (!UUID_REGEX.test(id)) {
            return reply.status(400).send({
              error: `Invalid attendee ID format: ${id}`,
            });
          }
        }

        // Verify all attendees exist and are in the same org
        const attendeeUsers = await db
          .select({ id: users.id })
          .from(users)
          .where(and(inArray(users.id, attendee_ids), eq(users.orgId, orgId)));

        if (attendeeUsers.length !== attendee_ids.length) {
          return reply.status(400).send({
            error: "One or more attendees not found in this organization",
          });
        }
      }

      // Create the event
      const [newEvent] = await db
        .insert(calendarEvents)
        .values({
          orgId,
          calendarId: calendar_id || null,
          title: title.trim(),
          description: description || null,
          startTime: startDate,
          endTime: endDate,
          timezone,
          location: location || null,
          recurrenceRule: recurrence_rule || null,
          creatorId: currentUserId,
          roomId: room_id || null,
          settings: settings || null,
        })
        .returning();

      // Add attendees (including the creator)
      const allAttendeeIds = new Set(attendee_ids || []);
      allAttendeeIds.add(currentUserId); // Creator is always an attendee

      const attendeeValues = Array.from(allAttendeeIds).map((userId) => ({
        eventId: newEvent.id,
        userId,
        rsvp: userId === currentUserId ? ("yes" as const) : ("pending" as const),
      }));

      await db.insert(eventAttendees).values(attendeeValues);

      // Get full event with attendees
      const attendeesWithUsers = await db
        .select({
          userId: eventAttendees.userId,
          rsvp: eventAttendees.rsvp,
          notifiedAt: eventAttendees.notifiedAt,
          user: {
            id: users.id,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
            email: users.email,
          },
        })
        .from(eventAttendees)
        .innerJoin(users, eq(eventAttendees.userId, users.id))
        .where(eq(eventAttendees.eventId, newEvent.id));

      // Send notifications to attendees (except creator)
      const notificationValues = Array.from(allAttendeeIds)
        .filter((userId) => userId !== currentUserId)
        .map((userId) => ({
          userId,
          type: "event_invite" as const,
          title: "Event Invitation",
          body: `You've been invited to "${title}" by ${request.user.displayName || request.user.email}`,
          entityType: "event" as const,
          entityId: newEvent.id,
        }));

      if (notificationValues.length > 0) {
        await db.insert(notifications).values(notificationValues);

        // Mark attendees as notified
        await db
          .update(eventAttendees)
          .set({ notifiedAt: new Date() })
          .where(
            and(
              eq(eventAttendees.eventId, newEvent.id),
              inArray(
                eventAttendees.userId,
                notificationValues.map((n) => n.userId)
              )
            )
          );
      }

      return reply.status(201).send({
        event: {
          ...newEvent,
          attendees: attendeesWithUsers,
        },
      });
    }
  );

  /**
   * GET /events - Get events in date range
   * Query: start (ISO date), end (ISO date)
   * Returns events where user is creator or attendee, or from subscribed calendars
   */
  fastify.get<{
    Querystring: { start?: string; end?: string; calendar_id?: string };
  }>(
    "/events",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { start, end, calendar_id } = request.query;

      if (!start || !end) {
        return reply.status(400).send({
          error: "start and end query parameters are required",
        });
      }

      const startDate = new Date(start);
      const endDate = new Date(end);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return reply.status(400).send({
          error: "Invalid date format for start or end",
        });
      }

      const currentUserId = request.user.id;
      const orgId = request.user.orgId;

      if (!orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      // Get user's subscribed calendar IDs
      const subscribedCalendars = await db
        .select({ calendarId: calendarSubscriptions.calendarId })
        .from(calendarSubscriptions)
        .where(eq(calendarSubscriptions.userId, currentUserId));

      const subscribedCalendarIds = subscribedCalendars.map((s) => s.calendarId);

      // Get events where:
      // 1. User is creator, OR
      // 2. User is an attendee, OR
      // 3. Event is in a subscribed calendar
      // AND event overlaps with the date range
      // AND event is not deleted

      // Build conditions
      const conditions: ReturnType<typeof and>[] = [
        eq(calendarEvents.orgId, orgId),
        isNull(calendarEvents.deletedAt),
        // Event overlaps with range: event starts before end AND event ends after start
        lte(calendarEvents.startTime, endDate),
        gte(calendarEvents.endTime, startDate),
      ];

      if (calendar_id) {
        if (!UUID_REGEX.test(calendar_id)) {
          return reply.status(400).send({
            error: "Invalid calendar_id format",
          });
        }
        conditions.push(eq(calendarEvents.calendarId, calendar_id));
      }

      // Get event IDs where user is an attendee
      const attendingEventIds = await db
        .select({ eventId: eventAttendees.eventId })
        .from(eventAttendees)
        .where(eq(eventAttendees.userId, currentUserId));

      const attendingIds = attendingEventIds.map((a) => a.eventId);

      // Build the user access condition
      const userAccessConditions = [eq(calendarEvents.creatorId, currentUserId)];

      if (attendingIds.length > 0) {
        userAccessConditions.push(inArray(calendarEvents.id, attendingIds));
      }

      if (subscribedCalendarIds.length > 0) {
        userAccessConditions.push(
          inArray(calendarEvents.calendarId, subscribedCalendarIds)
        );
      }

      const events = await db
        .select({
          id: calendarEvents.id,
          orgId: calendarEvents.orgId,
          calendarId: calendarEvents.calendarId,
          title: calendarEvents.title,
          description: calendarEvents.description,
          startTime: calendarEvents.startTime,
          endTime: calendarEvents.endTime,
          timezone: calendarEvents.timezone,
          location: calendarEvents.location,
          recurrenceRule: calendarEvents.recurrenceRule,
          creatorId: calendarEvents.creatorId,
          meetingId: calendarEvents.meetingId,
          roomId: calendarEvents.roomId,
          settings: calendarEvents.settings,
          createdAt: calendarEvents.createdAt,
          updatedAt: calendarEvents.updatedAt,
          creator: {
            id: users.id,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
          },
        })
        .from(calendarEvents)
        .innerJoin(users, eq(calendarEvents.creatorId, users.id))
        .where(and(...conditions, or(...userAccessConditions)));

      // Get attendees for each event
      const eventIds = events.map((e) => e.id);
      let attendeesByEvent: Record<
        string,
        Array<{
          userId: string;
          rsvp: string;
          user: { id: string; displayName: string | null; avatarUrl: string | null };
        }>
      > = {};

      if (eventIds.length > 0) {
        const allAttendees = await db
          .select({
            eventId: eventAttendees.eventId,
            userId: eventAttendees.userId,
            rsvp: eventAttendees.rsvp,
            user: {
              id: users.id,
              displayName: users.displayName,
              avatarUrl: users.avatarUrl,
            },
          })
          .from(eventAttendees)
          .innerJoin(users, eq(eventAttendees.userId, users.id))
          .where(inArray(eventAttendees.eventId, eventIds));

        for (const attendee of allAttendees) {
          if (!attendeesByEvent[attendee.eventId]) {
            attendeesByEvent[attendee.eventId] = [];
          }
          attendeesByEvent[attendee.eventId].push({
            userId: attendee.userId,
            rsvp: attendee.rsvp,
            user: attendee.user,
          });
        }
      }

      const eventsWithAttendees = events.map((event) => ({
        ...event,
        attendees: attendeesByEvent[event.id] || [],
      }));

      return reply.status(200).send({
        events: eventsWithAttendees,
      });
    }
  );

  /**
   * GET /events/:id - Get a single event with full details
   */
  fastify.get<{
    Params: { id: string };
  }>(
    "/events/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: eventId } = request.params;

      if (!UUID_REGEX.test(eventId)) {
        return reply.status(400).send({
          error: "Invalid event ID format",
        });
      }

      const currentUserId = request.user.id;
      const orgId = request.user.orgId;

      if (!orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const [event] = await db
        .select({
          id: calendarEvents.id,
          orgId: calendarEvents.orgId,
          calendarId: calendarEvents.calendarId,
          title: calendarEvents.title,
          description: calendarEvents.description,
          startTime: calendarEvents.startTime,
          endTime: calendarEvents.endTime,
          timezone: calendarEvents.timezone,
          location: calendarEvents.location,
          recurrenceRule: calendarEvents.recurrenceRule,
          creatorId: calendarEvents.creatorId,
          meetingId: calendarEvents.meetingId,
          roomId: calendarEvents.roomId,
          settings: calendarEvents.settings,
          deletedAt: calendarEvents.deletedAt,
          createdAt: calendarEvents.createdAt,
          updatedAt: calendarEvents.updatedAt,
          creator: {
            id: users.id,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
            email: users.email,
          },
        })
        .from(calendarEvents)
        .innerJoin(users, eq(calendarEvents.creatorId, users.id))
        .where(
          and(
            eq(calendarEvents.id, eventId),
            eq(calendarEvents.orgId, orgId),
            isNull(calendarEvents.deletedAt)
          )
        )
        .limit(1);

      if (!event) {
        return reply.status(404).send({
          error: "Event not found",
        });
      }

      // Get attendees
      const attendees = await db
        .select({
          userId: eventAttendees.userId,
          rsvp: eventAttendees.rsvp,
          notifiedAt: eventAttendees.notifiedAt,
          createdAt: eventAttendees.createdAt,
          user: {
            id: users.id,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
            email: users.email,
          },
        })
        .from(eventAttendees)
        .innerJoin(users, eq(eventAttendees.userId, users.id))
        .where(eq(eventAttendees.eventId, eventId));

      // Get room details if exists
      let room = null;
      if (event.roomId) {
        const [roomData] = await db
          .select()
          .from(meetingRooms)
          .where(eq(meetingRooms.id, event.roomId))
          .limit(1);
        room = roomData || null;
      }

      // Check user's RSVP status
      const userAttendee = attendees.find((a) => a.userId === currentUserId);

      return reply.status(200).send({
        event: {
          ...event,
          attendees,
          room,
          currentUserRsvp: userAttendee?.rsvp || null,
          isCreator: event.creatorId === currentUserId,
        },
      });
    }
  );

  /**
   * PATCH /events/:id - Update an event
   * Body: Partial event fields to update
   */
  fastify.patch<{
    Params: { id: string };
    Body: {
      title?: string;
      description?: string;
      start_time?: string;
      end_time?: string;
      timezone?: string;
      location?: string;
      attendee_ids?: string[];
      room_id?: string | null;
      recurrence_rule?: string | null;
      settings?: {
        isAllDay?: boolean;
        reminders?: Array<{ type: "email" | "push"; minutes: number }>;
        conferenceLink?: string;
        visibility?: "public" | "private" | "busy";
      };
    };
  }>(
    "/events/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: eventId } = request.params;
      const updates = request.body;

      if (!UUID_REGEX.test(eventId)) {
        return reply.status(400).send({
          error: "Invalid event ID format",
        });
      }

      const currentUserId = request.user.id;
      const orgId = request.user.orgId;

      if (!orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      // Get existing event
      const [existingEvent] = await db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.id, eventId),
            eq(calendarEvents.orgId, orgId),
            isNull(calendarEvents.deletedAt)
          )
        )
        .limit(1);

      if (!existingEvent) {
        return reply.status(404).send({
          error: "Event not found",
        });
      }

      // Only creator can update event
      if (existingEvent.creatorId !== currentUserId) {
        return reply.status(403).send({
          error: "Only the event creator can update this event",
        });
      }

      // Build update object
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (updates.title !== undefined) {
        if (typeof updates.title !== "string" || updates.title.trim().length === 0) {
          return reply.status(400).send({
            error: "title must be a non-empty string",
          });
        }
        updateData.title = updates.title.trim();
      }

      if (updates.description !== undefined) {
        updateData.description = updates.description;
      }

      if (updates.start_time !== undefined) {
        const startDate = new Date(updates.start_time);
        if (isNaN(startDate.getTime())) {
          return reply.status(400).send({
            error: "Invalid start_time format",
          });
        }
        updateData.startTime = startDate;
      }

      if (updates.end_time !== undefined) {
        const endDate = new Date(updates.end_time);
        if (isNaN(endDate.getTime())) {
          return reply.status(400).send({
            error: "Invalid end_time format",
          });
        }
        updateData.endTime = endDate;
      }

      // Validate start/end relationship
      const newStartTime = (updateData.startTime as Date) || existingEvent.startTime;
      const newEndTime = (updateData.endTime as Date) || existingEvent.endTime;
      if (newEndTime <= newStartTime) {
        return reply.status(400).send({
          error: "end_time must be after start_time",
        });
      }

      if (updates.timezone !== undefined) {
        updateData.timezone = updates.timezone;
      }

      if (updates.location !== undefined) {
        updateData.location = updates.location;
      }

      if (updates.room_id !== undefined) {
        if (updates.room_id === null) {
          updateData.roomId = null;
        } else {
          if (!UUID_REGEX.test(updates.room_id)) {
            return reply.status(400).send({
              error: "Invalid room_id format",
            });
          }
          const [room] = await db
            .select()
            .from(meetingRooms)
            .where(and(eq(meetingRooms.id, updates.room_id), eq(meetingRooms.orgId, orgId)))
            .limit(1);
          if (!room) {
            return reply.status(404).send({
              error: "Meeting room not found",
            });
          }
          updateData.roomId = updates.room_id;
        }
      }

      if (updates.recurrence_rule !== undefined) {
        updateData.recurrenceRule = updates.recurrence_rule;
      }

      if (updates.settings !== undefined) {
        updateData.settings = updates.settings;
      }

      // Update the event
      const [updatedEvent] = await db
        .update(calendarEvents)
        .set(updateData)
        .where(eq(calendarEvents.id, eventId))
        .returning();

      // Handle attendee updates
      if (updates.attendee_ids !== undefined) {
        // Validate attendee IDs
        for (const id of updates.attendee_ids) {
          if (!UUID_REGEX.test(id)) {
            return reply.status(400).send({
              error: `Invalid attendee ID format: ${id}`,
            });
          }
        }

        // Verify all attendees exist
        const attendeeUsers = await db
          .select({ id: users.id })
          .from(users)
          .where(and(inArray(users.id, updates.attendee_ids), eq(users.orgId, orgId)));

        if (attendeeUsers.length !== updates.attendee_ids.length) {
          return reply.status(400).send({
            error: "One or more attendees not found in this organization",
          });
        }

        // Get current attendees
        const currentAttendees = await db
          .select({ userId: eventAttendees.userId })
          .from(eventAttendees)
          .where(eq(eventAttendees.eventId, eventId));

        const currentAttendeeIds = new Set(currentAttendees.map((a) => a.userId));
        const newAttendeeIds = new Set([...updates.attendee_ids, currentUserId]);

        // Remove attendees no longer in list (except creator)
        const toRemove = [...currentAttendeeIds].filter(
          (id) => !newAttendeeIds.has(id) && id !== currentUserId
        );
        if (toRemove.length > 0) {
          await db
            .delete(eventAttendees)
            .where(
              and(
                eq(eventAttendees.eventId, eventId),
                inArray(eventAttendees.userId, toRemove)
              )
            );
        }

        // Add new attendees
        const toAdd = [...newAttendeeIds].filter((id) => !currentAttendeeIds.has(id));
        if (toAdd.length > 0) {
          const newAttendeeValues = toAdd.map((userId) => ({
            eventId,
            userId,
            rsvp: "pending" as const,
          }));
          await db.insert(eventAttendees).values(newAttendeeValues);

          // Notify new attendees
          const notificationValues = toAdd.map((userId) => ({
            userId,
            type: "event_invite" as const,
            title: "Event Invitation",
            body: `You've been invited to "${updatedEvent.title}" by ${request.user.displayName || request.user.email}`,
            entityType: "event" as const,
            entityId: updatedEvent.id,
          }));

          await db.insert(notifications).values(notificationValues);

          // Mark as notified
          await db
            .update(eventAttendees)
            .set({ notifiedAt: new Date() })
            .where(
              and(
                eq(eventAttendees.eventId, eventId),
                inArray(eventAttendees.userId, toAdd)
              )
            );
        }
      }

      // Notify existing attendees of update (except creator)
      const allAttendees = await db
        .select({ userId: eventAttendees.userId })
        .from(eventAttendees)
        .where(eq(eventAttendees.eventId, eventId));

      const updateNotifications = allAttendees
        .filter((a) => a.userId !== currentUserId)
        .map((a) => ({
          userId: a.userId,
          type: "event_updated" as const,
          title: "Event Updated",
          body: `"${updatedEvent.title}" has been updated by ${request.user.displayName || request.user.email}`,
          entityType: "event" as const,
          entityId: updatedEvent.id,
        }));

      if (updateNotifications.length > 0) {
        await db.insert(notifications).values(updateNotifications);
      }

      // Get full event with attendees
      const attendeesWithUsers = await db
        .select({
          userId: eventAttendees.userId,
          rsvp: eventAttendees.rsvp,
          notifiedAt: eventAttendees.notifiedAt,
          user: {
            id: users.id,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
            email: users.email,
          },
        })
        .from(eventAttendees)
        .innerJoin(users, eq(eventAttendees.userId, users.id))
        .where(eq(eventAttendees.eventId, eventId));

      return reply.status(200).send({
        event: {
          ...updatedEvent,
          attendees: attendeesWithUsers,
        },
      });
    }
  );

  /**
   * DELETE /events/:id - Soft-delete an event
   */
  fastify.delete<{
    Params: { id: string };
  }>(
    "/events/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: eventId } = request.params;

      if (!UUID_REGEX.test(eventId)) {
        return reply.status(400).send({
          error: "Invalid event ID format",
        });
      }

      const currentUserId = request.user.id;
      const orgId = request.user.orgId;

      if (!orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      // Get existing event
      const [existingEvent] = await db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.id, eventId),
            eq(calendarEvents.orgId, orgId),
            isNull(calendarEvents.deletedAt)
          )
        )
        .limit(1);

      if (!existingEvent) {
        return reply.status(404).send({
          error: "Event not found",
        });
      }

      // Only creator can delete event
      if (existingEvent.creatorId !== currentUserId) {
        return reply.status(403).send({
          error: "Only the event creator can delete this event",
        });
      }

      // Soft delete
      await db
        .update(calendarEvents)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(calendarEvents.id, eventId));

      // Notify attendees of cancellation
      const attendees = await db
        .select({ userId: eventAttendees.userId })
        .from(eventAttendees)
        .where(eq(eventAttendees.eventId, eventId));

      const cancelNotifications = attendees
        .filter((a) => a.userId !== currentUserId)
        .map((a) => ({
          userId: a.userId,
          type: "event_cancelled" as const,
          title: "Event Cancelled",
          body: `"${existingEvent.title}" has been cancelled by ${request.user.displayName || request.user.email}`,
          entityType: "event" as const,
          entityId: existingEvent.id,
        }));

      if (cancelNotifications.length > 0) {
        await db.insert(notifications).values(cancelNotifications);
      }

      return reply.status(200).send({
        success: true,
        message: "Event deleted successfully",
      });
    }
  );

  /**
   * POST /events/:id/rsvp - Update RSVP status for an event
   * Body: { response: "yes" | "no" | "maybe" }
   */
  fastify.post<{
    Params: { id: string };
    Body: { response: "yes" | "no" | "maybe" };
  }>(
    "/events/:id/rsvp",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id: eventId } = request.params;
      const { response } = request.body;

      if (!UUID_REGEX.test(eventId)) {
        return reply.status(400).send({
          error: "Invalid event ID format",
        });
      }

      if (!response || !["yes", "no", "maybe"].includes(response)) {
        return reply.status(400).send({
          error: "response must be 'yes', 'no', or 'maybe'",
        });
      }

      const currentUserId = request.user.id;
      const orgId = request.user.orgId;

      if (!orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      // Check if event exists and user is an attendee
      const [event] = await db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.id, eventId),
            eq(calendarEvents.orgId, orgId),
            isNull(calendarEvents.deletedAt)
          )
        )
        .limit(1);

      if (!event) {
        return reply.status(404).send({
          error: "Event not found",
        });
      }

      // Check if user is an attendee
      const [attendee] = await db
        .select()
        .from(eventAttendees)
        .where(
          and(
            eq(eventAttendees.eventId, eventId),
            eq(eventAttendees.userId, currentUserId)
          )
        )
        .limit(1);

      if (!attendee) {
        return reply.status(403).send({
          error: "You are not an attendee of this event",
        });
      }

      // Update RSVP
      const [updatedAttendee] = await db
        .update(eventAttendees)
        .set({
          rsvp: response,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(eventAttendees.eventId, eventId),
            eq(eventAttendees.userId, currentUserId)
          )
        )
        .returning();

      // Notify event creator of RSVP change (if not self)
      if (event.creatorId !== currentUserId) {
        await db.insert(notifications).values({
          userId: event.creatorId,
          type: "event_updated",
          title: "RSVP Update",
          body: `${request.user.displayName || request.user.email} responded "${response}" to "${event.title}"`,
          entityType: "event" as const,
          entityId: event.id,
        });
      }

      return reply.status(200).send({
        success: true,
        rsvp: updatedAttendee.rsvp,
      });
    }
  );

  /**
   * GET /availability - Get free/busy slots for multiple users
   * Query: user_ids (comma-separated), start (ISO date), end (ISO date)
   * Returns: Free/busy slots per user
   */
  fastify.get<{
    Querystring: { user_ids: string; start: string; end: string };
  }>(
    "/availability",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { user_ids, start, end } = request.query;

      if (!user_ids || !start || !end) {
        return reply.status(400).send({
          error: "user_ids, start, and end query parameters are required",
        });
      }

      const startDate = new Date(start);
      const endDate = new Date(end);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return reply.status(400).send({
          error: "Invalid date format for start or end",
        });
      }

      const orgId = request.user.orgId;

      if (!orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const userIdList = user_ids.split(",").map((id) => id.trim());

      // Validate all user IDs
      for (const id of userIdList) {
        if (!UUID_REGEX.test(id)) {
          return reply.status(400).send({
            error: `Invalid user ID format: ${id}`,
          });
        }
      }

      // Verify all users exist and are in the same org
      const usersInOrg = await db
        .select({ id: users.id, displayName: users.displayName })
        .from(users)
        .where(and(inArray(users.id, userIdList), eq(users.orgId, orgId)));

      if (usersInOrg.length !== userIdList.length) {
        return reply.status(400).send({
          error: "One or more users not found in this organization",
        });
      }

      // Get all events where these users are attendees with yes or pending RSVP
      // and events overlap with the requested time range
      const busySlots: Record<
        string,
        Array<{
          start: string;
          end: string;
          eventTitle: string;
          eventId: string;
        }>
      > = {};

      // Initialize empty arrays for each user
      for (const userId of userIdList) {
        busySlots[userId] = [];
      }

      // Query events for all users at once
      const attendeeEvents = await db
        .select({
          userId: eventAttendees.userId,
          eventId: calendarEvents.id,
          title: calendarEvents.title,
          startTime: calendarEvents.startTime,
          endTime: calendarEvents.endTime,
          rsvp: eventAttendees.rsvp,
        })
        .from(eventAttendees)
        .innerJoin(calendarEvents, eq(eventAttendees.eventId, calendarEvents.id))
        .where(
          and(
            inArray(eventAttendees.userId, userIdList),
            or(
              eq(eventAttendees.rsvp, "yes"),
              eq(eventAttendees.rsvp, "pending")
            ),
            isNull(calendarEvents.deletedAt),
            // Event overlaps with range
            lte(calendarEvents.startTime, endDate),
            gte(calendarEvents.endTime, startDate)
          )
        )
        .orderBy(calendarEvents.startTime);

      // Group by user
      for (const event of attendeeEvents) {
        if (busySlots[event.userId]) {
          busySlots[event.userId].push({
            start: event.startTime.toISOString(),
            end: event.endTime.toISOString(),
            eventTitle: event.title,
            eventId: event.eventId,
          });
        }
      }

      // Build response with user info
      const availability = userIdList.map((userId) => {
        const user = usersInOrg.find((u) => u.id === userId);
        return {
          userId,
          displayName: user?.displayName || null,
          busySlots: busySlots[userId] || [],
          // Calculate free slots between busy slots (within working hours 9-18)
          freeSlots: calculateFreeSlots(
            busySlots[userId] || [],
            startDate,
            endDate
          ),
        };
      });

      return reply.status(200).send({
        availability,
        requestedRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
      });
    }
  );
};

/**
 * Calculate free slots between busy slots, respecting working hours (9:00-18:00)
 */
function calculateFreeSlots(
  busySlots: Array<{ start: string; end: string }>,
  rangeStart: Date,
  rangeEnd: Date
): Array<{ start: string; end: string }> {
  const freeSlots: Array<{ start: string; end: string }> = [];
  const WORK_START_HOUR = 9;
  const WORK_END_HOUR = 18;

  // Generate working hour blocks for each day in range
  const currentDate = new Date(rangeStart);
  currentDate.setHours(0, 0, 0, 0);

  while (currentDate <= rangeEnd) {
    const dayStart = new Date(currentDate);
    dayStart.setHours(WORK_START_HOUR, 0, 0, 0);

    const dayEnd = new Date(currentDate);
    dayEnd.setHours(WORK_END_HOUR, 0, 0, 0);

    // Skip weekends
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      // Clamp to requested range
      const effectiveStart = dayStart < rangeStart ? rangeStart : dayStart;
      const effectiveEnd = dayEnd > rangeEnd ? rangeEnd : dayEnd;

      if (effectiveStart < effectiveEnd) {
        // Find busy slots that overlap with this working day
        const dayBusySlots = busySlots.filter((slot) => {
          const slotStart = new Date(slot.start);
          const slotEnd = new Date(slot.end);
          return slotStart < effectiveEnd && slotEnd > effectiveStart;
        });

        // Sort busy slots by start time
        dayBusySlots.sort(
          (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
        );

        // Calculate free time between busy slots
        let cursor = effectiveStart;

        for (const slot of dayBusySlots) {
          const slotStart = new Date(slot.start);
          const slotEnd = new Date(slot.end);

          // Clamp slot to working hours
          const effectiveSlotStart =
            slotStart < effectiveStart ? effectiveStart : slotStart;
          const effectiveSlotEnd =
            slotEnd > effectiveEnd ? effectiveEnd : slotEnd;

          // If there's a gap before this slot, it's free time
          if (cursor < effectiveSlotStart) {
            freeSlots.push({
              start: cursor.toISOString(),
              end: effectiveSlotStart.toISOString(),
            });
          }

          // Move cursor past this busy slot
          if (effectiveSlotEnd > cursor) {
            cursor = effectiveSlotEnd;
          }
        }

        // If there's time left at the end of the day
        if (cursor < effectiveEnd) {
          freeSlots.push({
            start: cursor.toISOString(),
            end: effectiveEnd.toISOString(),
          });
        }
      }
    }

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return freeSlots;
}
