"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { api, type Task, type TaskDependency } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  ZoomIn,
  ZoomOut,
  Diamond,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";

// ---------- types ----------
type ZoomLevel = "day" | "week" | "month";

interface GanttTask extends Task {
  _children?: GanttTask[];
  _expanded?: boolean;
  _depth?: number;
}

interface DependencyLink {
  from: string;
  to: string;
  type: "fs" | "ss" | "ff" | "sf";
}

// ---------- constants ----------
const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 52;
const LABEL_WIDTH = 280;
const BAR_HEIGHT = 20;
const BAR_Y_OFFSET = (ROW_HEIGHT - BAR_HEIGHT) / 2;
const MIN_BAR_WIDTH = 12;

const ZOOM_CONFIG: Record<ZoomLevel, { unit: number; label: string; format: (d: Date) => string }> = {
  day: { unit: 40, label: "Day", format: (d) => `${d.getMonth() + 1}/${d.getDate()}` },
  week: { unit: 16, label: "Week", format: (d) => `W${getWeek(d)}` },
  month: { unit: 4, label: "Month", format: (d) => d.toLocaleDateString("en", { month: "short", year: "2-digit" }) },
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
  none: "#6b7280",
};

const STATUS_COLORS: Record<string, string> = {
  todo: "#94a3b8",
  in_progress: "#3b82f6",
  done: "#22c55e",
};

// ---------- helpers ----------
function getWeek(d: Date): number {
  const onejan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isMilestone(task: Task): boolean {
  if (!task.startDate && !task.dueDate) return false;
  if (task.startDate && task.dueDate) {
    return startOfDay(new Date(task.startDate)).getTime() === startOfDay(new Date(task.dueDate)).getTime();
  }
  return true;
}

// ---------- critical path ----------
function computeCriticalPath(tasks: Task[], deps: DependencyLink[]): Set<string> {
  // Simple forward-pass / backward-pass on finish-start deps
  const fsDeps = deps.filter((d) => d.type === "fs");
  const taskMap = new Map<string, Task>();
  tasks.forEach((t) => taskMap.set(t.id, t));

  // earliest finish for each task (days from project start)
  const projectStart = tasks.reduce((min, t) => {
    const s = t.startDate ? new Date(t.startDate).getTime() : t.dueDate ? new Date(t.dueDate).getTime() : Infinity;
    return Math.min(min, s);
  }, Infinity);

  if (!isFinite(projectStart)) return new Set();

  const base = new Date(projectStart);
  const ef = new Map<string, number>(); // earliest finish
  const es = new Map<string, number>(); // earliest start
  const dur = new Map<string, number>();

  for (const t of tasks) {
    const s = t.startDate ? daysBetween(base, startOfDay(new Date(t.startDate))) : 0;
    const e = t.dueDate ? daysBetween(base, startOfDay(new Date(t.dueDate))) : s;
    dur.set(t.id, Math.max(e - s, 0));
    es.set(t.id, s);
    ef.set(t.id, e);
  }

  // Forward pass
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 100) {
    changed = false;
    iterations++;
    for (const dep of fsDeps) {
      const predFinish = ef.get(dep.from) ?? 0;
      const curStart = es.get(dep.to) ?? 0;
      if (predFinish > curStart) {
        es.set(dep.to, predFinish);
        ef.set(dep.to, predFinish + (dur.get(dep.to) ?? 0));
        changed = true;
      }
    }
  }

  // Project finish
  let maxFinish = 0;
  for (const [, v] of ef) maxFinish = Math.max(maxFinish, v);

  // Backward pass
  const lf = new Map<string, number>();
  const ls = new Map<string, number>();
  for (const t of tasks) {
    lf.set(t.id, maxFinish);
    ls.set(t.id, maxFinish - (dur.get(t.id) ?? 0));
  }

  changed = true;
  iterations = 0;
  while (changed && iterations < 100) {
    changed = false;
    iterations++;
    for (const dep of fsDeps) {
      const succStart = ls.get(dep.to) ?? maxFinish;
      const curLateFinish = lf.get(dep.from) ?? maxFinish;
      if (succStart < curLateFinish) {
        lf.set(dep.from, succStart);
        ls.set(dep.from, succStart - (dur.get(dep.from) ?? 0));
        changed = true;
      }
    }
  }

  const critical = new Set<string>();
  for (const t of tasks) {
    const slack = (lf.get(t.id) ?? 0) - (ef.get(t.id) ?? 0);
    if (Math.abs(slack) < 0.5) critical.add(t.id);
  }
  return critical;
}

