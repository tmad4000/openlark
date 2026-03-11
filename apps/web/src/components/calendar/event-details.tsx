"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { api, type CalendarEvent, type EventAttendee } from "@/lib/api";
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Check,
  X,
  HelpCircle,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface EventDetailsProps {
  eventId: string;
  currentUserId: string;
}

export function EventDetails({ eventId, currentUserId }: EventDetailsProps) {
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [attendees, setAttendees] = useState<EventAttendee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rsvpLoading, setRsvpLoading] = useState(false);

  // Find current user's attendance
  const currentUserAttendee = attendees.find((a) => a.userId === currentUserId);

  const loadEventData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [eventResponse, attendeesResponse] = await Promise.all([
        api.getEvent(eventId),
        api.getEventAttendees(eventId),
      ]);

      setEvent(eventResponse.event);
      setAttendees(attendeesResponse.attendees);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load event");
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadEventData();
  }, [loadEventData]);

  const handleRsvp = async (response: "yes" | "no" | "maybe") => {
    try {
      setRsvpLoading(true);
      const result = await api.rsvpEvent(eventId, response);

      // Update local attendees list with the new RSVP
      setAttendees((prev) =>
        prev.map((a) => (a.userId === currentUserId ? result.attendee : a))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send RSVP");
    } finally {
      setRsvpLoading(false);
    }
  };

  // Format date and time for display
  const formatEventDateTime = (event: CalendarEvent) => {
    const start = new Date(event.startTime);
    const end = new Date(event.endTime);

    const dateStr = start.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const timeStr = `${start.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })} - ${end.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })}`;

    return { dateStr, timeStr };
  };

  // Get RSVP icon and color
  const getRsvpDisplay = (rsvp: EventAttendee["rsvp"]) => {
    switch (rsvp) {
      case "yes":
        return { icon: Check, color: "text-green-600 dark:text-green-400" };
      case "no":
        return { icon: X, color: "text-red-600 dark:text-red-400" };
      case "maybe":
        return {
          icon: HelpCircle,
          color: "text-yellow-600 dark:text-yellow-400",
        };
      default:
        return { icon: Clock, color: "text-gray-400 dark:text-gray-500" };
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Loading event...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="flex items-center gap-2 text-sm text-red-500">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Event not found
        </div>
      </div>
    );
  }

  const { dateStr, timeStr } = formatEventDateTime(event);

  return (
    <div className="flex flex-col h-full">
      {/* Event header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          {event.title}
        </h1>
        {event.isCancelled && (
          <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 rounded">
            Cancelled
          </span>
        )}
      </div>

      {/* Event details */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Date and time */}
        <div className="flex items-start gap-3">
          <Calendar className="h-5 w-5 text-gray-400 dark:text-gray-500 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {dateStr}
            </p>
            <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
              <Clock className="h-4 w-4" />
              <span>{timeStr}</span>
            </div>
          </div>
        </div>

        {/* Location */}
        {event.location && (
          <div className="flex items-start gap-3">
            <MapPin className="h-5 w-5 text-gray-400 dark:text-gray-500 mt-0.5" />
            <p className="text-sm text-gray-900 dark:text-gray-100">
              {event.location}
            </p>
          </div>
        )}

        {/* Description */}
        {event.description && (
          <div className="pt-2">
            <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
              {event.description}
            </p>
          </div>
        )}

        {/* RSVP section - only shown for attendees */}
        {currentUserAttendee && (
          <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
            <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
              Your Response
            </h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={rsvpLoading}
                onClick={() => handleRsvp("yes")}
                className={cn(
                  "flex items-center gap-1.5",
                  currentUserAttendee.rsvp === "yes" &&
                    "bg-green-100 border-green-300 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400"
                )}
              >
                <Check className="h-4 w-4" />
                Yes
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={rsvpLoading}
                onClick={() => handleRsvp("no")}
                className={cn(
                  "flex items-center gap-1.5",
                  currentUserAttendee.rsvp === "no" &&
                    "bg-red-100 border-red-300 text-red-700 dark:bg-red-900/30 dark:border-red-700 dark:text-red-400"
                )}
              >
                <X className="h-4 w-4" />
                No
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={rsvpLoading}
                onClick={() => handleRsvp("maybe")}
                className={cn(
                  "flex items-center gap-1.5",
                  currentUserAttendee.rsvp === "maybe" &&
                    "bg-yellow-100 border-yellow-300 text-yellow-700 dark:bg-yellow-900/30 dark:border-yellow-700 dark:text-yellow-400"
                )}
              >
                <HelpCircle className="h-4 w-4" />
                Maybe
              </Button>
            </div>
          </div>
        )}

        {/* Attendees section */}
        {attendees.length > 0 && (
          <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-gray-400 dark:text-gray-500" />
              <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Attendees ({attendees.length})
              </h2>
            </div>
            <ul className="space-y-2">
              {attendees.map((attendee) => {
                const rsvpDisplay = getRsvpDisplay(attendee.rsvp);
                const RsvpIcon = rsvpDisplay.icon;

                return (
                  <li
                    key={attendee.id}
                    className="flex items-center justify-between py-1"
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-300">
                        {(attendee.user?.displayName || "?")
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                      <span className="text-sm text-gray-900 dark:text-gray-100">
                        {attendee.user?.displayName || "Unknown User"}
                      </span>
                      {attendee.isOrganizer && (
                        <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded">
                          Organizer
                        </span>
                      )}
                    </div>
                    <RsvpIcon
                      className={cn("h-4 w-4", rsvpDisplay.color)}
                      aria-label={`RSVP: ${attendee.rsvp}`}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
