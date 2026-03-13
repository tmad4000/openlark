"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { api, type Chat, type ChatMemberSettings } from "@/lib/api";
import {
  Plus,
  MessageSquare,
  Users,
  Hash,
  Star,
  BellOff,
  Pin,
  CheckCircle2,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatListProps {
  selectedChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onCreateChat?: () => void;
  onOpenFavorites?: () => void;
  showFavorites?: boolean;
}

// Label color palette
const LABEL_COLORS: Record<string, string> = {
  default: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  work: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  personal: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  team: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

function getLabelColor(label: string): string {
  const lower = label.toLowerCase();
  return LABEL_COLORS[lower] || LABEL_COLORS.default!;
}

export function ChatList({
  selectedChatId,
  onSelectChat,
  onCreateChat,
  onOpenFavorites,
  showFavorites,
}: ChatListProps) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    chatId: string;
    x: number;
    y: number;
  } | null>(null);
  const [labelInput, setLabelInput] = useState<{
    chatId: string;
    value: string;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);

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

  // Close context menu on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
    }
    if (contextMenu) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [contextMenu]);

  // Focus label input when shown
  useEffect(() => {
    if (labelInput && labelInputRef.current) {
      labelInputRef.current.focus();
    }
  }, [labelInput]);

  // Function to add a new chat to the list (called from WebSocket)
  const addChat = (chat: Chat) => {
    setChats((prev) => {
      if (prev.some((c) => c.id === chat.id)) return prev;
      return [chat, ...prev];
    });
  };

  // Re-activate done chats when new message arrives
  ChatList.reactivateChat = (chatId: string) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId && c.memberSettings?.done
          ? { ...c, memberSettings: { ...c.memberSettings, done: false } }
          : c
      )
    );
  };

  // Expose addChat for parent components
  ChatList.addChat = addChat;

  const updateChatSettings = useCallback(
    async (chatId: string, settings: Partial<ChatMemberSettings>) => {
      // Optimistic update
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? {
                ...c,
                memberSettings: {
                  muted: c.memberSettings?.muted ?? false,
                  done: c.memberSettings?.done ?? false,
                  pinned: c.memberSettings?.pinned ?? false,
                  label: c.memberSettings?.label ?? null,
                  ...settings,
                },
              }
            : c
        )
      );
      try {
        await api.updateChatMemberSettings(chatId, settings);
      } catch {
        // Revert on failure — reload
        const response = await api.getChats();
        setChats(response.chats);
      }
    },
    []
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, chatId: string) => {
      e.preventDefault();
      setContextMenu({ chatId, x: e.clientX, y: e.clientY });
    },
    []
  );

  const handleLabelSubmit = useCallback(
    (chatId: string, value: string) => {
      const trimmed = value.trim();
      updateChatSettings(chatId, { label: trimmed || null });
      setLabelInput(null);
      setContextMenu(null);
    },
    [updateChatSettings]
  );

  // Sort chats: pinned first, then by updatedAt. Filter out done chats.
  const sortedChats = [...chats]
    .filter((c) => !c.memberSettings?.done)
    .sort((a, b) => {
      const aPinned = a.memberSettings?.pinned ? 1 : 0;
      const bPinned = b.memberSettings?.pinned ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return 0; // preserve server order within same pin status
    });

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

  const contextChat = contextMenu
    ? chats.find((c) => c.id === contextMenu.chatId)
    : null;

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

      {/* Favorites section */}
      {onOpenFavorites && (
        <div className="px-2 py-1">
          <button
            onClick={onOpenFavorites}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
              showFavorites
                ? "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            )}
          >
            <Star className={cn("h-4 w-4", showFavorites && "fill-current")} />
            Favorites
          </button>
        </div>
      )}

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto">
        {sortedChats.length === 0 ? (
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
          <ul
            role="list"
            className="divide-y divide-gray-100 dark:divide-gray-800"
          >
            {sortedChats.map((chat) => (
              <ChatListItem
                key={chat.id}
                chat={chat}
                isSelected={chat.id === selectedChatId}
                onClick={() => onSelectChat(chat.id)}
                onContextMenu={(e) => handleContextMenu(e, chat.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && contextChat && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[180px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {/* Mute / Unmute */}
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={() => {
              updateChatSettings(contextMenu.chatId, {
                muted: !contextChat.memberSettings?.muted,
              });
              setContextMenu(null);
            }}
          >
            <BellOff className="h-4 w-4" />
            {contextChat.memberSettings?.muted ? "Unmute" : "Mute"}
          </button>

          {/* Mark as Done */}
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={() => {
              updateChatSettings(contextMenu.chatId, { done: true });
              setContextMenu(null);
            }}
          >
            <CheckCircle2 className="h-4 w-4" />
            Mark as Done
          </button>

          {/* Pin to Top / Unpin */}
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={() => {
              updateChatSettings(contextMenu.chatId, {
                pinned: !contextChat.memberSettings?.pinned,
              });
              setContextMenu(null);
            }}
          >
            <Pin className="h-4 w-4" />
            {contextChat.memberSettings?.pinned ? "Unpin" : "Pin to Top"}
          </button>

          {/* Add / Edit Label */}
          {labelInput?.chatId === contextMenu.chatId ? (
            <div className="px-3 py-2">
              <input
                ref={labelInputRef}
                type="text"
                placeholder="Enter label..."
                className="w-full text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:ring-1 focus:ring-blue-500"
                value={labelInput.value}
                onChange={(e) =>
                  setLabelInput({ ...labelInput, value: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleLabelSubmit(contextMenu.chatId, labelInput.value);
                  }
                  if (e.key === "Escape") {
                    setLabelInput(null);
                    setContextMenu(null);
                  }
                }}
                onBlur={() =>
                  handleLabelSubmit(contextMenu.chatId, labelInput.value)
                }
              />
            </div>
          ) : (
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={() =>
                setLabelInput({
                  chatId: contextMenu.chatId,
                  value: contextChat.memberSettings?.label || "",
                })
              }
            >
              <Tag className="h-4 w-4" />
              {contextChat.memberSettings?.label
                ? "Edit Label"
                : "Add Label"}
            </button>
          )}

          {/* Remove label if one exists */}
          {contextChat.memberSettings?.label && (
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={() => {
                updateChatSettings(contextMenu.chatId, { label: null });
                setContextMenu(null);
              }}
            >
              <Tag className="h-4 w-4" />
              Remove Label
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Static methods for external updates
ChatList.addChat = (_chat: Chat) => {
  // Will be overwritten when component mounts
};
ChatList.reactivateChat = (_chatId: string) => {
  // Will be overwritten when component mounts
};

interface ChatListItemProps {
  chat: Chat;
  isSelected: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function ChatListItem({
  chat,
  isSelected,
  onClick,
  onContextMenu,
}: ChatListItemProps) {
  const settings = chat.memberSettings;

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
        onContextMenu={onContextMenu}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
          "hover:bg-gray-100 dark:hover:bg-gray-800",
          isSelected &&
            "bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500"
        )}
      >
        {/* Avatar or icon */}
        <div
          className={cn(
            "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
            "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
            isSelected &&
              "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400"
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
            <div className="flex items-center gap-1 flex-shrink-0 ml-1">
              {settings?.pinned && (
                <Pin className="h-3 w-3 text-blue-500 dark:text-blue-400" />
              )}
              {settings?.muted && (
                <BellOff className="h-3 w-3 text-gray-400 dark:text-gray-500" />
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
              {chat.type.replace("_", " ")}
            </span>
            {chat.isPublic && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                &bull; Public
              </span>
            )}
            {settings?.label && (
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full font-medium leading-none ml-1",
                  getLabelColor(settings.label)
                )}
              >
                {settings.label}
              </span>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}
