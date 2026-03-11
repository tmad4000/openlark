"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  MessageSquare,
  Plus,
  ChevronRight,
  Check,
  Lock,
  Unlock,
  ArrowLeft,
  Send,
  Loader2,
  Users,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import MessageInput, { MentionUser } from "@/components/MessageInput";
import { CodeBlockRenderer } from "@/components/CodeBlockRenderer";

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

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return "Today";
  if (isYesterday) return "Yesterday";
  return date.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

interface Topic {
  id: string;
  chatId: string;
  title: string;
  creatorId: string;
  status: "open" | "closed";
  createdAt: string;
  creator: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  messageCount: number;
  isSubscribed: boolean;
  lastActivity?: string;
  lastActivityBy?: string | null;
}

interface TopicMessage {
  id: string;
  chatId: string;
  senderId: string;
  type: "text" | "rich_text" | "code";
  content: Record<string, unknown>;
  topicId: string;
  editedAt: string | null;
  recalledAt: string | null;
  createdAt: string;
  sender: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

interface Chat {
  id: string;
  type: string;
  name: string | null;
  avatarUrl: string | null;
  memberCount: number;
}

interface TopicGroupViewProps {
  chat: Chat;
  currentUserId: string;
  onTopicMessage?: (message: TopicMessage) => void;
}

export function TopicGroupView({
  chat,
  currentUserId,
  onTopicMessage,
}: TopicGroupViewProps) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newTopicMessage, setNewTopicMessage] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("all");

  // Load topics
  const loadTopics = useCallback(async () => {
    const token = getCookie("session_token");
    if (!token) return;

    try {
      const url = statusFilter === "all"
        ? `/api/chats/${chat.id}/topics`
        : `/api/chats/${chat.id}/topics?status=${statusFilter}`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error("Failed to load topics");

      const data = await res.json();
      setTopics(data.topics);
      setIsLoading(false);
    } catch (e) {
      setError("Failed to load topics");
      setIsLoading(false);
    }
  }, [chat.id, statusFilter]);

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  // Create topic
  const handleCreateTopic = async () => {
    if (!newTopicTitle.trim()) return;

    const token = getCookie("session_token");
    if (!token) return;

    setIsCreating(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        title: newTopicTitle.trim(),
      };

      if (newTopicMessage.trim()) {
        body.initial_message = {
          type: "text",
          content: { text: newTopicMessage.trim() },
        };
      }

      const res = await fetch(`/api/chats/${chat.id}/topics`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create topic");
      }

      const data = await res.json();

      // Add new topic to list
      setTopics((prev) => [data.topic, ...prev]);

      // Reset form
      setNewTopicTitle("");
      setNewTopicMessage("");
      setIsCreateDialogOpen(false);

      // Navigate to the new topic
      setSelectedTopic(data.topic);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create topic");
    } finally {
      setIsCreating(false);
    }
  };

  // If a topic is selected, show topic view
  if (selectedTopic) {
    return (
      <TopicView
        topic={selectedTopic}
        chatId={chat.id}
        currentUserId={currentUserId}
        onBack={() => {
          setSelectedTopic(null);
          loadTopics(); // Refresh topics when going back
        }}
        onTopicUpdated={(updatedTopic) => {
          setSelectedTopic(updatedTopic);
          setTopics((prev) =>
            prev.map((t) => (t.id === updatedTopic.id ? updatedTopic : t))
          );
        }}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">{chat.name}</h2>
              <p className="text-sm text-gray-500">
                {topics.length} topic{topics.length !== 1 ? "s" : ""} &middot;{" "}
                {chat.memberCount} member{chat.memberCount !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsCreateDialogOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Topic</span>
          </button>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-2 mt-4">
          {(["all", "open", "closed"] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                statusFilter === filter
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Topics list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-500">{error}</div>
        ) : topics.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-700">No topics yet</h3>
            <p className="text-sm mt-1">Create a topic to start a discussion</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {topics.map((topic) => (
              <TopicRow
                key={topic.id}
                topic={topic}
                onClick={() => setSelectedTopic(topic)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Topic Dialog */}
      <Dialog.Root open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl z-50 w-full max-w-md p-6">
            <Dialog.Title className="text-lg font-semibold mb-4">
              Create New Topic
            </Dialog.Title>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Topic Title
                </label>
                <input
                  type="text"
                  value={newTopicTitle}
                  onChange={(e) => setNewTopicTitle(e.target.value)}
                  placeholder="What would you like to discuss?"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Initial Message (optional)
                </label>
                <textarea
                  value={newTopicMessage}
                  onChange={(e) => setNewTopicMessage(e.target.value)}
                  placeholder="Add context or a question..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {error && (
                <div className="text-sm text-red-500">{error}</div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Dialog.Close asChild>
                <button className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={handleCreateTopic}
                disabled={!newTopicTitle.trim() || isCreating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Topic"
                )}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function TopicRow({ topic, onClick }: { topic: Topic; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left"
    >
      <div className="flex-shrink-0">
        {topic.status === "open" ? (
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-green-600" />
          </div>
        ) : (
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <Lock className="w-5 h-5 text-gray-500" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-gray-900 truncate">{topic.title}</h3>
          {topic.isSubscribed && (
            <span className="flex-shrink-0 text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
              Subscribed
            </span>
          )}
          {topic.status === "closed" && (
            <span className="flex-shrink-0 text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
              Closed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
          <span>{topic.messageCount} message{topic.messageCount !== 1 ? "s" : ""}</span>
          <span>&middot;</span>
          <span>Started by {topic.creator.displayName || "Unknown"}</span>
          {topic.lastActivityBy && (
            <>
              <span>&middot;</span>
              <span>Last reply by {topic.lastActivityBy}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 flex items-center gap-2 text-gray-400">
        <span className="text-sm">
          {topic.lastActivity
            ? formatTimestamp(topic.lastActivity)
            : formatTimestamp(topic.createdAt)}
        </span>
        <ChevronRight className="w-5 h-5" />
      </div>
    </button>
  );
}

interface TopicViewProps {
  topic: Topic;
  chatId: string;
  currentUserId: string;
  onBack: () => void;
  onTopicUpdated: (topic: Topic) => void;
}

function TopicView({
  topic,
  chatId,
  currentUserId,
  onBack,
  onTopicUpdated,
}: TopicViewProps) {
  const [messages, setMessages] = useState<TopicMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(topic.isSubscribed);
  const [status, setStatus] = useState(topic.status);
  const [isUpdating, setIsUpdating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check if current user can manage topic (creator or owner)
  const canManageTopic = topic.creatorId === currentUserId;

  // Load messages
  useEffect(() => {
    const loadMessages = async () => {
      const token = getCookie("session_token");
      if (!token) return;

      try {
        const res = await fetch(`/api/topics/${topic.id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) throw new Error("Failed to load topic");

        const data = await res.json();
        setMessages(data.messages);
        setIsSubscribed(data.topic.isSubscribed);
        setStatus(data.topic.status);
        setIsLoading(false);
      } catch (e) {
        setError("Failed to load messages");
        setIsLoading(false);
      }
    };

    loadMessages();
  }, [topic.id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send message
  const handleSendMessage = async (content: {
    html: string;
    text: string;
    mentions?: Array<{ id: string; displayName: string }>;
  }) => {
    if (status === "closed") return;

    const token = getCookie("session_token");
    if (!token) return;

    setIsSending(true);

    // Determine message type based on content
    const hasRichContent = content.html !== content.text || content.mentions?.length;
    const type = hasRichContent ? "rich_text" : "text";
    const messageContent = hasRichContent
      ? { html: content.html, text: content.text, mentions: content.mentions }
      : { text: content.text };

    try {
      const res = await fetch(`/api/topics/${topic.id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ type, content: messageContent }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send message");
      }

      const newMessage = await res.json();
      setMessages((prev) => [...prev, newMessage]);

      // Update subscription status if not subscribed
      if (!isSubscribed) {
        setIsSubscribed(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  // Toggle subscription
  const toggleSubscription = async () => {
    const token = getCookie("session_token");
    if (!token) return;

    setIsUpdating(true);

    try {
      const res = await fetch(`/api/topics/${topic.id}/subscribe`, {
        method: isSubscribed ? "DELETE" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        setIsSubscribed(!isSubscribed);
      }
    } catch (e) {
      // Silent fail
    } finally {
      setIsUpdating(false);
    }
  };

  // Toggle topic status (open/closed)
  const toggleStatus = async () => {
    if (!canManageTopic) return;

    const token = getCookie("session_token");
    if (!token) return;

    setIsUpdating(true);
    const newStatus = status === "open" ? "closed" : "open";

    try {
      const res = await fetch(`/api/topics/${topic.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        const data = await res.json();
        setStatus(data.topic.status);
        onTopicUpdated({ ...topic, status: data.topic.status });
      }
    } catch (e) {
      // Silent fail
    } finally {
      setIsUpdating(false);
    }
  };

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: TopicMessage[] }[] = [];
    let currentDate: string | null = null;
    let currentGroup: TopicMessage[] = [];

    for (const msg of messages) {
      const msgDate = new Date(msg.createdAt).toDateString();
      if (msgDate !== currentDate) {
        if (currentGroup.length > 0 && currentDate) {
          groups.push({ date: currentDate, messages: currentGroup });
        }
        currentDate = msgDate;
        currentGroup = [msg];
      } else {
        currentGroup.push(msg);
      }
    }

    if (currentGroup.length > 0 && currentDate) {
      groups.push({ date: currentDate, messages: currentGroup });
    }

    return groups;
  }, [messages]);

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Topic header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-900">{topic.title}</h2>
              {status === "closed" && (
                <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                  Closed
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500">
              Started by {topic.creator.displayName || "Unknown"} &middot;{" "}
              {messages.length} message{messages.length !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleSubscription}
              disabled={isUpdating}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isSubscribed
                  ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {isSubscribed ? "Subscribed" : "Subscribe"}
            </button>

            {canManageTopic && (
              <button
                onClick={toggleStatus}
                disabled={isUpdating}
                className={`p-2 rounded-lg transition-colors ${
                  status === "open"
                    ? "hover:bg-gray-100 text-gray-600"
                    : "hover:bg-green-100 text-green-600"
                }`}
                title={status === "open" ? "Close topic" : "Reopen topic"}
              >
                {status === "open" ? (
                  <Lock className="w-5 h-5" />
                ) : (
                  <Unlock className="w-5 h-5" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-500">{error}</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-700">No messages yet</h3>
            <p className="text-sm mt-1">Be the first to reply to this topic</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedMessages.map(({ date, messages: dateMessages }) => (
              <div key={date}>
                {/* Date separator */}
                <div className="flex items-center gap-4 my-4">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-500 font-medium">
                    {formatDateSeparator(date)}
                  </span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                {/* Messages for this date */}
                <div className="space-y-3">
                  {dateMessages.map((msg) => (
                    <TopicMessageBubble
                      key={msg.id}
                      message={msg}
                      isCurrentUser={msg.senderId === currentUserId}
                    />
                  ))}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Reply input */}
      {status === "open" ? (
        <div className="flex-shrink-0 bg-white border-t border-gray-200 p-4">
          <MessageInput
            onSend={handleSendMessage}
            placeholder="Reply to this topic..."
            isSending={isSending}
          />
        </div>
      ) : (
        <div className="flex-shrink-0 bg-gray-100 border-t border-gray-200 p-4 text-center text-gray-500">
          <Lock className="w-4 h-4 inline-block mr-2" />
          This topic is closed. No new replies can be added.
        </div>
      )}
    </div>
  );
}

function TopicMessageBubble({
  message,
  isCurrentUser,
}: {
  message: TopicMessage;
  isCurrentUser: boolean;
}) {
  const renderContent = () => {
    if (message.recalledAt) {
      return (
        <span className="text-gray-500 italic">This message was recalled</span>
      );
    }

    const content = message.content;

    // Code message
    if (message.type === "code") {
      return (
        <CodeBlockRenderer
          code={(content.code as string) || ""}
          language={(content.language as string) || "text"}
        />
      );
    }

    // Rich text message
    if (message.type === "rich_text" && content.html) {
      return (
        <div
          className="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: content.html as string }}
        />
      );
    }

    // Plain text
    if (content.text) {
      return <p className="whitespace-pre-wrap">{content.text as string}</p>;
    }

    return <span className="text-gray-500">Message</span>;
  };

  return (
    <div
      className={`flex gap-3 ${isCurrentUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        {message.sender.avatarUrl ? (
          <img
            src={message.sender.avatarUrl}
            alt={message.sender.displayName || "User"}
            className="w-8 h-8 rounded-full"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
            <span className="text-sm font-medium text-gray-600">
              {(message.sender.displayName || "?")[0].toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Message bubble */}
      <div className={`max-w-[70%] ${isCurrentUser ? "text-right" : "text-left"}`}>
        <div className="flex items-center gap-2 mb-1">
          <span
            className={`text-sm font-medium text-gray-700 ${
              isCurrentUser ? "order-2" : "order-1"
            }`}
          >
            {message.sender.displayName || "Unknown"}
          </span>
          <span
            className={`text-xs text-gray-400 ${
              isCurrentUser ? "order-1" : "order-2"
            }`}
          >
            {formatTimestamp(message.createdAt)}
            {message.editedAt && " (edited)"}
          </span>
        </div>

        <div
          className={`inline-block px-4 py-2 rounded-lg ${
            isCurrentUser
              ? "bg-blue-600 text-white"
              : "bg-white border border-gray-200 text-gray-900"
          }`}
        >
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

// Memoize for performance
import { useMemo } from "react";
