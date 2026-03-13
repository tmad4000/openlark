"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  List,
  Kanban,
  CheckSquare,
  Calendar,
  User,
  AlertCircle,
  MoreHorizontal,
  Trash2,
  X,
  ChevronRight,
  ChevronDown,
  Send,
  GripVertical,
  ArrowUpDown,
  Clock,
  Flag,
  Link,
  Ban,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";

// Types
type ViewMode = "list" | "kanban";
type TaskTab = "all" | "my";
type TaskStatus = "todo" | "in_progress" | "done";
type TaskPriority = "none" | "low" | "medium" | "high" | "urgent";
type SortField = "created" | "due_date" | "priority" | "title";
type SortDir = "asc" | "desc";

interface TaskData {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeIds: string[];
  creatorId: string;
  dueDate: string | null;
  startDate: string | null;
  parentTaskId: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  content: string;
  createdAt: string;
  userName: string | null;
}

type DepType = "fs" | "ss" | "ff" | "sf";

interface TaskDependencyInfo {
  taskId: string;
  dependsOnTaskId: string;
  type: DepType;
  dependsOnTitle?: string;
  dependsOnStatus?: TaskStatus;
  blockedTitle?: string;
  blockedStatus?: TaskStatus;
}

interface SubtaskNode extends TaskData {
  children: SubtaskNode[];
}

// Constants
const STATUS_CONFIG: Record<
  TaskStatus,
  { label: string; color: string; bgColor: string; dotColor: string }
> = {
  todo: {
    label: "Todo",
    color: "text-gray-600",
    bgColor: "bg-gray-100",
    dotColor: "bg-gray-400",
  },
  in_progress: {
    label: "In Progress",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    dotColor: "bg-blue-500",
  },
  done: {
    label: "Done",
    color: "text-green-600",
    bgColor: "bg-green-50",
    dotColor: "bg-green-500",
  },
};

const PRIORITY_CONFIG: Record<
  TaskPriority,
  { label: string; color: string; icon: string }
> = {
  none: { label: "None", color: "text-gray-400", icon: "" },
  low: { label: "Low", color: "text-blue-500", icon: "↓" },
  medium: { label: "Medium", color: "text-yellow-500", icon: "→" },
  high: { label: "High", color: "text-orange-500", icon: "↑" },
  urgent: { label: "Urgent", color: "text-red-500", icon: "⚡" },
};

const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done"];
const PRIORITY_ORDER: TaskPriority[] = [
  "urgent",
  "high",
  "medium",
  "low",
  "none",
];

const DEP_TYPE_LABELS: Record<DepType, string> = {
  fs: "Finish to Start",
  ss: "Start to Start",
  ff: "Finish to Finish",
  sf: "Start to Finish",
};

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays === -1) return "Tomorrow";
  if (diffDays < 0 && diffDays > -7) return `In ${Math.abs(diffDays)} days`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function isOverdue(dateString: string | null, status: TaskStatus): boolean {
  if (!dateString || status === "done") return false;
  return new Date(dateString) < new Date();
}

