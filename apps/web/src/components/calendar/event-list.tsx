"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { api, type CalendarEvent } from "@/lib/api";
import { Calendar, Clock, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EventListProps {
  selectedEventId?: string | null;
  onSelectEvent?: (event: CalendarEvent) => void;
  onCreateEvent?: () => void;
}

export function EventList({
  selectedEventId,
  onSelectEvent,
  onCreateEvent,
}: EventListProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadEvents() {
      try {
        setIsLoading(true);
        setError(null);
        const response = await api.getEvents();
        setEvents(response.events);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load events");
      } finally {
        setIsLoading(false);
      }
    }

    loadEvents();
  }, []);

  // Function to add a new event to the list (called from parent)
  const addEvent = (event: CalendarEvent) => {
    setEvents((prev) => {
      // Avoid duplicates
      if (prev.some((e) => e.id === event.id)) return prev;
      // Insert in sorted order by startTime
      const newEvents = [...prev, event];
      return newEvents.sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );
    });
  };

  // Expose addEvent for parent components
  EventList.addEvent = addEvent;

  // Format date for display
  const formatEventTime = (event: CalendarEvent) => {
    const start = new Date(event.startTime);
    const end = new Date(event.endTime);

    const dateStr = start.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
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

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Loading events...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-sm text-red-500 text-center">{error}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Events
        </h2>
        {onCreateEvent && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onCreateEvent}
            className="h-8 w-8"
            aria-label="New event"
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <Calendar className="h-8 w-8 text-gray-400 dark:text-gray-600 mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No events scheduled
            </p>
            {onCreateEvent && (
              <Button
                variant="outline"
                size="sm"
                onClick={onCreateEvent}
                className="mt-4"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create event
              </Button>
            )}
          </div>
        ) : (
          <ul role="list" className="divide-y divide-gray-200 dark:divide-gray-800">
            {events.map((event) => {
              const { dateStr, timeStr } = formatEventTime(event);
              const isSelected = selectedEventId === event.id;

              return (
                <li key={event.id}>
                  <button
                    onClick={() => onSelectEvent?.(event)}
                    className={cn(
                      "w-full text-left px-4 py-3 transition-colors",
                      "hover:bg-gray-50 dark:hover:bg-gray-800",
                      isSelected && "bg-blue-50 dark:bg-blue-900/20"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-1 h-full min-h-[3rem] rounded-full bg-blue-500 flex-shrink-0"
                        aria-hidden="true"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {event.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                          <Clock className="h-3 w-3" />
                          <span>{dateStr}</span>
                          <span>·</span>
                          <span>{timeStr}</span>
                        </div>
                        {event.location && (
                          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                            <MapPin className="h-3 w-3" />
                            <span>{event.location}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// Static method placeholder - will be overwritten by component instance
EventList.addEvent = (_event: CalendarEvent) => {};
