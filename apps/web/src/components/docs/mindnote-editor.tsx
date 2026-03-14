"use client";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type KeyboardEvent,
} from "react";
import { type Document as DocType } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Bold,
  Italic,
  Palette,
  List,
  GitBranch,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Types ───
interface MindNode {
  id: string;
  text: string;
  children: MindNode[];
  collapsed?: boolean;
  bold?: boolean;
  italic?: boolean;
  color?: string;
}

type ViewMode = "outline" | "mindmap";

let nodeIdCounter = 0;
function genNodeId(): string {
  return `mn-${Date.now()}-${++nodeIdCounter}`;
}

// ─── Outline View ───
function OutlineNode({
  node,
  depth,
  onUpdate,
  onAddSibling,
  onAddChild,
  onDelete,
  onToggle,
  readOnly,
}: {
  node: MindNode;
  depth: number;
  onUpdate: (id: string, updates: Partial<MindNode>) => void;
  onAddSibling: (id: string) => void;
  onAddChild: (id: string) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  readOnly?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (readOnly) return;
    if (e.key === "Enter") {
      e.preventDefault();
      onAddSibling(node.id);
    } else if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      onAddChild(node.id);
    } else if (e.key === "Backspace" && node.text === "") {
      e.preventDefault();
      onDelete(node.id);
    }
  };

  return (
    <div>
      <div
        className="flex items-center gap-1 py-0.5 group hover:bg-gray-50 dark:hover:bg-gray-900/50 rounded"
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
      >
        {/* Collapse toggle */}
        <button
          onClick={() => onToggle(node.id)}
          className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 shrink-0"
        >
          {node.children.length > 0 ? (
            node.collapsed ? (
              <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            )
          ) : (
            <span className="w-3.5 h-3.5 inline-flex items-center justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
            </span>
          )}
        </button>

        {/* Node text */}
        <input
          ref={inputRef}
          type="text"
          value={node.text}
          onChange={(e) => onUpdate(node.id, { text: e.target.value })}
          onKeyDown={handleKeyDown}
          className={cn(
            "flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 focus:outline-none px-1 py-0.5 rounded",
            node.bold && "font-bold",
            node.italic && "italic"
          )}
          style={{ color: node.color }}
          readOnly={readOnly}
          placeholder="Type here..."
        />

        {/* Actions */}
        {!readOnly && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onUpdate(node.id, { bold: !node.bold })}
              className={cn(
                "p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700",
                node.bold && "bg-gray-200 dark:bg-gray-700"
              )}
            >
              <Bold className="w-3 h-3 text-gray-400" />
            </button>
            <button
              onClick={() => onUpdate(node.id, { italic: !node.italic })}
              className={cn(
                "p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700",
                node.italic && "bg-gray-200 dark:bg-gray-700"
              )}
            >
              <Italic className="w-3 h-3 text-gray-400" />
            </button>
            <button
              onClick={() => onAddChild(node.id)}
              className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              title="Add child"
            >
              <Plus className="w-3 h-3 text-gray-400" />
            </button>
            <button
              onClick={() => onDelete(node.id)}
              className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
              title="Delete"
            >
              <Trash2 className="w-3 h-3 text-gray-400" />
            </button>
          </div>
        )}
      </div>

      {/* Children */}
      {!node.collapsed &&
        node.children.map((child) => (
          <OutlineNode
            key={child.id}
            node={child}
            depth={depth + 1}
            onUpdate={onUpdate}
            onAddSibling={onAddSibling}
            onAddChild={onAddChild}
            onDelete={onDelete}
            onToggle={onToggle}
            readOnly={readOnly}
          />
        ))}
    </div>
  );
}

// ─── Mind Map View ───
interface LayoutNode {
  node: MindNode;
  x: number;
  y: number;
  width: number;
  height: number;
  children: LayoutNode[];
}

function layoutTree(node: MindNode, x: number, y: number, depth: number): LayoutNode {
  const NODE_WIDTH = 140;
  const NODE_HEIGHT = 36;
  const H_GAP = 60;
  const V_GAP = 16;

  const visibleChildren = node.collapsed ? [] : node.children;
  const childLayouts: LayoutNode[] = [];

  let totalChildHeight = 0;
  const childResults: LayoutNode[] = [];

  for (const child of visibleChildren) {
    const childLayout = layoutTree(child, x + NODE_WIDTH + H_GAP, 0, depth + 1);
    childResults.push(childLayout);
    totalChildHeight += getSubtreeHeight(childLayout) + V_GAP;
  }

  if (totalChildHeight > 0) totalChildHeight -= V_GAP;

  let childY = y - totalChildHeight / 2;
  for (const childLayout of childResults) {
    const h = getSubtreeHeight(childLayout);
    childLayout.y = childY + h / 2;
    offsetTree(childLayout, childLayout.x, childLayout.y);
    childLayouts.push(childLayout);
    childY += h + V_GAP;
  }

  return {
    node,
    x,
    y,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    children: childLayouts,
  };
}

