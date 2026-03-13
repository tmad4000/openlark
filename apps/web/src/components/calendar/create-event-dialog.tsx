"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { api, type CalendarEvent, type Calendar, type UserSearchResult, type MeetingRoomWithAvailability } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// Common timezones for the selector
const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "Eastern Time (US)" },
  { value: "America/Chicago", label: "Central Time (US)" },
  { value: "America/Denver", label: "Mountain Time (US)" },
  { value: "America/Los_Angeles", label: "Pacific Time (US)" },
  { value: "America/Anchorage", label: "Alaska Time" },
  { value: "Pacific/Honolulu", label: "Hawaii Time" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Asia/Shanghai", label: "Shanghai" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Australia/Sydney", label: "Sydney" },
];

// Recurrence options
const RECURRENCE_OPTIONS = [
  { value: "", label: "Does not repeat" },
  { value: "FREQ=DAILY", label: "Daily" },
  { value: "FREQ=WEEKLY", label: "Weekly" },
  { value: "FREQ=MONTHLY", label: "Monthly" },
  { value: "FREQ=YEARLY", label: "Yearly" },
  { value: "custom", label: "Custom..." },
];

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEventCreated?: (event: CalendarEvent) => void;
  defaultStartTime?: Date;
}

export function CreateEventDialog({
  open,
  onOpenChange,
  onEventCreated,
  defaultStartTime,
}: CreateEventDialogProps) {
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [recurrence, setRecurrence] = useState("");
  const [customRecurrence, setCustomRecurrence] = useState("");
  const [showCustomRecurrence, setShowCustomRecurrence] = useState(false);
  const [generateMeetingLink, setGenerateMeetingLink] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Meeting room state
  const [rooms, setRooms] = useState<MeetingRoomWithAvailability[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [roomsLoading, setRoomsLoading] = useState(false);

  // Attendee selection state
  const [attendeeQuery, setAttendeeQuery] = useState("");
  const [attendeeResults, setAttendeeResults] = useState<UserSearchResult[]>([]);
  const [selectedAttendees, setSelectedAttendees] = useState<UserSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Detect user's timezone on mount
  useEffect(() => {
    try {
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (TIMEZONES.some((tz) => tz.value === userTimezone)) {
        setTimezone(userTimezone);
      }
    } catch {
      // Fallback to UTC
    }
  }, []);

  // Load calendars when dialog opens
  useEffect(() => {
    if (open) {
      loadCalendars();
    }
  }, [open]);

  // Load room availability when times change
  const loadRoomsWithAvailability = useCallback(async () => {
    if (!startTime || !endTime) return;

    setRoomsLoading(true);
    try {
      const startISO = new Date(startTime).toISOString();
      const endISO = new Date(endTime).toISOString();
      const response = await api.getRoomsWithAvailability(startISO, endISO);
      setRooms(response.rooms);
    } catch (err) {
      console.error("Failed to load room availability:", err);
      // Fallback to basic room list without availability
      try {
        const response = await api.getMeetingRooms();
        setRooms(response.rooms.map((r) => ({ ...r, available: true })));
      } catch {
        setRooms([]);
      }
    } finally {
      setRoomsLoading(false);
    }
  }, [startTime, endTime]);

  useEffect(() => {
    if (open && startTime && endTime) {
      loadRoomsWithAvailability();
    }
  }, [open, startTime, endTime, loadRoomsWithAvailability]);

  // Clear form when dialog closes
  useEffect(() => {
    if (!open) {
      setTitle("");
      setDescription("");
      setStartTime("");
      setEndTime("");
      setLocation("");
      setError(null);
      setAttendeeQuery("");
      setAttendeeResults([]);
      setSelectedAttendees([]);
      setShowDropdown(false);
      setSelectedRoomId("");
      setRecurrence("");
      setCustomRecurrence("");
      setShowCustomRecurrence(false);
      setGenerateMeetingLink(false);
    }
  }, [open]);

  // Search for users when attendee query changes
  useEffect(() => {
    const searchUsers = async () => {
      if (attendeeQuery.trim().length < 1) {
        setAttendeeResults([]);
        setShowDropdown(false);
        return;
      }

      setSearchLoading(true);
      try {
        const response = await api.searchUsers(attendeeQuery.trim());
        // Filter out already selected attendees
        const selectedIds = new Set(selectedAttendees.map((a) => a.id));
        const filtered = response.users.filter((u) => !selectedIds.has(u.id));
        setAttendeeResults(filtered);
        setShowDropdown(filtered.length > 0);
      } catch (err) {
        console.error("Failed to search users:", err);
        setAttendeeResults([]);
      } finally {
        setSearchLoading(false);
      }
    };

    const debounce = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounce);
  }, [attendeeQuery, selectedAttendees]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function loadCalendars() {
    try {
      const response = await api.getCalendars();
      setCalendars(response.calendars);
      // Select first calendar by default
      if (response.calendars.length > 0 && !selectedCalendarId) {
        setSelectedCalendarId(response.calendars[0].id);
      }
    } catch (err) {
      console.error("Failed to load calendars:", err);
    }
  }

  function addAttendee(user: UserSearchResult) {
    setSelectedAttendees((prev) => [...prev, user]);
    setAttendeeQuery("");
    setAttendeeResults([]);
    setShowDropdown(false);
  }

  function removeAttendee(userId: string) {
    setSelectedAttendees((prev) => prev.filter((a) => a.id !== userId));
  }

  function handleRecurrenceChange(value: string) {
    if (value === "custom") {
      setShowCustomRecurrence(true);
      setRecurrence("");
    } else {
      setShowCustomRecurrence(false);
      setCustomRecurrence("");
      setRecurrence(value);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Basic validation
    if (!title.trim() || !startTime || !endTime || !selectedCalendarId) {
      setError("Please fill in all required fields");
      return;
    }

    // Validate custom recurrence if used
    const finalRecurrence = showCustomRecurrence ? customRecurrence.trim() : recurrence;
    if (showCustomRecurrence && !customRecurrence.trim()) {
      setError("Please enter a custom recurrence rule or select a preset");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await api.createEvent({
        calendarId: selectedCalendarId,
        title: title.trim(),
        description: description.trim() || undefined,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        location: location.trim() || undefined,
        timezone,
        attendeeIds:
          selectedAttendees.length > 0
            ? selectedAttendees.map((a) => a.id)
            : undefined,
        roomId: selectedRoomId || undefined,
        recurrenceRule: finalRecurrence || undefined,
        generateMeetingLink: generateMeetingLink || undefined,
      });

      toast.success("Event created", {
        description: `"${title.trim()}" has been added to your calendar.`,
      });
      onEventCreated?.(response.event);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create event";
      setError(message);
      toast.error("Failed to create event", { description: message });
    } finally {
      setIsLoading(false);
    }
  }

  // Set default times (next hour, +1 hour) or use prefilled date
  useEffect(() => {
    if (open && !startTime) {
      const base = defaultStartTime ? new Date(defaultStartTime) : new Date();
      if (!defaultStartTime) {
        base.setHours(base.getHours() + 1, 0, 0, 0);
      } else {
        base.setHours(9, 0, 0, 0);
      }
      const start = base.toISOString().slice(0, 16);
      base.setHours(base.getHours() + 1);
      const end = base.toISOString().slice(0, 16);
      setStartTime(start);
      setEndTime(end);
    }
  }, [open, startTime, defaultStartTime]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Event</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Calendar selector */}
          {calendars.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="calendar">Calendar</Label>
              <select
                id="calendar"
                value={selectedCalendarId}
                onChange={(e) => setSelectedCalendarId(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {calendars.map((cal) => (
                  <option key={cal.id} value={cal.id}>
                    {cal.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full px-3 py-2 text-sm border rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[60px] resize-y"
            />
          </div>

          {/* Start Time and End Time row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startTime">Start Time</Label>
              <Input
                id="startTime"
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime">End Time</Label>
              <Input
                id="endTime"
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Timezone selector */}
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <select
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>

          {/* Recurrence selector */}
          <div className="space-y-2">
            <Label htmlFor="recurrence">Repeat</Label>
            <select
              id="recurrence"
              value={showCustomRecurrence ? "custom" : recurrence}
              onChange={(e) => handleRecurrenceChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {RECURRENCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {showCustomRecurrence && (
              <Input
                id="customRecurrence"
                value={customRecurrence}
                onChange={(e) => setCustomRecurrence(e.target.value)}
                placeholder="e.g., FREQ=WEEKLY;BYDAY=MO,WE,FR"
                className="mt-2"
              />
            )}
          </div>

          {/* Attendees */}
          <div className="space-y-2">
            <Label htmlFor="attendees">Attendees</Label>
            <div className="relative" ref={dropdownRef}>
              <Input
                id="attendees"
                value={attendeeQuery}
                onChange={(e) => setAttendeeQuery(e.target.value)}
                placeholder="Search for people to invite..."
                autoComplete="off"
              />

              {/* Search results dropdown */}
              {showDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-48 overflow-auto">
                  {searchLoading ? (
                    <div className="px-3 py-2 text-sm text-gray-500">
                      Searching...
                    </div>
                  ) : (
                    attendeeResults.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => addAttendee(user)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 focus:bg-gray-100 dark:focus:bg-gray-700 focus:outline-none"
                      >
                        <div className="font-medium">
                          {user.displayName || user.email}
                        </div>
                        <div className="text-xs text-gray-500">{user.email}</div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Selected attendees tags */}
            {selectedAttendees.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedAttendees.map((attendee) => (
                  <span
                    key={attendee.id}
                    data-testid={`attendee-tag-${attendee.id}`}
                    className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full"
                  >
                    {attendee.displayName || attendee.email}
                    <button
                      type="button"
                      data-testid={`remove-attendee-${attendee.id}`}
                      onClick={() => removeAttendee(attendee.id)}
                      className="hover:text-blue-600 dark:hover:text-blue-300"
                      aria-label={`Remove ${attendee.displayName || attendee.email}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Meeting Room with availability */}
          <div className="space-y-2">
            <Label htmlFor="room">Meeting Room</Label>
            <select
              id="room"
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={roomsLoading}
            >
              <option value="">No room (virtual or offsite)</option>
              {rooms.map((room) => (
                <option
                  key={room.id}
                  value={room.id}
                  disabled={!room.available}
                  className={!room.available ? "text-gray-400" : ""}
                >
                  {room.name} ({room.capacity} people){" "}
                  {!room.available && "- Unavailable"}
                </option>
              ))}
            </select>
            {roomsLoading && (
              <p className="text-xs text-gray-500">Checking room availability...</p>
            )}
          </div>

          {/* Video Meeting toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="videoMeeting"
              checked={generateMeetingLink}
              onChange={(e) => setGenerateMeetingLink(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Label htmlFor="videoMeeting" className="cursor-pointer">
              Add video meeting
            </Label>
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Room or address"
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
