"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Plus,
  X,
  Trash2,
  GripVertical,
  BarChart3,
  PieChart as PieChartIcon,
  TrendingUp,
  Hash,
  Settings,
  LayoutDashboard,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import * as Dialog from "@radix-ui/react-dialog";

interface TableInfo {
  id: string;
  name: string;
  fields: FieldInfo[];
}

interface FieldInfo {
  id: string;
  name: string;
  type: string;
}

interface ChartBlock {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type: "bar" | "column" | "line" | "pie" | "metric";
  config: {
    tableId: string;
    xFieldId?: string;
    yFieldId?: string;
    aggregation: "count" | "sum" | "avg" | "min" | "max";
    groupByFieldId?: string;
    title?: string;
    color?: string;
  };
}

interface DashboardData {
  id: string;
  name: string;
  layout: ChartBlock[];
  createdAt: string;
}

interface AggregateResult {
  data: Array<{ name: string; value: number }>;
  total: number;
}

const CHART_COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#84CC16",
  "#F97316",
  "#6366F1",
];

const AGGREGATIONS = ["count", "sum", "avg", "min", "max"] as const;

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

function ChartRenderer({
  block,
  data,
}: {
  block: ChartBlock;
  data: AggregateResult | null;
}) {
  if (!data || data.data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        No data
      </div>
    );
  }

  const color = block.config.color || CHART_COLORS[0];

  if (block.type === "metric") {
    const total = data.data.reduce((sum, d) => sum + d.value, 0);
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="text-4xl font-bold text-gray-900">{total.toLocaleString()}</div>
        <div className="text-sm text-gray-500 mt-1">
          {block.config.aggregation} of records
        </div>
      </div>
    );
  }

  if (block.type === "pie") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data.data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius="70%"
            label={(entry) =>
              `${entry.name ?? ""} (${(((entry.percent ?? 0)) * 100).toFixed(0)}%)`
            }
            labelLine={false}
          >
            {data.data.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (block.type === "line") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data.data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={{ fill: color, r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // Bar (horizontal) or Column (vertical) — both use BarChart
  // "bar" = horizontal bars, "column" = vertical bars
  if (block.type === "bar") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data.data}
          layout="vertical"
          margin={{ top: 5, right: 20, bottom: 5, left: 60 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" tick={{ fontSize: 12 }} />
          <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={80} />
          <Tooltip />
          <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // Default: column (vertical bars)
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data.data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DashboardPanel({
  baseId,
  tables,
  token,
}: {
  baseId: string;
  tables: TableInfo[];
  token: string;
}) {
  const [dashboards, setDashboards] = useState<DashboardData[]>([]);
  const [activeDashboardId, setActiveDashboardId] = useState<string | null>(null);
  const [chartData, setChartData] = useState<Record<string, AggregateResult>>({});
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState("");
  const [isAddChartOpen, setIsAddChartOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<ChartBlock | null>(null);
  const [resizingBlock, setResizingBlock] = useState<string | null>(null);
  const resizeStartRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  // New chart form state
  const [chartType, setChartType] = useState<ChartBlock["type"]>("column");
  const [chartTableId, setChartTableId] = useState("");
  const [chartXFieldId, setChartXFieldId] = useState("");
  const [chartYFieldId, setChartYFieldId] = useState("");
  const [chartAggregation, setChartAggregation] =
    useState<ChartBlock["config"]["aggregation"]>("count");
  const [chartTitle, setChartTitle] = useState("");
  const [chartColor, setChartColor] = useState(CHART_COLORS[0]);

  const activeDashboard = dashboards.find((d) => d.id === activeDashboardId);

  const fetchDashboards = useCallback(async () => {
    try {
      const res = await fetch(`/api/bases/${baseId}/dashboards`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDashboards(data.dashboards || []);
        if (data.dashboards?.length > 0 && !activeDashboardId) {
          setActiveDashboardId(data.dashboards[0].id);
        }
      }
    } catch (error) {
      console.error("Failed to fetch dashboards:", error);
    }
  }, [baseId, token, activeDashboardId]);

  useEffect(() => {
    fetchDashboards();
  }, [fetchDashboards]);

  // Fetch chart data for active dashboard
  const fetchChartData = useCallback(async () => {
    if (!activeDashboard) return;

    const results: Record<string, AggregateResult> = {};

    await Promise.all(
      activeDashboard.layout.map(async (block) => {
        try {
          const res = await fetch("/api/base-dashboards/aggregate", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              tableId: block.config.tableId,
              xFieldId: block.config.xFieldId,
              yFieldId: block.config.yFieldId,
              aggregation: block.config.aggregation,
              groupByFieldId: block.config.groupByFieldId || block.config.xFieldId,
            }),
          });
          if (res.ok) {
            results[block.i] = await res.json();
          }
        } catch (error) {
          console.error(`Failed to fetch chart data for ${block.i}:`, error);
        }
      })
    );

    setChartData(results);
  }, [activeDashboard, token]);

  useEffect(() => {
    fetchChartData();
    // Refresh chart data periodically for real-time updates
    const interval = setInterval(fetchChartData, 10000);
    return () => clearInterval(interval);
  }, [fetchChartData]);

  const createDashboard = async () => {
    if (!newDashboardName.trim()) return;

    try {
      const res = await fetch(`/api/bases/${baseId}/dashboards`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newDashboardName.trim() }),
      });

      if (res.ok) {
        const dashboard = await res.json();
        setDashboards((prev) => [dashboard, ...prev]);
        setActiveDashboardId(dashboard.id);
        setIsCreateOpen(false);
        setNewDashboardName("");
      }
    } catch (error) {
      console.error("Failed to create dashboard:", error);
    }
  };

  const deleteDashboard = async (id: string) => {
    try {
      const res = await fetch(`/api/base-dashboards/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setDashboards((prev) => prev.filter((d) => d.id !== id));
        if (activeDashboardId === id) {
          setActiveDashboardId(dashboards.find((d) => d.id !== id)?.id || null);
        }
      }
    } catch (error) {
      console.error("Failed to delete dashboard:", error);
    }
  };

  const saveDashboardLayout = async (layout: ChartBlock[]) => {
    if (!activeDashboardId) return;

    try {
      await fetch(`/api/base-dashboards/${activeDashboardId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ layout }),
      });
    } catch (error) {
      console.error("Failed to save layout:", error);
    }
  };

  const addChart = async () => {
    if (!activeDashboardId || !chartTableId) return;

    const layout = activeDashboard?.layout || [];
    // Calculate next position - stack vertically in 2-column grid
    const maxY = layout.reduce(
      (max, b) => Math.max(max, b.y + b.h),
      0
    );
    const newBlock: ChartBlock = {
      i: crypto.randomUUID(),
      x: layout.length % 2 === 0 ? 0 : 1,
      y: maxY,
      w: 1,
      h: 1,
      type: chartType,
      config: {
        tableId: chartTableId,
        xFieldId: chartXFieldId || undefined,
        yFieldId: chartYFieldId || undefined,
        aggregation: chartAggregation,
        groupByFieldId: chartXFieldId || undefined,
        title: chartTitle || undefined,
        color: chartColor,
      },
    };

    const newLayout = [...layout, newBlock];

    // Update local state immediately
    setDashboards((prev) =>
      prev.map((d) =>
        d.id === activeDashboardId ? { ...d, layout: newLayout } : d
      )
    );

    // Save to server
    await saveDashboardLayout(newLayout);

    // Reset form
    setIsAddChartOpen(false);
    setChartType("column");
    setChartTableId("");
    setChartXFieldId("");
    setChartYFieldId("");
    setChartAggregation("count");
    setChartTitle("");
    setChartColor(CHART_COLORS[0]);

    // Fetch data for new chart
    fetchChartData();
  };

  const removeChart = async (blockId: string) => {
    if (!activeDashboardId || !activeDashboard) return;

    const newLayout = activeDashboard.layout.filter((b) => b.i !== blockId);
    setDashboards((prev) =>
      prev.map((d) =>
        d.id === activeDashboardId ? { ...d, layout: newLayout } : d
      )
    );
    await saveDashboardLayout(newLayout);
  };

  const updateChartBlock = async (blockId: string, updates: Partial<ChartBlock>) => {
    if (!activeDashboardId || !activeDashboard) return;

    const newLayout = activeDashboard.layout.map((b) =>
      b.i === blockId ? { ...b, ...updates } : b
    );
    setDashboards((prev) =>
      prev.map((d) =>
        d.id === activeDashboardId ? { ...d, layout: newLayout } : d
      )
    );
    await saveDashboardLayout(newLayout);
    fetchChartData();
  };

  const handleResizeStart = (
    e: React.MouseEvent,
    blockId: string,
    currentW: number,
    currentH: number
  ) => {
    e.preventDefault();
    setResizingBlock(blockId);
    resizeStartRef.current = { x: e.clientX, y: e.clientY, w: currentW, h: currentH };

    const handleMouseMove = (me: MouseEvent) => {
      if (!resizeStartRef.current) return;
      const dx = me.clientX - resizeStartRef.current.x;
      const dy = me.clientY - resizeStartRef.current.y;
      // Each grid unit is roughly half the container width or 250px height
      const newW = Math.max(1, Math.min(2, resizeStartRef.current.w + Math.round(dx / 300)));
      const newH = Math.max(1, Math.min(3, resizeStartRef.current.h + Math.round(dy / 200)));
      // Update in-memory for live preview
      setDashboards((prev) =>
        prev.map((d) =>
          d.id === activeDashboardId
            ? {
                ...d,
                layout: d.layout.map((b) =>
                  b.i === blockId ? { ...b, w: newW, h: newH } : b
                ),
              }
            : d
        )
      );
    };

    const handleMouseUp = () => {
      setResizingBlock(null);
      resizeStartRef.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      // Save final state
      if (activeDashboard) {
        saveDashboardLayout(activeDashboard.layout);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const selectedTableFields =
    tables.find((t) => t.id === chartTableId)?.fields || [];

  const editSelectedTableFields =
    tables.find((t) => t.id === editingBlock?.config.tableId)?.fields || [];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Dashboard header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white">
        <LayoutDashboard className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-medium text-gray-700">Dashboards</span>
        <div className="flex-1" />

        {/* Dashboard selector */}
        {dashboards.length > 0 && (
          <select
            value={activeDashboardId || ""}
            onChange={(e) => setActiveDashboardId(e.target.value)}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            {dashboards.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}

        <button
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center gap-1 px-2 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
        >
          <Plus className="w-3.5 h-3.5" />
          New
        </button>

        {activeDashboard && (
          <>
            <button
              onClick={() => setIsAddChartOpen(true)}
              className="flex items-center gap-1 px-2 py-1 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Chart
            </button>
            <button
              onClick={() => {
                if (confirm("Delete this dashboard?")) {
                  deleteDashboard(activeDashboard.id);
                }
              }}
              className="p-1 text-gray-400 hover:text-red-500"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Dashboard content */}
      <div className="flex-1 overflow-auto bg-gray-50 p-4">
        {!activeDashboard ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <LayoutDashboard className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-lg font-medium mb-2">No dashboards yet</p>
            <p className="text-sm mb-4">Create a dashboard to visualize your data</p>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
            >
              Create Dashboard
            </button>
          </div>
        ) : activeDashboard.layout.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <BarChart3 className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-lg font-medium mb-2">Empty dashboard</p>
            <p className="text-sm mb-4">Add charts to visualize your data</p>
            <button
              onClick={() => setIsAddChartOpen(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
            >
              Add Chart
            </button>
          </div>
        ) : (
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: "repeat(2, 1fr)",
              gridAutoRows: "250px",
            }}
          >
            {activeDashboard.layout.map((block) => {
              const tableName =
                tables.find((t) => t.id === block.config.tableId)?.name || "Unknown";
              return (
                <div
                  key={block.i}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col overflow-hidden relative group"
                  style={{
                    gridColumn: `span ${block.w}`,
                    gridRow: `span ${block.h}`,
                  }}
                >
                  {/* Chart header */}
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                    <GripVertical className="w-4 h-4 text-gray-300 cursor-grab" />
                    <span className="text-sm font-medium text-gray-700 flex-1 truncate">
                      {block.config.title || `${block.type} chart - ${tableName}`}
                    </span>
                    <button
                      onClick={() => setEditingBlock(block)}
                      className="p-1 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => removeChart(block.i)}
                      className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Chart body */}
                  <div className="flex-1 p-2 min-h-0">
                    <ChartRenderer block={block} data={chartData[block.i] || null} />
                  </div>

                  {/* Resize handle */}
                  <div
                    className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity"
                    onMouseDown={(e) =>
                      handleResizeStart(e, block.i, block.w, block.h)
                    }
                  >
                    <svg
                      viewBox="0 0 16 16"
                      className="w-4 h-4 text-gray-400"
                      fill="currentColor"
                    >
                      <path d="M11 13h2V11h-2zm-4 0h2V7H7zm-4 0h2V3H3z" />
                    </svg>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Dashboard Dialog */}
      <Dialog.Root open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-[400px]">
            <Dialog.Title className="text-lg font-semibold text-gray-900 mb-4">
              Create Dashboard
            </Dialog.Title>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                type="text"
                value={newDashboardName}
                onChange={(e) => setNewDashboardName(e.target.value)}
                placeholder="Dashboard name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") createDashboard();
                }}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsCreateOpen(false)}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={createDashboard}
                disabled={!newDashboardName.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Add Chart Dialog */}
      <Dialog.Root open={isAddChartOpen} onOpenChange={setIsAddChartOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-[480px] max-h-[80vh] overflow-y-auto">
            <Dialog.Title className="text-lg font-semibold text-gray-900 mb-4">
              Add Chart
            </Dialog.Title>

            {/* Chart type selector */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Chart Type
              </label>
              <div className="grid grid-cols-5 gap-2">
                {(
                  [
                    { type: "bar" as const, icon: BarChart3, label: "Bar" },
                    { type: "column" as const, icon: BarChart3, label: "Column" },
                    { type: "line" as const, icon: TrendingUp, label: "Line" },
                    { type: "pie" as const, icon: PieChartIcon, label: "Pie" },
                    { type: "metric" as const, icon: Hash, label: "Metric" },
                  ] as const
                ).map(({ type, icon: Icon, label }) => (
                  <button
                    key={type}
                    onClick={() => setChartType(type)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-sm ${
                      chartType === type
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title (optional)
              </label>
              <input
                type="text"
                value={chartTitle}
                onChange={(e) => setChartTitle(e.target.value)}
                placeholder="Chart title"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            {/* Data source */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data Source (Table)
              </label>
              <select
                value={chartTableId}
                onChange={(e) => {
                  setChartTableId(e.target.value);
                  setChartXFieldId("");
                  setChartYFieldId("");
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">Select a table</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* X-axis field / Group by */}
            {chartTableId && chartType !== "metric" && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  X-Axis / Group By Field
                </label>
                <select
                  value={chartXFieldId}
                  onChange={(e) => setChartXFieldId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="">Select a field</option>
                  {selectedTableFields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.type})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Y-axis field */}
            {chartTableId && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Value Field {chartAggregation === "count" ? "(optional for count)" : ""}
                </label>
                <select
                  value={chartYFieldId}
                  onChange={(e) => setChartYFieldId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="">
                    {chartAggregation === "count" ? "None (count records)" : "Select a field"}
                  </option>
                  {selectedTableFields
                    .filter((f) =>
                      ["number", "currency", "percent", "rating", "duration"].includes(
                        f.type
                      )
                    )
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.type})
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Aggregation */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Aggregation
              </label>
              <select
                value={chartAggregation}
                onChange={(e) =>
                  setChartAggregation(
                    e.target.value as ChartBlock["config"]["aggregation"]
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                {AGGREGATIONS.map((agg) => (
                  <option key={agg} value={agg}>
                    {agg.charAt(0).toUpperCase() + agg.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Color */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Color
              </label>
              <div className="flex gap-2 flex-wrap">
                {CHART_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setChartColor(c)}
                    className={`w-7 h-7 rounded-full border-2 ${
                      chartColor === c ? "border-gray-800" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsAddChartOpen(false)}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={addChart}
                disabled={!chartTableId}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Add Chart
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Edit Chart Dialog */}
      <Dialog.Root
        open={!!editingBlock}
        onOpenChange={(open) => !open && setEditingBlock(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-[480px] max-h-[80vh] overflow-y-auto">
            <Dialog.Title className="text-lg font-semibold text-gray-900 mb-4">
              Edit Chart
            </Dialog.Title>

            {editingBlock && (
              <>
                {/* Chart type selector */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Chart Type
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {(
                      [
                        { type: "bar" as const, icon: BarChart3, label: "Bar" },
                        { type: "column" as const, icon: BarChart3, label: "Column" },
                        { type: "line" as const, icon: TrendingUp, label: "Line" },
                        { type: "pie" as const, icon: PieChartIcon, label: "Pie" },
                        { type: "metric" as const, icon: Hash, label: "Metric" },
                      ] as const
                    ).map(({ type, icon: Icon, label }) => (
                      <button
                        key={type}
                        onClick={() =>
                          setEditingBlock({ ...editingBlock, type })
                        }
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-sm ${
                          editingBlock.type === type
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Title */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    value={editingBlock.config.title || ""}
                    onChange={(e) =>
                      setEditingBlock({
                        ...editingBlock,
                        config: { ...editingBlock.config, title: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>

                {/* Data source */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data Source
                  </label>
                  <select
                    value={editingBlock.config.tableId}
                    onChange={(e) =>
                      setEditingBlock({
                        ...editingBlock,
                        config: {
                          ...editingBlock.config,
                          tableId: e.target.value,
                          xFieldId: undefined,
                          yFieldId: undefined,
                        },
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* X-axis field */}
                {editingBlock.type !== "metric" && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      X-Axis / Group By
                    </label>
                    <select
                      value={editingBlock.config.xFieldId || ""}
                      onChange={(e) =>
                        setEditingBlock({
                          ...editingBlock,
                          config: {
                            ...editingBlock.config,
                            xFieldId: e.target.value || undefined,
                            groupByFieldId: e.target.value || undefined,
                          },
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      <option value="">Select a field</option>
                      {editSelectedTableFields.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.type})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Y-axis */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Value Field
                  </label>
                  <select
                    value={editingBlock.config.yFieldId || ""}
                    onChange={(e) =>
                      setEditingBlock({
                        ...editingBlock,
                        config: {
                          ...editingBlock.config,
                          yFieldId: e.target.value || undefined,
                        },
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    <option value="">None (count records)</option>
                    {editSelectedTableFields
                      .filter((f) =>
                        ["number", "currency", "percent", "rating", "duration"].includes(
                          f.type
                        )
                      )
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.type})
                        </option>
                      ))}
                  </select>
                </div>

                {/* Aggregation */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Aggregation
                  </label>
                  <select
                    value={editingBlock.config.aggregation}
                    onChange={(e) =>
                      setEditingBlock({
                        ...editingBlock,
                        config: {
                          ...editingBlock.config,
                          aggregation: e.target.value as ChartBlock["config"]["aggregation"],
                        },
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    {AGGREGATIONS.map((agg) => (
                      <option key={agg} value={agg}>
                        {agg.charAt(0).toUpperCase() + agg.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Color */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Color
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {CHART_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() =>
                          setEditingBlock({
                            ...editingBlock,
                            config: { ...editingBlock.config, color: c },
                          })
                        }
                        className={`w-7 h-7 rounded-full border-2 ${
                          editingBlock.config.color === c
                            ? "border-gray-800"
                            : "border-transparent"
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setEditingBlock(null)}
                    className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      updateChartBlock(editingBlock.i, {
                        type: editingBlock.type,
                        config: editingBlock.config,
                      });
                      setEditingBlock(null);
                    }}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Save
                  </button>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