function getSubtreeHeight(layout: LayoutNode): number {
  if (layout.children.length === 0) return layout.height;
  const V_GAP = 16;
  return layout.children.reduce(
    (sum, child) => sum + getSubtreeHeight(child) + V_GAP,
    -V_GAP
  );
}

function offsetTree(layout: LayoutNode, x: number, y: number) {
  layout.x = x;
  layout.y = y;
  // children already positioned relative to parent in layoutTree
}

function flattenLayout(layout: LayoutNode): { nodes: LayoutNode[]; edges: { x1: number; y1: number; x2: number; y2: number }[] } {
  const nodes: LayoutNode[] = [layout];
  const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];

  for (const child of layout.children) {
    edges.push({
      x1: layout.x + layout.width,
      y1: layout.y + layout.height / 2,
      x2: child.x,
      y2: child.y + child.height / 2,
    });
    const sub = flattenLayout(child);
    nodes.push(...sub.nodes);
    edges.push(...sub.edges);
  }

  return { nodes, edges };
}

function MindMapView({
  root,
  onToggle,
}: {
  root: MindNode;
  onToggle: (id: string) => void;
}) {
  const layout = layoutTree(root, 40, 300, 0);
  const { nodes, edges } = flattenLayout(layout);

  // Calculate bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }

  const padding = 40;
  const svgWidth = Math.max(800, maxX - minX + padding * 2);
  const svgHeight = Math.max(400, maxY - minY + padding * 2);
  const offsetX = -minX + padding;
  const offsetY = -minY + padding;

  const colors = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#6366f1"];

  return (
    <div className="flex-1 overflow-auto">
      <svg width={svgWidth} height={svgHeight}>
        {/* Edges */}
        {edges.map((edge, i) => (
          <path
            key={i}
            d={`M ${edge.x1 + offsetX} ${edge.y1 + offsetY} C ${edge.x1 + offsetX + 30} ${edge.y1 + offsetY}, ${edge.x2 + offsetX - 30} ${edge.y2 + offsetY}, ${edge.x2 + offsetX} ${edge.y2 + offsetY}`}
            fill="none"
            stroke="#d1d5db"
            strokeWidth="2"
          />
        ))}

        {/* Nodes */}
        {nodes.map((n, i) => {
          const depth = Math.round((n.x - 40) / 200);
          const bgColor = n.node.color || colors[depth % colors.length] || "#3b82f6";

          return (
            <g
              key={n.node.id}
              onClick={() => onToggle(n.node.id)}
              className="cursor-pointer"
            >
              <rect
                x={n.x + offsetX}
                y={n.y + offsetY}
                width={n.width}
                height={n.height}
                rx={8}
                fill={bgColor}
                opacity={0.15}
                stroke={bgColor}
                strokeWidth="2"
              />
              <text
                x={n.x + offsetX + n.width / 2}
                y={n.y + offsetY + n.height / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="12"
                fontWeight={n.node.bold ? "bold" : "normal"}
                fontStyle={n.node.italic ? "italic" : "normal"}
                fill={bgColor}
                className="select-none"
              >
                {n.node.text.length > 16 ? n.node.text.slice(0, 16) + "..." : n.node.text || "..."}
              </text>
              {n.node.children.length > 0 && n.node.collapsed && (
                <circle
                  cx={n.x + offsetX + n.width + 8}
                  cy={n.y + offsetY + n.height / 2}
                  r={6}
                  fill={bgColor}
                  opacity={0.3}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Tree manipulation helpers ───
function updateNodeInTree(
  nodes: MindNode[],
  id: string,
  updater: (node: MindNode) => MindNode
): MindNode[] {
  return nodes.map((node) => {
    if (node.id === id) return updater(node);
    return { ...node, children: updateNodeInTree(node.children, id, updater) };
  });
}

function deleteNodeFromTree(nodes: MindNode[], id: string): MindNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: deleteNodeFromTree(n.children, id) }));
}

function addSiblingAfter(nodes: MindNode[], id: string): { nodes: MindNode[]; newId: string | null } {
  let newId: string | null = null;
  const result = nodes.flatMap((n) => {
    if (n.id === id) {
      const newNode: MindNode = { id: genNodeId(), text: "", children: [] };
      newId = newNode.id;
      return [n, newNode];
    }
    const sub = addSiblingAfter(n.children, id);
    if (sub.newId) newId = sub.newId;
    return [{ ...n, children: sub.nodes }];
  });
  return { nodes: result, newId };
}

function addChildTo(nodes: MindNode[], id: string): { nodes: MindNode[]; newId: string | null } {
  let newId: string | null = null;
  const result = nodes.map((n) => {
    if (n.id === id) {
      const newNode: MindNode = { id: genNodeId(), text: "", children: [] };
      newId = newNode.id;
      return { ...n, collapsed: false, children: [...n.children, newNode] };
    }
    const sub = addChildTo(n.children, id);
    if (sub.newId) newId = sub.newId;
    return { ...n, children: sub.nodes };
  });
  return { nodes: result, newId };
}

// ─── Main Component ───
interface MindNoteEditorProps {
  document: DocType;
  readOnly?: boolean;
  currentUser?: { id: string; displayName: string | null } | null;
}

export function MindNoteEditor({ document, readOnly = false }: MindNoteEditorProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("outline");
  const [rootNode, setRootNode] = useState<MindNode>({
    id: genNodeId(),
    text: document.title || "Central Topic",
    children: [
      { id: genNodeId(), text: "Subtopic 1", children: [] },
      { id: genNodeId(), text: "Subtopic 2", children: [] },
      { id: genNodeId(), text: "Subtopic 3", children: [] },
    ],
  });

  const handleUpdate = useCallback((id: string, updates: Partial<MindNode>) => {
    setRootNode((prev) => {
      if (prev.id === id) return { ...prev, ...updates };
      return { ...prev, children: updateNodeInTree(prev.children, id, (n) => ({ ...n, ...updates })) };
    });
  }, []);

  const handleToggle = useCallback((id: string) => {
    handleUpdate(id, {});
    setRootNode((prev) => {
      if (prev.id === id) return { ...prev, collapsed: !prev.collapsed };
      return {
        ...prev,
        children: updateNodeInTree(prev.children, id, (n) => ({
          ...n,
          collapsed: !n.collapsed,
        })),
      };
    });
  }, [handleUpdate]);

  const handleAddSibling = useCallback((id: string) => {
    setRootNode((prev) => {
      const result = addSiblingAfter(prev.children, id);
      return { ...prev, children: result.nodes };
    });
  }, []);

  const handleAddChild = useCallback((id: string) => {
    setRootNode((prev) => {
      if (prev.id === id) {
        const newNode: MindNode = { id: genNodeId(), text: "", children: [] };
        return { ...prev, collapsed: false, children: [...prev.children, newNode] };
      }
      const result = addChildTo(prev.children, id);
      return { ...prev, children: result.nodes };
    });
  }, []);

  const handleDelete = useCallback((id: string) => {
    setRootNode((prev) => ({
      ...prev,
      children: deleteNodeFromTree(prev.children, id),
    }));
  }, []);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-950">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center bg-gray-100 dark:bg-gray-900 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode("outline")}
            className={cn(
              "flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md transition-colors",
              viewMode === "outline"
                ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700"
            )}
          >
            <List className="w-3.5 h-3.5" />
            Outline
          </button>
          <button
            onClick={() => setViewMode("mindmap")}
            className={cn(
              "flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md transition-colors",
              viewMode === "mindmap"
                ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700"
            )}
          >
            <GitBranch className="w-3.5 h-3.5" />
            Mind Map
          </button>
        </div>

        {!readOnly && viewMode === "outline" && (
          <>
            <div className="w-px h-5 bg-gray-300 dark:bg-gray-700" />
            <Button size="sm" variant="ghost" onClick={() => handleAddChild(rootNode.id)}>
              <Plus className="w-4 h-4 mr-1" />
              Add Branch
            </Button>
          </>
        )}
      </div>

      {/* Content */}
      {viewMode === "outline" ? (
        <div className="flex-1 overflow-y-auto p-4">
          {/* Root node */}
          <div className="mb-2">
            <input
              type="text"
              value={rootNode.text}
              onChange={(e) => setRootNode((prev) => ({ ...prev, text: e.target.value }))}
              className={cn(
                "text-lg font-semibold bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none w-full px-2 py-1",
                rootNode.bold && "font-bold",
                rootNode.italic && "italic"
              )}
              style={{ color: rootNode.color }}
              readOnly={readOnly}
              placeholder="Central topic"
            />
          </div>

          {/* Children */}
          {!rootNode.collapsed &&
            rootNode.children.map((child) => (
              <OutlineNode
                key={child.id}
                node={child}
                depth={0}
                onUpdate={handleUpdate}
                onAddSibling={handleAddSibling}
                onAddChild={handleAddChild}
                onDelete={handleDelete}
                onToggle={handleToggle}
                readOnly={readOnly}
              />
            ))}

          {rootNode.children.length === 0 && !readOnly && (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400 mb-2">No branches yet</p>
              <Button size="sm" variant="outline" onClick={() => handleAddChild(rootNode.id)}>
                <Plus className="w-4 h-4 mr-1" />
                Add Branch
              </Button>
            </div>
          )}
        </div>
      ) : (
        <MindMapView root={rootNode} onToggle={handleToggle} />
      )}
    </div>
  );
}
