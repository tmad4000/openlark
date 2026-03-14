"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api, type Task } from "@/lib/api";
import { AppShell } from "@/components/layout/app-shell";
import { TaskListView } from "@/components/tasks/task-list-view";
import { TaskKanbanView } from "@/components/tasks/task-kanban-view";
import { TaskGanttView } from "@/components/tasks/task-gantt-view";
import { TaskDetailPanel } from "@/components/tasks/task-detail-panel";
import { CreateTaskForm } from "@/components/tasks/create-task-form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CheckSquare,
  Plus,
  List,
  Columns3,
  GanttChart,
  User,
  Loader2,
} from "lucide-react";

type ViewMode = "list" | "kanban" | "gantt";
type TabMode = "all" | "my";

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

export default function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [tabMode, setTabMode] = useState<TabMode>("all");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [sortField, setSortField] = useState("status");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getTasks({ limit: 100 });
      setTasks(res.tasks);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Filter by tab
  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (tabMode === "my" && user) {
      result = tasks.filter((t) => t.assigneeIds.includes(user.id));
    }
    return result;
  }, [tasks, tabMode, user]);

  // Sort for list view
  const sortedTasks = useMemo(() => {
    const sorted = [...filteredTasks];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "status": {
          const statusOrder: Record<string, number> = { todo: 0, in_progress: 1, done: 2 };
          cmp = (statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0);
          break;
        }
        case "priority":
          cmp = (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4);
          break;
        case "dueDate": {
          const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          cmp = aDate - bDate;
          break;
        }
        case "assignee":
          cmp = a.assigneeIds.length - b.assigneeIds.length;
          break;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [filteredTasks, sortField, sortOrder]);

  const handleSort = useCallback(
    (field: string) => {
      if (sortField === field) {
        setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortOrder("asc");
      }
    },
    [sortField]
  );

  const handleSelectTask = useCallback((task: Task) => {
    setSelectedTask(task);
  }, []);

  const handleTaskCreated = useCallback(() => {
    setShowCreateForm(false);
    loadTasks();
  }, [loadTasks]);

  const handleTaskUpdated = useCallback(() => {
    loadTasks();
  }, [loadTasks]);

  // Refresh selected task when tasks reload
  useEffect(() => {
    if (selectedTask) {
      const updated = tasks.find((t) => t.id === selectedTask.id);
      if (updated) setSelectedTask(updated);
    }
  }, [tasks, selectedTask]);

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2 mb-3">
          <CheckSquare className="w-5 h-5 text-blue-600" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Tasks
          </h2>
        </div>
        <Button
          onClick={() => setShowCreateForm(true)}
          className="w-full"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          New task
        </Button>
      </div>

      {/* Tabs */}
      <div className="p-2 space-y-0.5">
        <button
          onClick={() => setTabMode("all")}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors",
            tabMode === "all"
              ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 font-medium"
              : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          )}
        >
          <List className="w-4 h-4" />
          All Tasks
          <span className="ml-auto text-xs text-gray-400">{tasks.length}</span>
        </button>
        <button
          onClick={() => setTabMode("my")}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors",
            tabMode === "my"
              ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 font-medium"
              : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          )}
        >
          <User className="w-4 h-4" />
          My Tasks
          {user && (
            <span className="ml-auto text-xs text-gray-400">
              {tasks.filter((t) => t.assigneeIds.includes(user.id)).length}
            </span>
          )}
        </button>
      </div>

      <div className="flex-1" />
    </div>
  );

  const rightPanel = selectedTask ? (
    <TaskDetailPanel
      task={selectedTask}
      onClose={() => setSelectedTask(null)}
      onUpdate={handleTaskUpdated}
    />
  ) : undefined;

  return (
    <AppShell sidebar={sidebar} rightPanel={rightPanel}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {tabMode === "my" ? "My Tasks" : "All Tasks"}
          </h1>
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-md p-0.5">
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors",
                viewMode === "list"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              )}
            >
              <List className="w-3.5 h-3.5" />
              List
            </button>
            <button
              onClick={() => setViewMode("kanban")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors",
                viewMode === "kanban"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              )}
            >
              <Columns3 className="w-3.5 h-3.5" />
              Kanban
            </button>
            <button
              onClick={() => setViewMode("gantt")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors",
                viewMode === "gantt"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              )}
            >
              <GanttChart className="w-3.5 h-3.5" />
              Gantt
            </button>
          </div>
        </div>

        {/* Create task form */}
        {showCreateForm && (
          <CreateTaskForm
            onCreated={handleTaskCreated}
            onCancel={() => setShowCreateForm(false)}
          />
        )}

        {/* Content */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        ) : viewMode === "list" ? (
          <TaskListView
            tasks={sortedTasks}
            onSelectTask={handleSelectTask}
            selectedTaskId={selectedTask?.id}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={handleSort}
          />
        ) : viewMode === "kanban" ? (
          <TaskKanbanView
            tasks={filteredTasks}
            onSelectTask={handleSelectTask}
            onTasksChange={loadTasks}
          />
        ) : (
          <TaskGanttView
            tasks={filteredTasks}
            onSelectTask={handleSelectTask}
            selectedTaskId={selectedTask?.id}
          />
        )}
      </div>
    </AppShell>
  );
}
