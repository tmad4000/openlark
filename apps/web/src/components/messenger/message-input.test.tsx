import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock Tiptap (heavy dependency that doesn't work in jsdom)
vi.mock("@tiptap/react", () => ({
  useEditor: () => ({
    isEmpty: true,
    getText: () => "",
    getHTML: () => "",
    getJSON: () => ({ type: "doc", content: [] }),
    commands: { clearContent: vi.fn() },
    chain: () => ({
      focus: () => ({
        toggleBold: () => ({ run: vi.fn() }),
        toggleItalic: () => ({ run: vi.fn() }),
        toggleStrike: () => ({ run: vi.fn() }),
        toggleUnderline: () => ({ run: vi.fn() }),
        toggleBulletList: () => ({ run: vi.fn() }),
        toggleOrderedList: () => ({ run: vi.fn() }),
        toggleBlockquote: () => ({ run: vi.fn() }),
        toggleCode: () => ({ run: vi.fn() }),
        toggleCodeBlock: () => ({ run: vi.fn() }),
        insertContent: () => ({ run: vi.fn() }),
        extendMarkRange: () => ({
          setLink: () => ({ run: vi.fn() }),
          unsetLink: () => ({ run: vi.fn() }),
        }),
      }),
    }),
    isActive: () => false,
    getAttributes: () => ({}),
  }),
  // EditorContent rendered as a simple div — no React import needed in factory
  EditorContent: () => null,
}));

vi.mock("@tiptap/starter-kit", () => ({
  default: { configure: () => ({}) },
}));
vi.mock("@tiptap/extension-placeholder", () => ({
  default: { configure: () => ({}) },
}));
vi.mock("@tiptap/extension-underline", () => ({
  default: {},
}));
vi.mock("@tiptap/extension-link", () => ({
  default: { configure: () => ({}) },
}));
vi.mock("@tiptap/extension-mention", () => ({
  default: { configure: () => ({}) },
}));
vi.mock("@tiptap/extension-code-block-lowlight", () => ({
  default: { configure: () => ({}) },
}));
vi.mock("lowlight", () => ({
  common: {},
  createLowlight: () => ({}),
}));

// Mock useAuth
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: "user-1", displayName: "Test User" },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

// Mock the API
vi.mock("@/lib/api", () => ({
  api: {
    sendMessage: vi.fn(),
    getChatMembers: vi.fn().mockResolvedValue({ members: [] }),
    getToken: vi.fn().mockReturnValue("test-token"),
  },
}));

// Mock MessageList static methods
vi.mock("./message-list", () => ({
  MessageList: {
    addMessage: vi.fn(),
    confirmMessage: vi.fn(),
    failMessage: vi.fn(),
  },
}));

// Mock mention-suggestion
vi.mock("./mention-suggestion", () => ({
  createMentionSuggestion: () => ({}),
}));

import { MessageInput } from "./message-input";

describe("MessageInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders send button", () => {
    render(<MessageInput chatId="chat-1" />);

    expect(
      screen.getByRole("button", { name: "Send message" })
    ).toBeInTheDocument();
  });

  it("has send button disabled when editor is empty", () => {
    render(<MessageInput chatId="chat-1" />);

    const sendButton = screen.getByRole("button", { name: "Send message" });
    expect(sendButton).toBeDisabled();
  });

  it("renders toolbar toggle button", () => {
    render(<MessageInput chatId="chat-1" />);

    expect(
      screen.getByRole("button", { name: "Show formatting" })
    ).toBeInTheDocument();
  });

  it("renders emoji and attachment buttons", () => {
    render(<MessageInput chatId="chat-1" />);

    expect(screen.getByRole("button", { name: "Emoji" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Attach file" })
    ).toBeInTheDocument();
  });

  it("shows helper text", () => {
    render(<MessageInput chatId="chat-1" />);

    expect(
      screen.getByText("Press Enter to send, Shift+Enter for new line")
    ).toBeInTheDocument();
  });
});
