"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Diamond, ZoomIn, ZoomOut } from "lucide-react";

// Types expected from parent
interface TaskData {
  id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  priority: "none" | "low" | "medium" | "high" | "urgent";
  assigneeIds: string[];
  creatorId: string;
  dueDate: string | null;
  startDate: string | null;
  parentTaskId: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type DepType = "fs" | "ss" | "ff" | "sf";

interface TaskDep {
  taskId: string;
  dependsOnTaskId: string;
  type: DepType;
}

type ZoomLevel = "day" | "week" | "month";

interface GanttChartProps {
  tasks: TaskData[];
  token: string;
  onTaskClick: (task: TaskData) => void;
  onTaskUpdate: (task: TaskData) => void;
}

// ── Helpers ──────────────────────────────────────────────

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function formatHeaderDate(d: Date, zoom: ZoomLevel): string {
  if (zoom === "day") return `${d.getMonth() + 1}/${d.getDate()}`;
  if (zoom === "week") {
    const end = addDays(d, 6);
    return `${d.getMonth() + 1}/${d.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`;
  }
  return d.toLocaleString("default", { month: "short", year: "numeric" });
}

const COL_WIDTH: Record<ZoomLevel, number> = { day: 36, week: 80, month: 120 };
const ROW_HEIGHT = 40;
const LABEL_WIDTH = 220;
const BAR_HEIGHT = 20;
const BAR_Y_OFFSET = (ROW_HEIGHT - BAR_HEIGHT) / 2;

// ── Critical Path (longest path through dependencies) ────

function computeCriticalPath(
  tasks: TaskData[],
  deps: TaskDep[]
): Set<string> {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  // Build adjacency: for each task, who depends on it (successors)
  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();
  for (const d of deps) {
    if (!successors.has(d.dependsOnTaskId))
      successors.set(d.dependsOnTaskId, []);
    successors.get(d.dependsOnTaskId)!.push(d.taskId);
    if (!predecessors.has(d.taskId)) predecessors.set(d.taskId, []);
    predecessors.get(d.taskId)!.push(d.dependsOnTaskId);
  }

  // Compute "duration" in days for each task
  function duration(t: TaskData): number {
    if (!t.startDate || !t.dueDate) return 1;
    return Math.max(1, diffDays(new Date(t.startDate), new Date(t.dueDate)));
  }

  // Forward pass — earliest start
  const es = new Map<string, number>();
  const visited = new Set<string>();
  function forwardPass(id: string): number {
    if (es.has(id)) return es.get(id)!;
    if (visited.has(id)) return 0; // cycle guard
    visited.add(id);
    const preds = predecessors.get(id) || [];
    let earliest = 0;
    for (const p of preds) {
      const pTask = taskMap.get(p);
      if (!pTask) continue;
      earliest = Math.max(earliest, forwardPass(p) + duration(pTask));
    }
    es.set(id, earliest);
    return earliest;
  }

  for (const t of tasks) forwardPass(t.id);

  // Find the max finish time
  let maxFinish = 0;
  for (const t of tasks) {
    const finish = (es.get(t.id) || 0) + duration(t);
    maxFinish = Math.max(maxFinish, finish);
  }

  // Backward pass — latest start
  const ls = new Map<string, number>();
  const visited2 = new Set<string>();
  function backwardPass(id: string): number {
    if (ls.has(id)) return ls.get(id)!;
    if (visited2.has(id)) return maxFinish; // cycle guard
    visited2.add(id);
    const t = taskMap.get(id);
    if (!t) return maxFinish;
    const succs = successors.get(id) || [];
    let latest = maxFinish - duration(t);
    for (const s of succs) {
      latest = Math.min(latest, backwardPass(s) - duration(t));
    }
    ls.set(id, latest);
    return latest;
  }

  for (const t of tasks) backwardPass(t.id);

  // Critical tasks: where ES == LS (zero float)
  const critical = new Set<string>();
  for (const t of tasks) {
    const e = es.get(t.id) || 0;
    const l = ls.get(t.id) || 0;
    if (Math.abs(e - l) < 0.5) {
      critical.add(t.id);
    }
  }
  return critical;
}

// ── Component ────────────────────────────────────────────

export default function GanttChart({
  tasks,
  token,
  onTaskClick,
  onTaskUpdate,
}: GanttChartProps) {
  const [zoom, setZoom] = useState<ZoomLevel>("week");
  const [allDeps, setAllDeps] = useState<TaskDep[]>([]);
  const [dragging, setDragging] = useState<{
    taskId: string;
    edge: "start" | "end";
    origX: number;
    origDate: Date;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch all dependencies for all tasks
  useEffect(() => {
    if (!token || tasks.length === 0) return;
    let cancelled = false;
    async function fetchDeps() {
      const results: TaskDep[] = [];
      // Batch fetch — get deps for each task
      const promises = tasks.map(async (t) => {
        try {
          const res = await fetch(`/api/tasks/${t.id}/dependencies`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) return;
          const data = await res.json();
          if (data.blocked_by) {
            for (const d of data.blocked_by) {
              results.push({
                taskId: d.taskId,
                dependsOnTaskId: d.dependsOnTaskId,
                type: d.type,
              });
            }
          }
        } catch {
          // ignore individual failures
        }
      });
      await Promise.all(promises);
      if (!cancelled) {
        // Deduplicate
        const seen = new Set<string>();
        const deduped = results.filter((d) => {
          const key = `${d.taskId}-${d.dependsOnTaskId}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setAllDeps(deduped);
      }
    }
    fetchDeps();
    return () => {
      cancelled = true;
    };
  }, [token, tasks]);

  // Filter to tasks that have dates (needed for Gantt)
  const ganttTasks = useMemo(() => {
    return tasks.filter((t) => t.startDate || t.dueDate);
  }, [tasks]);

  // Compute timeline boundaries
  const { timelineStart, timelineEnd, columns } = useMemo(() => {
    if (ganttTasks.length === 0) {
      const now = startOfDay(new Date());
      return {
        timelineStart: now,
        timelineEnd: addDays(now, 30),
        columns: Array.from({ length: 30 }, (_, i) => addDays(now, i)),
      };
    }
    let minDate = new Date(8640000000000000);
    let maxDate = new Date(-8640000000000000);
    for (const t of ganttTasks) {
      const s = t.startDate
        ? startOfDay(new Date(t.startDate))
        : t.dueDate
          ? startOfDay(new Date(t.dueDate))
          : null;
      const e = t.dueDate
        ? startOfDay(new Date(t.dueDate))
        : t.startDate
          ? startOfDay(new Date(t.startDate))
          : null;
      if (s && s < minDate) minDate = s;
      if (e && e > maxDate) maxDate = e;
    }
    // Add padding
    const start = addDays(minDate, -3);
    const end = addDays(maxDate, 7);

    const cols: Date[] = [];
    if (zoom === "day") {
      let cur = new Date(start);
      while (cur <= end) {
        cols.push(new Date(cur));
        cur = addDays(cur, 1);
      }
    } else if (zoom === "week") {
      let cur = new Date(start);
      // Align to Monday
      const dayOfWeek = cur.getDay();
      cur = addDays(cur, dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
      while (cur <= end) {
        cols.push(new Date(cur));
        cur = addDays(cur, 7);
      }
    } else {
      let cur = new Date(start.getFullYear(), start.getMonth(), 1);
      while (cur <= end) {
        cols.push(new Date(cur));
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      }
    }

    return { timelineStart: start, timelineEnd: end, columns: cols };
  }, [ganttTasks, zoom]);

  const colW = COL_WIDTH[zoom];
  const totalWidth = columns.length * colW;
  const totalHeight = ganttTasks.length * ROW_HEIGHT;

  // Map task position
  const taskIndex = useMemo(() => {
    const map = new Map<string, number>();
    ganttTasks.forEach((t, i) => map.set(t.id, i));
    return map;
  }, [ganttTasks]);

  // Critical path
  const criticalSet = useMemo(
    () => computeCriticalPath(ganttTasks, allDeps),
    [ganttTasks, allDeps]
  );

  // Convert date to X position
  const dateToX = useCallback(
    (d: Date): number => {
      const days = diffDays(timelineStart, startOfDay(d));
      if (zoom === "day") return days * colW;
      if (zoom === "week") return (days / 7) * colW;
      // month: approximate
      const months =
        (d.getFullYear() - timelineStart.getFullYear()) * 12 +
        (d.getMonth() - timelineStart.getMonth()) +
        d.getDate() / 30;
      return months * colW;
    },
    [timelineStart, zoom, colW]
  );

  // Is milestone? (same start and end date, or no duration)
  const isMilestone = useCallback((t: TaskData): boolean => {
    if (!t.startDate && !t.dueDate) return false;
    if (t.startDate && t.dueDate) {
      return (
        startOfDay(new Date(t.startDate)).getTime() ===
        startOfDay(new Date(t.dueDate)).getTime()
      );
    }
    // Only one date set — treat as milestone
    return true;
  }, []);

  // Get bar position for a task
  const getBarRect = useCallback(
    (t: TaskData) => {
      const s = t.startDate ? new Date(t.startDate) : new Date(t.dueDate!);
      const e = t.dueDate ? new Date(t.dueDate) : new Date(t.startDate!);
      const x1 = dateToX(s);
      const x2 = dateToX(e) + (zoom === "day" ? colW : colW * 0.14);
      return { x: x1, width: Math.max(x2 - x1, 8) };
    },
    [dateToX, zoom, colW]
  );

  // Drag handlers for resizing bar edges
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, taskId: string, edge: "start" | "end") => {
      e.stopPropagation();
      const task = ganttTasks.find((t) => t.id === taskId);
      if (!task) return;
      const origDate =
        edge === "start"
          ? new Date(task.startDate || task.dueDate!)
          : new Date(task.dueDate || task.startDate!);
      setDragging({ taskId, edge, origX: e.clientX, origDate });
    },
    [ganttTasks]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging) return;
      // Will be applied on mouse up
    },
    [dragging]
  );

  const handleMouseUp = useCallback(
    async (e: React.MouseEvent) => {
      if (!dragging) return;
      const dx = e.clientX - dragging.origX;
      let daysDelta: number;
      if (zoom === "day") daysDelta = Math.round(dx / colW);
      else if (zoom === "week") daysDelta = Math.round((dx / colW) * 7);
      else daysDelta = Math.round((dx / colW) * 30);

      if (daysDelta === 0) {
        setDragging(null);
        return;
      }

      const newDate = addDays(dragging.origDate, daysDelta);
      const task = ganttTasks.find((t) => t.id === dragging.taskId);
      if (!task) {
        setDragging(null);
        return;
      }

      const update: Record<string, string> = {};
      if (dragging.edge === "start") {
        update.start_date = newDate.toISOString();
      } else {
        update.due_date = newDate.toISOString();
      }

      try {
        const res = await fetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(update),
        });
        if (res.ok) {
          const data = await res.json();
          onTaskUpdate(data.task || data);
        }
      } catch {
        // ignore
      }
      setDragging(null);
    },
    [dragging, zoom, colW, ganttTasks, token, onTaskUpdate]
  );

  // Draw dependency arrows
  const depArrows = useMemo(() => {
    const arrows: {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      critical: boolean;
    }[] = [];

    for (const dep of allDeps) {
      const fromIdx = taskIndex.get(dep.dependsOnTaskId);
      const toIdx = taskIndex.get(dep.taskId);
      if (fromIdx === undefined || toIdx === undefined) continue;

      const fromTask = ganttTasks[fromIdx];
      const toTask = ganttTasks[toIdx];
      if (!fromTask || !toTask) continue;

      const fromBar = getBarRect(fromTask);
      const toBar = getBarRect(toTask);

      // Finish-to-Start is default
      let x1: number, y1: number, x2: number, y2: number;
      if (dep.type === "ss") {
        x1 = fromBar.x;
        x2 = toBar.x;
      } else if (dep.type === "ff") {
        x1 = fromBar.x + fromBar.width;
        x2 = toBar.x + toBar.width;
      } else if (dep.type === "sf") {
        x1 = fromBar.x;
        x2 = toBar.x + toBar.width;
      } else {
        // fs
        x1 = fromBar.x + fromBar.width;
        x2 = toBar.x;
      }
      y1 = fromIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
      y2 = toIdx * ROW_HEIGHT + ROW_HEIGHT / 2;

      const isCrit =
        criticalSet.has(dep.dependsOnTaskId) && criticalSet.has(dep.taskId);
      arrows.push({ x1, y1, x2, y2, critical: isCrit });
    }
    return arrows;
  }, [allDeps, taskIndex, ganttTasks, getBarRect, criticalSet]);

  // Today line
  const todayX = dateToX(new Date());

  if (ganttTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400">
        <Diamond size={40} className="mb-2 text-gray-300" />
        <p className="text-sm">
          No tasks with dates to display. Add start/due dates to see the Gantt
          chart.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-6 py-2 border-b border-gray-100">
        <span className="text-xs text-gray-500 mr-1">Zoom:</span>
        {(["day", "week", "month"] as ZoomLevel[]).map((z) => (
          <button
            key={z}
            onClick={() => setZoom(z)}
            className={`px-2.5 py-1 text-xs rounded ${
              zoom === z
                ? "bg-blue-100 text-blue-700 font-medium"
                : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            {z.charAt(0).toUpperCase() + z.slice(1)}
          </button>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <span className="inline-block w-3 h-1.5 rounded bg-red-400" />
          Critical path
          <span className="inline-block w-3 h-3 rotate-45 bg-amber-500 ml-2" />
          Milestone
        </div>
      </div>

      {/* Chart area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left labels */}
        <div
          className="flex-shrink-0 border-r border-gray-200 overflow-y-auto"
          style={{ width: LABEL_WIDTH }}
        >
          {/* Header spacer */}
          <div className="h-8 border-b border-gray-200 bg-gray-50 px-3 flex items-center">
            <span className="text-xs font-medium text-gray-500">Task</span>
          </div>
          {ganttTasks.map((t) => (
            <div
              key={t.id}
              className="flex items-center px-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
              style={{ height: ROW_HEIGHT }}
              onClick={() => onTaskClick(t)}
            >
              <span
                className={`text-xs truncate ${
                  criticalSet.has(t.id)
                    ? "text-red-600 font-medium"
                    : "text-gray-700"
                }`}
              >
                {t.title}
              </span>
            </div>
          ))}
        </div>

        {/* Right chart */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => setDragging(null)}
        >
          {/* Header row */}
          <div
            className="flex h-8 border-b border-gray-200 bg-gray-50 sticky top-0 z-10"
            style={{ width: totalWidth }}
          >
            {columns.map((col, i) => (
              <div
                key={i}
                className="flex-shrink-0 border-r border-gray-100 flex items-center justify-center"
                style={{ width: colW }}
              >
                <span className="text-[10px] text-gray-500">
                  {formatHeaderDate(col, zoom)}
                </span>
              </div>
            ))}
          </div>

          {/* SVG bars */}
          <svg
            ref={svgRef}
            width={totalWidth}
            height={Math.max(totalHeight, 200)}
            className="block"
          >
            {/* Grid lines */}
            {columns.map((_, i) => (
              <line
                key={`grid-${i}`}
                x1={i * colW}
                y1={0}
                x2={i * colW}
                y2={totalHeight}
                stroke="#f3f4f6"
                strokeWidth={1}
              />
            ))}

            {/* Row stripes */}
            {ganttTasks.map((_, i) =>
              i % 2 === 0 ? null : (
                <rect
                  key={`stripe-${i}`}
                  x={0}
                  y={i * ROW_HEIGHT}
                  width={totalWidth}
                  height={ROW_HEIGHT}
                  fill="#fafafa"
                />
              )
            )}

            {/* Today line */}
            <line
              x1={todayX}
              y1={0}
              x2={todayX}
              y2={totalHeight}
              stroke="#3b82f6"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />

            {/* Dependency arrows */}
            {depArrows.map((a, i) => {
              const midX = (a.x1 + a.x2) / 2;
              const path = `M ${a.x1} ${a.y1} C ${midX} ${a.y1}, ${midX} ${a.y2}, ${a.x2} ${a.y2}`;
              return (
                <g key={`dep-${i}`}>
                  <path
                    d={path}
                    fill="none"
                    stroke={a.critical ? "#ef4444" : "#94a3b8"}
                    strokeWidth={a.critical ? 2 : 1.5}
                    markerEnd={
                      a.critical ? "url(#arrowRed)" : "url(#arrowGray)"
                    }
                  />
                </g>
              );
            })}

            {/* Arrow markers */}
            <defs>
              <marker
                id="arrowGray"
                markerWidth="8"
                markerHeight="6"
                refX="8"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L8,3 L0,6 Z" fill="#94a3b8" />
              </marker>
              <marker
                id="arrowRed"
                markerWidth="8"
                markerHeight="6"
                refX="8"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L8,3 L0,6 Z" fill="#ef4444" />
              </marker>
            </defs>

            {/* Task bars */}
            {ganttTasks.map((t, i) => {
              const y = i * ROW_HEIGHT + BAR_Y_OFFSET;
              const isCritical = criticalSet.has(t.id);

              if (isMilestone(t)) {
                // Diamond milestone marker
                const cx = dateToX(
                  new Date(t.startDate || t.dueDate!)
                );
                const cy = i * ROW_HEIGHT + ROW_HEIGHT / 2;
                const size = 8;
                return (
                  <g
                    key={t.id}
                    className="cursor-pointer"
                    onClick={() => onTaskClick(t)}
                  >
                    <polygon
                      points={`${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`}
                      fill={isCritical ? "#ef4444" : "#f59e0b"}
                      stroke={isCritical ? "#dc2626" : "#d97706"}
                      strokeWidth={1}
                    />
                  </g>
                );
              }

              const bar = getBarRect(t);
              const barColor = isCritical
                ? t.status === "done"
                  ? "#fca5a5"
                  : "#ef4444"
                : t.status === "done"
                  ? "#86efac"
                  : t.status === "in_progress"
                    ? "#60a5fa"
                    : "#94a3b8";
              const barBorder = isCritical
                ? "#dc2626"
                : t.status === "done"
                  ? "#22c55e"
                  : t.status === "in_progress"
                    ? "#3b82f6"
                    : "#64748b";

              return (
                <g key={t.id} className="cursor-pointer">
                  {/* Main bar */}
                  <rect
                    x={bar.x}
                    y={y}
                    width={bar.width}
                    height={BAR_HEIGHT}
                    rx={4}
                    fill={barColor}
                    stroke={barBorder}
                    strokeWidth={1}
                    onClick={() => onTaskClick(t)}
                  />
                  {/* Progress overlay for done tasks */}
                  {t.status === "done" && (
                    <rect
                      x={bar.x}
                      y={y}
                      width={bar.width}
                      height={BAR_HEIGHT}
                      rx={4}
                      fill={isCritical ? "#fecaca" : "#bbf7d0"}
                      opacity={0.5}
                    />
                  )}
                  {/* Title inside bar if wide enough */}
                  {bar.width > 60 && (
                    <text
                      x={bar.x + 6}
                      y={y + BAR_HEIGHT / 2 + 1}
                      fill="white"
                      fontSize={10}
                      dominantBaseline="middle"
                      style={{ pointerEvents: "none" }}
                    >
                      {t.title.length > Math.floor(bar.width / 6)
                        ? t.title.slice(0, Math.floor(bar.width / 6)) + "…"
                        : t.title}
                    </text>
                  )}
                  {/* Drag handles on edges */}
                  <rect
                    x={bar.x - 3}
                    y={y}
                    width={6}
                    height={BAR_HEIGHT}
                    fill="transparent"
                    className="cursor-col-resize"
                    onMouseDown={(e) => handleMouseDown(e, t.id, "start")}
                  />
                  <rect
                    x={bar.x + bar.width - 3}
                    y={y}
                    width={6}
                    height={BAR_HEIGHT}
                    fill="transparent"
                    className="cursor-col-resize"
                    onMouseDown={(e) => handleMouseDown(e, t.id, "end")}
                  />
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
