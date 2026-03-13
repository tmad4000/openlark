"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type Chat, type Message } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Search, Check, Forward } from "lucide-react";

interface ForwardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: Message[];
  onForwarded?: () => void;
}

export function ForwardDialog({
  open,
  onOpenChange,
  messages,
  onForwarded,
}: ForwardDialogProps) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load chats when dialog opens
  useEffect(() => {
    if (!open) {
      setSelectedChatIds(new Set());
      setSearchQuery("");
      setError(null);
      return;
    }
    setIsLoading(true);
    api
      .getChats()
      .then((res) => setChats(res.chats))
      .catch(() => setError("Failed to load chats"))
      .finally(() => setIsLoading(false));
  }, [open]);

  const toggleChat = useCallback((chatId: string) => {
    setSelectedChatIds((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) {
        next.delete(chatId);
      } else {
        next.add(chatId);
      }
      return next;
    });
  }, []);

  const filteredChats = chats.filter((chat) => {
    if (!searchQuery) return true;
    const name = chat.name || "";
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleForward = async () => {
    if (selectedChatIds.size === 0 || messages.length === 0) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const chatIds = Array.from(selectedChatIds);
      // Forward each message to the selected chats
      for (const msg of messages) {
        await api.forwardMessage(msg.id, chatIds);
      }
      onForwarded?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to forward message");
    } finally {
      setIsSubmitting(false);
    }
  };

  const previewText =
    messages.length === 1
      ? messages[0].contentJson?.text?.slice(0, 100) || "(no text)"
      : `${messages.length} messages`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Forward className="h-4 w-4" />
            Forward Message
          </DialogTitle>
          <DialogDescription>
            Select chats to forward to
          </DialogDescription>
        </DialogHeader>

        {/* Message preview */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-md px-3 py-2 text-sm text-gray-600 dark:text-gray-300 truncate">
          {previewText}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats..."
            className="pl-9"
          />
        </div>

        {/* Chat list */}
        <div className="max-h-60 overflow-y-auto space-y-1">
          {isLoading ? (
            <div className="text-center text-sm text-gray-500 py-4">
              Loading chats...
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="text-center text-sm text-gray-500 py-4">
              No chats found
            </div>
          ) : (
            filteredChats.map((chat) => {
              const isSelected = selectedChatIds.has(chat.id);
              return (
                <button
                  key={chat.id}
                  onClick={() => toggleChat(chat.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors",
                    isSelected
                      ? "bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800"
                  )}
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0",
                      isSelected
                        ? "bg-blue-500 text-white"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                    )}
                  >
                    {isSelected ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      (chat.name || "?")[0].toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {chat.name || "Direct Message"}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {chat.type === "dm" ? "DM" : "Group"}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {error && (
          <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleForward}
            disabled={selectedChatIds.size === 0 || isSubmitting}
          >
            {isSubmitting
              ? "Forwarding..."
              : `Forward${selectedChatIds.size > 0 ? ` to ${selectedChatIds.size} chat${selectedChatIds.size > 1 ? "s" : ""}` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
