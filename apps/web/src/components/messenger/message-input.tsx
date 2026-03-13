"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { MessageList } from "./message-list";
import {
  Send,
  Loader2,
  Bold,
  Italic,
  Strikethrough,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Quote,
  Code,
  Link as LinkIcon,
  Smile,
  Paperclip,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";

interface MessageInputProps {
  chatId: string;
  onMessageSent?: () => void;
  onTyping?: (isTyping: boolean) => void;
  disabled?: boolean;
}

export function MessageInput({
  chatId,
  onMessageSent,
  onTyping,
  disabled,
}: MessageInputProps) {
  const { user } = useAuth();
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showToolbar, setShowToolbar] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);

  // Notify typing with debounce (3s timeout to stop)
  const handleTypingActivity = useCallback(() => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      onTyping?.(true);
    }
    // Reset the stop timer
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      onTyping?.(false);
    }, 3000);
  }, [onTyping]);

  // Stop typing on unmount or chat change
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (isTypingRef.current) {
        onTyping?.(false);
        isTypingRef.current = false;
      }
    };
  }, [chatId, onTyping]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: "Type a message...",
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-blue-400 underline cursor-pointer",
        },
      }),
    ],
    editorProps: {
      attributes: {
        class: cn(
          "w-full resize-none rounded-lg border border-gray-300 dark:border-gray-700",
          "bg-white dark:bg-gray-900 px-4 py-2 text-sm",
          "text-gray-900 dark:text-gray-100",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
          "min-h-[40px] max-h-[150px] overflow-y-auto",
          "prose prose-sm dark:prose-invert max-w-none",
          "[&_p]:my-0 [&_ul]:my-1 [&_ol]:my-1 [&_blockquote]:my-1 [&_pre]:my-1"
        ),
      },
      handleKeyDown: (_view, event) => {
        // Send on Enter (without Shift)
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          handleSend();
          return true;
        }
        // Emit typing indicator on keypress
        handleTypingActivity();
        return false;
      },
    },
    editable: !disabled && !isSending,
  });

  const handleSend = useCallback(async () => {
    if (!editor || isSending || disabled) return;

    const isEmpty = editor.isEmpty;
    if (isEmpty) return;

    // Get plain text for the API
    const text = editor.getText().trim();
    if (!text) return;

    // Optimistic UI: show message immediately
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticMessage = {
      id: tempId,
      chatId,
      senderId: user?.id || "",
      type: "text",
      contentJson: { text },
      createdAt: new Date().toISOString(),
      editedAt: null,
      recalledAt: null,
      _tempId: tempId,
      _pending: true,
    };
    MessageList.addMessage(optimisticMessage);
    editor.commands.clearContent();

    // Stop typing indicator on send
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    if (isTypingRef.current) {
      isTypingRef.current = false;
      onTyping?.(false);
    }

    try {
      setIsSending(true);
      setError(null);
      const { message } = await api.sendMessage(chatId, { content: text });
      // Replace optimistic message with confirmed one
      MessageList.confirmMessage(tempId, message);
      onMessageSent?.();
    } catch (err) {
      // Mark the optimistic message as failed
      MessageList.failMessage(tempId);
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setIsSending(false);
    }
  }, [chatId, editor, disabled, isSending, onMessageSent]);

  const handleSetLink = useCallback(() => {
    if (!editor) return;

    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("Enter URL:", previousUrl || "https://");

    if (url === null) return; // cancelled
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const insertEmoji = useCallback(
    (emoji: string) => {
      if (!editor) return;
      editor.chain().focus().insertContent(emoji).run();
      setShowEmojiPicker(false);
    },
    [editor]
  );

  const isContentEmpty = !editor || editor.isEmpty;

  return (
    <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4">
      {error && <div className="mb-2 text-sm text-red-500">{error}</div>}

      {/* Formatting Toolbar */}
      {showToolbar && editor && (
        <div className="flex items-center gap-1 mb-2 flex-wrap">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")}
            title="Bold (Cmd+B)"
          >
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")}
            title="Italic (Cmd+I)"
          >
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive("strike")}
            title="Strikethrough"
          >
            <Strikethrough className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive("underline")}
            title="Underline"
          >
            <UnderlineIcon className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive("bulletList")}
            title="Bullet List"
          >
            <List className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive("orderedList")}
            title="Numbered List"
          >
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            active={editor.isActive("blockquote")}
            title="Blockquote"
          >
            <Quote className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            active={editor.isActive("code")}
            title="Inline Code"
          >
            <Code className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={handleSetLink}
            active={editor.isActive("link")}
            title="Link"
          >
            <LinkIcon className="h-4 w-4" />
          </ToolbarButton>
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Toolbar toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowToolbar(!showToolbar)}
          className="h-10 w-10 flex-shrink-0"
          aria-label={showToolbar ? "Hide formatting" : "Show formatting"}
          title={showToolbar ? "Hide formatting" : "Show formatting"}
        >
          {showToolbar ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </Button>

        {/* Editor */}
        <div className="flex-1 relative">
          <EditorContent
            editor={editor}
            className={cn(
              disabled || isSending ? "opacity-50 pointer-events-none" : ""
            )}
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Emoji picker */}
          <div className="relative" ref={emojiPickerRef}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="h-10 w-10"
              aria-label="Emoji"
              title="Emoji"
            >
              <Smile className="h-4 w-4" />
            </Button>
            {showEmojiPicker && (
              <div className="absolute bottom-12 right-0 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 z-50">
                <div className="grid grid-cols-8 gap-1">
                  {COMMON_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => insertEmoji(emoji)}
                      className="text-xl hover:bg-gray-100 dark:hover:bg-gray-800 rounded p-1 transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Attachment button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            aria-label="Attach file"
            title="Attach file"
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          {/* Send button */}
          <Button
            onClick={handleSend}
            disabled={isContentEmpty || isSending || disabled}
            size="icon"
            className="h-10 w-10"
            aria-label="Send message"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
      <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
        Press Enter to send, Shift+Enter for new line
      </div>
    </div>
  );
}

// Common emojis for the quick picker
const COMMON_EMOJIS = [
  "\u{1F44D}", "\u{1F44E}", "\u{2764}\u{FE0F}", "\u{1F602}", "\u{1F60A}", "\u{1F622}", "\u{1F44F}", "\u{1F389}",
  "\u{1F525}", "\u{1F4AF}", "\u{2705}", "\u{274C}", "\u{1F914}", "\u{1F440}", "\u{1F64F}", "\u{1F680}",
  "\u{2B50}", "\u{1F4A1}", "\u{1F4DD}", "\u{1F517}", "\u{23F0}", "\u{1F3AF}", "\u{1F6A9}", "\u{1F4AC}",
];

// Toolbar button component
function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "p-1.5 rounded transition-colors",
        active
          ? "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300"
      )}
    >
      {children}
    </button>
  );
}

// Toolbar divider
function ToolbarDivider() {
  return (
    <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />
  );
}
