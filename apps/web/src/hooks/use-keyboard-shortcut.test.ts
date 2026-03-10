import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardShortcut } from "./use-keyboard-shortcut";

describe("useKeyboardShortcut", () => {
  const mockCallback = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const simulateKeydown = (key: string, options: Partial<KeyboardEventInit> = {}) => {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...options,
    });
    window.dispatchEvent(event);
    return event;
  };

  it("triggers callback when key matches", () => {
    renderHook(() =>
      useKeyboardShortcut({
        key: "k",
        callback: mockCallback,
      })
    );

    simulateKeydown("k");

    expect(mockCallback).toHaveBeenCalledTimes(1);
  });

  it("does not trigger callback for different key", () => {
    renderHook(() =>
      useKeyboardShortcut({
        key: "k",
        callback: mockCallback,
      })
    );

    simulateKeydown("j");

    expect(mockCallback).not.toHaveBeenCalled();
  });

  it("handles case-insensitive key matching", () => {
    renderHook(() =>
      useKeyboardShortcut({
        key: "K",
        callback: mockCallback,
      })
    );

    simulateKeydown("k");

    expect(mockCallback).toHaveBeenCalledTimes(1);
  });

  it("triggers callback with meta modifier", () => {
    renderHook(() =>
      useKeyboardShortcut({
        key: "k",
        modifiers: ["meta"],
        callback: mockCallback,
      })
    );

    // Without meta - should not trigger
    simulateKeydown("k");
    expect(mockCallback).not.toHaveBeenCalled();

    // With meta - should trigger
    simulateKeydown("k", { metaKey: true });
    expect(mockCallback).toHaveBeenCalledTimes(1);
  });

  it("triggers callback with ctrl modifier (cross-platform)", () => {
    renderHook(() =>
      useKeyboardShortcut({
        key: "k",
        modifiers: ["ctrl"],
        callback: mockCallback,
      })
    );

    // Without ctrl - should not trigger
    simulateKeydown("k");
    expect(mockCallback).not.toHaveBeenCalled();

    // With ctrl - should trigger
    simulateKeydown("k", { ctrlKey: true });
    expect(mockCallback).toHaveBeenCalledTimes(1);
  });

  it("accepts either meta or ctrl when meta modifier is specified", () => {
    renderHook(() =>
      useKeyboardShortcut({
        key: "k",
        modifiers: ["meta"],
        callback: mockCallback,
      })
    );

    // Meta key (macOS Cmd)
    simulateKeydown("k", { metaKey: true });
    expect(mockCallback).toHaveBeenCalledTimes(1);

    // Ctrl key (Windows/Linux)
    simulateKeydown("k", { ctrlKey: true });
    expect(mockCallback).toHaveBeenCalledTimes(2);
  });

  it("triggers callback with shift modifier", () => {
    renderHook(() =>
      useKeyboardShortcut({
        key: "k",
        modifiers: ["shift"],
        callback: mockCallback,
      })
    );

    // Without shift - should not trigger
    simulateKeydown("k");
    expect(mockCallback).not.toHaveBeenCalled();

    // With shift - should trigger
    simulateKeydown("K", { shiftKey: true });
    expect(mockCallback).toHaveBeenCalledTimes(1);
  });

  it("triggers callback with alt modifier", () => {
    renderHook(() =>
      useKeyboardShortcut({
        key: "k",
        modifiers: ["alt"],
        callback: mockCallback,
      })
    );

    // Without alt - should not trigger
    simulateKeydown("k");
    expect(mockCallback).not.toHaveBeenCalled();

    // With alt - should trigger
    simulateKeydown("k", { altKey: true });
    expect(mockCallback).toHaveBeenCalledTimes(1);
  });

  it("does not trigger when only some modifiers match", () => {
    renderHook(() =>
      useKeyboardShortcut({
        key: "k",
        modifiers: ["meta", "shift"],
        callback: mockCallback,
      })
    );

    // Only meta - should not trigger (missing shift)
    simulateKeydown("k", { metaKey: true });
    expect(mockCallback).not.toHaveBeenCalled();

    // Only shift - should not trigger (missing meta)
    simulateKeydown("K", { shiftKey: true });
    expect(mockCallback).not.toHaveBeenCalled();

    // Both meta and shift - should trigger
    simulateKeydown("K", { metaKey: true, shiftKey: true });
    expect(mockCallback).toHaveBeenCalledTimes(1);
  });

  it("cleans up event listener on unmount", () => {
    const { unmount } = renderHook(() =>
      useKeyboardShortcut({
        key: "k",
        callback: mockCallback,
      })
    );

    unmount();

    simulateKeydown("k");

    expect(mockCallback).not.toHaveBeenCalled();
  });

  it("does not trigger in input elements", () => {
    renderHook(() =>
      useKeyboardShortcut({
        key: "k",
        modifiers: ["meta"],
        callback: mockCallback,
      })
    );

    // Create and focus an input
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    // Simulate keydown event with input as target
    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
    });
    Object.defineProperty(event, "target", { value: input });
    window.dispatchEvent(event);

    expect(mockCallback).not.toHaveBeenCalled();

    // Cleanup
    document.body.removeChild(input);
  });

  it("does not trigger in textarea elements", () => {
    renderHook(() =>
      useKeyboardShortcut({
        key: "k",
        modifiers: ["meta"],
        callback: mockCallback,
      })
    );

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();

    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
    });
    Object.defineProperty(event, "target", { value: textarea });
    window.dispatchEvent(event);

    expect(mockCallback).not.toHaveBeenCalled();

    document.body.removeChild(textarea);
  });
});
