"use client";

import { useState, useRef, useCallback, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MessageInputProps {
  chatId: string;
  onMessageSent?: () => void;
  disabled?: boolean;
}

export function MessageInput({
  chatId,
  onMessageSent,
  disabled,
}: MessageInputProps) {
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent || isSending || disabled) return;

    try {
      setIsSending(true);
      setError(null);
      await api.sendMessage(chatId, { content: trimmedContent });
      setContent("");
      onMessageSent?.();

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setIsSending(false);
    }
  }, [chatId, content, disabled, isSending, onMessageSent]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Enter (without Shift)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target;
    setContent(textarea.value);

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = "auto";
    // Set to scrollHeight but cap at max height
    const maxHeight = 150;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4">
      {error && (
        <div className="mb-2 text-sm text-red-500">{error}</div>
      )}
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={disabled || isSending}
            rows={1}
            className={cn(
              "w-full resize-none rounded-lg border border-gray-300 dark:border-gray-700",
              "bg-white dark:bg-gray-900 px-4 py-2 text-sm",
              "text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400",
              "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "min-h-[40px] max-h-[150px]"
            )}
          />
        </div>
        <Button
          onClick={handleSend}
          disabled={!content.trim() || isSending || disabled}
          size="icon"
          className="h-10 w-10 flex-shrink-0"
          aria-label="Send message"
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
      <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
        Press Enter to send, Shift+Enter for new line
      </div>
    </div>
  );
}