// Droppable Column Component
function KanbanColumn({
  status,
  children,
  count,
}: {
  status: TaskStatus;
  children: React.ReactNode;
  count: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const config = STATUS_CONFIG[status];

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-[300px] w-[300px] rounded-lg ${
        isOver ? "bg-blue-50 ring-2 ring-blue-200" : "bg-gray-50"
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 font-medium text-sm">
        <span
          className={`w-2 h-2 rounded-full ${config.dotColor}`}
        />
        <span className={config.color}>{config.label}</span>
        <span className="text-gray-400 text-xs ml-1">{count}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-[100px]">
        {children}
      </div>
    </div>
  );
}

// Draggable Card Component
function KanbanCard({
  task,
  onClick,
}: {
  task: TaskData;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id });
  const priorityCfg = PRIORITY_CONFIG[task.priority];
  const overdue = isOverdue(task.dueDate, task.status);

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-lg border border-gray-200 p-3 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all ${
        isDragging ? "opacity-50 shadow-lg" : ""
      }`}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <button
          {...listeners}
          {...attributes}
          className="mt-0.5 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={14} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {task.title}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {task.priority !== "none" && (
              <span
                className={`text-xs ${priorityCfg.color} font-medium`}
              >
                {priorityCfg.icon} {priorityCfg.label}
              </span>
            )}
            {task.dueDate && (
              <span
                className={`text-xs flex items-center gap-1 ${
                  overdue ? "text-red-500" : "text-gray-500"
                }`}
              >
                <Calendar size={11} />
                {formatDate(task.dueDate)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Subtask Tree Component - renders nested subtasks with checkboxes
function SubtaskTree({
  subtasks,
  depth,
  token,
  onToggle,
  onSelect,
}: {
  subtasks: SubtaskNode[];
  depth: number;
  token: string;
  onToggle: (id: string, currentStatus: TaskStatus) => void;
  onSelect: (task: SubtaskNode) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (subtasks.length === 0) return null;

  return (
    <div className={depth > 0 ? "ml-5 border-l border-gray-100" : ""}>
      {subtasks.map((st) => {
        const hasChildren = st.children && st.children.length > 0;
        const isCollapsed = collapsed[st.id] ?? false;
        return (
          <div key={st.id}>
            <div className="flex items-center gap-1.5 py-1 pl-1 pr-1 rounded hover:bg-gray-50 group">
              {hasChildren ? (
                <button
                  onClick={() =>
                    setCollapsed((p) => ({ ...p, [st.id]: !isCollapsed }))
                  }
                  className="p-0.5 text-gray-400 hover:text-gray-600"
                >
                  {isCollapsed ? (
                    <ChevronRight size={12} />
                  ) : (
                    <ChevronDown size={12} />
                  )}
                </button>
              ) : (
                <span className="w-4" />
              )}
              <button
                onClick={() =>
                  onToggle(st.id, st.status)
                }
                className={`flex-shrink-0 w-3.5 h-3.5 rounded border-2 flex items-center justify-center ${
                  st.status === "done"
                    ? "border-green-500 bg-green-500 text-white"
                    : "border-gray-300 hover:border-blue-400"
                }`}
              >
                {st.status === "done" && (
                  <svg width="7" height="5" viewBox="0 0 8 6" fill="none">
                    <path
                      d="M1 3L3 5L7 1"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
              <span
                onClick={() => onSelect(st)}
                className={`text-sm cursor-pointer flex-1 truncate ${
                  st.status === "done"
                    ? "line-through text-gray-400"
                    : "text-gray-700"
                }`}
              >
                {st.title}
              </span>
            </div>
            {hasChildren && !isCollapsed && depth < 5 && (
              <SubtaskTree
                subtasks={st.children}
                depth={depth + 1}
                token={token}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Task Detail Panel Component
function TaskDetailPanel({
  task,
  token,
  allTasks,
  onClose,
  onUpdate,
  onDelete,
  onTaskCreated,
}: {
  task: TaskData;
  token: string;
  allTasks: TaskData[];
  onClose: () => void;
  onUpdate: (updated: TaskData) => void;
  onDelete: (id: string) => void;
  onTaskCreated: (task: TaskData) => void;
}) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [subtasks, setSubtasks] = useState<SubtaskNode[]>([]);
  const [newComment, setNewComment] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(task.title);
  const [descValue, setDescValue] = useState(task.description || "");
  const [editingDesc, setEditingDesc] = useState(false);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [activeTab, setActiveTab] = useState<"details" | "dependencies">("details");
  const [blockedBy, setBlockedBy] = useState<TaskDependencyInfo[]>([]);
  const [blocking, setBlocking] = useState<TaskDependencyInfo[]>([]);
  const [addingDep, setAddingDep] = useState(false);
  const [depSearchQuery, setDepSearchQuery] = useState("");
  const [depType, setDepType] = useState<DepType>("fs");
  const titleRef = useRef<HTMLInputElement>(null);
  const subtaskInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitleValue(task.title);
    setDescValue(task.description || "");
    setAddingSubtask(false);
    setNewSubtaskTitle("");
  }, [task]);

  useEffect(() => {
    fetchComments();
    fetchSubtasks();
    fetchDependencies();
  }, [task.id]);

  useEffect(() => {
    if (editingTitle) titleRef.current?.focus();
  }, [editingTitle]);

  useEffect(() => {
    if (addingSubtask) subtaskInputRef.current?.focus();
  }, [addingSubtask]);

  const fetchComments = async () => {
    try {
      const res = await fetch(`/api/tasks/${task.id}/comments?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments || []);
      }
    } catch {
      /* ignore */
    }
  };

  const fetchSubtasks = async () => {
    try {
      const res = await fetch(`/api/tasks/${task.id}/subtasks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSubtasks(data.subtasks || []);
      }
    } catch {
      /* ignore */
    }
  };

  const fetchDependencies = async () => {
    try {
      const res = await fetch(`/api/tasks/${task.id}/dependencies`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBlockedBy(data.blockedBy || []);
        setBlocking(data.blocking || []);
      }
    } catch {
      /* ignore */
    }
  };

  const updateField = async (field: string, value: unknown) => {
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) {
        const data = await res.json();
        onUpdate(data.task);
      }
    } catch {
      /* ignore */
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      const res = await fetch(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: newComment.trim() }),
      });
      if (res.ok) {
        setNewComment("");
        fetchComments();
      }
    } catch {
      /* ignore */
    }
  };

  const handleDeleteTask = async () => {
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        onDelete(task.id);
        onClose();
      }
    } catch {
      /* ignore */
    }
  };

  const handleTitleSave = () => {
    setEditingTitle(false);
    if (titleValue.trim() && titleValue.trim() !== task.title) {
      updateField("title", titleValue.trim());
    } else {
      setTitleValue(task.title);
    }
  };

  const handleDescSave = () => {
    setEditingDesc(false);
    if (descValue !== (task.description || "")) {
      updateField("description", descValue || null);
    }
  };

  const handleAddSubtask = async () => {
    if (!newSubtaskTitle.trim()) return;
    try {
      const res = await fetch(`/api/tasks/${task.id}/subtasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: newSubtaskTitle.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewSubtaskTitle("");
        onTaskCreated(data.task);
        fetchSubtasks();
        subtaskInputRef.current?.focus();
      }
    } catch {
      /* ignore */
    }
  };

  const handleToggleSubtask = async (id: string, currentStatus: TaskStatus) => {
    const newStatus = currentStatus === "done" ? "todo" : "done";
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        onUpdate(data.task);
        fetchSubtasks();
      }
    } catch {
      /* ignore */
    }
  };

  const handleAddDependency = async (dependsOnId: string) => {
    try {
      const res = await fetch(`/api/tasks/${task.id}/dependencies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ depends_on_task_id: dependsOnId, type: depType }),
      });
      if (res.ok) {
        setAddingDep(false);
        setDepSearchQuery("");
        setDepType("fs");
        fetchDependencies();
      }
    } catch {
      /* ignore */
    }
  };

  const handleRemoveDependency = async (dependsOnId: string) => {
    try {
      const res = await fetch(`/api/tasks/${task.id}/dependencies/${dependsOnId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchDependencies();
      }
    } catch {
      /* ignore */
    }
  };

  // Count all subtasks recursively
  const countSubtasks = (nodes: SubtaskNode[]): number => {
    let count = 0;
    for (const n of nodes) {
      count += 1 + countSubtasks(n.children);
    }
    return count;
  };

  const totalSubtasks = countSubtasks(subtasks);

  // Filter tasks for dependency picker (exclude self and already-depended)
  const existingDepIds = new Set(blockedBy.map((d) => d.dependsOnTaskId));
  const depCandidates = allTasks.filter(
    (t) =>
      t.id !== task.id &&
      !existingDepIds.has(t.id) &&
      t.title.toLowerCase().includes(depSearchQuery.toLowerCase())
  );

  // Check if blocked
  const isBlocked = blockedBy.some((d) => d.dependsOnStatus !== "done");
  const blockingTaskNames = blockedBy
    .filter((d) => d.dependsOnStatus !== "done")
    .map((d) => d.dependsOnTitle)
    .filter(Boolean);

  return (
    <div className="w-[420px] border-l border-gray-200 bg-white flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <span className="text-sm font-medium text-gray-500">Task Details</span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleDeleteTask}
            className="p-1.5 text-gray-400 hover:text-red-500 rounded"
          >
            <Trash2 size={15} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 px-4">
        <button
          onClick={() => setActiveTab("details")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === "details"
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Details
        </button>
        <button
          onClick={() => setActiveTab("dependencies")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 ${
            activeTab === "dependencies"
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Link size={13} />
          Dependencies
          {blockedBy.length + blocking.length > 0 && (
            <span className="text-xs bg-gray-100 text-gray-600 px-1.5 rounded-full">
              {blockedBy.length + blocking.length}
            </span>
          )}
        </button>
      </div>

      {/* Blocked indicator */}
      {isBlocked && (
        <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          <Ban size={13} className="flex-shrink-0" />
          <span>
            Blocked by{" "}
            {blockingTaskNames.map((name, i) => (
              <span key={i}>
                {i > 0 && ", "}
                <strong>{name}</strong>
              </span>
            ))}
          </span>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === "details" ? (
          <>
            {/* Title */}
            {editingTitle ? (
              <input
                ref={titleRef}
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTitleSave();
                  if (e.key === "Escape") {
                    setTitleValue(task.title);
                    setEditingTitle(false);
                  }
                }}
                className="text-lg font-semibold text-gray-900 w-full border-b-2 border-blue-500 outline-none pb-1"
              />
            ) : (
              <h2
                onClick={() => setEditingTitle(true)}
                className="text-lg font-semibold text-gray-900 cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1"
              >
                {task.title}
              </h2>
            )}

            {/* Status */}
            <div className="grid grid-cols-[100px_1fr] gap-2 items-center text-sm">
              <span className="text-gray-500">Status</span>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${STATUS_CONFIG[task.status].bgColor} ${STATUS_CONFIG[task.status].color}`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[task.status].dotColor}`}
                    />
                    {STATUS_CONFIG[task.status].label}
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px] z-50">
                    {STATUS_ORDER.map((s) => (
                      <DropdownMenu.Item
                        key={s}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer outline-none"
                        onSelect={() => updateField("status", s)}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[s].dotColor}`}
                        />
                        {STATUS_CONFIG[s].label}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>

              {/* Priority */}
              <span className="text-gray-500">Priority</span>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${PRIORITY_CONFIG[task.priority].color} bg-gray-50 hover:bg-gray-100`}
                  >
                    {PRIORITY_CONFIG[task.priority].icon}{" "}
                    {PRIORITY_CONFIG[task.priority].label}
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px] z-50">
                    {PRIORITY_ORDER.map((p) => (
                      <DropdownMenu.Item
                        key={p}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer outline-none"
                        onSelect={() => updateField("priority", p)}
                      >
                        <span className={PRIORITY_CONFIG[p].color}>
                          {PRIORITY_CONFIG[p].icon || "—"}
                        </span>
                        {PRIORITY_CONFIG[p].label}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>

              {/* Due date */}
              <span className="text-gray-500">Due date</span>
              <input
                type="date"
                value={
                  task.dueDate
                    ? new Date(task.dueDate).toISOString().split("T")[0]
                    : ""
                }
                onChange={(e) =>
                  updateField(
                    "due_date",
                    e.target.value ? e.target.value : null
                  )
                }
                className={`text-xs px-2 py-1 rounded border border-gray-200 w-fit ${
                  isOverdue(task.dueDate, task.status)
                    ? "text-red-500"
                    : "text-gray-700"
                }`}
              />

              {/* Created */}
              <span className="text-gray-500">Created</span>
              <span className="text-xs text-gray-600">
                {formatDate(task.createdAt)}
              </span>
            </div>

            {/* Description */}
            <div>
              <span className="text-sm text-gray-500 block mb-1">Description</span>
              {editingDesc ? (
                <textarea
                  value={descValue}
                  onChange={(e) => setDescValue(e.target.value)}
                  onBlur={handleDescSave}
                  autoFocus
                  rows={4}
                  className="w-full text-sm border border-gray-200 rounded-lg p-2 outline-none focus:border-blue-400"
                  placeholder="Add a description..."
                />
              ) : (
                <div
                  onClick={() => setEditingDesc(true)}
                  className="text-sm text-gray-700 cursor-pointer hover:bg-gray-50 rounded p-2 -mx-2 min-h-[40px]"
                >
                  {task.description || (
                    <span className="text-gray-400">Add a description...</span>
                  )}
                </div>
              )}
            </div>

            {/* Subtasks */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-500">
                  Subtasks ({totalSubtasks})
                </span>
                <button
                  onClick={() => setAddingSubtask(true)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 px-1.5 py-0.5 rounded hover:bg-blue-50"
                >
                  <Plus size={12} />
                  Add subtask
                </button>
              </div>
              {addingSubtask && (
                <div className="flex items-center gap-1.5 mb-2">
                  <input
                    ref={subtaskInputRef}
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddSubtask();
                      if (e.key === "Escape") {
                        setAddingSubtask(false);
                        setNewSubtaskTitle("");
                      }
                    }}
                    placeholder="Subtask title..."
                    className="flex-1 text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400"
                  />
                  <button
                    onClick={handleAddSubtask}
                    disabled={!newSubtaskTitle.trim()}
                    className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => {
                      setAddingSubtask(false);
                      setNewSubtaskTitle("");
                    }}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
              {subtasks.length > 0 ? (
                <SubtaskTree
                  subtasks={subtasks}
                  depth={0}
                  token={token}
                  onToggle={handleToggleSubtask}
                  onSelect={() => {}}
                />
              ) : (
                !addingSubtask && (
                  <p className="text-xs text-gray-400">No subtasks</p>
                )
              )}
            </div>

            {/* Comments */}
            <div>
              <span className="text-sm text-gray-500 block mb-2">
                Comments ({comments.length})
              </span>
              <div className="space-y-3">
                {comments.map((c) => (
                  <div key={c.id} className="text-sm">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-gray-800">
                        {c.userName || "User"}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatDate(c.createdAt)}
                      </span>
                    </div>
                    <p className="text-gray-600">{c.content}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddComment();
                  }}
                  placeholder="Add a comment..."
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-blue-400"
                />
                <button
                  onClick={handleAddComment}
                  disabled={!newComment.trim()}
                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded disabled:text-gray-300"
                >
                  <Send size={15} />
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Dependencies Tab */
          <>
            {/* Blocked by */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  Blocked by ({blockedBy.length})
                </span>
                <button
                  onClick={() => setAddingDep(true)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 px-1.5 py-0.5 rounded hover:bg-blue-50"
                >
                  <Plus size={12} />
                  Add dependency
                </button>
              </div>
              {addingDep && (
                <div className="mb-3 p-2 border border-gray-200 rounded-lg space-y-2">
                  <input
                    value={depSearchQuery}
                    onChange={(e) => setDepSearchQuery(e.target.value)}
                    placeholder="Search tasks..."
                    autoFocus
                    className="w-full text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400"
                  />
                  <select
                    value={depType}
                    onChange={(e) => setDepType(e.target.value as DepType)}
                    className="text-xs border border-gray-200 rounded px-2 py-1 w-full"
                  >
                    {(Object.keys(DEP_TYPE_LABELS) as DepType[]).map((t) => (
                      <option key={t} value={t}>
                        {DEP_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  <div className="max-h-[150px] overflow-y-auto space-y-0.5">
                    {depCandidates.slice(0, 20).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => handleAddDependency(t.id)}
                        className="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-50 rounded flex items-center gap-2"
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[t.status].dotColor}`}
                        />
                        <span className="truncate">{t.title}</span>
                      </button>
                    ))}
                    {depCandidates.length === 0 && (
                      <p className="text-xs text-gray-400 px-2 py-1">
                        No matching tasks
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setAddingDep(false);
                      setDepSearchQuery("");
                    }}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              )}
              {blockedBy.length > 0 ? (
                <div className="space-y-1">
                  {blockedBy.map((dep) => (
                    <div
                      key={dep.dependsOnTaskId}
                      className="flex items-center gap-2 text-sm p-1.5 rounded hover:bg-gray-50 group"
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          dep.dependsOnStatus
                            ? STATUS_CONFIG[dep.dependsOnStatus].dotColor
                            : "bg-gray-400"
                        }`}
                      />
                      <span className="flex-1 truncate text-gray-700">
                        {dep.dependsOnTitle}
                      </span>
                      <span className="text-[10px] text-gray-400 uppercase">
                        {dep.type}
                      </span>
                      <button
                        onClick={() => handleRemoveDependency(dep.dependsOnTaskId)}
                        className="p-0.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                !addingDep && (
                  <p className="text-xs text-gray-400">No dependencies</p>
                )
              )}
            </div>

            {/* Blocking others */}
            <div>
              <span className="text-sm font-medium text-gray-700 block mb-2">
                Blocking ({blocking.length})
              </span>
              {blocking.length > 0 ? (
                <div className="space-y-1">
                  {blocking.map((dep) => (
                    <div
                      key={dep.taskId}
                      className="flex items-center gap-2 text-sm p-1.5 rounded hover:bg-gray-50"
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          dep.blockedStatus
                            ? STATUS_CONFIG[dep.blockedStatus].dotColor
                            : "bg-gray-400"
                        }`}
                      />
                      <span className="flex-1 truncate text-gray-700">
                        {dep.blockedTitle}
                      </span>
                      <span className="text-[10px] text-gray-400 uppercase">
                        {dep.type}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">
                  This task is not blocking any other tasks
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Inline Create Form
function InlineCreateForm({
  token,
  onCreate,
  onCancel,
}: {
  token: string;
  onCreate: (task: TaskData) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("none");
  const [dueDate, setDueDate] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    try {
      const body: Record<string, unknown> = { title: title.trim() };
      if (priority !== "none") body.priority = priority;
      if (dueDate) body.due_date = dueDate;

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        onCreate(data.task);
        setTitle("");
        setPriority("none");
        setDueDate("");
        inputRef.current?.focus();
      }
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Task title..."
        className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400"
      />
      <select
        value={priority}
        onChange={(e) => setPriority(e.target.value as TaskPriority)}
        className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white"
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
        className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white"
      />
      <button
        onClick={handleSubmit}
        disabled={!title.trim()}
        className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300"
      >
        Add
      </button>
      <button
        onClick={onCancel}
        className="p-1 text-gray-400 hover:text-gray-600"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// Main Page Component
export default function TasksPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [tab, setTab] = useState<TaskTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskData | null>(null);
  const [sortField, setSortField] = useState<SortField>("created");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [draggedTask, setDraggedTask] = useState<TaskData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    const sessionToken = getCookie("session_token");
    if (!sessionToken) {
      router.push("/login");
      return;
    }
    setToken(sessionToken);
    fetchCurrentUser(sessionToken);
    fetchTasks(sessionToken);
  }, []);

  const fetchCurrentUser = async (sessionToken: string) => {
    try {
      const res = await fetch("/api/users/me", {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUserId(data.user?.id || null);
      }
    } catch {
      /* ignore */
    }
  };

  const fetchTasks = useCallback(
    async (sessionToken: string) => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/tasks?limit=100", {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          setTasks(data.tasks || []);
        }
      } catch {
        /* ignore */
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Filter tasks
  const filteredTasks = tasks
    .filter((t) => {
      if (tab === "my" && currentUserId) {
        return t.assigneeIds.includes(currentUserId) || t.creatorId === currentUserId;
      }
      return true;
    })
    .filter((t) => {
      if (!searchQuery) return true;
      return t.title.toLowerCase().includes(searchQuery.toLowerCase());
    });

  // Sort tasks
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case "title":
        cmp = a.title.localeCompare(b.title);
        break;
      case "priority": {
        const pi = PRIORITY_ORDER;
        cmp = pi.indexOf(a.priority) - pi.indexOf(b.priority);
        break;
      }
      case "due_date": {
        const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        cmp = ad - bd;
        break;
      }
      default:
        cmp =
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        break;
    }
    return sortDir === "desc" ? -cmp : cmp;
  });

  // Group tasks by status for kanban
  const tasksByStatus: Record<TaskStatus, TaskData[]> = {
    todo: [],
    in_progress: [],
    done: [],
  };
  sortedTasks.forEach((t) => {
    tasksByStatus[t.status]?.push(t);
  });

  const handleTaskCreate = (task: TaskData) => {
    setTasks((prev) => [task, ...prev]);
  };

  const handleTaskUpdate = (updated: TaskData) => {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    if (selectedTask?.id === updated.id) setSelectedTask(updated);
  };

  const handleTaskDelete = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (selectedTask?.id === id) setSelectedTask(null);
  };

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        handleTaskUpdate(data.task);
      }
    } catch {
      /* ignore */
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) setDraggedTask(task);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedTask(null);
    const { active, over } = event;
    if (!over) return;
    const taskId = active.id as string;
    const newStatus = over.id as TaskStatus;
    const task = tasks.find((t) => t.id === taskId);
    if (task && task.status !== newStatus && STATUS_ORDER.includes(newStatus)) {
      // Optimistic update
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: newStatus } : t
        )
      );
      handleStatusChange(taskId, newStatus);
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  return (
    <div className="flex h-full bg-white">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-semibold text-gray-900">Tasks</h1>
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
            >
              <Plus size={15} />
              New Task
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Tabs */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setTab("all")}
                className={`px-3 py-1 text-sm rounded-md ${
                  tab === "all"
                    ? "bg-white text-gray-900 shadow-sm font-medium"
                    : "text-gray-600 hover:text-gray-800"
                }`}
              >
                All Tasks
              </button>
              <button
                onClick={() => setTab("my")}
                className={`px-3 py-1 text-sm rounded-md ${
                  tab === "my"
                    ? "bg-white text-gray-900 shadow-sm font-medium"
                    : "text-gray-600 hover:text-gray-800"
                }`}
              >
                My Tasks
              </button>
            </div>

            {/* Search */}
            <div className="relative flex-1 max-w-xs">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400"
              />
            </div>

            <div className="flex-1" />

            {/* View toggle */}
            <div className="flex items-center gap-0.5 border border-gray-200 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded ${
                  viewMode === "list"
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-400 hover:text-gray-600"
                }`}
                title="List view"
              >
                <List size={16} />
              </button>
              <button
                onClick={() => setViewMode("kanban")}
                className={`p-1.5 rounded ${
                  viewMode === "kanban"
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-400 hover:text-gray-600"
                }`}
                title="Kanban view"
              >
                <Kanban size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Create Form */}
        {showCreateForm && token && (
          <div className="px-6 pt-3">
            <InlineCreateForm
              token={token}
              onCreate={handleTaskCreate}
              onCancel={() => setShowCreateForm(false)}
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : sortedTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <CheckSquare size={48} className="text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium mb-1">No tasks yet</p>
              <p className="text-gray-400 text-sm mb-4">
                Create your first task to get started
              </p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
              >
                <Plus size={15} />
                New Task
              </button>
            </div>
          ) : viewMode === "list" ? (
            /* List View */
            <div className="px-6">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="py-2 pr-4">
                      <button
                        onClick={() => toggleSort("title")}
                        className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase hover:text-gray-700"
                      >
                        Title
                        {sortField === "title" && (
                          <ArrowUpDown size={12} />
                        )}
                      </button>
                    </th>
                    <th className="py-2 pr-4 w-[120px]">
                      <span className="text-xs font-medium text-gray-500 uppercase">
                        Status
                      </span>
                    </th>
                    <th className="py-2 pr-4 w-[100px]">
                      <button
                        onClick={() => toggleSort("priority")}
                        className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase hover:text-gray-700"
                      >
                        Priority
                        {sortField === "priority" && (
                          <ArrowUpDown size={12} />
                        )}
                      </button>
                    </th>
                    <th className="py-2 pr-4 w-[100px]">
                      <span className="text-xs font-medium text-gray-500 uppercase">
                        Assignee
                      </span>
                    </th>
                    <th className="py-2 w-[110px]">
                      <button
                        onClick={() => toggleSort("due_date")}
                        className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase hover:text-gray-700"
                      >
                        Due Date
                        {sortField === "due_date" && (
                          <ArrowUpDown size={12} />
                        )}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTasks.map((task) => {
                    const statusCfg = STATUS_CONFIG[task.status];
                    const priorityCfg = PRIORITY_CONFIG[task.priority];
                    const overdue = isOverdue(task.dueDate, task.status);

                    return (
                      <tr
                        key={task.id}
                        onClick={() => setSelectedTask(task)}
                        className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                          selectedTask?.id === task.id ? "bg-blue-50" : ""
                        }`}
                      >
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusChange(
                                  task.id,
                                  task.status === "done" ? "todo" : "done"
                                );
                              }}
                              className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center ${
                                task.status === "done"
                                  ? "border-green-500 bg-green-500 text-white"
                                  : "border-gray-300 hover:border-blue-400"
                              }`}
                            >
                              {task.status === "done" && (
                                <svg
                                  width="8"
                                  height="6"
                                  viewBox="0 0 8 6"
                                  fill="none"
                                >
                                  <path
                                    d="M1 3L3 5L7 1"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              )}
                            </button>
                            <span
                              className={`text-sm ${
                                task.status === "done"
                                  ? "line-through text-gray-400"
                                  : "text-gray-900"
                              }`}
                            >
                              {task.title}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4">
                          <span
                            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${statusCfg.bgColor} ${statusCfg.color}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${statusCfg.dotColor}`}
                            />
                            {statusCfg.label}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4">
                          {task.priority !== "none" && (
                            <span
                              className={`text-xs font-medium ${priorityCfg.color}`}
                            >
                              {priorityCfg.icon} {priorityCfg.label}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4">
                          {task.assigneeIds.length > 0 && (
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <User size={12} />
                              {task.assigneeIds.length}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5">
                          {task.dueDate && (
                            <span
                              className={`text-xs flex items-center gap-1 ${
                                overdue ? "text-red-500 font-medium" : "text-gray-500"
                              }`}
                            >
                              <Calendar size={11} />
                              {formatDate(task.dueDate)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Kanban View */
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="flex gap-4 p-6 overflow-x-auto h-full">
                {STATUS_ORDER.map((status) => (
                  <KanbanColumn
                    key={status}
                    status={status}
                    count={tasksByStatus[status].length}
                  >
                    {tasksByStatus[status].map((task) => (
                      <KanbanCard
                        key={task.id}
                        task={task}
                        onClick={() => setSelectedTask(task)}
                      />
                    ))}
                  </KanbanColumn>
                ))}
              </div>
              <DragOverlay>
                {draggedTask ? (
                  <div className="bg-white rounded-lg border border-blue-300 p-3 shadow-lg w-[280px]">
                    <p className="text-sm font-medium text-gray-900">
                      {draggedTask.title}
                    </p>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </div>

      {/* Detail Panel */}
      {selectedTask && token && (
        <TaskDetailPanel
          task={selectedTask}
          token={token}
          allTasks={tasks}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleTaskUpdate}
          onDelete={handleTaskDelete}
          onTaskCreated={handleTaskCreate}
        />
      )}
    </div>
  );
}