// ---------- component ----------
interface TaskGanttViewProps {
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  selectedTaskId?: string;
}

export function TaskGanttView({ tasks, onSelectTask, selectedTaskId }: TaskGanttViewProps) {
  const [zoom, setZoom] = useState<ZoomLevel>("day");
  const [dependencies, setDependencies] = useState<DependencyLink[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [dragState, setDragState] = useState<{
    taskId: string;
    edge: "start" | "end";
    startX: number;
    origDate: string;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Load dependencies for all tasks
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const allDeps: DependencyLink[] = [];
      const seen = new Set<string>();
      for (const task of tasks) {
        try {
          const res = await api.getTaskDependencies(task.id);
          for (const d of res.dependencies) {
            const key = `${d.taskId}-${d.dependsOnTaskId}`;
            if (!seen.has(key)) {
              seen.add(key);
              allDeps.push({ from: d.dependsOnTaskId, to: d.taskId, type: d.type });
            }
          }
        } catch {
          // ignore individual failures
        }
      }
      if (!cancelled) setDependencies(allDeps);
    }
    if (tasks.length > 0) load();
    return () => { cancelled = true; };
  }, [tasks]);

  // Build tree
  const flatRows = useMemo(() => {
    const childMap = new Map<string | null, GanttTask[]>();
    for (const t of tasks) {
      const parentKey = t.parentTaskId ?? null;
      if (!childMap.has(parentKey)) childMap.set(parentKey, []);
      childMap.get(parentKey)!.push({ ...t });
    }

    const rows: GanttTask[] = [];
    function walk(parentId: string | null, depth: number) {
      const children = childMap.get(parentId) ?? [];
      for (const child of children) {
        child._depth = depth;
        child._children = childMap.get(child.id);
        child._expanded = expandedIds.has(child.id);
        rows.push(child);
        if (child._expanded && child._children) {
          walk(child.id, depth + 1);
        }
      }
    }
    walk(null, 0);
    return rows;
  }, [tasks, expandedIds]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Date range
  const { rangeStart, rangeEnd, totalDays } = useMemo(() => {
    const now = new Date();
    let minDate = now;
    let maxDate = addDays(now, 30);

    for (const t of tasks) {
      if (t.startDate) {
        const d = new Date(t.startDate);
        if (d < minDate) minDate = d;
        if (d > maxDate) maxDate = d;
      }
      if (t.dueDate) {
        const d = new Date(t.dueDate);
        if (d < minDate) minDate = d;
        if (d > maxDate) maxDate = d;
      }
    }

    const rangeStart = addDays(startOfDay(minDate), -3);
    const rangeEnd = addDays(startOfDay(maxDate), 7);
    const totalDays = daysBetween(rangeStart, rangeEnd);
    return { rangeStart, rangeEnd, totalDays };
  }, [tasks]);

  const pxPerDay = ZOOM_CONFIG[zoom].unit;
  const chartWidth = totalDays * pxPerDay;
  const chartHeight = flatRows.length * ROW_HEIGHT;

  // Critical path
  const criticalIds = useMemo(() => computeCriticalPath(tasks, dependencies), [tasks, dependencies]);

  // Date to X position
  const dateToX = useCallback(
    (date: Date) => daysBetween(rangeStart, startOfDay(date)) * pxPerDay,
    [rangeStart, pxPerDay]
  );

  // X to date
  const xToDate = useCallback(
    (x: number) => addDays(rangeStart, Math.round(x / pxPerDay)),
    [rangeStart, pxPerDay]
  );

  // Drag handlers
  const handleBarMouseDown = useCallback(
    (e: React.MouseEvent, taskId: string, edge: "start" | "end") => {
      e.stopPropagation();
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      const origDate = edge === "start" ? (task.startDate ?? task.createdAt) : (task.dueDate ?? task.createdAt);
      setDragState({ taskId, edge, startX: e.clientX, origDate });
    },
    [tasks]
  );

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Visual feedback handled by CSS cursor
    };

    const handleMouseUp = async (e: MouseEvent) => {
      const dx = e.clientX - dragState.startX;
      const daysDelta = Math.round(dx / pxPerDay);
      if (daysDelta !== 0) {
        const origDate = new Date(dragState.origDate);
        const newDate = addDays(origDate, daysDelta);
        const isoDate = newDate.toISOString().split("T")[0];

        try {
          if (dragState.edge === "start") {
            await api.updateTask(dragState.taskId, { startDate: isoDate });
          } else {
            await api.updateTask(dragState.taskId, { dueDate: isoDate });
          }
        } catch {
          // ignore
        }
      }
      setDragState(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, pxPerDay]);

  // Generate time header labels
  const headerLabels = useMemo(() => {
    const labels: { x: number; width: number; text: string; isMajor: boolean }[] = [];
    const cursor = new Date(rangeStart);

    if (zoom === "day") {
      // Group by month (major) and days (minor)
      let currentMonth = -1;
      let monthStartX = 0;
      while (cursor <= rangeEnd) {
        const x = dateToX(cursor);
        if (cursor.getMonth() !== currentMonth) {
          if (currentMonth !== -1) {
            labels.push({ x: monthStartX, width: x - monthStartX, text: new Date(cursor.getFullYear(), currentMonth).toLocaleDateString("en", { month: "long", year: "numeric" }), isMajor: true });
          }
          currentMonth = cursor.getMonth();
          monthStartX = x;
        }
        labels.push({ x, width: pxPerDay, text: cursor.getDate().toString(), isMajor: false });
        cursor.setDate(cursor.getDate() + 1);
      }
      // Last month
      if (currentMonth !== -1) {
        labels.push({ x: monthStartX, width: dateToX(cursor) - monthStartX, text: new Date(cursor.getFullYear(), currentMonth).toLocaleDateString("en", { month: "long", year: "numeric" }), isMajor: true });
      }
    } else if (zoom === "week") {
      // Move to start of week
      cursor.setDate(cursor.getDate() - cursor.getDay());
      let currentMonth = -1;
      let monthStartX = 0;
      while (cursor <= rangeEnd) {
        const x = dateToX(cursor);
        if (cursor.getMonth() !== currentMonth) {
          if (currentMonth !== -1) {
            labels.push({ x: monthStartX, width: x - monthStartX, text: new Date(cursor.getFullYear(), currentMonth).toLocaleDateString("en", { month: "long", year: "numeric" }), isMajor: true });
          }
          currentMonth = cursor.getMonth();
          monthStartX = x;
        }
        labels.push({ x, width: 7 * pxPerDay, text: `W${getWeek(cursor)}`, isMajor: false });
        cursor.setDate(cursor.getDate() + 7);
      }
      if (currentMonth !== -1) {
        labels.push({ x: monthStartX, width: dateToX(cursor) - monthStartX, text: new Date(cursor.getFullYear(), currentMonth).toLocaleDateString("en", { month: "long", year: "numeric" }), isMajor: true });
      }
    } else {
      // month zoom
      cursor.setDate(1);
      let currentYear = -1;
      let yearStartX = 0;
      while (cursor <= rangeEnd) {
        const x = dateToX(cursor);
        if (cursor.getFullYear() !== currentYear) {
          if (currentYear !== -1) {
            labels.push({ x: yearStartX, width: x - yearStartX, text: currentYear.toString(), isMajor: true });
          }
          currentYear = cursor.getFullYear();
          yearStartX = x;
        }
        const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        const w = dateToX(nextMonth) - x;
        labels.push({ x, width: w, text: cursor.toLocaleDateString("en", { month: "short" }), isMajor: false });
        cursor.setMonth(cursor.getMonth() + 1);
      }
      if (currentYear !== -1) {
        labels.push({ x: yearStartX, width: dateToX(cursor) - yearStartX, text: currentYear.toString(), isMajor: true });
      }
    }

    return labels;
  }, [rangeStart, rangeEnd, zoom, pxPerDay, dateToX]);

  // Today line
  const todayX = dateToX(new Date());

  // Build task row positions
  const taskRowMap = useMemo(() => {
    const m = new Map<string, number>();
    flatRows.forEach((t, i) => m.set(t.id, i));
    return m;
  }, [flatRows]);

  // Render dependency arrows
  const renderDependencyArrows = useCallback(() => {
    return dependencies.map((dep, i) => {
      const fromIdx = taskRowMap.get(dep.from);
      const toIdx = taskRowMap.get(dep.to);
      if (fromIdx === undefined || toIdx === undefined) return null;

      const fromTask = flatRows[fromIdx];
      const toTask = flatRows[toIdx];
      if (!fromTask || !toTask) return null;

      // From task end, to task start
      const fromDate = fromTask.dueDate ?? fromTask.startDate ?? fromTask.createdAt;
      const toDate = toTask.startDate ?? toTask.dueDate ?? toTask.createdAt;

      const x1 = dateToX(new Date(fromDate));
      const y1 = fromIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
      const x2 = dateToX(new Date(toDate));
      const y2 = toIdx * ROW_HEIGHT + ROW_HEIGHT / 2;

      const midX = x1 + 12;

      return (
        <g key={`dep-${i}`}>
          <path
            d={`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`}
            fill="none"
            stroke="#94a3b8"
            strokeWidth={1.5}
            strokeDasharray="4 2"
          />
          {/* Arrow head */}
          <polygon
            points={`${x2},${y2} ${x2 - 6},${y2 - 4} ${x2 - 6},${y2 + 4}`}
            fill="#94a3b8"
          />
        </g>
      );
    });
  }, [dependencies, taskRowMap, flatRows, dateToX]);

  const cycleZoom = useCallback((dir: "in" | "out") => {
    const levels: ZoomLevel[] = ["month", "week", "day"];
    const idx = levels.indexOf(zoom);
    if (dir === "in" && idx < levels.length - 1) setZoom(levels[idx + 1]);
    if (dir === "out" && idx > 0) setZoom(levels[idx - 1]);
  }, [zoom]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shrink-0">
        <button
          onClick={() => cycleZoom("out")}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 min-w-[50px] text-center">
          {ZOOM_CONFIG[zoom].label}
        </span>
        <button
          onClick={() => cycleZoom("in")}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-gray-200 dark:bg-gray-700 mx-1" />

        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="inline-block w-3 h-3 rounded-sm bg-red-500/20 border border-red-500" />
          Critical path
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500 ml-2">
          <Diamond className="w-3 h-3 text-amber-500" />
          Milestone
        </div>
      </div>

      {/* Main gantt area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left label column */}
        <div
          className="shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 overflow-y-auto"
          style={{ width: LABEL_WIDTH }}
        >
          {/* Header spacer */}
          <div
            className="border-b border-gray-200 dark:border-gray-800 px-3 flex items-end"
            style={{ height: HEADER_HEIGHT }}
          >
            <span className="text-xs font-medium text-gray-500 pb-2">Task</span>
          </div>

          {/* Task labels */}
          {flatRows.map((task) => (
            <div
              key={task.id}
              onClick={() => onSelectTask(task)}
              className={cn(
                "flex items-center gap-1 px-2 border-b border-gray-100 dark:border-gray-800/50 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors",
                selectedTaskId === task.id && "bg-blue-50 dark:bg-blue-950/30"
              )}
              style={{ height: ROW_HEIGHT, paddingLeft: 8 + (task._depth ?? 0) * 16 }}
            >
              {task._children && task._children.length > 0 ? (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleExpand(task.id); }}
                  className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  {task._expanded ? (
                    <ChevronDown className="w-3 h-3 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-gray-400" />
                  )}
                </button>
              ) : (
                <span className="w-4" />
              )}
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: STATUS_COLORS[task.status] }}
              />
              <span className="text-xs text-gray-900 dark:text-gray-100 truncate flex-1">
                {task.title}
              </span>
              {criticalIds.has(task.id) && (
                <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
              )}
            </div>
          ))}
        </div>

        {/* Right chart area */}
        <div ref={scrollRef} className="flex-1 overflow-auto">
          <svg
            ref={svgRef}
            width={Math.max(chartWidth, 800)}
            height={HEADER_HEIGHT + chartHeight}
            className="select-none"
            style={{ cursor: dragState ? "col-resize" : undefined }}
          >
            {/* Time header - major row */}
            <g>
              {headerLabels
                .filter((l) => l.isMajor)
                .map((l, i) => (
                  <g key={`major-${i}`}>
                    <rect x={l.x} y={0} width={l.width} height={HEADER_HEIGHT / 2} fill="transparent" />
                    <text
                      x={l.x + 6}
                      y={HEADER_HEIGHT / 2 - 6}
                      className="text-[10px] fill-gray-500 dark:fill-gray-400"
                      fontWeight={600}
                    >
                      {l.text}
                    </text>
                    <line x1={l.x} y1={0} x2={l.x} y2={HEADER_HEIGHT / 2} stroke="#e5e7eb" strokeWidth={1} />
                  </g>
                ))}
            </g>

            {/* Time header - minor row */}
            <g>
              {headerLabels
                .filter((l) => !l.isMajor)
                .map((l, i) => (
                  <g key={`minor-${i}`}>
                    <rect x={l.x} y={HEADER_HEIGHT / 2} width={l.width} height={HEADER_HEIGHT / 2} fill="transparent" />
                    <text
                      x={l.x + l.width / 2}
                      y={HEADER_HEIGHT - 6}
                      textAnchor="middle"
                      className="text-[9px] fill-gray-400 dark:fill-gray-500"
                    >
                      {l.text}
                    </text>
                    <line x1={l.x} y1={HEADER_HEIGHT / 2} x2={l.x} y2={HEADER_HEIGHT} stroke="#f3f4f6" strokeWidth={0.5} />
                  </g>
                ))}
            </g>

            {/* Header separator */}
            <line x1={0} y1={HEADER_HEIGHT} x2={chartWidth} y2={HEADER_HEIGHT} stroke="#e5e7eb" strokeWidth={1} />

            {/* Row backgrounds + grid lines */}
            <g>
              {flatRows.map((_, i) => (
                <g key={`row-${i}`}>
                  <rect
                    x={0}
                    y={HEADER_HEIGHT + i * ROW_HEIGHT}
                    width={chartWidth}
                    height={ROW_HEIGHT}
                    fill={i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.015)"}
                  />
                  <line
                    x1={0}
                    y1={HEADER_HEIGHT + (i + 1) * ROW_HEIGHT}
                    x2={chartWidth}
                    y2={HEADER_HEIGHT + (i + 1) * ROW_HEIGHT}
                    stroke="#f3f4f6"
                    strokeWidth={0.5}
                  />
                </g>
              ))}
            </g>

            {/* Today line */}
            {todayX >= 0 && todayX <= chartWidth && (
              <g>
                <line
                  x1={todayX}
                  y1={0}
                  x2={todayX}
                  y2={HEADER_HEIGHT + chartHeight}
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                />
                <text x={todayX + 4} y={12} className="text-[9px] fill-blue-500" fontWeight={600}>
                  Today
                </text>
              </g>
            )}

            {/* Dependency arrows */}
            <g transform={`translate(0, ${HEADER_HEIGHT})`}>
              {renderDependencyArrows()}
            </g>

            {/* Task bars */}
            <g transform={`translate(0, ${HEADER_HEIGHT})`}>
              {flatRows.map((task, rowIdx) => {
                const y = rowIdx * ROW_HEIGHT + BAR_Y_OFFSET;
                const start = task.startDate ? new Date(task.startDate) : task.dueDate ? new Date(task.dueDate) : null;
                const end = task.dueDate ? new Date(task.dueDate) : task.startDate ? new Date(task.startDate) : null;

                if (!start && !end) {
                  // No dates - show a placeholder dot
                  return (
                    <circle
                      key={task.id}
                      cx={todayX}
                      cy={rowIdx * ROW_HEIGHT + ROW_HEIGHT / 2}
                      r={4}
                      fill="#d1d5db"
                      className="cursor-pointer"
                      onClick={() => onSelectTask(task)}
                    />
                  );
                }

                const isCritical = criticalIds.has(task.id);
                const milestone = isMilestone(task);

                if (milestone) {
                  // Render diamond
                  const cx = dateToX(start!);
                  const cy = rowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
                  const size = 8;
                  return (
                    <g key={task.id} className="cursor-pointer" onClick={() => onSelectTask(task)}>
                      <polygon
                        points={`${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`}
                        fill={isCritical ? "#ef4444" : "#f59e0b"}
                        stroke={isCritical ? "#dc2626" : "#d97706"}
                        strokeWidth={1}
                      />
                    </g>
                  );
                }

                const x = dateToX(start!);
                const barWidth = Math.max(dateToX(end!) - x, MIN_BAR_WIDTH);
                const color = STATUS_COLORS[task.status];
                const progressWidth = task.status === "done" ? barWidth : task.status === "in_progress" ? barWidth * 0.5 : 0;

                return (
                  <g key={task.id} className="cursor-pointer" onClick={() => onSelectTask(task)}>
                    {/* Critical path highlight */}
                    {isCritical && (
                      <rect
                        x={x - 2}
                        y={y - 2}
                        width={barWidth + 4}
                        height={BAR_HEIGHT + 4}
                        rx={5}
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth={2}
                        strokeDasharray="4 2"
                        opacity={0.6}
                      />
                    )}

                    {/* Background bar */}
                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={BAR_HEIGHT}
                      rx={4}
                      fill={color}
                      opacity={0.25}
                    />

                    {/* Progress fill */}
                    {progressWidth > 0 && (
                      <rect
                        x={x}
                        y={y}
                        width={progressWidth}
                        height={BAR_HEIGHT}
                        rx={4}
                        fill={color}
                        opacity={0.7}
                      />
                    )}

                    {/* Priority indicator */}
                    <rect
                      x={x}
                      y={y}
                      width={3}
                      height={BAR_HEIGHT}
                      rx={1.5}
                      fill={PRIORITY_COLORS[task.priority]}
                    />

                    {/* Task title on bar */}
                    {barWidth > 60 && (
                      <text
                        x={x + 8}
                        y={y + BAR_HEIGHT / 2 + 3.5}
                        className="text-[10px] fill-gray-700 dark:fill-gray-200"
                        fontWeight={500}
                      >
                        {task.title.length > barWidth / 7 ? task.title.slice(0, Math.floor(barWidth / 7)) + "…" : task.title}
                      </text>
                    )}

                    {/* Drag handles */}
                    <rect
                      x={x - 3}
                      y={y}
                      width={6}
                      height={BAR_HEIGHT}
                      fill="transparent"
                      className="cursor-col-resize"
                      onMouseDown={(e) => handleBarMouseDown(e, task.id, "start")}
                    />
                    <rect
                      x={x + barWidth - 3}
                      y={y}
                      width={6}
                      height={BAR_HEIGHT}
                      fill="transparent"
                      className="cursor-col-resize"
                      onMouseDown={(e) => handleBarMouseDown(e, task.id, "end")}
                    />
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
