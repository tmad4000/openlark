"use client";

import { useEffect, useCallback } from "react";

type KeyboardModifier = "ctrl" | "meta" | "shift" | "alt";
type KeyboardShortcutCallback = (event: KeyboardEvent) => void;

interface KeyboardShortcut {
  key: string;
  modifiers?: KeyboardModifier[];
  callback: KeyboardShortcutCallback;
  preventDefault?: boolean;
}

/**
 * Hook to register a keyboard shortcut.
 *
 * @param shortcut - The shortcut configuration
 *
 * @example
 * // Cmd+K (macOS) or Ctrl+K (Windows/Linux) to open search
 * useKeyboardShortcut({
 *   key: "k",
 *   modifiers: ["meta"], // Will also respond to Ctrl on non-Mac
 *   callback: () => setSearchOpen(true),
 * });
 */
export function useKeyboardShortcut(shortcut: KeyboardShortcut) {
  const { key, modifiers = [], callback, preventDefault = true } = shortcut;

  const handler = useCallback(
    (event: KeyboardEvent) => {
      // Skip if user is typing in an input, textarea, or contenteditable
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Check if the key matches (case-insensitive)
      if (event.key.toLowerCase() !== key.toLowerCase()) {
        return;
      }

      // Check modifiers
      const hasCtrlOrMeta =
        modifiers.includes("ctrl") || modifiers.includes("meta");
      const hasShift = modifiers.includes("shift");
      const hasAlt = modifiers.includes("alt");

      // For Cmd/Ctrl, accept either metaKey or ctrlKey for cross-platform
      if (hasCtrlOrMeta) {
        if (!event.metaKey && !event.ctrlKey) {
          return;
        }
      } else {
        // If no ctrl/meta required, ensure neither is pressed
        if (event.metaKey || event.ctrlKey) {
          return;
        }
      }

      // Check shift
      if (hasShift !== event.shiftKey) {
        return;
      }

      // Check alt
      if (hasAlt !== event.altKey) {
        return;
      }

      // All conditions met - execute callback
      if (preventDefault) {
        event.preventDefault();
      }
      callback(event);
    },
    [key, modifiers, callback, preventDefault]
  );

  useEffect(() => {
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [handler]);
}

/**
 * Hook to register multiple keyboard shortcuts.
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const handlers = shortcuts.map(
    ({ key, modifiers = [], callback, preventDefault = true }) => {
      return useCallback(
        (event: KeyboardEvent) => {
          const target = event.target as HTMLElement;
          if (
            target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable
          ) {
            return;
          }

          if (event.key.toLowerCase() !== key.toLowerCase()) {
            return;
          }

          const hasCtrlOrMeta =
            modifiers.includes("ctrl") || modifiers.includes("meta");
          const hasShift = modifiers.includes("shift");
          const hasAlt = modifiers.includes("alt");

          if (hasCtrlOrMeta) {
            if (!event.metaKey && !event.ctrlKey) {
              return;
            }
          } else {
            if (event.metaKey || event.ctrlKey) {
              return;
            }
          }

          if (hasShift !== event.shiftKey) {
            return;
          }

          if (hasAlt !== event.altKey) {
            return;
          }

          if (preventDefault) {
            event.preventDefault();
          }
          callback(event);
        },
        [key, modifiers, callback, preventDefault]
      );
    }
  );

  useEffect(() => {
    const combinedHandler = (event: KeyboardEvent) => {
      handlers.forEach((handler) => handler(event));
    };

    window.addEventListener("keydown", combinedHandler);
    return () => {
      window.removeEventListener("keydown", combinedHandler);
    };
  }, [handlers]);
}
