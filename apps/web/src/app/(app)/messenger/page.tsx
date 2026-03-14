"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useWebSocket, type NewMessageEvent, type MessageEditedEvent, type MessageRecalledEvent, type ReadReceiptEvent, type TypingEvent, type PresenceEvent, type ReactionEvent, type BuzzEvent } from "@/hooks/use-websocket";
import { ChatList } from "@/components/messenger/chat-list";
import { MessageList } from "@/components/messenger/message-list";
import { MessageInput } from "@/components/messenger/message-input";
import { TypingIndicator } from "@/components/messenger/typing-indicator";
import { CreateChatDialog } from "@/components/messenger/create-chat-dialog";
import { ThreadPanel } from "@/components/messenger/thread-panel";
import { AppShell } from "@/components/layout/app-shell";
import { ChatTabs, type CustomTab } from "@/components/messenger/chat-tabs";
import { cn } from "@/lib/utils";
import { MessageSquare, Wifi, WifiOff, Loader2, Pin, X, Star, FileText, File, Info, Megaphone } from "lucide-react";
import { api, type Chat, type Pin as PinType, type Favorite, type Message, type Announcement, type ChatMember } from "@/lib/api";
import { ForwardDialog } from "@/components/messenger/forward-dialog";
import { BuzzDialog } from "@/components/messenger/buzz-dialog";
import { CreateTaskFromMessageDialog } from "@/components/messenger/create-task-dialog";
import { BuzzOverlay } from "@/components/messenger/buzz-overlay";
import { GroupSettingsPanel } from "@/components/messenger/group-settings-panel";
import { AnnouncementsView } from "@/components/messenger/announcements-view";
import { TopicView } from "@/components/messenger/topic-view";

