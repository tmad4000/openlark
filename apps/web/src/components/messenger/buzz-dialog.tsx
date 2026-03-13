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
import { api, type ChatMember } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Search, Zap } from "lucide-react";

interface BuzzDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageId: string;
  chatId: string;
  currentUserId: string;
  onBuzzSent?: (messageId: string, recipientId: string) => void;
}

export function BuzzDialog({
  open,
  onOpenChange,
  messageId,
  chatId,
  currentUserId,
  onBuzzSent,
}: BuzzDialogProps) {
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedRecipientId(null);
      setSearchQuery("");
      setError(null);
      return;
    }
    setIsLoading(true);
    api
      .getChatMembers(chatId)
      .then((res) => {
        // Exclude self from recipient list
        setMembers(res.members.filter((m) => m.userId !== currentUserId));
      })
      .catch(() => setError("Failed to load members"))
      .finally(() => setIsLoading(false));
  }, [open, chatId, currentUserId]);

  const filteredMembers = members.filter((m) => {
    if (!searchQuery) return true;
    const name = m.user?.displayName || "";
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleBuzz = useCallback(async () => {
    if (!selectedRecipientId) return;
    setIsSubmitting(true);
    setError(null);

    try {
      await api.buzzMessage(messageId, selectedRecipientId, "in_app");
      onBuzzSent?.(messageId, selectedRecipientId);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send buzz");
    } finally {
      setIsSubmitting(false);
    }
  }, [messageId, selectedRecipientId, onBuzzSent, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-red-500" />
            Buzz - Urgent Notification
          </DialogTitle>
          <DialogDescription>
            Select a recipient to send an urgent buzz notification
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search members..."
            className="pl-9"
          />
        </div>

        {/* Member list */}
        <div className="max-h-60 overflow-y-auto space-y-1">
          {isLoading ? (
            <div className="text-center text-sm text-gray-500 py-4">
              Loading members...
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-center text-sm text-gray-500 py-4">
              No members found
            </div>
          ) : (
            filteredMembers.map((member) => {
              const isSelected = selectedRecipientId === member.userId;
              return (
                <button
                  key={member.userId}
                  onClick={() => setSelectedRecipientId(member.userId)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors",
                    isSelected
                      ? "bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800"
                  )}
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0",
                      isSelected
                        ? "bg-red-500 text-white"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                    )}
                  >
                    {isSelected ? (
                      <Zap className="h-4 w-4" />
                    ) : (
                      (member.user?.displayName || "?")[0].toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {member.user?.displayName || `User ${member.userId.slice(0, 8)}`}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {member.role}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Tier info */}
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-md px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Tier: In-app notification only. The recipient will see a full-screen urgent alert.
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
            onClick={handleBuzz}
            disabled={!selectedRecipientId || isSubmitting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isSubmitting ? "Sending..." : "Send Buzz"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
