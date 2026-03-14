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
import { api, type Message, type ChatMember } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CheckSquare, Calendar, Check } from "lucide-react";

interface CreateTaskFromMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: Message | null;
  chatId: string;
  onTaskCreated?: (taskId: string) => void;
}

export function CreateTaskFromMessageDialog({
  open,
  onOpenChange,
  message,
  chatId,
  onTaskCreated,
}: CreateTaskFromMessageDialogProps) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string | null>(null);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Initialize form when dialog opens
  useEffect(() => {
    if (!open || !message) {
      setSelectedAssigneeId(null);
      setDueDate("");
      setError(null);
      return;
    }
    // Pre-fill title from message text
    const text = message.contentJson?.text || "";
    setTitle(text.length > 200 ? text.slice(0, 200) + "..." : text);

    // Load chat members for assignee picker
    setIsLoading(true);
    api
      .getChatMembers(chatId)
      .then((res) => setMembers(res.members))
      .catch(() => setError("Failed to load members"))
      .finally(() => setIsLoading(false));
  }, [open, message, chatId]);

  const handleSubmit = async () => {
    if (!message || !title.trim()) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await api.createTaskFromMessage({
        messageId: message.id,
        title: title.trim(),
        assigneeIds: selectedAssigneeId ? [selectedAssigneeId] : undefined,
        dueDate: dueDate || undefined,
      });
      onTaskCreated?.(result.task.id);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4" />
            Create Task
          </DialogTitle>
          <DialogDescription>
            Create a task from this message
          </DialogDescription>
        </DialogHeader>

        {/* Title */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Title
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
          />
        </div>

        {/* Message preview */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-md px-3 py-2 text-sm text-gray-600 dark:text-gray-300">
          <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">
            From message:
          </div>
          <div className="truncate">
            {message?.contentJson?.text || "(no text)"}
          </div>
        </div>

        {/* Assignee */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Assignee
          </label>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {isLoading ? (
              <div className="text-center text-sm text-gray-500 py-2">
                Loading members...
              </div>
            ) : members.length === 0 ? (
              <div className="text-center text-sm text-gray-500 py-2">
                No members found
              </div>
            ) : (
              members.map((member) => {
                const isSelected = selectedAssigneeId === member.userId;
                return (
                  <button
                    key={member.userId}
                    onClick={() =>
                      setSelectedAssigneeId(
                        isSelected ? null : member.userId
                      )
                    }
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors",
                      isSelected
                        ? "bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800"
                        : "hover:bg-gray-100 dark:hover:bg-gray-800"
                    )}
                  >
                    <div
                      className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0",
                        isSelected
                          ? "bg-blue-500 text-white"
                          : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                      )}
                    >
                      {isSelected ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        (
                          member.user?.displayName ||
                          member.userId.slice(0, 2)
                        )[0].toUpperCase()
                      )}
                    </div>
                    <span className="text-sm text-gray-900 dark:text-gray-100 truncate">
                      {member.user?.displayName ||
                        `User ${member.userId.slice(0, 8)}`}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Due date */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            Due date
          </label>
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
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
            onClick={handleSubmit}
            disabled={!title.trim() || isSubmitting}
          >
            {isSubmitting ? "Creating..." : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
