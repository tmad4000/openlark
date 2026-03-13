"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { api, type CalendarEvent } from "@/lib/api";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventPopover } from "./event-popover";

interface MonthlyCalendarProps {
  currentDate: Date;
  onNavigate: (date: Date) => void;
  onCreateEvent: (prefillDate: Date) => void;
  onViewEventDetails: (event: CalendarEvent) => void;
}

const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

interface DayCell {
  date: Date;
  inMonth: boolean;
}

function buildMonthGrid(year: number, month: number): DayCell[] {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const daysInPrevMonth = getDaysInMonth(year, month - 1);
  const cells: DayCell[] = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({
      date: new Date(year, month - 1, daysInPrevMonth - i),
      inMonth: false,
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true });
  }
  const remaining = Math.ceil(cells.length / 7) * 7 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ date: new Date(year, month + 1, d), inMonth: false });
  }
  return cells;
}

// Event colors based on event title hash (deterministic)
const EVENT_COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-purple-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-red-500",
];

function getEventColor(eventId: string) {
  let hash = 0;
  for (let i = 0; i < eventId.length; i++) {
    hash = (hash << 5) - hash + eventId.charCodeAt(i);
    hash |= 0;
  }
  return EVENT_COLORS[Math.abs(hash) % EVENT_COLORS.length];
}

export function MonthlyCalendar({
  currentDate,
  onNavigate,
  onCreateEvent,
  onViewEventDetails,
}: MonthlyCalendarProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [popoverEvent, setPopoverEvent] = useState<CalendarEvent | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<DOMRect | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const today = new Date();

  const cells = buildMonthGrid(year, month);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  // Load events for the visible month range
  useEffect(() => {
    async function loadEvents() {
      setIsLoading(true);
      try {
        // Get the full visible range (may include days from prev/next month)
        const startDate = cells[0].date.toISOString();
        const endDate = cells[cells.length - 1].date.toISOString();
        const response = await api.getEvents({ startDate, endDate });
        setEvents(response.events);
      } catch (err) {
        console.error("Failed to load calendar events:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  // Get events for a specific day
  const getEventsForDay = useCallback(
    (date: Date) => {
      return events.filter((event) => {
        const eventDate = new Date(event.startTime);
        return isSameDay(eventDate, date);
      });
    },
    [events]
  );

  const handleEventClick = (
    e: React.MouseEvent,
    event: CalendarEvent
  ) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopoverEvent(event);
    setPopoverAnchor(rect);
  };

  const handleClosePopover = useCallback(() => {
    setPopoverEvent(null);
    setPopoverAnchor(null);
  }, []);

  const prevMonth = () => onNavigate(new Date(year, month - 1, 1));
  const nextMonth = () => onNavigate(new Date(year, month + 1, 1));
  const goToday = () => onNavigate(new Date());

  const monthLabel = currentDate.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <button
            onClick={prevMonth}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
            aria-label="Next month"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 ml-2">
            {monthLabel}
          </h2>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-800">
          {WEEKDAY_LABELS.map((day) => (
            <div
              key={day}
              className="py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
            >
              {day.slice(0, 3)}
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div className="flex-1 grid auto-rows-fr" style={{ gridTemplateRows: `repeat(${weeks.length}, 1fr)` }}>
          {weeks.map((week, weekIdx) => (
            <div key={weekIdx} className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-800 last:border-b-0">
              {week.map((cell, dayIdx) => {
                const dayEvents = getEventsForDay(cell.date);
                const isToday = isSameDay(cell.date, today);
                const MAX_VISIBLE = 3;
                const visibleEvents = dayEvents.slice(0, MAX_VISIBLE);
                const overflow = dayEvents.length - MAX_VISIBLE;

                return (
                  <div
                    key={dayIdx}
                    onClick={() => onCreateEvent(cell.date)}
                    className={cn(
                      "border-r border-gray-200 dark:border-gray-800 last:border-r-0 p-1 min-h-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors overflow-hidden",
                      !cell.inMonth && "bg-gray-50/50 dark:bg-gray-900/50"
                    )}
                  >
                    {/* Day number */}
                    <div className="flex justify-center mb-0.5">
                      <span
                        className={cn(
                          "text-xs leading-6 w-6 h-6 flex items-center justify-center rounded-full",
                          !cell.inMonth && "text-gray-400 dark:text-gray-600",
                          cell.inMonth &&
                            !isToday &&
                            "text-gray-700 dark:text-gray-300",
                          isToday &&
                            "bg-blue-500 text-white font-semibold"
                        )}
                      >
                        {cell.date.getDate()}
                      </span>
                    </div>

                    {/* Events */}
                    <div className="space-y-0.5">
                      {visibleEvents.map((event) => (
                        <button
                          key={event.id}
                          onClick={(e) => handleEventClick(e, event)}
                          className={cn(
                            "w-full text-left px-1 py-0.5 rounded text-[10px] leading-tight text-white truncate",
                            getEventColor(event.id)
                          )}
                          title={event.title}
                        >
                          {event.title}
                        </button>
                      ))}
                      {overflow > 0 && (
                        <div className="text-[10px] text-gray-500 dark:text-gray-400 text-center">
                          +{overflow} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Event popover */}
      {popoverEvent && (
        <EventPopover
          event={popoverEvent}
          anchorRect={popoverAnchor}
          onClose={handleClosePopover}
          onViewDetails={(event) => {
            handleClosePopover();
            onViewEventDetails(event);
          }}
        />
      )}
    </div>
  );
}
