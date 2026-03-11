"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import {
  X,
  Calendar,
  Clock,
  MapPin,
  Users,
  Video,
  Repeat,
  Search,
  Check,
  ChevronDown,
  Loader2,
  Building2,
} from "lucide-react";

interface User {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface MeetingRoom {
  id: string;
  name: string;
  capacity: number | null;
  equipment: string[] | null;
  location: string | null;
  floor: string | null;
  isAvailable: boolean;
  conflicts: Array<{
    eventId: string;
    title: string;
    start: string;
    end: string;
  }>;
}

interface EventCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate?: Date;
  onEventCreated?: () => void;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

// Common timezones
const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Central European (CET)" },
  { value: "Europe/Berlin", label: "Berlin (CET)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Asia/Shanghai", label: "China (CST)" },
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST)" },
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

function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeForInput(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function EventCreationDialog({
  open,
  onOpenChange,
  initialDate,
  onEventCreated,
}: EventCreationDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("10:00");
  const [timezone, setTimezone] = useState("UTC");
  const [recurrence, setRecurrence] = useState("");
  const [addVideoMeeting, setAddVideoMeeting] = useState(false);
  const [isAllDay, setIsAllDay] = useState(false);

  // Attendees
  const [attendees, setAttendees] = useState<User[]>([]);
  const [attendeeSearch, setAttendeeSearch] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showAttendeePicker, setShowAttendeePicker] = useState(false);

  // Meeting rooms
  const [rooms, setRooms] = useState<MeetingRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [showRoomPicker, setShowRoomPicker] = useState(false);

  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTimezoneDropdown, setShowTimezoneDropdown] = useState(false);
  const [showRecurrenceDropdown, setShowRecurrenceDropdown] = useState(false);

  // Initialize dates when dialog opens
  useEffect(() => {
    if (open) {
      const date = initialDate || new Date();
      setStartDate(formatDateForInput(date));
      setEndDate(formatDateForInput(date));

      // Try to detect user's timezone
      try {
        const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (TIMEZONES.find((tz) => tz.value === userTimezone)) {
          setTimezone(userTimezone);
        }
      } catch {
        // Keep default UTC
      }
    }
  }, [open, initialDate]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setTitle("");
      setDescription("");
      setLocation("");
      setStartTime("09:00");
      setEndTime("10:00");
      setRecurrence("");
      setAddVideoMeeting(false);
      setIsAllDay(false);
      setAttendees([]);
      setSelectedRoom(null);
      setError(null);
    }
  }, [open]);

  // Search for users
  const searchUsers = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    const token = getCookie("session_token");
    if (!token) return;

    setIsSearching(true);
    try {
      const res = await fetch(`/api/contacts?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.contacts || []);
      }
    } catch (err) {
      console.error("Failed to search users:", err);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (attendeeSearch) {
        searchUsers(attendeeSearch);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [attendeeSearch, searchUsers]);

  // Fetch available rooms
  const fetchRooms = useCallback(async () => {
    const token = getCookie("session_token");
    if (!token || !startDate || !startTime || !endDate || !endTime) return;

    setIsLoadingRooms(true);
    try {
      const start = new Date(`${startDate}T${startTime}:00`);
      const end = new Date(`${endDate}T${endTime}:00`);

      const res = await fetch(
        `/api/meeting-rooms?start=${start.toISOString()}&end=${end.toISOString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (res.ok) {
        const data = await res.json();
        setRooms(data.rooms || []);
      }
    } catch (err) {
      console.error("Failed to fetch rooms:", err);
    } finally {
      setIsLoadingRooms(false);
    }
  }, [startDate, startTime, endDate, endTime]);

  // Fetch rooms when time changes
  useEffect(() => {
    if (showRoomPicker) {
      fetchRooms();
    }
  }, [fetchRooms, showRoomPicker]);

  // Add attendee
  const addAttendee = (user: User) => {
    if (!attendees.find((a) => a.id === user.id)) {
      setAttendees([...attendees, user]);
    }
    setAttendeeSearch("");
    setSearchResults([]);
  };

  // Remove attendee
  const removeAttendee = (userId: string) => {
    setAttendees(attendees.filter((a) => a.id !== userId));
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    if (!startDate || !endDate) {
      setError("Start and end dates are required");
      return;
    }

    const token = getCookie("session_token");
    if (!token) {
      setError("Not authenticated");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Build start/end times
      const startDateTime = isAllDay
        ? new Date(`${startDate}T00:00:00`)
        : new Date(`${startDate}T${startTime}:00`);

      const endDateTime = isAllDay
        ? new Date(`${endDate}T23:59:59`)
        : new Date(`${endDate}T${endTime}:00`);

      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || undefined,
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        timezone,
        location: location.trim() || undefined,
        attendee_ids: attendees.map((a) => a.id),
        room_id: selectedRoom || undefined,
        recurrence_rule: recurrence || undefined,
        settings: {
          isAllDay,
          conferenceLink: addVideoMeeting
            ? `https://meet.openlark.app/${crypto.randomUUID()}`
            : undefined,
        },
      };

      const res = await fetch("/api/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create event");
      }

      // Success!
      onOpenChange(false);
      onEventCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter out already added attendees from search results
  const filteredResults = useMemo(() => {
    const addedIds = new Set(attendees.map((a) => a.id));
    return searchResults.filter((u) => !addedIds.has(u.id));
  }, [searchResults, attendees]);

  const selectedRoomData = rooms.find((r) => r.id === selectedRoom);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl z-50 w-full max-w-2xl max-h-[90vh] overflow-hidden">
          <form onSubmit={handleSubmit} className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <Dialog.Title className="text-lg font-semibold text-gray-900">
                Create Event
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </Dialog.Close>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              {/* Error message */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Title */}
              <div>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Add title"
                  className="w-full text-xl font-medium text-gray-900 placeholder-gray-400 border-0 border-b-2 border-gray-200 focus:border-blue-500 focus:ring-0 pb-2 outline-none"
                />
              </div>

              {/* Date and Time */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-gray-400" />
                  <div className="flex-1 flex items-center gap-2 flex-wrap">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        // Auto-set end date if not set or before start
                        if (!endDate || e.target.value > endDate) {
                          setEndDate(e.target.value);
                        }
                      }}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                    {!isAllDay && (
                      <>
                        <input
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                        <span className="text-gray-400">to</span>
                        <input
                          type="time"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                      </>
                    )}
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={startDate}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                {/* All day toggle */}
                <div className="flex items-center gap-3 ml-8">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isAllDay}
                      onChange={(e) => setIsAllDay(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">All day</span>
                  </label>
                </div>
              </div>

              {/* Timezone */}
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-gray-400" />
                <Popover.Root
                  open={showTimezoneDropdown}
                  onOpenChange={setShowTimezoneDropdown}
                >
                  <Popover.Trigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      {TIMEZONES.find((tz) => tz.value === timezone)?.label ||
                        timezone}
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      className="bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 max-h-60 overflow-y-auto"
                      sideOffset={5}
                    >
                      {TIMEZONES.map((tz) => (
                        <button
                          key={tz.value}
                          type="button"
                          onClick={() => {
                            setTimezone(tz.value);
                            setShowTimezoneDropdown(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center justify-between ${
                            timezone === tz.value
                              ? "text-blue-600 bg-blue-50"
                              : "text-gray-700"
                          }`}
                        >
                          {tz.label}
                          {timezone === tz.value && (
                            <Check className="w-4 h-4" />
                          )}
                        </button>
                      ))}
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              </div>

              {/* Recurrence */}
              <div className="flex items-center gap-3">
                <Repeat className="w-5 h-5 text-gray-400" />
                <Popover.Root
                  open={showRecurrenceDropdown}
                  onOpenChange={setShowRecurrenceDropdown}
                >
                  <Popover.Trigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      {RECURRENCE_OPTIONS.find((r) => r.value === recurrence)
                        ?.label || "Does not repeat"}
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      className="bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
                      sideOffset={5}
                    >
                      {RECURRENCE_OPTIONS.filter((r) => r.value !== "custom").map(
                        (option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              setRecurrence(option.value);
                              setShowRecurrenceDropdown(false);
                            }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center justify-between ${
                              recurrence === option.value
                                ? "text-blue-600 bg-blue-50"
                                : "text-gray-700"
                            }`}
                          >
                            {option.label}
                            {recurrence === option.value && (
                              <Check className="w-4 h-4" />
                            )}
                          </button>
                        )
                      )}
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              </div>

              {/* Location */}
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Add location"
                  className="flex-1 px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>

              {/* Meeting Room */}
              <div className="flex items-start gap-3">
                <Building2 className="w-5 h-5 text-gray-400 mt-2" />
                <div className="flex-1">
                  <Popover.Root
                    open={showRoomPicker}
                    onOpenChange={setShowRoomPicker}
                  >
                    <Popover.Trigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        {selectedRoomData ? (
                          <span className="flex items-center gap-2">
                            <span>{selectedRoomData.name}</span>
                            {selectedRoomData.capacity && (
                              <span className="text-gray-400">
                                ({selectedRoomData.capacity} people)
                              </span>
                            )}
                          </span>
                        ) : (
                          "Book a room"
                        )}
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      </button>
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content
                        className="bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 w-80 max-h-60 overflow-y-auto"
                        sideOffset={5}
                      >
                        {isLoadingRooms ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                          </div>
                        ) : rooms.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-gray-500">
                            No meeting rooms available
                          </div>
                        ) : (
                          <>
                            {/* Option to clear selection */}
                            {selectedRoom && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedRoom(null);
                                  setShowRoomPicker(false);
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 border-b border-gray-100"
                              >
                                No room
                              </button>
                            )}
                            {rooms.map((room) => (
                              <button
                                key={room.id}
                                type="button"
                                onClick={() => {
                                  if (room.isAvailable) {
                                    setSelectedRoom(room.id);
                                    setShowRoomPicker(false);
                                  }
                                }}
                                disabled={!room.isAvailable}
                                className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                                  !room.isAvailable
                                    ? "opacity-50 cursor-not-allowed"
                                    : ""
                                } ${
                                  selectedRoom === room.id
                                    ? "bg-blue-50 text-blue-600"
                                    : "text-gray-700"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-medium">
                                    {room.name}
                                  </span>
                                  {selectedRoom === room.id && (
                                    <Check className="w-4 h-4" />
                                  )}
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                  {room.capacity && `${room.capacity} people`}
                                  {room.location &&
                                    ` · ${room.location}${room.floor ? `, ${room.floor}` : ""}`}
                                </div>
                                {!room.isAvailable && (
                                  <div className="text-xs text-red-500 mt-1">
                                    Booked: {room.conflicts[0]?.title}
                                  </div>
                                )}
                              </button>
                            ))}
                          </>
                        )}
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
                </div>
              </div>

              {/* Video Meeting Toggle */}
              <div className="flex items-center gap-3">
                <Video className="w-5 h-5 text-gray-400" />
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addVideoMeeting}
                    onChange={(e) => setAddVideoMeeting(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">
                    Add video meeting
                  </span>
                </label>
                {addVideoMeeting && (
                  <span className="text-xs text-gray-500">
                    A meeting link will be generated
                  </span>
                )}
              </div>

              {/* Attendees */}
              <div className="flex items-start gap-3">
                <Users className="w-5 h-5 text-gray-400 mt-2" />
                <div className="flex-1">
                  <Popover.Root
                    open={showAttendeePicker}
                    onOpenChange={setShowAttendeePicker}
                  >
                    <Popover.Trigger asChild>
                      <div className="border border-gray-300 rounded-lg p-2 min-h-[44px] cursor-text focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                        <div className="flex flex-wrap gap-2">
                          {attendees.map((user) => (
                            <div
                              key={user.id}
                              className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-sm"
                            >
                              <span>{user.displayName || user.email}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeAttendee(user.id);
                                }}
                                className="w-4 h-4 flex items-center justify-center hover:bg-blue-200 rounded-full"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                          <input
                            type="text"
                            value={attendeeSearch}
                            onChange={(e) => {
                              setAttendeeSearch(e.target.value);
                              if (!showAttendeePicker) {
                                setShowAttendeePicker(true);
                              }
                            }}
                            onFocus={() => setShowAttendeePicker(true)}
                            placeholder={
                              attendees.length === 0 ? "Add attendees" : ""
                            }
                            className="flex-1 min-w-[120px] text-sm border-0 focus:ring-0 outline-none p-1"
                          />
                        </div>
                      </div>
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content
                        className="bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 w-80 max-h-60 overflow-y-auto"
                        sideOffset={5}
                        onOpenAutoFocus={(e) => e.preventDefault()}
                      >
                        {isSearching ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                          </div>
                        ) : filteredResults.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-gray-500">
                            {attendeeSearch
                              ? "No users found"
                              : "Search for users to add"}
                          </div>
                        ) : (
                          filteredResults.map((user) => (
                            <button
                              key={user.id}
                              type="button"
                              onClick={() => {
                                addAttendee(user);
                              }}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center gap-3"
                            >
                              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
                                {user.displayName?.charAt(0).toUpperCase() ||
                                  user.email.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-gray-900 truncate">
                                  {user.displayName || user.email}
                                </div>
                                {user.displayName && (
                                  <div className="text-xs text-gray-500 truncate">
                                    {user.email}
                                  </div>
                                )}
                              </div>
                            </button>
                          ))
                        )}
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
                </div>
              </div>

              {/* Description */}
              <div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add description"
                  rows={3}
                  className="w-full px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={isSubmitting || !title.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
              >
                {isSubmitting && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                Save
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
