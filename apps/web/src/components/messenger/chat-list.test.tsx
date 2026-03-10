import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatList } from "./chat-list";

// Mock the API
vi.mock("@/lib/api", () => ({
  api: {
    getChats: vi.fn(),
  },
}));

import { api } from "@/lib/api";

describe("ChatList", () => {
  const mockOnSelectChat = vi.fn();
  const mockOnCreateChat = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    (api.getChats as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(
      <ChatList
        selectedChatId={null}
        onSelectChat={mockOnSelectChat}
      />
    );

    expect(screen.getByText("Loading chats...")).toBeInTheDocument();
  });

  it("shows empty state when no chats", async () => {
    (api.getChats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      chats: [],
    });

    render(
      <ChatList
        selectedChatId={null}
        onSelectChat={mockOnSelectChat}
        onCreateChat={mockOnCreateChat}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("No conversations yet")).toBeInTheDocument();
    });
  });

  it("renders chat list items", async () => {
    (api.getChats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      chats: [
        {
          id: "chat-1",
          orgId: "org-1",
          type: "group",
          name: "Team Chat",
          avatarUrl: null,
          isPublic: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "chat-2",
          orgId: "org-1",
          type: "dm",
          name: null,
          avatarUrl: null,
          isPublic: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    render(
      <ChatList
        selectedChatId={null}
        onSelectChat={mockOnSelectChat}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Team Chat")).toBeInTheDocument();
      expect(screen.getByText("Direct Message")).toBeInTheDocument();
    });
  });

  it("calls onSelectChat when clicking a chat", async () => {
    const user = userEvent.setup();

    (api.getChats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      chats: [
        {
          id: "chat-1",
          orgId: "org-1",
          type: "group",
          name: "Team Chat",
          avatarUrl: null,
          isPublic: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    render(
      <ChatList
        selectedChatId={null}
        onSelectChat={mockOnSelectChat}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Team Chat")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Team Chat"));
    expect(mockOnSelectChat).toHaveBeenCalledWith("chat-1");
  });

  it("shows error state when API fails", async () => {
    (api.getChats as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Network error")
    );

    render(
      <ChatList
        selectedChatId={null}
        onSelectChat={mockOnSelectChat}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("highlights selected chat", async () => {
    (api.getChats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      chats: [
        {
          id: "chat-1",
          orgId: "org-1",
          type: "group",
          name: "Team Chat",
          avatarUrl: null,
          isPublic: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    render(
      <ChatList
        selectedChatId="chat-1"
        onSelectChat={mockOnSelectChat}
      />
    );

    await waitFor(() => {
      const chatButton = screen.getByRole("button", { name: /Team Chat/i });
      expect(chatButton).toHaveClass("bg-blue-50");
    });
  });

  it("shows create chat button when onCreateChat provided", async () => {
    (api.getChats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      chats: [],
    });

    render(
      <ChatList
        selectedChatId={null}
        onSelectChat={mockOnSelectChat}
        onCreateChat={mockOnCreateChat}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText("New chat")).toBeInTheDocument();
    });
  });
});
