"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import {
  MousePointer2,
  Square,
  Circle,
  Minus,
  ArrowRight,
  StickyNote,
  Type,
  Pencil,
  ZoomIn,
  ZoomOut,
  Maximize,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type ShapeType =
  | "rectangle"
  | "circle"
  | "line"
  | "arrow"
  | "sticky"
  | "text"
  | "freeform";

interface BoardShape {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  text: string;
  fontSize: number;
  // freeform points (relative to x,y)
  points?: number[];
  // line/arrow: start/end offsets from x,y
  x2?: number;
  y2?: number;
  rotation: number;
}

export interface Collaborator {
  clientId: number;
  name: string;
  color: string;
}

interface BoardEditorProps {
  documentId: string;
  yjsDocId: string;
  token: string;
  userName: string;
  userColor?: string;
  onSyncStatusChange?: (status: "syncing" | "synced" | "offline") => void;
  onCollaboratorsChange?: (collaborators: Collaborator[]) => void;
}

type Tool =
  | "select"
  | "rectangle"
  | "circle"
  | "line"
  | "arrow"
  | "sticky"
  | "text"
  | "freeform";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function randomColor(): string {
  const colors = [
    "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
    "#3b82f6", "#8b5cf6", "#ec4899",
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function getCollabUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:3002";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.hostname}:3002`;
}

const STICKY_COLORS = [
  "#fef08a", // yellow
  "#bbf7d0", // green
  "#bfdbfe", // blue
  "#fecaca", // red
  "#e9d5ff", // purple
  "#fed7aa", // orange
];

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

// ─── Component ───────────────────────────────────────────────────────────────

export default function BoardEditor({
  documentId,
  yjsDocId,
  token,
  userName,
  userColor,
  onSyncStatusChange,
  onCollaboratorsChange,
}: BoardEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Collaboration
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const myColor = useRef(userColor || randomColor());

  // Board state
  const [shapes, setShapes] = useState<BoardShape[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [collaboratorCursors, setCollaboratorCursors] = useState<
    Array<{ clientId: number; name: string; color: string; x: number; y: number }>
  >([]);

  // Interaction state refs (avoid re-renders during drag)
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOffsetStart = useRef({ x: 0, y: 0 });
  const isDrawing = useRef(false);
  const drawStart = useRef({ x: 0, y: 0 });
  const drawingShapeId = useRef<string | null>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragShapeStart = useRef({ x: 0, y: 0 });
  const isResizing = useRef(false);
  const resizeHandle = useRef<string | null>(null);
  const resizeShapeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const freeformPoints = useRef<number[]>([]);
  const editingTextId = useRef<string | null>(null);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [editTextValue, setEditTextValue] = useState("");
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  // ─── Yjs setup ──────────────────────────────────────────────────────────

  const shapesRef = useRef<BoardShape[]>([]);
  shapesRef.current = shapes;

  useEffect(() => {
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const collabUrl =
      process.env.NEXT_PUBLIC_COLLAB_WS_URL || getCollabUrl();
    const provider = new HocuspocusProvider({
      url: collabUrl,
      name: yjsDocId,
      document: ydoc,
      token,
      onConnect: () => onSyncStatusChange?.("syncing"),
      onDisconnect: () => onSyncStatusChange?.("offline"),
      onSynced: () => onSyncStatusChange?.("synced"),
      onAwarenessUpdate: ({ states }: { states: Array<Record<string, unknown>> }) => {
        const collabs: Collaborator[] = [];
        const cursors: Array<{
          clientId: number;
          name: string;
          color: string;
          x: number;
          y: number;
        }> = [];
        for (const state of states) {
          const u = state.user as
            | { name: string; color: string }
            | undefined;
          const c = state.cursor as { x: number; y: number } | undefined;
          if (u && u.name !== userName) {
            collabs.push({
              clientId: state.clientId as number,
              name: u.name,
              color: u.color,
            });
            if (c) {
              cursors.push({
                clientId: state.clientId as number,
                name: u.name,
                color: u.color,
                x: c.x,
                y: c.y,
              });
            }
          }
        }
        onCollaboratorsChange?.(collabs);
        setCollaboratorCursors(cursors);
      },
    });
    providerRef.current = provider;

    provider.awareness?.setLocalStateField("user", {
      name: userName,
      color: myColor.current,
    });

    // Listen to Yjs map changes
    const yShapes = ydoc.getMap("shapes");
    const syncFromYjs = () => {
      const result: BoardShape[] = [];
      yShapes.forEach((value, key) => {
        result.push({ ...(value as BoardShape), id: key });
      });
      // Sort by insertion order (we rely on id for stability)
      result.sort((a, b) => a.id.localeCompare(b.id));
      setShapes(result);
    };

    yShapes.observe(syncFromYjs);
    // Initial sync
    syncFromYjs();

    return () => {
      yShapes.unobserve(syncFromYjs);
      provider.destroy();
      ydoc.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yjsDocId, token, userName]);

  // ─── Yjs helpers ────────────────────────────────────────────────────────

  const upsertShape = useCallback(
    (shape: BoardShape) => {
      const ydoc = ydocRef.current;
      if (!ydoc) return;
      const yShapes = ydoc.getMap("shapes");
      const { id, ...data } = shape;
      yShapes.set(id, { ...data, id });
    },
    []
  );

  const deleteShape = useCallback(
    (id: string) => {
      const ydoc = ydocRef.current;
      if (!ydoc) return;
      const yShapes = ydoc.getMap("shapes");
      yShapes.delete(id);
    },
    []
  );

  // ─── Coordinate transforms ─────────────────────────────────────────────

  const screenToCanvas = useCallback(
    (sx: number, sy: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (sx - rect.left - panOffset.x) / zoom,
        y: (sy - rect.top - panOffset.y) / zoom,
      };
    },
    [zoom, panOffset]
  );

  // ─── Hit testing ────────────────────────────────────────────────────────

  const hitTest = useCallback(
    (cx: number, cy: number): string | null => {
      // Reverse order for z-index (top shapes first)
      for (let i = shapes.length - 1; i >= 0; i--) {
        const s = shapes[i];
        if (s.type === "line" || s.type === "arrow") {
          // Line hit test: distance to segment
          const x1 = s.x;
          const y1 = s.y;
          const x2 = s.x + (s.x2 || 0);
          const y2 = s.y + (s.y2 || 0);
          const dist = distToSegment(cx, cy, x1, y1, x2, y2);
          if (dist < 8 / zoom) return s.id;
        } else if (s.type === "freeform") {
          // Bounding box check for freeform
          if (
            cx >= s.x &&
            cx <= s.x + s.width &&
            cy >= s.y &&
            cy <= s.y + s.height
          ) {
            return s.id;
          }
        } else if (s.type === "circle") {
          const rx = s.width / 2;
          const ry = s.height / 2;
          const dx = cx - (s.x + rx);
          const dy = cy - (s.y + ry);
          if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1) {
            return s.id;
          }
        } else {
          if (
            cx >= s.x &&
            cx <= s.x + s.width &&
            cy >= s.y &&
            cy <= s.y + s.height
          ) {
            return s.id;
          }
        }
      }
      return null;
    },
    [shapes, zoom]
  );

  const getResizeHandle = useCallback(
    (cx: number, cy: number, shape: BoardShape): string | null => {
      const h = 6 / zoom;
      const corners = [
        { name: "nw", x: shape.x, y: shape.y },
        { name: "ne", x: shape.x + shape.width, y: shape.y },
        { name: "sw", x: shape.x, y: shape.y + shape.height },
        { name: "se", x: shape.x + shape.width, y: shape.y + shape.height },
      ];
      for (const c of corners) {
        if (Math.abs(cx - c.x) < h && Math.abs(cy - c.y) < h) {
          return c.name;
        }
      }
      return null;
    },
    [zoom]
  );

  // ─── Mouse handlers ────────────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Middle mouse or space+left for pan
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        isPanning.current = true;
        panStart.current = { x: e.clientX, y: e.clientY };
        panOffsetStart.current = { ...panOffset };
        e.preventDefault();
        return;
      }

      if (e.button !== 0) return;

      const c = screenToCanvas(e.clientX, e.clientY);

      if (tool === "select") {
        // Check resize handles on selected shape
        if (selectedId) {
          const sel = shapes.find((s) => s.id === selectedId);
          if (sel && sel.type !== "line" && sel.type !== "arrow") {
            const handle = getResizeHandle(c.x, c.y, sel);
            if (handle) {
              isResizing.current = true;
              resizeHandle.current = handle;
              resizeShapeStart.current = {
                x: sel.x,
                y: sel.y,
                w: sel.width,
                h: sel.height,
              };
              drawStart.current = { x: c.x, y: c.y };
              return;
            }
          }
        }

        const hitId = hitTest(c.x, c.y);
        setSelectedId(hitId);
        setEditingText(null);

        if (hitId) {
          const shape = shapes.find((s) => s.id === hitId)!;
          isDragging.current = true;
          dragStart.current = { x: c.x, y: c.y };
          dragShapeStart.current = { x: shape.x, y: shape.y };
        }
        return;
      }

      // Drawing tools
      setSelectedId(null);
      setEditingText(null);
      isDrawing.current = true;
      drawStart.current = { x: c.x, y: c.y };

      if (tool === "freeform") {
        freeformPoints.current = [0, 0];
        const id = generateId();
        drawingShapeId.current = id;
        const shape: BoardShape = {
          id,
          type: "freeform",
          x: c.x,
          y: c.y,
          width: 0,
          height: 0,
          fill: "transparent",
          stroke: "#1e293b",
          strokeWidth: 2,
          text: "",
          fontSize: 16,
          points: [0, 0],
          rotation: 0,
        };
        upsertShape(shape);
      } else if (tool === "text") {
        // Create text shape immediately
        const id = generateId();
        const shape: BoardShape = {
          id,
          type: "text",
          x: c.x,
          y: c.y,
          width: 200,
          height: 40,
          fill: "transparent",
          stroke: "transparent",
          strokeWidth: 0,
          text: "",
          fontSize: 18,
          rotation: 0,
        };
        upsertShape(shape);
        setSelectedId(id);
        setEditingText(id);
        setEditTextValue("");
        editingTextId.current = id;
        isDrawing.current = false;
        setTool("select");
      } else if (tool === "sticky") {
        const id = generateId();
        const stickyColor =
          STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
        const shape: BoardShape = {
          id,
          type: "sticky",
          x: c.x - 75,
          y: c.y - 75,
          width: 150,
          height: 150,
          fill: stickyColor,
          stroke: "transparent",
          strokeWidth: 0,
          text: "",
          fontSize: 14,
          rotation: 0,
        };
        upsertShape(shape);
        setSelectedId(id);
        setEditingText(id);
        setEditTextValue("");
        editingTextId.current = id;
        isDrawing.current = false;
        setTool("select");
      } else {
        const id = generateId();
        drawingShapeId.current = id;
        const shape: BoardShape = {
          id,
          type: tool as ShapeType,
          x: c.x,
          y: c.y,
          width: 0,
          height: 0,
          fill:
            tool === "rectangle"
              ? "#dbeafe"
              : tool === "circle"
                ? "#dcfce7"
                : "transparent",
          stroke: "#1e293b",
          strokeWidth: 2,
          text: "",
          fontSize: 16,
          rotation: 0,
          ...(tool === "line" || tool === "arrow"
            ? { x2: 0, y2: 0 }
            : {}),
        };
        upsertShape(shape);
      }
    },
    [
      tool,
      panOffset,
      screenToCanvas,
      hitTest,
      getResizeHandle,
      selectedId,
      shapes,
      upsertShape,
      zoom,
    ]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const c = screenToCanvas(e.clientX, e.clientY);

      // Update awareness cursor
      providerRef.current?.awareness?.setLocalStateField("cursor", {
        x: c.x,
        y: c.y,
      });

      if (isPanning.current) {
        const dx = e.clientX - panStart.current.x;
        const dy = e.clientY - panStart.current.y;
        setPanOffset({
          x: panOffsetStart.current.x + dx,
          y: panOffsetStart.current.y + dy,
        });
        return;
      }

      if (isResizing.current && selectedId) {
        const sel = shapes.find((s) => s.id === selectedId);
        if (!sel) return;
        const dx = c.x - drawStart.current.x;
        const dy = c.y - drawStart.current.y;
        const r = resizeShapeStart.current;
        const handle = resizeHandle.current;
        let newX = r.x;
        let newY = r.y;
        let newW = r.w;
        let newH = r.h;

        if (handle?.includes("e")) {
          newW = Math.max(20, r.w + dx);
        }
        if (handle?.includes("w")) {
          newW = Math.max(20, r.w - dx);
          newX = r.x + (r.w - newW);
        }
        if (handle?.includes("s")) {
          newH = Math.max(20, r.h + dy);
        }
        if (handle?.includes("n")) {
          newH = Math.max(20, r.h - dy);
          newY = r.y + (r.h - newH);
        }

        upsertShape({
          ...sel,
          x: newX,
          y: newY,
          width: newW,
          height: newH,
        });
        return;
      }

      if (isDragging.current && selectedId) {
        const sel = shapes.find((s) => s.id === selectedId);
        if (!sel) return;
        const dx = c.x - dragStart.current.x;
        const dy = c.y - dragStart.current.y;
        upsertShape({
          ...sel,
          x: dragShapeStart.current.x + dx,
          y: dragShapeStart.current.y + dy,
        });
        return;
      }

      if (isDrawing.current && drawingShapeId.current) {
        const id = drawingShapeId.current;
        const shape = shapes.find((s) => s.id === id);
        if (!shape) return;

        if (shape.type === "freeform") {
          const relX = c.x - shape.x;
          const relY = c.y - shape.y;
          freeformPoints.current.push(relX, relY);
          // Compute bounding box
          let minX = 0,
            minY = 0,
            maxX = 0,
            maxY = 0;
          for (let i = 0; i < freeformPoints.current.length; i += 2) {
            const px = freeformPoints.current[i];
            const py = freeformPoints.current[i + 1];
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
          }
          upsertShape({
            ...shape,
            width: maxX - minX || 1,
            height: maxY - minY || 1,
            points: [...freeformPoints.current],
          });
        } else if (shape.type === "line" || shape.type === "arrow") {
          upsertShape({
            ...shape,
            x2: c.x - drawStart.current.x,
            y2: c.y - drawStart.current.y,
          });
        } else {
          const x = Math.min(drawStart.current.x, c.x);
          const y = Math.min(drawStart.current.y, c.y);
          const w = Math.abs(c.x - drawStart.current.x);
          const h = Math.abs(c.y - drawStart.current.y);
          upsertShape({ ...shape, x, y, width: w, height: h });
        }
      }
    },
    [screenToCanvas, selectedId, shapes, upsertShape, zoom]
  );

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
    isDragging.current = false;
    isResizing.current = false;

    if (isDrawing.current && drawingShapeId.current) {
      const shape = shapes.find((s) => s.id === drawingShapeId.current);
      if (shape) {
        // Remove tiny shapes (accidental clicks)
        if (
          shape.type !== "freeform" &&
          shape.type !== "line" &&
          shape.type !== "arrow" &&
          shape.width < 5 &&
          shape.height < 5
        ) {
          deleteShape(shape.id);
        }
        // For lines/arrows, check length
        if (
          (shape.type === "line" || shape.type === "arrow") &&
          Math.hypot(shape.x2 || 0, shape.y2 || 0) < 5
        ) {
          deleteShape(shape.id);
        }
      }
      setSelectedId(drawingShapeId.current);
    }

    isDrawing.current = false;
    drawingShapeId.current = null;
    freeformPoints.current = [];
  }, [shapes, deleteShape]);

  // ─── Wheel (zoom) ──────────────────────────────────────────────────────

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.001;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + delta * zoom));

      // Zoom toward cursor
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const scale = newZoom / zoom;
        setPanOffset({
          x: mx - scale * (mx - panOffset.x),
          y: my - scale * (my - panOffset.y),
        });
      }

      setZoom(newZoom);
    },
    [zoom, panOffset]
  );

  // ─── Keyboard ──────────────────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingText) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId) {
          deleteShape(selectedId);
          setSelectedId(null);
        }
      }
      if (e.key === "Escape") {
        setSelectedId(null);
        setTool("select");
      }
      // Shortcuts
      if (e.key === "v" || e.key === "V") setTool("select");
      if (e.key === "r" || e.key === "R") setTool("rectangle");
      if (e.key === "o" || e.key === "O") setTool("circle");
      if (e.key === "l" || e.key === "L") setTool("line");
      if (e.key === "a" || e.key === "A") setTool("arrow");
      if (e.key === "s" || e.key === "S") setTool("sticky");
      if (e.key === "t" || e.key === "T") setTool("text");
      if (e.key === "d" || e.key === "D") setTool("freeform");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, editingText, deleteShape]);

  // ─── Double-click to edit text ─────────────────────────────────────────

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const c = screenToCanvas(e.clientX, e.clientY);
      const hitId = hitTest(c.x, c.y);
      if (hitId) {
        const shape = shapes.find((s) => s.id === hitId);
        if (shape && (shape.type === "text" || shape.type === "sticky" || shape.type === "rectangle")) {
          setSelectedId(hitId);
          setEditingText(hitId);
          setEditTextValue(shape.text);
          editingTextId.current = hitId;
        }
      }
    },
    [screenToCanvas, hitTest, shapes]
  );

  // Focus text input when editing
  useEffect(() => {
    if (editingText) {
      setTimeout(() => textInputRef.current?.focus(), 50);
    }
  }, [editingText]);

  const commitTextEdit = useCallback(() => {
    if (editingText) {
      const shape = shapes.find((s) => s.id === editingText);
      if (shape) {
        upsertShape({ ...shape, text: editTextValue });
      }
      setEditingText(null);
      editingTextId.current = null;
    }
  }, [editingText, editTextValue, shapes, upsertShape]);

  // ─── Canvas rendering ──────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, w, h);

    // Draw grid
    ctx.save();
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(zoom, zoom);

    const gridSize = 40;
    const startX = Math.floor(-panOffset.x / zoom / gridSize) * gridSize - gridSize;
    const startY = Math.floor(-panOffset.y / zoom / gridSize) * gridSize - gridSize;
    const endX = startX + w / zoom + gridSize * 2;
    const endY = startY + h / zoom + gridSize * 2;

    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 0.5 / zoom;
    ctx.beginPath();
    for (let x = startX; x <= endX; x += gridSize) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += gridSize) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();

    // Draw shapes
    for (const shape of shapes) {
      drawShape(ctx, shape, shape.id === selectedId, zoom);
    }

    // Draw collaborator cursors
    for (const cursor of collaboratorCursors) {
      ctx.save();
      ctx.translate(cursor.x, cursor.y);

      // Cursor arrow
      ctx.fillStyle = cursor.color;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 14 / zoom);
      ctx.lineTo(4 / zoom, 11 / zoom);
      ctx.lineTo(8 / zoom, 18 / zoom);
      ctx.lineTo(11 / zoom, 16 / zoom);
      ctx.lineTo(6 / zoom, 10 / zoom);
      ctx.lineTo(11 / zoom, 10 / zoom);
      ctx.closePath();
      ctx.fill();

      // Name label
      const fontSize = 11 / zoom;
      ctx.font = `${fontSize}px sans-serif`;
      const tw = ctx.measureText(cursor.name).width;
      const pad = 4 / zoom;
      ctx.fillStyle = cursor.color;
      const rx = 12 / zoom;
      const ry = 14 / zoom;
      ctx.beginPath();
      ctx.roundRect(rx, ry, tw + pad * 2, fontSize + pad * 2, 3 / zoom);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(cursor.name, rx + pad, ry + pad + fontSize * 0.85);

      ctx.restore();
    }

    ctx.restore();
  }, [shapes, selectedId, zoom, panOffset, collaboratorCursors]);

  // Resize canvas on window resize
  useEffect(() => {
    const handleResize = () => {
      // Trigger re-render
      setZoom((z) => z);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ─── Zoom controls ─────────────────────────────────────────────────────

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(MAX_ZOOM, z * 1.2));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(MIN_ZOOM, z / 1.2));
  }, []);

  const zoomFit = useCallback(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  // ─── Toolbar ────────────────────────────────────────────────────────────

  const tools: Array<{ id: Tool; icon: React.ReactNode; label: string; shortcut: string }> = [
    { id: "select", icon: <MousePointer2 className="w-4 h-4" />, label: "Select", shortcut: "V" },
    { id: "rectangle", icon: <Square className="w-4 h-4" />, label: "Rectangle", shortcut: "R" },
    { id: "circle", icon: <Circle className="w-4 h-4" />, label: "Circle", shortcut: "O" },
    { id: "line", icon: <Minus className="w-4 h-4" />, label: "Line", shortcut: "L" },
    { id: "arrow", icon: <ArrowRight className="w-4 h-4" />, label: "Arrow", shortcut: "A" },
    { id: "sticky", icon: <StickyNote className="w-4 h-4" />, label: "Sticky Note", shortcut: "S" },
    { id: "text", icon: <Type className="w-4 h-4" />, label: "Text", shortcut: "T" },
    { id: "freeform", icon: <Pencil className="w-4 h-4" />, label: "Draw", shortcut: "D" },
  ];

  // ─── Text editing overlay position ─────────────────────────────────────

  const editingShape = editingText ? shapes.find((s) => s.id === editingText) : null;
  const textOverlayStyle = useMemo(() => {
    if (!editingShape) return {};
    return {
      left: editingShape.x * zoom + panOffset.x,
      top: editingShape.y * zoom + panOffset.y,
      width: editingShape.width * zoom,
      height: editingShape.height * zoom,
      fontSize: editingShape.fontSize * zoom,
    };
  }, [editingShape, zoom, panOffset]);

  return (
    <div className="h-full flex flex-col bg-slate-50 relative" ref={containerRef}>
      {/* Toolbar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-white rounded-xl shadow-lg border border-gray-200 px-2 py-1.5">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className={`p-2 rounded-lg transition-colors relative group ${
              tool === t.id
                ? "bg-blue-100 text-blue-700"
                : "text-gray-600 hover:bg-gray-100"
            }`}
            title={`${t.label} (${t.shortcut})`}
          >
            {t.icon}
          </button>
        ))}
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1 bg-white rounded-lg shadow-lg border border-gray-200 px-1 py-1">
        <button
          onClick={zoomOut}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-xs text-gray-600 font-medium w-12 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={zoomIn}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <div className="w-px h-4 bg-gray-200 mx-0.5" />
        <button
          onClick={zoomFit}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
          title="Reset zoom"
        >
          <Maximize className="w-4 h-4" />
        </button>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="flex-1 cursor-crosshair"
        style={{
          cursor:
            tool === "select"
              ? isDragging.current
                ? "grabbing"
                : "default"
              : "crosshair",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
      />

      {/* Text editing overlay */}
      {editingShape && (
        <textarea
          ref={textInputRef}
          value={editTextValue}
          onChange={(e) => setEditTextValue(e.target.value)}
          onBlur={commitTextEdit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              commitTextEdit();
            }
          }}
          className="absolute z-30 border-2 border-blue-500 bg-transparent resize-none outline-none p-1"
          style={{
            left: textOverlayStyle.left,
            top: textOverlayStyle.top,
            width: textOverlayStyle.width,
            height: textOverlayStyle.height,
            fontSize: textOverlayStyle.fontSize,
            lineHeight: 1.4,
            fontFamily: "sans-serif",
            color: "#1e293b",
          }}
        />
      )}
    </div>
  );
}

