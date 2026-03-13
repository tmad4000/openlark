"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api, type Topic, type Message, type ChatMember } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Plus, MessageCircle, Lock, Unlock, Send, ArrowLeft, Loader2 } from "lucide-react";

interface TopicViewProps {
  chatId: string;
  currentUserId: string;
  chatMembers: ChatMember[];
}

export function TopicView({ chatId, currentUserId, chatMembers }: TopicViewProps) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [topicMessages, setTopicMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newTopicMessage, setNewTopicMessage] = useState("");
  const [replyText, setReplyText] = useState("");
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load topics
  useEffect(() => {
    setLoading(true);
    api.getTopics(chatId)
      .then((res) => setTopics(res.topics))
      .catch(() => setTopics([]))
      .finally(() => setLoading(false));
  }, [chatId]);

  // Load topic messages when topic selected
  useEffect(() => {
    if (!selectedTopic) return;
    setMessagesLoading(true);
    api.getTopicMessages(selectedTopic.id)
      .then((res) => {
        setTopicMessages(res.messages.reverse()); // chronological order
      })
      .catch(() => setTopicMessages([]))
      .finally(() => setMessagesLoading(false));
  }, [selectedTopic]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [topicMessages]);

  const handleCreateTopic = useCallback(async () => {
    if (!newTopicTitle.trim() || !newTopicMessage.trim()) return;
    setCreating(true);
    try {
      const res = await api.createTopic(chatId, newTopicTitle.trim(), newTopicMessage.trim());
      setTopics((prev) => [{ ...res.topic, messageCount: 1 }, ...prev]);
      setNewTopicTitle("");
      setNewTopicMessage("");
      setShowCreateForm(false);
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  }, [chatId, newTopicTitle, newTopicMessage]);

  const handleSendReply = useCallback(async () => {
    if (!selectedTopic || !replyText.trim()) return;
    setSending(true);
    try {
      const res = await api.sendMessage(chatId, {
        content: replyText.trim(),
        topicId: selectedTopic.id,
      });
      setTopicMessages((prev) => [...prev, res.message]);
      setReplyText("");
      // Update topic message count
      setTopics((prev) =>
        prev.map((t) =>
          t.id === selectedTopic.id
            ? { ...t, messageCount: t.messageCount + 1 }
            : t
        )
      );
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  }, [chatId, selectedTopic, replyText]);

  const handleToggleTopicStatus = useCallback(async (topic: Topic) => {
    const newStatus = topic.status === "open" ? "closed" : "open";
    try {
      const res = await api.updateTopic(topic.id, { status: newStatus });
      setTopics((prev) =>
        prev.map((t) => (t.id === topic.id ? { ...t, ...res.topic } : t))
      );
      if (selectedTopic?.id === topic.id) {
        setSelectedTopic((prev) => prev ? { ...prev, ...res.topic } : null);
      }
    } catch {
      // ignore
    }
  }, [selectedTopic]);

  const getSenderName = useCallback((senderId: string) => {
    const member = chatMembers.find((m) => m.userId === senderId);
    return member?.user?.displayName || `User ${senderId.slice(0, 8)}`;
  }, [chatMembers]);

  // Topic detail view
  if (selectedTopic) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        {/* Topic header */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
          <button
            onClick={() => {
              setSelectedTopic(null);
              setTopicMessages([]);
            }}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
              {selectedTopic.title}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {selectedTopic.status === "open" ? "Open" : "Closed"} · {selectedTopic.messageCount} messages
            </p>
          </div>
          <button
            onClick={() => handleToggleTopicStatus(selectedTopic)}
            className={cn(
              "px-2 py-1 text-xs rounded-md border transition-colors",
              selectedTopic.status === "open"
                ? "border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
                : "border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"
            )}
          >
            {selectedTopic.status === "open" ? (
              <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> Close</span>
            ) : (
              <span className="flex items-center gap-1"><Unlock className="h-3 w-3" /> Reopen</span>
            )}
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messagesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : topicMessages.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
              No messages in this topic
            </p>
          ) : (
            topicMessages.map((msg) => {
              const content = msg.contentJson as { text?: string };
              const isRecalled = !!msg.recalledAt;
              return (
                <div key={msg.id} className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xs font-medium text-blue-700 dark:text-blue-300 flex-shrink-0">
                    {getSenderName(msg.senderId).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {getSenderName(msg.senderId)}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className={cn(
                      "text-sm mt-0.5 whitespace-pre-wrap break-words",
                      isRecalled
                        ? "italic text-gray-400 dark:text-gray-500"
                        : "text-gray-800 dark:text-gray-200"
                    )}>
                      {isRecalled ? "Message recalled" : content?.text || ""}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply input */}
        {selectedTopic.status === "open" && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800">
            <div className="flex gap-2">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendReply();
                  }
                }}
                placeholder="Reply to this topic..."
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={sending}
              />
              <button
                onClick={handleSendReply}
                disabled={!replyText.trim() || sending}
                className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Topic list view
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header with create button */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
          Topics
        </h3>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-3 w-3" />
          New Topic
        </button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 space-y-2 bg-gray-50 dark:bg-gray-900/50">
          <input
            type="text"
            value={newTopicTitle}
            onChange={(e) => setNewTopicTitle(e.target.value)}
            placeholder="Topic title"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <textarea
            value={newTopicMessage}
            onChange={(e) => setNewTopicMessage(e.target.value)}
            placeholder="Initial message..."
            rows={3}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setShowCreateForm(false);
                setNewTopicTitle("");
                setNewTopicMessage("");
              }}
              className="px-3 py-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateTopic}
              disabled={!newTopicTitle.trim() || !newTopicMessage.trim() || creating}
              className="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? "Creating..." : "Create Topic"}
            </button>
          </div>
        </div>
      )}

      {/* Topics list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : topics.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <MessageCircle className="h-8 w-8 text-gray-400 dark:text-gray-500 mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">No topics yet</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Create a topic to start a focused discussion
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {topics.map((topic) => (
              <button
                key={topic.id}
                onClick={() => setSelectedTopic(topic)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "mt-0.5 h-2 w-2 rounded-full flex-shrink-0",
                    topic.status === "open"
                      ? "bg-green-500"
                      : "bg-gray-400 dark:bg-gray-500"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {topic.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {topic.messageCount} {topic.messageCount === 1 ? "message" : "messages"} · {topic.status === "open" ? "Open" : "Closed"} · {new Date(topic.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
