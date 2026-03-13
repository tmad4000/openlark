import { db } from "../../db/index.js";
import {
  calendars,
  calendarSubscriptions,
  calendarEvents,
  eventAttendees,
  meetingRooms,
  users,
  type Calendar,
  type CalendarEvent,
  type EventAttendee,
  type MeetingRoom,
  type CalendarSubscription,
} from "../../db/schema/index.js";
import {
  eq,
  and,
  isNull,
  desc,
  gte,
  lte,
  lt,
  inArray,
  sql,
  or,
} from "drizzle-orm";
import { notificationsService } from "../notifications/notifications.service.js";
import type {
  CreateCalendarInput,
  UpdateCalendarInput,
  CreateMeetingRoomInput,
  UpdateMeetingRoomInput,
  CreateEventInput,
  UpdateEventInput,
  RsvpInput,
  AddAttendeeInput,
  SubscribeCalendarInput,
  UpdateSubscriptionInput,
  EventsQueryInput,
  RoomSearchInput,
  AvailabilitySearchInput,
} from "./calendar.schemas.js";

export class CalendarService {
  // ============ CALENDAR OPERATIONS ============

  /**
   * Get all calendars for a user (owned + subscribed)
   */
  async getUserCalendars(userId: string, orgId: string): Promise<Calendar[]> {
    // Get owned calendars
    const ownedCalendars = await db
      .select()
      .from(calendars)
      .where(
        and(
          eq(calendars.ownerId, userId),
          eq(calendars.orgId, orgId),
          isNull(calendars.deletedAt)
        )
      );

    // Get subscribed calendars
    const subscriptions = await db
      .select({ calendar: calendars })
      .from(calendarSubscriptions)
      .innerJoin(calendars, eq(calendarSubscriptions.calendarId, calendars.id))
      .where(
        and(
          eq(calendarSubscriptions.userId, userId),
          isNull(calendars.deletedAt)
        )
      );

    const subscribedCalendars = subscriptions.map((s) => s.calendar);

    // Combine and dedupe
    const allCalendars = [...ownedCalendars];
    for (const sub of subscribedCalendars) {
      if (!allCalendars.find((c) => c.id === sub.id)) {
        allCalendars.push(sub);
      }
    }

    return allCalendars;
  }

  /**
   * Get a single calendar by ID
   */
  async getCalendarById(
    calendarId: string,
    userId: string
  ): Promise<Calendar | null> {
    const [calendar] = await db
      .select()
      .from(calendars)
      .where(and(eq(calendars.id, calendarId), isNull(calendars.deletedAt)));

    if (!calendar) return null;

    // Check access: owner, subscriber, or public
    if (calendar.ownerId === userId) return calendar;
    if (calendar.type === "public" || calendar.type === "all_staff") {
      return calendar;
    }

    // Check if subscribed
    const [subscription] = await db
      .select()
      .from(calendarSubscriptions)
      .where(
        and(
          eq(calendarSubscriptions.calendarId, calendarId),
          eq(calendarSubscriptions.userId, userId)
        )
      );

    return subscription ? calendar : null;
  }

  /**
   * Create a new calendar
   * FR-6.8, FR-6.9
   */
  async createCalendar(
    input: CreateCalendarInput,
    userId: string,
    orgId: string
  ): Promise<Calendar> {
    const [calendar] = await db
      .insert(calendars)
      .values({
        orgId,
        ownerId: userId,
        name: input.name,
        type: input.type,
        color: input.color,
        description: input.description,
      })
      .returning();

    if (!calendar) {
      throw new Error("Failed to create calendar");
    }

    return calendar;
  }

  /**
   * Update a calendar
   */
  async updateCalendar(
    calendarId: string,
    input: UpdateCalendarInput,
    userId: string
  ): Promise<Calendar | null> {
    const [calendar] = await db
      .select()
      .from(calendars)
      .where(and(eq(calendars.id, calendarId), isNull(calendars.deletedAt)));

    if (!calendar) return null;
    if (calendar.ownerId !== userId) {
      throw new Error("Not authorized to update this calendar");
    }

    const [updated] = await db
      .update(calendars)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(calendars.id, calendarId))
      .returning();

