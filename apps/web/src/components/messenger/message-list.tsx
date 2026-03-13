"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { api, type Message, type MessageReaction } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Clock, AlertCircle, MessageSquareText, Pin, Star, Pencil, Trash2, Check, X, Forward, Copy, CheckCheck } from "lucide-react";
import {
  ReadReceiptIndicator,
  type ReadStatus,
} from "./read-receipt-indicator";
import {
  ReactionPicker,
  ReactionDisplay,
  groupReactions,
  type ReactionGroup,
} from "./message-reactions";

// Extended message type for optimistic updates
export interface OptimisticMessage extends Message {
  _tempId?: string;
  _pending?: boolean;
  _failed?: boolean;
}

// Map of userId to display name for sender lookup
type SenderMap = Map<string, { displayName: string | null; avatarUrl: string | null }>;

// Read status per message: messageId -> { readBy userId[], count }
interface ReadStatusInfo {
  readCount: number;
  readStatus: ReadStatus;
}

interface MessageListProps {
  chatId: string;
  onMessagesLoaded?: (messages: Message[]) => void;
  onlineUsers?: Set<string>;
  memberCount?: number;
  onOpenThread?: (messageId: string) => void;
  pinnedMessageIds?: Set<string>;
  favoritedMessageIds?: Set<string>;
  onPinMessage?: (messageId: string) => void;
  onUnpinMessage?: (messageId: string) => void;
  onFavoriteMessage?: (messageId: string) => void;
  onUnfavoriteMessage?: (messageId: string) => void;
  onEditMessage?: (messageId: string, content: string) => Promise<void>;
  onRecallMessage?: (messageId: string) => Promise<void>;
  onForwardMessage?: (message: Message) => void;
}

