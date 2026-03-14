"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  api,
  type BaseTableInfo,
  type BaseField,
  type BaseRecord,
  type BaseDashboard,
  type DashboardChartBlock,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Plus,
  GripVertical,
  Settings,
  Trash2,
  BarChart3,
  LineChart,
  PieChart,
  Hash,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ============ CHART RENDERING ============

interface ChartData {
  labels: string[];
  values: number[];
}

function computeChartData(
  records: BaseRecord[],
  fields: BaseField[],
  config: DashboardChartBlock["config"]
): ChartData {
  const { xAxisFieldId, yAxisAggregation, yAxisFieldId, groupByFieldId } = config;
  const groupField = groupByFieldId || xAxisFieldId;

  if (!groupField) {
    return { labels: ["Total"], values: [records.length] };
  }

  const field = fields.find((f) => f.id === groupField);
  const groups = new Map<string, number[]>();

  for (const record of records) {
    const data = record.data as Record<string, unknown>;
    const groupValue = String(data[groupField] ?? "(empty)");
    if (!groups.has(groupValue)) groups.set(groupValue, []);
    const val = yAxisFieldId ? Number(data[yAxisFieldId]) || 0 : 1;
    groups.get(groupValue)!.push(val);
  }

  const labels: string[] = [];
  const values: number[] = [];

  for (const [label, vals] of groups.entries()) {
    labels.push(label);
    switch (yAxisAggregation) {
      case "count":
        values.push(vals.length);
        break;
      case "sum":
        values.push(vals.reduce((a, b) => a + b, 0));
        break;
      case "avg":
        values.push(vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
        break;
      case "min":
        values.push(Math.min(...vals));
        break;
      case "max":
        values.push(Math.max(...vals));
        break;
    }
  }

  return { labels, values };
}

const CHART_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1",
];

