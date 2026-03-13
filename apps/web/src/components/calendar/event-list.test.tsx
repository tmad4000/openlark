import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventList } from "./event-list";
import { api, type CalendarEvent } from "@/lib/api";

// Mock the api module
vi.mock("@/lib/api", () => ({
  api: {
    getEvents: vi.fn(),
  },
}));

const mockEvents: CalendarEvent[] = [
  {
    id: "event-1",
    calendarId: "cal-1",
    title: "Team Meeting",
    description: "Weekly sync",
    startTime: "2026-03-10T10:00:00Z",
    endTime: "2026-03-10T11:00:00Z",
    timezone: "America/Denver",
    location: "Room A",
    recurrenceRule: null,
    roomId: null,
    meetingLink: null,
    creatorId: "user-1",
    isCancelled: false,
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-03-01T00:00:00Z",
  },
  {
    id: "event-2",
    calendarId: "cal-1",
    title: "Project Review",
    description: null,
    startTime: "2026-03-10T14:00:00Z",
    endTime: "2026-03-10T15:30:00Z",
    timezone: "America/Denver",
    location: null,
    recurrenceRule: null,
    roomId: null,
    meetingLink: null,
    creatorId: "user-1",
    isCancelled: false,
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-03-01T00:00:00Z",
  },
];

describe("EventList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    vi.mocked(api.getEvents).mockReturnValue(new Promise(() => {}));

    render(<EventList />);

    expect(screen.getByText("Loading events...")).toBeInTheDocument();
  });

  it("shows empty state when no events", async () => {
    vi.mocked(api.getEvents).mockResolvedValue({ events: [] });

    render(<EventList />);

    await waitFor(() => {
      expect(screen.getByText("No events scheduled")).toBeInTheDocument();
    });
  });

  it("renders events list", async () => {
    vi.mocked(api.getEvents).mockResolvedValue({ events: mockEvents });

    render(<EventList />);

    await waitFor(() => {
      expect(screen.getByText("Team Meeting")).toBeInTheDocument();
      expect(screen.getByText("Project Review")).toBeInTheDocument();
    });
  });

  it("shows event time and location", async () => {
    vi.mocked(api.getEvents).mockResolvedValue({ events: mockEvents });

    render(<EventList />);

    await waitFor(() => {
      expect(screen.getByText("Room A")).toBeInTheDocument();
    });
  });

  it("shows error state on API failure", async () => {
    vi.mocked(api.getEvents).mockRejectedValue(new Error("Network error"));

    render(<EventList />);

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("calls onSelectEvent when event is clicked", async () => {
    vi.mocked(api.getEvents).mockResolvedValue({ events: mockEvents });
    const onSelectEvent = vi.fn();

    render(<EventList onSelectEvent={onSelectEvent} />);

    await waitFor(() => {
      expect(screen.getByText("Team Meeting")).toBeInTheDocument();
    });

    screen.getByText("Team Meeting").click();

    expect(onSelectEvent).toHaveBeenCalledWith(mockEvents[0]);
  });

  it("highlights selected event", async () => {
    vi.mocked(api.getEvents).mockResolvedValue({ events: mockEvents });

    render(<EventList selectedEventId="event-1" />);

    await waitFor(() => {
      const eventItem = screen.getByText("Team Meeting").closest("button");
      expect(eventItem).toHaveClass("bg-blue-50");
    });
  });
});
