"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useWebSocket, type NewMessageEvent, type MessageEditedEvent, type MessageRecalledEvent } from "@/hooks/use-websocket";
import { ChatList } from "@/components/messenger/chat-list";
import { MessageList } from "@/components/messenger/message-list";
import { MessageInput } from "@/components/messenger/message-input";
import { AppShell } from "@/components/layout/app-shell";
import { cn } from "@/lib/utils";
import { MessageSquare, Wifi, WifiOff } from "lucide-react";

export default function MessengerPage() {
  const { user, organization } = useAuth();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  // WebSocket for real-time updates
  const { status: wsStatus, isConnected } = useWebSocket({
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
  });

  const handleSelectChat = useCallback((chatId: string) => {
    setSelectedChatId(chatId);
  }, []);

  const sidebar = (
    <ChatList
      selectedChatId={selectedChatId}
      onSelectChat={handleSelectChat}
    />
  );

  return (
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
                  isConnected ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-gray-500"
                )}
                title={isConnected ? "Connected" : `Status: ${wsStatus}`}
              >
                {isConnected ? (
                  <Wifi className="h-3 w-3" />
                ) : (
                  <WifiOff className="h-3 w-3" />
                )}
              </div>
            </div>
          </div>

          {/* Messages */}
          <MessageList chatId={selectedChatId} />

          {/* Input */}
          <MessageInput chatId={selectedChatId} />
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
                isConnected ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-gray-500"
              )}
            >
              {isConnected ? (
                <>
                  <Wifi className="h-3 w-3" />
                  <span>Real-time connected</span>
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
  );
}
