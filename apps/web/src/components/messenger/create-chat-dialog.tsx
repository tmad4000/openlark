"use client";

import { useState, useEffect } from "react";
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
import { Label } from "@/components/ui/label";
import { api, type Chat } from "@/lib/api";

interface CreateChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChatCreated: (chat: Chat) => void;
}

export function CreateChatDialog({
  open,
  onOpenChange,
  onChatCreated,
}: CreateChatDialogProps) {
  const [chatType, setChatType] = useState<"dm" | "group">("dm");
  const [userIds, setUserIds] = useState("");
  const [groupName, setGroupName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setChatType("dm");
      setUserIds("");
      setGroupName("");
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // Parse user IDs (comma-separated, trim whitespace)
      const memberIds = userIds
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);

      if (memberIds.length === 0) {
        setError("Please enter at least one user ID");
        setIsSubmitting(false);
        return;
      }

      const result = await api.createChat({
        type: chatType,
        memberIds,
        ...(chatType === "group" && groupName ? { name: groupName } : {}),
      });

      onChatCreated(result.chat);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create chat");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValid = userIds.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
          <DialogDescription>
            Enter the user ID of the person you want to chat with. For group
            chats, separate multiple IDs with commas.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* Chat type selection */}
            <div className="space-y-2">
              <Label>Chat Type</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="chatType"
                    value="dm"
                    checked={chatType === "dm"}
                    onChange={() => setChatType("dm")}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Direct Message
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="chatType"
                    value="group"
                    checked={chatType === "group"}
                    onChange={() => setChatType("group")}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Group Chat
                  </span>
                </label>
              </div>
            </div>

            {/* Group name (only for group chats) */}
            {chatType === "group" && (
              <div className="space-y-2">
                <Label htmlFor="groupName">Group Name</Label>
                <Input
                  id="groupName"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Enter group name"
                />
              </div>
            )}

            {/* User ID(s) input */}
            <div className="space-y-2">
              <Label htmlFor="userIds">
                {chatType === "dm" ? "User ID" : "Member User IDs"}
              </Label>
              <Input
                id="userIds"
                value={userIds}
                onChange={(e) => setUserIds(e.target.value)}
                placeholder={
                  chatType === "dm"
                    ? "Enter user ID"
                    : "Enter user IDs (comma-separated)"
                }
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {chatType === "dm"
                  ? "Enter the user ID of the person you want to message"
                  : "Enter multiple user IDs separated by commas"}
              </p>
            </div>

            {/* Error message */}
            {error && (
              <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md">
                {error}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isSubmitting}>
              {isSubmitting ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
