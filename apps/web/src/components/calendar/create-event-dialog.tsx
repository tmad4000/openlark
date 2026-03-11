"use client";

import { useState, useEffect, useRef } from "react";
import { api, type CalendarEvent, type Calendar, type UserSearchResult } from "@/lib/api";
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

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEventCreated?: (event: CalendarEvent) => void;
}

export function CreateEventDialog({
  open,
  onOpenChange,
  onEventCreated,
}: CreateEventDialogProps) {
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Attendee selection state
  const [attendeeQuery, setAttendeeQuery] = useState("");
  const [attendeeResults, setAttendeeResults] = useState<UserSearchResult[]>([]);
  const [selectedAttendees, setSelectedAttendees] = useState<UserSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load calendars when dialog opens
  useEffect(() => {
    if (open) {
      loadCalendars();
    }
  }, [open]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Basic validation
    if (!title.trim() || !startTime || !endTime || !selectedCalendarId) {
      setError("Please fill in all required fields");
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
        attendeeIds:
          selectedAttendees.length > 0
            ? selectedAttendees.map((a) => a.id)
            : undefined,
      });

      onEventCreated?.(response.event);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setIsLoading(false);
    }
  }

  // Set default times (next hour, +1 hour)
  useEffect(() => {
    if (open && !startTime) {
      const now = new Date();
      now.setHours(now.getHours() + 1, 0, 0, 0);
      const start = now.toISOString().slice(0, 16);
      now.setHours(now.getHours() + 1);
      const end = now.toISOString().slice(0, 16);
      setStartTime(start);
      setEndTime(end);
    }
  }, [open, startTime]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
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
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
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

          {/* Start Time */}
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

          {/* End Time */}
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
