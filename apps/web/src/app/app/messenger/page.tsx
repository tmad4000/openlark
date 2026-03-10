"use client";

import { useState, useEffect, useMemo } from "react";
import { Search, Plus, MessageCircle, Users, Bell, BellOff, AtSign } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";

interface Chat {
  id: string;
  type: "dm" | "group" | "topic_group" | "supergroup" | "meeting";
  name: string | null;
  avatarUrl: string | null;
  memberCount: number;
  unreadCount: number;
  muted: boolean;
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

type FilterType = "all" | "private" | "group" | "mentions" | "unread" | "muted";

const FILTER_TABS: { id: FilterType; label: string; icon?: React.ComponentType<{ className?: string }> }[] = [
  { id: "all", label: "All" },
  { id: "private", label: "Private", icon: MessageCircle },
  { id: "group", label: "Group", icon: Users },
  { id: "mentions", label: "@Mentions", icon: AtSign },
  { id: "unread", label: "Unread", icon: Bell },
  { id: "muted", label: "Muted", icon: BellOff },
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

function ChatRow({
  chat,
  isSelected,
  onClick
}: {
  chat: Chat;
  isSelected: boolean;
  onClick: () => void;
}) {
  const preview = getMessagePreview(chat.lastMessage);
  const timestamp = chat.lastMessage ? formatTimestamp(chat.lastMessage.createdAt) : formatTimestamp(chat.createdAt);

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 p-3 text-left transition-colors hover:bg-gray-100 ${
        isSelected ? "bg-blue-50 hover:bg-blue-100" : ""
      }`}
    >
      {/* Avatar */}
      <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden bg-gray-200">
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

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm truncate ${chat.unreadCount > 0 ? "font-semibold text-gray-900" : "text-gray-900"}`}>
            {chat.name || "Unknown"}
          </span>
          <span className="text-xs text-gray-500 flex-shrink-0">{timestamp}</span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className={`text-sm truncate ${chat.unreadCount > 0 ? "text-gray-700" : "text-gray-500"}`}>
            {chat.lastMessage?.senderName && chat.type !== "dm" ? (
              <span className="font-medium">{chat.lastMessage.senderName}: </span>
            ) : null}
            {preview}
          </span>
          {chat.unreadCount > 0 && (
            <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 flex items-center justify-center bg-blue-600 text-white text-xs font-medium rounded-full">
              {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
            </span>
          )}
          {chat.muted && chat.unreadCount === 0 && (
            <BellOff className="w-4 h-4 text-gray-400 flex-shrink-0" />
          )}
        </div>
      </div>
    </button>
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

export default function MessengerPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isNewChatDialogOpen, setIsNewChatDialogOpen] = useState(false);

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

  const selectedChat = chats.find((c) => c.id === selectedChatId);

  return (
    <div className="h-full flex">
      {/* Chat List Sidebar - This will be shown in the layout's sidebar area */}
      <div className="w-80 border-r border-gray-200 bg-white flex flex-col h-full">
        {/* Header */}
        <div className="flex-shrink-0 p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Messenger</h2>
            <button
              onClick={() => setIsNewChatDialogOpen(true)}
              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors"
              title="New chat"
            >
              <Plus className="w-5 h-5" />
            </button>
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
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Center Panel - Chat View */}
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        {selectedChat ? (
          <div className="text-center text-gray-500">
            <h3 className="text-lg font-medium text-gray-900 mb-1">
              {selectedChat.name || "Chat"}
            </h3>
            <p className="text-sm">
              {selectedChat.memberCount} member{selectedChat.memberCount !== 1 ? "s" : ""}
            </p>
            <p className="text-sm mt-4 text-gray-400">
              Message view coming in US-024
            </p>
          </div>
        ) : (
          <div className="text-center text-gray-500">
            <MessageCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-700">Select a chat</h3>
            <p className="text-sm mt-1">Choose a conversation from the list</p>
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
