"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { api, type Message } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Clock, AlertCircle } from "lucide-react";

// Extended message type for optimistic updates
export interface OptimisticMessage extends Message {
  _tempId?: string;
  _pending?: boolean;
  _failed?: boolean;
}

// Map of userId to display name for sender lookup
type SenderMap = Map<string, { displayName: string | null; avatarUrl: string | null }>;

interface MessageListProps {
  chatId: string;
  onMessagesLoaded?: (messages: Message[]) => void;
  onlineUsers?: Set<string>;
}

export function MessageList({ chatId, onMessagesLoaded, onlineUsers }: MessageListProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<OptimisticMessage[]>([]);
  const [senderMap, setSenderMap] = useState<SenderMap>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  // Initial load - fetch both messages and members
  useEffect(() => {
    async function loadMessages() {
      try {
        setIsLoading(true);
        setError(null);
        setMessages([]);
        setSenderMap(new Map());

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

        setMessages(messagesResponse.messages);
        setHasMore(messagesResponse.messages.length === 50);
        onMessagesLoaded?.(messagesResponse.messages);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load messages"
        );
      } finally {
        setIsLoading(false);
      }
    }

    loadMessages();
  }, [chatId, onMessagesLoaded]);

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
    } catch (err) {
      console.error("Failed to load more messages:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [chatId, hasMore, isLoadingMore, messages]);

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
  }, []);

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

            return (
              <MessageBubble
                key={message.id}
                message={message}
                isOwn={isOwn}
                showSender={showSender}
                senderName={senderInfo?.displayName}
                isOnline={onlineUsers?.has(message.senderId) ?? false}
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

interface MessageBubbleProps {
  message: OptimisticMessage;
  isOwn: boolean;
  showSender: boolean;
  senderName?: string | null;
  isOnline?: boolean;
}

function MessageBubble({ message, isOwn, showSender, senderName, isOnline }: MessageBubbleProps) {
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

  return (
    <div
      className={cn(
        "flex",
        isOwn ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[70%] rounded-lg px-4 py-2",
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
        </div>
      </div>
    </div>
  );
}
