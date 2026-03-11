import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateEventDialog } from "./create-event-dialog";
import { api, type CalendarEvent, type EventAttendee, type Calendar } from "@/lib/api";

// Mock the api module
vi.mock("@/lib/api", () => ({
  api: {
    getCalendars: vi.fn(),
    createEvent: vi.fn(),
    searchUsers: vi.fn(),
  },
}));

const mockCalendars: Calendar[] = [
  {
    id: "cal-1",
    orgId: "org-1",
    ownerId: "user-1",
    type: "personal",
    name: "My Calendar",
    color: "#3B82F6",
    description: null,
    isDefault: true,
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-03-01T00:00:00Z",
  },
];

const mockEvent: CalendarEvent = {
  id: "event-1",
  calendarId: "cal-1",
  title: "New Meeting",
  description: null,
  startTime: "2026-03-10T10:00:00Z",
  endTime: "2026-03-10T11:00:00Z",
  timezone: "America/Denver",
  location: null,
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
    respondedAt: null,
  },
];

describe("CreateEventDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getCalendars).mockResolvedValue({ calendars: mockCalendars });
  });

  it("renders dialog when open", () => {
    render(<CreateEventDialog open={true} onOpenChange={() => {}} />);

    expect(screen.getByText("Create Event")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<CreateEventDialog open={false} onOpenChange={() => {}} />);

    expect(screen.queryByText("Create Event")).not.toBeInTheDocument();
  });

  it("shows form fields", async () => {
    render(<CreateEventDialog open={true} onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Title")).toBeInTheDocument();
      expect(screen.getByLabelText("Start Time")).toBeInTheDocument();
      expect(screen.getByLabelText("End Time")).toBeInTheDocument();
    });
  });

  it("requires title to submit", async () => {
    render(<CreateEventDialog open={true} onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Title")).toBeInTheDocument();
    });

    const submitButton = screen.getByRole("button", { name: /create/i });
    fireEvent.click(submitButton);

    // Should not call API without title
    expect(api.createEvent).not.toHaveBeenCalled();
  });

  it("creates event with form data", async () => {
    vi.mocked(api.createEvent).mockResolvedValue({
      event: mockEvent,
      attendees: mockAttendees,
    });
    const onEventCreated = vi.fn();

    render(
      <CreateEventDialog
        open={true}
        onOpenChange={() => {}}
        onEventCreated={onEventCreated}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Title")).toBeInTheDocument();
    });

    // Fill in form
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "New Meeting" },
    });

    // Get date inputs
    const startTimeInput = screen.getByLabelText("Start Time");
    const endTimeInput = screen.getByLabelText("End Time");

    fireEvent.change(startTimeInput, {
      target: { value: "2026-03-10T10:00" },
    });
    fireEvent.change(endTimeInput, {
      target: { value: "2026-03-10T11:00" },
    });

    // Submit
    const submitButton = screen.getByRole("button", { name: /create/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(api.createEvent).toHaveBeenCalled();
      expect(onEventCreated).toHaveBeenCalledWith(mockEvent);
    });
  });

  it("shows error message on failure", async () => {
    vi.mocked(api.createEvent).mockRejectedValue(new Error("Failed to create event"));

    render(<CreateEventDialog open={true} onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Title")).toBeInTheDocument();
    });

    // Fill in required fields
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "New Meeting" },
    });
    fireEvent.change(screen.getByLabelText("Start Time"), {
      target: { value: "2026-03-10T10:00" },
    });
    fireEvent.change(screen.getByLabelText("End Time"), {
      target: { value: "2026-03-10T11:00" },
    });

    // Submit
    const submitButton = screen.getByRole("button", { name: /create/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Failed to create event")).toBeInTheDocument();
    });
  });

  it("shows loading state during submission", async () => {
    vi.mocked(api.createEvent).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ event: mockEvent, attendees: mockAttendees }), 100))
    );

    render(<CreateEventDialog open={true} onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Title")).toBeInTheDocument();
    });

    // Fill in required fields
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "New Meeting" },
    });
    fireEvent.change(screen.getByLabelText("Start Time"), {
      target: { value: "2026-03-10T10:00" },
    });
    fireEvent.change(screen.getByLabelText("End Time"), {
      target: { value: "2026-03-10T11:00" },
    });

    // Submit
    const submitButton = screen.getByRole("button", { name: /create/i });
    fireEvent.click(submitButton);

    expect(screen.getByText("Creating...")).toBeInTheDocument();
  });

  it("clears form when dialog closes", async () => {
    const onOpenChange = vi.fn();

    const { rerender } = render(
      <CreateEventDialog open={true} onOpenChange={onOpenChange} />
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Title")).toBeInTheDocument();
    });

    // Fill in form
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "New Meeting" },
    });

    // Close dialog
    rerender(<CreateEventDialog open={false} onOpenChange={onOpenChange} />);

    // Reopen
    rerender(<CreateEventDialog open={true} onOpenChange={onOpenChange} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Title")).toHaveValue("");
    });
  });

  it("shows attendees input field", async () => {
    render(<CreateEventDialog open={true} onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Attendees")).toBeInTheDocument();
    });
  });

  it("adds attendees and displays them as tags", async () => {
    const mockUsers = [
      { id: "user-2", displayName: "Jane Doe", email: "jane@example.com" },
    ];
    vi.mocked(api.searchUsers).mockResolvedValue({ users: mockUsers });

    render(<CreateEventDialog open={true} onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Attendees")).toBeInTheDocument();
    });

    // Type to search for users
    const attendeesInput = screen.getByLabelText("Attendees");
    fireEvent.change(attendeesInput, { target: { value: "jane" } });

    // Wait for search results to appear
    await waitFor(() => {
      expect(api.searchUsers).toHaveBeenCalledWith("jane");
    });

    // Wait for dropdown to show
    await waitFor(() => {
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    });

    // Click to add the user
    fireEvent.click(screen.getByText("Jane Doe"));

    // Verify the user appears as a tag
    expect(screen.getByTestId("attendee-tag-user-2")).toBeInTheDocument();
  });

  it("removes attendee when clicking remove button", async () => {
    const mockUsers = [
      { id: "user-2", displayName: "Jane Doe", email: "jane@example.com" },
    ];
    vi.mocked(api.searchUsers).mockResolvedValue({ users: mockUsers });

    render(<CreateEventDialog open={true} onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Attendees")).toBeInTheDocument();
    });

    // Type and select a user
    const attendeesInput = screen.getByLabelText("Attendees");
    fireEvent.change(attendeesInput, { target: { value: "jane" } });

    await waitFor(() => {
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Jane Doe"));

    // Verify tag is added
    expect(screen.getByTestId("attendee-tag-user-2")).toBeInTheDocument();

    // Remove the attendee
    const removeButton = screen.getByTestId("remove-attendee-user-2");
    fireEvent.click(removeButton);

    // Verify tag is removed
    expect(screen.queryByTestId("attendee-tag-user-2")).not.toBeInTheDocument();
  });

  it("includes attendeeIds when creating event with attendees", async () => {
    const mockUsers = [
      { id: "user-2", displayName: "Jane Doe", email: "jane@example.com" },
    ];
    vi.mocked(api.searchUsers).mockResolvedValue({ users: mockUsers });
    vi.mocked(api.createEvent).mockResolvedValue({
      event: mockEvent,
      attendees: mockAttendees,
    });
    const onEventCreated = vi.fn();

    render(
      <CreateEventDialog
        open={true}
        onOpenChange={() => {}}
        onEventCreated={onEventCreated}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Title")).toBeInTheDocument();
    });

    // Fill in form
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Team Meeting" },
    });
    fireEvent.change(screen.getByLabelText("Start Time"), {
      target: { value: "2026-03-10T10:00" },
    });
    fireEvent.change(screen.getByLabelText("End Time"), {
      target: { value: "2026-03-10T11:00" },
    });

    // Add an attendee
    const attendeesInput = screen.getByLabelText("Attendees");
    fireEvent.change(attendeesInput, { target: { value: "jane" } });

    await waitFor(() => {
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Jane Doe"));

    // Submit
    const submitButton = screen.getByRole("button", { name: /create/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(api.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Team Meeting",
          attendeeIds: ["user-2"],
        })
      );
    });
  });
});
