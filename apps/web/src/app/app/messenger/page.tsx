"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Search, Plus, MessageCircle, Users, Bell, BellOff, AtSign, Info, Wifi, WifiOff, Loader2, Check, CheckCheck, Circle, MoreHorizontal, Reply, X, MessageSquare, Pin, Star, Pencil, Trash2, Forward, Square, CheckSquare, Tag } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as ContextMenu from "@radix-ui/react-context-menu";
import MessageInput, { MentionUser } from "@/components/MessageInput";
import { useWebSocket, ConnectionStatus, WebSocketMessage, TypingEvent, PresenceEvent, ReadReceiptEvent, ReactionEvent } from "@/hooks/useWebSocket";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import * as Popover from "@radix-ui/react-popover";

interface Chat {
  id: string;
  type: "dm" | "group" | "topic_group" | "supergroup" | "meeting";
  name: string | null;
  avatarUrl: string | null;
  memberCount: number;
  unreadCount: number;
  muted: boolean;
  done: boolean;
  pinned: boolean;
  label: string | null;
  lastMessage: {
    id: string;
    type: string;
    content: Record<string, unknown>;
    createdAt: string;
    senderName: string | null;
  } | null;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

interface User {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: string;
}

type FilterType = "all" | "private" | "group" | "mentions" | "unread" | "muted" | "done";

const FILTER_TABS: { id: FilterType; label: string; icon?: React.ComponentType<{ className?: string }> }[] = [
  { id: "all", label: "All" },
  { id: "private", label: "Private", icon: MessageCircle },
  { id: "group", label: "Group", icon: Users },
  { id: "mentions", label: "@Mentions", icon: AtSign },
  { id: "unread", label: "Unread", icon: Bell },
  { id: "muted", label: "Muted", icon: BellOff },
  { id: "done", label: "Done", icon: Check },
];

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  } else {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
}

function getMessagePreview(message: Chat["lastMessage"]): string {
  if (!message) return "No messages yet";

  const content = message.content;
  if (content.text && typeof content.text === "string") {
    return content.text.length > 50 ? content.text.substring(0, 50) + "..." : content.text;
  }

  if (message.type === "system") {
    const action = content.action;
    if (action === "group_created") {
      return `${content.createdBy} created the group`;
    }
    if (action === "members_added") {
      return `${content.addedBy} added members`;
    }
    return "System message";
  }

  return "Message";
}

interface Reaction {
  emoji: string;
  count: number;
  hasCurrentUser: boolean;
  users: Array<{ userId: string; displayName: string | null; avatarUrl: string | null }>;
}

interface ForwardedFrom {
  chatId: string;
  chatName: string;
  chatType: string;
  messageId: string;
  senderName: string;
  senderId: string;
  originalCreatedAt: string;
  bundled?: boolean;
  messageCount?: number;
}

interface BundledMessage {
  type: string;
  content: Record<string, unknown>;
  originalMessageId: string;
  originalChatId: string;
  originalChatName: string;
  originalChatType: string;
  senderName: string;
  senderId: string;
  originalCreatedAt: string;
}

interface Message {
  id: string;
  chatId: string;
  senderId: string;
  type: "text" | "rich_text" | "code" | "voice" | "card" | "system";
  content: Record<string, unknown> & {
    forwardedFrom?: ForwardedFrom;
    bundle?: BundledMessage[];
  };
  threadId: string | null;
  replyToId: string | null;
  forwardedFromMessageId: string | null;
  forwardedFromChatId: string | null;
  editedAt: string | null;
  recalledAt: string | null;
  scheduledFor: string | null;
  createdAt: string;
  sender: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  reactions?: Reaction[];
  replyCount?: number;
}

interface ReadReceipt {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  readAt: string | null;
  hasRead: boolean;
}

interface MessageReadStatus {
  totalMembers: number;
  readCount: number;
  receipts: ReadReceipt[];
}

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (messageDate.getTime() === today.getTime()) {
    return "Today";
  } else if (messageDate.getTime() === yesterday.getTime()) {
    return "Yesterday";
  } else if (messageDate.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  } else {
    return date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }
}

function getDateKey(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function ForwardedAttribution({ forwardedFrom }: { forwardedFrom: ForwardedFrom }) {
  const formattedDate = forwardedFrom.originalCreatedAt
    ? new Date(forwardedFrom.originalCreatedAt).toLocaleDateString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1 border-l-2 border-blue-300 pl-2 py-0.5">
      <Forward className="w-3 h-3" />
      <span>
        Forwarded from{" "}
        <span className="font-medium text-gray-600">{forwardedFrom.chatName}</span>
        {forwardedFrom.senderName && (
          <> · {forwardedFrom.senderName}</>
        )}
        {formattedDate && <> · {formattedDate}</>}
      </span>
    </div>
  );
}