    return updated ?? null;
  }

  /**
   * Delete a calendar (soft delete)
   */
  async deleteCalendar(calendarId: string, userId: string): Promise<boolean> {
    const [calendar] = await db
      .select()
      .from(calendars)
      .where(and(eq(calendars.id, calendarId), isNull(calendars.deletedAt)));

    if (!calendar) return false;
    if (calendar.ownerId !== userId) {
      throw new Error("Not authorized to delete this calendar");
    }

    await db
      .update(calendars)
      .set({ deletedAt: new Date() })
      .where(eq(calendars.id, calendarId));

    return true;
  }

  // ============ SUBSCRIPTION OPERATIONS ============

  /**
   * Get user's calendar subscriptions
   */
  async getUserSubscriptions(userId: string): Promise<CalendarSubscription[]> {
    return db
      .select()
      .from(calendarSubscriptions)
      .where(eq(calendarSubscriptions.userId, userId));
  }

  /**
   * Subscribe to a calendar
   */
  async subscribeToCalendar(
    input: SubscribeCalendarInput,
    userId: string
  ): Promise<CalendarSubscription> {
    // Check calendar exists and is public/all_staff
    const [calendar] = await db
      .select()
      .from(calendars)
      .where(
        and(eq(calendars.id, input.calendarId), isNull(calendars.deletedAt))
      );

    if (!calendar) {
      throw new Error("Calendar not found");
    }

    if (calendar.type !== "public" && calendar.type !== "all_staff") {
      throw new Error("Cannot subscribe to private calendars");
    }

    const [subscription] = await db
      .insert(calendarSubscriptions)
      .values({
        calendarId: input.calendarId,
        userId,
        color: input.color,
      })
      .onConflictDoNothing()
      .returning();

    if (!subscription) {
      // Already subscribed, fetch existing
      const [existing] = await db
        .select()
        .from(calendarSubscriptions)
        .where(
          and(
            eq(calendarSubscriptions.calendarId, input.calendarId),
            eq(calendarSubscriptions.userId, userId)
          )
        );
      return existing!;
    }

    return subscription;
  }

  /**
   * Update subscription settings
   */
  async updateSubscription(
    subscriptionId: string,
    input: UpdateSubscriptionInput,
    userId: string
  ): Promise<CalendarSubscription | null> {
    const [subscription] = await db
      .select()
      .from(calendarSubscriptions)
      .where(eq(calendarSubscriptions.id, subscriptionId));

    if (!subscription) return null;
    if (subscription.userId !== userId) {
      throw new Error("Not authorized to update this subscription");
    }

    const [updated] = await db
      .update(calendarSubscriptions)
      .set(input)
      .where(eq(calendarSubscriptions.id, subscriptionId))
      .returning();

    return updated ?? null;
  }

  /**
   * Unsubscribe from a calendar
   */
  async unsubscribe(calendarId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(calendarSubscriptions)
      .where(
        and(
          eq(calendarSubscriptions.calendarId, calendarId),
          eq(calendarSubscriptions.userId, userId)
        )
      )
      .returning();

    return result.length > 0;
  }

  // ============ MEETING ROOM OPERATIONS ============

  /**
   * Get all meeting rooms for an organization
   * FR-6.4
   */
  async getMeetingRooms(orgId: string): Promise<MeetingRoom[]> {
    return db
      .select()
      .from(meetingRooms)
      .where(
        and(eq(meetingRooms.orgId, orgId), isNull(meetingRooms.deletedAt))
      );
  }

  /**
   * Search meeting rooms by criteria
   * FR-6.4
   */
  async searchMeetingRooms(
    orgId: string,
    input: RoomSearchInput
  ): Promise<MeetingRoom[]> {
    const query = db
      .select()
      .from(meetingRooms)
      .where(
        and(
          eq(meetingRooms.orgId, orgId),
          eq(meetingRooms.isActive, true),
          isNull(meetingRooms.deletedAt)
        )
      )
      .$dynamic();

    // Apply filters
    const conditions: ReturnType<typeof eq>[] = [];

    if (input.capacity) {
      conditions.push(gte(meetingRooms.capacity, input.capacity));
    }

    if (input.floor) {
      conditions.push(eq(meetingRooms.floor, input.floor));
    }

    // Note: Equipment filtering and availability checking would need
    // more complex queries (JSONB contains, time range intersection)
    // For now, return basic filtered results

    return query;
  }

  /**
   * Create a meeting room (admin only)
   */
  async createMeetingRoom(
    input: CreateMeetingRoomInput,
    orgId: string
  ): Promise<MeetingRoom> {
    const [room] = await db
      .insert(meetingRooms)
      .values({
        orgId,
        name: input.name,
        capacity: input.capacity,
        equipmentJson: input.equipment,
        location: input.location,
        floor: input.floor,
      })
      .returning();

    if (!room) {
      throw new Error("Failed to create meeting room");
    }

    return room;
  }

  /**
   * Update a meeting room
   */
  async updateMeetingRoom(
    roomId: string,
    input: UpdateMeetingRoomInput,
    orgId: string
  ): Promise<MeetingRoom | null> {
    const [room] = await db
      .select()
      .from(meetingRooms)
      .where(
        and(
          eq(meetingRooms.id, roomId),
          eq(meetingRooms.orgId, orgId),
          isNull(meetingRooms.deletedAt)
        )
      );

    if (!room) return null;

    const [updated] = await db
      .update(meetingRooms)
      .set({
        name: input.name ?? room.name,
        capacity: input.capacity ?? room.capacity,
        equipmentJson: input.equipment ?? room.equipmentJson,
        location: input.location ?? room.location,
        floor: input.floor ?? room.floor,
        isActive: input.isActive ?? room.isActive,
        updatedAt: new Date(),
      })
      .where(eq(meetingRooms.id, roomId))
      .returning();

    return updated ?? null;
  }

  /**
   * Delete a meeting room (soft delete)
   */
  async deleteMeetingRoom(roomId: string, orgId: string): Promise<boolean> {
    const result = await db
      .update(meetingRooms)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(meetingRooms.id, roomId),
          eq(meetingRooms.orgId, orgId),
          isNull(meetingRooms.deletedAt)
        )
      )
      .returning();

    return result.length > 0;
  }

  // ============ EVENT OPERATIONS ============

  /**
   * Get events for a user (from owned and subscribed calendars)
   * FR-6.1
   */
  async getEvents(
    userId: string,
    orgId: string,
    query: EventsQueryInput
  ): Promise<CalendarEvent[]> {
    // Resolve start/end aliases
    const startDate = query.start ?? query.startDate;
    const endDate = query.end ?? query.endDate;

    // Get user's calendars (owned + subscribed)
    const userCalendars = await this.getUserCalendars(userId, orgId);
    const calendarIds = userCalendars.map((c) => c.id);

    // Filter by specific calendar if provided
    const targetCalendarIds = query.calendarId
      ? calendarIds.filter((id) => id === query.calendarId)
      : calendarIds;

    // Get events from user's calendars
    const calendarConditions = [
      isNull(calendarEvents.deletedAt),
    ];

    if (startDate) {
      calendarConditions.push(gte(calendarEvents.startTime, new Date(startDate)));
    }

    if (endDate) {
      calendarConditions.push(lte(calendarEvents.endTime, new Date(endDate)));
    }

    if (query.cursor) {
      const [cursorEvent] = await db
        .select()
        .from(calendarEvents)
        .where(eq(calendarEvents.id, query.cursor));

      if (cursorEvent) {
        calendarConditions.push(lt(calendarEvents.startTime, cursorEvent.startTime));
      }
    }

    // Events from owned/subscribed calendars
    const calendarEventsList =
      targetCalendarIds.length > 0
        ? await db
            .select()
            .from(calendarEvents)
            .where(
              and(
                inArray(calendarEvents.calendarId, targetCalendarIds),
                ...calendarConditions
              )
            )
            .orderBy(desc(calendarEvents.startTime))
            .limit(query.limit ?? 50)
        : [];

    // Also get events where user is an attendee (covers subscribed calendars too)
    const attendeeEvents = await db
      .select({ event: calendarEvents })
      .from(eventAttendees)
      .innerJoin(calendarEvents, eq(eventAttendees.eventId, calendarEvents.id))
      .where(
        and(
          eq(eventAttendees.userId, userId),
          ...calendarConditions
        )
      )
      .orderBy(desc(calendarEvents.startTime))
      .limit(query.limit ?? 50);

    // Merge and dedupe
    const eventMap = new Map<string, CalendarEvent>();
    for (const e of calendarEventsList) {
      eventMap.set(e.id, e);
    }
    for (const { event } of attendeeEvents) {
      eventMap.set(event.id, event);
    }

    // Sort by startTime descending and apply limit
    return Array.from(eventMap.values())
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, query.limit ?? 50);
  }

  /**
   * Get a single event by ID
   */
  async getEventById(eventId: string): Promise<CalendarEvent | null> {
    const [event] = await db
      .select()
      .from(calendarEvents)
      .where(
        and(eq(calendarEvents.id, eventId), isNull(calendarEvents.deletedAt))
      );

    return event ?? null;
  }

  /**
   * Get a single event with attendees and RSVP status
   */
  async getEventWithAttendees(eventId: string): Promise<
    | (CalendarEvent & {
        attendees: (EventAttendee & {
          user: { displayName: string | null; avatarUrl: string | null };
        })[];
      })
    | null
  > {
    const event = await this.getEventById(eventId);
    if (!event) return null;

    const attendees = await this.getEventAttendeesWithUserInfo(eventId);

    return { ...event, attendees };
  }

  /**
   * Check if user can access an event
   */
  async canAccessEvent(eventId: string, userId: string): Promise<boolean> {
    const event = await this.getEventById(eventId);
    if (!event) return false;

    // Creator can always access
    if (event.creatorId === userId) return true;

    // Check if user is an attendee
    const [attendee] = await db
      .select()
      .from(eventAttendees)
      .where(
        and(
          eq(eventAttendees.eventId, eventId),
          eq(eventAttendees.userId, userId)
        )
      );

    if (attendee) return true;

    // Check if user has access to the calendar
    const calendar = await this.getCalendarById(event.calendarId, userId);
    return calendar !== null;
  }

  /**
   * Create a calendar event
   * FR-6.1, FR-6.2, FR-6.3
   */
  async createEvent(
    input: CreateEventInput,
    creatorId: string,
    orgId: string
  ): Promise<{ event: CalendarEvent; attendees: EventAttendee[] }> {
    // Verify calendar access
    const calendar = await this.getCalendarById(input.calendarId, creatorId);
    if (!calendar) {
      throw new Error("Calendar not found or not accessible");
    }

    // Check room availability if booking a room
    if (input.roomId) {
      const isAvailable = await this.isRoomAvailable(
        input.roomId,
        new Date(input.startTime),
        new Date(input.endTime)
      );
      if (!isAvailable) {
        throw new Error("Meeting room is not available at this time");
      }
    }

    // Create the event
    const [event] = await db
      .insert(calendarEvents)
      .values({
        orgId,
        calendarId: input.calendarId,
        title: input.title,
        description: input.description,
        startTime: new Date(input.startTime),
        endTime: new Date(input.endTime),
        timezone: input.timezone,
        location: input.location,
        recurrenceRule: input.recurrenceRule,
        roomId: input.roomId,
        creatorId,
        reminders: input.reminders,
      })
      .returning();

    if (!event) {
      throw new Error("Failed to create event");
    }

    // Add creator as organizer
    const attendeeValues = [
      {
        eventId: event.id,
        userId: creatorId,
        isOrganizer: true,
        rsvp: "yes" as const,
        respondedAt: new Date(),
      },
      // Add other attendees
      ...input.attendeeIds.map((userId) => ({
        eventId: event.id,
        userId,
        isRequired: true,
        rsvp: "pending" as const,
      })),
    ];

    const attendees = await db
      .insert(eventAttendees)
      .values(attendeeValues)
      .returning();

    // TODO: FR-6.11 - Create meeting chat if requested
    // TODO: FR-6.12 - Generate meeting link if requested
    // TODO: FR-6.15 - Schedule reminders

    // Auto-notify attendees (exclude creator)
    await this.notifyAttendees(
      input.attendeeIds,
      "event_invite",
      `You've been invited to "${input.title}"`,
      `Event: ${input.title} at ${input.startTime}`,
      "calendar_event",
      event.id
    );

    return { event, attendees };
  }

  /**
   * Update an event
   */
  async updateEvent(
    eventId: string,
    input: UpdateEventInput,
    userId: string
  ): Promise<CalendarEvent | null> {
    const event = await this.getEventById(eventId);
    if (!event) return null;

    // Only creator can update
    if (event.creatorId !== userId) {
      throw new Error("Not authorized to update this event");
    }

    // Check room availability if changing room or times
    if (input.roomId || input.startTime || input.endTime) {
      const roomId = input.roomId ?? event.roomId;
      const startTime = input.startTime
        ? new Date(input.startTime)
        : event.startTime;
      const endTime = input.endTime ? new Date(input.endTime) : event.endTime;

      if (roomId) {
        const isAvailable = await this.isRoomAvailable(
          roomId,
          startTime,
          endTime,
          eventId // Exclude current event
        );
        if (!isAvailable) {
          throw new Error("Meeting room is not available at this time");
        }
      }
    }

    const updateData: Partial<CalendarEvent> = {
      updatedAt: new Date(),
    };

    if (input.title !== undefined) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.startTime !== undefined)
      updateData.startTime = new Date(input.startTime);
    if (input.endTime !== undefined) updateData.endTime = new Date(input.endTime);
    if (input.timezone !== undefined) updateData.timezone = input.timezone;
    if (input.location !== undefined) updateData.location = input.location;
    if (input.recurrenceRule !== undefined)
      updateData.recurrenceRule = input.recurrenceRule;
    if (input.roomId !== undefined) updateData.roomId = input.roomId;
    if (input.reminders !== undefined) updateData.reminders = input.reminders;
    if (input.isCancelled !== undefined) updateData.isCancelled = input.isCancelled;

    const [updated] = await db
      .update(calendarEvents)
      .set(updateData)
      .where(eq(calendarEvents.id, eventId))
      .returning();

    if (updated) {
      // Auto-notify attendees about the update (exclude creator)
      const attendees = await this.getEventAttendees(eventId);
      const attendeeUserIds = attendees
        .filter((a) => a.userId !== userId)
        .map((a) => a.userId);

      await this.notifyAttendees(
        attendeeUserIds,
        "event_updated",
        `Event "${updated.title}" has been updated`,
        `The event "${updated.title}" was modified by the organizer`,
        "calendar_event",
        eventId
      );
    }

    return updated ?? null;
  }

  /**
   * Delete an event (soft delete)
   */
  async deleteEvent(eventId: string, userId: string): Promise<boolean> {
    const event = await this.getEventById(eventId);
    if (!event) return false;

    if (event.creatorId !== userId) {
      throw new Error("Not authorized to delete this event");
    }

    await db
      .update(calendarEvents)
      .set({ deletedAt: new Date() })
      .where(eq(calendarEvents.id, eventId));

    return true;
  }

  // ============ ATTENDEE OPERATIONS ============

  /**
   * Get attendees for an event
   */
  async getEventAttendees(eventId: string): Promise<EventAttendee[]> {
    return db
      .select()
      .from(eventAttendees)
      .where(eq(eventAttendees.eventId, eventId));
  }

  /**
   * Get attendees with user info
   */
  async getEventAttendeesWithUserInfo(
    eventId: string
  ): Promise<(EventAttendee & { user: { displayName: string | null; avatarUrl: string | null } })[]> {
    const results = await db
      .select({
        id: eventAttendees.id,
        eventId: eventAttendees.eventId,
        userId: eventAttendees.userId,
        rsvp: eventAttendees.rsvp,
        isRequired: eventAttendees.isRequired,
        isOrganizer: eventAttendees.isOrganizer,
        notifiedAt: eventAttendees.notifiedAt,
        respondedAt: eventAttendees.respondedAt,
        createdAt: eventAttendees.createdAt,
        user: {
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(eventAttendees)
      .innerJoin(users, eq(eventAttendees.userId, users.id))
      .where(eq(eventAttendees.eventId, eventId));

    return results;
  }

  /**
   * Add an attendee to an event
   */
  async addAttendee(
    eventId: string,
    input: AddAttendeeInput,
    requesterId: string
  ): Promise<EventAttendee> {
    const event = await this.getEventById(eventId);
    if (!event) {
      throw new Error("Event not found");
    }

    // Only creator can add attendees
    if (event.creatorId !== requesterId) {
      throw new Error("Not authorized to add attendees");
    }

    const [attendee] = await db
      .insert(eventAttendees)
      .values({
        eventId,
        userId: input.userId,
        isRequired: input.isRequired,
        rsvp: "pending",
      })
      .onConflictDoNothing()
      .returning();

    if (!attendee) {
      // Already an attendee
      const [existing] = await db
        .select()
        .from(eventAttendees)
        .where(
          and(
            eq(eventAttendees.eventId, eventId),
            eq(eventAttendees.userId, input.userId)
          )
        );
      return existing!;
    }

    return attendee;
  }

  /**
   * Remove an attendee from an event
   */
  async removeAttendee(
    eventId: string,
    userId: string,
    requesterId: string
  ): Promise<boolean> {
    const event = await this.getEventById(eventId);
    if (!event) return false;

    // Only creator can remove attendees, or user can remove themselves
    if (event.creatorId !== requesterId && userId !== requesterId) {
      throw new Error("Not authorized to remove this attendee");
    }

    // Cannot remove the organizer
    const [attendee] = await db
      .select()
      .from(eventAttendees)
      .where(
        and(
          eq(eventAttendees.eventId, eventId),
          eq(eventAttendees.userId, userId)
        )
      );

    if (attendee?.isOrganizer) {
      throw new Error("Cannot remove the event organizer");
    }

    const result = await db
      .delete(eventAttendees)
      .where(
        and(
          eq(eventAttendees.eventId, eventId),
          eq(eventAttendees.userId, userId)
        )
      )
      .returning();

    return result.length > 0;
  }

  /**
   * RSVP to an event
   * FR-6.3
   */
  async rsvp(
    eventId: string,
    response: RsvpInput,
    userId: string
  ): Promise<EventAttendee | null> {
    const [updated] = await db
      .update(eventAttendees)
      .set({
        rsvp: response.response,
        respondedAt: new Date(),
      })
      .where(
        and(
          eq(eventAttendees.eventId, eventId),
          eq(eventAttendees.userId, userId)
        )
      )
      .returning();

    return updated ?? null;
  }

  // ============ AVAILABILITY OPERATIONS ============

  /**
   * Check if a room is available during a time range
   * FR-6.7
   */
  async isRoomAvailable(
    roomId: string,
    startTime: Date,
    endTime: Date,
    excludeEventId?: string
  ): Promise<boolean> {
    const conditions: ReturnType<typeof eq>[] = [
      eq(calendarEvents.roomId, roomId),
      isNull(calendarEvents.deletedAt),
      eq(calendarEvents.isCancelled, false),
      // Time overlap: event starts before we end AND event ends after we start
      lt(calendarEvents.startTime, endTime),
      gte(calendarEvents.endTime, startTime),
    ];

    if (excludeEventId) {
      conditions.push(sql`${calendarEvents.id} != ${excludeEventId}` as ReturnType<typeof eq>);
    }

    const [conflict] = await db
      .select()
      .from(calendarEvents)
      .where(and(...conditions))
      .limit(1);

    return !conflict;
  }

  /**
   * Find available time slots for multiple users
   * FR-6.5
   */
  async findAvailability(
    input: AvailabilitySearchInput,
    _orgId: string
  ): Promise<{ start: Date; end: Date }[]> {
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);
    const durationMs = input.duration * 60 * 1000;

    const busySlots = await this.getUserBusySlots(input.userIds, startDate, endDate);
    const userWorkingHours = await this.getUserWorkingHours(input.userIds);

    // Build unavailable times: busy slots + outside working hours
    const allBusy = [
      ...busySlots,
      ...this.getOutsideWorkingHoursSlots(userWorkingHours, startDate, endDate),
    ];

    const mergedBusy = this.mergeBusyTimes(allBusy);

    // Find gaps
    const slots: { start: Date; end: Date }[] = [];
    let current = startDate;
    for (const busy of mergedBusy) {
      if (busy.start.getTime() - current.getTime() >= durationMs) {
        slots.push({
          start: current,
          end: new Date(Math.min(busy.start.getTime(), endDate.getTime())),
        });
      }
      current = busy.end;
    }

    if (endDate.getTime() - current.getTime() >= durationMs) {
      slots.push({ start: current, end: endDate });
    }

    return slots;
  }

  /**
   * Get free/busy slots for multiple users (US-047)
   * Returns per-slot free/busy information
   */
  async getAvailability(
    userIds: string[],
    start: Date,
    end: Date
  ): Promise<{ userId: string; busy: { start: Date; end: Date }[]; workingHours: { start: string; end: string } }[]> {
    const userWorkingHours = await this.getUserWorkingHours(userIds);

    // Get busy slots per user
    const result: { userId: string; busy: { start: Date; end: Date }[]; workingHours: { start: string; end: string } }[] = [];

    for (const uid of userIds) {
      const busySlots = await this.getUserBusySlots([uid], start, end);
      const outsideHours = this.getOutsideWorkingHoursSlots(
        userWorkingHours.filter((u) => u.userId === uid),
        start,
        end
      );
      const allBusy = this.mergeBusyTimes([...busySlots, ...outsideHours]);
      const wh = userWorkingHours.find((u) => u.userId === uid);

      result.push({
        userId: uid,
        busy: allBusy,
        workingHours: {
          start: wh?.workingHoursStart ?? "09:00",
          end: wh?.workingHoursEnd ?? "17:00",
        },
      });
    }

    return result;
  }

  /**
   * Get busy time slots for users from events where RSVP is yes or pending (US-047)
   */
  private async getUserBusySlots(
    userIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<{ start: Date; end: Date }[]> {
    const userEvents = await db
      .select({
        startTime: calendarEvents.startTime,
        endTime: calendarEvents.endTime,
        userId: eventAttendees.userId,
      })
      .from(calendarEvents)
      .innerJoin(
        eventAttendees,
        eq(calendarEvents.id, eventAttendees.eventId)
      )
      .where(
        and(
          inArray(eventAttendees.userId, userIds),
          // Only count events where user RSVP'd yes or pending (US-047)
          inArray(eventAttendees.rsvp, ["yes", "pending"]),
          isNull(calendarEvents.deletedAt),
          eq(calendarEvents.isCancelled, false),
          lt(calendarEvents.startTime, endDate),
          gte(calendarEvents.endTime, startDate)
        )
      );

    return userEvents.map((e) => ({
      start: e.startTime,
      end: e.endTime,
    }));
  }

  /**
   * Get working hours for users (US-047)
   */
  private async getUserWorkingHours(
    userIds: string[]
  ): Promise<{ userId: string; workingHoursStart: string; workingHoursEnd: string }[]> {
    const userRows = await db
      .select({
        id: users.id,
        workingHoursStart: users.workingHoursStart,
        workingHoursEnd: users.workingHoursEnd,
      })
      .from(users)
      .where(inArray(users.id, userIds));

    return userRows.map((u) => ({
      userId: u.id,
      workingHoursStart: u.workingHoursStart ?? "09:00",
      workingHoursEnd: u.workingHoursEnd ?? "17:00",
    }));
  }

  /**
   * Generate "busy" slots for time outside working hours (US-047)
   * For each day in the range, marks before working hours start and after working hours end as unavailable
   */
  private getOutsideWorkingHoursSlots(
    userWorkingHours: { userId: string; workingHoursStart: string; workingHoursEnd: string }[],
    startDate: Date,
    endDate: Date
  ): { start: Date; end: Date }[] {
    const slots: { start: Date; end: Date }[] = [];

    // Find the most restrictive working hours (intersection)
    let latestStart = "00:00";
    let earliestEnd = "23:59";

    if (userWorkingHours.length > 0) {
      latestStart = userWorkingHours.reduce((max, u) =>
        u.workingHoursStart > max ? u.workingHoursStart : max, "00:00");
      earliestEnd = userWorkingHours.reduce((min, u) =>
        u.workingHoursEnd < min ? u.workingHoursEnd : min, "23:59");
    }

    // Iterate day by day
    const current = new Date(startDate);
    current.setUTCHours(0, 0, 0, 0);

    while (current < endDate) {
      const dayStart = new Date(current);
      const dayEnd = new Date(current);
      dayEnd.setUTCHours(23, 59, 59, 999);

      // Parse working hours
      const [startH, startM] = latestStart.split(":").map(Number);
      const [endH, endM] = earliestEnd.split(":").map(Number);

      const workStart = new Date(current);
      workStart.setUTCHours(startH!, startM!, 0, 0);

      const workEnd = new Date(current);
      workEnd.setUTCHours(endH!, endM!, 0, 0);

      // Before working hours
      if (dayStart < workStart) {
        slots.push({
          start: new Date(Math.max(dayStart.getTime(), startDate.getTime())),
          end: new Date(Math.min(workStart.getTime(), endDate.getTime())),
        });
      }

      // After working hours
      if (workEnd < dayEnd) {
        slots.push({
          start: new Date(Math.max(workEnd.getTime(), startDate.getTime())),
          end: new Date(Math.min(dayEnd.getTime(), endDate.getTime())),
        });
      }

      // Next day
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return slots;
  }

  /**
   * Merge overlapping busy time slots
   */
  private mergeBusyTimes(
    busyTimes: { start: Date; end: Date }[]
  ): { start: Date; end: Date }[] {
    if (busyTimes.length === 0) return [];

    const sorted = [...busyTimes].sort((a, b) => a.start.getTime() - b.start.getTime());
    const merged: { start: Date; end: Date }[] = [];

    for (const busy of sorted) {
      if (
        merged.length === 0 ||
        busy.start > merged[merged.length - 1]!.end
      ) {
        merged.push({ start: busy.start, end: busy.end });
      } else {
        const last = merged[merged.length - 1]!;
        last.end = new Date(Math.max(last.end.getTime(), busy.end.getTime()));
      }
    }

    return merged;
  }

  // ============ NOTIFICATION HELPERS ============

  /**
   * Send notifications to a list of attendees
   */
  private async notifyAttendees(
    userIds: string[],
    type: "event_invite" | "event_updated",
    title: string,
    body: string,
    entityType: string,
    entityId: string
  ): Promise<void> {
    await Promise.all(
      userIds.map((userId) =>
        notificationsService.createNotification({
          userId,
          type,
          title,
          body,
          entityType,
          entityId,
        })
      )
    );
  }

  /**
   * Detect conflicts for a potential event
   * FR-6.7
   */
  async detectConflicts(
    userId: string,
    startTime: Date,
    endTime: Date
  ): Promise<CalendarEvent[]> {
    return db
      .select({ event: calendarEvents })
      .from(calendarEvents)
      .innerJoin(
        eventAttendees,
        eq(calendarEvents.id, eventAttendees.eventId)
      )
      .where(
        and(
          eq(eventAttendees.userId, userId),
          isNull(calendarEvents.deletedAt),
          eq(calendarEvents.isCancelled, false),
          // Time overlap
          lt(calendarEvents.startTime, endTime),
          gte(calendarEvents.endTime, startTime)
        )
      )
      .then((results) => results.map((r) => r.event));
  }
}

export const calendarService = new CalendarService();
