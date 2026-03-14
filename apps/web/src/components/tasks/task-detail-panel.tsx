"use client";

import { useState, useEffect, useCallback } from "react";
import { api, type Task, type TaskComment, type TaskDependency } from "@/lib/api";
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
  Plus,
  Link,
  AlertTriangle,
  Square,
  CheckSquare,
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

const MAX_NESTING_DEPTH = 5;

interface SubtaskTreeItem {
  task: Task;
  depth: number;
  children: SubtaskTreeItem[];
}

function buildSubtaskTree(allTasks: Task[], parentId: string, depth: number): SubtaskTreeItem[] {
  if (depth >= MAX_NESTING_DEPTH) return [];
  const children = allTasks.filter((t) => t.parentTaskId === parentId);
  return children.map((child) => ({
    task: child,
    depth,
    children: buildSubtaskTree(allTasks, child.id, depth + 1),
  }));
}

function SubtaskRow({
  item,
  onToggle,
  allTasks,
}: {
  item: SubtaskTreeItem;
  onToggle: (taskId: string, currentStatus: Task["status"]) => void;
  allTasks: Task[];
}) {
  const isDone = item.task.status === "done";

  return (
    <>
      <div
        className="flex items-center gap-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
        style={{ paddingLeft: `${item.depth * 20 + 8}px` }}
      >
        <button
          onClick={() => onToggle(item.task.id, item.task.status)}
          className="flex-shrink-0"
        >
          {isDone ? (
            <CheckSquare className="w-4 h-4 text-green-500" />
          ) : (
            <Square className="w-4 h-4 text-gray-400 hover:text-gray-600" />
          )}
        </button>
        <span
          className={cn(
            "text-sm text-gray-900 dark:text-gray-100",
            isDone && "line-through text-gray-400 dark:text-gray-500"
          )}
        >
          {item.task.title}
        </span>
      </div>
      {item.children.map((child) => (
        <SubtaskRow key={child.task.id} item={child} onToggle={onToggle} allTasks={allTasks} />
      ))}
    </>
  );
}