function BundledMessageContent({ bundle }: { bundle: BundledMessage[] }) {
  return (
    <div className="border-l-2 border-blue-300 pl-3 space-y-2">
      <div className="text-xs text-gray-500 font-medium mb-2">
        {bundle.length} forwarded messages
      </div>
      {bundle.map((msg, idx) => (
        <div key={msg.originalMessageId || idx} className="bg-gray-50 rounded-md p-2">
          <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
            <span className="font-medium text-gray-600">{msg.senderName}</span>
            <span>·</span>
            <span>
              {new Date(msg.originalCreatedAt).toLocaleDateString([], {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <div className="text-sm">
            {msg.content.text && typeof msg.content.text === "string" ? (
              <span className="whitespace-pre-wrap break-words">{msg.content.text}</span>
            ) : msg.type === "code" && msg.content.code ? (
              <pre className="bg-gray-900 text-gray-100 p-2 rounded text-xs overflow-x-auto">
                <code>{String(msg.content.code)}</code>
              </pre>
            ) : msg.type === "rich_text" && typeof msg.content.html === "string" ? (
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: msg.content.html }}
              />
            ) : (
              <span className="text-gray-500 italic">[Message]</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function renderMessageContent(message: Message): React.ReactNode {
  const { type, content, recalledAt } = message;

  // Check if message was recalled/deleted
  if (recalledAt) {
    return <span className="italic text-gray-400">This message was deleted</span>;
  }

  const forwardedFrom = content.forwardedFrom as ForwardedFrom | undefined;
  const bundle = content.bundle as BundledMessage[] | undefined;

  // Handle bundled forwarded messages
  if (bundle && Array.isArray(bundle) && bundle.length > 0) {
    return (
      <div>
        {forwardedFrom && <ForwardedAttribution forwardedFrom={forwardedFrom} />}
        <BundledMessageContent bundle={bundle} />
      </div>
    );
  }

  // Regular message with optional forwarded attribution
  const messageContent = (() => {
    if (type === "text" && content.text) {
      return <span className="whitespace-pre-wrap break-words">{String(content.text)}</span>;
    }

    if (type === "system") {
      const action = content.action;
      if (action === "group_created") {
        const createdBy = typeof content.createdBy === "string" ? content.createdBy : null;
        return (
          <span className="text-gray-500 text-sm italic">
            {createdBy ? `${createdBy} created the group` : "Group created"}
          </span>
        );
      }
      if (action === "members_added") {
        const members = content.memberNames as string[] | undefined;
        const addedBy = typeof content.addedBy === "string" ? content.addedBy : "Someone";
        return (
          <span className="text-gray-500 text-sm italic">
            {addedBy} added {members?.join(", ") || "new members"}
          </span>
        );
      }
      return <span className="text-gray-500 text-sm italic">System message</span>;
    }

    if (type === "code" && content.code) {
      return (
        <pre className="bg-gray-900 text-gray-100 p-3 rounded-md overflow-x-auto text-sm">
          <code>{String(content.code)}</code>
        </pre>
      );
    }

    if (type === "rich_text") {
      // Handle HTML content from TipTap
      if (typeof content.html === "string") {
        return (
          <div
            className="prose prose-sm max-w-none break-words [&_a]:text-blue-600 [&_a]:underline [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4"
            dangerouslySetInnerHTML={{ __html: content.html as string }}
          />
        );
      }
      // Fallback for block-based rich text
      if (Array.isArray(content.blocks)) {
        return (
          <div className="whitespace-pre-wrap break-words">
            {(content.blocks as Array<{ type: string; text?: string }>).map((block, i) => (
              <span key={i}>{block.text || ""}</span>
            ))}
          </div>
        );
      }
    }

    return <span className="text-gray-500 italic">[Message]</span>;
  })();

  // If this is a forwarded message, show the attribution
  if (forwardedFrom) {
    return (
      <div>
        <ForwardedAttribution forwardedFrom={forwardedFrom} />
        {messageContent}
      </div>
    );
  }

  return messageContent;
}

// Frequently used emojis for quick reaction picker
const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢"];

interface EmojiData {
  native: string;
}

function QuickReactionPicker({
  onSelect,
  onOpenFull,
  onReply,
  onForward,
  onPin,
  onFavorite,
  onEdit,
  onRecall,
  isPinned,
  isFavorited,
  canEdit,
  canRecall,
  canForward,
}: {
  onSelect: (emoji: string) => void;
  onOpenFull: () => void;
  onReply: () => void;
  onForward?: () => void;
  onPin?: () => void;
  onFavorite?: () => void;
  onEdit?: () => void;
  onRecall?: () => void;
  isPinned?: boolean;
  isFavorited?: boolean;
  canEdit?: boolean;
  canRecall?: boolean;
  canForward?: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-full shadow-lg px-1.5 py-0.5">
      {QUICK_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onSelect(emoji)}
          className="w-7 h-7 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors text-base"
          title={`React with ${emoji}`}
        >
          {emoji}
        </button>
      ))}
      <button
        onClick={onOpenFull}
        className="w-7 h-7 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors text-gray-500"
        title="More reactions"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      <div className="w-px h-5 bg-gray-200 mx-0.5" />
      <button
        onClick={onReply}
        className="w-7 h-7 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors text-gray-500"
        title="Reply in thread"
      >
        <Reply className="w-4 h-4" />
      </button>
      {canForward && onForward && (
        <button
          onClick={onForward}
          className="w-7 h-7 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors text-gray-500"
          title="Forward message"
        >
          <Forward className="w-4 h-4" />
        </button>
      )}
      {onPin && (
        <button
          onClick={onPin}
          className={`w-7 h-7 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors ${
            isPinned ? "text-blue-600" : "text-gray-500"
          }`}
          title={isPinned ? "Unpin message" : "Pin message"}
        >
          <Pin className="w-4 h-4" />
        </button>
      )}
      {onFavorite && (
        <button
          onClick={onFavorite}
          className={`w-7 h-7 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors ${
            isFavorited ? "text-yellow-500" : "text-gray-500"
          }`}
          title={isFavorited ? "Remove from favorites" : "Add to favorites"}
        >
          <Star className={`w-4 h-4 ${isFavorited ? "fill-current" : ""}`} />
        </button>
      )}
      {canEdit && onEdit && (
        <button
          onClick={onEdit}
          className="w-7 h-7 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors text-gray-500"
          title="Edit message"
        >
          <Pencil className="w-4 h-4" />
        </button>
      )}
      {canRecall && onRecall && (
        <button
          onClick={onRecall}
          className="w-7 h-7 flex items-center justify-center hover:bg-red-50 rounded-full transition-colors text-gray-500 hover:text-red-500"
          title="Recall message"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function ReactionDisplay({
  reactions,
  onToggleReaction,
}: {
  reactions: Reaction[];
  onToggleReaction: (emoji: string) => void;
}) {
  if (!reactions || reactions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          onClick={() => onToggleReaction(reaction.emoji)}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-full border transition-colors ${
            reaction.hasCurrentUser
              ? "bg-blue-50 border-blue-200 text-blue-700"
              : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
          }`}
          title={reaction.users.map(u => u.displayName || "Unknown").join(", ")}
        >
          <span>{reaction.emoji}</span>
          <span className="font-medium">{reaction.count}</span>
        </button>
      ))}
    </div>
  );
}

function ReadStatusIcon({
  status,
  onClick,
}: {
  status: "unread" | "partial" | "all_read";
  onClick?: () => void;
}) {
  if (status === "unread") {
    return (
      <button
        onClick={onClick}
        className="text-gray-400 hover:text-gray-600 transition-colors"
        title="Unread"
      >
        <Circle className="w-3 h-3" />
      </button>
    );
  }

  if (status === "partial") {
    return (
      <button
        onClick={onClick}
        className="text-green-400 hover:text-green-600 transition-colors"
        title="Some have read"
      >
        <Check className="w-3 h-3" />
      </button>
    );
  }

  // all_read
  return (
    <button
      onClick={onClick}
      className="text-green-600 hover:text-green-700 transition-colors"
      title="All have read"
    >
      <CheckCheck className="w-3 h-3" />
    </button>
  );
}

function ReadReceiptsPopover({
  messageId,
  isOpen,
  onClose,
}: {
  messageId: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [receipts, setReceipts] = useState<ReadReceipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchReceipts = async () => {
      const token = getCookie("session_token");
      if (!token) return;

      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/messages/${messageId}/read-receipts`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          throw new Error("Failed to load read receipts");
        }

        const data = await res.json();
        setReceipts(data.receipts || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setIsLoading(false);
      }
    };

    fetchReceipts();
  }, [isOpen, messageId]);

  const readReceipts = receipts.filter((r) => r.hasRead);
  const unreadReceipts = receipts.filter((r) => !r.hasRead);

  return (
    <Popover.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Popover.Anchor />
      <Popover.Portal>
        <Popover.Content
          className="bg-white rounded-lg shadow-lg border border-gray-200 w-64 max-h-80 overflow-hidden z-50"
          side="top"
          align="end"
          sideOffset={5}
        >
          <div className="p-3 border-b border-gray-100">
            <h4 className="text-sm font-semibold text-gray-900">Read Receipts</h4>
          </div>

          {isLoading ? (
            <div className="p-4 text-center text-gray-500 text-sm">Loading...</div>
          ) : error ? (
            <div className="p-4 text-center text-red-500 text-sm">{error}</div>
          ) : (
            <div className="max-h-56 overflow-y-auto">
              {/* Read section */}
              {readReceipts.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-xs font-medium text-green-600 bg-green-50">
                    Read ({readReceipts.length})
                  </div>
                  <div className="divide-y divide-gray-50">
                    {readReceipts.map((receipt) => (
                      <div key={receipt.userId} className="flex items-center gap-2 px-3 py-2">
                        <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                          {receipt.avatarUrl ? (
                            <img
                              src={receipt.avatarUrl}
                              alt={receipt.displayName || "User"}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-green-600 text-white text-xs font-medium">
                              {receipt.displayName?.charAt(0).toUpperCase() || "?"}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 truncate">
                            {receipt.displayName || "Unknown"}
                          </p>
                          {receipt.readAt && (
                            <p className="text-[10px] text-gray-500">
                              {new Date(receipt.readAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                        <CheckCheck className="w-4 h-4 text-green-600 flex-shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unread section */}
              {unreadReceipts.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-50">
                    Not yet read ({unreadReceipts.length})
                  </div>
                  <div className="divide-y divide-gray-50">
                    {unreadReceipts.map((receipt) => (
                      <div key={receipt.userId} className="flex items-center gap-2 px-3 py-2">
                        <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                          {receipt.avatarUrl ? (
                            <img
                              src={receipt.avatarUrl}
                              alt={receipt.displayName || "User"}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-400 text-white text-xs font-medium">
                              {receipt.displayName?.charAt(0).toUpperCase() || "?"}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 truncate">
                            {receipt.displayName || "Unknown"}
                          </p>
                        </div>
                        <Circle className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {receipts.length === 0 && (
                <div className="p-4 text-center text-gray-500 text-sm">
                  No recipients yet
                </div>
              )}
            </div>
          )}

          <Popover.Arrow className="fill-white" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function MessageBubble({
  message,
  isCurrentUser,
  readStatus,
  onShowReadReceipts,
  onToggleReaction,
  onOpenThread,
  onPin,
  onFavorite,
  onEdit,
  onRecall,
  onForward,
  isPinned,
  isFavorited,
  isSelectionMode,
  isSelected,
  onToggleSelect,
}: {
  message: Message;
  isCurrentUser: boolean;
  readStatus?: { totalMembers: number; readCount: number };
  onShowReadReceipts?: (messageId: string) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onOpenThread?: (messageId: string) => void;
  onPin?: (messageId: string) => void;
  onFavorite?: (messageId: string) => void;
  onEdit?: (messageId: string) => void;
  onRecall?: (messageId: string) => void;
  onForward?: (messageId: string) => void;
  isPinned?: boolean;
  isFavorited?: boolean;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (messageId: string) => void;
}) {
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const fullPickerRef = useRef<HTMLDivElement>(null);

  const isSystem = message.type === "system";
  const isPending = message.id.startsWith("pending-");

  // Close pickers when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target as Node)
      ) {
        setShowReactionPicker(false);
      }
      if (
        fullPickerRef.current &&
        !fullPickerRef.current.contains(event.target as Node)
      ) {
        setShowFullPicker(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleReaction = (emoji: string) => {
    onToggleReaction?.(message.id, emoji);
    setShowReactionPicker(false);
    setShowFullPicker(false);
  };

  const handleEmojiSelect = (emojiData: EmojiData) => {
    handleReaction(emojiData.native);
  };

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <div className="bg-gray-100 px-3 py-1 rounded-full text-gray-500 text-xs">
          {renderMessageContent(message)}
        </div>
      </div>
    );
  }

  // Handle click in selection mode
  const handleClick = () => {
    if (isSelectionMode && onToggleSelect) {
      onToggleSelect(message.id);
    }
  };

  return (
    <div
      className={`group flex gap-2 py-1 ${isCurrentUser ? "flex-row-reverse" : ""} ${
        isSelectionMode ? "cursor-pointer" : ""
      } ${isSelected ? "bg-blue-50" : ""}`}
      onMouseEnter={() => !isPending && !isSelectionMode && setShowReactionPicker(true)}
      onMouseLeave={() => !showFullPicker && setShowReactionPicker(false)}
      onClick={handleClick}
    >
      {/* Selection checkbox */}
      {isSelectionMode && (
        <div className="flex-shrink-0 self-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.(message.id);
            }}
            className="w-5 h-5 rounded border border-gray-300 flex items-center justify-center transition-colors"
          >
            {isSelected ? (
              <CheckSquare className="w-4 h-4 text-blue-600" />
            ) : (
              <Square className="w-4 h-4 text-gray-400" />
            )}
          </button>
        </div>
      )}
      {/* Avatar */}
      {!isCurrentUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-gray-200 self-end">
          {message.sender.avatarUrl ? (
            <img
              src={message.sender.avatarUrl}
              alt={message.sender.displayName || "User"}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-blue-600 text-white text-xs font-medium">
              {message.sender.displayName?.charAt(0).toUpperCase() || "?"}
            </div>
          )}
        </div>
      )}

      {/* Message content */}
      <div className={`flex flex-col max-w-[70%] ${isCurrentUser ? "items-end" : "items-start"}`}>
        {/* Sender name (only for group chats, not for current user) */}
        {!isCurrentUser && (
          <span className="text-xs text-gray-500 mb-0.5 px-1">
            {message.sender.displayName || "Unknown"}
          </span>
        )}

        <div className="relative">
          <div
            className={`px-3 py-2 rounded-2xl ${
              isCurrentUser
                ? isPending
                  ? "bg-blue-400 text-white rounded-br-md"
                  : "bg-blue-600 text-white rounded-br-md"
                : "bg-gray-100 text-gray-900 rounded-bl-md"
            }`}
          >
            {renderMessageContent(message)}
          </div>

          {/* Quick reaction picker - shows on hover */}
          {showReactionPicker && !isPending && (
            <div
              ref={pickerRef}
              className={`absolute z-20 ${
                isCurrentUser
                  ? "right-0 -top-10"
                  : "left-0 -top-10"
              }`}
            >
              <QuickReactionPicker
                onSelect={handleReaction}
                onOpenFull={() => {
                  setShowFullPicker(true);
                  setShowReactionPicker(false);
                }}
                onReply={() => {
                  setShowReactionPicker(false);
                  onOpenThread?.(message.id);
                }}
                onForward={onForward ? () => {
                  setShowReactionPicker(false);
                  onForward(message.id);
                } : undefined}
                onPin={onPin ? () => {
                  setShowReactionPicker(false);
                  onPin(message.id);
                } : undefined}
                onFavorite={onFavorite ? () => {
                  setShowReactionPicker(false);
                  onFavorite(message.id);
                } : undefined}
                onEdit={onEdit ? () => {
                  setShowReactionPicker(false);
                  onEdit(message.id);
                } : undefined}
                onRecall={onRecall ? () => {
                  setShowReactionPicker(false);
                  onRecall(message.id);
                } : undefined}
                isPinned={isPinned}
                isFavorited={isFavorited}
                canEdit={isCurrentUser && !message.recalledAt && (message.type === "text" || message.type === "rich_text")}
                canRecall={isCurrentUser && !message.recalledAt}
                canForward={!message.recalledAt && message.type !== "system"}
              />
            </div>
          )}

          {/* Full emoji picker */}
          {showFullPicker && (
            <div
              ref={fullPickerRef}
              className={`absolute z-30 ${
                isCurrentUser
                  ? "right-0 bottom-full mb-2"
                  : "left-0 bottom-full mb-2"
              }`}
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
        </div>

        {/* Reactions display */}
        {message.reactions && message.reactions.length > 0 && (
          <ReactionDisplay
            reactions={message.reactions}
            onToggleReaction={(emoji) => handleReaction(emoji)}
          />
        )}

        {/* Thread reply indicator */}
        {message.replyCount && message.replyCount > 0 && (
          <button
            onClick={() => onOpenThread?.(message.id)}
            className="flex items-center gap-1.5 px-2 py-1 mt-1 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="font-medium">
              {message.replyCount} {message.replyCount === 1 ? "reply" : "replies"}
            </span>
          </button>
        )}

        {/* Timestamp, pending indicator, edited indicator, and read status */}
        <div className="flex items-center gap-1 px-1 mt-0.5">
          {isPending ? (
            <span className="text-[10px] text-gray-400 flex items-center gap-1">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              Sending...
            </span>
          ) : (
            <>
              <span className="text-[10px] text-gray-400">
                {formatMessageTime(message.createdAt)}
              </span>
              {message.editedAt && (
                <span className="text-[10px] text-gray-400">(edited)</span>
              )}
              {/* Read status icon (only for messages sent by current user) */}
              {isCurrentUser && readStatus && (
                <ReadStatusIcon
                  status={
                    readStatus.readCount === 0
                      ? "unread"
                      : readStatus.readCount >= readStatus.totalMembers
                        ? "all_read"
                        : "partial"
                  }
                  onClick={() => onShowReadReceipts?.(message.id)}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface PendingMessage {
  tempId: string;
  chatId: string;
  senderId: string;
  type: "text" | "rich_text";
  content: Record<string, unknown>;
  createdAt: string;
  sender: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  isPending: true;
}

interface TypingUser {
  userId: string;
  displayName: string;
}

function TypingIndicator({ typingUsers }: { typingUsers: TypingUser[] }) {
  if (typingUsers.length === 0) return null;

  const names = typingUsers.map((u) => u.displayName);
  let text: string;

  if (names.length === 1) {
    text = `${names[0]} is typing`;
  } else if (names.length === 2) {
    text = `${names[0]} and ${names[1]} are typing`;
  } else if (names.length === 3) {
    text = `${names[0]}, ${names[1]}, and ${names[2]} are typing`;
  } else {
    text = `${names[0]}, ${names[1]}, and ${names.length - 2} others are typing`;
  }

  return (
    <div className="flex items-center gap-2 px-4 py-1 text-xs text-gray-500">
      <div className="flex gap-0.5">
        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
      <span>{text}...</span>
    </div>
  );
}

function OnlineIndicator({ isOnline, size = "md" }: { isOnline: boolean; size?: "sm" | "md" }) {
  if (!isOnline) return null;

  const sizeClasses = size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3";

  return (
    <span
      className={`${sizeClasses} bg-green-500 rounded-full border-2 border-white absolute bottom-0 right-0`}
      title="Online"
    />
  );
}

interface ThreadPanelProps {
  parentMessageId: string;
  chatId: string;
  currentUserId: string;
  onClose: () => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  incomingMessage: Message | null;
  members: MentionUser[];
}

function ThreadPanel({
  parentMessageId,
  chatId,
  currentUserId,
  onClose,
  onTypingStart,
  onTypingStop,
  onToggleReaction,
  incomingMessage,
  members,
}: ThreadPanelProps) {
  const [parentMessage, setParentMessage] = useState<Message | null>(null);
  const [replies, setReplies] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const repliesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    repliesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  // Load thread data
  const loadThread = useCallback(async (cursor?: string) => {
    const token = getCookie("session_token");
    if (!token) return;

    if (!cursor) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const url = cursor
        ? `/api/messages/${parentMessageId}/thread?cursor=${cursor}&limit=50`
        : `/api/messages/${parentMessageId}/thread?limit=50`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error("Failed to load thread");
      }

      const data = await res.json();

      if (cursor) {
        setReplies((prev) => [...prev, ...data.replies]);
      } else {
        setParentMessage(data.parentMessage);
        setReplies(data.replies || []);
      }

      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load thread");
    } finally {
      setIsLoading(false);
    }
  }, [parentMessageId]);

  // Initial load
  useEffect(() => {
    loadThread();
  }, [loadThread]);

  // Scroll to bottom after initial load
  useEffect(() => {
    if (!isLoading && replies.length > 0) {
      scrollToBottom();
    }
  }, [isLoading, replies.length, scrollToBottom]);

  // Handle incoming WebSocket messages for this thread
  useEffect(() => {
    if (!incomingMessage) return;

    // Only add if it's a reply to this thread
    if (incomingMessage.threadId === parentMessageId) {
      setReplies((prev) => {
        if (prev.some((r) => r.id === incomingMessage.id)) {
          return prev;
        }
        return [...prev, incomingMessage];
      });
      setTimeout(() => scrollToBottom("smooth"), 50);
    }
  }, [incomingMessage, parentMessageId, scrollToBottom]);

  // Send reply
  const handleSendReply = useCallback(async (content: { html: string; text: string; mentions?: Array<{ id: string; displayName: string }> }) => {
    const text = content.text.trim();
    if (!text) return;

    const token = getCookie("session_token");
    if (!token) return;

    const hasFormatting = content.html !== `<p>${content.text}</p>` && content.html !== content.text;
    const messageType = hasFormatting ? "rich_text" : "text";
    const messageContent = hasFormatting
      ? { html: content.html, text: content.text, mentions: content.mentions }
      : { text, mentions: content.mentions };

    setIsSending(true);

    try {
      const res = await fetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: messageType,
          content: messageContent,
          thread_id: parentMessageId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send reply");
      }

      const newMessage = await res.json() as Message;
      setReplies((prev) => {
        if (prev.some((r) => r.id === newMessage.id)) {
          return prev;
        }
        return [...prev, newMessage];
      });
      setTimeout(() => scrollToBottom("smooth"), 50);
    } catch (err) {
      console.error("Failed to send reply:", err);
    } finally {
      setIsSending(false);
    }
  }, [chatId, parentMessageId, scrollToBottom]);

  return (
    <div className="w-96 border-l border-gray-200 bg-white flex flex-col h-full">
      {/* Thread Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-gray-500" />
          <h3 className="font-semibold text-gray-900">Thread</h3>
          <span className="text-sm text-gray-500">
            {replies.length} {replies.length === 1 ? "reply" : "replies"}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
          title="Close thread"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Thread Content */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            Loading thread...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-500">
            {error}
          </div>
        ) : (
          <>
            {/* Parent Message */}
            {parentMessage && (
              <div className="pb-3 mb-3 border-b border-gray-200">
                <div className="text-xs text-gray-500 mb-2 font-medium">Original message</div>
                <MessageBubble
                  message={parentMessage}
                  isCurrentUser={parentMessage.senderId === currentUserId}
                  onToggleReaction={onToggleReaction}
                />
              </div>
            )}

            {/* Replies */}
            {replies.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <MessageCircle className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No replies yet</p>
                <p className="text-xs mt-1">Be the first to reply</p>
              </div>
            ) : (
              <div className="space-y-1">
                {replies.map((reply) => (
                  <MessageBubble
                    key={reply.id}
                    message={reply}
                    isCurrentUser={reply.senderId === currentUserId}
                    onToggleReaction={onToggleReaction}
                  />
                ))}
              </div>
            )}

            {/* Load more button */}
            {hasMore && (
              <div className="text-center py-2">
                <button
                  onClick={() => nextCursor && loadThread(nextCursor)}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  Load more replies
                </button>
              </div>
            )}

            <div ref={repliesEndRef} />
          </>
        )}
      </div>

      {/* Reply Input */}
      <div className="flex-shrink-0 bg-white p-3 border-t border-gray-200">
        <MessageInput
          onSend={(content) => {
            onTypingStop();
            handleSendReply(content);
          }}
          onTypingStart={onTypingStart}
          onTypingStop={onTypingStop}
          isSending={isSending}
          placeholder="Reply in thread..."
          sendOnEnter={true}
          members={members}
        />
      </div>
    </div>
  );
}

function ChatView({
  chat,
  currentUserId,
  incomingMessage,
  updatedMessage,
  typingUsers,
  onTypingStart,
  onTypingStop,
  onlineUsers,
  onReadReceiptUpdate,
  reactionEvent,
}: {
  chat: Chat;
  currentUserId: string;
  incomingMessage: Message | null;
  updatedMessage: Message | null;
  typingUsers: TypingUser[];
  onTypingStart: () => void;
  onTypingStop: () => void;
  onlineUsers: Set<string>;
  onReadReceiptUpdate?: (event: ReadReceiptEvent) => void;
  reactionEvent?: ReactionEvent | null;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Read receipts tracking
  const [messageReadStatus, setMessageReadStatus] = useState<Record<string, { totalMembers: number; readCount: number }>>({});
  const [selectedMessageForReceipts, setSelectedMessageForReceipts] = useState<string | null>(null);
  const lastMarkedReadRef = useRef<string | null>(null);

  // Reactions state
  const [messageReactions, setMessageReactions] = useState<Record<string, Reaction[]>>({});

  // Pins and favorites state
  const [pinnedMessageIds, setPinnedMessageIds] = useState<Set<string>>(new Set());
  const [favoritedMessageIds, setFavoritedMessageIds] = useState<Set<string>>(new Set());
  const [showPinsPanel, setShowPinsPanel] = useState(false);

  // Thread panel state
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  // Chat members for @mention autocomplete
  const [chatMembers, setChatMembers] = useState<MentionUser[]>([]);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isInitialLoadRef = useRef(true);
  const prevScrollHeightRef = useRef<number>(0);

  // Scroll to bottom
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  // Mark messages as read
  const markAsRead = useCallback(async (lastMessageId: string) => {
    if (lastMarkedReadRef.current === lastMessageId) return;

    const token = getCookie("session_token");
    if (!token) return;

    try {
      const res = await fetch(`/api/chats/${chat.id}/read`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ last_message_id: lastMessageId }),
      });

      if (res.ok) {
        lastMarkedReadRef.current = lastMessageId;
      }
    } catch {
      // Silent fail - marking as read is not critical
    }
  }, [chat.id]);

  // Toggle reaction on a message
  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    const token = getCookie("session_token");
    if (!token) return;

    // Check if current user already has this reaction
    const currentReactions = messageReactions[messageId] || [];
    const existingReaction = currentReactions.find(r => r.emoji === emoji);
    const hasReaction = existingReaction?.hasCurrentUser;

    // Optimistic update
    setMessageReactions((prev) => {
      const reactions = [...(prev[messageId] || [])];
      const idx = reactions.findIndex(r => r.emoji === emoji);

      if (hasReaction) {
        // Remove reaction
        if (idx >= 0) {
          if (reactions[idx].count <= 1) {
            reactions.splice(idx, 1);
          } else {
            reactions[idx] = {
              ...reactions[idx],
              count: reactions[idx].count - 1,
              hasCurrentUser: false,
              users: reactions[idx].users.filter(u => u.userId !== currentUserId),
            };
          }
        }
      } else {
        // Add reaction
        if (idx >= 0) {
          reactions[idx] = {
            ...reactions[idx],
            count: reactions[idx].count + 1,
            hasCurrentUser: true,
            users: [...reactions[idx].users, { userId: currentUserId, displayName: null, avatarUrl: null }],
          };
        } else {
          reactions.push({
            emoji,
            count: 1,
            hasCurrentUser: true,
            users: [{ userId: currentUserId, displayName: null, avatarUrl: null }],
          });
        }
      }

      return { ...prev, [messageId]: reactions };
    });

    try {
      if (hasReaction) {
        // Remove reaction
        await fetch(`/api/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        // Add reaction
        await fetch(`/api/messages/${messageId}/reactions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ emoji }),
        });
      }
    } catch {
      // Revert optimistic update on error - reload reactions
      const res = await fetch(`/api/messages/${messageId}/reactions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessageReactions((prev) => ({ ...prev, [messageId]: data.reactions || [] }));
      }
    }
  }, [messageReactions, currentUserId]);

  // Handle incoming reaction events from WebSocket
  useEffect(() => {
    if (!reactionEvent) return;

    setMessageReactions((prev) => {
      const reactions = [...(prev[reactionEvent.messageId] || [])];
      const idx = reactions.findIndex(r => r.emoji === reactionEvent.emoji);

      if (reactionEvent.action === "add") {
        if (idx >= 0) {
          // Don't add duplicate if it's the current user (already added optimistically)
          const userExists = reactions[idx].users.some(u => u.userId === reactionEvent.userId);
          if (!userExists) {
            reactions[idx] = {
              ...reactions[idx],
              count: reactions[idx].count + 1,
              users: [...reactions[idx].users, { userId: reactionEvent.userId, displayName: reactionEvent.displayName, avatarUrl: null }],
              hasCurrentUser: reactions[idx].hasCurrentUser || reactionEvent.userId === currentUserId,
            };
          }
        } else {
          reactions.push({
            emoji: reactionEvent.emoji,
            count: 1,
            hasCurrentUser: reactionEvent.userId === currentUserId,
            users: [{ userId: reactionEvent.userId, displayName: reactionEvent.displayName, avatarUrl: null }],
          });
        }
      } else if (reactionEvent.action === "remove") {
        if (idx >= 0) {
          if (reactions[idx].count <= 1) {
            reactions.splice(idx, 1);
          } else {
            reactions[idx] = {
              ...reactions[idx],
              count: reactions[idx].count - 1,
              users: reactions[idx].users.filter(u => u.userId !== reactionEvent.userId),
              hasCurrentUser: reactionEvent.userId === currentUserId ? false : reactions[idx].hasCurrentUser,
            };
          }
        }
      }

      return { ...prev, [reactionEvent.messageId]: reactions };
    });
  }, [reactionEvent, currentUserId]);

  // Handle message updates (edits and recalls) via WebSocket
  useEffect(() => {
    if (!updatedMessage || updatedMessage.chatId !== chat.id) return;

    setMessages((prev) =>
      prev.map((m) => (m.id === updatedMessage.id ? { ...m, ...updatedMessage } : m))
    );
  }, [updatedMessage, chat.id]);

  // Toggle pin on a message
  const togglePin = useCallback(async (messageId: string) => {
    const token = getCookie("session_token");
    if (!token) return;

    const isPinned = pinnedMessageIds.has(messageId);

    // Optimistic update
    setPinnedMessageIds((prev) => {
      const next = new Set(prev);
      if (isPinned) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });

    try {
      if (isPinned) {
        await fetch(`/api/chats/${chat.id}/pins/${messageId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        await fetch(`/api/chats/${chat.id}/pins/${messageId}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // Revert optimistic update on error
      setPinnedMessageIds((prev) => {
        const next = new Set(prev);
        if (isPinned) {
          next.add(messageId);
        } else {
          next.delete(messageId);
        }
        return next;
      });
    }
  }, [chat.id, pinnedMessageIds]);

  // Toggle favorite on a message
  const toggleFavorite = useCallback(async (messageId: string) => {
    const token = getCookie("session_token");
    if (!token) return;

    const isFavorited = favoritedMessageIds.has(messageId);

    // Optimistic update
    setFavoritedMessageIds((prev) => {
      const next = new Set(prev);
      if (isFavorited) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });

    try {
      if (isFavorited) {
        await fetch(`/api/messages/${messageId}/favorite`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        await fetch(`/api/messages/${messageId}/favorite`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // Revert optimistic update on error
      setFavoritedMessageIds((prev) => {
        const next = new Set(prev);
        if (isFavorited) {
          next.add(messageId);
        } else {
          next.delete(messageId);
        }
        return next;
      });
    }
  }, [favoritedMessageIds]);

  // Edit message state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState<Record<string, unknown> | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Start editing a message
  const startEditing = useCallback((messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (!message) return;
    setEditingMessageId(messageId);
    setEditingContent(message.content);
  }, [messages]);

  // Cancel editing
  const cancelEditing = useCallback(() => {
    setEditingMessageId(null);
    setEditingContent(null);
  }, []);

  // Save edited message
  const saveEdit = useCallback(async (newContent: Record<string, unknown>) => {
    if (!editingMessageId) return;

    const token = getCookie("session_token");
    if (!token) return;

    setIsEditing(true);

    try {
      const res = await fetch(`/api/messages/${editingMessageId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: newContent }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to edit message");
      }

      const updatedMessage = await res.json();

      // Update local state
      setMessages((prev) =>
        prev.map((m) => (m.id === editingMessageId ? { ...m, ...updatedMessage } : m))
      );

      cancelEditing();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to edit message");
    } finally {
      setIsEditing(false);
    }
  }, [editingMessageId, cancelEditing]);

  // Recall (delete) a message
  const recallMessage = useCallback(async (messageId: string) => {
    const token = getCookie("session_token");
    if (!token) return;

    // Ask for confirmation
    if (!window.confirm("Are you sure you want to recall this message? This cannot be undone.")) {
      return;
    }

    try {
      const res = await fetch(`/api/messages/${messageId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to recall message");
      }

      const updatedMessage = await res.json();

      // Update local state
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, ...updatedMessage } : m))
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to recall message");
    }
  }, []);

  // Forward message state
  const [forwardingMessageId, setForwardingMessageId] = useState<string | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [showForwardModal, setShowForwardModal] = useState(false);

  // Open forward modal for a message
  const openForwardModal = useCallback((messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (!message) return;
    setForwardingMessageId(messageId);
    setForwardingMessage(message);
    setShowForwardModal(true);
  }, [messages]);

  // Close forward modal
  const closeForwardModal = useCallback(() => {
    setShowForwardModal(false);
    setForwardingMessageId(null);
    setForwardingMessage(null);
  }, []);

  // Multi-select mode for combining and forwarding multiple messages
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const [showMultiForwardModal, setShowMultiForwardModal] = useState(false);

  // Toggle selection mode
  const toggleSelectionMode = useCallback(() => {
    setIsSelectionMode((prev) => {
      if (prev) {
        // Exiting selection mode - clear selections
        setSelectedMessageIds(new Set());
      }
      return !prev;
    });
  }, []);

  // Toggle message selection
  const toggleMessageSelection = useCallback((messageId: string) => {
    setSelectedMessageIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  }, []);

  // Get selected messages in order
  const selectedMessages = useMemo(() => {
    return messages.filter((m) => selectedMessageIds.has(m.id));
  }, [messages, selectedMessageIds]);

  // Open multi-forward modal
  const openMultiForwardModal = useCallback(() => {
    if (selectedMessageIds.size > 0) {
      setShowMultiForwardModal(true);
    }
  }, [selectedMessageIds.size]);

  // Close multi-forward modal
  const closeMultiForwardModal = useCallback(() => {
    setShowMultiForwardModal(false);
    setIsSelectionMode(false);
    setSelectedMessageIds(new Set());
  }, []);

  // Load pinned messages for this chat
  const loadPinnedMessages = useCallback(async () => {
    const token = getCookie("session_token");
    if (!token) return;

    try {
      const res = await fetch(`/api/chats/${chat.id}/pins`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const pinnedIds = new Set<string>(data.pins.map((p: { message: { id: string } }) => p.message.id));
        setPinnedMessageIds(pinnedIds);
      }
    } catch {
      // Silent fail
    }
  }, [chat.id]);

  // Load user's favorites
  const loadFavorites = useCallback(async () => {
    const token = getCookie("session_token");
    if (!token) return;

    try {
      const res = await fetch("/api/favorites", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const favoriteIds = new Set<string>(data.favorites.map((f: { message: { id: string } }) => f.message.id));
        setFavoritedMessageIds(favoriteIds);
      }
    } catch {
      // Silent fail
    }
  }, []);

  // Load messages
  const loadMessages = useCallback(async (cursor?: string) => {
    const token = getCookie("session_token");
    if (!token) return;

    if (cursor) {
      setIsLoadingMore(true);
      // Store current scroll height before loading more
      if (messagesContainerRef.current) {
        prevScrollHeightRef.current = messagesContainerRef.current.scrollHeight;
      }
    } else {
      setIsLoading(true);
      isInitialLoadRef.current = true;
    }
    setError(null);

    try {
      const url = cursor
        ? `/api/chats/${chat.id}/messages?cursor=${cursor}&limit=50`
        : `/api/chats/${chat.id}/messages?limit=50`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error("Failed to load messages");
      }

      const data = await res.json();
      // API returns newest first, reverse for display (oldest at top)
      const newMessages = (data.messages as Message[]).reverse();

      if (cursor) {
        // Prepend older messages
        setMessages((prev) => [...newMessages, ...prev]);
      } else {
        setMessages(newMessages);
      }

      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [chat.id]);

  // Initial load and reload when chat changes
  useEffect(() => {
    setMessages([]);
    setPendingMessages([]);
    setNextCursor(null);
    setHasMore(false);
    setMessageReadStatus({});
    setMessageReactions({});
    setSelectedMessageForReceipts(null);
    setActiveThreadId(null);
    setShowPinsPanel(false);
    lastMarkedReadRef.current = null;
    loadMessages();
    loadPinnedMessages();
    loadFavorites();
  }, [chat.id, loadMessages, loadPinnedMessages, loadFavorites]);

  // Fetch chat members for @mention autocomplete
  useEffect(() => {
    const fetchMembers = async () => {
      const token = getCookie("session_token");
      if (!token) return;

      try {
        const res = await fetch(`/api/chats/${chat.id}/members`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          // Filter out current user from mention suggestions
          const members = (data.members || [])
            .filter((m: { userId: string }) => m.userId !== currentUserId)
            .map((m: { userId: string; displayName: string | null; avatarUrl: string | null }) => ({
              id: m.userId,
              displayName: m.displayName,
              avatarUrl: m.avatarUrl,
            }));
          setChatMembers(members);
        }
      } catch {
        // Silent fail - mentions are not critical
      }
    };

    fetchMembers();
  }, [chat.id, currentUserId]);

  // Handle incoming read receipt events
  useEffect(() => {
    if (!onReadReceiptUpdate) return;

    // When we receive a read receipt, we need to update the read status for messages
    // This is handled by the parent component passing down the event
  }, [onReadReceiptUpdate]);

  // Handle incoming WebSocket messages
  useEffect(() => {
    if (!incomingMessage || incomingMessage.chatId !== chat.id) return;

    // If this is a thread reply, update the parent message's reply count instead of adding to main list
    if (incomingMessage.threadId) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === incomingMessage.threadId
            ? { ...m, replyCount: (m.replyCount || 0) + 1 }
            : m
        )
      );
      // Don't add thread replies to the main message list
      return;
    }

    setMessages((prev) => {
      // Check if message already exists (to avoid duplicates)
      if (prev.some((m) => m.id === incomingMessage.id)) {
        return prev;
      }
      return [...prev, incomingMessage];
    });

    // Clear any matching pending messages (optimistic UI confirmation)
    setPendingMessages((prev) =>
      prev.filter((p) => {
        // Match by content similarity (simple heuristic)
        if (incomingMessage.senderId !== p.senderId) return true;
        const incomingText = (incomingMessage.content?.text as string) || "";
        const pendingText = (p.content?.text as string) || "";
        return incomingText !== pendingText;
      })
    );

    // Scroll to bottom for new messages
    setTimeout(() => scrollToBottom("smooth"), 50);

    // Mark as read if the message is from someone else
    if (incomingMessage.senderId !== currentUserId) {
      markAsRead(incomingMessage.id);
    }
  }, [incomingMessage, chat.id, scrollToBottom, currentUserId, markAsRead]);

  // Scroll to bottom on initial load and mark as read
  useEffect(() => {
    if (!isLoading && isInitialLoadRef.current && messages.length > 0) {
      scrollToBottom();
      isInitialLoadRef.current = false;

      // Mark the latest message as read (only if not from current user)
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.senderId !== currentUserId) {
        markAsRead(lastMessage.id);
      }
    }
  }, [isLoading, messages.length, scrollToBottom, messages, currentUserId, markAsRead]);

  // Maintain scroll position after loading more messages
  useEffect(() => {
    if (!isLoadingMore && messagesContainerRef.current && prevScrollHeightRef.current > 0) {
      const newScrollHeight = messagesContainerRef.current.scrollHeight;
      const scrollDiff = newScrollHeight - prevScrollHeightRef.current;
      messagesContainerRef.current.scrollTop = scrollDiff;
      prevScrollHeightRef.current = 0;
    }
  }, [isLoadingMore, messages]);

  // Initialize read status for own messages
  // For DMs: 1 other member, check if they've read past this message
  // For groups: need total member count minus 1 (excluding sender)
  useEffect(() => {
    if (messages.length === 0) return;

    // Get messages sent by current user that don't have status yet
    const ownMessages = messages.filter(
      (m) => m.senderId === currentUserId && !m.id.startsWith("pending-") && m.type !== "system"
    );

    if (ownMessages.length === 0) return;

    // For DMs, we can infer read status based on chat.unreadCount
    // If unreadCount is 0, the other user has read all messages
    if (chat.type === "dm") {
      const totalMembers = 1; // 1 other member in DM
      const newStatus: Record<string, { totalMembers: number; readCount: number }> = {};

      ownMessages.forEach((msg) => {
        if (!messageReadStatus[msg.id]) {
          // For now, assume all are read if unreadCount is 0
          // In reality, we'd need to fetch actual receipt status
          newStatus[msg.id] = {
            totalMembers,
            readCount: chat.unreadCount === 0 ? 1 : 0,
          };
        }
      });

      if (Object.keys(newStatus).length > 0) {
        setMessageReadStatus((prev) => ({ ...prev, ...newStatus }));
      }
    } else {
      // For group chats, initialize with totalMembers-1 and 0 readCount
      // Real read count would need to be fetched from API
      const totalMembers = Math.max(0, chat.memberCount - 1);
      const newStatus: Record<string, { totalMembers: number; readCount: number }> = {};

      ownMessages.forEach((msg) => {
        if (!messageReadStatus[msg.id]) {
          newStatus[msg.id] = {
            totalMembers,
            readCount: 0, // Unknown until fetched
          };
        }
      });

      if (Object.keys(newStatus).length > 0) {
        setMessageReadStatus((prev) => ({ ...prev, ...newStatus }));
      }
    }
  }, [messages, currentUserId, chat.type, chat.unreadCount, chat.memberCount, messageReadStatus]);

  // Handle scroll for infinite loading
  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current || isLoadingMore || !hasMore) return;

    const { scrollTop } = messagesContainerRef.current;
    // Load more when scrolled near the top (within 100px)
    if (scrollTop < 100 && nextCursor) {
      loadMessages(nextCursor);
    }
  }, [isLoadingMore, hasMore, nextCursor, loadMessages]);

  // Send message with optimistic UI
  const handleSendMessage = useCallback(async (content: { html: string; text: string; mentions?: Array<{ id: string; displayName: string }> }) => {
    const text = content.text.trim();
    if (!text) return;

    const token = getCookie("session_token");
    if (!token) return;

    // Determine message type based on content
    const hasFormatting = content.html !== `<p>${content.text}</p>` && content.html !== content.text;
    const messageType = hasFormatting ? "rich_text" : "text";
    const messageContent = hasFormatting
      ? { html: content.html, text: content.text, mentions: content.mentions }
      : { text, mentions: content.mentions };

    // Create optimistic pending message
    const tempId = `pending-${Date.now()}-${Math.random().toString(36).substring(2)}`;
    const pendingMessage: PendingMessage = {
      tempId,
      chatId: chat.id,
      senderId: currentUserId,
      type: messageType as "text" | "rich_text",
      content: messageContent,
      createdAt: new Date().toISOString(),
      sender: {
        id: currentUserId,
        displayName: null, // Will appear as current user anyway
        avatarUrl: null,
      },
      isPending: true,
    };

    // Add to pending messages immediately (optimistic)
    setPendingMessages((prev) => [...prev, pendingMessage]);
    setTimeout(() => scrollToBottom("smooth"), 50);

    setIsSending(true);

    try {
      const res = await fetch(`/api/chats/${chat.id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: messageType,
          content: messageContent,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send message");
      }

      // Message sent successfully - WebSocket will deliver the confirmed message
      // Remove the pending message since the real one will arrive via WebSocket
      setPendingMessages((prev) => prev.filter((p) => p.tempId !== tempId));

      // Also add to local state in case WebSocket is delayed
      const newMessage = await res.json() as Message;
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMessage.id)) {
          return prev;
        }
        return [...prev, newMessage];
      });
    } catch (err) {
      console.error("Failed to send message:", err);
      // Remove the pending message on failure
      setPendingMessages((prev) => prev.filter((p) => p.tempId !== tempId));
    } finally {
      setIsSending(false);
    }
  }, [chat.id, currentUserId, scrollToBottom]);

  // Combine regular messages with pending messages for display
  const allMessages = useMemo(() => {
    const pendingAsMessages: Message[] = pendingMessages.map((p) => ({
      id: p.tempId,
      chatId: p.chatId,
      senderId: p.senderId,
      type: p.type,
      content: p.content,
      threadId: null,
      replyToId: null,
      forwardedFromMessageId: null,
      forwardedFromChatId: null,
      editedAt: null,
      recalledAt: null,
      scheduledFor: null,
      createdAt: p.createdAt,
      sender: p.sender,
    }));
    return [...messages, ...pendingAsMessages];
  }, [messages, pendingMessages]);

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: { date: string; dateLabel: string; messages: Message[] }[] = [];
    let currentDateKey = "";

    for (const message of allMessages) {
      const dateKey = getDateKey(message.createdAt);

      if (dateKey !== currentDateKey) {
        currentDateKey = dateKey;
        groups.push({
          date: dateKey,
          dateLabel: formatDateSeparator(message.createdAt),
          messages: [message],
        });
      } else {
        groups[groups.length - 1].messages.push(message);
      }
    }

    return groups;
  }, [allMessages]);

  // For DMs, count online members (excluding current user)
  const onlineMemberCount = useMemo(() => {
    // We don't have member IDs in the chat object, but for DMs we can check presence
    // For group chats, this would need member list from API
    return 0; // Will be populated when we have member data
  }, [onlineUsers]);

  return (
    <div className="flex h-full">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full">
        {/* Chat Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          {/* Avatar with online indicator */}
          <div className="relative w-10 h-10">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200">
              {chat.avatarUrl ? (
                <img src={chat.avatarUrl} alt={chat.name || "Chat"} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-blue-600 text-white font-medium">
                  {chat.type === "dm" ? (
                    chat.name?.charAt(0).toUpperCase() || "?"
                  ) : (
                    <Users className="w-5 h-5" />
                  )}
                </div>
              )}
            </div>
            {/* For DMs, show online indicator if the other user is online */}
            {chat.type === "dm" && typingUsers.length === 0 && (
              <OnlineIndicator isOnline={onlineUsers.size > 0} />
            )}
          </div>

          {/* Name and status */}
          <div>
            <h2 className="font-semibold text-gray-900">{chat.name || "Chat"}</h2>
            <p className="text-xs text-gray-500">
              {typingUsers.length > 0 ? (
                <span className="text-blue-600">typing...</span>
              ) : chat.type === "dm" ? (
                onlineUsers.size > 0 ? "Online" : "Offline"
              ) : (
                `${chat.memberCount} member${chat.memberCount !== 1 ? "s" : ""}`
              )}
            </p>
          </div>
        </div>

        {/* Header buttons */}
        <div className="flex items-center gap-1">
          {/* Selection mode toggle */}
          <button
            onClick={toggleSelectionMode}
            className={`p-2 rounded-full hover:bg-gray-100 transition-colors ${
              isSelectionMode ? "bg-blue-100 text-blue-600" : "text-gray-500"
            }`}
            title={isSelectionMode ? "Exit selection mode" : "Select messages"}
          >
            <CheckSquare className="w-5 h-5" />
          </button>
          {/* Pins button */}
          <button
            onClick={() => setShowPinsPanel(!showPinsPanel)}
            className={`p-2 rounded-full hover:bg-gray-100 transition-colors ${
              showPinsPanel ? "bg-blue-100 text-blue-600" : "text-gray-500"
            }`}
            title={`${pinnedMessageIds.size} pinned message${pinnedMessageIds.size !== 1 ? "s" : ""}`}
          >
            <Pin className="w-5 h-5" />
          </button>
          {/* Info button */}
          <button
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
            title="Chat info"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Selection mode toolbar */}
      {isSelectionMode && (
        <div className="flex items-center justify-between px-4 py-2 bg-blue-50 border-b border-blue-100">
          <div className="text-sm text-blue-700">
            {selectedMessageIds.size > 0
              ? `${selectedMessageIds.size} message${selectedMessageIds.size > 1 ? "s" : ""} selected`
              : "Select messages to forward"}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setIsSelectionMode(false);
                setSelectedMessageIds(new Set());
              }}
              className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={openMultiForwardModal}
              disabled={selectedMessageIds.size === 0}
              className="flex items-center gap-1.5 px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Forward className="w-4 h-4" />
              Forward{selectedMessageIds.size > 1 ? ` (${selectedMessageIds.size})` : ""}
            </button>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-2 bg-gray-50"
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            Loading messages...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-500">
            {error}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <MessageCircle className="w-12 h-12 mb-3 text-gray-300" />
            <p className="text-sm">No messages yet</p>
            <p className="text-xs mt-1">Send a message to start the conversation</p>
          </div>
        ) : (
          <>
            {/* Loading more indicator */}
            {isLoadingMore && (
              <div className="text-center py-2 text-gray-500 text-sm">
                Loading older messages...
              </div>
            )}

            {/* Load more button (if at top and has more) */}
            {hasMore && !isLoadingMore && (
              <div className="text-center py-2">
                <button
                  onClick={() => nextCursor && loadMessages(nextCursor)}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  Load older messages
                </button>
              </div>
            )}

            {/* Messages grouped by date */}
            {groupedMessages.map((group) => (
              <div key={group.date}>
                {/* Date separator */}
                <div className="flex items-center justify-center my-4">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="px-3 text-xs text-gray-500 font-medium">
                    {group.dateLabel}
                  </span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                {/* Messages for this date */}
                {group.messages.map((message) => {
                  // Merge message reactions from state
                  const messageWithReactions = {
                    ...message,
                    reactions: messageReactions[message.id] || message.reactions || [],
                  };
                  return (
                    <div key={message.id} className="relative">
                      <MessageBubble
                        message={messageWithReactions}
                        isCurrentUser={message.senderId === currentUserId}
                        readStatus={messageReadStatus[message.id]}
                        onShowReadReceipts={setSelectedMessageForReceipts}
                        onToggleReaction={toggleReaction}
                        onOpenThread={setActiveThreadId}
                        onPin={togglePin}
                        onFavorite={toggleFavorite}
                        onEdit={startEditing}
                        onRecall={recallMessage}
                        onForward={openForwardModal}
                        isPinned={pinnedMessageIds.has(message.id)}
                        isFavorited={favoritedMessageIds.has(message.id)}
                        isSelectionMode={isSelectionMode}
                        isSelected={selectedMessageIds.has(message.id)}
                        onToggleSelect={toggleMessageSelection}
                      />
                      {/* Read receipts popover */}
                      {selectedMessageForReceipts === message.id && (
                        <ReadReceiptsPopover
                          messageId={message.id}
                          isOpen={true}
                          onClose={() => setSelectedMessageForReceipts(null)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Scroll anchor */}
            <div ref={messagesEndRef} />
          </>
        )}
        </div>

        {/* Typing Indicator */}
        <TypingIndicator typingUsers={typingUsers} />

        {/* Message Input */}
        <div className="flex-shrink-0 bg-white p-3">
          <MessageInput
            onSend={(content) => {
              onTypingStop();
              handleSendMessage(content);
            }}
            onTypingStart={onTypingStart}
            onTypingStop={onTypingStop}
            isSending={isSending}
            placeholder="Type a message..."
            sendOnEnter={true}
            members={chatMembers}
          />
        </div>
      </div>

      {/* Thread Panel */}
      {activeThreadId && (
        <ThreadPanel
          parentMessageId={activeThreadId}
          chatId={chat.id}
          currentUserId={currentUserId}
          onClose={() => setActiveThreadId(null)}
          onTypingStart={onTypingStart}
          onTypingStop={onTypingStop}
          onToggleReaction={toggleReaction}
          incomingMessage={incomingMessage}
          members={chatMembers}
        />
      )}

      {/* Pins Panel */}
      {showPinsPanel && (
        <PinsPanel
          chatId={chat.id}
          onClose={() => setShowPinsPanel(false)}
          onUnpin={(messageId) => {
            togglePin(messageId);
          }}
        />
      )}

      {/* Edit Message Modal */}
      <Dialog.Root open={!!editingMessageId} onOpenChange={(open) => !open && cancelEditing()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl z-50 w-full max-w-lg p-6">
            <Dialog.Title className="text-lg font-semibold mb-4">Edit Message</Dialog.Title>
            {editingContent && (
              <div className="space-y-4">
                <MessageInput
                  onSend={(content) => saveEdit(content)}
                  isSending={isEditing}
                  placeholder="Edit your message..."
                  sendOnEnter={true}
                  members={chatMembers}
                  initialContent={editingContent}
                  submitLabel="Save"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={cancelEditing}
                    disabled={isEditing}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Forward Message Modal */}
      {showForwardModal && forwardingMessage && (
        <ForwardMessageModal
          messageId={forwardingMessageId!}
          message={forwardingMessage}
          onClose={closeForwardModal}
        />
      )}

      {/* Multi-Forward Modal */}
      {showMultiForwardModal && selectedMessages.length > 0 && (
        <MultiForwardModal
          messages={selectedMessages}
          currentChatId={chat.id}
          onClose={closeMultiForwardModal}
        />
      )}
    </div>
  );
}

// Forward Message Modal Component
function ForwardMessageModal({
  messageId,
  message,
  onClose,
}: {
  messageId: string;
  message: Message;
  onClose: () => void;
}) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChats, setSelectedChats] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isForwarding, setIsForwarding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load user's chats
  useEffect(() => {
    const loadChats = async () => {
      const token = getCookie("session_token");
      if (!token) return;

      setIsLoading(true);
      try {
        const res = await fetch("/api/chats?limit=100", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          // Filter out the current chat where the message is from
          setChats(data.chats.filter((c: Chat) => c.id !== message.chatId));
        }
      } catch {
        setError("Failed to load chats");
      } finally {
        setIsLoading(false);
      }
    };
    loadChats();
  }, [message.chatId]);

  // Filter chats by search query
  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return chats;
    const query = searchQuery.toLowerCase();
    return chats.filter((chat) =>
      chat.name?.toLowerCase().includes(query)
    );
  }, [chats, searchQuery]);

  // Toggle chat selection
  const toggleChat = (chatId: string) => {
    setSelectedChats((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(chatId)) {
        newSet.delete(chatId);
      } else {
        newSet.add(chatId);
      }
      return newSet;
    });
  };

  // Forward message to selected chats
  const handleForward = async () => {
    if (selectedChats.size === 0) return;

    const token = getCookie("session_token");
    if (!token) return;

    setIsForwarding(true);
    setError(null);

    try {
      const res = await fetch(`/api/messages/${messageId}/forward`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ chat_ids: Array.from(selectedChats) }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to forward message");
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to forward message");
    } finally {
      setIsForwarding(false);
    }
  };

  return (
    <Dialog.Root open={true} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl z-50 w-full max-w-md max-h-[80vh] flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <Dialog.Title className="text-lg font-semibold">Forward Message</Dialog.Title>
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Message Preview */}
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <div className="text-xs text-gray-500 mb-1">Message to forward:</div>
            <div className="text-sm text-gray-700 line-clamp-2">
              {message.content.text ? String(message.content.text) : "[Message]"}
            </div>
          </div>

          {/* Search */}
          <div className="p-3 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search chats..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Chat List */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : filteredChats.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {searchQuery ? "No chats found" : "No other chats available"}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredChats.map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => toggleChat(chat.id)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="relative">
                      {selectedChats.has(chat.id) ? (
                        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
                          <Check className="w-5 h-5 text-white" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                          {chat.type === "dm" ? (
                            <MessageCircle className="w-5 h-5 text-gray-500" />
                          ) : (
                            <Users className="w-5 h-5 text-gray-500" />
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">
                        {chat.name || "Chat"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {chat.type === "dm" ? "Direct message" : `${chat.memberCount} members`}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="px-4 py-2 bg-red-50 text-red-600 text-sm border-t border-red-100">
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="p-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              {selectedChats.size > 0
                ? `${selectedChats.size} chat${selectedChats.size > 1 ? "s" : ""} selected`
                : "Select chats to forward to"}
            </div>
            <button
              onClick={handleForward}
              disabled={selectedChats.size === 0 || isForwarding}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isForwarding ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Forwarding...
                </>
              ) : (
                <>
                  <Forward className="w-4 h-4" />
                  Forward
                </>
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Multi-Forward Message Modal Component (for combining and forwarding multiple messages)
function MultiForwardModal({
  messages: selectedMessages,
  currentChatId,
  onClose,
}: {
  messages: Message[];
  currentChatId: string;
  onClose: () => void;
}) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChats, setSelectedChats] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isForwarding, setIsForwarding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [combineMessages, setCombineMessages] = useState(selectedMessages.length > 1);

  // Load user's chats
  useEffect(() => {
    const loadChats = async () => {
      const token = getCookie("session_token");
      if (!token) return;

      setIsLoading(true);
      try {
        const res = await fetch("/api/chats?limit=100", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          // Filter out the current chat
          setChats(data.chats.filter((c: Chat) => c.id !== currentChatId));
        }
      } catch {
        setError("Failed to load chats");
      } finally {
        setIsLoading(false);
      }
    };
    loadChats();
  }, [currentChatId]);

  // Filter chats by search query
  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return chats;
    const query = searchQuery.toLowerCase();
    return chats.filter((chat) =>
      chat.name?.toLowerCase().includes(query)
    );
  }, [chats, searchQuery]);

  // Toggle chat selection
  const toggleChat = (chatId: string) => {
    setSelectedChats((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(chatId)) {
        newSet.delete(chatId);
      } else {
        newSet.add(chatId);
      }
      return newSet;
    });
  };

  // Forward messages to selected chats
  const handleForward = async () => {
    if (selectedChats.size === 0) return;

    const token = getCookie("session_token");
    if (!token) return;

    setIsForwarding(true);
    setError(null);

    try {
      const res = await fetch("/api/messages/forward-multiple", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message_ids: selectedMessages.map((m) => m.id),
          chat_ids: Array.from(selectedChats),
          combine: combineMessages,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to forward messages");
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to forward messages");
    } finally {
      setIsForwarding(false);
    }
  };

  return (
    <Dialog.Root open={true} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl z-50 w-full max-w-md max-h-[80vh] flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <Dialog.Title className="text-lg font-semibold">
              Forward {selectedMessages.length} Message{selectedMessages.length > 1 ? "s" : ""}
            </Dialog.Title>
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Message Preview */}
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 max-h-32 overflow-y-auto">
            <div className="text-xs text-gray-500 mb-1">Messages to forward:</div>
            <div className="space-y-1">
              {selectedMessages.slice(0, 3).map((msg) => (
                <div key={msg.id} className="text-sm text-gray-700 truncate">
                  <span className="font-medium">{msg.sender.displayName || "Unknown"}: </span>
                  {msg.content.text ? String(msg.content.text) : "[Message]"}
                </div>
              ))}
              {selectedMessages.length > 3 && (
                <div className="text-xs text-gray-500">
                  +{selectedMessages.length - 3} more message{selectedMessages.length - 3 > 1 ? "s" : ""}
                </div>
              )}
            </div>
          </div>

          {/* Combine option (only show for multiple messages) */}
          {selectedMessages.length > 1 && (
            <div className="px-4 py-2 border-b border-gray-200">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={combineMessages}
                  onChange={(e) => setCombineMessages(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Combine into single message bundle</span>
              </label>
            </div>
          )}

          {/* Search */}
          <div className="p-3 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search chats..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Chat List */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : filteredChats.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {searchQuery ? "No chats found" : "No other chats available"}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredChats.map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => toggleChat(chat.id)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="relative">
                      {selectedChats.has(chat.id) ? (
                        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
                          <Check className="w-5 h-5 text-white" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                          {chat.type === "dm" ? (
                            <MessageCircle className="w-5 h-5 text-gray-500" />
                          ) : (
                            <Users className="w-5 h-5 text-gray-500" />
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">
                        {chat.name || "Chat"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {chat.type === "dm" ? "Direct message" : `${chat.memberCount} members`}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="px-4 py-2 bg-red-50 text-red-600 text-sm border-t border-red-100">
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="p-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              {selectedChats.size > 0
                ? `${selectedChats.size} chat${selectedChats.size > 1 ? "s" : ""} selected`
                : "Select chats to forward to"}
            </div>
            <button
              onClick={handleForward}
              disabled={selectedChats.size === 0 || isForwarding}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isForwarding ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Forwarding...
                </>
              ) : (
                <>
                  <Forward className="w-4 h-4" />
                  Forward
                </>
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface PinnedMessage {
  pin: {
    chatId: string;
    messageId: string;
    pinnedBy: string;
    pinnedAt: string;
  };
  message: {
    id: string;
    chatId: string;
    senderId: string;
    type: string;
    content: Record<string, unknown>;
    createdAt: string;
  };
  sender: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

function PinsPanel({
  chatId,
  onClose,
  onUnpin,
}: {
  chatId: string;
  onClose: () => void;
  onUnpin: (messageId: string) => void;
}) {
  const [pins, setPins] = useState<PinnedMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadPins = async () => {
      const token = getCookie("session_token");
      if (!token) return;

      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/chats/${chatId}/pins`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          throw new Error("Failed to load pinned messages");
        }

        const data = await res.json();
        setPins(data.pins || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setIsLoading(false);
      }
    };

    loadPins();
  }, [chatId]);

  const handleUnpin = (messageId: string) => {
    setPins((prev) => prev.filter((p) => p.message.id !== messageId));
    onUnpin(messageId);
  };

  return (
    <div className="w-80 border-l border-gray-200 bg-white flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Pin className="w-5 h-5 text-gray-500" />
          <h3 className="font-semibold text-gray-900">Pinned Messages</h3>
          <span className="text-sm text-gray-500">({pins.length})</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-gray-500">
            Loading...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-32 text-red-500">
            {error}
          </div>
        ) : pins.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500">
            <Pin className="w-8 h-8 mb-2 text-gray-300" />
            <p className="text-sm">No pinned messages</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {pins.map((pin) => (
              <div key={pin.message.id} className="p-3 hover:bg-gray-50">
                <div className="flex items-start gap-2">
                  {/* Sender avatar */}
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                    {pin.sender.avatarUrl ? (
                      <img
                        src={pin.sender.avatarUrl}
                        alt={pin.sender.displayName || "User"}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-blue-600 text-white text-xs font-medium">
                        {pin.sender.displayName?.charAt(0).toUpperCase() || "?"}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">
                        {pin.sender.displayName || "Unknown"}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatTimestamp(pin.message.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">
                      {typeof pin.message.content.text === "string"
                        ? pin.message.content.text
                        : typeof pin.message.content.html === "string"
                          ? pin.message.content.html.replace(/<[^>]*>/g, "")
                          : "Message"}
                    </p>
                    <button
                      onClick={() => handleUnpin(pin.message.id)}
                      className="text-xs text-red-500 hover:text-red-600 mt-1"
                    >
                      Unpin
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatRow({
  chat,
  isSelected,
  onClick,
  isOnline,
  onUpdateChat,
}: {
  chat: Chat;
  isSelected: boolean;
  onClick: () => void;
  isOnline?: boolean;
  onUpdateChat: (chatId: string, updates: Partial<Pick<Chat, "muted" | "done" | "pinned" | "label">>) => void;
}) {
  const preview = getMessagePreview(chat.lastMessage);
  const timestamp = chat.lastMessage ? formatTimestamp(chat.lastMessage.createdAt) : formatTimestamp(chat.createdAt);
  const [isLabelDialogOpen, setIsLabelDialogOpen] = useState(false);
  const [labelInput, setLabelInput] = useState(chat.label || "");

  const handleContextAction = async (action: "mute" | "done" | "pin" | "label", value?: string) => {
    const token = getCookie("session_token");
    if (!token) return;

    const body: Record<string, boolean | string | null> = {};
    if (action === "mute") body.muted = !chat.muted;
    if (action === "done") body.done = !chat.done;
    if (action === "pin") body.pinned = !chat.pinned;
    if (action === "label") body.label = value ?? null;

    try {
      const res = await fetch(`/api/chat-members/${chat.id}/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        onUpdateChat(chat.id, {
          muted: data.muted,
          done: data.done,
          pinned: data.pinned,
          label: data.label,
        });
      }
    } catch {
      // Silent fail - could add toast notification here
    }
  };

  const handleLabelSubmit = () => {
    handleContextAction("label", labelInput.trim() || undefined);
    setIsLabelDialogOpen(false);
  };

  const rowContent = (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 p-3 text-left transition-colors hover:bg-gray-100 ${
        isSelected ? "bg-blue-50 hover:bg-blue-100" : ""
      }`}
    >
      {/* Avatar with online indicator */}
      <div className="relative flex-shrink-0 w-10 h-10">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200">
          {chat.avatarUrl ? (
            <img src={chat.avatarUrl} alt={chat.name || "Chat"} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-blue-600 text-white text-sm font-medium">
              {chat.type === "dm" ? (
                chat.name?.charAt(0).toUpperCase() || "?"
              ) : (
                <Users className="w-5 h-5" />
              )}
            </div>
          )}
        </div>
        {chat.type === "dm" && <OnlineIndicator isOnline={isOnline ?? false} size="sm" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {chat.pinned && <Pin className="w-3 h-3 text-blue-500 flex-shrink-0" />}
            <span className={`text-sm truncate ${chat.unreadCount > 0 ? "font-semibold text-gray-900" : "text-gray-900"}`}>
              {chat.name || "Unknown"}
            </span>
          </div>
          <span className="text-xs text-gray-500 flex-shrink-0">{timestamp}</span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className={`text-sm truncate ${chat.unreadCount > 0 ? "text-gray-700" : "text-gray-500"}`}>
            {chat.lastMessage?.senderName && chat.type !== "dm" ? (
              <span className="font-medium">{chat.lastMessage.senderName}: </span>
            ) : null}
            {preview}
          </span>
          <div className="flex items-center gap-1 flex-shrink-0">
            {chat.label && (
              <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-purple-100 text-purple-700 truncate max-w-[60px]">
                {chat.label}
              </span>
            )}
            {chat.unreadCount > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center bg-blue-600 text-white text-xs font-medium rounded-full">
                {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
              </span>
            )}
            {chat.muted && chat.unreadCount === 0 && (
              <BellOff className="w-4 h-4 text-gray-400" />
            )}
          </div>
        </div>
      </div>
    </button>
  );

  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          {rowContent}
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="min-w-[180px] bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
            <ContextMenu.Item
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer outline-none"
              onClick={() => handleContextAction("mute")}
            >
              {chat.muted ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
              {chat.muted ? "Unmute" : "Mute"}
            </ContextMenu.Item>
            <ContextMenu.Item
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer outline-none"
              onClick={() => handleContextAction("done")}
            >
              <Check className="w-4 h-4" />
              {chat.done ? "Reopen" : "Mark as Done"}
            </ContextMenu.Item>
            <ContextMenu.Item
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer outline-none"
              onClick={() => handleContextAction("pin")}
            >
              <Pin className="w-4 h-4" />
              {chat.pinned ? "Unpin from Top" : "Pin to Top"}
            </ContextMenu.Item>
            <ContextMenu.Separator className="h-px bg-gray-200 my-1" />
            <ContextMenu.Item
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer outline-none"
              onClick={() => {
                setLabelInput(chat.label || "");
                setIsLabelDialogOpen(true);
              }}
            >
              <Tag className="w-4 h-4" />
              {chat.label ? "Edit Label" : "Add Label"}
            </ContextMenu.Item>
            {chat.label && (
              <ContextMenu.Item
                className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-gray-100 cursor-pointer outline-none"
                onClick={() => handleContextAction("label", "")}
              >
                <X className="w-4 h-4" />
                Remove Label
              </ContextMenu.Item>
            )}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      {/* Label Dialog */}
      <Dialog.Root open={isLabelDialogOpen} onOpenChange={setIsLabelDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-80 z-50">
            <Dialog.Title className="text-lg font-semibold text-gray-900 mb-4">
              {chat.label ? "Edit Label" : "Add Label"}
            </Dialog.Title>
            <input
              type="text"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              placeholder="Enter label..."
              maxLength={100}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleLabelSubmit();
              }}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setIsLabelDialogOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleLabelSubmit}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function NewChatDialog({
  isOpen,
  onClose,
  onChatCreated
}: {
  isOpen: boolean;
  onClose: () => void;
  onChatCreated: (chat: Chat) => void;
}) {
  const [tab, setTab] = useState<"dm" | "group">("dm");
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [groupName, setGroupName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setUsers([]);
      setSelectedUsers([]);
      setGroupName("");
      setError(null);
      setTab("dm");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setUsers([]);
      return;
    }

    const token = getCookie("session_token");
    if (!token) return;

    const controller = new AbortController();
    setIsLoading(true);

    fetch(`/api/contacts?q=${encodeURIComponent(searchQuery)}&limit=10`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        setUsers(data.contacts || []);
        setIsLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [searchQuery]);

  const handleCreateDm = async (user: User) => {
    const token = getCookie("session_token");
    if (!token) return;

    setIsCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/chats/dm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user_id: user.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create chat");
      }

      const chat = await res.json();
      // Transform API response to match Chat interface
      const transformedChat: Chat = {
        id: chat.id,
        type: chat.type,
        name: user.displayName,
        avatarUrl: user.avatarUrl,
        memberCount: chat.members?.length || 2,
        unreadCount: 0,
        muted: false,
        done: false,
        pinned: false,
        label: null,
        lastMessage: null,
        lastMessageAt: chat.createdAt,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      };
      onChatCreated(transformedChat);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create chat");
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedUsers.length === 0) return;

    const token = getCookie("session_token");
    if (!token) return;

    setIsCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/chats/group", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: groupName.trim(),
          member_ids: selectedUsers.map((u) => u.id),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create group");
      }

      const chat = await res.json();
      const transformedChat: Chat = {
        id: chat.id,
        type: chat.type,
        name: chat.name,
        avatarUrl: chat.avatarUrl,
        memberCount: chat.members?.length || selectedUsers.length + 1,
        unreadCount: 0,
        muted: false,
        done: false,
        pinned: false,
        label: null,
        lastMessage: null,
        lastMessageAt: chat.createdAt,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      };
      onChatCreated(transformedChat);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create group");
    } finally {
      setIsCreating(false);
    }
  };

  const toggleUserSelection = (user: User) => {
    setSelectedUsers((prev) => {
      const isSelected = prev.some((u) => u.id === user.id);
      if (isSelected) {
        return prev.filter((u) => u.id !== user.id);
      }
      return [...prev, user];
    });
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] overflow-hidden z-50">
          <Dialog.Title className="px-4 py-3 border-b border-gray-200 font-semibold text-gray-900">
            New Chat
          </Dialog.Title>

          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setTab("dm")}
              className={`flex-1 px-4 py-2 text-sm font-medium ${
                tab === "dm"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Direct Message
            </button>
            <button
              onClick={() => setTab("group")}
              className={`flex-1 px-4 py-2 text-sm font-medium ${
                tab === "group"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Group Chat
            </button>
          </div>

          <div className="p-4">
            {error && (
              <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">
                {error}
              </div>
            )}

            {tab === "group" && (
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Group name"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {tab === "group" && selectedUsers.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {selectedUsers.map((user) => (
                  <span
                    key={user.id}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded-full"
                  >
                    {user.displayName || user.email}
                    <button
                      onClick={() => toggleUserSelection(user)}
                      className="hover:text-blue-600"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="mt-4 max-h-64 overflow-y-auto">
              {isLoading ? (
                <div className="text-center py-4 text-gray-500">Loading...</div>
              ) : users.length === 0 && searchQuery.trim() ? (
                <div className="text-center py-4 text-gray-500">No users found</div>
              ) : users.length === 0 ? (
                <div className="text-center py-4 text-gray-500">
                  Search for users to start a chat
                </div>
              ) : (
                <div className="space-y-1">
                  {users.map((user) => {
                    const isSelected = selectedUsers.some((u) => u.id === user.id);
                    return (
                      <button
                        key={user.id}
                        onClick={() => {
                          if (tab === "dm") {
                            handleCreateDm(user);
                          } else {
                            toggleUserSelection(user);
                          }
                        }}
                        disabled={isCreating}
                        className={`w-full flex items-center gap-3 p-2 rounded-md transition-colors ${
                          isSelected
                            ? "bg-blue-50"
                            : "hover:bg-gray-100"
                        } disabled:opacity-50`}
                      >
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                          {user.avatarUrl ? (
                            <img src={user.avatarUrl} alt={user.displayName || "User"} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-blue-600 text-white text-xs font-medium">
                              {user.displayName?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 text-left">
                          <div className="text-sm font-medium text-gray-900">
                            {user.displayName || user.email}
                          </div>
                          <div className="text-xs text-gray-500">{user.email}</div>
                        </div>
                        {tab === "group" && isSelected && (
                          <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {tab === "group" && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <button
                  onClick={handleCreateGroup}
                  disabled={isCreating || !groupName.trim() || selectedUsers.length === 0}
                  className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isCreating ? "Creating..." : "Create Group"}
                </button>
              </div>
            )}
          </div>

          <Dialog.Close asChild>
            <button
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ConnectionStatusIndicator({ status }: { status: ConnectionStatus }) {
  if (status === "connected") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-green-600">
        <Wifi className="w-3.5 h-3.5" />
        <span>Connected</span>
      </div>
    );
  }

  if (status === "connecting" || status === "reconnecting") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-amber-600">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>{status === "reconnecting" ? "Reconnecting..." : "Connecting..."}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-red-500">
      <WifiOff className="w-3.5 h-3.5" />
      <span>Disconnected</span>
    </div>
  );
}

interface FavoriteMessage {
  favorite: {
    userId: string;
    messageId: string;
    createdAt: string;
  };
  message: {
    id: string;
    chatId: string;
    senderId: string;
    type: string;
    content: Record<string, unknown>;
    createdAt: string;
  };
  sender: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  chat: {
    id: string;
    name: string | null;
    type: string;
  };
}

function FavoritesPanel({
  onClose,
  onSelectChat,
}: {
  onClose: () => void;
  onSelectChat: (chatId: string) => void;
}) {
  const [favorites, setFavorites] = useState<FavoriteMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadFavorites = async () => {
      const token = getCookie("session_token");
      if (!token) return;

      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/favorites", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          throw new Error("Failed to load favorites");
        }

        const data = await res.json();
        setFavorites(data.favorites || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setIsLoading(false);
      }
    };

    loadFavorites();
  }, []);

  const handleRemoveFavorite = async (messageId: string) => {
    const token = getCookie("session_token");
    if (!token) return;

    // Optimistic update
    setFavorites((prev) => prev.filter((f) => f.message.id !== messageId));

    try {
      await fetch(`/api/messages/${messageId}/favorite`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Reload favorites on error
      const res = await fetch("/api/favorites", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFavorites(data.favorites || []);
      }
    }
  };

  return (
    <div className="w-80 border-r border-gray-200 bg-white flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Star className="w-5 h-5 text-yellow-500 fill-current" />
          <h3 className="font-semibold text-gray-900">Favorites</h3>
          <span className="text-sm text-gray-500">({favorites.length})</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-gray-500">
            Loading...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-32 text-red-500">
            {error}
          </div>
        ) : favorites.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500">
            <Star className="w-8 h-8 mb-2 text-gray-300" />
            <p className="text-sm">No favorites yet</p>
            <p className="text-xs mt-1 text-gray-400">Star messages to save them here</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {favorites.map((fav) => (
              <div
                key={fav.message.id}
                className="p-3 hover:bg-gray-50 cursor-pointer"
                onClick={() => {
                  onSelectChat(fav.message.chatId);
                  onClose();
                }}
              >
                <div className="flex items-start gap-2">
                  {/* Sender avatar */}
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                    {fav.sender.avatarUrl ? (
                      <img
                        src={fav.sender.avatarUrl}
                        alt={fav.sender.displayName || "User"}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-blue-600 text-white text-xs font-medium">
                        {fav.sender.displayName?.charAt(0).toUpperCase() || "?"}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">
                        {fav.sender.displayName || "Unknown"}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatTimestamp(fav.message.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      in {fav.chat.name || "Chat"}
                    </p>
                    <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">
                      {typeof fav.message.content.text === "string"
                        ? fav.message.content.text
                        : typeof fav.message.content.html === "string"
                          ? fav.message.content.html.replace(/<[^>]*>/g, "")
                          : "Message"}
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFavorite(fav.message.id);
                      }}
                      className="text-xs text-gray-400 hover:text-red-500 mt-1"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MessengerPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isNewChatDialogOpen, setIsNewChatDialogOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [incomingMessage, setIncomingMessage] = useState<Message | null>(null);
  const [updatedMessage, setUpdatedMessage] = useState<Message | null>(null);
  const [showFavoritesPanel, setShowFavoritesPanel] = useState(false);

  // Typing indicators - track who is typing in each chat
  const [typingByChat, setTypingByChat] = useState<Record<string, TypingUser[]>>({});

  // Online presence - track who is online
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  // Handle incoming WebSocket messages
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    if (message.type === "message" && message.payload) {
      const payload = message.payload as Message;
      setIncomingMessage(payload);

      // Clear typing indicator for the sender when they send a message
      setTypingByChat((prev) => {
        const chatTyping = prev[payload.chatId];
        if (!chatTyping) return prev;
        const updated = chatTyping.filter((t) => t.userId !== payload.senderId);
        if (updated.length === chatTyping.length) return prev;
        return { ...prev, [payload.chatId]: updated };
      });

      // Update chat list with new last message
      setChats((prevChats) =>
        prevChats.map((chat) => {
          if (chat.id === payload.chatId) {
            return {
              ...chat,
              lastMessage: {
                id: payload.id,
                type: payload.type,
                content: payload.content,
                createdAt: payload.createdAt,
                senderName: payload.sender?.displayName || null,
              },
              lastMessageAt: payload.createdAt,
              // Increment unread count only if not from current user
              unreadCount:
                payload.senderId !== currentUserId
                  ? chat.unreadCount + 1
                  : chat.unreadCount,
            };
          }
          return chat;
        })
      );
    }

    // Handle message updates (edits and recalls)
    if (message.type === "message_updated" && message.payload) {
      const payload = message.payload as Message;
      setUpdatedMessage(payload);
    }
  }, [currentUserId]);

  // Handle typing events
  const handleTypingEvent = useCallback((event: TypingEvent) => {
    // Ignore own typing events
    if (event.userId === currentUserId) return;

    setTypingByChat((prev) => {
      const chatTyping = prev[event.chatId] || [];

      if (event.isTyping) {
        // Add user to typing list if not already there
        if (chatTyping.some((t) => t.userId === event.userId)) {
          return prev;
        }
        return {
          ...prev,
          [event.chatId]: [...chatTyping, { userId: event.userId, displayName: event.displayName }],
        };
      } else {
        // Remove user from typing list
        const updated = chatTyping.filter((t) => t.userId !== event.userId);
        if (updated.length === chatTyping.length) return prev;
        return { ...prev, [event.chatId]: updated };
      }
    });
  }, [currentUserId]);

  // Handle presence events
  const handlePresenceEvent = useCallback((event: PresenceEvent) => {
    setOnlineUsers((prev) => {
      const next = new Set(prev);
      if (event.isOnline) {
        next.add(event.userId);
      } else {
        next.delete(event.userId);
      }
      return next;
    });
  }, []);

  // Track last read receipt event for the current chat
  const [lastReadReceiptEvent, setLastReadReceiptEvent] = useState<ReadReceiptEvent | null>(null);

  // Track last reaction event for the current chat
  const [lastReactionEvent, setLastReactionEvent] = useState<ReactionEvent | null>(null);

  // Handle read receipt events
  const handleReadReceiptEvent = useCallback((event: ReadReceiptEvent) => {
    // Update the state so ChatView can react to it
    setLastReadReceiptEvent(event);

    // Also update the unread count in the chat list if this is from another user
    // (When someone reads our messages, their unread count decreases)
    if (event.userId !== currentUserId) {
      setChats((prevChats) =>
        prevChats.map((chat) => {
          if (chat.id === event.chatId) {
            // For DMs, if the other user has read, the message is fully read
            if (chat.type === "dm") {
              return {
                ...chat,
                // We can't directly update unreadCount here since it's their unread count
                // But this event confirms they've read our messages
              };
            }
          }
          return chat;
        })
      );
    }
  }, [currentUserId]);

  // Handle reaction events
  const handleReactionEvent = useCallback((event: ReactionEvent) => {
    // Pass reaction events to ChatView
    setLastReactionEvent(event);
  }, []);

  // WebSocket connection
  const { status: wsStatus, reconnect, sendTypingStart, sendTypingStop } = useWebSocket({
    token: null, // Will use cookie
    onMessage: handleWebSocketMessage,
    onTyping: handleTypingEvent,
    onPresence: handlePresenceEvent,
    onReadReceipt: handleReadReceiptEvent,
    onReaction: handleReactionEvent,
  });

  // Fetch current user ID
  useEffect(() => {
    const fetchCurrentUser = async () => {
      const token = getCookie("session_token");
      if (!token) return;

      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          setCurrentUserId(data.user?.id || null);
        }
      } catch {
        // Silent fail - user ID not critical for initial render
      }
    };

    fetchCurrentUser();
  }, []);

  useEffect(() => {
    const fetchChats = async () => {
      const token = getCookie("session_token");
      if (!token) return;

      setIsLoading(true);
      setError(null);

      try {
        // Map filter to API query param
        let filterParam = "";
        if (activeFilter === "private") {
          filterParam = "?filter=dm";
        } else if (activeFilter === "group") {
          filterParam = "?filter=group";
        } else if (activeFilter === "unread") {
          filterParam = "?filter=unread";
        } else if (activeFilter === "muted") {
          filterParam = "?filter=muted";
        } else if (activeFilter === "done") {
          filterParam = "?filter=done";
        }
        // "all" and "mentions" don't have API filters - mentions would need a separate endpoint

        const res = await fetch(`/api/chats${filterParam}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          throw new Error("Failed to fetch chats");
        }

        const data = await res.json();
        setChats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load chats");
      } finally {
        setIsLoading(false);
      }
    };

    fetchChats();
  }, [activeFilter]);

  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return chats;

    const query = searchQuery.toLowerCase();
    return chats.filter((chat) =>
      chat.name?.toLowerCase().includes(query)
    );
  }, [chats, searchQuery]);

  const handleChatCreated = (newChat: Chat) => {
    setChats((prev) => {
      // Check if chat already exists
      const exists = prev.some((c) => c.id === newChat.id);
      if (exists) {
        return prev;
      }
      return [newChat, ...prev];
    });
    setSelectedChatId(newChat.id);
  };

  const handleUpdateChat = useCallback((chatId: string, updates: Partial<Pick<Chat, "muted" | "done" | "pinned" | "label">>) => {
    setChats((prev) => {
      // If marking as done, remove from list (unless we're viewing done filter)
      if (updates.done === true && activeFilter !== "done") {
        return prev.filter((c) => c.id !== chatId);
      }
      // If reopening (done=false) and we're viewing done filter, remove from list
      if (updates.done === false && activeFilter === "done") {
        return prev.filter((c) => c.id !== chatId);
      }
      // Otherwise update the chat in place
      const updatedChats = prev.map((c) => (c.id === chatId ? { ...c, ...updates } : c));
      // Re-sort if pinned status changed
      if (updates.pinned !== undefined) {
        updatedChats.sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          const aTime = new Date(a.lastMessageAt).getTime();
          const bTime = new Date(b.lastMessageAt).getTime();
          return bTime - aTime;
        });
      }
      return updatedChats;
    });
  }, [activeFilter]);

  const selectedChat = chats.find((c) => c.id === selectedChatId);

  return (
    <div className="h-full flex">
      {/* Chat List Sidebar - This will be shown in the layout's sidebar area */}
      <div className="w-80 border-r border-gray-200 bg-white flex flex-col h-full">
        {/* Header */}
        <div className="flex-shrink-0 p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-gray-900">Messenger</h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowFavoritesPanel(!showFavoritesPanel)}
                className={`p-1.5 rounded-md hover:bg-gray-100 transition-colors ${
                  showFavoritesPanel ? "bg-yellow-100 text-yellow-600" : "text-gray-600 hover:text-gray-900"
                }`}
                title="Favorites"
              >
                <Star className={`w-5 h-5 ${showFavoritesPanel ? "fill-current" : ""}`} />
              </button>
              <button
                onClick={() => setIsNewChatDialogOpen(true)}
                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors"
                title="New chat"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
          {/* Connection Status */}
          <div className="flex items-center justify-between mb-3">
            <ConnectionStatusIndicator status={wsStatus} />
            {wsStatus === "disconnected" && (
              <button
                onClick={reconnect}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                Reconnect
              </button>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-100 border-0 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex-shrink-0 flex overflow-x-auto border-b border-gray-200 px-2 py-1 gap-1">
          {FILTER_TABS.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeFilter === filter.id
                  ? "bg-blue-100 text-blue-700"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-gray-500">
              Loading chats...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-32 text-red-500">
              {error}
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-500">
              <MessageCircle className="w-8 h-8 mb-2" />
              <span className="text-sm">
                {searchQuery.trim() ? "No matching chats" : "No chats yet"}
              </span>
              {!searchQuery.trim() && (
                <button
                  onClick={() => setIsNewChatDialogOpen(true)}
                  className="mt-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  Start a new chat
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredChats.map((chat) => (
                <ChatRow
                  key={chat.id}
                  chat={chat}
                  isSelected={chat.id === selectedChatId}
                  onClick={() => setSelectedChatId(chat.id)}
                  isOnline={chat.type === "dm" ? onlineUsers.has(chat.id) : undefined}
                  onUpdateChat={handleUpdateChat}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Favorites Panel */}
      {showFavoritesPanel && (
        <FavoritesPanel
          onClose={() => setShowFavoritesPanel(false)}
          onSelectChat={(chatId) => setSelectedChatId(chatId)}
        />
      )}

      {/* Center Panel - Chat View */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {selectedChat && currentUserId ? (
          <ChatView
            chat={selectedChat}
            currentUserId={currentUserId}
            incomingMessage={incomingMessage}
            updatedMessage={updatedMessage}
            typingUsers={typingByChat[selectedChat.id] || []}
            onTypingStart={() => sendTypingStart(selectedChat.id)}
            onTypingStop={() => sendTypingStop(selectedChat.id)}
            onlineUsers={onlineUsers}
            reactionEvent={lastReactionEvent}
          />
        ) : selectedChat ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Loading...
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center text-gray-500">
            <div>
              <MessageCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-700">Select a chat</h3>
              <p className="text-sm mt-1">Choose a conversation from the list</p>
            </div>
          </div>
        )}
      </div>

      {/* New Chat Dialog */}
      <NewChatDialog
        isOpen={isNewChatDialogOpen}
        onClose={() => setIsNewChatDialogOpen(false)}
        onChatCreated={handleChatCreated}
      />
    </div>
  );
}
