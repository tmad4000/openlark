"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  api,
  type Chat,
  type ChatMember,
  type ChatSettings,
  type UserSearchResult,
} from "@/lib/api";
import {
  X,
  Search,
  Shield,
  ShieldCheck,
  Crown,
  UserPlus,
  UserMinus,
  ChevronDown,
  ChevronUp,
  Globe,
  Lock,
  Settings,
  Users,
  Edit2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface GroupSettingsPanelProps {
  chatId: string;
  currentUserId: string;
  onClose: () => void;
  onChatUpdated?: (chat: Chat) => void;
}

export function GroupSettingsPanel({
  chatId,
  currentUserId,
  onClose,
  onChatUpdated,
}: GroupSettingsPanelProps) {
  const [chat, setChat] = useState<Chat | null>(null);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [memberSearch, setMemberSearch] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [addMemberSearch, setAddMemberSearch] = useState("");
  const [addMemberResults, setAddMemberResults] = useState<UserSearchResult[]>(
    []
  );
  const [showAddMember, setShowAddMember] = useState(false);
  const [actionMenuMemberId, setActionMenuMemberId] = useState<string | null>(
    null
  );

  const currentMember = members.find((m) => m.userId === currentUserId);
  const isOwner = currentMember?.role === "owner";
  const isAdmin = currentMember?.role === "admin";
  const isPrivileged = isOwner || isAdmin;

  const settings: ChatSettings = chat?.settingsJson || {
    whoCanSendMessages: "all",
    whoCanAddMembers: "admins_only",
    historyVisibleToNewMembers: true,
  };

  const loadChatData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getChat(chatId);
      setChat(res.chat);
      setMembers(res.members);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    loadChatData();
  }, [loadChatData]);

  const handleUpdateName = useCallback(async () => {
    if (!nameInput.trim() || !chat) return;
    try {
      const res = await api.updateChat(chatId, { name: nameInput.trim() });
      setChat(res.chat);
      onChatUpdated?.(res.chat);
      setEditingName(false);
    } catch {
      /* ignore */
    }
  }, [chatId, nameInput, chat, onChatUpdated]);

  const handleTogglePublic = useCallback(async () => {
    if (!chat) return;
    try {
      const res = await api.updateChat(chatId, { isPublic: !chat.isPublic });
      setChat(res.chat);
      onChatUpdated?.(res.chat);
    } catch {
      /* ignore */
    }
  }, [chatId, chat, onChatUpdated]);

  const handleUpdateSettings = useCallback(
    async (newSettings: Partial<ChatSettings>) => {
      if (!chat) return;
      const merged = { ...settings, ...newSettings };
      try {
        const res = await api.updateChat(chatId, {
          settingsJson: merged as Record<string, unknown>,
        });
        setChat(res.chat);
        onChatUpdated?.(res.chat);
      } catch {
        /* ignore */
      }
    },
    [chatId, chat, settings, onChatUpdated]
  );

  const handlePromoteToAdmin = useCallback(
    async (userId: string) => {
      try {
        await api.updateChatMember(chatId, userId, { role: "admin" });
        setMembers((prev) =>
          prev.map((m) => (m.userId === userId ? { ...m, role: "admin" } : m))
        );
        setActionMenuMemberId(null);
      } catch {
        /* ignore */
      }
    },
    [chatId]
  );

  const handleDemoteToMember = useCallback(
    async (userId: string) => {
      try {
        await api.updateChatMember(chatId, userId, { role: "member" });
        setMembers((prev) =>
          prev.map((m) => (m.userId === userId ? { ...m, role: "member" } : m))
        );
        setActionMenuMemberId(null);
      } catch {
        /* ignore */
      }
    },
    [chatId]
  );

  const handleRemoveMember = useCallback(
    async (userId: string) => {
      try {
        await api.removeChatMember(chatId, userId);
        setMembers((prev) => prev.filter((m) => m.userId !== userId));
        setActionMenuMemberId(null);
      } catch {
        /* ignore */
      }
    },
    [chatId]
  );

  const handleAddMember = useCallback(
    async (userId: string) => {
      try {
        const res = await api.addChatMember(chatId, userId);
        setMembers((prev) => [...prev, res.member]);
        setAddMemberSearch("");
        setAddMemberResults([]);
        setShowAddMember(false);
      } catch {
        /* ignore */
      }
    },
    [chatId]
  );

  // Search users for adding
  useEffect(() => {
    if (!addMemberSearch.trim()) {
      setAddMemberResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await api.searchUsers(addMemberSearch);
        const memberUserIds = new Set(members.map((m) => m.userId));
        setAddMemberResults(
          res.users.filter((u) => !memberUserIds.has(u.id))
        );
      } catch {
        /* ignore */
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [addMemberSearch, members]);

  const filteredMembers = members.filter((m) => {
    if (!memberSearch) return true;
    const name = m.user?.displayName || "";
    return name.toLowerCase().includes(memberSearch.toLowerCase());
  });

  // Sort: owner first, then admins, then members
  const sortedMembers = [...filteredMembers].sort((a, b) => {
    const order = { owner: 0, admin: 1, member: 2 };
    return order[a.role] - order[b.role];
  });

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Group Info
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Loading...
          </div>
        </div>
      </div>
    );
  }

  if (!chat) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Group Info
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Group name & avatar */}
        <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleUpdateName();
                      if (e.key === "Escape") setEditingName(false);
                    }}
                    className="flex-1 text-sm font-semibold bg-transparent border-b border-blue-500 outline-none text-gray-900 dark:text-gray-100"
                    autoFocus
                  />
                  <button
                    onClick={handleUpdateName}
                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-green-600"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setEditingName(false)}
                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {chat.name || "Unnamed Group"}
                  </h4>
                  {isOwner && (
                    <button
                      onClick={() => {
                        setNameInput(chat.name || "");
                        setEditingName(true);
                      }}
                      className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400"
                    >
                      <Edit2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
              <div className="flex items-center gap-1.5 mt-0.5">
                {chat.isPublic ? (
                  <Globe className="h-3 w-3 text-gray-400" />
                ) : (
                  <Lock className="h-3 w-3 text-gray-400" />
                )}
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {chat.isPublic ? "Public" : "Private"} · {members.length}{" "}
                  members
                </span>
              </div>
            </div>
          </div>

          {/* Toggle public/private */}
          {isOwner && (
            <button
              onClick={handleTogglePublic}
              className="mt-3 w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <span className="flex items-center gap-2">
                {chat.isPublic ? (
                  <Globe className="h-3.5 w-3.5" />
                ) : (
                  <Lock className="h-3.5 w-3.5" />
                )}
                {chat.isPublic
                  ? "Public group — anyone can find and join"
                  : "Private group — invite only"}
              </span>
              <span className="text-blue-600 dark:text-blue-400 text-[11px]">
                Toggle
              </span>
            </button>
          )}
        </div>

        {/* Settings section (owner/admin only) */}
        {isPrivileged && (
          <div className="border-b border-gray-200 dark:border-gray-800">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              <span className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-gray-500" />
                Settings
              </span>
              {showSettings ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </button>
            {showSettings && (
              <div className="px-4 pb-3 space-y-3">
                {/* Who can send messages */}
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
                    Who can send messages
                  </label>
                  <select
                    value={settings.whoCanSendMessages || "all"}
                    onChange={(e) =>
                      handleUpdateSettings({
                        whoCanSendMessages: e.target.value as
                          | "all"
                          | "admins_only",
                      })
                    }
                    className="w-full text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5"
                  >
                    <option value="all">All members</option>
                    <option value="admins_only">Admins only</option>
                  </select>
                </div>

                {/* Who can add members */}
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
                    Who can add members
                  </label>
                  <select
                    value={settings.whoCanAddMembers || "admins_only"}
                    onChange={(e) =>
                      handleUpdateSettings({
                        whoCanAddMembers: e.target.value as
                          | "all"
                          | "admins_only",
                      })
                    }
                    className="w-full text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5"
                  >
                    <option value="all">All members</option>
                    <option value="admins_only">Admins only</option>
                  </select>
                </div>

                {/* History visible to new members */}
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    History visible to new members
                  </label>
                  <button
                    onClick={() =>
                      handleUpdateSettings({
                        historyVisibleToNewMembers:
                          !(settings.historyVisibleToNewMembers ?? true),
                      })
                    }
                    className={cn(
                      "w-9 h-5 rounded-full transition-colors relative",
                      (settings.historyVisibleToNewMembers ?? true)
                        ? "bg-blue-600"
                        : "bg-gray-300 dark:bg-gray-600"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm",
                        (settings.historyVisibleToNewMembers ?? true) &&
                          "translate-x-4"
                      )}
                    />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Members section */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Members ({members.length})
            </span>
            {isPrivileged && (
              <button
                onClick={() => setShowAddMember(!showAddMember)}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-blue-600 dark:text-blue-400"
                title="Add member"
              >
                <UserPlus className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Add member */}
          {showAddMember && (
            <div className="mb-3">
              <div className="relative mb-2">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  value={addMemberSearch}
                  onChange={(e) => setAddMemberSearch(e.target.value)}
                  placeholder="Search users to add..."
                  className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
                  autoFocus
                />
              </div>
              {addMemberResults.length > 0 && (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {addMemberResults.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => handleAddMember(user.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-gray-100 dark:hover:bg-gray-800 text-left"
                    >
                      <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[10px] font-medium text-gray-600 dark:text-gray-300 flex-shrink-0">
                        {(user.displayName || user.email)?.[0]?.toUpperCase() ||
                          "?"}
                      </div>
                      <span className="text-gray-900 dark:text-gray-100 truncate">
                        {user.displayName || user.email}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Member search */}
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search members..."
              className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
          </div>

          {/* Member list */}
          <div className="space-y-1">
            {sortedMembers.map((member) => (
              <div
                key={member.id}
                className="relative flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 group"
              >
                {/* Avatar */}
                <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-300 flex-shrink-0">
                  {(member.user?.displayName)?.[0]?.toUpperCase() || "?"}
                </div>

                {/* Name + role badge */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-900 dark:text-gray-100 truncate">
                      {member.user?.displayName || "Unknown"}
                      {member.userId === currentUserId && (
                        <span className="text-gray-400 ml-1">(you)</span>
                      )}
                    </span>
                    {member.role === "owner" && (
                      <span title="Owner">
                        <Crown className="h-3 w-3 text-yellow-500 flex-shrink-0" />
                      </span>
                    )}
                    {member.role === "admin" && (
                      <span title="Admin">
                        <ShieldCheck className="h-3 w-3 text-blue-500 flex-shrink-0" />
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-400 capitalize">
                    {member.role}
                  </span>
                </div>

                {/* Action menu trigger */}
                {isPrivileged &&
                  member.userId !== currentUserId &&
                  member.role !== "owner" && (
                    <button
                      onClick={() =>
                        setActionMenuMemberId(
                          actionMenuMemberId === member.userId
                            ? null
                            : member.userId
                        )
                      }
                      className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 transition-opacity"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  )}

                {/* Action menu */}
                {actionMenuMemberId === member.userId && (
                  <div className="absolute right-0 top-full mt-1 z-10 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[140px]">
                    {isOwner && member.role === "member" && (
                      <button
                        onClick={() => handlePromoteToAdmin(member.userId)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Make admin
                      </button>
                    )}
                    {isOwner && member.role === "admin" && (
                      <button
                        onClick={() => handleDemoteToMember(member.userId)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <Shield className="h-3.5 w-3.5" />
                        Remove admin
                      </button>
                    )}
                    <button
                      onClick={() => handleRemoveMember(member.userId)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