export default function MessengerPage() {
  const { user, organization } = useAuth();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [chatTab, setChatTab] = useState<string>("chat");
  const [pinnedMessageIds, setPinnedMessageIds] = useState<Set<string>>(new Set());
  const [pinnedMessages, setPinnedMessages] = useState<PinType[]>([]);
  const [favoritedMessageIds, setFavoritedMessageIds] = useState<Set<string>>(new Set());
  const [showFavorites, setShowFavorites] = useState(false);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [forwardMessages, setForwardMessages] = useState<Message[]>([]);
  const [isForwardDialogOpen, setIsForwardDialogOpen] = useState(false);
  const [customTabs, setCustomTabs] = useState<Map<string, CustomTab[]>>(new Map());
  const [sharedDocs, setSharedDocs] = useState<Array<{ id: string; title: string; url: string; sharedAt: string; sharedBy: string }>>([]);
  const [sharedFiles, setSharedFiles] = useState<Array<{ id: string; name: string; url: string; size: number; sharedAt: string; sharedBy: string }>>([]);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [selectedChatType, setSelectedChatType] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [chatMembers, setChatMembers] = useState<ChatMember[]>([]);
  const [buzzedMessageIds, setBuzzedMessageIds] = useState<Set<string>>(new Set());
  const [isBuzzDialogOpen, setIsBuzzDialogOpen] = useState(false);
  const [buzzTargetMessage, setBuzzTargetMessage] = useState<Message | null>(null);
  const [activeBuzz, setActiveBuzz] = useState<BuzzEvent | null>(null);
  const [isCreateTaskDialogOpen, setIsCreateTaskDialogOpen] = useState(false);
  const [createTaskMessage, setCreateTaskMessage] = useState<Message | null>(null);

  // Sender map ref for thread panel
  const senderMapRef = useRef<Map<string, { displayName: string | null; avatarUrl: string | null }>>(new Map());

  // Typing indicator state: chatId -> Map<userId, displayName>
  const [typingUsers, setTypingUsers] = useState<Map<string, Map<string, string>>>(new Map());
  const typingTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Online presence state: userId -> "online" | "offline"
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  // Load pins and favorites when chat changes
  useEffect(() => {
    if (!selectedChatId) return;
    setChatTab("chat");
    api.getPinnedMessages(selectedChatId).then((res) => {
      setPinnedMessages(res.pins);
      setPinnedMessageIds(new Set(res.pins.map((p) => p.messageId)));
    }).catch(() => {});
    api.getUserFavorites().then((res) => {
      setFavoritedMessageIds(new Set(res.favorites.map((f) => f.messageId)));
    }).catch(() => {});
    api.getAnnouncements(selectedChatId).then((res) => {
      setAnnouncements(res.announcements);
    }).catch(() => setAnnouncements([]));
    api.getChatMembers(selectedChatId).then((res) => {
      setChatMembers(res.members);
    }).catch(() => setChatMembers([]));
  }, [selectedChatId]);

  const handlePinMessage = useCallback(async (messageId: string) => {
    if (!selectedChatId) return;
    setPinnedMessageIds((prev) => new Set([...prev, messageId]));
    try {
      await api.pinMessage(selectedChatId, messageId);
      const res = await api.getPinnedMessages(selectedChatId);
      setPinnedMessages(res.pins);
      setPinnedMessageIds(new Set(res.pins.map((p) => p.messageId)));
    } catch {
      setPinnedMessageIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
  }, [selectedChatId]);

  const handleUnpinMessage = useCallback(async (messageId: string) => {
    if (!selectedChatId) return;
    setPinnedMessageIds((prev) => {
      const next = new Set(prev);
      next.delete(messageId);
      return next;
    });
    try {
      await api.unpinMessage(selectedChatId, messageId);
      setPinnedMessages((prev) => prev.filter((p) => p.messageId !== messageId));
    } catch {
      setPinnedMessageIds((prev) => new Set([...prev, messageId]));
    }
  }, [selectedChatId]);

  const handleFavoriteMessage = useCallback(async (messageId: string) => {
    setFavoritedMessageIds((prev) => new Set([...prev, messageId]));
    try {
      await api.favoriteMessage(messageId);
    } catch {
      setFavoritedMessageIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
  }, []);

  const handleUnfavoriteMessage = useCallback(async (messageId: string) => {
    setFavoritedMessageIds((prev) => {
      const next = new Set(prev);
      next.delete(messageId);
      return next;
    });
    try {
      await api.unfavoriteMessage(messageId);
    } catch {
      setFavoritedMessageIds((prev) => new Set([...prev, messageId]));
    }
  }, []);

  const handleEditMessage = useCallback(async (messageId: string, content: string) => {
    const result = await api.editMessage(messageId, content);
    MessageList.updateMessage(result.message);
  }, []);

  const handleRecallMessage = useCallback(async (messageId: string) => {
    await api.recallMessage(messageId);
    MessageList.markRecalled(messageId);
  }, []);

  const handleForwardMessage = useCallback((message: Message) => {
    setForwardMessages([message]);
    setIsForwardDialogOpen(true);
  }, []);

  const handleBuzzMessage = useCallback((message: Message) => {
    setBuzzTargetMessage(message);
    setIsBuzzDialogOpen(true);
  }, []);

  const handleCreateTaskFromMessage = useCallback((message: Message) => {
    setCreateTaskMessage(message);
    setIsCreateTaskDialogOpen(true);
  }, []);

  const handleBuzzSent = useCallback((messageId: string) => {
    setBuzzedMessageIds((prev) => new Set([...prev, messageId]));
  }, []);

  const handleBuzzReceived = useCallback((event: BuzzEvent) => {
    if (event.recipientId === user?.id) {
      setActiveBuzz(event);
    }
    // Mark the message as buzzed for visual indicator
    setBuzzedMessageIds((prev) => new Set([...prev, event.messageId]));
  }, [user?.id]);

  const handleDismissBuzz = useCallback(() => {
    setActiveBuzz(null);
  }, []);

  const handleViewBuzzInChat = useCallback((chatId: string) => {
    setActiveBuzz(null);
    setSelectedChatId(chatId);
    setShowFavorites(false);
    setShowGroupSettings(false);
  }, []);

  // Announcement handlers
  const handleCreateAnnouncement = useCallback(async (content: string) => {
    if (!selectedChatId) return;
    const res = await api.createAnnouncement(selectedChatId, content);
    setAnnouncements((prev) => [res.announcement, ...prev]);
  }, [selectedChatId]);

  const handleUpdateAnnouncement = useCallback(async (id: string, content: string) => {
    const res = await api.updateAnnouncement(id, { content });
    setAnnouncements((prev) =>
      prev.map((a) => (a.id === id ? res.announcement : a))
    );
  }, []);

  const handleDeleteAnnouncement = useCallback(async (id: string) => {
    await api.deleteAnnouncement(id);
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Custom tab management (per chat, stored in localStorage)
  const getCustomTabsForChat = useCallback((chatId: string): CustomTab[] => {
    return customTabs.get(chatId) || [];
  }, [customTabs]);

  const handleAddCustomTab = useCallback((name: string, url: string) => {
    if (!selectedChatId) return;
    const current = customTabs.get(selectedChatId) || [];
    if (current.length >= 20) return;
    const newTab: CustomTab = { id: `custom-${Date.now()}`, name, url };
    const updated = [...current, newTab];
    setCustomTabs((prev) => {
      const next = new Map(prev);
      next.set(selectedChatId, updated);
      return next;
    });
    try {
      localStorage.setItem(`chat-tabs-${selectedChatId}`, JSON.stringify(updated));
    } catch { /* ignore */ }
  }, [selectedChatId, customTabs]);

  const handleDeleteCustomTab = useCallback((tabId: string) => {
    if (!selectedChatId) return;
    const current = customTabs.get(selectedChatId) || [];
    const updated = current.filter((t) => t.id !== tabId);
    setCustomTabs((prev) => {
      const next = new Map(prev);
      next.set(selectedChatId, updated);
      return next;
    });
    try {
      localStorage.setItem(`chat-tabs-${selectedChatId}`, JSON.stringify(updated));
    } catch { /* ignore */ }
  }, [selectedChatId, customTabs]);

  const handleReorderCustomTabs = useCallback((tabs: CustomTab[]) => {
    if (!selectedChatId) return;
    setCustomTabs((prev) => {
      const next = new Map(prev);
      next.set(selectedChatId, tabs);
      return next;
    });
    try {
      localStorage.setItem(`chat-tabs-${selectedChatId}`, JSON.stringify(tabs));
    } catch { /* ignore */ }
  }, [selectedChatId]);

  // Load custom tabs from localStorage when chat changes
  useEffect(() => {
    if (!selectedChatId) return;
    try {
      const stored = localStorage.getItem(`chat-tabs-${selectedChatId}`);
      if (stored) {
        const parsed = JSON.parse(stored) as CustomTab[];
        setCustomTabs((prev) => {
          const next = new Map(prev);
          next.set(selectedChatId, parsed);
          return next;
        });
      }
    } catch { /* ignore */ }
  }, [selectedChatId]);

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
      const msg = event.message;
      // Reactivate done chats when new message arrives
      ChatList.reactivateChat(event.chatId);
      // Route thread replies to the thread panel
      if (msg.threadId && msg.threadId === ThreadPanel.currentThreadId) {
        ThreadPanel.addReply(msg);
        return;
      }
      // Add message to main list if viewing this chat (skip thread replies)
      if (event.chatId === selectedChatId && !msg.threadId) {
        MessageList.addMessage(msg);
      }
    }, [selectedChatId]),
    onMessageEdited: useCallback((event: MessageEditedEvent) => {
      if (event.chatId === selectedChatId) {
        MessageList.updateMessage(event.message);
      }
    }, [selectedChatId]),
    onMessageRecalled: useCallback((event: MessageRecalledEvent) => {
      if (event.chatId === selectedChatId) {
        MessageList.markRecalled(event.messageId);
      }
    }, [selectedChatId]),
    onReadReceipt: useCallback((event: ReadReceiptEvent) => {
      if (event.chatId === selectedChatId && event.userId !== user?.id) {
        MessageList.handleReadReceipt(event.userId, event.lastMessageId);
      }
    }, [selectedChatId, user?.id]),
    onTyping: handleTyping,
    onPresence: handlePresence,
    onReactionAdded: useCallback((event: ReactionEvent) => {
      if (event.chatId === selectedChatId) {
        MessageList.handleReactionAdded(event.messageId, event.emoji, event.userId);
      }
    }, [selectedChatId]),
    onReactionRemoved: useCallback((event: ReactionEvent) => {
      if (event.chatId === selectedChatId) {
        MessageList.handleReactionRemoved(event.messageId, event.emoji, event.userId);
      }
    }, [selectedChatId]),
    onBuzz: handleBuzzReceived,
  });

  // Send typing events from input
  const handleInputTyping = useCallback((isTyping: boolean) => {
    if (selectedChatId) {
      sendTyping(selectedChatId, isTyping);
    }
  }, [selectedChatId, sendTyping]);

  const handleOpenFavorites = useCallback(async () => {
    setShowFavorites(true);
    setSelectedChatId(null);
    try {
      const res = await api.getUserFavorites();
      setFavorites(res.favorites);
    } catch { /* ignore */ }
  }, []);

  const handleSelectChat = useCallback((chatId: string, chatType?: string) => {
    setSelectedChatId(chatId);
    setSelectedChatType(chatType || null);
    setActiveThreadId(null);
    setShowFavorites(false);
    setShowGroupSettings(false);
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
      onOpenFavorites={handleOpenFavorites}
      showFavorites={showFavorites}
    />
  );

  return (
    <>
    <AppShell sidebar={sidebar}>
      {selectedChatId ? (
        <div className="flex h-full">
          <div className="flex flex-col flex-1 min-w-0">
            {/* Chat header with tabs */}
            <div className="border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Chat
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  {/* Group info button */}
                  {selectedChatType && selectedChatType !== "dm" && (
                    <button
                      onClick={() => setShowGroupSettings(!showGroupSettings)}
                      className={cn(
                        "p-1.5 rounded-md transition-colors",
                        showGroupSettings
                          ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                          : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                      )}
                      title="Group info"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  )}
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
              {/* Tab bar */}
              <ChatTabs
                activeTab={chatTab}
                onTabChange={setChatTab}
                pinnedCount={pinnedMessages.length}
                docsCount={sharedDocs.length}
                filesCount={sharedFiles.length}
                announcementsCount={announcements.length}
                customTabs={getCustomTabsForChat(selectedChatId)}
                onAddCustomTab={handleAddCustomTab}
                onDeleteCustomTab={handleDeleteCustomTab}
                onReorderCustomTabs={handleReorderCustomTabs}
              />
            </div>

            {/* Announcement banner at top of chat */}
            {chatTab === "chat" && announcements.length > 0 && (
              <div
                className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 flex items-center gap-2 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                onClick={() => setChatTab("announcements")}
              >
                <Megaphone className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-200 truncate flex-1">
                  {announcements[0].content}
                </p>
                {announcements.length > 1 && (
                  <span className="text-xs text-amber-600 dark:text-amber-400 flex-shrink-0">
                    +{announcements.length - 1} more
                  </span>
                )}
              </div>
            )}

            {/* Tab content */}
            {chatTab === "chat" ? (
              selectedChatType === "topic_group" ? (
                <TopicView
                  chatId={selectedChatId}
                  currentUserId={user?.id || ""}
                  chatMembers={chatMembers}
                />
              ) : (
                <MessageList
                  chatId={selectedChatId}
                  onlineUsers={onlineUsers}
                  onOpenThread={setActiveThreadId}
                  pinnedMessageIds={pinnedMessageIds}
                  favoritedMessageIds={favoritedMessageIds}
                  onPinMessage={handlePinMessage}
                  onUnpinMessage={handleUnpinMessage}
                  onFavoriteMessage={handleFavoriteMessage}
                  onUnfavoriteMessage={handleUnfavoriteMessage}
                  onEditMessage={handleEditMessage}
                  onRecallMessage={handleRecallMessage}
                  onForwardMessage={handleForwardMessage}
                  onBuzzMessage={handleBuzzMessage}
                  buzzedMessageIds={buzzedMessageIds}
                  onCreateTask={handleCreateTaskFromMessage}
                />
              )
            ) : chatTab === "pins" ? (
              <PinnedMessagesView
                pins={pinnedMessages}
                onUnpin={handleUnpinMessage}
              />
            ) : chatTab === "docs" ? (
              <SharedDocsView docs={sharedDocs} />
            ) : chatTab === "files" ? (
              <SharedFilesView files={sharedFiles} />
            ) : chatTab === "announcements" ? (
              <AnnouncementsView
                announcements={announcements}
                isPrivileged={(() => {
                  const m = chatMembers.find((cm) => cm.userId === user?.id);
                  return m?.role === "owner" || m?.role === "admin";
                })()}
                currentUserId={user?.id || ""}
                onCreate={handleCreateAnnouncement}
                onUpdate={handleUpdateAnnouncement}
                onDelete={handleDeleteAnnouncement}
              />
            ) : (
              <CustomTabView tab={getCustomTabsForChat(selectedChatId).find((t) => t.id === chatTab)} />
            )}

            {/* Typing indicator */}
            <TypingIndicator typingUsers={currentChatTypingUsers} />

            {/* Input (hidden for topic_group chats — topics have their own input) */}
            {selectedChatType !== "topic_group" && (
              <MessageInput chatId={selectedChatId} onTyping={handleInputTyping} />
            )}
          </div>

          {/* Thread panel */}
          {activeThreadId && (
            <ThreadPanel
              key={activeThreadId}
              parentMessageId={activeThreadId}
              chatId={selectedChatId}
              senderMap={senderMapRef.current}
              onClose={() => setActiveThreadId(null)}
            />
          )}

          {/* Group settings panel */}
          {showGroupSettings && selectedChatId && (
            <div className="w-80 border-l border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex-shrink-0">
              <GroupSettingsPanel
                key={selectedChatId}
                chatId={selectedChatId}
                currentUserId={user?.id || ""}
                onClose={() => setShowGroupSettings(false)}
                onChatUpdated={(updatedChat) => {
                  ChatList.updateChatName(updatedChat.id, updatedChat.name || "");
                }}
              />
            </div>
          )}
        </div>
      ) : showFavorites ? (
        <FavoritesView favorites={favorites} onUnfavorite={async (messageId) => {
          setFavorites((prev) => prev.filter((f) => f.messageId !== messageId));
          try {
            await api.unfavoriteMessage(messageId);
          } catch { /* ignore */ }
        }} />
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

      {/* Forward message dialog */}
      <ForwardDialog
        open={isForwardDialogOpen}
        onOpenChange={setIsForwardDialogOpen}
        messages={forwardMessages}
      />

      {/* Buzz dialog */}
      {buzzTargetMessage && selectedChatId && (
        <BuzzDialog
          open={isBuzzDialogOpen}
          onOpenChange={setIsBuzzDialogOpen}
          messageId={buzzTargetMessage.id}
          chatId={selectedChatId}
          currentUserId={user?.id || ""}
          onBuzzSent={handleBuzzSent}
        />
      )}

      {/* Create task from message dialog */}
      {createTaskMessage && selectedChatId && (
        <CreateTaskFromMessageDialog
          open={isCreateTaskDialogOpen}
          onOpenChange={setIsCreateTaskDialogOpen}
          message={createTaskMessage}
          chatId={selectedChatId}
        />
      )}

      {/* Buzz overlay for incoming buzzes */}
      {activeBuzz && (
        <BuzzOverlay
          messageId={activeBuzz.messageId}
          chatId={activeBuzz.chatId}
          senderId={activeBuzz.senderId}
          onDismiss={handleDismissBuzz}
          onViewInChat={handleViewBuzzInChat}
        />
      )}
    </>
  );
}

function PinnedMessagesView({ pins, onUnpin }: { pins: PinType[]; onUnpin: (messageId: string) => void }) {
  if (pins.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
        <Pin className="h-8 w-8 text-gray-400 dark:text-gray-500 mb-2" />
        <p className="text-sm text-gray-500 dark:text-gray-400">No pinned messages</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Pin important messages to find them easily
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
      {pins.map((pin) => (
        <div
          key={pin.id}
          className="rounded-lg border border-gray-200 dark:border-gray-700 p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
                {pin.message?.contentJson?.text || "Message"}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Pinned {new Date(pin.pinnedAt).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={() => onUnpin(pin.messageId)}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600"
              title="Unpin"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function SharedDocsView({ docs }: { docs: Array<{ id: string; title: string; url: string; sharedAt: string; sharedBy: string }> }) {
  if (docs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
        <FileText className="h-8 w-8 text-gray-400 dark:text-gray-500 mb-2" />
        <p className="text-sm text-gray-500 dark:text-gray-400">No docs shared yet</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Documents shared in this chat will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
      {docs.map((doc) => (
        <a
          key={doc.id}
          href={doc.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <FileText className="h-5 w-5 text-blue-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{doc.title}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Shared {new Date(doc.sharedAt).toLocaleDateString()} by {doc.sharedBy}
            </p>
          </div>
        </a>
      ))}
    </div>
  );
}

function SharedFilesView({ files }: { files: Array<{ id: string; name: string; url: string; size: number; sharedAt: string; sharedBy: string }> }) {
  if (files.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
        <File className="h-8 w-8 text-gray-400 dark:text-gray-500 mb-2" />
        <p className="text-sm text-gray-500 dark:text-gray-400">No files shared yet</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Files and attachments shared in this chat will appear here
        </p>
      </div>
    );
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
      {files.map((file) => (
        <a
          key={file.id}
          href={file.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <File className="h-5 w-5 text-gray-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{file.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {formatSize(file.size)} · Shared {new Date(file.sharedAt).toLocaleDateString()} by {file.sharedBy}
            </p>
          </div>
        </a>
      ))}
    </div>
  );
}

function CustomTabView({ tab }: { tab?: { id: string; name: string; url: string } }) {
  if (!tab) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
        Tab not found
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <iframe
        src={tab.url}
        title={tab.name}
        className="flex-1 w-full border-0"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      />
    </div>
  );
}

function FavoritesView({ favorites, onUnfavorite }: { favorites: Favorite[]; onUnfavorite: (messageId: string) => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Star className="h-5 w-5 text-yellow-500 fill-current" />
          Favorites
        </h2>
      </div>
      {favorites.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
          <Star className="h-8 w-8 text-gray-400 dark:text-gray-500 mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No favorite messages</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Star messages you want to find later
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
          {favorites.map((fav) => (
            <div
              key={fav.id}
              className="rounded-lg border border-gray-200 dark:border-gray-700 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
                    {fav.message?.contentJson?.text || "Message"}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Saved {new Date(fav.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => onUnfavorite(fav.messageId)}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-yellow-500 hover:text-yellow-600"
                  title="Remove from favorites"
                >
                  <Star className="h-4 w-4 fill-current" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
