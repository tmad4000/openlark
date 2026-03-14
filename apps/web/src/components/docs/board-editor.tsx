"use client";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { type Document as DocType } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  MousePointer2,
  Square,
  Circle,
  ArrowRight,
  StickyNote,
  Type,
  Pencil,
  ZoomIn,
  ZoomOut,
  Trash2,
} from "lucide-react";

// ─── Types ───
type ToolType = "select" | "rectangle" | "circle" | "line" | "sticky" | "text" | "draw";

interface BoardElement {
  id: string;
  type: "rectangle" | "circle" | "line" | "sticky" | "text" | "draw";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  fillColor?: string;
  strokeColor?: string;
  points?: { x: number; y: number }[];
}

let boardIdCounter = 0;
function genBoardId(): string {
  return `b-${Date.now()}-${++boardIdCounter}`;
}

// ─── Board Editor ───
interface BoardEditorProps {
  document: DocType;
  readOnly?: boolean;
  currentUser?: { id: string; displayName: string | null } | null;
}

export function BoardEditor({ document, readOnly = false }: BoardEditorProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [elements, setElements] = useState<BoardElement[]>([]);
  const [tool, setTool] = useState<ToolType>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drawing, setDrawing] = useState<{
    startX: number;
    startY: number;
    id: string;
  } | null>(null);
  const [dragging, setDragging] = useState<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [panning, setPanning] = useState<{
    startX: number;
    startY: number;
    origPanX: number;
    origPanY: number;
  } | null>(null);
  const [drawPoints, setDrawPoints] = useState<{ x: number; y: number }[]>([]);

  const screenToCanvas = useCallback(
    (screenX: number, screenY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (screenX - rect.left - pan.x) / zoom,
        y: (screenY - rect.top - pan.y) / zoom,
      };
    },
    [pan, zoom]
  );

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      if (readOnly) return;
      const pos = screenToCanvas(e.clientX, e.clientY);

      if (tool === "select") {
        // Check if clicking on an element
        const clicked = [...elements].reverse().find((el) => {
          if (el.type === "draw") return false;
          return (
            pos.x >= el.x &&
            pos.x <= el.x + el.width &&
            pos.y >= el.y &&
            pos.y <= el.y + el.height
          );
        });

        if (clicked) {
          setSelectedId(clicked.id);
          setDragging({
            id: clicked.id,
            startX: e.clientX,
            startY: e.clientY,
            origX: clicked.x,
            origY: clicked.y,
          });
        } else {
          setSelectedId(null);
          // Start panning
          setPanning({
            startX: e.clientX,
            startY: e.clientY,
            origPanX: pan.x,
            origPanY: pan.y,
          });
        }
        return;
      }

      if (tool === "draw") {
        setDrawPoints([pos]);
        return;
      }

      // Creating a shape
      const id = genBoardId();
      const defaults: Partial<BoardElement> = {
        rectangle: { fillColor: "#3b82f6", strokeColor: "#2563eb" },
        circle: { fillColor: "#8b5cf6", strokeColor: "#7c3aed" },
        line: { strokeColor: "#374151" },
        sticky: { fillColor: "#fef08a", text: "" },
        text: { text: "Text", fillColor: "#000000" },
      }[tool] ?? {};

      setElements((prev) => [
        ...prev,
        {
          id,
          type: tool as BoardElement["type"],
          x: pos.x,
          y: pos.y,
          width: 0,
          height: 0,
          ...defaults,
        },
      ]);
      setDrawing({ startX: pos.x, startY: pos.y, id });
    },
    [tool, elements, screenToCanvas, readOnly, pan]
  );

  const handleMouseMove = useCallback(
    (e: ReactMouseEvent) => {
      if (dragging) {
        const dx = (e.clientX - dragging.startX) / zoom;
        const dy = (e.clientY - dragging.startY) / zoom;
        setElements((prev) =>
          prev.map((el) =>
            el.id === dragging.id
              ? { ...el, x: dragging.origX + dx, y: dragging.origY + dy }
              : el
          )
        );
        return;
      }

      if (panning) {
        setPan({
          x: panning.origPanX + (e.clientX - panning.startX),
          y: panning.origPanY + (e.clientY - panning.startY),
        });
        return;
      }

      if (tool === "draw" && drawPoints.length > 0) {
        const pos = screenToCanvas(e.clientX, e.clientY);
        setDrawPoints((prev) => [...prev, pos]);
        return;
      }

      if (!drawing) return;
      const pos = screenToCanvas(e.clientX, e.clientY);

      setElements((prev) =>
        prev.map((el) =>
          el.id === drawing.id
            ? {
                ...el,
                x: Math.min(drawing.startX, pos.x),
                y: Math.min(drawing.startY, pos.y),
                width: Math.abs(pos.x - drawing.startX),
                height: Math.abs(pos.y - drawing.startY),
              }
            : el
        )
      );
    },
    [drawing, dragging, panning, zoom, drawPoints, tool, screenToCanvas]
  );

  const handleMouseUp = useCallback(() => {
    if (drawing) {
      setDrawing(null);
      setTool("select");
    }
    if (dragging) setDragging(null);
    if (panning) setPanning(null);

    if (tool === "draw" && drawPoints.length > 1) {
      const minX = Math.min(...drawPoints.map((p) => p.x));
      const minY = Math.min(...drawPoints.map((p) => p.y));
      const maxX = Math.max(...drawPoints.map((p) => p.x));
      const maxY = Math.max(...drawPoints.map((p) => p.y));

      setElements((prev) => [
        ...prev,
        {
          id: genBoardId(),
          type: "draw",
          x: minX,
          y: minY,
          width: maxX - minX || 1,
          height: maxY - minY || 1,
          strokeColor: "#374151",
          points: drawPoints.map((p) => ({ x: p.x - minX, y: p.y - minY })),
        },
      ]);
      setDrawPoints([]);
      setTool("select");
    }
  }, [drawing, dragging, panning, tool, drawPoints]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((z) => Math.max(0.1, Math.min(5, z * delta)));
    },
    []
  );

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setElements((prev) => prev.filter((el) => el.id !== selectedId));
    setSelectedId(null);
  }, [selectedId]);

  useEffect(() => {
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId && globalThis.document.activeElement === canvasRef.current) {
          deleteSelected();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedId, deleteSelected]);

  const tools: { id: ToolType; icon: typeof MousePointer2; label: string }[] = [
    { id: "select", icon: MousePointer2, label: "Select" },
    { id: "rectangle", icon: Square, label: "Rectangle" },
    { id: "circle", icon: Circle, label: "Circle" },
    { id: "line", icon: ArrowRight, label: "Line" },
    { id: "sticky", icon: StickyNote, label: "Sticky Note" },
    { id: "text", icon: Type, label: "Text" },
    { id: "draw", icon: Pencil, label: "Draw" },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-100 dark:bg-gray-950">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className={cn(
              "p-2 rounded-lg transition-colors",
              tool === t.id
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            )}
            title={t.label}
          >
            <t.icon className="w-4 h-4" />
          </button>
        ))}
        <div className="w-px h-5 bg-gray-300 dark:bg-gray-700 mx-1" />
        <button
          onClick={() => setZoom((z) => Math.min(5, z * 1.2))}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <span className="text-xs text-gray-500 min-w-[40px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => Math.max(0.1, z * 0.8))}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        {selectedId && !readOnly && (
          <>
            <div className="w-px h-5 bg-gray-300 dark:bg-gray-700 mx-1" />
            <button
              onClick={deleteSelected}
              className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="flex-1 overflow-hidden cursor-crosshair relative"
        style={{ cursor: tool === "select" ? (dragging ? "grabbing" : "default") : "crosshair" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        tabIndex={0}
      >
        {/* Dot grid pattern */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle, #d1d5db 1px, transparent 1px)`,
            backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        />

        {/* Transform group */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ overflow: "visible" }}
        >
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Drawing preview */}
            {tool === "draw" && drawPoints.length > 1 && (
              <polyline
                points={drawPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="#374151"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {elements.map((el) => {
              const isSelected = selectedId === el.id;

              if (el.type === "draw" && el.points) {
                return (
                  <g key={el.id}>
                    <polyline
                      points={el.points.map((p) => `${el.x + p.x},${el.y + p.y}`).join(" ")}
                      fill="none"
                      stroke={el.strokeColor ?? "#374151"}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                );
              }

              if (el.type === "line") {
                return (
                  <g key={el.id}>
                    <line
                      x1={el.x}
                      y1={el.y}
                      x2={el.x + el.width}
                      y2={el.y + el.height}
                      stroke={el.strokeColor ?? "#374151"}
                      strokeWidth="2"
                      markerEnd="url(#arrowhead)"
                    />
                    {isSelected && (
                      <rect
                        x={el.x - 2}
                        y={el.y - 2}
                        width={el.width + 4}
                        height={el.height + 4}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="1"
                        strokeDasharray="4"
                      />
                    )}
                  </g>
                );
              }

              return (
                <g key={el.id}>
                  {el.type === "rectangle" && (
                    <rect
                      x={el.x}
                      y={el.y}
                      width={el.width}
                      height={el.height}
                      rx={4}
                      fill={el.fillColor ?? "#3b82f6"}
                      stroke={el.strokeColor ?? "#2563eb"}
                      strokeWidth="2"
                      opacity={0.8}
                    />
                  )}
                  {el.type === "circle" && (
                    <ellipse
                      cx={el.x + el.width / 2}
                      cy={el.y + el.height / 2}
                      rx={el.width / 2}
                      ry={el.height / 2}
                      fill={el.fillColor ?? "#8b5cf6"}
                      stroke={el.strokeColor ?? "#7c3aed"}
                      strokeWidth="2"
                      opacity={0.8}
                    />
                  )}
                  {el.type === "sticky" && (
                    <>
                      <rect
                        x={el.x}
                        y={el.y}
                        width={Math.max(el.width, 100)}
                        height={Math.max(el.height, 80)}
                        fill={el.fillColor ?? "#fef08a"}
                        stroke="#e5e7eb"
                        strokeWidth="1"
                        rx={2}
                      />
                      <text
                        x={el.x + 8}
                        y={el.y + 20}
                        fontSize="12"
                        fill="#374151"
                      >
                        {el.text || "Note"}
                      </text>
                    </>
                  )}
                  {el.type === "text" && (
                    <text
                      x={el.x}
                      y={el.y + 16}
                      fontSize="16"
                      fill={el.fillColor ?? "#000000"}
                    >
                      {el.text || "Text"}
                    </text>
                  )}
                  {isSelected && (
                    <rect
                      x={el.x - 2}
                      y={el.y - 2}
                      width={(el.width || 100) + 4}
                      height={(el.height || 80) + 4}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="2"
                      strokeDasharray="4"
                    />
                  )}
                </g>
              );
            })}

            {/* Arrow marker definition */}
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill="#374151" />
              </marker>
            </defs>
          </g>
        </svg>
      </div>
    </div>
  );
}