export function MessageList({ chatId, onMessagesLoaded, onlineUsers, memberCount, onOpenThread, pinnedMessageIds, favoritedMessageIds, onPinMessage, onUnpinMessage, onFavoriteMessage, onUnfavoriteMessage, onEditMessage, onRecallMessage, onForwardMessage }: MessageListProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<OptimisticMessage[]>([]);
  const [senderMap, setSenderMap] = useState<SenderMap>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readStatuses, setReadStatuses] = useState<Map<string, ReadStatusInfo>>(new Map());
  const [reactions, setReactions] = useState<Map<string, MessageReaction[]>>(new Map());
  const [totalMembers, setTotalMembers] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const markReadTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initial load - fetch both messages and members
  useEffect(() => {
    async function loadMessages() {
      try {
        setIsLoading(true);
        setError(null);
        setMessages([]);
        setSenderMap(new Map());
        setReadStatuses(new Map());

        // Fetch messages and members in parallel
        const [messagesResponse, membersResponse] = await Promise.all([
          api.getMessages(chatId, { limit: 50 }),
          api.getChatMembers(chatId),
        ]);

        // Build sender map from members
        const newSenderMap: SenderMap = new Map();
        for (const member of membersResponse.members) {
          if (member.user) {
            newSenderMap.set(member.userId, member.user);
          }
        }
        setSenderMap(newSenderMap);
        setTotalMembers(membersResponse.members.length);

        setMessages(messagesResponse.messages);
        setHasMore(messagesResponse.messages.length === 50);
        onMessagesLoaded?.(messagesResponse.messages);

        // Fetch read status for own messages
        const ownMsgIds = messagesResponse.messages
          .filter((m) => m.senderId === user?.id)
          .map((m) => m.id);
        if (ownMsgIds.length > 0) {
          fetchReadStatuses(chatId, ownMsgIds, membersResponse.members.length);
        }

        // Fetch reactions for all messages
        const allMsgIds = messagesResponse.messages.map((m) => m.id);
        if (allMsgIds.length > 0) {
          fetchReactions(allMsgIds);
        }

        // Auto-mark chat as read
        if (messagesResponse.messages.length > 0) {
          const latestMsg = messagesResponse.messages[messagesResponse.messages.length - 1];
          if (latestMsg && latestMsg.senderId !== user?.id) {
            markReadTimerRef.current = setTimeout(() => {
              api.markChatRead(chatId, latestMsg.id).catch(() => {});
            }, 500);
          }
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load messages"
        );
      } finally {
        setIsLoading(false);
      }
    }

    loadMessages();

    return () => {
      if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
    };
  }, [chatId, onMessagesLoaded, user?.id]);

  // Fetch read statuses for a batch of message IDs
  const fetchReadStatuses = useCallback(
    async (cId: string, messageIds: string[], memberCt: number) => {
      try {
        const data = await api.getReadStatus(cId, messageIds);
        setReadStatuses((prev) => {
          const next = new Map(prev);
          // Others = total members minus sender (1)
          const othersCount = Math.max(memberCt - 1, 1);
          for (const s of data.statuses) {
            const readCount = s.readBy.length;
            let readStatus: ReadStatus = "unread";
            if (readCount >= othersCount) {
              readStatus = "all_read";
            } else if (readCount > 0) {
              readStatus = "partial";
            }
            next.set(s.messageId, { readCount, readStatus });
          }
          return next;
        });
      } catch {
        // Silently ignore read status errors
      }
    },
    []
  );

  // Fetch reactions for a batch of messages
  const fetchReactions = useCallback(async (messageIds: string[]) => {
    const results = await Promise.allSettled(
      messageIds.map((id) => api.getReactions(id).then((r) => ({ id, reactions: r.reactions })))
    );
    setReactions((prev) => {
      const next = new Map(prev);
      for (const result of results) {
        if (result.status === "fulfilled") {
          next.set(result.value.id, result.value.reactions);
        }
      }
      return next;
    });
  }, []);

  // Toggle a reaction on a message
  const handleReactionToggle = useCallback(
    async (messageId: string, emoji: string, add: boolean) => {
      if (!user?.id) return;

      // Optimistic update
      setReactions((prev) => {
        const next = new Map(prev);
        const existing = next.get(messageId) || [];
        if (add) {
          next.set(messageId, [
            ...existing,
            { messageId, userId: user.id, emoji, createdAt: new Date().toISOString() },
          ]);
        } else {
          next.set(
            messageId,
            existing.filter((r) => !(r.emoji === emoji && r.userId === user.id))
          );
        }
        return next;
      });

      try {
        if (add) {
          await api.addReaction(messageId, emoji);
        } else {
          await api.removeReaction(messageId, emoji);
        }
      } catch {
        // Revert optimistic update on failure
        const data = await api.getReactions(messageId);
        setReactions((prev) => {
          const next = new Map(prev);
          next.set(messageId, data.reactions);
          return next;
        });
      }
    },
    [user?.id]
  );

  // Handle real-time reaction events
  const handleReactionAdded = useCallback(
    (messageId: string, emoji: string, userId: string) => {
      // Skip if this is our own reaction (already handled optimistically)
      if (userId === user?.id) return;
      setReactions((prev) => {
        const next = new Map(prev);
        const existing = next.get(messageId) || [];
        // Don't add duplicates
        if (existing.some((r) => r.emoji === emoji && r.userId === userId)) return prev;
        next.set(messageId, [
          ...existing,
          { messageId, userId, emoji, createdAt: new Date().toISOString() },
        ]);
        return next;
      });
    },
    [user?.id]
  );

  const handleReactionRemoved = useCallback(
    (messageId: string, emoji: string, userId: string) => {
      if (userId === user?.id) return;
      setReactions((prev) => {
        const next = new Map(prev);
        const existing = next.get(messageId) || [];
        next.set(
          messageId,
          existing.filter((r) => !(r.emoji === emoji && r.userId === userId))
        );
        return next;
      });
    },
    [user?.id]
  );

  // Handle real-time read receipt updates
  const handleReadReceipt = useCallback(
    (userId: string, _lastMessageId: string) => {
      // Increment read count for all own messages (simplified - the user read up to lastMessageId)
      setReadStatuses((prev) => {
        const next = new Map(prev);
        const othersCount = Math.max(totalMembers - 1, 1);
        for (const [msgId, info] of next) {
          // Optimistically increment if this user might have read it
          const newCount = info.readCount + 1;
          let readStatus: ReadStatus = "unread";
          if (newCount >= othersCount) {
            readStatus = "all_read";
          } else if (newCount > 0) {
            readStatus = "partial";
          }
          next.set(msgId, { readCount: newCount, readStatus });
        }
        return next;
      });
    },
    [totalMembers]
  );

  // Expose handleReadReceipt for parent
  MessageList.handleReadReceipt = handleReadReceipt;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollContainerRef.current && !isLoadingMore) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
  }, [messages, isLoadingMore]);

  // Load more messages (pagination)
  const loadMoreMessages = useCallback(async () => {
    if (isLoadingMore || !hasMore || messages.length === 0) return;

    const oldestMessage = messages[0];
    if (!oldestMessage) return;

    try {
      setIsLoadingMore(true);
      const response = await api.getMessages(chatId, {
        before: oldestMessage.id,
        limit: 50,
      });

      setMessages((prev) => [...response.messages, ...prev]);
      setHasMore(response.messages.length === 50);

      // Fetch read status for new own messages
      const ownMsgIds = response.messages
        .filter((m) => m.senderId === user?.id)
        .map((m) => m.id);
      if (ownMsgIds.length > 0) {
        fetchReadStatuses(chatId, ownMsgIds, totalMembers);
      }
    } catch (err) {
      console.error("Failed to load more messages:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [chatId, hasMore, isLoadingMore, messages, user?.id, fetchReadStatuses, totalMembers]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    const trigger = loadMoreTriggerRef.current;
    if (!trigger) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isLoadingMore) {
          loadMoreMessages();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(trigger);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMoreMessages]);

  // Add a new message (called from parent/WebSocket)
  const addMessage = useCallback((message: OptimisticMessage) => {
    setMessages((prev) => {
      // Avoid duplicates by real ID
      if (prev.some((m) => m.id === message.id)) return prev;

      // If this is a real message from WS, check if there's a pending optimistic
      // message from the same sender that should be replaced
      if (!message._tempId) {
        const pendingIdx = prev.findIndex(
          (m) => m._pending && m.senderId === message.senderId
        );
        if (pendingIdx !== -1) {
          const updated = [...prev];
          updated[pendingIdx] = message;
          return updated;
        }
      }

      return [...prev, message];
    });

    // Auto-mark as read for incoming messages from others
    if (message.senderId !== user?.id && !message._pending) {
      api.markChatRead(message.chatId, message.id).catch(() => {});
    }
  }, [user?.id]);

  // Update a message (for edits)
  const updateMessage = useCallback((updatedMessage: Message) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === updatedMessage.id ? updatedMessage : m))
    );
  }, []);

  // Remove a message (for recalls)
  const removeMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  // Mark a message as recalled (shows "Message recalled" placeholder)
  const markRecalled = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((m) => m.id === messageId ? { ...m, recalledAt: new Date().toISOString() } : m)
    );
  }, []);

  // Replace an optimistic message with the confirmed one from API
  const confirmMessage = useCallback((tempId: string, realMessage: Message) => {
    setMessages((prev) =>
      prev.map((m) => (m._tempId === tempId ? realMessage : m))
    );
  }, []);

  // Mark an optimistic message as failed
  const failMessage = useCallback((tempId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m._tempId === tempId ? { ...m, _pending: false, _failed: true } : m
      )
    );
  }, []);

  // Remove an optimistic message (e.g. after retry sends a new one)
  const removeOptimisticMessage = useCallback((tempId: string) => {
    setMessages((prev) => prev.filter((m) => m._tempId !== tempId));
  }, []);

  // Expose methods for parent components
  MessageList.addMessage = addMessage;
  MessageList.updateMessage = updateMessage;
  MessageList.removeMessage = removeMessage;
  MessageList.markRecalled = markRecalled;
  MessageList.confirmMessage = confirmMessage;
  MessageList.failMessage = failMessage;
  MessageList.removeOptimisticMessage = removeOptimisticMessage;
  MessageList.handleReactionAdded = handleReactionAdded;
  MessageList.handleReactionRemoved = handleReactionRemoved;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-sm text-red-500 text-center">{error}</div>
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      className="flex-1 overflow-y-auto px-4 py-2"
    >
      {/* Load more trigger */}
      {hasMore && (
        <div
          ref={loadMoreTriggerRef}
          className="flex justify-center py-2"
        >
          {isLoadingMore && (
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          )}
        </div>
      )}

      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No messages yet
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Start the conversation!
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {messages.map((message, index) => {
            const isOwn = message.senderId === user?.id;
            const showSender = !isOwn && (
              index === 0 || messages[index - 1]?.senderId !== message.senderId
            );
            const senderInfo = senderMap.get(message.senderId);
            const readInfo = isOwn ? readStatuses.get(message.id) : undefined;
            const messageReactions = reactions.get(message.id) || [];
            const reactionGroups = user?.id
              ? groupReactions(messageReactions, user.id)
              : [];

            return (
              <MessageBubble
                key={message.id}
                message={message}
                isOwn={isOwn}
                showSender={showSender}
                senderName={senderInfo?.displayName}
                isOnline={onlineUsers?.has(message.senderId) ?? false}
                readInfo={readInfo}
                totalMembers={totalMembers}
                senderMap={senderMap}
                reactionGroups={reactionGroups}
                onReactionToggle={handleReactionToggle}
                onOpenThread={onOpenThread}
                isPinned={pinnedMessageIds?.has(message.id) ?? false}
                isFavorited={favoritedMessageIds?.has(message.id) ?? false}
                onPin={onPinMessage}
                onUnpin={onUnpinMessage}
                onFavorite={onFavoriteMessage}
                onUnfavorite={onUnfavoriteMessage}
                onEdit={onEditMessage}
                onRecall={onRecallMessage}
                onForward={onForwardMessage}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// Static methods for external updates
MessageList.addMessage = (_message: OptimisticMessage) => {};
MessageList.updateMessage = (_message: Message) => {};
MessageList.removeMessage = (_messageId: string) => {};
MessageList.markRecalled = (_messageId: string) => {};
MessageList.confirmMessage = (_tempId: string, _realMessage: Message) => {};
MessageList.failMessage = (_tempId: string) => {};
MessageList.removeOptimisticMessage = (_tempId: string) => {};
MessageList.handleReadReceipt = (_userId: string, _lastMessageId: string) => {};
MessageList.handleReactionAdded = (_messageId: string, _emoji: string, _userId: string) => {};
MessageList.handleReactionRemoved = (_messageId: string, _emoji: string, _userId: string) => {};

interface MessageBubbleProps {
  message: OptimisticMessage;
  isOwn: boolean;
  showSender: boolean;
  senderName?: string | null;
  isOnline?: boolean;
  readInfo?: ReadStatusInfo;
  totalMembers: number;
  senderMap?: SenderMap;
  reactionGroups: ReactionGroup[];
  onReactionToggle: (messageId: string, emoji: string, add: boolean) => void;
  onOpenThread?: (messageId: string) => void;
  isPinned?: boolean;
  isFavorited?: boolean;
  onPin?: (messageId: string) => void;
  onUnpin?: (messageId: string) => void;
  onFavorite?: (messageId: string) => void;
  onUnfavorite?: (messageId: string) => void;
  onEdit?: (messageId: string, content: string) => Promise<void>;
  onRecall?: (messageId: string) => Promise<void>;
  onForward?: (message: Message) => void;
}

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

function MessageBubble({
  message,
  isOwn,
  showSender,
  senderName,
  isOnline,
  readInfo,
  totalMembers,
  senderMap,
  reactionGroups,
  onReactionToggle,
  onOpenThread,
  isPinned,
  isFavorited,
  onPin,
  onUnpin,
  onFavorite,
  onUnfavorite,
  onEdit,
  onRecall,
  onForward,
}: MessageBubbleProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [recallLoading, setRecallLoading] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const isRecalled = !!message.recalledAt;
  const isEdited = !!message.editedAt;
  const isPending = !!message._pending;
  const isFailed = !!message._failed;

  const getMessageContent = () => {
    if (isRecalled) {
      return (
        <span className="text-gray-400 dark:text-gray-500 italic">
          Message recalled
        </span>
      );
    }
    return message.contentJson?.text || "";
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const handleReactionSelect = useCallback(
    (messageId: string, emoji: string, add: boolean) => {
      onReactionToggle(messageId, emoji, add);
      setShowPicker(false);
    },
    [onReactionToggle]
  );

  const canEdit = isOwn && !isRecalled && !isPending && !isFailed
    && (Date.now() - new Date(message.createdAt).getTime()) < EDIT_WINDOW_MS;
  const canRecall = (isOwn && !isRecalled && !isPending && !isFailed
    && (Date.now() - new Date(message.createdAt).getTime()) < EDIT_WINDOW_MS);

  const handleStartEdit = useCallback(() => {
    setEditText(message.contentJson?.text || "");
    setIsEditing(true);
    setTimeout(() => editInputRef.current?.focus(), 0);
  }, [message.contentJson?.text]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditText("");
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editText.trim() || editLoading) return;
    setEditLoading(true);
    try {
      await onEdit?.(message.id, editText.trim());
      setIsEditing(false);
      setEditText("");
    } catch {
      // stay in edit mode on failure
    } finally {
      setEditLoading(false);
    }
  }, [editText, editLoading, onEdit, message.id]);

  const handleRecall = useCallback(async () => {
    if (recallLoading) return;
    if (!window.confirm("Recall this message? It will be removed for everyone.")) return;
    setRecallLoading(true);
    try {
      await onRecall?.(message.id);
    } catch {
      // ignore
    } finally {
      setRecallLoading(false);
    }
  }, [recallLoading, onRecall, message.id]);

  return (
    <div
      className={cn(
        "group relative flex",
        isOwn ? "justify-end" : "justify-start"
      )}
      onMouseLeave={() => setShowPicker(false)}
    >
      <div className="relative max-w-[70%]">
        {/* Quick reaction picker + reply button on hover */}
        {!isRecalled && !isPending && !isFailed && (
          <div
            className={cn(
              "absolute -top-8 z-10 flex items-center gap-1",
              isOwn ? "right-0" : "left-0",
              showPicker ? "visible" : "invisible group-hover:visible"
            )}
          >
            <ReactionPicker
              messageId={message.id}
              existingReactions={reactionGroups}
              currentUserId=""
              onReactionToggle={handleReactionSelect}
            />
            <button
              onClick={() => onOpenThread?.(message.id)}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              title="Reply in thread"
            >
              <MessageSquareText className="h-4 w-4" />
            </button>
            <button
              onClick={() => isPinned ? onUnpin?.(message.id) : onPin?.(message.id)}
              className={cn(
                "p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700",
                isPinned
                  ? "text-blue-500 hover:text-blue-700"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              )}
              title={isPinned ? "Unpin message" : "Pin message"}
            >
              <Pin className="h-4 w-4" />
            </button>
            <button
              onClick={() => isFavorited ? onUnfavorite?.(message.id) : onFavorite?.(message.id)}
              className={cn(
                "p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700",
                isFavorited
                  ? "text-yellow-500 hover:text-yellow-700"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              )}
              title={isFavorited ? "Remove from favorites" : "Add to favorites"}
            >
              <Star className={cn("h-4 w-4", isFavorited && "fill-current")} />
            </button>
            <button
              onClick={() => onForward?.(message)}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              title="Forward message"
            >
              <Forward className="h-4 w-4" />
            </button>
            {canEdit && (
              <button
                onClick={handleStartEdit}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                title="Edit message"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {canRecall && (
              <button
                onClick={handleRecall}
                disabled={recallLoading}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-red-600 dark:hover:text-red-400"
                title="Recall message"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {isPinned && (
          <div className="flex items-center gap-1 text-xs text-blue-500 mb-1">
            <Pin className="h-3 w-3" />
            <span>Pinned</span>
          </div>
        )}

        <div
          className={cn(
            "rounded-lg px-4 py-2",
            isOwn
              ? "bg-blue-600 text-white"
              : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100",
            isRecalled && "opacity-50",
            isPending && "opacity-70",
            isFailed && "border-2 border-red-400"
          )}
        >
          {showSender && (
            <div className="text-xs font-medium mb-1 opacity-70 flex items-center gap-1">
              {isOnline && (
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
              )}
              {senderName || `User ${message.senderId.slice(0, 8)}`}
            </div>
          )}
          {message.contentJson?.forwarded && (
            <div className={cn(
              "flex items-center gap-1 text-xs mb-1 italic",
              isOwn ? "text-blue-200" : "text-gray-400 dark:text-gray-500"
            )}>
              <Forward className="h-3 w-3" />
              <span>
                Forwarded from {message.contentJson.forwarded.originalSenderName}
                {message.contentJson.forwarded.originalChatName && (
                  <> in {message.contentJson.forwarded.originalChatName}</>
                )}
              </span>
            </div>
          )}
          {isEditing ? (
            <div className="flex flex-col gap-1">
              <textarea
                ref={editInputRef}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSaveEdit();
                  }
                  if (e.key === "Escape") handleCancelEdit();
                }}
                className="text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 resize-none min-h-[2rem] focus:outline-none focus:ring-1 focus:ring-blue-500"
                rows={1}
                disabled={editLoading}
              />
              <div className="flex items-center gap-1 justify-end">
                <button
                  onClick={handleCancelEdit}
                  className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500"
                  title="Cancel"
                  disabled={editLoading}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-green-600 dark:text-green-400"
                  title="Save edit"
                  disabled={editLoading || !editText.trim()}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : message.contentJson?.html ? (
            <MessageRichContent html={message.contentJson.html} isOwn={isOwn} />
          ) : (
            <div className="text-sm whitespace-pre-wrap break-words">
              {getMessageContent()}
            </div>
          )}
          <div
            className={cn(
              "text-xs mt-1 flex items-center gap-1",
              isOwn ? "text-blue-100" : "text-gray-500 dark:text-gray-400"
            )}
          >
            {isPending ? (
              <Clock className="h-3 w-3 animate-pulse" />
            ) : isFailed ? (
              <AlertCircle className="h-3 w-3 text-red-400" />
            ) : (
              <span>{formatTime(message.createdAt)}</span>
            )}
            {isEdited && !isRecalled && !isPending && !isFailed && (
              <span className="italic">(edited)</span>
            )}
            {isFailed && (
              <span className="text-red-400 text-xs">Failed to send</span>
            )}
            {isOwn && !isPending && !isFailed && !isRecalled && readInfo && (
              <ReadReceiptIndicator
                messageId={message.id}
                readStatus={readInfo.readStatus}
                readCount={readInfo.readCount}
                totalMembers={Math.max(totalMembers - 1, 1)}
                senderMap={senderMap}
              />
            )}
          </div>
        </div>

        {/* Thread replies indicator */}
        {(message.replyCount ?? 0) > 0 && (
          <button
            onClick={() => onOpenThread?.(message.id)}
            className="flex items-center gap-1 mt-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            <MessageSquareText className="h-3 w-3" />
            <span>
              {message.replyCount} {message.replyCount === 1 ? "reply" : "replies"}
            </span>
          </button>
        )}

        {/* Reaction display below message */}
        <ReactionDisplay
          reactions={reactionGroups}
          messageId={message.id}
          onReactionToggle={onReactionToggle}
          senderMap={senderMap}
        />
      </div>
    </div>
  );
}

// Rich content renderer with code block copy buttons
function MessageRichContent({ html, isOwn }: { html: string; isOwn: boolean }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopyCode = useCallback(async (index: number) => {
    if (!contentRef.current) return;
    const codeBlocks = contentRef.current.querySelectorAll("pre code");
    const codeEl = codeBlocks[index];
    if (!codeEl) return;
    try {
      await navigator.clipboard.writeText(codeEl.textContent || "");
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      // fallback - ignore
    }
  }, []);

  useEffect(() => {
    if (!contentRef.current) return;
    const preElements = contentRef.current.querySelectorAll("pre");
    // Clean up existing buttons first
    contentRef.current.querySelectorAll(".code-copy-btn").forEach((el) => el.remove());

    preElements.forEach((pre, index) => {
      pre.style.position = "relative";
      const btn = document.createElement("button");
      btn.className = "code-copy-btn";
      btn.title = "Copy code";
      btn.setAttribute("data-index", String(index));
      btn.innerHTML = copiedIndex === index
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/><path d="M20 6 9 17l-5-5"/></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
      btn.onclick = () => handleCopyCode(index);
      pre.appendChild(btn);
    });
  }, [html, copiedIndex, handleCopyCode]);

  return (
    <div
      ref={contentRef}
      className={cn(
        "text-sm prose prose-sm max-w-none break-words",
        "[&_p]:my-0 [&_ul]:my-1 [&_ol]:my-1 [&_blockquote]:my-1",
        "[&_pre]:relative [&_pre]:rounded-md [&_pre]:p-3 [&_pre]:my-2 [&_pre]:text-xs [&_pre]:overflow-x-auto",
        "[&_pre]:bg-gray-900 [&_pre]:text-gray-100",
        "[&_code]:text-xs",
        "[&_.code-copy-btn]:absolute [&_.code-copy-btn]:top-2 [&_.code-copy-btn]:right-2 [&_.code-copy-btn]:p-1.5 [&_.code-copy-btn]:rounded [&_.code-copy-btn]:bg-gray-700 [&_.code-copy-btn]:hover:bg-gray-600 [&_.code-copy-btn]:text-gray-300 [&_.code-copy-btn]:transition-colors [&_.code-copy-btn]:opacity-0 [&_pre:hover_.code-copy-btn]:opacity-100",
        isOwn
          ? "prose-invert [&_pre]:bg-blue-800/50 [&_.code-copy-btn]:bg-blue-700 [&_.code-copy-btn]:hover:bg-blue-600"
          : "dark:prose-invert [&_pre]:bg-gray-900 [&_pre]:dark:bg-gray-950"
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
