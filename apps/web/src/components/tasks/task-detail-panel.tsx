"use client";

import { useState, useEffect, useCallback } from "react";
import { api, type Task, type TaskComment } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  X,
  Circle,
  Clock,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  Minus,
  Flame,
  Calendar as CalendarIcon,
  User,
  MessageSquare,
  ListTree,
  Send,
} from "lucide-react";

interface TaskDetailPanelProps {
  task: Task;
  onClose: () => void;
  onUpdate: () => void;
}

const STATUS_OPTIONS: { value: Task["status"]; label: string; icon: typeof Circle; color: string }[] = [
  { value: "todo", label: "Todo", icon: Circle, color: "text-gray-400" },
  { value: "in_progress", label: "In Progress", icon: Clock, color: "text-blue-500" },
  { value: "done", label: "Done", icon: CheckCircle2, color: "text-green-500" },
];

const PRIORITY_OPTIONS: { value: Task["priority"]; label: string; icon: typeof Minus; color: string }[] = [
  { value: "none", label: "None", icon: Minus, color: "text-gray-300" },
  { value: "low", label: "Low", icon: ArrowDown, color: "text-blue-400" },
  { value: "medium", label: "Medium", icon: Minus, color: "text-yellow-500" },
  { value: "high", label: "High", icon: ArrowUp, color: "text-orange-500" },
  { value: "urgent", label: "Urgent", icon: Flame, color: "text-red-500" },
];

export function TaskDetailPanel({ task, onClose, onUpdate }: TaskDetailPanelProps) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "comments" | "subtasks">("details");

  const loadComments = useCallback(async () => {
    try {
      const res = await api.getTaskComments(task.id);
      setComments(res.comments);
    } catch {
      // ignore
    }
  }, [task.id]);

  const loadSubtasks = useCallback(async () => {
    try {
      const res = await api.getSubtasks(task.id);
      setSubtasks(res.tasks);
    } catch {
      // ignore
    }
  }, [task.id]);

  useEffect(() => {
    loadComments();
    loadSubtasks();
  }, [loadComments, loadSubtasks]);

  const handleStatusChange = async (status: Task["status"]) => {
    try {
      await api.updateTask(task.id, { status });
      onUpdate();
    } catch {
      // ignore
    }
  };

  const handlePriorityChange = async (priority: Task["priority"]) => {
    try {
      await api.updateTask(task.id, { priority });
      onUpdate();
    } catch {
      // ignore
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await api.addTaskComment(task.id, newComment.trim());
      setNewComment("");
      loadComments();
    } catch {
      // ignore
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          Task Details
        </span>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Task title */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {task.title}
        </h3>
        {task.description && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {task.description}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 px-4">
        {([
          { key: "details", label: "Details", icon: ListTree },
          { key: "comments", label: "Comments", icon: MessageSquare },
          { key: "subtasks", label: "Subtasks", icon: ListTree },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab.key
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "details" && (
          <div className="p-4 space-y-4">
            {/* Status */}
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                Status
              </label>
              <div className="flex gap-1">
                {STATUS_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => handleStatusChange(opt.value)}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs transition-colors",
                        task.status === opt.value
                          ? "bg-gray-200 dark:bg-gray-700 font-medium text-gray-900 dark:text-gray-100"
                          : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                      )}
                    >
                      <Icon className={cn("w-3.5 h-3.5", opt.color)} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Priority */}
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                Priority
              </label>
              <div className="flex flex-wrap gap-1">
                {PRIORITY_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => handlePriorityChange(opt.value)}
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                        task.priority === opt.value
                          ? "bg-gray-200 dark:bg-gray-700 font-medium text-gray-900 dark:text-gray-100"
                          : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                      )}
                    >
                      <Icon className={cn("w-3 h-3", opt.color)} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Assignees */}
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                Assignees
              </label>
              {task.assigneeIds.length > 0 ? (
                <div className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {task.assigneeIds.length} assigned
                  </span>
                </div>
              ) : (
                <span className="text-sm text-gray-400">No assignees</span>
              )}
            </div>

            {/* Due date */}
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                Due Date
              </label>
              {task.dueDate ? (
                <div className="flex items-center gap-1.5">
                  <CalendarIcon className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {new Date(task.dueDate).toLocaleDateString()}
                  </span>
                </div>
              ) : (
                <span className="text-sm text-gray-400">No due date</span>
              )}
            </div>

            {/* Created */}
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                Created
              </label>
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {new Date(task.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {activeTab === "comments" && (
          <div className="flex flex-col h-full">
            <div className="flex-1 p-4 space-y-3">
              {comments.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">
                  No comments yet
                </p>
              )}
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="bg-gray-50 dark:bg-gray-800 rounded-md p-3"
                >
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {comment.content}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {new Date(comment.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-gray-200 dark:border-gray-800">
              <div className="flex gap-2">
                <input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAddComment();
                    }
                  }}
                  placeholder="Add a comment..."
                  className="flex-1 text-sm px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
                />
                <Button
                  size="sm"
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || isSubmitting}
                >
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "subtasks" && (
          <div className="p-4">
            {subtasks.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                No subtasks
              </p>
            ) : (
              <div className="space-y-2">
                {subtasks.map((sub) => {
                  const statusCfg = STATUS_OPTIONS.find((s) => s.value === sub.status) || STATUS_OPTIONS[0];
                  const Icon = statusCfg.icon;
                  return (
                    <div
                      key={sub.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <Icon className={cn("w-3.5 h-3.5", statusCfg.color)} />
                      <span
                        className={cn(
                          "text-sm text-gray-900 dark:text-gray-100",
                          sub.status === "done" &&
                            "line-through text-gray-400 dark:text-gray-500"
                        )}
                      >
                        {sub.title}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
