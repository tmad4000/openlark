"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { api, type Message, type MessageReaction } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Clock, AlertCircle } from "lucide-react";
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
}

export function MessageList({ chatId, onMessagesLoaded, onlineUsers, memberCount }: MessageListProps) {
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
}

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
}: MessageBubbleProps) {
  const [showPicker, setShowPicker] = useState(false);
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

  return (
    <div
      className={cn(
        "group relative flex",
        isOwn ? "justify-end" : "justify-start"
      )}
      onMouseLeave={() => setShowPicker(false)}
    >
      <div className="relative max-w-[70%]">
        {/* Quick reaction picker on hover */}
        {!isRecalled && !isPending && !isFailed && (
          <div
            className={cn(
              "absolute -top-8 z-10",
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
          <div className="text-sm whitespace-pre-wrap break-words">
            {getMessageContent()}
          </div>
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
