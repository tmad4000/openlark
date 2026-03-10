"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { api, type Chat } from "@/lib/api";
import { Plus, MessageSquare, Users, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatListProps {
  selectedChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onCreateChat?: () => void;
}

export function ChatList({
  selectedChatId,
  onSelectChat,
  onCreateChat,
}: ChatListProps) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadChats() {
      try {
        setIsLoading(true);
        setError(null);
        const response = await api.getChats();
        setChats(response.chats);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load chats");
      } finally {
        setIsLoading(false);
      }
    }

    loadChats();
  }, []);

  // Function to add a new chat to the list (called from WebSocket)
  const addChat = (chat: Chat) => {
    setChats((prev) => {
      // Avoid duplicates
      if (prev.some((c) => c.id === chat.id)) return prev;
      return [chat, ...prev];
    });
  };

  // Expose addChat for parent components
  ChatList.addChat = addChat;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Loading chats...
        </div>
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Messages
        </h2>
        {onCreateChat && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onCreateChat}
            className="h-8 w-8"
            aria-label="New chat"
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto">
        {chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <MessageSquare className="h-8 w-8 text-gray-400 dark:text-gray-600 mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No conversations yet
            </p>
            {onCreateChat && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={onCreateChat}
              >
                Start a conversation
              </Button>
            )}
          </div>
        ) : (
          <ul role="list" className="divide-y divide-gray-100 dark:divide-gray-800">
            {chats.map((chat) => (
              <ChatListItem
                key={chat.id}
                chat={chat}
                isSelected={chat.id === selectedChatId}
                onClick={() => onSelectChat(chat.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Static method for external updates
ChatList.addChat = (_chat: Chat) => {
  // Will be overwritten when component mounts
};

interface ChatListItemProps {
  chat: Chat;
  isSelected: boolean;
  onClick: () => void;
}

function ChatListItem({ chat, isSelected, onClick }: ChatListItemProps) {
  const getChatIcon = () => {
    switch (chat.type) {
      case "dm":
        return <MessageSquare className="h-5 w-5" />;
      case "group":
      case "supergroup":
        return <Users className="h-5 w-5" />;
      case "topic_group":
        return <Hash className="h-5 w-5" />;
      default:
        return <MessageSquare className="h-5 w-5" />;
    }
  };

  const getChatName = () => {
    if (chat.name) return chat.name;
    if (chat.type === "dm") return "Direct Message";
    return "Unnamed Chat";
  };

  return (
    <li>
      <button
        onClick={onClick}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
          "hover:bg-gray-100 dark:hover:bg-gray-800",
          isSelected && "bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500"
        )}
      >
        {/* Avatar or icon */}
        <div
          className={cn(
            "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
            "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
            isSelected && "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400"
          )}
        >
          {chat.avatarUrl ? (
            <img
              src={chat.avatarUrl}
              alt=""
              className="w-10 h-10 rounded-full"
            />
          ) : (
            getChatIcon()
          )}
        </div>

        {/* Chat info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span
              className={cn(
                "text-sm font-medium truncate",
                isSelected
                  ? "text-blue-700 dark:text-blue-300"
                  : "text-gray-900 dark:text-gray-100"
              )}
            >
              {getChatName()}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
              {chat.type.replace("_", " ")}
            </span>
            {chat.isPublic && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                • Public
              </span>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}
