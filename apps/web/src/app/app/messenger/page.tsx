"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Search, Plus, MessageCircle, Users, Bell, BellOff, AtSign, Info, Wifi, WifiOff, Loader2, Check, CheckCheck, Circle, MoreHorizontal, Reply, X, MessageSquare, Pin, Star, Pencil, Trash2, Forward, Square, CheckSquare, Tag, FileText, File, FolderOpen, ExternalLink, GripVertical, Shield, Crown, UserPlus, UserMinus, Settings, Globe, Lock, ChevronDown, ChevronRight, LogOut, Megaphone, Zap, ListTodo, Calendar, Languages, Video } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as ContextMenu from "@radix-ui/react-context-menu";
import MessageInput, { MentionUser } from "@/components/MessageInput";
import { CodeBlockRenderer } from "@/components/CodeBlockRenderer";
import { ApprovalCard } from "@/components/ApprovalCard";
import { TopicGroupView } from "@/components/TopicGroupView";
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

  if (message.type === "card" && content.card_type === "approval") {
    return `Approval: ${content.template_name || "Request"}`;
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

interface ChatTab {
  id: string;
  chatId: string;
  type: "auto" | "custom";
  name: string;
  url: string | null;
  position: number;
}

type ChatTabType = "chat" | "docs" | "files" | "pins" | "announcements" | "custom";

interface SharedFile {
  messageId: string;
  filename: string;
  url: string;
  mimeType: string;
  size: number;
  sharedBy: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  sharedAt: string;
}

interface SharedDoc {
  messageId: string;
  url: string;
  title: string;
  sharedBy: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  sharedAt: string;
}

interface Announcement {
  id: string;
  chatId: string;
  content: string;
  authorId: string;
  createdAt: string;
  author: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
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
              <CodeBlockRenderer
                code={String(msg.content.code)}
                language={typeof msg.content.language === "string" ? msg.content.language : "plaintext"}
                className="text-xs"
              />
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

function renderMessageContent(message: Message, currentUserId?: string): React.ReactNode {
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
      if (action === "meeting_started") {
        const startedBy = typeof content.startedBy === "string" ? content.startedBy : "Someone";
        const meetingId = typeof content.meetingId === "string" ? content.meetingId : null;
        return (
          <span className="text-gray-500 text-sm italic flex items-center gap-2 flex-wrap">
            <Video className="w-4 h-4 inline text-blue-500" />
            {startedBy} started a meeting
            {meetingId && (
              <button
                onClick={() => window.open(`/app/meeting/${meetingId}`, "_blank")}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors"
              >
                Join Meeting
              </button>
            )}
          </span>
        );
      }
      return <span className="text-gray-500 text-sm italic">System message</span>;
    }

    if (type === "code" && content.code) {
      const language = typeof content.language === "string" ? content.language : "plaintext";
      return (
        <CodeBlockRenderer
          code={String(content.code)}
          language={language}
        />
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

    if (type === "card" && content.card_type === "approval") {
      // Current user is the approver if they are NOT the sender of the card message
      const isApprover = !!currentUserId && message.senderId !== currentUserId;
      return (
        <ApprovalCard
          content={content as unknown as { card_type: "approval"; approval_request_id: string; step_id: string; template_name: string; requester_name: string; form_data: Record<string, unknown>; status: string; decided_by_name?: string; decided_comment?: string }}
          isCurrentUserApprover={isApprover}
        />
      );
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
  onBuzz,
  onCreateTask,
  onTranslate,
  isPinned,
  isFavorited,
  isTranslated,
  canEdit,
  canRecall,
  canForward,
  canBuzz,
  canCreateTask,
  canTranslate,
}: {
  onSelect: (emoji: string) => void;
  onOpenFull: () => void;
  onReply: () => void;
  onForward?: () => void;
  onPin?: () => void;
  onFavorite?: () => void;
  onEdit?: () => void;
  onRecall?: () => void;
  onBuzz?: () => void;
  onCreateTask?: () => void;
  onTranslate?: () => void;
  isPinned?: boolean;
  isFavorited?: boolean;
  isTranslated?: boolean;
  canEdit?: boolean;
  canRecall?: boolean;
  canForward?: boolean;
  canBuzz?: boolean;
  canCreateTask?: boolean;
  canTranslate?: boolean;
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
      {canTranslate && onTranslate && (
        <button
          onClick={onTranslate}
          className={`w-7 h-7 flex items-center justify-center hover:bg-blue-50 rounded-full transition-colors ${
            isTranslated ? "text-blue-600" : "text-gray-500 hover:text-blue-600"
          }`}
          title={isTranslated ? "Hide translation" : "Translate message"}
        >
          <Languages className="w-4 h-4" />
        </button>
      )}
      {canCreateTask && onCreateTask && (
        <button
          onClick={onCreateTask}
          className="w-7 h-7 flex items-center justify-center hover:bg-blue-50 rounded-full transition-colors text-gray-500 hover:text-blue-600"
          title="Create Task"
        >
          <ListTodo className="w-4 h-4" />
        </button>
      )}
      {canBuzz && onBuzz && (
        <button
          onClick={onBuzz}
          className="w-7 h-7 flex items-center justify-center hover:bg-orange-50 rounded-full transition-colors text-orange-500 hover:text-orange-600"
          title="Buzz - send urgent notification"
        >
          <Zap className="w-4 h-4" />
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
  currentUserId,
  readStatus,
  onShowReadReceipts,
  onToggleReaction,
  onOpenThread,
  onPin,
  onFavorite,
  onEdit,
  onRecall,
  onForward,
  onBuzz,
  onCreateTask,
  onTranslate,
  isPinned,
  isFavorited,
  isBuzzed,
  isSelectionMode,
  isSelected,
  onToggleSelect,
  translation,
  isTranslating,
}: {
  message: Message;
  isCurrentUser: boolean;
  currentUserId?: string;
  readStatus?: { totalMembers: number; readCount: number };
  onShowReadReceipts?: (messageId: string) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onOpenThread?: (messageId: string) => void;
  onPin?: (messageId: string) => void;
  onFavorite?: (messageId: string) => void;
  onEdit?: (messageId: string) => void;
  onRecall?: (messageId: string) => void;
  onForward?: (messageId: string) => void;
  onBuzz?: (messageId: string) => void;
  onCreateTask?: (messageId: string) => void;
  onTranslate?: (messageId: string) => void;
  isPinned?: boolean;
  isFavorited?: boolean;
  isBuzzed?: boolean;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (messageId: string) => void;
  translation?: { text: string; detectedLanguage?: string } | null;
  isTranslating?: boolean;
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
          {renderMessageContent(message, currentUserId)}
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
          {/* Buzz urgent indicator */}
          {isBuzzed && (
            <div className="absolute -top-1 -right-1 z-10">
              <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center animate-pulse shadow-lg">
                <Zap className="w-3 h-3 text-white" />
              </div>
            </div>
          )}
          <div
            className={`px-3 py-2 rounded-2xl ${
              isCurrentUser
                ? isPending
                  ? "bg-blue-400 text-white rounded-br-md"
                  : "bg-blue-600 text-white rounded-br-md"
                : "bg-gray-100 text-gray-900 rounded-bl-md"
            } ${isBuzzed ? "ring-2 ring-red-500 ring-opacity-50" : ""}`}
          >
            {renderMessageContent(message, currentUserId)}
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
                onBuzz={onBuzz ? () => {
                  setShowReactionPicker(false);
                  onBuzz(message.id);
                } : undefined}
                onCreateTask={onCreateTask ? () => {
                  setShowReactionPicker(false);
                  onCreateTask(message.id);
                } : undefined}
                onTranslate={onTranslate ? () => {
                  setShowReactionPicker(false);
                  onTranslate(message.id);
                } : undefined}
                isPinned={isPinned}
                isFavorited={isFavorited}
                isTranslated={!!translation}
                canEdit={isCurrentUser && !message.recalledAt && (message.type === "text" || message.type === "rich_text")}
                canRecall={isCurrentUser && !message.recalledAt}
                canForward={!message.recalledAt && message.type !== "system"}
                canBuzz={isCurrentUser && !message.recalledAt && message.type !== "system"}
                canCreateTask={!message.recalledAt && message.type !== "system"}
                canTranslate={!message.recalledAt && (message.type === "text" || message.type === "rich_text")}
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

        {/* Translation display */}
        {isTranslating && (
          <div className="flex items-center gap-1.5 px-2 py-1 mt-1 text-xs text-gray-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Translating...</span>
          </div>
        )}
        {translation && !isTranslating && (
          <div className={`mt-1 px-3 py-1.5 rounded-lg text-sm ${
            isCurrentUser ? "bg-blue-50 text-blue-900" : "bg-gray-50 text-gray-800"
          }`}>
            <div className="text-[10px] text-gray-400 mb-0.5 flex items-center gap-1">
              <Languages className="w-3 h-3" />
              Translated{translation.detectedLanguage ? ` from ${translation.detectedLanguage}` : ""}
            </div>
            <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: translation.text }} />
          </div>
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
                  currentUserId={currentUserId}
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
                    currentUserId={currentUserId}
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
  const [showChatInfoPanel, setShowChatInfoPanel] = useState(false);
  const [startingMeeting, setStartingMeeting] = useState(false);

  // Thread panel state
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  // Chat tabs state
  const [activeTab, setActiveTab] = useState<ChatTabType>("chat");
  const [customTabs, setCustomTabs] = useState<ChatTab[]>([]);
  const [showAddTabDialog, setShowAddTabDialog] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [newTabUrl, setNewTabUrl] = useState("");
  const [sharedFiles, setSharedFiles] = useState<SharedFile[]>([]);
  const [sharedDocs, setSharedDocs] = useState<SharedDoc[]>([]);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [showAnnouncementBanner, setShowAnnouncementBanner] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<"owner" | "admin" | "member">("member");

  // Translation state
  const [messageTranslations, setMessageTranslations] = useState<Record<string, { text: string; detectedLanguage?: string }>>({});
  const [translatingMessageIds, setTranslatingMessageIds] = useState<Set<string>>(new Set());
  const [translationPrefs, setTranslationPrefs] = useState<{ autoTranslateEnabled: boolean; targetLanguage: string }>({
    autoTranslateEnabled: false,
    targetLanguage: "en",
  });

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

  // Translate a message (toggle: translate or remove translation)
  const translateMessage = useCallback(async (messageId: string) => {
    // If already translated, remove translation
    if (messageTranslations[messageId]) {
      setMessageTranslations((prev) => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
      return;
    }

    const token = getCookie("session_token");
    if (!token) return;

    const message = messages.find(m => m.id === messageId);
    if (!message) return;

    const text = typeof message.content.text === "string" ? message.content.text :
      typeof message.content.html === "string" ? message.content.html : null;
    if (!text) return;

    setTranslatingMessageIds((prev) => new Set(prev).add(messageId));

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text,
          target_lang: translationPrefs.targetLanguage,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Translation failed");
      }

      const data = await res.json();
      setMessageTranslations((prev) => ({
        ...prev,
        [messageId]: {
          text: data.translated_text,
          detectedLanguage: data.detected_language,
        },
      }));
    } catch (err) {
      console.error("Translation failed:", err);
    } finally {
      setTranslatingMessageIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
  }, [messages, messageTranslations, translationPrefs.targetLanguage]);

  // Load translation preferences
  const loadTranslationPrefs = useCallback(async () => {
    const token = getCookie("session_token");
    if (!token) return;

    try {
      const res = await fetch("/api/users/me/translation-preferences", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTranslationPrefs({
          autoTranslateEnabled: data.auto_translate_enabled ?? false,
          targetLanguage: data.target_language ?? "en",
        });
      }
    } catch {
      // Silent fail - use defaults
    }
  }, []);

  // Toggle auto-translate setting
  const toggleAutoTranslate = useCallback(async () => {
    const token = getCookie("session_token");
    if (!token) return;

    const newValue = !translationPrefs.autoTranslateEnabled;
    setTranslationPrefs((prev) => ({ ...prev, autoTranslateEnabled: newValue }));

    try {
      await fetch("/api/users/me/translation-preferences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ auto_translate_enabled: newValue }),
      });
    } catch {
      // Revert on error
      setTranslationPrefs((prev) => ({ ...prev, autoTranslateEnabled: !newValue }));
    }
  }, [translationPrefs.autoTranslateEnabled]);

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

  // Buzz message state
  const [buzzingMessageId, setBuzzingMessageId] = useState<string | null>(null);
  const [buzzingMessage, setBuzzingMessage] = useState<Message | null>(null);
  const [showBuzzDialog, setShowBuzzDialog] = useState(false);
  const [buzzedMessageIds, setBuzzedMessageIds] = useState<Set<string>>(new Set());

  // Open buzz dialog for a message
  const openBuzzDialog = useCallback((messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (!message) return;
    setBuzzingMessageId(messageId);
    setBuzzingMessage(message);
    setShowBuzzDialog(true);
  }, [messages]);

  // Close buzz dialog
  const closeBuzzDialog = useCallback(() => {
    setShowBuzzDialog(false);
    setBuzzingMessageId(null);
    setBuzzingMessage(null);
  }, []);

  // Handle buzz sent - mark message as buzzed
  const handleBuzzSent = useCallback((messageId: string) => {
    setBuzzedMessageIds((prev) => new Set(prev).add(messageId));
  }, []);

  // Create task from message state
  const [showCreateTaskDialog, setShowCreateTaskDialog] = useState(false);
  const [createTaskMessage, setCreateTaskMessage] = useState<Message | null>(null);

  const openCreateTaskDialog = useCallback((messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (!message) return;
    setCreateTaskMessage(message);
    setShowCreateTaskDialog(true);
  }, [messages]);

  const closeCreateTaskDialog = useCallback(() => {
    setShowCreateTaskDialog(false);
    setCreateTaskMessage(null);
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

  // Load custom tabs for the chat
  const loadTabs = useCallback(async () => {
    const token = getCookie("session_token");
    if (!token) return;

    try {
      const res = await fetch(`/api/chats/${chat.id}/tabs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCustomTabs(data.tabs || []);
      }
    } catch {
      // Silent fail
    }
  }, [chat.id]);

  // Add a custom tab
  const addCustomTab = useCallback(async (name: string, url: string) => {
    const token = getCookie("session_token");
    if (!token) return false;

    try {
      const res = await fetch(`/api/chats/${chat.id}/tabs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, url }),
      });
      if (res.ok) {
        const data = await res.json();
        setCustomTabs((prev) => [...prev, data.tab]);
        return true;
      }
    } catch {
      // Silent fail
    }
    return false;
  }, [chat.id]);

  // Delete a custom tab
  const deleteCustomTab = useCallback(async (tabId: string) => {
    const token = getCookie("session_token");
    if (!token) return;

    // Optimistic update
    setCustomTabs((prev) => prev.filter((t) => t.id !== tabId));

    try {
      await fetch(`/api/chats/${chat.id}/tabs/${tabId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Revert on error
      loadTabs();
    }
  }, [chat.id, loadTabs]);

  // Reorder tabs via drag-and-drop
  const reorderTabs = useCallback(async (tabIds: string[]) => {
    const token = getCookie("session_token");
    if (!token) return;

    // Optimistic update
    const reorderedTabs = tabIds
      .map((id) => customTabs.find((t) => t.id === id))
      .filter((t): t is ChatTab => t !== undefined)
      .map((t, i) => ({ ...t, position: i }));
    setCustomTabs(reorderedTabs);

    try {
      await fetch(`/api/chats/${chat.id}/tabs/reorder`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tabIds }),
      });
    } catch {
      // Revert on error
      loadTabs();
    }
  }, [chat.id, customTabs, loadTabs]);

  // Load announcements for the chat
  const loadAnnouncements = useCallback(async () => {
    const token = getCookie("session_token");
    if (!token) return;

    try {
      const res = await fetch(`/api/chats/${chat.id}/announcements`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAnnouncements(data.announcements || []);
      }
    } catch {
      // Silent fail
    }
  }, [chat.id]);

  // Extract shared files and docs from messages
  const extractSharedContent = useCallback((msgs: Message[]) => {
    const files: SharedFile[] = [];
    const docs: SharedDoc[] = [];

    for (const msg of msgs) {
      const content = msg.content;

      // Check for file attachments
      if (content.file || content.attachment || content.files) {
        const fileContent = content.file || content.attachment;
        if (fileContent && typeof fileContent === "object") {
          const fileObj = fileContent as { filename?: string; name?: string; url?: string; mimeType?: string; type?: string; size?: number };
          files.push({
            messageId: msg.id,
            filename: fileObj.filename || fileObj.name || "Unknown file",
            url: fileObj.url || "",
            mimeType: fileObj.mimeType || fileObj.type || "application/octet-stream",
            size: fileObj.size || 0,
            sharedBy: msg.sender,
            sharedAt: msg.createdAt,
          });
        }
        // Handle array of files
        if (Array.isArray(content.files)) {
          for (const f of content.files) {
            if (f && typeof f === "object") {
              const fileObj = f as { filename?: string; name?: string; url?: string; mimeType?: string; type?: string; size?: number };
              files.push({
                messageId: msg.id,
                filename: fileObj.filename || fileObj.name || "Unknown file",
                url: fileObj.url || "",
                mimeType: fileObj.mimeType || fileObj.type || "application/octet-stream",
                size: fileObj.size || 0,
                sharedBy: msg.sender,
                sharedAt: msg.createdAt,
              });
            }
          }
        }
      }

      // Check for URL links (docs)
      if (content.text && typeof content.text === "string") {
        const urlRegex = /(https?:\/\/[^\s<]+)/g;
        const urls = content.text.match(urlRegex);
        if (urls) {
          for (const url of urls) {
            // Check if it looks like a document link
            const isDoc = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|csv)$/i.test(url) ||
              url.includes("docs.google.com") ||
              url.includes("notion.so") ||
              url.includes("confluence") ||
              url.includes("sharepoint");

            if (isDoc) {
              docs.push({
                messageId: msg.id,
                url,
                title: url.split("/").pop() || url,
                sharedBy: msg.sender,
                sharedAt: msg.createdAt,
              });
            }
          }
        }
      }
    }

    // Sort by date, newest first
    files.sort((a, b) => new Date(b.sharedAt).getTime() - new Date(a.sharedAt).getTime());
    docs.sort((a, b) => new Date(b.sharedAt).getTime() - new Date(a.sharedAt).getTime());

    setSharedFiles(files);
    setSharedDocs(docs);
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
    setActiveTab("chat");
    setCustomTabs([]);
    setSharedFiles([]);
    setSharedDocs([]);
    setAnnouncements([]);
    setShowAnnouncementBanner(true);
    lastMarkedReadRef.current = null;
    loadMessages();
    loadPinnedMessages();
    loadFavorites();
    loadTabs();
    loadAnnouncements();
    loadTranslationPrefs();
    setMessageTranslations({});
    setTranslatingMessageIds(new Set());
  }, [chat.id, loadMessages, loadPinnedMessages, loadFavorites, loadTabs, loadAnnouncements, loadTranslationPrefs]);

  // Extract shared files and docs when messages change
  useEffect(() => {
    if (messages.length > 0) {
      extractSharedContent(messages);
    }
  }, [messages, extractSharedContent]);

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
          // Find current user's role
          const currentMember = (data.members || []).find(
            (m: { userId: string }) => m.userId === currentUserId
          );
          if (currentMember?.role) {
            setCurrentUserRole(currentMember.role);
          }
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

    // Auto-translate incoming messages from others if enabled
    if (
      translationPrefs.autoTranslateEnabled &&
      incomingMessage.senderId !== currentUserId &&
      (incomingMessage.type === "text" || incomingMessage.type === "rich_text")
    ) {
      translateMessage(incomingMessage.id);
    }
  }, [incomingMessage, chat.id, scrollToBottom, currentUserId, markAsRead, translationPrefs.autoTranslateEnabled, translateMessage]);

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
          {/* Video call button */}
          {(chat.type === "dm" || chat.type === "group" || chat.type === "topic_group" || chat.type === "supergroup") && (
            <button
              onClick={async () => {
                if (startingMeeting) return;
                setStartingMeeting(true);
                try {
                  const token = getCookie("session_token");
                  if (!token) return;
                  const res = await fetch(`/api/chats/${chat.id}/start-meeting`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                  });
                  if (res.ok) {
                    const data = await res.json();
                    window.open(`/app/meeting/${data.meeting.id}`, "_blank");
                  }
                } finally {
                  setStartingMeeting(false);
                }
              }}
              disabled={startingMeeting}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500 disabled:opacity-50"
              title="Start video call"
            >
              <Video className="w-5 h-5" />
            </button>
          )}
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
          {/* Auto-translate toggle */}
          <button
            onClick={toggleAutoTranslate}
            className={`p-2 rounded-full hover:bg-gray-100 transition-colors ${
              translationPrefs.autoTranslateEnabled ? "bg-blue-100 text-blue-600" : "text-gray-500"
            }`}
            title={translationPrefs.autoTranslateEnabled ? "Disable auto-translate" : "Enable auto-translate"}
          >
            <Languages className="w-5 h-5" />
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
            onClick={() => setShowChatInfoPanel(!showChatInfoPanel)}
            className={`p-2 rounded-full hover:bg-gray-100 transition-colors ${
              showChatInfoPanel ? "bg-blue-100 text-blue-600" : "text-gray-500"
            }`}
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

      {/* Chat Tabs */}
      <div className="flex-shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-gray-200 bg-white overflow-x-auto">
        {/* Default tabs */}
        <button
          onClick={() => setActiveTab("chat")}
          className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            activeTab === "chat"
              ? "bg-blue-100 text-blue-700"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <MessageCircle className="w-4 h-4" />
          Chat
        </button>
        <button
          onClick={() => setActiveTab("docs")}
          className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            activeTab === "docs"
              ? "bg-blue-100 text-blue-700"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <FileText className="w-4 h-4" />
          Docs
          {sharedDocs.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-200 text-gray-600 rounded-full">
              {sharedDocs.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("files")}
          className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            activeTab === "files"
              ? "bg-blue-100 text-blue-700"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <File className="w-4 h-4" />
          Files
          {sharedFiles.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-200 text-gray-600 rounded-full">
              {sharedFiles.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("pins")}
          className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            activeTab === "pins"
              ? "bg-blue-100 text-blue-700"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <Pin className="w-4 h-4" />
          Pins
          {pinnedMessageIds.size > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-200 text-gray-600 rounded-full">
              {pinnedMessageIds.size}
            </span>
          )}
        </button>
        {/* Only show Announcements tab for group chats */}
        {chat.type !== "dm" && (
          <button
            onClick={() => setActiveTab("announcements")}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "announcements"
                ? "bg-blue-100 text-blue-700"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Megaphone className="w-4 h-4" />
            Announcements
            {announcements.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-200 text-gray-600 rounded-full">
                {announcements.length}
              </span>
            )}
          </button>
        )}

        {/* Divider before custom tabs */}
        {customTabs.length > 0 && (
          <div className="h-5 w-px bg-gray-300 mx-1" />
        )}

        {/* Custom tabs with drag-and-drop */}
        {customTabs.map((tab) => (
          <div
            key={tab.id}
            draggable
            onDragStart={() => setDraggedTabId(tab.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (draggedTabId && draggedTabId !== tab.id) {
                const currentIndex = customTabs.findIndex((t) => t.id === draggedTabId);
                const targetIndex = customTabs.findIndex((t) => t.id === tab.id);
                const newOrder = [...customTabs];
                const [removed] = newOrder.splice(currentIndex, 1);
                newOrder.splice(targetIndex, 0, removed);
                reorderTabs(newOrder.map((t) => t.id));
              }
              setDraggedTabId(null);
            }}
            onDragEnd={() => setDraggedTabId(null)}
            className={`flex-shrink-0 flex items-center gap-1 group ${
              draggedTabId === tab.id ? "opacity-50" : ""
            }`}
          >
            <button
              onClick={() => {
                if (tab.url) {
                  window.open(tab.url, "_blank", "noopener,noreferrer");
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <GripVertical className="w-3 h-3 text-gray-400 cursor-grab" />
              <ExternalLink className="w-3 h-3" />
              {tab.name}
            </button>
            <button
              onClick={() => deleteCustomTab(tab.id)}
              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              title="Remove tab"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}

        {/* Add tab button */}
        {customTabs.length < 20 && (
          <button
            onClick={() => setShowAddTabDialog(true)}
            className="flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            title="Add custom tab"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Add Tab Dialog */}
      <Dialog.Root open={showAddTabDialog} onOpenChange={setShowAddTabDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <Dialog.Title className="text-lg font-semibold text-gray-900 mb-4">
              Add Custom Tab
            </Dialog.Title>
            <div className="space-y-4">
              <div>
                <label htmlFor="tab-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Tab Name
                </label>
                <input
                  id="tab-name"
                  type="text"
                  value={newTabName}
                  onChange={(e) => setNewTabName(e.target.value)}
                  placeholder="e.g., Project Wiki"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  maxLength={100}
                />
              </div>
              <div>
                <label htmlFor="tab-url" className="block text-sm font-medium text-gray-700 mb-1">
                  URL
                </label>
                <input
                  id="tab-url"
                  type="url"
                  value={newTabUrl}
                  onChange={(e) => setNewTabUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddTabDialog(false);
                  setNewTabName("");
                  setNewTabUrl("");
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (newTabName.trim() && newTabUrl.trim()) {
                    const success = await addCustomTab(newTabName.trim(), newTabUrl.trim());
                    if (success) {
                      setShowAddTabDialog(false);
                      setNewTabName("");
                      setNewTabUrl("");
                    }
                  }
                }}
                disabled={!newTabName.trim() || !newTabUrl.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Tab
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Announcement Banner - shows most recent announcement at top of chat */}
      {chat.type !== "dm" && announcements.length > 0 && showAnnouncementBanner && activeTab === "chat" && (
        <AnnouncementBanner
          announcement={announcements[0]}
          onDismiss={() => setShowAnnouncementBanner(false)}
          onViewAll={() => setActiveTab("announcements")}
        />
      )}

      {/* Tab Content Areas */}
      {activeTab === "chat" ? (
        /* Messages Area */
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
                        currentUserId={currentUserId}
                        readStatus={messageReadStatus[message.id]}
                        onShowReadReceipts={setSelectedMessageForReceipts}
                        onToggleReaction={toggleReaction}
                        onOpenThread={setActiveThreadId}
                        onPin={togglePin}
                        onFavorite={toggleFavorite}
                        onEdit={startEditing}
                        onRecall={recallMessage}
                        onForward={openForwardModal}
                        onBuzz={openBuzzDialog}
                        onCreateTask={openCreateTaskDialog}
                        onTranslate={translateMessage}
                        isPinned={pinnedMessageIds.has(message.id)}
                        isFavorited={favoritedMessageIds.has(message.id)}
                        isBuzzed={buzzedMessageIds.has(message.id)}
                        isSelectionMode={isSelectionMode}
                        isSelected={selectedMessageIds.has(message.id)}
                        onToggleSelect={toggleMessageSelection}
                        translation={messageTranslations[message.id]}
                        isTranslating={translatingMessageIds.has(message.id)}
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
      ) : activeTab === "docs" ? (
        /* Docs Tab Content */
        <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50">
          {sharedDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <FileText className="w-12 h-12 mb-3 text-gray-300" />
              <p className="text-sm">No documents shared yet</p>
              <p className="text-xs mt-1">Share document links in chat to see them here</p>
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                {sharedDocs.length} document{sharedDocs.length !== 1 ? "s" : ""} shared
              </h3>
              {sharedDocs.map((doc) => (
                <a
                  key={`${doc.messageId}-${doc.url}`}
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{doc.title}</p>
                    <p className="text-xs text-gray-500 truncate">{doc.url}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {doc.sharedBy.avatarUrl ? (
                        <img
                          src={doc.sharedBy.avatarUrl}
                          alt=""
                          className="w-4 h-4 rounded-full"
                        />
                      ) : (
                        <div className="w-4 h-4 rounded-full bg-gray-200" />
                      )}
                      <span className="text-xs text-gray-500">
                        {doc.sharedBy.displayName || "Unknown"} · {formatTimestamp(doc.sharedAt)}
                      </span>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-gray-400 flex-shrink-0" />
                </a>
              ))}
            </div>
          )}
        </div>
      ) : activeTab === "files" ? (
        /* Files Tab Content */
        <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50">
          {sharedFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <FolderOpen className="w-12 h-12 mb-3 text-gray-300" />
              <p className="text-sm">No files shared yet</p>
              <p className="text-xs mt-1">Share files in chat to see them here</p>
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                {sharedFiles.length} file{sharedFiles.length !== 1 ? "s" : ""} shared
              </h3>
              {sharedFiles.map((file) => (
                <a
                  key={`${file.messageId}-${file.url}`}
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
                    <File className="w-5 h-5 text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{file.filename}</p>
                    <p className="text-xs text-gray-500">
                      {file.mimeType} {file.size > 0 && `· ${(file.size / 1024).toFixed(1)} KB`}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {file.sharedBy.avatarUrl ? (
                        <img
                          src={file.sharedBy.avatarUrl}
                          alt=""
                          className="w-4 h-4 rounded-full"
                        />
                      ) : (
                        <div className="w-4 h-4 rounded-full bg-gray-200" />
                      )}
                      <span className="text-xs text-gray-500">
                        {file.sharedBy.displayName || "Unknown"} · {formatTimestamp(file.sharedAt)}
                      </span>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-gray-400 flex-shrink-0" />
                </a>
              ))}
            </div>
          )}
        </div>
      ) : activeTab === "pins" ? (
        /* Pins Tab Content */
        <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50">
          <PinsTabContent
            chatId={chat.id}
            pinnedMessageIds={pinnedMessageIds}
            onUnpin={togglePin}
          />
        </div>
      ) : activeTab === "announcements" ? (
        /* Announcements Tab Content */
        <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50">
          <AnnouncementsTabContent
            chatId={chat.id}
            announcements={announcements}
            onRefresh={loadAnnouncements}
            currentUserRole={currentUserRole}
          />
        </div>
      ) : null}

      {/* Typing Indicator - only show on chat tab */}
      {activeTab === "chat" && <TypingIndicator typingUsers={typingUsers} />}

      {/* Message Input - only show on chat tab */}
      {activeTab === "chat" && (
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
      )}
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

      {/* Chat Info Panel */}
      {showChatInfoPanel && (
        <ChatInfoPanel
          chatId={chat.id}
          chatType={chat.type}
          onClose={() => setShowChatInfoPanel(false)}
          onMembersUpdated={async () => {
            // Reload chat members for mentions
            const token = getCookie("session_token");
            if (!token) return;

            try {
              const res = await fetch(`/api/chats/${chat.id}/members`, {
                headers: { Authorization: `Bearer ${token}` },
              });

              if (res.ok) {
                const data = await res.json();
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
              // Silent fail
            }
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

      {/* Create Task from Message Dialog */}
      {showCreateTaskDialog && createTaskMessage && (
        <CreateTaskFromMessageDialog
          message={createTaskMessage}
          onClose={closeCreateTaskDialog}
          onTaskCreated={(task) => {
            closeCreateTaskDialog();
          }}
        />
      )}

      {/* Buzz Message Dialog */}
      {showBuzzDialog && buzzingMessage && currentUserId && (
        <BuzzMessageDialog
          messageId={buzzingMessageId!}
          message={buzzingMessage}
          chatMembers={chatMembers}
          currentUserId={currentUserId}
          onClose={closeBuzzDialog}
          onBuzzSent={handleBuzzSent}
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

// Buzz Message Dialog Component - send urgent notification for a message
function CreateTaskFromMessageDialog({
  message,
  onClose,
  onTaskCreated,
}: {
  message: Message;
  onClose: () => void;
  onTaskCreated: (task: { id: string; title: string }) => void;
}) {
  const messageText = (message.content as Record<string, unknown>).text as string || "";
  const [title, setTitle] = useState(messageText.slice(0, 500));
  const [priority, setPriority] = useState<string>("none");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = getCookie("session_token");
      const res = await fetch("/api/tasks/from-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message_id: message.id,
          title: title.trim(),
          priority: priority !== "none" ? priority : undefined,
          due_date: dueDate || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create task");
      }
      const data = await res.json();
      onTaskCreated(data.task);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl w-[480px] max-h-[90vh] overflow-y-auto z-50 p-6">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold flex items-center gap-2">
              <ListTodo className="w-5 h-5 text-blue-600" />
              Create Task from Message
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-full">
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Source message preview */}
          <div className="bg-gray-50 rounded-lg p-3 mb-4 border-l-4 border-blue-400">
            <p className="text-xs text-gray-500 mb-1">From message by {message.sender?.displayName || "Unknown"}</p>
            <p className="text-sm text-gray-700 line-clamp-3">{messageText || "(no text content)"}</p>
          </div>

          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Task Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter task title"
                autoFocus
                maxLength={500}
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="none">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!title.trim() || submitting}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Task"
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function BuzzMessageDialog({
  messageId,
  message,
  chatMembers,
  currentUserId,
  onClose,
  onBuzzSent,
}: {
  messageId: string;
  message: Message;
  chatMembers: MentionUser[];
  currentUserId: string;
  onClose: () => void;
  onBuzzSent?: (messageId: string) => void;
}) {
  const [selectedRecipient, setSelectedRecipient] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Filter out current user from recipients
  const availableRecipients = useMemo(() => {
    const filtered = chatMembers.filter((m) => m.id !== currentUserId);
    if (!searchQuery.trim()) return filtered;
    const query = searchQuery.toLowerCase();
    return filtered.filter((m) =>
      m.displayName?.toLowerCase().includes(query)
    );
  }, [chatMembers, currentUserId, searchQuery]);

  const handleSendBuzz = async () => {
    if (!selectedRecipient) return;

    const token = getCookie("session_token");
    if (!token) return;

    setIsSending(true);
    setError(null);

    try {
      const res = await fetch(`/api/messages/${messageId}/buzz`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient_id: selectedRecipient,
          type: "in_app",
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to send buzz");
      }

      onBuzzSent?.(messageId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send buzz");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog.Root open={true} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl z-50 w-full max-w-md max-h-[80vh] flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <Dialog.Title className="text-lg font-semibold flex items-center gap-2">
              <Zap className="w-5 h-5 text-orange-500" />
              Buzz - Urgent Notification
            </Dialog.Title>
            <Dialog.Description className="text-sm text-gray-500 mt-1">
              Send an urgent notification to get someone&apos;s immediate attention
            </Dialog.Description>
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Message Preview */}
          <div className="px-4 py-3 bg-orange-50 border-b border-orange-100">
            <div className="text-xs text-orange-600 font-medium mb-1">Message to buzz:</div>
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
                placeholder="Search recipients..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Recipient List */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {availableRecipients.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {searchQuery ? "No recipients found" : "No other chat members"}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {availableRecipients.map((member) => (
                  <button
                    key={member.id}
                    onClick={() => setSelectedRecipient(member.id)}
                    className={`w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors text-left ${
                      selectedRecipient === member.id ? "bg-orange-50" : ""
                    }`}
                  >
                    <div className="relative">
                      {selectedRecipient === member.id ? (
                        <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center">
                          <Check className="w-5 h-5 text-white" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center">
                          {member.avatarUrl ? (
                            <img
                              src={member.avatarUrl}
                              alt={member.displayName || "User"}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-sm font-medium text-gray-600">
                              {member.displayName?.charAt(0).toUpperCase() || "?"}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">
                        {member.displayName || "Unknown"}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Warning */}
          <div className="px-4 py-2 bg-yellow-50 text-yellow-700 text-xs border-t border-yellow-100">
            <strong>Note:</strong> Buzz sends a full-screen urgent notification. Use sparingly.
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
              {selectedRecipient
                ? `Buzz ${availableRecipients.find((r) => r.id === selectedRecipient)?.displayName || "selected user"}`
                : "Select a recipient"}
            </div>
            <button
              onClick={handleSendBuzz}
              disabled={!selectedRecipient || isSending}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Send Buzz
                </>
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Buzz Overlay Component - full-screen urgent notification for recipients
interface BuzzEvent {
  buzzId: string;
  messageId: string;
  chatId: string;
  chatName: string;
  senderName: string;
  messagePreview: string;
  createdAt: string;
}

function BuzzOverlay({
  buzz,
  onDismiss,
  onViewInChat,
}: {
  buzz: BuzzEvent;
  onDismiss: () => void;
  onViewInChat: () => void;
}) {
  // Auto-dismiss after 60 seconds if user doesn't interact
  useEffect(() => {
    const timeout = setTimeout(onDismiss, 60000);
    return () => clearTimeout(timeout);
  }, [onDismiss]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Animated pulsing background */}
      <div className="absolute inset-0 bg-red-600 animate-pulse" />
      <div className="absolute inset-0 bg-gradient-to-b from-red-500/90 to-red-700/90" />

      {/* Content */}
      <div className="relative z-10 max-w-md w-full mx-4 text-center">
        {/* Urgent indicator */}
        <div className="mb-6 flex justify-center">
          <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-2xl animate-bounce">
            <Zap className="w-14 h-14 text-red-500" />
          </div>
        </div>

        {/* Header */}
        <h1 className="text-3xl font-bold text-white mb-2 drop-shadow-lg">
          URGENT MESSAGE
        </h1>

        {/* Sender info */}
        <div className="text-white/90 text-lg mb-6">
          <span className="font-semibold">{buzz.senderName}</span> buzzed you in{" "}
          <span className="font-semibold">{buzz.chatName}</span>
        </div>

        {/* Message preview */}
        <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 mb-8 text-left">
          <div className="text-white text-base leading-relaxed line-clamp-4">
            {buzz.messagePreview}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-3">
          <button
            onClick={onViewInChat}
            className="w-full py-4 bg-white text-red-600 font-bold text-lg rounded-xl hover:bg-gray-100 transition-colors shadow-lg flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-5 h-5" />
            View in Chat
          </button>
          <button
            onClick={onDismiss}
            className="w-full py-3 bg-white/20 text-white font-medium rounded-xl hover:bg-white/30 transition-colors"
          >
            Dismiss
          </button>
        </div>

        {/* Timestamp */}
        <div className="mt-6 text-white/70 text-sm">
          Received at {new Date(buzz.createdAt).toLocaleTimeString()}
        </div>
      </div>
    </div>
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

function PinsTabContent({
  chatId,
  pinnedMessageIds,
  onUnpin,
}: {
  chatId: string;
  pinnedMessageIds: Set<string>;
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
  }, [chatId, pinnedMessageIds]); // Reload when pins change

  const handleUnpin = (messageId: string) => {
    setPins((prev) => prev.filter((p) => p.message.id !== messageId));
    onUnpin(messageId);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Loading pinned messages...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        {error}
      </div>
    );
  }

  if (pins.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <Pin className="w-12 h-12 mb-3 text-gray-300" />
        <p className="text-sm">No pinned messages</p>
        <p className="text-xs mt-1">Pin important messages to access them quickly</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-gray-700 mb-3">
        {pins.length} pinned message{pins.length !== 1 ? "s" : ""}
      </h3>
      {pins.map((pin) => (
        <div
          key={pin.message.id}
          className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all"
        >
          {/* Sender avatar */}
          <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
            {pin.sender.avatarUrl ? (
              <img
                src={pin.sender.avatarUrl}
                alt={pin.sender.displayName || "User"}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-blue-600 text-white text-sm font-medium">
                {pin.sender.displayName?.charAt(0).toUpperCase() || "?"}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-900">
                {pin.sender.displayName || "Unknown"}
              </span>
              <span className="text-xs text-gray-400">
                {formatTimestamp(pin.message.createdAt)}
              </span>
            </div>
            <p className="text-sm text-gray-600 line-clamp-3">
              {typeof pin.message.content.text === "string"
                ? pin.message.content.text
                : typeof pin.message.content.html === "string"
                  ? pin.message.content.html.replace(/<[^>]*>/g, "")
                  : "Message"}
            </p>
            <button
              onClick={() => handleUnpin(pin.message.id)}
              className="text-xs text-red-500 hover:text-red-600 mt-2 flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              Unpin
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AnnouncementBanner({
  announcement,
  onDismiss,
  onViewAll,
}: {
  announcement: Announcement;
  onDismiss: () => void;
  onViewAll: () => void;
}) {
  return (
    <div className="flex-shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-2">
      <div className="flex items-start gap-3">
        <Megaphone className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-medium text-amber-800">
              {announcement.author.displayName || "Admin"}
            </span>
            <span className="text-xs text-amber-600">
              {formatTimestamp(announcement.createdAt)}
            </span>
          </div>
          <p className="text-sm text-amber-900 line-clamp-2">
            {announcement.content}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onViewAll}
            className="px-2 py-1 text-xs text-amber-700 hover:text-amber-900 hover:bg-amber-100 rounded transition-colors"
          >
            View all
          </button>
          <button
            onClick={onDismiss}
            className="p-1 text-amber-500 hover:text-amber-700 hover:bg-amber-100 rounded transition-colors"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function AnnouncementsTabContent({
  chatId,
  announcements,
  onRefresh,
  currentUserRole,
}: {
  chatId: string;
  announcements: Announcement[];
  onRefresh: () => void;
  currentUserRole: "owner" | "admin" | "member";
}) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [newContent, setNewContent] = useState("");
  const [editContent, setEditContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canManage = currentUserRole === "owner" || currentUserRole === "admin";

  const createAnnouncement = async () => {
    if (!newContent.trim() || isSubmitting) return;

    const token = getCookie("session_token");
    if (!token) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/chats/${chatId}/announcements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: newContent.trim() }),
      });

      if (res.ok) {
        setNewContent("");
        setShowCreateDialog(false);
        onRefresh();
      }
    } catch {
      // Silent fail
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateAnnouncement = async () => {
    if (!editingAnnouncement || !editContent.trim() || isSubmitting) return;

    const token = getCookie("session_token");
    if (!token) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/chats/${chatId}/announcements/${editingAnnouncement.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: editContent.trim() }),
      });

      if (res.ok) {
        setEditContent("");
        setEditingAnnouncement(null);
        setShowEditDialog(false);
        onRefresh();
      }
    } catch {
      // Silent fail
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteAnnouncement = async (announcementId: string) => {
    const token = getCookie("session_token");
    if (!token) return;

    try {
      const res = await fetch(`/api/chats/${chatId}/announcements/${announcementId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        onRefresh();
      }
    } catch {
      // Silent fail
    }
  };

  const openEditDialog = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setEditContent(announcement.content);
    setShowEditDialog(true);
  };

  if (announcements.length === 0 && !canManage) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <Megaphone className="w-12 h-12 mb-3 text-gray-300" />
        <p className="text-sm">No announcements</p>
        <p className="text-xs mt-1">Group admins can post announcements here</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header with create button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">
          {announcements.length} announcement{announcements.length !== 1 ? "s" : ""}
        </h3>
        {canManage && (
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Announcement
          </button>
        )}
      </div>

      {/* Announcements list */}
      {announcements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          <Megaphone className="w-12 h-12 mb-3 text-gray-300" />
          <p className="text-sm">No announcements yet</p>
          <p className="text-xs mt-1">Post an announcement to share with the group</p>
        </div>
      ) : (
        <div className="space-y-2">
          {announcements.map((announcement) => (
            <div
              key={announcement.id}
              className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-amber-300 hover:shadow-sm transition-all"
            >
              {/* Author avatar */}
              <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                {announcement.author.avatarUrl ? (
                  <img
                    src={announcement.author.avatarUrl}
                    alt={announcement.author.displayName || "User"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-amber-600 text-white text-sm font-medium">
                    {announcement.author.displayName?.charAt(0).toUpperCase() || "?"}
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">
                    {announcement.author.displayName || "Unknown"}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatTimestamp(announcement.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {announcement.content}
                </p>
                {canManage && (
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => openEditDialog(announcement)}
                      className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1"
                    >
                      <Pencil className="w-3 h-3" />
                      Edit
                    </button>
                    <button
                      onClick={() => deleteAnnouncement(announcement.id)}
                      className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Announcement Dialog */}
      <Dialog.Root open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-full max-w-md z-50">
            <Dialog.Title className="text-lg font-semibold text-gray-900 mb-4">
              New Announcement
            </Dialog.Title>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Content
                </label>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Write your announcement..."
                  rows={4}
                  maxLength={5000}
                  className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {newContent.length}/5000 characters
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowCreateDialog(false);
                  setNewContent("");
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createAnnouncement}
                disabled={!newContent.trim() || isSubmitting}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Posting..." : "Post Announcement"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Edit Announcement Dialog */}
      <Dialog.Root open={showEditDialog} onOpenChange={setShowEditDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-full max-w-md z-50">
            <Dialog.Title className="text-lg font-semibold text-gray-900 mb-4">
              Edit Announcement
            </Dialog.Title>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Content
                </label>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="Write your announcement..."
                  rows={4}
                  maxLength={5000}
                  className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {editContent.length}/5000 characters
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowEditDialog(false);
                  setEditingAnnouncement(null);
                  setEditContent("");
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={updateAnnouncement}
                disabled={!editContent.trim() || isSubmitting}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

interface ChatMemberDetails {
  userId: string;
  role: "owner" | "admin" | "member";
  joinedAt: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string;
}

interface ChatDetails {
  id: string;
  type: string;
  name: string | null;
  avatarUrl: string | null;
  isPublic: boolean;
  memberCount: number;
  settings: {
    whoCanSendMessages?: "all" | "admins_only";
    whoCanAddMembers?: "all" | "admins_only";
    historyVisibleToNewMembers?: boolean;
  };
  currentUserRole: "owner" | "admin" | "member";
  createdAt: string;
  updatedAt: string;
}

interface OrgUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

function ChatInfoPanel({
  chatId,
  chatType,
  onClose,
  onMembersUpdated,
}: {
  chatId: string;
  chatType: string;
  onClose: () => void;
  onMembersUpdated?: () => void;
}) {
  const [chatDetails, setChatDetails] = useState<ChatDetails | null>(null);
  const [members, setMembers] = useState<ChatMemberDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
  const [addMemberSearchQuery, setAddMemberSearchQuery] = useState("");
  const [selectedUsersToAdd, setSelectedUsersToAdd] = useState<Set<string>>(new Set());
  const [isAddingMembers, setIsAddingMembers] = useState(false);
  const [confirmRemoveMember, setConfirmRemoveMember] = useState<string | null>(null);

  // Load chat details and members
  useEffect(() => {
    const loadChatInfo = async () => {
      const token = getCookie("session_token");
      if (!token) return;

      setIsLoading(true);
      setError(null);

      try {
        // Load chat details and members in parallel
        const [detailsRes, membersRes] = await Promise.all([
          fetch(`/api/chats/${chatId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/chats/${chatId}/members`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!detailsRes.ok || !membersRes.ok) {
          throw new Error("Failed to load chat info");
        }

        const detailsData = await detailsRes.json();
        const membersData = await membersRes.json();

        setChatDetails(detailsData);
        setMembers(membersData.members || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setIsLoading(false);
      }
    };

    loadChatInfo();
  }, [chatId]);

  // Load org users when add member dialog opens
  useEffect(() => {
    const loadOrgUsers = async () => {
      if (!showAddMemberDialog) return;

      const token = getCookie("session_token");
      if (!token) return;

      try {
        const res = await fetch("/api/contacts", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setOrgUsers(data.contacts || []);
        }
      } catch (err) {
        console.error("Failed to load org users:", err);
      }
    };

    loadOrgUsers();
  }, [showAddMemberDialog]);

  // Filter members by search
  const filteredMembers = useMemo(() => {
    if (!memberSearchQuery.trim()) return members;
    const query = memberSearchQuery.toLowerCase();
    return members.filter(
      (m) =>
        m.displayName?.toLowerCase().includes(query) ||
        m.email.toLowerCase().includes(query)
    );
  }, [members, memberSearchQuery]);

  // Sort members: owner first, then admins, then members
  const sortedMembers = useMemo(() => {
    return [...filteredMembers].sort((a, b) => {
      const roleOrder = { owner: 0, admin: 1, member: 2 };
      return roleOrder[a.role] - roleOrder[b.role];
    });
  }, [filteredMembers]);

  // Available users to add (not already members)
  const availableUsersToAdd = useMemo(() => {
    const memberIds = new Set(members.map((m) => m.userId));
    const filtered = orgUsers.filter((u) => !memberIds.has(u.id));
    if (!addMemberSearchQuery.trim()) return filtered;
    const query = addMemberSearchQuery.toLowerCase();
    return filtered.filter(
      (u) =>
        u.displayName?.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query)
    );
  }, [orgUsers, members, addMemberSearchQuery]);

  const canManageMembers = chatDetails?.currentUserRole === "owner" || chatDetails?.currentUserRole === "admin";
  const canChangeSettings = chatDetails?.currentUserRole === "owner" || chatDetails?.currentUserRole === "admin";
  const isOwner = chatDetails?.currentUserRole === "owner";
  const isGroupChat = chatType !== "dm";

  const updateChatSettings = async (updates: Partial<ChatDetails["settings"]> & { name?: string; isPublic?: boolean }) => {
    const token = getCookie("session_token");
    if (!token) return;

    setIsUpdating(true);
    try {
      const body: Record<string, unknown> = {};
      if (updates.name !== undefined) body.name = updates.name;
      if (updates.isPublic !== undefined) body.isPublic = updates.isPublic;
      if (updates.whoCanSendMessages !== undefined || updates.whoCanAddMembers !== undefined || updates.historyVisibleToNewMembers !== undefined) {
        body.settings = {
          whoCanSendMessages: updates.whoCanSendMessages,
          whoCanAddMembers: updates.whoCanAddMembers,
          historyVisibleToNewMembers: updates.historyVisibleToNewMembers,
        };
      }

      const res = await fetch(`/api/chats/${chatId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to update settings");
      }

      const updated = await res.json();
      setChatDetails((prev) => prev ? { ...prev, ...updated } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setIsUpdating(false);
    }
  };

  const addMembers = async () => {
    const token = getCookie("session_token");
    if (!token || selectedUsersToAdd.size === 0) return;

    setIsAddingMembers(true);
    try {
      const res = await fetch(`/api/chats/${chatId}/members`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ member_ids: Array.from(selectedUsersToAdd) }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to add members");
      }

      const data = await res.json();
      setMembers(data.members || []);
      setShowAddMemberDialog(false);
      setSelectedUsersToAdd(new Set());
      setAddMemberSearchQuery("");
      onMembersUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add members");
    } finally {
      setIsAddingMembers(false);
    }
  };

  const removeMember = async (userId: string) => {
    const token = getCookie("session_token");
    if (!token) return;

    try {
      const res = await fetch(`/api/chats/${chatId}/members/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to remove member");
      }

      setMembers((prev) => prev.filter((m) => m.userId !== userId));
      setConfirmRemoveMember(null);
      onMembersUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
    }
  };

  const updateMemberRole = async (userId: string, newRole: "admin" | "member") => {
    const token = getCookie("session_token");
    if (!token) return;

    try {
      const res = await fetch(`/api/chats/${chatId}/members/${userId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: newRole }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to update role");
      }

      setMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, role: newRole } : m))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    }
  };

  const leaveGroup = async () => {
    const token = getCookie("session_token");
    if (!token || !chatDetails) return;

    // Get current user ID from members
    const currentUser = members.find((m) => m.role === chatDetails.currentUserRole);
    if (!currentUser) return;

    try {
      const res = await fetch(`/api/chats/${chatId}/members/${currentUser.userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to leave group");
      }

      onClose();
      // Trigger reload of chat list
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to leave group");
    }
  };

  const getRoleBadge = (role: string) => {
    if (role === "owner") {
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700 rounded">
          <Crown className="w-3 h-3" />
          Owner
        </span>
      );
    }
    if (role === "admin") {
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
          <Shield className="w-3 h-3" />
          Admin
        </span>
      );
    }
    return null;
  };

  return (
    <div className="w-80 border-l border-gray-200 bg-white flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Info className="w-5 h-5 text-gray-500" />
          <h3 className="font-semibold text-gray-900">Chat Info</h3>
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
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-32 text-red-500 text-sm px-4 text-center">
            {error}
          </div>
        ) : chatDetails && (
          <>
            {/* Chat avatar and name */}
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                  {chatDetails.avatarUrl ? (
                    <img
                      src={chatDetails.avatarUrl}
                      alt={chatDetails.name || "Chat"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-blue-600 text-white text-xl font-semibold">
                      {isGroupChat ? (
                        <Users className="w-8 h-8" />
                      ) : (
                        chatDetails.name?.charAt(0).toUpperCase() || "?"
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="text-lg font-semibold text-gray-900">
                    {chatDetails.name || "Chat"}
                  </h4>
                  {isGroupChat && (
                    <p className="text-sm text-gray-500">
                      {chatDetails.memberCount} member{chatDetails.memberCount !== 1 ? "s" : ""}
                    </p>
                  )}
                  {isGroupChat && (
                    <div className="flex items-center gap-1 mt-1">
                      {chatDetails.isPublic ? (
                        <span className="inline-flex items-center gap-0.5 text-xs text-gray-500">
                          <Globe className="w-3 h-3" />
                          Public group
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-xs text-gray-500">
                          <Lock className="w-3 h-3" />
                          Private group
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Group Settings (for groups only) */}
            {isGroupChat && canChangeSettings && (
              <div className="border-b border-gray-100">
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Settings className="w-5 h-5 text-gray-500" />
                    <span className="font-medium text-gray-700">Group Settings</span>
                  </div>
                  {showSettings ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                </button>

                {showSettings && (
                  <div className="px-4 pb-4 space-y-4">
                    {/* Who can send messages */}
                    <div>
                      <label className="text-sm font-medium text-gray-700">
                        Who can send messages
                      </label>
                      <select
                        value={chatDetails.settings.whoCanSendMessages || "all"}
                        onChange={(e) =>
                          updateChatSettings({
                            whoCanSendMessages: e.target.value as "all" | "admins_only",
                          })
                        }
                        disabled={isUpdating}
                        className="mt-1 block w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="all">All members</option>
                        <option value="admins_only">Admins only</option>
                      </select>
                    </div>

                    {/* Who can add members */}
                    <div>
                      <label className="text-sm font-medium text-gray-700">
                        Who can add members
                      </label>
                      <select
                        value={chatDetails.settings.whoCanAddMembers || "all"}
                        onChange={(e) =>
                          updateChatSettings({
                            whoCanAddMembers: e.target.value as "all" | "admins_only",
                          })
                        }
                        disabled={isUpdating}
                        className="mt-1 block w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="all">All members</option>
                        <option value="admins_only">Admins only</option>
                      </select>
                    </div>

                    {/* History visible to new members */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">
                        History visible to new members
                      </span>
                      <button
                        onClick={() =>
                          updateChatSettings({
                            historyVisibleToNewMembers:
                              !chatDetails.settings.historyVisibleToNewMembers,
                          })
                        }
                        disabled={isUpdating}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          chatDetails.settings.historyVisibleToNewMembers !== false
                            ? "bg-blue-600"
                            : "bg-gray-200"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            chatDetails.settings.historyVisibleToNewMembers !== false
                              ? "translate-x-6"
                              : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>

                    {/* Public/Private toggle (owner only) */}
                    {isOwner && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">
                          Public group
                        </span>
                        <button
                          onClick={() =>
                            updateChatSettings({ isPublic: !chatDetails.isPublic })
                          }
                          disabled={isUpdating}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            chatDetails.isPublic ? "bg-blue-600" : "bg-gray-200"
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              chatDetails.isPublic ? "translate-x-6" : "translate-x-1"
                            }`}
                          />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Member List */}
            <div className="flex-1">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-gray-500" />
                  <span className="font-medium text-gray-700">Members</span>
                  <span className="text-sm text-gray-400">({members.length})</span>
                </div>
                {isGroupChat && canManageMembers && (
                  <button
                    onClick={() => setShowAddMemberDialog(true)}
                    className="p-1.5 rounded-full hover:bg-gray-100 text-blue-600 transition-colors"
                    title="Add members"
                  >
                    <UserPlus className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* Member search */}
              {members.length > 5 && (
                <div className="px-4 py-2 border-b border-gray-100">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search members..."
                      value={memberSearchQuery}
                      onChange={(e) => setMemberSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* Member list */}
              <div className="divide-y divide-gray-100">
                {sortedMembers.map((member) => (
                  <div
                    key={member.userId}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50"
                  >
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                      {member.avatarUrl ? (
                        <img
                          src={member.avatarUrl}
                          alt={member.displayName || "User"}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-blue-600 text-white text-sm font-medium">
                          {member.displayName?.charAt(0).toUpperCase() || "?"}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {member.displayName || member.email}
                        </span>
                        {getRoleBadge(member.role)}
                      </div>
                      <span className="text-xs text-gray-500 truncate block">
                        {member.email}
                      </span>
                    </div>

                    {/* Actions (for group chats) */}
                    {isGroupChat && member.role !== "owner" && (
                      <Popover.Root>
                        <Popover.Trigger asChild>
                          <button className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400">
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </Popover.Trigger>
                        <Popover.Portal>
                          <Popover.Content
                            className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px] z-50"
                            sideOffset={5}
                          >
                            {isOwner && member.role === "member" && (
                              <button
                                onClick={() => updateMemberRole(member.userId, "admin")}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-100"
                              >
                                <Shield className="w-4 h-4 text-blue-600" />
                                Make admin
                              </button>
                            )}
                            {isOwner && member.role === "admin" && (
                              <button
                                onClick={() => updateMemberRole(member.userId, "member")}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-100"
                              >
                                <Shield className="w-4 h-4 text-gray-400" />
                                Remove admin
                              </button>
                            )}
                            {canManageMembers && (member.role === "member" || isOwner) && (
                              <button
                                onClick={() => setConfirmRemoveMember(member.userId)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-red-600 hover:bg-red-50"
                              >
                                <UserMinus className="w-4 h-4" />
                                Remove from group
                              </button>
                            )}
                            <Popover.Arrow className="fill-white" />
                          </Popover.Content>
                        </Popover.Portal>
                      </Popover.Root>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Leave group button (for non-owners in group chats) */}
            {isGroupChat && !isOwner && (
              <div className="p-4 border-t border-gray-200">
                <button
                  onClick={leaveGroup}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Leave group
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add Member Dialog */}
      <Dialog.Root open={showAddMemberDialog} onOpenChange={setShowAddMemberDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl z-50 w-full max-w-md p-0 max-h-[80vh] flex flex-col">
            <Dialog.Title className="text-lg font-semibold px-4 py-3 border-b border-gray-200">
              Add Members
            </Dialog.Title>

            {/* Search */}
            <div className="px-4 py-3 border-b border-gray-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={addMemberSearchQuery}
                  onChange={(e) => setAddMemberSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Selected count */}
            {selectedUsersToAdd.size > 0 && (
              <div className="px-4 py-2 bg-blue-50 text-blue-700 text-sm">
                {selectedUsersToAdd.size} user{selectedUsersToAdd.size !== 1 ? "s" : ""} selected
              </div>
            )}

            {/* User list */}
            <div className="flex-1 overflow-y-auto">
              {availableUsersToAdd.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
                  No users available to add
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {availableUsersToAdd.map((user) => (
                    <label
                      key={user.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedUsersToAdd.has(user.id)}
                        onChange={(e) => {
                          const newSet = new Set(selectedUsersToAdd);
                          if (e.target.checked) {
                            newSet.add(user.id);
                          } else {
                            newSet.delete(user.id);
                          }
                          setSelectedUsersToAdd(newSet);
                        }}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                        {user.avatarUrl ? (
                          <img
                            src={user.avatarUrl}
                            alt={user.displayName || "User"}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-blue-600 text-white text-sm font-medium">
                            {user.displayName?.charAt(0).toUpperCase() || "?"}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {user.displayName || user.email}
                        </div>
                        <div className="text-xs text-gray-500">{user.email}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowAddMemberDialog(false);
                  setSelectedUsersToAdd(new Set());
                  setAddMemberSearchQuery("");
                }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addMembers}
                disabled={selectedUsersToAdd.size === 0 || isAddingMembers}
                className="px-4 py-2 text-sm bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isAddingMembers && <Loader2 className="w-4 h-4 animate-spin" />}
                Add {selectedUsersToAdd.size > 0 ? `(${selectedUsersToAdd.size})` : ""}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Confirm Remove Member Dialog */}
      <Dialog.Root open={!!confirmRemoveMember} onOpenChange={(open) => !open && setConfirmRemoveMember(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl z-50 w-full max-w-sm p-6">
            <Dialog.Title className="text-lg font-semibold text-gray-900">
              Remove Member
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-gray-500">
              Are you sure you want to remove this member from the group?
            </Dialog.Description>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => setConfirmRemoveMember(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmRemoveMember && removeMember(confirmRemoveMember)}
                className="px-4 py-2 text-sm bg-red-600 text-white font-medium rounded-md hover:bg-red-700 transition-colors"
              >
                Remove
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
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
  const [tab, setTab] = useState<"dm" | "group" | "topic_group">("dm");
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

  const handleCreateGroup = async (groupType: "group" | "topic_group" = "group") => {
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
          type: groupType,
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
            <button
              onClick={() => setTab("topic_group")}
              className={`flex-1 px-4 py-2 text-sm font-medium ${
                tab === "topic_group"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Topic Group
            </button>
          </div>

          <div className="p-4">
            {error && (
              <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">
                {error}
              </div>
            )}

            {(tab === "group" || tab === "topic_group") && (
              <div className="mb-4">
                <input
                  type="text"
                  placeholder={tab === "topic_group" ? "Topic group name" : "Group name"}
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {tab === "topic_group" && (
                  <p className="mt-1 text-xs text-gray-500">
                    Topic groups organize discussions into separate topics
                  </p>
                )}
              </div>
            )}

            {(tab === "group" || tab === "topic_group") && selectedUsers.length > 0 && (
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
                        {(tab === "group" || tab === "topic_group") && isSelected && (
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

            {(tab === "group" || tab === "topic_group") && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <button
                  onClick={() => handleCreateGroup(tab === "topic_group" ? "topic_group" : "group")}
                  disabled={isCreating || !groupName.trim() || selectedUsers.length === 0}
                  className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isCreating ? "Creating..." : tab === "topic_group" ? "Create Topic Group" : "Create Group"}
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

  // Buzz overlay state (for receiving buzzes)
  const [activeBuzz, setActiveBuzz] = useState<BuzzEvent | null>(null);

  // Dismiss buzz overlay
  const dismissBuzz = useCallback(() => {
    setActiveBuzz(null);
  }, []);

  // View buzzed message in chat
  const viewBuzzInChat = useCallback(() => {
    if (!activeBuzz) return;
    // Select the chat with the buzzed message
    const buzzChat = chats.find((c: Chat) => c.id === activeBuzz.chatId);
    if (buzzChat) {
      setSelectedChatId(buzzChat.id);
    }
    setActiveBuzz(null);
  }, [activeBuzz, chats]);

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

    // Handle buzz (urgent notification) events
    if (message.type === "buzz" && message.payload) {
      const payload = message.payload as BuzzEvent;
      setActiveBuzz(payload);
    }

    // Handle notification events (includes buzz notifications)
    // Note: Buzz notifications are handled via the dedicated "buzz" event type above
    // Other notification types can be handled here if needed in the future
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
          selectedChat.type === "topic_group" ? (
            <TopicGroupView
              chat={selectedChat}
              currentUserId={currentUserId}
            />
          ) : (
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
          )
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

      {/* Buzz Overlay - full-screen urgent notification for incoming buzzes */}
      {activeBuzz && (
        <BuzzOverlay
          buzz={activeBuzz}
          onDismiss={dismissBuzz}
          onViewInChat={viewBuzzInChat}
        />
      )}
    </div>
  );
}
