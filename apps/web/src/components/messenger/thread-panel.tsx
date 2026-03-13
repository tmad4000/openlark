"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { api, type Message } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { X, Loader2, Send, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ThreadPanelProps {
  parentMessageId: string;
  chatId: string;
  senderMap: Map<string, { displayName: string | null; avatarUrl: string | null }>;
  onClose: () => void;
}

export function ThreadPanel({ parentMessageId, chatId, senderMap, onClose }: ThreadPanelProps) {
  const { user } = useAuth();
  const [parentMessage, setParentMessage] = useState<Message | null>(null);
  const [replies, setReplies] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [localSenderMap, setLocalSenderMap] = useState(senderMap);

  // Load thread and members
  useEffect(() => {
    async function loadThread() {
      try {
        setIsLoading(true);
        setError(null);
        const [threadData, membersData] = await Promise.all([
          api.getThreadReplies(parentMessageId),
          senderMap.size === 0 ? api.getChatMembers(chatId) : Promise.resolve(null),
        ]);
        setParentMessage(threadData.parentMessage);
        setReplies(threadData.replies);
        if (membersData) {
          const map = new Map<string, { displayName: string | null; avatarUrl: string | null }>();
          for (const m of membersData.members) {
            if (m.user) map.set(m.userId, m.user);
          }
          setLocalSenderMap(map);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load thread");
      } finally {
        setIsLoading(false);
      }
    }
    loadThread();
  }, [parentMessageId, chatId, senderMap]);

  // Auto-scroll to bottom when replies change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [replies]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, [parentMessageId]);

  const handleSendReply = useCallback(async () => {
    const text = replyText.trim();
    if (!text || isSending || !user) return;

    setIsSending(true);
    try {
      const data = await api.sendMessage(chatId, {
        content: text,
        threadId: parentMessageId,
      });
      setReplies((prev) => [...prev, data.message]);
      setReplyText("");
    } catch (err) {
      console.error("Failed to send thread reply:", err);
    } finally {
      setIsSending(false);
    }
  }, [replyText, isSending, user, chatId, parentMessageId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendReply();
      }
    },
    [handleSendReply]
  );

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const getSenderName = (senderId: string) => {
    if (senderId === user?.id) return "You";
    const info = localSenderMap.get(senderId);
    return info?.displayName || `User ${senderId.slice(0, 8)}`;
  };

  // Add a reply from a WebSocket event
  const addReply = useCallback((message: Message) => {
    setReplies((prev) => {
      if (prev.some((r) => r.id === message.id)) return prev;
      return [...prev, message];
    });
  }, []);

  // Expose for parent
  ThreadPanel.addReply = addReply;
  ThreadPanel.currentThreadId = parentMessageId;

  if (isLoading) {
    return (
      <div className="w-80 border-l border-gray-200 dark:border-gray-800 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-80 border-l border-gray-200 dark:border-gray-800 flex items-center justify-center p-4">
        <div className="text-sm text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="w-80 border-l border-gray-200 dark:border-gray-800 flex flex-col h-full bg-white dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Thread
          </h3>
          <span className="text-xs text-gray-500">
            {replies.length} {replies.length === 1 ? "reply" : "replies"}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Thread content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* Parent message */}
        {parentMessage && (
          <div className="pb-3 border-b border-gray-200 dark:border-gray-800">
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              {getSenderName(parentMessage.senderId)}
            </div>
            <div className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
              {parentMessage.recalledAt
                ? <span className="italic text-gray-400">Message recalled</span>
                : parentMessage.contentJson?.text || ""}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {formatTime(parentMessage.createdAt)}
            </div>
          </div>
        )}

        {/* Replies */}
        {replies.map((reply) => {
          const isOwn = reply.senderId === user?.id;
          return (
            <div key={reply.id} className="flex flex-col">
              <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">
                {getSenderName(reply.senderId)}
              </div>
              <div
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm whitespace-pre-wrap break-words",
                  isOwn
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                )}
              >
                {reply.recalledAt
                  ? <span className="italic opacity-50">Message recalled</span>
                  : reply.contentJson?.text || ""}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {formatTime(reply.createdAt)}
              </div>
            </div>
          );
        })}

        {replies.length === 0 && (
          <div className="text-center text-sm text-gray-400 py-4">
            No replies yet. Start the thread!
          </div>
        )}
      </div>

      {/* Reply input */}
      <div className="border-t border-gray-200 dark:border-gray-800 p-3">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Reply in thread..."
            className="flex-1 resize-none rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[36px] max-h-[120px]"
            rows={1}
            disabled={isSending}
          />
          <Button
            size="sm"
            onClick={handleSendReply}
            disabled={!replyText.trim() || isSending}
            className="h-9 w-9 p-0"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Static methods for external updates
ThreadPanel.addReply = (_message: Message) => {};
ThreadPanel.currentThreadId = null as string | null;
