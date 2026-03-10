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
} from "drizzle-orm";
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
    // Get user's calendars (owned + subscribed)
    const userCalendars = await this.getUserCalendars(userId, orgId);
    const calendarIds = userCalendars.map((c) => c.id);

    if (calendarIds.length === 0) {
      return [];
    }

    // Filter by specific calendar if provided
    const targetCalendarIds = query.calendarId
      ? calendarIds.filter((id) => id === query.calendarId)
      : calendarIds;

    if (targetCalendarIds.length === 0) {
      return [];
    }

    const conditions = [
      inArray(calendarEvents.calendarId, targetCalendarIds),
      isNull(calendarEvents.deletedAt),
    ];

    if (query.startDate) {
      conditions.push(gte(calendarEvents.startTime, new Date(query.startDate)));
    }

    if (query.endDate) {
      conditions.push(lte(calendarEvents.endTime, new Date(query.endDate)));
    }

    if (query.cursor) {
      // Cursor-based pagination using event ID
      const [cursorEvent] = await db
        .select()
        .from(calendarEvents)
        .where(eq(calendarEvents.id, query.cursor));

      if (cursorEvent) {
        conditions.push(lt(calendarEvents.startTime, cursorEvent.startTime));
      }
    }

    return db
      .select()
      .from(calendarEvents)
      .where(and(...conditions))
      .orderBy(desc(calendarEvents.startTime))
      .limit(query.limit ?? 50);
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

    // Get all events for the users in the date range
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
          inArray(eventAttendees.userId, input.userIds),
          isNull(calendarEvents.deletedAt),
          eq(calendarEvents.isCancelled, false),
          // Event overlaps with search range
          lt(calendarEvents.startTime, endDate),
          gte(calendarEvents.endTime, startDate)
        )
      );

    // Build a simple algorithm to find gaps
    // This is a simplified version - production would need working hours, etc.
    const slots: { start: Date; end: Date }[] = [];

    // Merge all busy times
    const busyTimes = userEvents.map((e) => ({
      start: e.startTime,
      end: e.endTime,
    }));

    // Sort by start time
    busyTimes.sort((a, b) => a.start.getTime() - b.start.getTime());

    // Merge overlapping busy times
    const mergedBusy: { start: Date; end: Date }[] = [];
    for (const busy of busyTimes) {
      if (
        mergedBusy.length === 0 ||
        busy.start > mergedBusy[mergedBusy.length - 1]!.end
      ) {
        mergedBusy.push({ start: busy.start, end: busy.end });
      } else {
        const last = mergedBusy[mergedBusy.length - 1]!;
        last.end = new Date(Math.max(last.end.getTime(), busy.end.getTime()));
      }
    }

    // Find gaps
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

    // Check remaining time after last busy period
    if (endDate.getTime() - current.getTime() >= durationMs) {
      slots.push({ start: current, end: endDate });
    }

    return slots;
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
