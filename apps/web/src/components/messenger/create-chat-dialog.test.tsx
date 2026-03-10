import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreateChatDialog } from "./create-chat-dialog";
import { api } from "@/lib/api";

// Mock the API
vi.mock("@/lib/api", () => ({
  api: {
    createChat: vi.fn(),
  },
}));

describe("CreateChatDialog", () => {
  const mockOnChatCreated = vi.fn();
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the dialog when open", () => {
    render(
      <CreateChatDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onChatCreated={mockOnChatCreated}
      />
    );

    expect(screen.getByText("New Conversation")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not render content when closed", () => {
    render(
      <CreateChatDialog
        open={false}
        onOpenChange={mockOnOpenChange}
        onChatCreated={mockOnChatCreated}
      />
    );

    expect(screen.queryByText("New Conversation")).not.toBeInTheDocument();
  });

  it("has DM type selected by default", () => {
    render(
      <CreateChatDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onChatCreated={mockOnChatCreated}
      />
    );

    const dmRadio = screen.getByLabelText("Direct Message") as HTMLInputElement;
    expect(dmRadio.checked).toBe(true);
  });

  it("shows group name input when group type is selected", () => {
    render(
      <CreateChatDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onChatCreated={mockOnChatCreated}
      />
    );

    // Initially no group name field
    expect(screen.queryByLabelText("Group Name")).not.toBeInTheDocument();

    // Click group radio
    const groupRadio = screen.getByLabelText("Group Chat");
    fireEvent.click(groupRadio);

    // Now group name field should be visible
    expect(screen.getByLabelText("Group Name")).toBeInTheDocument();
  });

  it("disables submit button when user ID is empty", () => {
    render(
      <CreateChatDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onChatCreated={mockOnChatCreated}
      />
    );

    const submitButton = screen.getByRole("button", { name: /create/i });
    expect(submitButton).toBeDisabled();
  });

  it("enables submit button when user ID is entered", () => {
    render(
      <CreateChatDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onChatCreated={mockOnChatCreated}
      />
    );

    const userIdInput = screen.getByLabelText("User ID");
    fireEvent.change(userIdInput, { target: { value: "user-123" } });

    const submitButton = screen.getByRole("button", { name: /create/i });
    expect(submitButton).toBeEnabled();
  });

  it("calls api.createChat with correct params for DM", async () => {
    (api.createChat as Mock).mockResolvedValueOnce({
      chat: { id: "chat-1", type: "dm", name: null },
      members: [],
    });

    render(
      <CreateChatDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onChatCreated={mockOnChatCreated}
      />
    );

    const userIdInput = screen.getByLabelText("User ID");
    fireEvent.change(userIdInput, { target: { value: "user-123" } });

    const submitButton = screen.getByRole("button", { name: /create/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(api.createChat).toHaveBeenCalledWith({
        type: "dm",
        memberIds: ["user-123"],
      });
    });

    expect(mockOnChatCreated).toHaveBeenCalledWith({
      id: "chat-1",
      type: "dm",
      name: null,
    });
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls api.createChat with correct params for group", async () => {
    (api.createChat as Mock).mockResolvedValueOnce({
      chat: { id: "chat-2", type: "group", name: "Test Group" },
      members: [],
    });

    render(
      <CreateChatDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onChatCreated={mockOnChatCreated}
      />
    );

    // Switch to group type
    const groupRadio = screen.getByLabelText("Group Chat");
    fireEvent.click(groupRadio);

    // Enter group name
    const groupNameInput = screen.getByLabelText("Group Name");
    fireEvent.change(groupNameInput, { target: { value: "Test Group" } });

    // Enter user ID
    const userIdInput = screen.getByLabelText("Member User IDs");
    fireEvent.change(userIdInput, { target: { value: "user-1, user-2" } });

    const submitButton = screen.getByRole("button", { name: /create/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(api.createChat).toHaveBeenCalledWith({
        type: "group",
        memberIds: ["user-1", "user-2"],
        name: "Test Group",
      });
    });

    expect(mockOnChatCreated).toHaveBeenCalled();
  });

  it("displays error message when api call fails", async () => {
    (api.createChat as Mock).mockRejectedValueOnce(new Error("User not found"));

    render(
      <CreateChatDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onChatCreated={mockOnChatCreated}
      />
    );

    const userIdInput = screen.getByLabelText("User ID");
    fireEvent.change(userIdInput, { target: { value: "invalid-user" } });

    const submitButton = screen.getByRole("button", { name: /create/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("User not found")).toBeInTheDocument();
    });

    expect(mockOnChatCreated).not.toHaveBeenCalled();
    expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("shows loading state during submission", async () => {
    let resolvePromise: (value: unknown) => void;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    (api.createChat as Mock).mockReturnValueOnce(promise);

    render(
      <CreateChatDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onChatCreated={mockOnChatCreated}
      />
    );

    const userIdInput = screen.getByLabelText("User ID");
    fireEvent.change(userIdInput, { target: { value: "user-123" } });

    const submitButton = screen.getByRole("button", { name: /create/i });
    fireEvent.click(submitButton);

    // Button should show loading state
    expect(screen.getByText(/creating/i)).toBeInTheDocument();
    expect(submitButton).toBeDisabled();

    // Resolve the promise
    resolvePromise!({
      chat: { id: "chat-1", type: "dm" },
      members: [],
    });

    await waitFor(() => {
      expect(mockOnChatCreated).toHaveBeenCalled();
    });
  });

  it("clears form when dialog closes", async () => {
    const { rerender } = render(
      <CreateChatDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onChatCreated={mockOnChatCreated}
      />
    );

    const userIdInput = screen.getByLabelText("User ID");
    fireEvent.change(userIdInput, { target: { value: "user-123" } });

    // Close the dialog
    rerender(
      <CreateChatDialog
        open={false}
        onOpenChange={mockOnOpenChange}
        onChatCreated={mockOnChatCreated}
      />
    );

    // Re-open
    rerender(
      <CreateChatDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onChatCreated={mockOnChatCreated}
      />
    );

    // Form should be cleared
    const newUserIdInput = screen.getByLabelText("User ID") as HTMLInputElement;
    expect(newUserIdInput.value).toBe("");
  });
});
