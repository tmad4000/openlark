import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock the API
vi.mock("@/lib/api", () => ({
  api: {
    getToken: vi.fn(),
  },
}));

import { api } from "@/lib/api";
import { useWebSocket } from "./use-websocket";

// Store WebSocket instances and track them
const wsInstances: MockWebSocket[] = [];

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  sentMessages: string[] = [];
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string) {
    this.url = url;
    wsInstances.push(this);
    // Simulate async connection
    this.timeoutId = setTimeout(() => {
      if (this.onopen && this.readyState !== MockWebSocket.CLOSED) {
        this.readyState = MockWebSocket.OPEN;
        this.onopen();
      }
    }, 10);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code: 1000, reason: "Normal closure" });
    }
  }

  // Helper to simulate receiving a message
  simulateMessage(data: unknown) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }
}

describe("useWebSocket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    wsInstances.length = 0;

    // Mock global WebSocket
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not connect without a token", () => {
    (api.getToken as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const { result } = renderHook(() => useWebSocket());

    expect(result.current.status).toBe("disconnected");
    expect(wsInstances).toHaveLength(0);
  });

  it("starts in connecting state with a token", () => {
    (api.getToken as ReturnType<typeof vi.fn>).mockReturnValue("test-token");

    const { result, unmount } = renderHook(() => useWebSocket());

    expect(result.current.status).toBe("connecting");
    expect(wsInstances).toHaveLength(1);
    expect(wsInstances[0].url).toContain("token=test-token");

    unmount();
  });

  it("transitions to connected after WebSocket opens", async () => {
    (api.getToken as ReturnType<typeof vi.fn>).mockReturnValue("test-token");

    const onConnected = vi.fn();
    const { result, unmount } = renderHook(() =>
      useWebSocket({ onConnected })
    );

    expect(result.current.status).toBe("connecting");

    // Advance timers to trigger onopen
    await act(async () => {
      vi.advanceTimersByTime(20);
    });

    expect(result.current.status).toBe("connected");
    expect(onConnected).toHaveBeenCalled();

    unmount();
  });

  it("calls onMessage when receiving new_message event", async () => {
    (api.getToken as ReturnType<typeof vi.fn>).mockReturnValue("test-token");

    const onMessage = vi.fn();
    const { unmount } = renderHook(() => useWebSocket({ onMessage }));

    // Wait for connection
    await act(async () => {
      vi.advanceTimersByTime(20);
    });

    // Simulate receiving a message
    act(() => {
      wsInstances[0].simulateMessage({
        type: "new_message",
        payload: {
          chatId: "chat-1",
          message: { id: "msg-1", content: "Hello" },
        },
      });
    });

    expect(onMessage).toHaveBeenCalledWith({
      chatId: "chat-1",
      message: { id: "msg-1", content: "Hello" },
    });

    unmount();
  });

  it("calls onMessageEdited when receiving message_edited event", async () => {
    (api.getToken as ReturnType<typeof vi.fn>).mockReturnValue("test-token");

    const onMessageEdited = vi.fn();
    const { unmount } = renderHook(() =>
      useWebSocket({ onMessageEdited })
    );

    await act(async () => {
      vi.advanceTimersByTime(20);
    });

    act(() => {
      wsInstances[0].simulateMessage({
        type: "message_edited",
        payload: {
          chatId: "chat-1",
          message: { id: "msg-1", content: "Edited" },
        },
      });
    });

    expect(onMessageEdited).toHaveBeenCalledWith({
      chatId: "chat-1",
      message: { id: "msg-1", content: "Edited" },
    });

    unmount();
  });

  it("calls onMessageRecalled when receiving message_recalled event", async () => {
    (api.getToken as ReturnType<typeof vi.fn>).mockReturnValue("test-token");

    const onMessageRecalled = vi.fn();
    const { unmount } = renderHook(() =>
      useWebSocket({ onMessageRecalled })
    );

    await act(async () => {
      vi.advanceTimersByTime(20);
    });

    act(() => {
      wsInstances[0].simulateMessage({
        type: "message_recalled",
        payload: {
          chatId: "chat-1",
          messageId: "msg-1",
        },
      });
    });

    expect(onMessageRecalled).toHaveBeenCalledWith({
      chatId: "chat-1",
      messageId: "msg-1",
    });

    unmount();
  });

  it("sends typing events when connected", async () => {
    (api.getToken as ReturnType<typeof vi.fn>).mockReturnValue("test-token");

    const { result, unmount } = renderHook(() => useWebSocket());

    // Wait for connection
    await act(async () => {
      vi.advanceTimersByTime(20);
    });

    expect(result.current.status).toBe("connected");

    act(() => {
      result.current.sendTyping("chat-1", true);
    });

    expect(wsInstances[0].sentMessages).toContain(
      JSON.stringify({
        type: "typing_start",
        payload: { chatId: "chat-1" },
      })
    );

    act(() => {
      result.current.sendTyping("chat-1", false);
    });

    expect(wsInstances[0].sentMessages).toContain(
      JSON.stringify({
        type: "typing_stop",
        payload: { chatId: "chat-1" },
      })
    );

    unmount();
  });

  it("disconnects when unmounted", async () => {
    (api.getToken as ReturnType<typeof vi.fn>).mockReturnValue("test-token");

    const { result, unmount } = renderHook(() => useWebSocket());

    await act(async () => {
      vi.advanceTimersByTime(20);
    });

    expect(result.current.status).toBe("connected");

    unmount();

    expect(wsInstances[0].readyState).toBe(MockWebSocket.CLOSED);
  });

  it("exposes isConnected helper", async () => {
    (api.getToken as ReturnType<typeof vi.fn>).mockReturnValue("test-token");

    const { result, unmount } = renderHook(() => useWebSocket());

    expect(result.current.isConnected).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(20);
    });

    expect(result.current.isConnected).toBe(true);

    unmount();
  });
});
