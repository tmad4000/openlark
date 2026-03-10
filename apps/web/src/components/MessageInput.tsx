"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
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
  Send,
  ChevronUp,
  ChevronDown,
  X,
} from "lucide-react";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";

interface MessageInputProps {
  onSend: (content: { html: string; text: string }) => void;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
  isSending?: boolean;
  placeholder?: string;
  sendOnEnter?: boolean;
}

interface FormatButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  isActive?: boolean;
  onClick: () => void;
  disabled?: boolean;
}

function FormatButton({ icon: Icon, title, isActive, onClick, disabled }: FormatButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        isActive
          ? "bg-blue-100 text-blue-600"
          : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

interface LinkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (url: string) => void;
  initialUrl?: string;
}

function LinkDialog({ isOpen, onClose, onSubmit, initialUrl = "" }: LinkDialogProps) {
  const [url, setUrl] = useState(initialUrl);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setUrl(initialUrl);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialUrl]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      let finalUrl = url.trim();
      if (!/^https?:\/\//i.test(finalUrl)) {
        finalUrl = `https://${finalUrl}`;
      }
      onSubmit(finalUrl);
    }
    onClose();
  };

  return (
    <div className="absolute bottom-full left-0 mb-2 p-3 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[300px]">
      <form onSubmit={handleSubmit}>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter URL..."
            className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
          >
            Add
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

interface EmojiData {
  native: string;
}

export default function MessageInput({
  onSend,
  onTypingStart,
  onTypingStop,
  isSending = false,
  placeholder = "Type a message...",
  sendOnEnter = true,
}: MessageInputProps) {
  const [showToolbar, setShowToolbar] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);

  // Track typing state for debounced events
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle typing indicators with debouncing
  const handleTypingChange = useCallback(() => {
    if (!onTypingStart || !onTypingStop) return;

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // If not currently typing, send typing start
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      onTypingStart();
    }

    // Set timeout to send typing stop after 2.5 seconds of inactivity
    // (slightly less than 3s TTL so we can re-send before it expires)
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      onTypingStop();
    }, 2500);
  }, [onTypingStart, onTypingStop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (isTypingRef.current && onTypingStop) {
        onTypingStop();
      }
    };
  }, [onTypingStop]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
        dropcursor: false,
        gapcursor: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-blue-600 underline",
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none min-h-[40px] max-h-[200px] overflow-y-auto px-3 py-2",
      },
      handleKeyDown: (_view, event) => {
        // Enter to send (if enabled and not Shift+Enter)
        if (event.key === "Enter" && sendOnEnter && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          handleSend();
          return true;
        }
        // Shift+Enter for new line (default TipTap behavior handles this)
        return false;
      },
    },
    immediatelyRender: false,
    onUpdate: () => {
      // Trigger typing indicator on content change
      handleTypingChange();
    },
  });

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showEmojiPicker &&
        emojiPickerRef.current &&
        emojiButtonRef.current &&
        !emojiPickerRef.current.contains(event.target as Node) &&
        !emojiButtonRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showEmojiPicker]);

  const handleSend = useCallback(() => {
    if (!editor || isSending) return;

    const html = editor.getHTML();
    const text = editor.getText();

    if (!text.trim()) return;

    // Clear typing state when sending
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (isTypingRef.current) {
      isTypingRef.current = false;
      onTypingStop?.();
    }

    onSend({ html, text });
    editor.commands.clearContent();
  }, [editor, isSending, onSend, onTypingStop]);

  const handleEmojiSelect = useCallback(
    (emoji: EmojiData) => {
      if (!editor) return;
      editor.chain().focus().insertContent(emoji.native).run();
      setShowEmojiPicker(false);
    },
    [editor]
  );

  const handleSetLink = useCallback(
    (url: string) => {
      if (!editor) return;
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: url })
        .run();
    },
    [editor]
  );

  const openLinkDialog = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href || "";
    setShowLinkDialog(true);
    return previousUrl;
  }, [editor]);

  const handleFileClick = useCallback(() => {
    // File upload - create hidden input and trigger click
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = () => {
      const files = input.files;
      if (files && files.length > 0) {
        // For now, just log - actual upload would be handled separately
        console.log("Files selected:", Array.from(files).map((f) => f.name));
        // TODO: Implement actual file upload via API
      }
    };
    input.click();
  }, []);

  if (!editor) {
    return (
      <div className="border border-gray-300 rounded-lg bg-white p-3">
        <div className="h-[40px] flex items-center text-gray-400 text-sm">
          Loading editor...
        </div>
      </div>
    );
  }

  const isEmpty = editor.isEmpty;

  return (
    <div className="relative">
      {/* Link Dialog */}
      <LinkDialog
        isOpen={showLinkDialog}
        onClose={() => setShowLinkDialog(false)}
        onSubmit={handleSetLink}
        initialUrl={editor.getAttributes("link").href || ""}
      />

      {/* Emoji Picker */}
      {showEmojiPicker && (
        <div
          ref={emojiPickerRef}
          className="absolute bottom-full left-0 mb-2 z-30"
        >
          <Picker
            data={data}
            onEmojiSelect={handleEmojiSelect}
            theme="light"
            previewPosition="none"
            skinTonePosition="none"
          />
        </div>
      )}

      <div className="border border-gray-300 rounded-lg bg-white overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
        {/* Expandable Formatting Toolbar */}
        {showToolbar && (
          <div className="flex items-center gap-0.5 px-2 py-1 border-b border-gray-200 bg-gray-50 flex-wrap">
            <FormatButton
              icon={Bold}
              title="Bold (Cmd+B)"
              isActive={editor.isActive("bold")}
              onClick={() => editor.chain().focus().toggleBold().run()}
            />
            <FormatButton
              icon={Italic}
              title="Italic (Cmd+I)"
              isActive={editor.isActive("italic")}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            />
            <FormatButton
              icon={Strikethrough}
              title="Strikethrough"
              isActive={editor.isActive("strike")}
              onClick={() => editor.chain().focus().toggleStrike().run()}
            />
            <FormatButton
              icon={UnderlineIcon}
              title="Underline"
              isActive={editor.isActive("underline")}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            />

            <div className="w-px h-5 bg-gray-300 mx-1" />

            <FormatButton
              icon={List}
              title="Bullet List"
              isActive={editor.isActive("bulletList")}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            />
            <FormatButton
              icon={ListOrdered}
              title="Numbered List"
              isActive={editor.isActive("orderedList")}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            />
            <FormatButton
              icon={Quote}
              title="Blockquote"
              isActive={editor.isActive("blockquote")}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
            />

            <div className="w-px h-5 bg-gray-300 mx-1" />

            <FormatButton
              icon={Code}
              title="Inline Code"
              isActive={editor.isActive("code")}
              onClick={() => editor.chain().focus().toggleCode().run()}
            />
            <FormatButton
              icon={LinkIcon}
              title="Add Link"
              isActive={editor.isActive("link")}
              onClick={() => {
                if (editor.isActive("link")) {
                  editor.chain().focus().unsetLink().run();
                } else {
                  openLinkDialog();
                }
              }}
            />
          </div>
        )}

        {/* Editor Content */}
        <EditorContent editor={editor} />

        {/* Bottom Bar */}
        <div className="flex items-center justify-between px-2 py-1.5 border-t border-gray-100 bg-gray-50">
          <div className="flex items-center gap-1">
            {/* Toggle Toolbar Button */}
            <button
              type="button"
              onClick={() => setShowToolbar(!showToolbar)}
              title={showToolbar ? "Hide formatting" : "Show formatting"}
              className="p-1.5 rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              {showToolbar ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </button>

            {/* Emoji Button */}
            <button
              ref={emojiButtonRef}
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              title="Add emoji"
              className={`p-1.5 rounded transition-colors ${
                showEmojiPicker
                  ? "bg-blue-100 text-blue-600"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              }`}
            >
              <Smile className="w-4 h-4" />
            </button>

            {/* Attachment Button */}
            <button
              type="button"
              onClick={handleFileClick}
              title="Attach file"
              className="p-1.5 rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              <Paperclip className="w-4 h-4" />
            </button>
          </div>

          {/* Send Button */}
          <button
            type="button"
            onClick={handleSend}
            disabled={isEmpty || isSending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
            <span>Send</span>
          </button>
        </div>

        {/* Helper Text */}
        <div className="px-3 py-1 bg-gray-50 border-t border-gray-100">
          <p className="text-[10px] text-gray-400">
            {sendOnEnter
              ? "Press Enter to send, Shift+Enter for new line"
              : "Press Cmd+Enter to send, Enter for new line"}
          </p>
        </div>
      </div>
    </div>
  );
}
