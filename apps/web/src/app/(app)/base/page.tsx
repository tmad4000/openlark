"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { BaseGridView, BaseKanbanView, BaseCalendarView, BaseGanttView, BaseGalleryView, BaseAutomationsPanel, BaseDashboardView } from "@/components/base";
import { BaseFormView, type FormViewConfig } from "@/components/base/base-form-view";
import type { ViewConfig } from "@/components/base/base-view-toolbar";
import { api, type BaseInfo, type BaseTableInfo, type BaseViewInfo } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Database,
  Plus,
  Table,
  Grid3X3,
  Kanban,
  Calendar,
  GanttChart,
  LayoutGrid,
  FileInput,
  ChevronLeft,
  Zap,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const viewTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  grid: Grid3X3,
  kanban: Kanban,
  calendar: Calendar,
  gantt: GanttChart,
  gallery: LayoutGrid,
  form: FileInput,
};

export default function BasePage() {
  const [bases, setBases] = useState<BaseInfo[]>([]);
  const [selectedBase, setSelectedBase] = useState<BaseInfo | null>(null);
  const [tables, setTables] = useState<BaseTableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<BaseTableInfo | null>(null);
  const [views, setViews] = useState<BaseViewInfo[]>([]);
  const [selectedView, setSelectedView] = useState<BaseViewInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newBaseName, setNewBaseName] = useState("");
  const [addingView, setAddingView] = useState(false);
  const [showAutomations, setShowAutomations] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);

  // Load bases
  useEffect(() => {
    async function loadBases() {
      try {
        setLoading(true);
        const result = await api.getBases();
        setBases(result.bases);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load bases");
      } finally {
        setLoading(false);
      }
    }
    loadBases();
  }, []);

  // Load tables when base is selected
  useEffect(() => {
    if (!selectedBase) {
      setTables([]);
      setSelectedTable(null);
      return;
    }
    async function loadTables() {
      try {
        const result = await api.getBaseTables(selectedBase!.id);
        setTables(result.tables);
        if (result.tables.length > 0) {
          setSelectedTable(result.tables[0]);
        }
      } catch {
        // Silently handle
      }
    }
    loadTables();
  }, [selectedBase]);

  // Load views when table is selected
  useEffect(() => {
    if (!selectedTable) {
      setViews([]);
      setSelectedView(null);
      return;
    }
    async function loadViews() {
      try {
        const result = await api.getTableViews(selectedTable!.id);
        setViews(result.views);
        if (result.views.length > 0) {
          setSelectedView(result.views[0]);
        }
      } catch {
        // Silently handle
      }
    }
    loadViews();
  }, [selectedTable]);

  const handleCreateBase = useCallback(async () => {
    if (!newBaseName.trim()) return;
    try {
      const result = await api.createBase({ name: newBaseName.trim() });
      setBases((prev) => [...prev, result.base]);
      setNewBaseName("");
      setCreating(false);
      setSelectedBase(result.base);
    } catch {
      // Silently handle
    }
  }, [newBaseName]);

  const handleBackToBases = useCallback(() => {
    setSelectedBase(null);
    setSelectedTable(null);
    setViews([]);
    setSelectedView(null);
  }, []);

  const handleAddKanbanView = useCallback(async () => {
    if (!selectedTable) return;
    try {
      const result = await api.createView(selectedTable.id, {
        name: "Kanban View",
        type: "kanban",
        config: {},
      });
      setViews((prev) => [...prev, result.view]);
      setSelectedView(result.view);
      setAddingView(false);
    } catch {
      // Silently handle
    }
  }, [selectedTable]);

  const handleAddCalendarView = useCallback(async () => {
    if (!selectedTable) return;
    try {
      const result = await api.createView(selectedTable.id, {
        name: "Calendar View",
        type: "calendar",
        config: { dateFieldId: null },
      });
      setViews((prev) => [...prev, result.view]);
      setSelectedView(result.view);
      setAddingView(false);
    } catch {
      // Silently handle
    }
  }, [selectedTable]);

  const handleAddGanttView = useCallback(async () => {
    if (!selectedTable) return;
    try {
      const result = await api.createView(selectedTable.id, {
        name: "Gantt View",
        type: "gantt",
        config: { startFieldId: null, endFieldId: null },
      });
      setViews((prev) => [...prev, result.view]);
      setSelectedView(result.view);
      setAddingView(false);
    } catch {
      // Silently handle
    }
  }, [selectedTable]);

  const handleAddGalleryView = useCallback(async () => {
    if (!selectedTable) return;
    try {
      const result = await api.createView(selectedTable.id, {
        name: "Gallery View",
        type: "gallery",
        config: {},
      });
      setViews((prev) => [...prev, result.view]);
      setSelectedView(result.view);
      setAddingView(false);
    } catch {
      // Silently handle
    }
  }, [selectedTable]);

  const handleAddFormView = useCallback(async () => {
    if (!selectedTable) return;
    try {
      const result = await api.createView(selectedTable.id, {
        name: "Form View",
        type: "form",
        config: {
          requiredFields: [],
          description: "",
          submitLabel: "Submit",
          successMessage: "Thank you! Your response has been recorded.",
          isPublic: false,
        },
      });
      setViews((prev) => [...prev, result.view]);
      setSelectedView(result.view);
      setAddingView(false);
    } catch {
      // Silently handle
    }
  }, [selectedTable]);

  const handleViewConfigChange = useCallback(
    async (viewId: string, config: Record<string, unknown>) => {
      try {
        const result = await api.updateView(viewId, { config });
        setViews((prev) =>
          prev.map((v) => (v.id === result.view.id ? result.view : v))
        );
        setSelectedView((prev) =>
          prev?.id === result.view.id ? result.view : prev
        );
      } catch {
        // Silently handle
      }
    },
    []
  );

  // Hub view: list of bases
  if (!selectedBase) {
    return (
      <AppShell>
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Base
              </h1>
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="w-4 h-4 mr-1" />
                New Base
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-6">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-32 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse"
                  />
                ))}
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-red-500 text-sm">{error}</p>
              </div>
            ) : bases.length === 0 ? (
              <div className="text-center py-12">
                <Database className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                  No bases yet. Create one to get started.
                </p>
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="w-4 h-4 mr-1" />
                  Create Base
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {bases.map((base) => (
                  <button
                    key={base.id}
                    onClick={() => setSelectedBase(base)}
                    className="group text-left p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-lg">
                        {base.icon || "📊"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                          {base.name}
                        </h3>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Created{" "}
                      {new Date(base.createdAt).toLocaleDateString()}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Create base dialog */}
          {creating && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl p-4 w-80 space-y-3">
                <h3 className="font-medium text-sm">Create Base</h3>
                <Input
                  placeholder="Base name"
                  value={newBaseName}
                  onChange={(e) => setNewBaseName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateBase();
                    if (e.key === "Escape") setCreating(false);
                  }}
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCreating(false)}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleCreateBase}>
                    Create
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </AppShell>
    );
  }

  // Table view with sidebar
  const sidebar = (
    <div className="flex flex-col h-full">
      {/* Back button */}
      <div className="px-3 py-3 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={handleBackToBases}
          className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
        >
          <ChevronLeft className="w-4 h-4" />
          All Bases
        </button>
        <h2 className="mt-2 text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
          {selectedBase.icon || "📊"} {selectedBase.name}
        </h2>
      </div>

      {/* Table list */}
      <div className="flex-1 overflow-auto py-2">
        <div className="px-3 mb-1">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
            Tables
          </span>
        </div>
        {tables.map((table) => (
          <button
            key={table.id}
            onClick={() => {
              setSelectedTable(table);
              setShowAutomations(false);
              setShowDashboard(false);
            }}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors",
              selectedTable?.id === table.id &&
                !showAutomations &&
                "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400"
            )}
          >
            <Table className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{table.name}</span>
          </button>
        ))}

        <div className="px-3 mt-4 mb-1">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
            Tools
          </span>
        </div>
        <button
          onClick={() => { setShowAutomations(true); setShowDashboard(false); }}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors",
            showAutomations &&
              "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400"
          )}
        >
          <Zap className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">Automations</span>
        </button>
        <button
          onClick={() => { setShowDashboard(true); setShowAutomations(false); }}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors",
            showDashboard &&
              "bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400"
          )}
        >
          <BarChart3 className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">Dashboards</span>
        </button>
      </div>
    </div>
  );

  const viewConfig = (selectedView?.config as Record<string, unknown>) || {};

  return (
    <AppShell sidebar={sidebar}>
      <div className="flex flex-col h-full">
        {/* Table tabs bar */}
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 overflow-x-auto">
          {tables.map((table) => (
            <button
              key={table.id}
              onClick={() => setSelectedTable(table)}
              className={cn(
                "px-3 py-1 text-sm rounded-md whitespace-nowrap transition-colors",
                selectedTable?.id === table.id
                  ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              )}
            >
              {table.name}
            </button>
          ))}
        </div>

        {/* View tabs bar */}
        <div className="flex items-center gap-1 px-3 py-1 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          {views.map((view) => {
            const ViewIcon = viewTypeIcons[view.type] || Grid3X3;
            return (
              <button
                key={view.id}
                onClick={() => setSelectedView(view)}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors",
                  selectedView?.id === view.id
                    ? "text-blue-600 font-medium"
                    : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                )}
              >
                <ViewIcon className="w-3.5 h-3.5" />
                <span>{view.name}</span>
              </button>
            );
          })}
          {/* Add view button */}
          <div className="relative">
            <button
              onClick={() => setAddingView(!addingView)}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            {addingView && (
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 z-20 w-40">
                <button
                  onClick={handleAddKanbanView}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <Kanban className="w-3.5 h-3.5" />
                  Kanban View
                </button>
                <button
                  onClick={handleAddFormView}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <FileInput className="w-3.5 h-3.5" />
                  Form View
                </button>
                <button
                  onClick={handleAddCalendarView}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  Calendar View
                </button>
                <button
                  onClick={handleAddGanttView}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <GanttChart className="w-3.5 h-3.5" />
                  Gantt View
                </button>
                <button
                  onClick={handleAddGalleryView}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Gallery View
                </button>
              </div>
            )}
          </div>
        </div>

        {/* View content */}
        {showDashboard ? (
          <BaseDashboardView baseId={selectedBase.id} tables={tables} />
        ) : showAutomations ? (
          <BaseAutomationsPanel baseId={selectedBase.id} tables={tables} />
        ) : selectedTable ? (
          selectedView?.type === "form" ? (
            <BaseFormView
              tableId={selectedTable.id}
              tableName={selectedTable.name}
              viewId={selectedView.id}
              viewConfig={viewConfig as FormViewConfig}
              onViewConfigChange={(newConfig) => {
                if (selectedView) {
                  handleViewConfigChange(selectedView.id, {
                    ...viewConfig,
                    ...newConfig,
                  });
                }
              }}
            />
          ) : selectedView?.type === "calendar" ? (
            <BaseCalendarView
              tableId={selectedTable.id}
              tableName={selectedTable.name}
              dateFieldId={(viewConfig.dateFieldId as string) || null}
              onDateFieldChange={(fieldId) => {
                if (selectedView) {
                  handleViewConfigChange(selectedView.id, {
                    ...viewConfig,
                    dateFieldId: fieldId,
                  });
                }
              }}
              viewConfig={viewConfig as ViewConfig}
              onViewConfigChange={(newConfig) => {
                if (selectedView) {
                  handleViewConfigChange(selectedView.id, {
                    ...viewConfig,
                    ...newConfig,
                  });
                }
              }}
            />
          ) : selectedView?.type === "gantt" ? (
            <BaseGanttView
              tableId={selectedTable.id}
              tableName={selectedTable.name}
              startFieldId={(viewConfig.startFieldId as string) || null}
              endFieldId={(viewConfig.endFieldId as string) || null}
              onFieldMapping={(startId, endId) => {
                if (selectedView) {
                  handleViewConfigChange(selectedView.id, {
                    ...viewConfig,
                    startFieldId: startId,
                    endFieldId: endId,
                  });
                }
              }}
              viewConfig={viewConfig as ViewConfig}
              onViewConfigChange={(newConfig) => {
                if (selectedView) {
                  handleViewConfigChange(selectedView.id, {
                    ...viewConfig,
                    ...newConfig,
                  });
                }
              }}
            />
          ) : selectedView?.type === "gallery" ? (
            <BaseGalleryView
              tableId={selectedTable.id}
              tableName={selectedTable.name}
              viewConfig={viewConfig as ViewConfig}
              onViewConfigChange={(newConfig) => {
                if (selectedView) {
                  handleViewConfigChange(selectedView.id, {
                    ...viewConfig,
                    ...newConfig,
                  });
                }
              }}
            />
          ) : selectedView?.type === "kanban" ? (
            <BaseKanbanView
              tableId={selectedTable.id}
              tableName={selectedTable.name}
              groupByFieldId={(viewConfig.groupByFieldId as string) || null}
              onGroupByChange={(fieldId) => {
                if (selectedView) {
                  handleViewConfigChange(selectedView.id, {
                    ...viewConfig,
                    groupByFieldId: fieldId,
                  });
                }
              }}
              viewConfig={viewConfig as ViewConfig}
              onViewConfigChange={(newConfig) => {
                if (selectedView) {
                  handleViewConfigChange(selectedView.id, {
                    ...viewConfig,
                    ...newConfig,
                  });
                }
              }}
            />
          ) : (
            <BaseGridView
              tableId={selectedTable.id}
              tableName={selectedTable.name}
              viewConfig={viewConfig as ViewConfig}
              onViewConfigChange={(newConfig) => {
                if (selectedView) {
                  handleViewConfigChange(selectedView.id, {
                    ...viewConfig,
                    ...newConfig,
                  });
                }
              }}
            />
          )
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-500 text-sm">
              Select a table to view its data
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
