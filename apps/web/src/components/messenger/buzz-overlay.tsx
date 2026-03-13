"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Zap, MessageSquare } from "lucide-react";
import { api, type Message } from "@/lib/api";

interface BuzzOverlayProps {
  messageId: string;
  chatId: string;
  senderId: string;
  onDismiss: () => void;
  onViewInChat: (chatId: string, messageId: string) => void;
}

export function BuzzOverlay({
  messageId,
  chatId,
  senderId,
  onDismiss,
  onViewInChat,
}: BuzzOverlayProps) {
  const [message, setMessage] = useState<Message | null>(null);
  const [senderName, setSenderName] = useState<string>("");

  useEffect(() => {
    // Load message content and sender info
    api.getMessages(chatId, { limit: 50 }).then((res) => {
      const found = res.messages.find((m) => m.id === messageId);
      if (found) setMessage(found);
    }).catch(() => {});

    api.getChatMembers(chatId).then((res) => {
      const sender = res.members.find((m) => m.userId === senderId);
      if (sender?.user?.displayName) {
        setSenderName(sender.user.displayName);
      } else {
        setSenderName(`User ${senderId.slice(0, 8)}`);
      }
    }).catch(() => {
      setSenderName(`User ${senderId.slice(0, 8)}`);
    });
  }, [chatId, messageId, senderId]);

  const handleViewInChat = useCallback(() => {
    onViewInChat(chatId, messageId);
    onDismiss();
  }, [chatId, messageId, onViewInChat, onDismiss]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      {/* Pulsing background effect */}
      <div className="absolute inset-0 bg-red-600/10 animate-pulse" />

      <div className="relative z-10 max-w-lg w-full mx-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border-2 border-red-500 overflow-hidden">
        {/* Header */}
        <div className="bg-red-600 px-6 py-4 flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-full animate-bounce">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Urgent Buzz</h2>
            <p className="text-red-100 text-sm">from {senderName}</p>
          </div>
        </div>

        {/* Message content */}
        <div className="px-6 py-6">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 min-h-[60px]">
            {message ? (
              <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
                {message.contentJson?.text || "(no text content)"}
              </p>
            ) : (
              <p className="text-sm text-gray-400 italic">Loading message...</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex flex-col gap-3">
          <Button
            onClick={handleViewInChat}
            className="w-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-2"
          >
            <MessageSquare className="h-4 w-4" />
            View in Chat
          </Button>
          <Button
            onClick={onDismiss}
            variant="outline"
            className="w-full"
          >
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}
