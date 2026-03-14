"use client";

import { cn } from "@/lib/utils";
import type { Task } from "@/lib/api";
import {
  ArrowUp,
  ArrowDown,
  Minus,
  AlertTriangle,
  Flame,
  Circle,
  Clock,
  CheckCircle2,
  Calendar as CalendarIcon,
  User,
} from "lucide-react";

interface TaskListViewProps {
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  selectedTaskId?: string | null;
  sortField: string;
  sortOrder: "asc" | "desc";
  onSort: (field: string) => void;
}

const STATUS_CONFIG = {
  todo: { label: "Todo", icon: Circle, color: "text-gray-400" },
  in_progress: { label: "In Progress", icon: Clock, color: "text-blue-500" },
  done: { label: "Done", icon: CheckCircle2, color: "text-green-500" },
} as const;

const PRIORITY_CONFIG = {
  none: { label: "None", icon: Minus, color: "text-gray-300" },
  low: { label: "Low", icon: ArrowDown, color: "text-blue-400" },
  medium: { label: "Medium", icon: Minus, color: "text-yellow-500" },
  high: { label: "High", icon: ArrowUp, color: "text-orange-500" },
  urgent: { label: "Urgent", icon: Flame, color: "text-red-500" },
} as const;

function SortHeader({
  label,
  field,
  currentSort,
  currentOrder,
  onSort,
  className,
}: {
  label: string;
  field: string;
  currentSort: string;
  currentOrder: "asc" | "desc";
  onSort: (field: string) => void;
  className?: string;
}) {
  const isActive = currentSort === field;
  return (
    <button
      onClick={() => onSort(field)}
      className={cn(
        "flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 uppercase tracking-wider",
        isActive && "text-gray-900 dark:text-gray-100",
        className
      )}
    >
      {label}
      {isActive && (
        <span className="text-[10px]">{currentOrder === "asc" ? "\u25B2" : "\u25BC"}</span>
      )}
    </button>
  );
}

export function TaskListView({
  tasks,
  onSelectTask,
  selectedTaskId,
  sortField,
  sortOrder,
  onSort,
}: TaskListViewProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-500">No tasks found</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full">
        <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 z-10">
          <tr>
            <th className="text-left px-4 py-2 w-8">
              <SortHeader label="Status" field="status" currentSort={sortField} currentOrder={sortOrder} onSort={onSort} />
            </th>
            <th className="text-left px-4 py-2">
              <SortHeader label="Title" field="title" currentSort={sortField} currentOrder={sortOrder} onSort={onSort} />
            </th>
            <th className="text-left px-4 py-2 w-24">
              <SortHeader label="Priority" field="priority" currentSort={sortField} currentOrder={sortOrder} onSort={onSort} />
            </th>
            <th className="text-left px-4 py-2 w-32">
              <SortHeader label="Assignee" field="assignee" currentSort={sortField} currentOrder={sortOrder} onSort={onSort} />
            </th>
            <th className="text-left px-4 py-2 w-32">
              <SortHeader label="Due Date" field="dueDate" currentSort={sortField} currentOrder={sortOrder} onSort={onSort} />
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const statusCfg = STATUS_CONFIG[task.status];
            const priorityCfg = PRIORITY_CONFIG[task.priority];
            const StatusIcon = statusCfg.icon;
            const PriorityIcon = priorityCfg.icon;
            const isOverdue =
              task.dueDate &&
              task.status !== "done" &&
              new Date(task.dueDate) < new Date();

            return (
              <tr
                key={task.id}
                onClick={() => onSelectTask(task)}
                className={cn(
                  "border-b border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors",
                  selectedTaskId === task.id && "bg-blue-50 dark:bg-blue-950/20"
                )}
              >
                <td className="px-4 py-2.5">
                  <StatusIcon className={cn("w-4 h-4", statusCfg.color)} />
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={cn(
                      "text-sm text-gray-900 dark:text-gray-100",
                      task.status === "done" && "line-through text-gray-400 dark:text-gray-500"
                    )}
                  >
                    {task.title}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <PriorityIcon className={cn("w-3.5 h-3.5", priorityCfg.color)} />
                    <span className="text-xs text-gray-500">{priorityCfg.label}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  {task.assigneeIds.length > 0 ? (
                    <div className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-xs text-gray-500">
                        {task.assigneeIds.length} assigned
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-300">--</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {task.dueDate ? (
                    <div className="flex items-center gap-1">
                      <CalendarIcon
                        className={cn(
                          "w-3.5 h-3.5",
                          isOverdue ? "text-red-500" : "text-gray-400"
                        )}
                      />
                      <span
                        className={cn(
                          "text-xs",
                          isOverdue
                            ? "text-red-500 font-medium"
                            : "text-gray-500"
                        )}
                      >
                        {new Date(task.dueDate).toLocaleDateString()}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-300">--</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
