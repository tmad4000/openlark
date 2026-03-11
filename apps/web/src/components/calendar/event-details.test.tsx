import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { EventDetails } from "./event-details";
import { api, type CalendarEvent, type EventAttendee, type MeetingRoom } from "@/lib/api";

// Mock the api module
vi.mock("@/lib/api", () => ({
  api: {
    getEvent: vi.fn(),
    getEventAttendees: vi.fn(),
    rsvpEvent: vi.fn(),
    getMeetingRooms: vi.fn(),
  },
}));

const mockRooms: MeetingRoom[] = [
  {
    id: "room-1",
    orgId: "org-1",
    name: "Conference Room A",
    capacity: 10,
    equipment: ["projector", "whiteboard"],
    location: "Floor 1",
    floor: "1",
  },
  {
    id: "room-2",
    orgId: "org-1",
    name: "Board Room",
    capacity: 20,
    equipment: ["video conferencing", "screen"],
    location: "Floor 2",
    floor: "2",
  },
];

const mockEvent: CalendarEvent = {
  id: "event-1",
  calendarId: "cal-1",
  title: "Team Meeting",
  description: "Weekly sync to discuss project progress",
  startTime: "2026-03-10T10:00:00Z",
  endTime: "2026-03-10T11:00:00Z",
  timezone: "America/Denver",
  location: "Room A",
  recurrenceRule: null,
  roomId: null,
  creatorId: "user-1",
  isCancelled: false,
  createdAt: "2026-03-01T00:00:00Z",
  updatedAt: "2026-03-01T00:00:00Z",
};

const mockAttendees: EventAttendee[] = [
  {
    id: "att-1",
    eventId: "event-1",
    userId: "user-1",
    rsvp: "yes",
    isRequired: true,
    isOrganizer: true,
    respondedAt: "2026-03-05T00:00:00Z",
    user: { displayName: "Alice", avatarUrl: null },
  },
  {
    id: "att-2",
    eventId: "event-1",
    userId: "user-2",
    rsvp: "pending",
    isRequired: true,
    isOrganizer: false,
    respondedAt: null,
    user: { displayName: "Bob", avatarUrl: null },
  },
  {
    id: "att-3",
    eventId: "event-1",
    userId: "user-3",
    rsvp: "no",
    isRequired: false,
    isOrganizer: false,
    respondedAt: "2026-03-06T00:00:00Z",
    user: { displayName: "Charlie", avatarUrl: null },
  },
];