function BarChartSvg({ data, horizontal }: { data: ChartData; horizontal?: boolean }) {
  const maxVal = Math.max(...data.values, 1);
  const barCount = data.labels.length;

  if (horizontal) {
    const barH = Math.min(30, Math.max(16, 200 / barCount));
    const totalH = barH * barCount + (barCount - 1) * 4;
    return (
      <svg width="100%" viewBox={`0 0 300 ${Math.max(totalH, 40)}`} className="overflow-visible">
        {data.labels.map((label, i) => {
          const w = (data.values[i] / maxVal) * 200;
          const y = i * (barH + 4);
          return (
            <g key={i}>
              <text x="0" y={y + barH / 2 + 4} fontSize="10" fill="currentColor" className="text-gray-500">{label.slice(0, 12)}</text>
              <rect x="90" y={y} width={Math.max(w, 2)} height={barH - 2} rx="2" fill={CHART_COLORS[i % CHART_COLORS.length]} />
              <text x={92 + w} y={y + barH / 2 + 4} fontSize="10" fill="currentColor" className="text-gray-600">
                {Number.isInteger(data.values[i]) ? data.values[i] : data.values[i].toFixed(1)}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  // Vertical bars (column chart)
  const barW = Math.min(40, Math.max(12, 260 / barCount));
  const gap = Math.min(8, Math.max(2, (260 - barW * barCount) / Math.max(barCount - 1, 1)));
  const totalW = barW * barCount + gap * (barCount - 1);
  const chartH = 150;

  return (
    <svg width="100%" viewBox={`0 0 ${totalW + 20} ${chartH + 30}`} className="overflow-visible">
      {data.labels.map((label, i) => {
        const h = (data.values[i] / maxVal) * chartH;
        const x = i * (barW + gap);
        return (
          <g key={i}>
            <rect x={x} y={chartH - h} width={barW} height={Math.max(h, 2)} rx="2" fill={CHART_COLORS[i % CHART_COLORS.length]} />
            <text x={x + barW / 2} y={chartH + 14} fontSize="9" textAnchor="middle" fill="currentColor" className="text-gray-500">
              {label.slice(0, 8)}
            </text>
            <text x={x + barW / 2} y={chartH - h - 4} fontSize="9" textAnchor="middle" fill="currentColor" className="text-gray-600">
              {Number.isInteger(data.values[i]) ? data.values[i] : data.values[i].toFixed(1)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LineChartSvg({ data }: { data: ChartData }) {
  const maxVal = Math.max(...data.values, 1);
  const w = 280;
  const h = 150;
  const points = data.labels.map((_, i) => {
    const x = data.labels.length > 1 ? (i / (data.labels.length - 1)) * w : w / 2;
    const y = h - (data.values[i] / maxVal) * h;
    return { x, y };
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <svg width="100%" viewBox={`-10 -10 ${w + 20} ${h + 40}`} className="overflow-visible">
      <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3" fill="#3b82f6" />
          <text x={p.x} y={h + 14} fontSize="9" textAnchor="middle" fill="currentColor" className="text-gray-500">
            {data.labels[i].slice(0, 8)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function PieChartSvg({ data }: { data: ChartData }) {
  const total = data.values.reduce((a, b) => a + b, 0) || 1;
  const cx = 80;
  const cy = 80;
  const r = 70;
  let currentAngle = -Math.PI / 2;

  const slices = data.labels.map((label, i) => {
    const angle = (data.values[i] / total) * Math.PI * 2;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;

    const midAngle = startAngle + angle / 2;
    const labelR = r + 16;
    const lx = cx + labelR * Math.cos(midAngle);
    const ly = cy + labelR * Math.sin(midAngle);

    return (
      <g key={i}>
        <path
          d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`}
          fill={CHART_COLORS[i % CHART_COLORS.length]}
          stroke="white"
          strokeWidth="1"
        />
        {angle > 0.2 && (
          <text x={lx} y={ly} fontSize="8" textAnchor="middle" fill="currentColor" className="text-gray-600">
            {label.slice(0, 8)}
          </text>
        )}
      </g>
    );
  });

  return (
    <svg width="100%" viewBox="0 0 200 200" className="overflow-visible">
      {slices}
    </svg>
  );
}

function MetricBlock({ data }: { data: ChartData }) {
  const total = data.values.reduce((a, b) => a + b, 0);
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <span className="text-4xl font-bold text-gray-900 dark:text-gray-100">
        {Number.isInteger(total) ? total.toLocaleString() : total.toFixed(1)}
      </span>
      {data.labels.length === 1 && (
        <span className="text-sm text-gray-500 mt-1">{data.labels[0]}</span>
      )}
    </div>
  );
}

// ============ CHART BLOCK COMPONENT ============

interface ChartBlockProps {
  block: DashboardChartBlock;
  tables: BaseTableInfo[];
  fieldsMap: Map<string, BaseField[]>;
  recordsMap: Map<string, BaseRecord[]>;
  onUpdate: (block: DashboardChartBlock) => void;
  onDelete: (id: string) => void;
  onDragStart: (id: string, e: React.MouseEvent) => void;
  onResizeStart: (id: string, e: React.MouseEvent) => void;
}

function ChartBlock({
  block,
  tables,
  fieldsMap,
  recordsMap,
  onUpdate,
  onDelete,
  onDragStart,
  onResizeStart,
}: ChartBlockProps) {
  const [configOpen, setConfigOpen] = useState(false);
  const fields = fieldsMap.get(block.config.tableId) || [];
  const records = recordsMap.get(block.config.tableId) || [];
  const chartData = computeChartData(records, fields, block.config);

  const tableName = tables.find((t) => t.id === block.config.tableId)?.name || "Select table";

  return (
    <div className="absolute bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden flex flex-col group"
      style={{
        left: block.x,
        top: block.y,
        width: block.w,
        height: block.h,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 text-xs shrink-0">
        <button
          className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
          onMouseDown={(e) => onDragStart(block.id, e)}
        >
          <GripVertical className="w-3.5 h-3.5 text-gray-400" />
        </button>
        <span className="flex-1 font-medium text-gray-700 dark:text-gray-300 truncate">
          {block.title}
        </span>
        <button
          onClick={() => setConfigOpen(!configOpen)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
        >
          <Settings className="w-3 h-3 text-gray-400" />
        </button>
        <button
          onClick={() => onDelete(block.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-red-100 dark:hover:bg-red-900 rounded"
        >
          <Trash2 className="w-3 h-3 text-red-400" />
        </button>
      </div>

      {/* Config panel */}
      {configOpen && (
        <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 space-y-2 text-xs bg-gray-50/50 dark:bg-gray-950/50 shrink-0 max-h-[200px] overflow-y-auto">
          <div>
            <label className="text-gray-500 block mb-0.5">Title</label>
            <Input
              value={block.title}
              onChange={(e) => onUpdate({ ...block, title: e.target.value })}
              className="h-6 text-xs"
            />
          </div>
          <div>
            <label className="text-gray-500 block mb-0.5">Chart type</label>
            <select
              value={block.type}
              onChange={(e) => onUpdate({ ...block, type: e.target.value as DashboardChartBlock["type"] })}
              className="w-full h-6 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-1"
            >
              <option value="bar">Bar (horizontal)</option>
              <option value="column">Column (vertical)</option>
              <option value="line">Line</option>
              <option value="pie">Pie</option>
              <option value="metric">Metric (number)</option>
            </select>
          </div>
          <div>
            <label className="text-gray-500 block mb-0.5">Data source (table)</label>
            <select
              value={block.config.tableId}
              onChange={(e) => onUpdate({ ...block, config: { ...block.config, tableId: e.target.value } })}
              className="w-full h-6 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-1"
            >
              <option value="">Select table</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-gray-500 block mb-0.5">X-axis / Group by field</label>
            <select
              value={block.config.xAxisFieldId || ""}
              onChange={(e) => onUpdate({ ...block, config: { ...block.config, xAxisFieldId: e.target.value || undefined, groupByFieldId: e.target.value || undefined } })}
              className="w-full h-6 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-1"
            >
              <option value="">(none)</option>
              {fields.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-gray-500 block mb-0.5">Y-axis aggregation</label>
            <select
              value={block.config.yAxisAggregation}
              onChange={(e) => onUpdate({ ...block, config: { ...block.config, yAxisAggregation: e.target.value as DashboardChartBlock["config"]["yAxisAggregation"] } })}
              className="w-full h-6 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-1"
            >
              <option value="count">Count</option>
              <option value="sum">Sum</option>
              <option value="avg">Average</option>
              <option value="min">Min</option>
              <option value="max">Max</option>
            </select>
          </div>
          {block.config.yAxisAggregation !== "count" && (
            <div>
              <label className="text-gray-500 block mb-0.5">Y-axis field (for sum/avg/min/max)</label>
              <select
                value={block.config.yAxisFieldId || ""}
                onChange={(e) => onUpdate({ ...block, config: { ...block.config, yAxisFieldId: e.target.value || undefined } })}
                className="w-full h-6 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-1"
              >
                <option value="">(none)</option>
                {fields.filter((f) => f.type === "number").map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          )}
          <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setConfigOpen(false)}>
            <X className="w-3 h-3 mr-1" /> Close
          </Button>
        </div>
      )}

      {/* Chart area */}
      <div className="flex-1 p-2 overflow-hidden flex items-center justify-center min-h-0">
        {!block.config.tableId ? (
          <span className="text-gray-400 text-xs">Configure data source</span>
        ) : records.length === 0 ? (
          <span className="text-gray-400 text-xs">No data</span>
        ) : block.type === "metric" ? (
          <MetricBlock data={chartData} />
        ) : block.type === "pie" ? (
          <PieChartSvg data={chartData} />
        ) : block.type === "line" ? (
          <LineChartSvg data={chartData} />
        ) : block.type === "bar" ? (
          <BarChartSvg data={chartData} horizontal />
        ) : (
          <BarChartSvg data={chartData} />
        )}
      </div>

      {/* Resize handle */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity"
        onMouseDown={(e) => onResizeStart(block.id, e)}
      >
        <svg viewBox="0 0 16 16" className="w-4 h-4 text-gray-400">
          <path d="M14 14L14 8M14 14L8 14" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </div>
    </div>
  );
}

// ============ DASHBOARD VIEW COMPONENT ============

interface BaseDashboardViewProps {
  baseId: string;
  tables: BaseTableInfo[];
}

export function BaseDashboardView({ baseId, tables }: BaseDashboardViewProps) {
  const [dashboards, setDashboards] = useState<BaseDashboard[]>([]);
  const [selectedDashboard, setSelectedDashboard] = useState<BaseDashboard | null>(null);
  const [blocks, setBlocks] = useState<DashboardChartBlock[]>([]);
  const [fieldsMap, setFieldsMap] = useState<Map<string, BaseField[]>>(new Map());
  const [recordsMap, setRecordsMap] = useState<Map<string, BaseRecord[]>>(new Map());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [dragState, setDragState] = useState<{ blockId: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [resizeState, setResizeState] = useState<{ blockId: string; startX: number; startY: number; origW: number; origH: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load dashboards
  useEffect(() => {
    async function load() {
      try {
        const result = await api.getDashboards(baseId);
        setDashboards(result.dashboards);
        if (result.dashboards.length > 0 && !selectedDashboard) {
          setSelectedDashboard(result.dashboards[0]);
        }
      } catch {
        // Silently handle
      }
    }
    load();
  }, [baseId]);

  // Load blocks from selected dashboard
  useEffect(() => {
    if (selectedDashboard) {
      setBlocks((selectedDashboard.layout as DashboardChartBlock[]) || []);
    } else {
      setBlocks([]);
    }
  }, [selectedDashboard]);

  // Load fields and records for all tables used in blocks
  useEffect(() => {
    const tableIds = new Set<string>();
    for (const b of blocks) {
      if (b.config.tableId) tableIds.add(b.config.tableId);
    }
    // Also include all tables so config dropdowns work
    for (const t of tables) tableIds.add(t.id);

    async function loadData() {
      const newFieldsMap = new Map<string, BaseField[]>();
      const newRecordsMap = new Map<string, BaseRecord[]>();

      await Promise.all(
        Array.from(tableIds).map(async (tid) => {
          try {
            const [fieldsRes, recordsRes] = await Promise.all([
              api.getTableFields(tid),
              api.getTableRecords(tid, { limit: 100 }),
            ]);
            newFieldsMap.set(tid, fieldsRes.fields);
            newRecordsMap.set(tid, recordsRes.records);
          } catch {
            // Silently handle
          }
        })
      );

      setFieldsMap(newFieldsMap);
      setRecordsMap(newRecordsMap);
    }

    if (tableIds.size > 0) loadData();
  }, [blocks, tables]);

  // Auto-save layout changes
  const saveLayout = useCallback(
    (newBlocks: DashboardChartBlock[]) => {
      if (!selectedDashboard) return;
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(async () => {
        try {
          const result = await api.updateDashboard(selectedDashboard.id, {
            layout: newBlocks,
          });
          setSelectedDashboard(result.dashboard);
          setDashboards((prev) =>
            prev.map((d) => (d.id === result.dashboard.id ? result.dashboard : d))
          );
        } catch {
          // Silently handle
        }
      }, 500);
    },
    [selectedDashboard]
  );

  const updateBlock = useCallback(
    (updated: DashboardChartBlock) => {
      setBlocks((prev) => {
        const next = prev.map((b) => (b.id === updated.id ? updated : b));
        saveLayout(next);
        return next;
      });
    },
    [saveLayout]
  );

  const deleteBlock = useCallback(
    (id: string) => {
      setBlocks((prev) => {
        const next = prev.filter((b) => b.id !== id);
        saveLayout(next);
        return next;
      });
    },
    [saveLayout]
  );

  const addBlock = useCallback(
    (type: DashboardChartBlock["type"]) => {
      const id = `chart-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newBlock: DashboardChartBlock = {
        id,
        type,
        title: type === "metric" ? "Metric" : `${type.charAt(0).toUpperCase() + type.slice(1)} Chart`,
        x: 20,
        y: 20,
        w: type === "metric" ? 200 : 360,
        h: type === "metric" ? 160 : 260,
        config: {
          tableId: tables[0]?.id || "",
          yAxisAggregation: "count",
        },
      };
      setBlocks((prev) => {
        const next = [...prev, newBlock];
        saveLayout(next);
        return next;
      });
    },
    [tables, saveLayout]
  );

  // Drag and resize handlers
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (dragState) {
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        setBlocks((prev) =>
          prev.map((b) =>
            b.id === dragState.blockId
              ? { ...b, x: Math.max(0, dragState.origX + dx), y: Math.max(0, dragState.origY + dy) }
              : b
          )
        );
      }
      if (resizeState) {
        const dx = e.clientX - resizeState.startX;
        const dy = e.clientY - resizeState.startY;
        setBlocks((prev) =>
          prev.map((b) =>
            b.id === resizeState.blockId
              ? {
                  ...b,
                  w: Math.max(150, resizeState.origW + dx),
                  h: Math.max(120, resizeState.origH + dy),
                }
              : b
          )
        );
      }
    }

    function onMouseUp() {
      if (dragState || resizeState) {
        setBlocks((prev) => {
          saveLayout(prev);
          return prev;
        });
      }
      setDragState(null);
      setResizeState(null);
    }

    if (dragState || resizeState) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      return () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };
    }
  }, [dragState, resizeState, saveLayout]);

  const handleDragStart = useCallback((blockId: string, e: React.MouseEvent) => {
    e.preventDefault();
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    setDragState({
      blockId,
      startX: e.clientX,
      startY: e.clientY,
      origX: block.x,
      origY: block.y,
    });
  }, [blocks]);

  const handleResizeStart = useCallback((blockId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    setResizeState({
      blockId,
      startX: e.clientX,
      startY: e.clientY,
      origW: block.w,
      origH: block.h,
    });
  }, [blocks]);

  const handleCreateDashboard = useCallback(async () => {
    if (!newName.trim()) return;
    try {
      const result = await api.createDashboard(baseId, { name: newName.trim() });
      setDashboards((prev) => [...prev, result.dashboard]);
      setSelectedDashboard(result.dashboard);
      setNewName("");
      setCreating(false);
    } catch {
      // Silently handle
    }
  }, [baseId, newName]);

  const handleDeleteDashboard = useCallback(async () => {
    if (!selectedDashboard) return;
    try {
      await api.deleteDashboard(selectedDashboard.id);
      setDashboards((prev) => prev.filter((d) => d.id !== selectedDashboard.id));
      setSelectedDashboard(null);
    } catch {
      // Silently handle
    }
  }, [selectedDashboard]);

  return (
    <div className="flex flex-col h-full">
      {/* Dashboard tabs */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 shrink-0">
        {dashboards.map((d) => (
          <button
            key={d.id}
            onClick={() => setSelectedDashboard(d)}
            className={cn(
              "px-3 py-1 text-xs rounded-md whitespace-nowrap transition-colors",
              selectedDashboard?.id === d.id
                ? "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 font-medium"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            )}
          >
            {d.name}
          </button>
        ))}
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        {selectedDashboard && (
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={handleDeleteDashboard}
              className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900 text-gray-400 hover:text-red-500"
              title="Delete dashboard"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Create dashboard dialog */}
      {creating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl p-4 w-80 space-y-3">
            <h3 className="font-medium text-sm">Create Dashboard</h3>
            <Input
              placeholder="Dashboard name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateDashboard();
                if (e.key === "Escape") setCreating(false);
              }}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreateDashboard}>
                Create
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Canvas */}
      {selectedDashboard ? (
        <div className="flex-1 overflow-auto relative">
          {/* Add chart toolbar */}
          <div className="sticky top-0 z-10 flex items-center gap-1 px-3 py-1.5 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-100 dark:border-gray-800">
            <span className="text-xs text-gray-500 mr-1">Add chart:</span>
            <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={() => addBlock("column")}>
              <BarChart3 className="w-3 h-3" /> Column
            </Button>
            <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={() => addBlock("bar")}>
              <BarChart3 className="w-3 h-3 rotate-90" /> Bar
            </Button>
            <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={() => addBlock("line")}>
              <LineChart className="w-3 h-3" /> Line
            </Button>
            <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={() => addBlock("pie")}>
              <PieChart className="w-3 h-3" /> Pie
            </Button>
            <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={() => addBlock("metric")}>
              <Hash className="w-3 h-3" /> Metric
            </Button>
          </div>

          <div
            ref={canvasRef}
            className="relative min-h-[800px] select-none"
            style={{ userSelect: dragState || resizeState ? "none" : undefined }}
          >
            {blocks.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <BarChart3 className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">
                    No charts yet. Add one to get started.
                  </p>
                </div>
              </div>
            )}

            {blocks.map((block) => (
              <ChartBlock
                key={block.id}
                block={block}
                tables={tables}
                fieldsMap={fieldsMap}
                recordsMap={recordsMap}
                onUpdate={updateBlock}
                onDelete={deleteBlock}
                onDragStart={handleDragStart}
                onResizeStart={handleResizeStart}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <BarChart3 className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
              Create a dashboard to visualize your data.
            </p>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="w-4 h-4 mr-1" />
              New Dashboard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
