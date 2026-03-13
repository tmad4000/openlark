"use client";

import { useState, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useWebSocket, type NewMessageEvent, type MessageEditedEvent, type MessageRecalledEvent, type ReadReceiptEvent, type TypingEvent, type PresenceEvent } from "@/hooks/use-websocket";
import { ChatList } from "@/components/messenger/chat-list";
import { MessageList } from "@/components/messenger/message-list";
import { MessageInput } from "@/components/messenger/message-input";
import { TypingIndicator } from "@/components/messenger/typing-indicator";
import { CreateChatDialog } from "@/components/messenger/create-chat-dialog";
import { AppShell } from "@/components/layout/app-shell";
import { cn } from "@/lib/utils";
import { MessageSquare, Wifi, WifiOff, Loader2 } from "lucide-react";
import type { Chat } from "@/lib/api";

export default function MessengerPage() {
  const { user, organization } = useAuth();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  // Typing indicator state: chatId -> Map<userId, displayName>
  const [typingUsers, setTypingUsers] = useState<Map<string, Map<string, string>>>(new Map());
  const typingTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Online presence state: userId -> "online" | "offline"
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  // Handle typing events
  const handleTyping = useCallback((event: TypingEvent) => {
    // Don't show own typing indicator
    if (event.userId === user?.id) return;

    const timerKey = `${event.chatId}:${event.userId}`;

    if (event.isTyping) {
      setTypingUsers((prev) => {
        const next = new Map(prev);
        const chatTypers = new Map(next.get(event.chatId) || new Map());
        // Use userId as fallback display name
        chatTypers.set(event.userId, `User ${event.userId.slice(0, 8)}`);
        next.set(event.chatId, chatTypers);
        return next;
      });

      // Auto-clear after 4s (slightly longer than the 3s TTL to account for latency)
      const existingTimer = typingTimersRef.current.get(timerKey);
      if (existingTimer) clearTimeout(existingTimer);
      typingTimersRef.current.set(
        timerKey,
        setTimeout(() => {
          setTypingUsers((prev) => {
            const next = new Map(prev);
            const chatTypers = new Map(next.get(event.chatId) || new Map());
            chatTypers.delete(event.userId);
            if (chatTypers.size === 0) {
              next.delete(event.chatId);
            } else {
              next.set(event.chatId, chatTypers);
            }
            return next;
          });
          typingTimersRef.current.delete(timerKey);
        }, 4000)
      );
    } else {
      // Immediately remove typing indicator
      const existingTimer = typingTimersRef.current.get(timerKey);
      if (existingTimer) {
        clearTimeout(existingTimer);
        typingTimersRef.current.delete(timerKey);
      }
      setTypingUsers((prev) => {
        const next = new Map(prev);
        const chatTypers = new Map(next.get(event.chatId) || new Map());
        chatTypers.delete(event.userId);
        if (chatTypers.size === 0) {
          next.delete(event.chatId);
        } else {
          next.set(event.chatId, chatTypers);
        }
        return next;
      });
    }
  }, [user?.id]);

  // Handle presence events
  const handlePresence = useCallback((event: PresenceEvent) => {
    setOnlineUsers((prev) => {
      const next = new Set(prev);
      if (event.status === "online") {
        next.add(event.userId);
      } else {
        next.delete(event.userId);
      }
      return next;
    });
  }, []);

  // WebSocket for real-time updates
  const { status: wsStatus, isConnected, sendTyping } = useWebSocket({
    onMessage: useCallback((event: NewMessageEvent) => {
      // Add message to list if viewing this chat
      if (event.chatId === selectedChatId) {
        MessageList.addMessage(event.message);
      }
    }, [selectedChatId]),
    onMessageEdited: useCallback((event: MessageEditedEvent) => {
      if (event.chatId === selectedChatId) {
        MessageList.updateMessage(event.message);
      }
    }, [selectedChatId]),
    onMessageRecalled: useCallback((event: MessageRecalledEvent) => {
      if (event.chatId === selectedChatId) {
        MessageList.removeMessage(event.messageId);
      }
    }, [selectedChatId]),
    onReadReceipt: useCallback((event: ReadReceiptEvent) => {
      if (event.chatId === selectedChatId && event.userId !== user?.id) {
        MessageList.handleReadReceipt(event.userId, event.lastMessageId);
      }
    }, [selectedChatId, user?.id]),
    onTyping: handleTyping,
    onPresence: handlePresence,
  });

  // Send typing events from input
  const handleInputTyping = useCallback((isTyping: boolean) => {
    if (selectedChatId) {
      sendTyping(selectedChatId, isTyping);
    }
  }, [selectedChatId, sendTyping]);

  const handleSelectChat = useCallback((chatId: string) => {
    setSelectedChatId(chatId);
  }, []);

  const handleCreateChat = useCallback(() => {
    setIsCreateDialogOpen(true);
  }, []);

  const handleChatCreated = useCallback((chat: Chat) => {
    // Add the new chat to the list and select it
    ChatList.addChat(chat);
    setSelectedChatId(chat.id);
  }, []);

  // Get typing users for the currently selected chat
  const currentChatTypingUsers = selectedChatId
    ? typingUsers.get(selectedChatId) || new Map<string, string>()
    : new Map<string, string>();

  const sidebar = (
    <ChatList
      selectedChatId={selectedChatId}
      onSelectChat={handleSelectChat}
      onCreateChat={handleCreateChat}
    />
  );

  return (
    <>
    <AppShell sidebar={sidebar}>
      {selectedChatId ? (
        <div className="flex flex-col h-full">
          {/* Chat header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Chat
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {/* WebSocket status indicator */}
              <div
                className={cn(
                  "flex items-center gap-1 text-xs",
                  isConnected
                    ? "text-green-600 dark:text-green-400"
                    : wsStatus === "reconnecting"
                      ? "text-yellow-500 dark:text-yellow-400"
                      : "text-gray-400 dark:text-gray-500"
                )}
                title={isConnected ? "Connected" : `Status: ${wsStatus}`}
              >
                {isConnected ? (
                  <Wifi className="h-3 w-3" />
                ) : wsStatus === "reconnecting" ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Reconnecting</span>
                  </>
                ) : (
                  <WifiOff className="h-3 w-3" />
                )}
              </div>
            </div>
          </div>

          {/* Messages */}
          <MessageList chatId={selectedChatId} onlineUsers={onlineUsers} />

          {/* Typing indicator */}
          <TypingIndicator typingUsers={currentChatTypingUsers} />

          {/* Input */}
          <MessageInput chatId={selectedChatId} onTyping={handleInputTyping} />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-full bg-gray-100 dark:bg-gray-800">
                <MessageSquare className="h-8 w-8 text-gray-400 dark:text-gray-500" />
              </div>
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Welcome to {organization?.name}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Signed in as {user?.displayName}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-4">
              Select a conversation from the sidebar to get started
            </p>
            <div
              className={cn(
                "mt-4 flex items-center justify-center gap-2 text-xs",
                isConnected
                  ? "text-green-600 dark:text-green-400"
                  : wsStatus === "reconnecting"
                    ? "text-yellow-500 dark:text-yellow-400"
                    : "text-gray-400 dark:text-gray-500"
              )}
            >
              {isConnected ? (
                <>
                  <Wifi className="h-3 w-3" />
                  <span>Real-time connected</span>
                </>
              ) : wsStatus === "reconnecting" ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Reconnecting...</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" />
                  <span>Connecting...</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>

      {/* Create chat dialog */}
      <CreateChatDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onChatCreated={handleChatCreated}
      />
    </>
  );
}