describe("EventDetails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getMeetingRooms).mockResolvedValue({ rooms: [] });
  });

  it("shows loading state initially", () => {
    vi.mocked(api.getEvent).mockReturnValue(new Promise(() => {}));
    vi.mocked(api.getEventAttendees).mockReturnValue(new Promise(() => {}));

    render(<EventDetails eventId="event-1" currentUserId="user-2" />);

    expect(screen.getByText("Loading event...")).toBeInTheDocument();
  });

  it("renders event details", async () => {
    vi.mocked(api.getEvent).mockResolvedValue({ event: mockEvent });
    vi.mocked(api.getEventAttendees).mockResolvedValue({
      attendees: mockAttendees,
    });

    render(<EventDetails eventId="event-1" currentUserId="user-2" />);

    await waitFor(() => {
      expect(screen.getByText("Team Meeting")).toBeInTheDocument();
      expect(
        screen.getByText("Weekly sync to discuss project progress")
      ).toBeInTheDocument();
      expect(screen.getByText("Room A")).toBeInTheDocument();
    });
  });

  it("shows attendee list with RSVP status", async () => {
    vi.mocked(api.getEvent).mockResolvedValue({ event: mockEvent });
    vi.mocked(api.getEventAttendees).mockResolvedValue({
      attendees: mockAttendees,
    });

    render(<EventDetails eventId="event-1" currentUserId="user-2" />);

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(screen.getByText("Charlie")).toBeInTheDocument();
    });
  });

  it("shows error state on API failure", async () => {
    vi.mocked(api.getEvent).mockRejectedValue(new Error("Network error"));

    render(<EventDetails eventId="event-1" currentUserId="user-2" />);

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("shows RSVP buttons for attendees", async () => {
    vi.mocked(api.getEvent).mockResolvedValue({ event: mockEvent });
    vi.mocked(api.getEventAttendees).mockResolvedValue({
      attendees: mockAttendees,
    });

    render(<EventDetails eventId="event-1" currentUserId="user-2" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /yes/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /no/i })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /maybe/i })
      ).toBeInTheDocument();
    });
  });

  it("sends RSVP when button is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getEvent).mockResolvedValue({ event: mockEvent });
    vi.mocked(api.getEventAttendees).mockResolvedValue({
      attendees: mockAttendees,
    });
    vi.mocked(api.rsvpEvent).mockResolvedValue({
      attendee: { ...mockAttendees[1], rsvp: "yes", respondedAt: new Date().toISOString() },
    });

    render(<EventDetails eventId="event-1" currentUserId="user-2" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /yes/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /yes/i }));

    expect(api.rsvpEvent).toHaveBeenCalledWith("event-1", "yes");
  });

  it("does not show RSVP buttons for non-attendees", async () => {
    vi.mocked(api.getEvent).mockResolvedValue({ event: mockEvent });
    vi.mocked(api.getEventAttendees).mockResolvedValue({
      attendees: mockAttendees,
    });

    render(<EventDetails eventId="event-1" currentUserId="user-999" />);

    await waitFor(() => {
      expect(screen.getByText("Team Meeting")).toBeInTheDocument();
    });

    // RSVP buttons should not be visible for non-attendees
    expect(
      screen.queryByRole("button", { name: /yes/i })
    ).not.toBeInTheDocument();
  });

  it("highlights current user RSVP status", async () => {
    const attendeesWithYes = mockAttendees.map((a) =>
      a.userId === "user-2" ? { ...a, rsvp: "yes" as const } : a
    );
    vi.mocked(api.getEvent).mockResolvedValue({ event: mockEvent });
    vi.mocked(api.getEventAttendees).mockResolvedValue({
      attendees: attendeesWithYes,
    });

    render(<EventDetails eventId="event-1" currentUserId="user-2" />);

    await waitFor(() => {
      const yesButton = screen.getByRole("button", { name: /yes/i });
      // The yes button should be highlighted (we use bg-green-100 for selected yes)
      expect(yesButton).toHaveClass("bg-green-100");
    });
  });

  it("shows organizer badge", async () => {
    vi.mocked(api.getEvent).mockResolvedValue({ event: mockEvent });
    vi.mocked(api.getEventAttendees).mockResolvedValue({
      attendees: mockAttendees,
    });

    render(<EventDetails eventId="event-1" currentUserId="user-2" />);

    await waitFor(() => {
      expect(screen.getByText("Organizer")).toBeInTheDocument();
    });
  });

  it("refetches data when eventId changes", async () => {
    vi.mocked(api.getEvent).mockResolvedValue({ event: mockEvent });
    vi.mocked(api.getEventAttendees).mockResolvedValue({
      attendees: mockAttendees,
    });

    const { rerender } = render(
      <EventDetails eventId="event-1" currentUserId="user-2" />
    );

    await waitFor(() => {
      expect(api.getEvent).toHaveBeenCalledWith("event-1");
    });

    const otherEvent = { ...mockEvent, id: "event-2", title: "Other Event" };
    vi.mocked(api.getEvent).mockResolvedValue({ event: otherEvent });

    rerender(<EventDetails eventId="event-2" currentUserId="user-2" />);

    await waitFor(() => {
      expect(api.getEvent).toHaveBeenCalledWith("event-2");
    });
  });

  // Room display tests (T-004 subtask 3)
  describe("meeting room display", () => {
    it("displays meeting room name when event has roomId", async () => {
      const eventWithRoom = { ...mockEvent, roomId: "room-1" };
      vi.mocked(api.getEvent).mockResolvedValue({ event: eventWithRoom });
      vi.mocked(api.getEventAttendees).mockResolvedValue({
        attendees: mockAttendees,
      });
      vi.mocked(api.getMeetingRooms).mockResolvedValue({ rooms: mockRooms });

      render(<EventDetails eventId="event-1" currentUserId="user-2" />);

      await waitFor(() => {
        expect(screen.getByText("Conference Room A")).toBeInTheDocument();
      });
    });

    it("displays room capacity", async () => {
      const eventWithRoom = { ...mockEvent, roomId: "room-1" };
      vi.mocked(api.getEvent).mockResolvedValue({ event: eventWithRoom });
      vi.mocked(api.getEventAttendees).mockResolvedValue({
        attendees: mockAttendees,
      });
      vi.mocked(api.getMeetingRooms).mockResolvedValue({ rooms: mockRooms });

      render(<EventDetails eventId="event-1" currentUserId="user-2" />);

      await waitFor(() => {
        expect(screen.getByText(/10 people/)).toBeInTheDocument();
      });
    });

    it("does not show room section when no roomId", async () => {
      vi.mocked(api.getEvent).mockResolvedValue({ event: mockEvent });
      vi.mocked(api.getEventAttendees).mockResolvedValue({
        attendees: mockAttendees,
      });

      render(<EventDetails eventId="event-1" currentUserId="user-2" />);

      await waitFor(() => {
        expect(screen.getByText("Team Meeting")).toBeInTheDocument();
      });

      // Should not show "Meeting Room" label when no room
      expect(screen.queryByText("Meeting Room")).not.toBeInTheDocument();
    });
  });
});