// ─── Shape rendering ──────────────────────────────────────────────────────

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: BoardShape,
  selected: boolean,
  zoom: number
) {
  ctx.save();

  switch (shape.type) {
    case "rectangle": {
      if (shape.fill && shape.fill !== "transparent") {
        ctx.fillStyle = shape.fill;
        ctx.beginPath();
        ctx.roundRect(shape.x, shape.y, shape.width, shape.height, 4);
        ctx.fill();
      }
      if (shape.stroke && shape.stroke !== "transparent") {
        ctx.strokeStyle = shape.stroke;
        ctx.lineWidth = shape.strokeWidth;
        ctx.beginPath();
        ctx.roundRect(shape.x, shape.y, shape.width, shape.height, 4);
        ctx.stroke();
      }
      // Draw text inside
      if (shape.text) {
        drawShapeText(ctx, shape);
      }
      break;
    }
    case "circle": {
      const rx = shape.width / 2;
      const ry = shape.height / 2;
      ctx.beginPath();
      ctx.ellipse(shape.x + rx, shape.y + ry, rx, ry, 0, 0, Math.PI * 2);
      if (shape.fill && shape.fill !== "transparent") {
        ctx.fillStyle = shape.fill;
        ctx.fill();
      }
      if (shape.stroke && shape.stroke !== "transparent") {
        ctx.strokeStyle = shape.stroke;
        ctx.lineWidth = shape.strokeWidth;
        ctx.stroke();
      }
      if (shape.text) {
        drawShapeText(ctx, shape);
      }
      break;
    }
    case "line":
    case "arrow": {
      const x1 = shape.x;
      const y1 = shape.y;
      const x2 = shape.x + (shape.x2 || 0);
      const y2 = shape.y + (shape.y2 || 0);

      ctx.strokeStyle = shape.stroke || "#1e293b";
      ctx.lineWidth = shape.strokeWidth || 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      if (shape.type === "arrow") {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLen = 12;
        ctx.fillStyle = shape.stroke || "#1e293b";
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - headLen * Math.cos(angle - Math.PI / 6),
          y2 - headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          x2 - headLen * Math.cos(angle + Math.PI / 6),
          y2 - headLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case "sticky": {
      // Sticky note with shadow
      ctx.shadowColor = "rgba(0,0,0,0.1)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = shape.fill || "#fef08a";
      ctx.beginPath();
      ctx.roundRect(shape.x, shape.y, shape.width, shape.height, 4);
      ctx.fill();
      ctx.shadowColor = "transparent";

      if (shape.text) {
        drawShapeText(ctx, shape);
      }
      break;
    }
    case "text": {
      ctx.font = `${shape.fontSize}px sans-serif`;
      ctx.fillStyle = "#1e293b";
      ctx.textBaseline = "top";
      const lines = (shape.text || "").split("\n");
      lines.forEach((line, i) => {
        ctx.fillText(line, shape.x + 4, shape.y + 4 + i * shape.fontSize * 1.4);
      });
      break;
    }
    case "freeform": {
      if (shape.points && shape.points.length >= 4) {
        ctx.strokeStyle = shape.stroke || "#1e293b";
        ctx.lineWidth = shape.strokeWidth || 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(shape.x + shape.points[0], shape.y + shape.points[1]);
        for (let i = 2; i < shape.points.length; i += 2) {
          ctx.lineTo(shape.x + shape.points[i], shape.y + shape.points[i + 1]);
        }
        ctx.stroke();
      }
      break;
    }
  }

  // Selection outline
  if (selected) {
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([5 / zoom, 5 / zoom]);

    if (shape.type === "line" || shape.type === "arrow") {
      // Draw selection circles on endpoints
      const x1 = shape.x;
      const y1 = shape.y;
      const x2 = shape.x + (shape.x2 || 0);
      const y2 = shape.y + (shape.y2 || 0);
      ctx.setLineDash([]);
      ctx.fillStyle = "#fff";
      for (const [px, py] of [[x1, y1], [x2, y2]]) {
        ctx.beginPath();
        ctx.arc(px, py, 5 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.rect(
        shape.x - 2 / zoom,
        shape.y - 2 / zoom,
        shape.width + 4 / zoom,
        shape.height + 4 / zoom
      );
      ctx.stroke();
      ctx.setLineDash([]);

      // Resize handles
      const handleSize = 6 / zoom;
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 1.5 / zoom;
      const corners = [
        [shape.x, shape.y],
        [shape.x + shape.width, shape.y],
        [shape.x, shape.y + shape.height],
        [shape.x + shape.width, shape.y + shape.height],
      ];
      for (const [cx, cy] of corners) {
        ctx.beginPath();
        ctx.rect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}

function drawShapeText(ctx: CanvasRenderingContext2D, shape: BoardShape) {
  ctx.font = `${shape.fontSize}px sans-serif`;
  ctx.fillStyle = "#1e293b";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = shape.text.split("\n");
  const lineHeight = shape.fontSize * 1.4;
  const totalHeight = lines.length * lineHeight;
  const startY = shape.y + (shape.height - totalHeight) / 2 + lineHeight / 2;
  lines.forEach((line, i) => {
    ctx.fillText(
      line,
      shape.x + shape.width / 2,
      startY + i * lineHeight,
      shape.width - 16
    );
  });
  ctx.textAlign = "left";
}

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