export function TaskDetailPanel({ task, onClose, onUpdate }: TaskDetailPanelProps) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [dependencyTasks, setDependencyTasks] = useState<Task[]>([]);
  const [newComment, setNewComment] = useState("");
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [showAddDependency, setShowAddDependency] = useState(false);
  const [depSearchQuery, setDepSearchQuery] = useState("");
  const [depSearchResults, setDepSearchResults] = useState<Task[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "comments" | "subtasks" | "dependencies">("details");

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

  const loadDependencies = useCallback(async () => {
    try {
      const res = await api.getTaskDependencies(task.id);
      setDependencies(res.dependencies);
      // Load the actual task data for each dependency
      const depTasks: Task[] = [];
      for (const dep of res.dependencies) {
        try {
          const taskRes = await api.getTask(dep.dependsOnTaskId);
          depTasks.push(taskRes.task);
        } catch {
          // ignore
        }
      }
      setDependencyTasks(depTasks);
    } catch {
      // ignore
    }
  }, [task.id]);

  useEffect(() => {
    loadComments();
    loadSubtasks();
    loadDependencies();
  }, [loadComments, loadSubtasks, loadDependencies]);

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

  const handleAddSubtask = async () => {
    if (!newSubtaskTitle.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await api.createTask({
        title: newSubtaskTitle.trim(),
        parentTaskId: task.id,
      });
      setNewSubtaskTitle("");
      setShowAddSubtask(false);
      loadSubtasks();
      onUpdate();
    } catch {
      // ignore
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubtaskToggle = async (taskId: string, currentStatus: Task["status"]) => {
    const newStatus = currentStatus === "done" ? "todo" : "done";
    try {
      await api.updateTask(taskId, { status: newStatus });
      loadSubtasks();
      onUpdate();
    } catch {
      // ignore
    }
  };

  const handleSearchDependency = async (query: string) => {
    setDepSearchQuery(query);
    if (query.trim().length < 2) {
      setDepSearchResults([]);
      return;
    }
    try {
      const res = await api.getTasks({});
      // Filter client-side: exclude self, existing deps, and parent/child tasks
      const existingDepIds = new Set(dependencies.map((d) => d.dependsOnTaskId));
      const filtered = res.tasks.filter(
        (t) =>
          t.id !== task.id &&
          !existingDepIds.has(t.id) &&
          t.title.toLowerCase().includes(query.toLowerCase())
      );
      setDepSearchResults(filtered.slice(0, 10));
    } catch {
      // ignore
    }
  };

  const handleAddDependency = async (dependsOnTaskId: string) => {
    try {
      await api.addTaskDependency(task.id, dependsOnTaskId, "fs");
      setDepSearchQuery("");
      setDepSearchResults([]);
      setShowAddDependency(false);
      loadDependencies();
    } catch {
      // ignore
    }
  };

  // Check if this task is blocked by any incomplete dependency
  const blockedByTasks = dependencyTasks.filter((t) => t.status !== "done");

  // Build tree for nested subtask display
  const subtaskTree = buildSubtaskTree(subtasks, task.id, 0);

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
        {/* Blocked indicator */}
        {blockedByTasks.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>
              Blocked by{" "}
              {blockedByTasks.map((t, i) => (
                <span key={t.id}>
                  {i > 0 && ", "}
                  <strong>{t.title}</strong>
                </span>
              ))}
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 px-4">
        {([
          { key: "details", label: "Details", icon: ListTree },
          { key: "comments", label: "Comments", icon: MessageSquare },
          { key: "subtasks", label: "Subtasks", icon: ListTree },
          { key: "dependencies", label: "Dependencies", icon: Link },
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
            {/* Add subtask button */}
            <div className="mb-3">
              {showAddSubtask ? (
                <div className="flex gap-2">
                  <input
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleAddSubtask();
                      }
                      if (e.key === "Escape") {
                        setShowAddSubtask(false);
                        setNewSubtaskTitle("");
                      }
                    }}
                    placeholder="Subtask title..."
                    autoFocus
                    className="flex-1 text-sm px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
                  />
                  <Button
                    size="sm"
                    onClick={handleAddSubtask}
                    disabled={!newSubtaskTitle.trim() || isSubmitting}
                  >
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowAddSubtask(false);
                      setNewSubtaskTitle("");
                    }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAddSubtask(true)}
                  className="w-full"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Add Subtask
                </Button>
              )}
            </div>

            {/* Subtask tree */}
            {subtaskTree.length === 0 && !showAddSubtask ? (
              <p className="text-sm text-gray-400 text-center py-4">
                No subtasks
              </p>
            ) : (
              <div className="space-y-0.5">
                {subtaskTree.map((item) => (
                  <SubtaskRow
                    key={item.task.id}
                    item={item}
                    onToggle={handleSubtaskToggle}
                    allTasks={subtasks}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "dependencies" && (
          <div className="p-4">
            {/* Add dependency */}
            <div className="mb-3">
              {showAddDependency ? (
                <div className="space-y-2">
                  <input
                    value={depSearchQuery}
                    onChange={(e) => handleSearchDependency(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setShowAddDependency(false);
                        setDepSearchQuery("");
                        setDepSearchResults([]);
                      }
                    }}
                    placeholder="Search for a task..."
                    autoFocus
                    className="w-full text-sm px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
                  />
                  {depSearchResults.length > 0 && (
                    <div className="border border-gray-200 dark:border-gray-700 rounded max-h-40 overflow-y-auto">
                      {depSearchResults.map((result) => (
                        <button
                          key={result.id}
                          onClick={() => handleAddDependency(result.id)}
                          className="w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 border-b last:border-b-0 border-gray-100 dark:border-gray-800"
                        >
                          {result.title}
                          <span className="ml-2 text-xs text-gray-400">
                            {result.status}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowAddDependency(false);
                      setDepSearchQuery("");
                      setDepSearchResults([]);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAddDependency(true)}
                  className="w-full"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Add Dependency
                </Button>
              )}
            </div>

            {/* Dependency list */}
            {dependencies.length === 0 && !showAddDependency ? (
              <p className="text-sm text-gray-400 text-center py-4">
                No dependencies
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Depends on (finish-to-start)
                </p>
                {dependencyTasks.map((depTask) => {
                  const isBlocking = depTask.status !== "done";
                  return (
                    <div
                      key={depTask.id}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded",
                        isBlocking
                          ? "bg-amber-50 dark:bg-amber-900/20"
                          : "bg-gray-50 dark:bg-gray-800"
                      )}
                    >
                      {isBlocking ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                      )}
                      <span
                        className={cn(
                          "text-sm flex-1",
                          isBlocking
                            ? "text-amber-700 dark:text-amber-300"
                            : "text-gray-500 line-through"
                        )}
                      >
                        {depTask.title}
                      </span>
                      {isBlocking && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                          BLOCKING
                        </span>
                      )}
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
