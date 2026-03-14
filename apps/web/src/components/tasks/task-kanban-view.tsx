"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { api, type Task } from "@/lib/api";
import {
  GripVertical,
  ArrowUp,
  ArrowDown,
  Minus,
  Flame,
  Calendar as CalendarIcon,
  User,
} from "lucide-react";

interface TaskKanbanViewProps {
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  onTasksChange: () => void;
}

const COLUMNS: { key: Task["status"]; label: string; color: string }[] = [
  { key: "todo", label: "Todo", color: "bg-gray-400" },
  { key: "in_progress", label: "In Progress", color: "bg-blue-500" },
  { key: "done", label: "Done", color: "bg-green-500" },
];

const PRIORITY_ICON: Record<string, typeof Minus> = {
  none: Minus,
  low: ArrowDown,
  medium: Minus,
  high: ArrowUp,
  urgent: Flame,
};

const PRIORITY_COLOR: Record<string, string> = {
  none: "text-gray-300",
  low: "text-blue-400",
  medium: "text-yellow-500",
  high: "text-orange-500",
  urgent: "text-red-500",
};

export function TaskKanbanView({
  tasks,
  onSelectTask,
  onTasksChange,
}: TaskKanbanViewProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const grouped: Record<string, Task[]> = { todo: [], in_progress: [], done: [] };
  for (const task of tasks) {
    grouped[task.status]?.push(task);
  }

  const handleDragStart = useCallback(
    (e: React.DragEvent, taskId: string) => {
      setDraggedTaskId(taskId);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", taskId);
    },
    []
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, col: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverCol(col);
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setDragOverCol(null);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetStatus: Task["status"]) => {
      e.preventDefault();
      setDragOverCol(null);
      if (!draggedTaskId) return;

      const task = tasks.find((t) => t.id === draggedTaskId);
      setDraggedTaskId(null);
      if (!task || task.status === targetStatus) return;

      try {
        await api.updateTask(task.id, { status: targetStatus });
        onTasksChange();
      } catch {
        // Reload on error
        onTasksChange();
      }
    },
    [draggedTaskId, tasks, onTasksChange]
  );

  return (
    <div className="flex-1 overflow-x-auto overflow-y-hidden">
      <div className="flex gap-3 p-4 h-full min-w-max">
        {COLUMNS.map((col) => (
          <div
            key={col.key}
            className={cn(
              "flex flex-col w-80 min-w-[320px] bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700",
              dragOverCol === col.key &&
                "border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-950/30"
            )}
            onDragOver={(e) => handleDragOver(e, col.key)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.key)}
          >
            {/* Column header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <div className={cn("w-2 h-2 rounded-full", col.color)} />
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {col.label}
                </span>
                <span className="text-xs text-gray-400 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">
                  {grouped[col.key].length}
                </span>
              </div>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {grouped[col.key].map((task) => {
                const PIcon = PRIORITY_ICON[task.priority] || Minus;
                const pColor = PRIORITY_COLOR[task.priority] || "text-gray-300";
                const isOverdue =
                  task.dueDate &&
                  task.status !== "done" &&
                  new Date(task.dueDate) < new Date();

                return (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onClick={() => onSelectTask(task)}
                    className={cn(
                      "bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-3 cursor-pointer hover:shadow-sm hover:border-blue-300 dark:hover:border-blue-700 transition-all",
                      draggedTaskId === task.id && "opacity-50"
                    )}
                  >
                    <div className="flex items-start gap-1.5">
                      <GripVertical className="w-3.5 h-3.5 text-gray-300 mt-0.5 flex-shrink-0 cursor-grab" />
                      <p
                        className={cn(
                          "text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2",
                          task.status === "done" &&
                            "line-through text-gray-400 dark:text-gray-500"
                        )}
                      >
                        {task.title}
                      </p>
                    </div>

                    <div className="mt-2 flex items-center gap-3 pl-5">
                      <div className="flex items-center gap-1">
                        <PIcon className={cn("w-3 h-3", pColor)} />
                        <span className="text-[10px] text-gray-400 uppercase">
                          {task.priority}
                        </span>
                      </div>

                      {task.dueDate && (
                        <div className="flex items-center gap-1">
                          <CalendarIcon
                            className={cn(
                              "w-3 h-3",
                              isOverdue ? "text-red-500" : "text-gray-400"
                            )}
                          />
                          <span
                            className={cn(
                              "text-[10px]",
                              isOverdue ? "text-red-500" : "text-gray-400"
                            )}
                          >
                            {new Date(task.dueDate).toLocaleDateString()}
                          </span>
                        </div>
                      )}

                      {task.assigneeIds.length > 0 && (
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3 text-gray-400" />
                          <span className="text-[10px] text-gray-400">
                            {task.assigneeIds.length}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {grouped[col.key].length === 0 && (
                <div className="text-center py-8 text-xs text-gray-400">
                  No tasks
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
