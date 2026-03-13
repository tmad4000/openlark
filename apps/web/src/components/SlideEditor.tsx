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
  Plus,
  Trash2,
  Type,
  Image as ImageIcon,
  Square,
  Circle,
  ArrowRight,
  Play,
  ChevronUp,
  ChevronDown,
  MousePointer2,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Minus,
  Copy,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SlideElement {
  id: string;
  type: "text" | "image" | "shape";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  // text
  content?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  textAlign?: string;
  color?: string;
  // image
  src?: string;
  // shape
  shapeType?: "rectangle" | "circle" | "arrow";
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

interface SlideData {
  id: string;
  elements: SlideElement[];
  background: string;
}

export interface Collaborator {
  clientId: number;
  name: string;
  color: string;
}

interface SlideEditorProps {
  documentId: string;
  yjsDocId: string;
  token: string;
  userName: string;
  userColor?: string;
  onSyncStatusChange?: (status: "syncing" | "synced" | "offline") => void;
  onCollaboratorsChange?: (collaborators: Collaborator[]) => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SLIDE_WIDTH = 960;
const SLIDE_HEIGHT = 540;
const THUMBNAIL_WIDTH = 180;
const THUMBNAIL_HEIGHT = (THUMBNAIL_WIDTH * SLIDE_HEIGHT) / SLIDE_WIDTH;

type Tool = "select" | "text" | "image" | "rectangle" | "circle" | "arrow";

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

// ─── Element Rendering (shared between canvas and thumbnails) ────────────────

function renderElementToCanvas(
  ctx: CanvasRenderingContext2D,
  el: SlideElement,
  scale: number
) {
  ctx.save();
  const x = el.x * scale;
  const y = el.y * scale;
  const w = el.width * scale;
  const h = el.height * scale;

  if (el.rotation) {
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.translate(-(x + w / 2), -(y + h / 2));
  }

  switch (el.type) {
    case "text": {
      const fontSize = (el.fontSize || 24) * scale;
      const weight = el.fontWeight || "normal";
      const style = el.fontStyle || "normal";
      ctx.font = `${style} ${weight} ${fontSize}px sans-serif`;
      ctx.fillStyle = el.color || "#000000";
      ctx.textAlign = (el.textAlign as CanvasTextAlign) || "left";
      ctx.textBaseline = "top";
      const textX =
        el.textAlign === "center"
          ? x + w / 2
          : el.textAlign === "right"
            ? x + w
            : x;
      const lines = (el.content || "Text").split("\n");
      lines.forEach((line, i) => {
        ctx.fillText(line, textX + 4 * scale, y + 4 * scale + i * fontSize * 1.3, w - 8 * scale);
      });
      break;
    }
    case "image": {
      // Draw placeholder in thumbnails
      ctx.fillStyle = "#e5e7eb";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#9ca3af";
      ctx.lineWidth = scale;
      ctx.strokeRect(x, y, w, h);
      // Draw image icon placeholder
      ctx.fillStyle = "#9ca3af";
      const iconSize = Math.min(w, h) * 0.3;
      ctx.fillRect(x + w / 2 - iconSize / 2, y + h / 2 - iconSize / 2, iconSize, iconSize);
      break;
    }
    case "shape": {
      ctx.fillStyle = el.fill || "#3b82f6";
      ctx.strokeStyle = el.stroke || "#1d4ed8";
      ctx.lineWidth = (el.strokeWidth || 2) * scale;

      if (el.shapeType === "circle") {
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (el.shapeType === "arrow") {
        const midY = y + h / 2;
        const headLen = Math.min(w * 0.2, 20 * scale);
        ctx.beginPath();
        ctx.moveTo(x, midY);
        ctx.lineTo(x + w - headLen, midY);
        ctx.lineTo(x + w - headLen, y + h * 0.2);
        ctx.lineTo(x + w, midY);
        ctx.lineTo(x + w - headLen, y + h * 0.8);
        ctx.lineTo(x + w - headLen, midY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        // rectangle
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      }
      break;
    }
  }

  ctx.restore();
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SlideEditor({
  documentId,
  yjsDocId,
  token,
  userName,
  userColor,
  onSyncStatusChange,
  onCollaboratorsChange,
}: SlideEditorProps) {
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [elementStart, setElementStart] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [isCreating, setIsCreating] = useState(false);
  const [createStart, setCreateStart] = useState({ x: 0, y: 0 });
  const [isPresenting, setIsPresenting] = useState(false);
  const [presentSlideIndex, setPresentSlideIndex] = useState(0);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [canvasScale, setCanvasScale] = useState(1);
  const [loadedImages, setLoadedImages] = useState<Record<string, HTMLImageElement>>({});

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const colorRef = useRef(userColor || randomColor());

  // ─── Yjs Setup ───────────────────────────────────────────────────────────

  const syncSlidesToYjs = useCallback((slidesData: SlideData[]) => {
    const ydoc = ydocRef.current;
    if (!ydoc) return;
    const ySlides = ydoc.getArray<Y.Map<unknown>>("slides");

    ydoc.transact(() => {
      // Clear and rebuild - simple approach for slides
      ySlides.delete(0, ySlides.length);
      slidesData.forEach((slide) => {
        const ySlide = new Y.Map<unknown>();
        ySlide.set("id", slide.id);
        ySlide.set("background", slide.background);
        const yElements = new Y.Array<Y.Map<unknown>>();
        slide.elements.forEach((el) => {
          const yEl = new Y.Map<unknown>();
          Object.entries(el).forEach(([key, value]) => {
            if (value !== undefined) {
              yEl.set(key, value);
            }
          });
          yElements.push([yEl]);
        });
        ySlide.set("elements", yElements);
        ySlides.push([ySlide]);
      });
    });
  }, []);

  const readSlidesFromYjs = useCallback((): SlideData[] => {
    const ydoc = ydocRef.current;
    if (!ydoc) return [];
    const ySlides = ydoc.getArray<Y.Map<unknown>>("slides");
    const result: SlideData[] = [];

    ySlides.forEach((ySlide) => {
      const id = (ySlide.get("id") as string) || generateId();
      const background = (ySlide.get("background") as string) || "#ffffff";
      const yElements = ySlide.get("elements") as Y.Array<Y.Map<unknown>> | undefined;
      const elements: SlideElement[] = [];

      if (yElements) {
        yElements.forEach((yEl) => {
          const el: Record<string, unknown> = {};
          yEl.forEach((value, key) => {
            el[key] = value;
          });
          elements.push(el as unknown as SlideElement);
        });
      }

      result.push({ id, elements, background });
    });

    return result;
  }, []);

  useEffect(() => {
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const provider = new HocuspocusProvider({
      url: getCollabUrl(),
      name: yjsDocId,
      document: ydoc,
      token,
    });
    providerRef.current = provider;

    // Sync status
    provider.on("synced", () => {
      onSyncStatusChange?.("synced");
      // Read initial state
      const initialSlides = readSlidesFromYjs();
      if (initialSlides.length === 0) {
        // Create first slide
        const firstSlide: SlideData = {
          id: generateId(),
          elements: [],
          background: "#ffffff",
        };
        setSlides([firstSlide]);
        syncSlidesToYjs([firstSlide]);
      } else {
        setSlides(initialSlides);
      }
    });

    provider.on("status", ({ status }: { status: string }) => {
      if (status === "connecting") {
        onSyncStatusChange?.("syncing");
      } else if (status === "disconnected") {
        onSyncStatusChange?.("offline");
      }
    });

    // Listen for remote changes
    const ySlides = ydoc.getArray<Y.Map<unknown>>("slides");
    const observer = () => {
      const updated = readSlidesFromYjs();
      setSlides(updated);
    };
    ySlides.observeDeep(observer);

    // Awareness / collaborators
    const awareness = provider.awareness;
    if (awareness) {
      awareness.setLocalStateField("user", {
        name: userName,
        color: colorRef.current,
      });

      const awarenessHandler = () => {
        const states = awareness.getStates();
        const collabs: Collaborator[] = [];
        states.forEach((state, clientId) => {
          if (clientId !== awareness.clientID && state.user) {
            collabs.push({
              clientId,
              name: state.user.name,
              color: state.user.color,
            });
          }
        });
        onCollaboratorsChange?.(collabs);
      };

      awareness.on("change", awarenessHandler);
    }

    return () => {
      provider.destroy();
      ydoc.destroy();
    };
  }, [yjsDocId, token, userName, onSyncStatusChange, onCollaboratorsChange, readSlidesFromYjs, syncSlidesToYjs]);

  // ─── Canvas Scaling ──────────────────────────────────────────────────────

  useEffect(() => {
    const updateScale = () => {
      if (!canvasContainerRef.current) return;
      const containerW = canvasContainerRef.current.clientWidth - 48;
      const containerH = canvasContainerRef.current.clientHeight - 48;
      const scaleW = containerW / SLIDE_WIDTH;
      const scaleH = containerH / SLIDE_HEIGHT;
      setCanvasScale(Math.min(scaleW, scaleH, 1));
    };

    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  // ─── Current Slide ───────────────────────────────────────────────────────

  const currentSlide = slides[currentSlideIndex] || null;
  const selectedElement = currentSlide?.elements.find(
    (el) => el.id === selectedElementId
  ) || null;

  // ─── Canvas Rendering ────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentSlide) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = SLIDE_WIDTH * canvasScale;
    const h = SLIDE_HEIGHT * canvasScale;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = currentSlide.background;
    ctx.fillRect(0, 0, w, h);

    // Elements
    currentSlide.elements.forEach((el) => {
      if (el.type === "image" && el.src && loadedImages[el.id]) {
        const img = loadedImages[el.id];
        ctx.save();
        const sx = el.x * canvasScale;
        const sy = el.y * canvasScale;
        const sw = el.width * canvasScale;
        const sh = el.height * canvasScale;
        if (el.rotation) {
          ctx.translate(sx + sw / 2, sy + sh / 2);
          ctx.rotate((el.rotation * Math.PI) / 180);
          ctx.translate(-(sx + sw / 2), -(sy + sh / 2));
        }
        ctx.drawImage(img, sx, sy, sw, sh);
        ctx.restore();
      } else {
        renderElementToCanvas(ctx, el, canvasScale);
      }
    });

    // Selection handles
    if (selectedElement && editingTextId !== selectedElement.id) {
      const sx = selectedElement.x * canvasScale;
      const sy = selectedElement.y * canvasScale;
      const sw = selectedElement.width * canvasScale;
      const sh = selectedElement.height * canvasScale;

      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(sx, sy, sw, sh);

      // Corner handles
      const handleSize = 8;
      const handles = [
        { x: sx - handleSize / 2, y: sy - handleSize / 2 },
        { x: sx + sw - handleSize / 2, y: sy - handleSize / 2 },
        { x: sx - handleSize / 2, y: sy + sh - handleSize / 2 },
        { x: sx + sw - handleSize / 2, y: sy + sh - handleSize / 2 },
      ];

      handles.forEach((handle) => {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(handle.x, handle.y, handleSize, handleSize);
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 2;
        ctx.strokeRect(handle.x, handle.y, handleSize, handleSize);
      });
    }
  }, [currentSlide, selectedElement, canvasScale, editingTextId, loadedImages]);

  // ─── Slide Mutations ─────────────────────────────────────────────────────

  const updateSlides = useCallback(
    (updater: (prev: SlideData[]) => SlideData[]) => {
      setSlides((prev) => {
        const next = updater(prev);
        syncSlidesToYjs(next);
        return next;
      });
    },
    [syncSlidesToYjs]
  );

  const addSlide = useCallback(() => {
    const newSlide: SlideData = {
      id: generateId(),
      elements: [],
      background: "#ffffff",
    };
    updateSlides((prev) => {
      const next = [...prev];
      next.splice(currentSlideIndex + 1, 0, newSlide);
      return next;
    });
    setCurrentSlideIndex((prev) => prev + 1);
    setSelectedElementId(null);
  }, [currentSlideIndex, updateSlides]);

  const deleteSlide = useCallback(() => {
    if (slides.length <= 1) return;
    updateSlides((prev) => prev.filter((_, i) => i !== currentSlideIndex));
    setCurrentSlideIndex((prev) => Math.max(0, prev - 1));
    setSelectedElementId(null);
  }, [slides.length, currentSlideIndex, updateSlides]);

  const moveSlide = useCallback(
    (direction: "up" | "down") => {
      const targetIndex =
        direction === "up" ? currentSlideIndex - 1 : currentSlideIndex + 1;
      if (targetIndex < 0 || targetIndex >= slides.length) return;

      updateSlides((prev) => {
        const next = [...prev];
        [next[currentSlideIndex], next[targetIndex]] = [
          next[targetIndex],
          next[currentSlideIndex],
        ];
        return next;
      });
      setCurrentSlideIndex(targetIndex);
    },
    [currentSlideIndex, slides.length, updateSlides]
  );

  const duplicateSlide = useCallback(() => {
    if (!currentSlide) return;
    const newSlide: SlideData = {
      id: generateId(),
      elements: currentSlide.elements.map((el) => ({ ...el, id: generateId() })),
      background: currentSlide.background,
    };
    updateSlides((prev) => {
      const next = [...prev];
      next.splice(currentSlideIndex + 1, 0, newSlide);
      return next;
    });
    setCurrentSlideIndex((prev) => prev + 1);
  }, [currentSlide, currentSlideIndex, updateSlides]);

  // ─── Element Mutations ───────────────────────────────────────────────────

  const addElement = useCallback(
    (element: SlideElement) => {
      updateSlides((prev) =>
        prev.map((slide, i) =>
          i === currentSlideIndex
            ? { ...slide, elements: [...slide.elements, element] }
            : slide
        )
      );
      setSelectedElementId(element.id);
      setActiveTool("select");
    },
    [currentSlideIndex, updateSlides]
  );

  const updateElement = useCallback(
    (elementId: string, updates: Partial<SlideElement>) => {
      updateSlides((prev) =>
        prev.map((slide, i) =>
          i === currentSlideIndex
            ? {
                ...slide,
                elements: slide.elements.map((el) =>
                  el.id === elementId ? { ...el, ...updates } : el
                ),
              }
            : slide
        )
      );
    },
    [currentSlideIndex, updateSlides]
  );

  const deleteElement = useCallback(() => {
    if (!selectedElementId) return;
    updateSlides((prev) =>
      prev.map((slide, i) =>
        i === currentSlideIndex
          ? {
              ...slide,
              elements: slide.elements.filter((el) => el.id !== selectedElementId),
            }
          : slide
      )
    );
    setSelectedElementId(null);
    setEditingTextId(null);
  }, [selectedElementId, currentSlideIndex, updateSlides]);

  // ─── Canvas Mouse Handlers ───────────────────────────────────────────────

  const getCanvasPos = useCallback(
    (e: React.MouseEvent): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) / canvasScale,
        y: (e.clientY - rect.top) / canvasScale,
      };
    },
    [canvasScale]
  );

  const getResizeHandle = useCallback(
    (pos: { x: number; y: number }, el: SlideElement): string | null => {
      const handleSize = 10 / canvasScale;
      const handles: Record<string, { x: number; y: number }> = {
        nw: { x: el.x, y: el.y },
        ne: { x: el.x + el.width, y: el.y },
        sw: { x: el.x, y: el.y + el.height },
        se: { x: el.x + el.width, y: el.y + el.height },
      };

      for (const [name, handle] of Object.entries(handles)) {
        if (
          Math.abs(pos.x - handle.x) < handleSize &&
          Math.abs(pos.y - handle.y) < handleSize
        ) {
          return name;
        }
      }
      return null;
    },
    [canvasScale]
  );

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const pos = getCanvasPos(e);

      if (activeTool !== "select") {
        // Start creating element
        setIsCreating(true);
        setCreateStart(pos);
        return;
      }

      if (!currentSlide) return;

      // Check if clicking resize handle on selected element
      if (selectedElement) {
        const handle = getResizeHandle(pos, selectedElement);
        if (handle) {
          setIsResizing(true);
          setResizeHandle(handle);
          setDragStart(pos);
          setElementStart({
            x: selectedElement.x,
            y: selectedElement.y,
            w: selectedElement.width,
            h: selectedElement.height,
          });
          return;
        }
      }

      // Hit test elements (reverse order for z-index)
      let hitElement: SlideElement | null = null;
      for (let i = currentSlide.elements.length - 1; i >= 0; i--) {
        const el = currentSlide.elements[i];
        if (
          pos.x >= el.x &&
          pos.x <= el.x + el.width &&
          pos.y >= el.y &&
          pos.y <= el.y + el.height
        ) {
          hitElement = el;
          break;
        }
      }

      if (hitElement) {
        if (selectedElementId === hitElement.id && hitElement.type === "text") {
          // Double click to edit text
          setEditingTextId(hitElement.id);
          setTimeout(() => textInputRef.current?.focus(), 0);
        } else {
          setSelectedElementId(hitElement.id);
          setEditingTextId(null);
          setIsDragging(true);
          setDragStart(pos);
          setElementStart({
            x: hitElement.x,
            y: hitElement.y,
            w: hitElement.width,
            h: hitElement.height,
          });
        }
      } else {
        setSelectedElementId(null);
        setEditingTextId(null);
      }
    },
    [activeTool, currentSlide, selectedElement, selectedElementId, getCanvasPos, getResizeHandle]
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const pos = getCanvasPos(e);

      if (isCreating) {
        // Preview will be handled in next render
        return;
      }

      if (isDragging && selectedElementId) {
        const dx = pos.x - dragStart.x;
        const dy = pos.y - dragStart.y;
        updateElement(selectedElementId, {
          x: Math.max(0, Math.min(SLIDE_WIDTH - elementStart.w, elementStart.x + dx)),
          y: Math.max(0, Math.min(SLIDE_HEIGHT - elementStart.h, elementStart.y + dy)),
        });
      }

      if (isResizing && selectedElementId && resizeHandle) {
        const dx = pos.x - dragStart.x;
        const dy = pos.y - dragStart.y;
        let newX = elementStart.x;
        let newY = elementStart.y;
        let newW = elementStart.w;
        let newH = elementStart.h;

        if (resizeHandle.includes("e")) {
          newW = Math.max(20, elementStart.w + dx);
        }
        if (resizeHandle.includes("w")) {
          newX = elementStart.x + dx;
          newW = Math.max(20, elementStart.w - dx);
        }
        if (resizeHandle.includes("s")) {
          newH = Math.max(20, elementStart.h + dy);
        }
        if (resizeHandle.includes("n")) {
          newY = elementStart.y + dy;
          newH = Math.max(20, elementStart.h - dy);
        }

        updateElement(selectedElementId, {
          x: newX,
          y: newY,
          width: newW,
          height: newH,
        });
      }
    },
    [
      isCreating,
      isDragging,
      isResizing,
      selectedElementId,
      resizeHandle,
      dragStart,
      elementStart,
      getCanvasPos,
      updateElement,
    ]
  );

  const handleCanvasMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (isCreating) {
        const pos = getCanvasPos(e);
        const x = Math.min(createStart.x, pos.x);
        const y = Math.min(createStart.y, pos.y);
        const w = Math.max(Math.abs(pos.x - createStart.x), 40);
        const h = Math.max(Math.abs(pos.y - createStart.y), 40);

        const id = generateId();
        let element: SlideElement;

        switch (activeTool) {
          case "text":
            element = {
              id,
              type: "text",
              x,
              y,
              width: Math.max(w, 200),
              height: Math.max(h, 50),
              rotation: 0,
              content: "Text",
              fontSize: 24,
              fontWeight: "normal",
              fontStyle: "normal",
              textAlign: "left",
              color: "#000000",
            };
            break;
          case "image":
            element = {
              id,
              type: "image",
              x,
              y,
              width: Math.max(w, 200),
              height: Math.max(h, 150),
              rotation: 0,
              src: "",
            };
            // Trigger file upload
            fileInputRef.current?.click();
            break;
          case "rectangle":
            element = {
              id,
              type: "shape",
              x,
              y,
              width: Math.max(w, 100),
              height: Math.max(h, 80),
              rotation: 0,
              shapeType: "rectangle",
              fill: "#3b82f6",
              stroke: "#1d4ed8",
              strokeWidth: 2,
            };
            break;
          case "circle":
            element = {
              id,
              type: "shape",
              x,
              y,
              width: Math.max(w, 100),
              height: Math.max(w, 100),
              rotation: 0,
              shapeType: "circle",
              fill: "#22c55e",
              stroke: "#15803d",
              strokeWidth: 2,
            };
            break;
          case "arrow":
            element = {
              id,
              type: "shape",
              x,
              y,
              width: Math.max(w, 150),
              height: Math.max(h, 40),
              rotation: 0,
              shapeType: "arrow",
              fill: "#f97316",
              stroke: "#c2410c",
              strokeWidth: 2,
            };
            break;
          default:
            setIsCreating(false);
            return;
        }

        addElement(element);
        setIsCreating(false);
        return;
      }

      setIsDragging(false);
      setIsResizing(false);
      setResizeHandle(null);
    },
    [isCreating, createStart, activeTool, getCanvasPos, addElement]
  );

  // ─── Image Upload ────────────────────────────────────────────────────────

  const pendingImageElementRef = useRef<string | null>(null);

  const handleImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        // Find the most recently added image element (or the selected one)
        const targetId = selectedElementId;
        if (targetId) {
          updateElement(targetId, { src: dataUrl });
          // Load image for rendering
          const img = new Image();
          img.onload = () => {
            setLoadedImages((prev) => ({ ...prev, [targetId]: img }));
          };
          img.src = dataUrl;
        }
      };
      reader.readAsDataURL(file);
      // Reset input
      e.target.value = "";
    },
    [selectedElementId, updateElement]
  );

  // Load images when slides change
  useEffect(() => {
    if (!currentSlide) return;
    currentSlide.elements.forEach((el) => {
      if (el.type === "image" && el.src && !loadedImages[el.id]) {
        const img = new Image();
        img.onload = () => {
          setLoadedImages((prev) => ({ ...prev, [el.id]: img }));
        };
        img.src = el.src;
      }
    });
  }, [currentSlide, loadedImages]);

  // ─── Keyboard Shortcuts ──────────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isPresenting) {
        if (e.key === "Escape") {
          setIsPresenting(false);
        } else if (e.key === "ArrowRight" || e.key === " ") {
          setPresentSlideIndex((prev) => Math.min(prev + 1, slides.length - 1));
        } else if (e.key === "ArrowLeft") {
          setPresentSlideIndex((prev) => Math.max(prev - 1, 0));
        }
        return;
      }

      if (editingTextId) return; // Don't intercept when editing text

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedElementId) {
          e.preventDefault();
          deleteElement();
        }
      }

      if (e.key === "Escape") {
        setSelectedElementId(null);
        setActiveTool("select");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPresenting, editingTextId, selectedElementId, slides.length, deleteElement]);

  // ─── Presenter View ──────────────────────────────────────────────────────

  const startPresentation = useCallback(() => {
    setPresentSlideIndex(currentSlideIndex);
    setIsPresenting(true);
  }, [currentSlideIndex]);

  // ─── Thumbnail Rendering ─────────────────────────────────────────────────

  const ThumbnailCanvas = useMemo(() => {
    return function ThumbnailCanvasInner({
      slide,
      index,
      isActive,
    }: {
      slide: SlideData;
      index: number;
      isActive: boolean;
    }) {
      const thumbRef = useRef<HTMLCanvasElement>(null);

      useEffect(() => {
        const canvas = thumbRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const scale = THUMBNAIL_WIDTH / SLIDE_WIDTH;
        const dpr = window.devicePixelRatio || 1;

        canvas.width = THUMBNAIL_WIDTH * dpr;
        canvas.height = THUMBNAIL_HEIGHT * dpr;
        canvas.style.width = `${THUMBNAIL_WIDTH}px`;
        canvas.style.height = `${THUMBNAIL_HEIGHT}px`;
        ctx.scale(dpr, dpr);

        ctx.fillStyle = slide.background;
        ctx.fillRect(0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);

        slide.elements.forEach((el) => {
          renderElementToCanvas(ctx, el, scale);
        });
      }, [slide]);

      return (
        <button
          onClick={() => {
            setCurrentSlideIndex(index);
            setSelectedElementId(null);
            setEditingTextId(null);
          }}
          className={`relative group flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
            isActive
              ? "border-blue-500 shadow-md"
              : "border-gray-200 hover:border-gray-300"
          }`}
        >
          <canvas ref={thumbRef} className="block" />
          <div className="absolute bottom-1 left-1 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded">
            {index + 1}
          </div>
        </button>
      );
    };
  }, []);

  // ─── Presenter Overlay ───────────────────────────────────────────────────

  if (isPresenting) {
    const presSlide = slides[presentSlideIndex];
    return (
      <div
        className="fixed inset-0 bg-black z-50 flex items-center justify-center cursor-none"
        onClick={(e) => {
          // Click right half = next, left half = previous
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          if (e.clientX > rect.width / 2) {
            setPresentSlideIndex((prev) =>
              Math.min(prev + 1, slides.length - 1)
            );
          } else {
            setPresentSlideIndex((prev) => Math.max(prev - 1, 0));
          }
        }}
      >
        {presSlide && (
          <PresentationSlide slide={presSlide} loadedImages={loadedImages} />
        )}

        {/* Slide counter */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white text-sm px-3 py-1 rounded-full opacity-0 hover:opacity-100 transition-opacity">
          {presentSlideIndex + 1} / {slides.length}
        </div>

        {/* Exit button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsPresenting(false);
          }}
          className="absolute top-4 right-4 bg-black/50 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-black/70 transition-colors opacity-0 hover:opacity-100"
        >
          Exit (Esc)
        </button>
      </div>
    );
  }

  // ─── Main Layout ─────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 bg-white border-b border-gray-200">
        {/* Tool buttons */}
        <ToolButton
          icon={<MousePointer2 className="w-4 h-4" />}
          label="Select"
          active={activeTool === "select"}
          onClick={() => setActiveTool("select")}
        />
        <div className="w-px h-6 bg-gray-200 mx-1" />
        <ToolButton
          icon={<Type className="w-4 h-4" />}
          label="Text"
          active={activeTool === "text"}
          onClick={() => setActiveTool("text")}
        />
        <ToolButton
          icon={<ImageIcon className="w-4 h-4" />}
          label="Image"
          active={activeTool === "image"}
          onClick={() => setActiveTool("image")}
        />
        <div className="w-px h-6 bg-gray-200 mx-1" />
        <ToolButton
          icon={<Square className="w-4 h-4" />}
          label="Rectangle"
          active={activeTool === "rectangle"}
          onClick={() => setActiveTool("rectangle")}
        />
        <ToolButton
          icon={<Circle className="w-4 h-4" />}
          label="Circle"
          active={activeTool === "circle"}
          onClick={() => setActiveTool("circle")}
        />
        <ToolButton
          icon={<ArrowRight className="w-4 h-4" />}
          label="Arrow"
          active={activeTool === "arrow"}
          onClick={() => setActiveTool("arrow")}
        />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Element formatting (when element selected) */}
        {selectedElement && selectedElement.type === "text" && (
          <div className="flex items-center gap-1">
            <ToolButton
              icon={<Bold className="w-4 h-4" />}
              label="Bold"
              active={selectedElement.fontWeight === "bold"}
              onClick={() =>
                updateElement(selectedElement.id, {
                  fontWeight:
                    selectedElement.fontWeight === "bold" ? "normal" : "bold",
                })
              }
            />
            <ToolButton
              icon={<Italic className="w-4 h-4" />}
              label="Italic"
              active={selectedElement.fontStyle === "italic"}
              onClick={() =>
                updateElement(selectedElement.id, {
                  fontStyle:
                    selectedElement.fontStyle === "italic" ? "normal" : "italic",
                })
              }
            />
            <div className="w-px h-6 bg-gray-200 mx-1" />
            <ToolButton
              icon={<AlignLeft className="w-4 h-4" />}
              label="Align Left"
              active={selectedElement.textAlign === "left" || !selectedElement.textAlign}
              onClick={() => updateElement(selectedElement.id, { textAlign: "left" })}
            />
            <ToolButton
              icon={<AlignCenter className="w-4 h-4" />}
              label="Align Center"
              active={selectedElement.textAlign === "center"}
              onClick={() => updateElement(selectedElement.id, { textAlign: "center" })}
            />
            <ToolButton
              icon={<AlignRight className="w-4 h-4" />}
              label="Align Right"
              active={selectedElement.textAlign === "right"}
              onClick={() => updateElement(selectedElement.id, { textAlign: "right" })}
            />
            <div className="w-px h-6 bg-gray-200 mx-1" />
            <label className="flex items-center gap-1 text-xs text-gray-600">
              Size
              <input
                type="number"
                min={8}
                max={200}
                value={selectedElement.fontSize || 24}
                onChange={(e) =>
                  updateElement(selectedElement.id, {
                    fontSize: parseInt(e.target.value) || 24,
                  })
                }
                className="w-12 px-1 py-0.5 text-xs border border-gray-300 rounded"
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-gray-600">
              Color
              <input
                type="color"
                value={selectedElement.color || "#000000"}
                onChange={(e) =>
                  updateElement(selectedElement.id, { color: e.target.value })
                }
                className="w-6 h-6 border border-gray-300 rounded cursor-pointer"
              />
            </label>
          </div>
        )}

        {selectedElement && selectedElement.type === "shape" && (
          <div className="flex items-center gap-1">
            <label className="flex items-center gap-1 text-xs text-gray-600">
              Fill
              <input
                type="color"
                value={selectedElement.fill || "#3b82f6"}
                onChange={(e) =>
                  updateElement(selectedElement.id, { fill: e.target.value })
                }
                className="w-6 h-6 border border-gray-300 rounded cursor-pointer"
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-gray-600">
              Stroke
              <input
                type="color"
                value={selectedElement.stroke || "#1d4ed8"}
                onChange={(e) =>
                  updateElement(selectedElement.id, { stroke: e.target.value })
                }
                className="w-6 h-6 border border-gray-300 rounded cursor-pointer"
              />
            </label>
          </div>
        )}

        {selectedElement && (
          <>
            <div className="w-px h-6 bg-gray-200 mx-1" />
            <ToolButton
              icon={<Trash2 className="w-4 h-4 text-red-500" />}
              label="Delete"
              onClick={deleteElement}
            />
          </>
        )}

        {/* Present button */}
        <div className="w-px h-6 bg-gray-200 mx-1" />
        <button
          onClick={startPresentation}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Play className="w-4 h-4" />
          Present
        </button>
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Thumbnail sidebar */}
        <div className="w-[220px] flex-shrink-0 bg-gray-100 border-r border-gray-200 flex flex-col overflow-y-auto p-3 gap-2">
          {slides.map((slide, index) => (
            <ThumbnailCanvas
              key={slide.id}
              slide={slide}
              index={index}
              isActive={index === currentSlideIndex}
            />
          ))}

          {/* Slide management buttons */}
          <div className="flex items-center justify-center gap-1 pt-2 border-t border-gray-200 mt-1">
            <button
              onClick={addSlide}
              className="p-1.5 rounded hover:bg-gray-200 text-gray-600"
              title="Add slide"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={duplicateSlide}
              className="p-1.5 rounded hover:bg-gray-200 text-gray-600"
              title="Duplicate slide"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              onClick={() => moveSlide("up")}
              disabled={currentSlideIndex === 0}
              className="p-1.5 rounded hover:bg-gray-200 text-gray-600 disabled:opacity-30"
              title="Move up"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              onClick={() => moveSlide("down")}
              disabled={currentSlideIndex === slides.length - 1}
              className="p-1.5 rounded hover:bg-gray-200 text-gray-600 disabled:opacity-30"
              title="Move down"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            <button
              onClick={deleteSlide}
              disabled={slides.length <= 1}
              className="p-1.5 rounded hover:bg-gray-200 text-red-500 disabled:opacity-30"
              title="Delete slide"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Canvas area */}
        <div
          ref={canvasContainerRef}
          className="flex-1 flex items-center justify-center overflow-auto bg-gray-200 p-6"
        >
          <div className="relative shadow-xl">
            <canvas
              ref={canvasRef}
              className={`block bg-white ${
                activeTool !== "select" ? "cursor-crosshair" : "cursor-default"
              }`}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={() => {
                setIsDragging(false);
                setIsResizing(false);
                setIsCreating(false);
              }}
            />

            {/* Text editing overlay */}
            {editingTextId && selectedElement?.type === "text" && (
              <textarea
                ref={textInputRef}
                value={selectedElement.content || ""}
                onChange={(e) =>
                  updateElement(editingTextId, { content: e.target.value })
                }
                onBlur={() => setEditingTextId(null)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setEditingTextId(null);
                  }
                }}
                style={{
                  position: "absolute",
                  left: selectedElement.x * canvasScale,
                  top: selectedElement.y * canvasScale,
                  width: selectedElement.width * canvasScale,
                  height: selectedElement.height * canvasScale,
                  fontSize: (selectedElement.fontSize || 24) * canvasScale,
                  fontWeight: selectedElement.fontWeight || "normal",
                  fontStyle: selectedElement.fontStyle || "normal",
                  textAlign: (selectedElement.textAlign as React.CSSProperties["textAlign"]) || "left",
                  color: selectedElement.color || "#000000",
                  background: "rgba(255,255,255,0.9)",
                  border: "2px solid #3b82f6",
                  borderRadius: 4,
                  outline: "none",
                  resize: "none",
                  padding: 4 * canvasScale,
                  fontFamily: "sans-serif",
                  lineHeight: 1.3,
                  overflow: "hidden",
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Hidden file input for image uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ToolButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`p-1.5 rounded transition-colors ${
        active
          ? "bg-blue-100 text-blue-700"
          : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {icon}
    </button>
  );
}

function PresentationSlide({
  slide,
  loadedImages,
}: {
  slide: SlideData;
  loadedImages: Record<string, HTMLImageElement>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Scale to fill viewport while maintaining aspect ratio
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scaleW = vw / SLIDE_WIDTH;
    const scaleH = vh / SLIDE_HEIGHT;
    const scale = Math.min(scaleW, scaleH);

    const w = SLIDE_WIDTH * scale;
    const h = SLIDE_HEIGHT * scale;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = slide.background;
    ctx.fillRect(0, 0, w, h);

    slide.elements.forEach((el) => {
      if (el.type === "image" && el.src && loadedImages[el.id]) {
        const img = loadedImages[el.id];
        ctx.save();
        const sx = el.x * scale;
        const sy = el.y * scale;
        const sw = el.width * scale;
        const sh = el.height * scale;
        if (el.rotation) {
          ctx.translate(sx + sw / 2, sy + sh / 2);
          ctx.rotate((el.rotation * Math.PI) / 180);
          ctx.translate(-(sx + sw / 2), -(sy + sh / 2));
        }
        ctx.drawImage(img, sx, sy, sw, sh);
        ctx.restore();
      } else {
        renderElementToCanvas(ctx, el, scale);
      }
    });
  }, [slide, loadedImages]);

  return <canvas ref={canvasRef} className="block" />;
}
