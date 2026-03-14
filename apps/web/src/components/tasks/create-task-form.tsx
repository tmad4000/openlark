"use client";

import { useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface CreateTaskFormProps {
  onCreated: () => void;
  onCancel: () => void;
}

export function CreateTaskForm({ onCreated, onCancel }: CreateTaskFormProps) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"none" | "low" | "medium" | "high" | "urgent">("none");
  const [dueDate, setDueDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!title.trim() || isSubmitting) return;

      setIsSubmitting(true);
      try {
        await api.createTask({
          title: title.trim(),
          priority,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        });
        onCreated();
      } catch {
        // ignore
      } finally {
        setIsSubmitting(false);
      }
    },
    [title, priority, dueDate, isSubmitting, onCreated]
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700"
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title..."
        className="flex-1 text-sm px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
      />
      <select
        value={priority}
        onChange={(e) => setPriority(e.target.value as typeof priority)}
        className="text-xs px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300"
      >
        <option value="none">No priority</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="text-xs px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300"
      />
      <Button type="submit" size="sm" disabled={!title.trim() || isSubmitting}>
        Add
      </Button>
      <button
        type="button"
        onClick={onCancel}
        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
      >
        <X className="w-4 h-4 text-gray-400" />
      </button>
    </form>
  );
}
