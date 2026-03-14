"use client";

import {
  useState,
  useCallback,
  useRef,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { type Document as DocType } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Plus,
  Trash2,
  Type,
  Image,
  Square,
  Circle,
  ArrowRight,
  Play,
  ChevronLeft,
  ChevronRight,
  X,
  Move,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Types ───
interface SlideElement {
  id: string;
  type: "text" | "image" | "rectangle" | "circle" | "arrow";
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  imageUrl?: string;
  fillColor?: string;
  strokeColor?: string;
  fontSize?: number;
  fontWeight?: string;
  textAlign?: "left" | "center" | "right";
}

interface Slide {
  id: string;
  elements: SlideElement[];
  backgroundColor?: string;
}

// ─── Helpers ───
let idCounter = 0;
function genId(): string {
  return `el-${Date.now()}-${++idCounter}`;
}

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;

// ─── Slide Canvas ───
function SlideCanvas({
  slide,
  selectedElementId,
  onSelectElement,
  onUpdateElement,
  readOnly,
}: {
  slide: Slide;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  onUpdateElement: (id: string, updates: Partial<SlideElement>) => void;
  readOnly?: boolean;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent, el: SlideElement) => {
      if (readOnly) return;
      e.stopPropagation();
      onSelectElement(el.id);
      setDragging({
        id: el.id,
        startX: e.clientX,
        startY: e.clientY,
        origX: el.x,
        origY: el.y,
      });
    },
    [readOnly, onSelectElement]
  );

  const handleMouseMove = useCallback(
    (e: ReactMouseEvent) => {
      if (!dragging) return;
      const dx = e.clientX - dragging.startX;
      const dy = e.clientY - dragging.startY;
      onUpdateElement(dragging.id, {
        x: dragging.origX + dx,
        y: dragging.origY + dy,
      });
    },
    [dragging, onUpdateElement]
  );

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  return (
    <div
      ref={canvasRef}
      className="relative border border-gray-300 dark:border-gray-700 shadow-lg"
      style={{
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        backgroundColor: slide.backgroundColor || "#ffffff",
      }}
      onClick={() => onSelectElement(null)}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {slide.elements.map((el) => {
        const isSelected = selectedElementId === el.id;

        return (
          <div
            key={el.id}
            className={cn(
              "absolute",
              isSelected && "ring-2 ring-blue-500"
            )}
            style={{
              left: el.x,
              top: el.y,
              width: el.width,
              height: el.height,
              cursor: readOnly ? "default" : "move",
            }}
            onMouseDown={(e) => handleMouseDown(e, el)}
          >
            {el.type === "text" && (
              <div
                className="w-full h-full flex items-center justify-center p-2 overflow-hidden"
                style={{
                  fontSize: el.fontSize ?? 16,
                  fontWeight: el.fontWeight ?? "normal",
                  textAlign: el.textAlign ?? "center",
                  color: el.fillColor ?? "#000000",
                }}
                contentEditable={!readOnly}
                suppressContentEditableWarning
                onBlur={(e) => {
                  onUpdateElement(el.id, { content: e.currentTarget.textContent ?? "" });
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {el.content || "Click to edit"}
              </div>
            )}
            {el.type === "image" && (
              <img
                src={el.imageUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23eee' width='100' height='100'/%3E%3Ctext x='50' y='50' text-anchor='middle' dy='.3em' fill='%23999' font-size='12'%3EImage%3C/text%3E%3C/svg%3E"}
                alt=""
                className="w-full h-full object-cover rounded"
                draggable={false}
              />
            )}
            {el.type === "rectangle" && (
              <div
                className="w-full h-full rounded"
                style={{
                  backgroundColor: el.fillColor ?? "#3b82f6",
                  border: `2px solid ${el.strokeColor ?? "#2563eb"}`,
                }}
              />
            )}
            {el.type === "circle" && (
              <div
                className="w-full h-full rounded-full"
                style={{
                  backgroundColor: el.fillColor ?? "#8b5cf6",
                  border: `2px solid ${el.strokeColor ?? "#7c3aed"}`,
                }}
              />
            )}
            {el.type === "arrow" && (
              <svg viewBox="0 0 100 50" className="w-full h-full">
                <line
                  x1="5"
                  y1="25"
                  x2="85"
                  y2="25"
                  stroke={el.strokeColor ?? "#374151"}
                  strokeWidth="3"
                />
                <polygon
                  points="80,15 95,25 80,35"
                  fill={el.strokeColor ?? "#374151"}
                />
              </svg>
            )}

            {/* Resize handles */}
            {isSelected && !readOnly && (
              <>
                <div className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-blue-500 rounded-full cursor-se-resize" />
                <div className="absolute -left-1.5 -bottom-1.5 w-3 h-3 bg-blue-500 rounded-full cursor-sw-resize" />
                <div className="absolute -right-1.5 -top-1.5 w-3 h-3 bg-blue-500 rounded-full cursor-ne-resize" />
                <div className="absolute -left-1.5 -top-1.5 w-3 h-3 bg-blue-500 rounded-full cursor-nw-resize" />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Presenter View ───
function PresenterView({
  slides,
  onClose,
}: {
  slides: Slide[];
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const slide = slides[currentIndex];

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setCurrentIndex((i) => Math.min(slides.length - 1, i + 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [slides.length, onClose]
  );

  if (!slide) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex items-center justify-center"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      autoFocus
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white z-10"
      >
        <X className="w-5 h-5" />
      </button>

      <div
        className="relative"
        style={{
          width: "80vw",
          height: "45vw",
          maxHeight: "80vh",
          maxWidth: `${(80 * CANVAS_WIDTH) / CANVAS_HEIGHT}vh`,
          backgroundColor: slide.backgroundColor || "#ffffff",
        }}
      >
        {slide.elements.map((el) => (
          <div
            key={el.id}
            className="absolute"
            style={{
              left: `${(el.x / CANVAS_WIDTH) * 100}%`,
              top: `${(el.y / CANVAS_HEIGHT) * 100}%`,
              width: `${(el.width / CANVAS_WIDTH) * 100}%`,
              height: `${(el.height / CANVAS_HEIGHT) * 100}%`,
            }}
          >
            {el.type === "text" && (
              <div
                className="w-full h-full flex items-center justify-center p-2"
                style={{
                  fontSize: `${((el.fontSize ?? 16) / CANVAS_WIDTH) * 100}vw`,
                  fontWeight: el.fontWeight ?? "normal",
                  textAlign: el.textAlign ?? "center",
                  color: el.fillColor ?? "#000000",
                }}
              >
                {el.content}
              </div>
            )}
            {el.type === "image" && el.imageUrl && (
              <img src={el.imageUrl} alt="" className="w-full h-full object-cover rounded" />
            )}
            {el.type === "rectangle" && (
              <div
                className="w-full h-full rounded"
                style={{ backgroundColor: el.fillColor ?? "#3b82f6" }}
              />
            )}
            {el.type === "circle" && (
              <div
                className="w-full h-full rounded-full"
                style={{ backgroundColor: el.fillColor ?? "#8b5cf6" }}
              />
            )}
            {el.type === "arrow" && (
              <svg viewBox="0 0 100 50" className="w-full h-full">
                <line x1="5" y1="25" x2="85" y2="25" stroke={el.strokeColor ?? "#374151"} strokeWidth="3" />
                <polygon points="80,15 95,25 80,35" fill={el.strokeColor ?? "#374151"} />
              </svg>
            )}
          </div>
        ))}
      </div>

      {/* Navigation */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4">
        <button
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30"
          disabled={currentIndex === 0}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-white text-sm">
          {currentIndex + 1} / {slides.length}
        </span>
        <button
          onClick={() => setCurrentIndex((i) => Math.min(slides.length - 1, i + 1))}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30"
          disabled={currentIndex === slides.length - 1}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Slides Editor ───
interface SlidesEditorProps {
  document: DocType;
  readOnly?: boolean;
  currentUser?: { id: string; displayName: string | null } | null;
}

export function SlidesEditor({ document, readOnly = false }: SlidesEditorProps) {
  const [slides, setSlides] = useState<Slide[]>([
    { id: genId(), elements: [] },
  ]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);

  const currentSlide = slides[currentSlideIndex];

  const addSlide = useCallback(() => {
    const newSlide: Slide = { id: genId(), elements: [] };
    setSlides((prev) => {
      const next = [...prev];
      next.splice(currentSlideIndex + 1, 0, newSlide);
      return next;
    });
    setCurrentSlideIndex((i) => i + 1);
  }, [currentSlideIndex]);

  const deleteSlide = useCallback(() => {
    if (slides.length <= 1) return;
    setSlides((prev) => prev.filter((_, i) => i !== currentSlideIndex));
    setCurrentSlideIndex((i) => Math.min(i, slides.length - 2));
  }, [slides.length, currentSlideIndex]);

  const addElement = useCallback(
    (type: SlideElement["type"]) => {
      if (!currentSlide) return;
      const el: SlideElement = {
        id: genId(),
        type,
        x: CANVAS_WIDTH / 2 - 100,
        y: CANVAS_HEIGHT / 2 - 50,
        width: type === "text" ? 300 : 200,
        height: type === "text" ? 60 : type === "arrow" ? 40 : 150,
        content: type === "text" ? "New text" : undefined,
        fontSize: type === "text" ? 24 : undefined,
      };
      setSlides((prev) =>
        prev.map((s, i) =>
          i === currentSlideIndex
            ? { ...s, elements: [...s.elements, el] }
            : s
        )
      );
      setSelectedElementId(el.id);
    },
    [currentSlide, currentSlideIndex]
  );

  const updateElement = useCallback(
    (id: string, updates: Partial<SlideElement>) => {
      setSlides((prev) =>
        prev.map((s, i) =>
          i === currentSlideIndex
            ? {
                ...s,
                elements: s.elements.map((el) =>
                  el.id === id ? { ...el, ...updates } : el
                ),
              }
            : s
        )
      );
    },
    [currentSlideIndex]
  );

  const deleteElement = useCallback(() => {
    if (!selectedElementId) return;
    setSlides((prev) =>
      prev.map((s, i) =>
        i === currentSlideIndex
          ? { ...s, elements: s.elements.filter((el) => el.id !== selectedElementId) }
          : s
      )
    );
    setSelectedElementId(null);
  }, [selectedElementId, currentSlideIndex]);

  return (
    <>
      <div className="flex h-full bg-gray-100 dark:bg-gray-950">
        {/* Thumbnail Sidebar */}
        <div className="w-48 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Slides ({slides.length})
            </span>
            {!readOnly && (
              <div className="flex items-center gap-1">
                <button
                  onClick={addSlide}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                  title="Add slide"
                >
                  <Plus className="w-3.5 h-3.5 text-gray-500" />
                </button>
                <button
                  onClick={deleteSlide}
                  className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                  title="Delete slide"
                  disabled={slides.length <= 1}
                >
                  <Trash2 className="w-3.5 h-3.5 text-gray-500" />
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {slides.map((slide, idx) => (
              <button
                key={slide.id}
                onClick={() => {
                  setCurrentSlideIndex(idx);
                  setSelectedElementId(null);
                }}
                className={cn(
                  "w-full aspect-video rounded border-2 bg-white dark:bg-gray-800 relative overflow-hidden transition-colors",
                  idx === currentSlideIndex
                    ? "border-blue-500"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-400"
                )}
              >
                <div className="absolute top-1 left-1 text-[10px] font-medium text-gray-400 bg-white/80 dark:bg-gray-900/80 px-1 rounded">
                  {idx + 1}
                </div>
                {/* Mini preview */}
                <div className="w-full h-full" style={{ backgroundColor: slide.backgroundColor || "#fff" }}>
                  {slide.elements.map((el) => (
                    <div
                      key={el.id}
                      className="absolute"
                      style={{
                        left: `${(el.x / CANVAS_WIDTH) * 100}%`,
                        top: `${(el.y / CANVAS_HEIGHT) * 100}%`,
                        width: `${(el.width / CANVAS_WIDTH) * 100}%`,
                        height: `${(el.height / CANVAS_HEIGHT) * 100}%`,
                      }}
                    >
                      {el.type === "text" && (
                        <div className="text-[4px] truncate">{el.content}</div>
                      )}
                      {el.type === "rectangle" && (
                        <div className="w-full h-full rounded-sm" style={{ backgroundColor: el.fillColor ?? "#3b82f6" }} />
                      )}
                      {el.type === "circle" && (
                        <div className="w-full h-full rounded-full" style={{ backgroundColor: el.fillColor ?? "#8b5cf6" }} />
                      )}
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main Canvas Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            {!readOnly && (
              <>
                <Button size="sm" variant="ghost" onClick={() => addElement("text")} title="Add text">
                  <Type className="w-4 h-4 mr-1" />
                  Text
                </Button>
                <Button size="sm" variant="ghost" onClick={() => addElement("image")} title="Add image">
                  <Image className="w-4 h-4 mr-1" />
                  Image
                </Button>
                <Button size="sm" variant="ghost" onClick={() => addElement("rectangle")} title="Add rectangle">
                  <Square className="w-4 h-4 mr-1" />
                  Rect
                </Button>
                <Button size="sm" variant="ghost" onClick={() => addElement("circle")} title="Add circle">
                  <Circle className="w-4 h-4 mr-1" />
                  Circle
                </Button>
                <Button size="sm" variant="ghost" onClick={() => addElement("arrow")} title="Add arrow">
                  <ArrowRight className="w-4 h-4 mr-1" />
                  Arrow
                </Button>
                <div className="w-px h-5 bg-gray-300 dark:bg-gray-700 mx-1" />
                {selectedElementId && (
                  <Button size="sm" variant="ghost" onClick={deleteElement} className="text-red-500">
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                )}
              </>
            )}
            <div className="flex-1" />
            <Button size="sm" onClick={() => setPresenting(true)}>
              <Play className="w-4 h-4 mr-1" />
              Present
            </Button>
          </div>

          {/* Canvas */}
          <div className="flex-1 overflow-auto flex items-center justify-center p-8">
            {currentSlide && (
              <SlideCanvas
                slide={currentSlide}
                selectedElementId={selectedElementId}
                onSelectElement={setSelectedElementId}
                onUpdateElement={updateElement}
                readOnly={readOnly}
              />
            )}
          </div>
        </div>
      </div>

      {/* Presenter View */}
      {presenting && (
        <PresenterView slides={slides} onClose={() => setPresenting(false)} />
      )}
    </>
  );
}
