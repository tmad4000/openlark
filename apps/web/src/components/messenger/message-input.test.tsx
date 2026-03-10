import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageInput } from "./message-input";

// Mock the API
vi.mock("@/lib/api", () => ({
  api: {
    sendMessage: vi.fn(),
  },
}));

import { api } from "@/lib/api";

describe("MessageInput", () => {
  const mockOnMessageSent = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders textarea and send button", () => {
    render(<MessageInput chatId="chat-1" />);

    expect(
      screen.getByPlaceholderText("Type a message...")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
  });

  it("disables send button when input is empty", () => {
    render(<MessageInput chatId="chat-1" />);

    const sendButton = screen.getByRole("button", { name: "Send message" });
    expect(sendButton).toBeDisabled();
  });

  it("enables send button when input has content", async () => {
    const user = userEvent.setup();

    render(<MessageInput chatId="chat-1" />);

    const textarea = screen.getByPlaceholderText("Type a message...");
    await user.type(textarea, "Hello world");

    const sendButton = screen.getByRole("button", { name: "Send message" });
    expect(sendButton).not.toBeDisabled();
  });

  it("sends message on button click", async () => {
    const user = userEvent.setup();
    (api.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      message: { id: "msg-1", content: "Hello world" },
    });

    render(
      <MessageInput chatId="chat-1" onMessageSent={mockOnMessageSent} />
    );

    const textarea = screen.getByPlaceholderText("Type a message...");
    await user.type(textarea, "Hello world");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(api.sendMessage).toHaveBeenCalledWith("chat-1", {
        content: "Hello world",
      });
      expect(mockOnMessageSent).toHaveBeenCalled();
    });
  });

  it("sends message on Enter key", async () => {
    const user = userEvent.setup();
    (api.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      message: { id: "msg-1", content: "Hello" },
    });

    render(
      <MessageInput chatId="chat-1" onMessageSent={mockOnMessageSent} />
    );

    const textarea = screen.getByPlaceholderText("Type a message...");
    await user.type(textarea, "Hello{Enter}");

    await waitFor(() => {
      expect(api.sendMessage).toHaveBeenCalledWith("chat-1", {
        content: "Hello",
      });
    });
  });

  it("does not send on Shift+Enter (allows multiline)", async () => {
    const user = userEvent.setup();

    render(<MessageInput chatId="chat-1" />);

    const textarea = screen.getByPlaceholderText("Type a message...");
    await user.type(textarea, "Line 1{Shift>}{Enter}{/Shift}Line 2");

    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("Line 1\nLine 2");
  });

  it("clears input after successful send", async () => {
    const user = userEvent.setup();
    (api.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      message: { id: "msg-1" },
    });

    render(<MessageInput chatId="chat-1" />);

    const textarea = screen.getByPlaceholderText("Type a message...");
    await user.type(textarea, "Hello");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(textarea).toHaveValue("");
    });
  });

  it("shows error when send fails", async () => {
    const user = userEvent.setup();
    (api.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Failed to send")
    );

    render(<MessageInput chatId="chat-1" />);

    const textarea = screen.getByPlaceholderText("Type a message...");
    await user.type(textarea, "Hello");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(screen.getByText("Failed to send")).toBeInTheDocument();
    });
  });

  it("disables input when disabled prop is true", () => {
    render(<MessageInput chatId="chat-1" disabled />);

    const textarea = screen.getByPlaceholderText("Type a message...");
    expect(textarea).toBeDisabled();
  });
});
