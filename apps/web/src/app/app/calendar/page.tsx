"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
  Users,
  X,
  Calendar as CalendarIcon,
} from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { EventCreationDialog } from "@/components/EventCreationDialog";

interface EventAttendee {
  userId: string;
  rsvp: "pending" | "yes" | "no" | "maybe";
  user: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  timezone: string;
  location: string | null;
  creatorId: string;
  attendees: EventAttendee[];
  creator: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  settings?: {
    isAllDay?: boolean;
  };
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

// Helper to get days in month
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// Helper to get first day of week for a month (0 = Sunday)
function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

// Format time for display
function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// Format date range
function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const sameDay = startDate.toDateString() === endDate.toDateString();

  if (sameDay) {
    return `${formatTime(start)} - ${formatTime(end)}`;
  }
  return `${startDate.toLocaleDateString()} ${formatTime(start)} - ${endDate.toLocaleDateString()} ${formatTime(end)}`;
}

// Get color for event (based on hash of event id)
function getEventColor(eventId: string): string {
  const colors = [
    "bg-blue-500",
    "bg-green-500",
    "bg-purple-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-teal-500",
    "bg-indigo-500",
    "bg-red-500",
  ];
  let hash = 0;
  for (let i = 0; i < eventId.length; i++) {
    hash = eventId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

interface MiniCalendarProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  currentMonth: Date;
  onMonthChange: (date: Date) => void;
}

function MiniCalendar({
  selectedDate,
  onSelectDate,
  currentMonth,
  onMonthChange,
}: MiniCalendarProps) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const today = new Date();

  // Days from previous month
  const prevMonth = new Date(year, month - 1);
  const daysInPrevMonth = getDaysInMonth(
    prevMonth.getFullYear(),
    prevMonth.getMonth()
  );

  const calendarDays: Array<{
    day: number;
    month: number;
    year: number;
    isCurrentMonth: boolean;
  }> = [];

  // Previous month days
  for (let i = firstDay - 1; i >= 0; i--) {
    calendarDays.push({
      day: daysInPrevMonth - i,
      month: prevMonth.getMonth(),
      year: prevMonth.getFullYear(),
      isCurrentMonth: false,
    });
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push({
      day: i,
      month,
      year,
      isCurrentMonth: true,
    });
  }

  // Next month days to fill grid
  const nextMonth = new Date(year, month + 1);
  const remainingDays = 42 - calendarDays.length;
  for (let i = 1; i <= remainingDays; i++) {
    calendarDays.push({
      day: i,
      month: nextMonth.getMonth(),
      year: nextMonth.getFullYear(),
      isCurrentMonth: false,
    });
  }

  return (
    <div className="bg-white rounded-lg p-3">
      {/* Mini calendar header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-900">
          {MONTHS[month]} {year}
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => onMonthChange(new Date(year, month - 1))}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <button
            onClick={() => onMonthChange(new Date(year, month + 1))}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0 mb-1">
        {DAYS_OF_WEEK.map((day) => (
          <div
            key={day}
            className="text-center text-xs font-medium text-gray-500 py-1"
          >
            {day[0]}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0">
        {calendarDays.map((item, index) => {
          const date = new Date(item.year, item.month, item.day);
          const isToday = date.toDateString() === today.toDateString();
          const isSelected =
            date.toDateString() === selectedDate.toDateString();

          return (
            <button
              key={index}
              onClick={() => {
                onSelectDate(date);
                if (!item.isCurrentMonth) {
                  onMonthChange(new Date(item.year, item.month));
                }
              }}
              className={`
                w-7 h-7 text-xs rounded-full flex items-center justify-center
                transition-colors
                ${!item.isCurrentMonth ? "text-gray-400" : "text-gray-700"}
                ${isToday && !isSelected ? "bg-blue-100 text-blue-600 font-medium" : ""}
                ${isSelected ? "bg-blue-600 text-white font-medium" : "hover:bg-gray-100"}
              `}
            >
              {item.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface EventPopoverProps {
  event: CalendarEvent;
  onClose: () => void;
}

function EventPopover({ event, onClose }: EventPopoverProps) {
  const acceptedCount = event.attendees.filter((a) => a.rsvp === "yes").length;
  const pendingCount = event.attendees.filter(
    (a) => a.rsvp === "pending"
  ).length;

  return (
    <div className="w-80 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div
        className={`${getEventColor(event.id)} px-4 py-3 flex items-start justify-between`}
      >
        <h3 className="font-semibold text-white truncate flex-1 pr-2">
          {event.title}
        </h3>
        <button
          onClick={onClose}
          className="text-white/80 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Time */}
        <div className="flex items-start gap-3">
          <Clock className="w-4 h-4 text-gray-400 mt-0.5" />
          <div className="text-sm">
            <div className="text-gray-900">
              {formatDateRange(event.startTime, event.endTime)}
            </div>
            {event.settings?.isAllDay && (
              <div className="text-gray-500 text-xs">All day</div>
            )}
          </div>
        </div>

        {/* Location */}
        {event.location && (
          <div className="flex items-start gap-3">
            <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
            <span className="text-sm text-gray-900">{event.location}</span>
          </div>
        )}

        {/* Attendees */}
        <div className="flex items-start gap-3">
          <Users className="w-4 h-4 text-gray-400 mt-0.5" />
          <div className="text-sm">
            <span className="text-gray-900">
              {event.attendees.length} attendee
              {event.attendees.length !== 1 ? "s" : ""}
            </span>
            <span className="text-gray-500 ml-1">
              ({acceptedCount} yes{pendingCount > 0 ? `, ${pendingCount} pending` : ""})
            </span>
          </div>
        </div>

        {/* Description */}
        {event.description && (
          <div className="pt-2 border-t border-gray-100">
            <p className="text-sm text-gray-600 line-clamp-3">
              {event.description}
            </p>
          </div>
        )}

        {/* Organizer */}
        <div className="pt-2 border-t border-gray-100 flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
            {event.creator.displayName?.charAt(0).toUpperCase() || "U"}
          </div>
          <span className="text-sm text-gray-600">
            Organized by {event.creator.displayName || "Unknown"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null
  );
  const [popoverAnchor, setPopoverAnchor] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createDialogDate, setCreateDialogDate] = useState<Date | undefined>(undefined);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Fetch events for the current month view
  const fetchEvents = useCallback(async () => {
    const token = getCookie("session_token");
    if (!token) return;

    // Get date range for the month (including overflow days)
    const firstDay = getFirstDayOfMonth(year, month);
    const startDate = new Date(year, month, 1 - firstDay);
    const endDate = new Date(year, month + 1, 14); // Include some days into next month

    try {
      const res = await fetch(
        `/api/events?start=${startDate.toISOString()}&end=${endDate.toISOString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch (error) {
      console.error("Failed to fetch events:", error);
    } finally {
      setIsLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Build calendar grid
  const calendarGrid = useMemo(() => {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const today = new Date();

    // Days from previous month
    const prevMonth = new Date(year, month - 1);
    const daysInPrevMonth = getDaysInMonth(
      prevMonth.getFullYear(),
      prevMonth.getMonth()
    );

    const grid: Array<{
      day: number;
      month: number;
      year: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      events: CalendarEvent[];
    }> = [];

    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
      const dayDate = new Date(
        prevMonth.getFullYear(),
        prevMonth.getMonth(),
        daysInPrevMonth - i
      );
      grid.push({
        day: daysInPrevMonth - i,
        month: prevMonth.getMonth(),
        year: prevMonth.getFullYear(),
        isCurrentMonth: false,
        isToday: dayDate.toDateString() === today.toDateString(),
        events: [],
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const dayDate = new Date(year, month, i);
      grid.push({
        day: i,
        month,
        year,
        isCurrentMonth: true,
        isToday: dayDate.toDateString() === today.toDateString(),
        events: [],
      });
    }

    // Next month days to fill 6 rows
    const nextMonth = new Date(year, month + 1);
    const totalCells = Math.ceil(grid.length / 7) * 7;
    const remainingDays = Math.max(totalCells - grid.length, 7);
    for (let i = 1; i <= remainingDays; i++) {
      const dayDate = new Date(
        nextMonth.getFullYear(),
        nextMonth.getMonth(),
        i
      );
      grid.push({
        day: i,
        month: nextMonth.getMonth(),
        year: nextMonth.getFullYear(),
        isCurrentMonth: false,
        isToday: dayDate.toDateString() === today.toDateString(),
        events: [],
      });
    }

    // Assign events to days
    for (const event of events) {
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);

      for (const cell of grid) {
        const cellDate = new Date(cell.year, cell.month, cell.day);
        const cellEndOfDay = new Date(cell.year, cell.month, cell.day + 1);

        // Check if event overlaps with this day
        if (eventStart < cellEndOfDay && eventEnd > cellDate) {
          cell.events.push(event);
        }
      }
    }

    return grid;
  }, [year, month, events]);

  // Navigation handlers
  const goToPreviousMonth = () => {
    setCurrentDate(new Date(year, month - 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1));
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  // Handle event click
  const handleEventClick = (
    event: CalendarEvent,
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setPopoverAnchor({ x: rect.left, y: rect.bottom + 8 });
    setSelectedEvent(event);
  };

  // Handle date cell click - open create event dialog with this date
  const handleDateClick = (cell: (typeof calendarGrid)[0]) => {
    const clickedDate = new Date(cell.year, cell.month, cell.day);
    setSelectedDate(clickedDate);
    setCreateDialogDate(clickedDate);
    setShowCreateDialog(true);
  };

  // Handle create button click
  const handleCreateClick = () => {
    setCreateDialogDate(selectedDate);
    setShowCreateDialog(true);
  };

  // Handle event created - refresh the events list
  const handleEventCreated = () => {
    fetchEvents();
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading calendar...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex bg-gray-50">
      {/* Left sidebar with mini calendar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col p-4">
        {/* Create event button */}
        <button
          onClick={handleCreateClick}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors mb-4"
        >
          <Plus className="w-5 h-5" />
          <span>Create</span>
        </button>

        {/* Mini calendar */}
        <MiniCalendar
          selectedDate={selectedDate}
          onSelectDate={(date) => {
            setSelectedDate(date);
            setCurrentDate(date);
          }}
          currentMonth={currentDate}
          onMonthChange={setCurrentDate}
        />

        {/* Quick date shortcuts */}
        <div className="mt-4 space-y-1">
          <button
            onClick={goToToday}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Today
          </button>
        </div>
      </aside>

      {/* Main calendar view */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Calendar header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={goToToday}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Today
            </button>
            <div className="flex items-center gap-1">
              <button
                onClick={goToPreviousMonth}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <button
                onClick={goToNextMonth}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            <h1 className="text-xl font-semibold text-gray-900">
              {MONTHS[month]} {year}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-gray-400" />
            <span className="text-sm text-gray-600">Month</span>
          </div>
        </header>

        {/* Calendar grid */}
        <div className="flex-1 overflow-auto p-4">
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden h-full flex flex-col">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-gray-200">
              {DAYS_OF_WEEK.map((day) => (
                <div
                  key={day}
                  className="px-2 py-3 text-center text-sm font-medium text-gray-500 border-r last:border-r-0 border-gray-200"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar cells */}
            <div className="flex-1 grid grid-cols-7 auto-rows-fr">
              {calendarGrid.map((cell, index) => (
                <button
                  key={index}
                  onClick={() => handleDateClick(cell)}
                  className={`
                    min-h-[100px] p-1 border-r border-b last:border-r-0 border-gray-200
                    text-left flex flex-col
                    hover:bg-gray-50 transition-colors
                    ${!cell.isCurrentMonth ? "bg-gray-50" : "bg-white"}
                  `}
                >
                  {/* Day number */}
                  <div
                    className={`
                    w-7 h-7 flex items-center justify-center rounded-full text-sm mb-1
                    ${cell.isToday ? "bg-blue-600 text-white font-medium" : ""}
                    ${!cell.isCurrentMonth ? "text-gray-400" : "text-gray-700"}
                  `}
                  >
                    {cell.day}
                  </div>

                  {/* Events */}
                  <div className="flex-1 overflow-hidden space-y-0.5">
                    {cell.events.slice(0, 3).map((event) => (
                      <button
                        key={event.id}
                        onClick={(e) => handleEventClick(event, e)}
                        className={`
                          w-full px-1.5 py-0.5 rounded text-xs text-white truncate text-left
                          ${getEventColor(event.id)} hover:opacity-90 transition-opacity
                        `}
                        title={event.title}
                      >
                        {event.settings?.isAllDay
                          ? event.title
                          : `${formatTime(event.startTime)} ${event.title}`}
                      </button>
                    ))}
                    {cell.events.length > 3 && (
                      <div className="text-xs text-gray-500 px-1.5">
                        +{cell.events.length - 3} more
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Event popover */}
      {selectedEvent && popoverAnchor && (
        <Popover.Root open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
          <Popover.Anchor
            style={{
              position: "fixed",
              left: popoverAnchor.x,
              top: popoverAnchor.y,
            }}
          />
          <Popover.Portal>
            <Popover.Content
              className="z-50"
              sideOffset={0}
              align="start"
              onPointerDownOutside={() => setSelectedEvent(null)}
            >
              <EventPopover
                event={selectedEvent}
                onClose={() => setSelectedEvent(null)}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}

      {/* Event creation dialog */}
      <EventCreationDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        initialDate={createDialogDate}
        onEventCreated={handleEventCreated}
      />
    </div>
  );
}
