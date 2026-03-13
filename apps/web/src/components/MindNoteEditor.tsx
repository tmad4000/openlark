"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import {
  List,
  Network,
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  Bold,
  Italic,
  Palette,
  Minus,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MindNode {
  id: string;
  text: string;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  collapsed?: boolean;
  children: string[]; // child node IDs
}

export interface Collaborator {
  clientId: number;
  name: string;
  color: string;
}

interface MindNoteEditorProps {
  documentId: string;
  yjsDocId: string;
  token: string;
  userName: string;
  userColor?: string;
  onSyncStatusChange?: (status: "syncing" | "synced" | "offline") => void;
  onCollaboratorsChange?: (collaborators: Collaborator[]) => void;
}

type ViewMode = "outline" | "mindmap";

const NODE_COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Outline View ────────────────────────────────────────────────────────────

interface OutlineItemProps {
  nodeId: string;
  nodes: Map<string, MindNode>;
  depth: number;
  focusedId: string | null;
  onFocus: (id: string) => void;
  onUpdate: (id: string, updates: Partial<MindNode>) => void;
  onAddSibling: (id: string) => string | null;
  onAddChild: (id: string) => string | null;
  onDelete: (id: string) => void;
  onIndent: (id: string) => void;
  onOutdent: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  pendingFocusRef: React.MutableRefObject<string | null>;
}

function OutlineItem({
  nodeId,
  nodes,
  depth,
  focusedId,
  onFocus,
  onUpdate,
  onAddSibling,
  onAddChild,
  onDelete,
  onIndent,
  onOutdent,
  onToggleCollapse,
  pendingFocusRef,
}: OutlineItemProps) {
  const node = nodes.get(nodeId);
  const inputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pendingFocusRef.current === nodeId && inputRef.current) {
      inputRef.current.focus();
      // Place cursor at end
      const range = window.document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(inputRef.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
      pendingFocusRef.current = null;
    }
  }, [nodeId, pendingFocusRef, focusedId]);

  if (!node) return null;

  const hasChildren = node.children.length > 0;

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const newId = onAddSibling(nodeId);
      if (newId) pendingFocusRef.current = newId;
    } else if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const newId = onAddChild(nodeId);
        if (newId) pendingFocusRef.current = newId;
      } else {
        onIndent(nodeId);
        pendingFocusRef.current = nodeId;
      }
    } else if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      onOutdent(nodeId);
      pendingFocusRef.current = nodeId;
    } else if (e.key === "Backspace" || e.key === "Delete") {
      if (inputRef.current && inputRef.current.textContent === "") {
        e.preventDefault();
        onDelete(nodeId);
      }
    }
  };

  return (
    <div>
      <div
        className="group flex items-center gap-1 py-0.5 hover:bg-gray-50 rounded"
        style={{ paddingLeft: `${depth * 24 + 4}px` }}
      >
        {/* Collapse toggle */}
        <button
          onClick={() => hasChildren && onToggleCollapse(nodeId)}
          className={`w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 flex-shrink-0 ${
            hasChildren ? "text-gray-500" : "text-transparent"
          }`}
        >
          {hasChildren ? (
            node.collapsed ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 block" />
          )}
        </button>

        {/* Node text */}
        <div
          ref={inputRef}
          contentEditable
          suppressContentEditableWarning
          className={`flex-1 outline-none text-sm py-1 px-1 rounded ${
            focusedId === nodeId ? "ring-1 ring-blue-300" : ""
          }`}
          style={{
            fontWeight: node.bold ? "bold" : "normal",
            fontStyle: node.italic ? "italic" : "normal",
            color: node.color || "#1f2937",
          }}
          onFocus={() => onFocus(nodeId)}
          onInput={(e) => {
            onUpdate(nodeId, { text: (e.target as HTMLDivElement).textContent || "" });
          }}
          onKeyDown={handleKeyDown}
          dangerouslySetInnerHTML={{ __html: node.text || "" }}
        />

        {/* Action buttons - visible on hover */}
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 mr-1">
          <button
            onClick={() => {
              const newId = onAddChild(nodeId);
              if (newId) pendingFocusRef.current = newId;
            }}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded"
            title="Add child"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(nodeId)}
            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Children */}
      {!node.collapsed &&
        node.children.map((childId) => (
          <OutlineItem
            key={childId}
            nodeId={childId}
            nodes={nodes}
            depth={depth + 1}
            focusedId={focusedId}
            onFocus={onFocus}
            onUpdate={onUpdate}
            onAddSibling={onAddSibling}
            onAddChild={onAddChild}
            onDelete={onDelete}
            onIndent={onIndent}
            onOutdent={onOutdent}
            onToggleCollapse={onToggleCollapse}
            pendingFocusRef={pendingFocusRef}
          />
        ))}
    </div>
  );
}

// ─── Mind Map View ───────────────────────────────────────────────────────────

const MAP_NODE_H = 32;
const MAP_NODE_PAD_X = 16;
const MAP_NODE_GAP_Y = 8;
const MAP_LEVEL_GAP_X = 160;

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  children: LayoutNode[];
}

function measureText(text: string, bold?: boolean): number {
  // Approximate text width: ~7px per char, min 60px
  const base = Math.max(60, (text || "Node").length * 7.5 + MAP_NODE_PAD_X * 2);
  return bold ? base + 8 : base;
}

function layoutTree(
  nodeId: string,
  nodes: Map<string, MindNode>,
  x: number,
  y: number
): { layout: LayoutNode; totalHeight: number } {
  const node = nodes.get(nodeId);
  if (!node) {
    return {
      layout: { id: nodeId, x, y, width: 80, height: MAP_NODE_H, children: [] },
      totalHeight: MAP_NODE_H,
    };
  }

  const width = measureText(node.text, node.bold);
  const visibleChildren = node.collapsed ? [] : node.children;

  if (visibleChildren.length === 0) {
    return {
      layout: { id: nodeId, x, y, width, height: MAP_NODE_H, children: [] },
      totalHeight: MAP_NODE_H,
    };
  }

  // Layout children
  const childLayouts: { layout: LayoutNode; totalHeight: number }[] = [];
  let childY = y;
  for (const childId of visibleChildren) {
    const childResult = layoutTree(childId, nodes, x + MAP_LEVEL_GAP_X, childY);
    childLayouts.push(childResult);
    childY += childResult.totalHeight + MAP_NODE_GAP_Y;
  }

  const totalChildrenHeight =
    childLayouts.reduce((sum, c) => sum + c.totalHeight, 0) +
    (childLayouts.length - 1) * MAP_NODE_GAP_Y;

  // Center this node vertically relative to children
  const nodeY = y + totalChildrenHeight / 2 - MAP_NODE_H / 2;
  const totalHeight = Math.max(MAP_NODE_H, totalChildrenHeight);

  return {
    layout: {
      id: nodeId,
      x,
      y: nodeY,
      width,
      height: MAP_NODE_H,
      children: childLayouts.map((c) => c.layout),
    },
    totalHeight,
  };
}

interface MindMapNodeProps {
  layout: LayoutNode;
  nodes: Map<string, MindNode>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
}

function MindMapNode({
  layout,
  nodes,
  selectedId,
  onSelect,
  onToggleCollapse,
}: MindMapNodeProps) {
  const node = nodes.get(layout.id);
  if (!node) return null;

  const isSelected = selectedId === layout.id;
  const hasChildren = node.children.length > 0;
  const isRoot = layout.x < MAP_LEVEL_GAP_X;
  const fillColor = node.color || (isRoot ? "#3b82f6" : "#f3f4f6");
  const textColor = node.color
    ? "#fff"
    : isRoot
    ? "#fff"
    : "#1f2937";

  return (
    <g>
      {/* Connecting lines to children */}
      {layout.children.map((child) => {
        const startX = layout.x + layout.width;
        const startY = layout.y + layout.height / 2;
        const endX = child.x;
        const endY = child.y + child.height / 2;
        const midX = (startX + endX) / 2;

        return (
          <path
            key={child.id}
            d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`}
            fill="none"
            stroke="#cbd5e1"
            strokeWidth={1.5}
          />
        );
      })}

      {/* Node rectangle */}
      <g
        onClick={() => onSelect(layout.id)}
        onDoubleClick={() => hasChildren && onToggleCollapse(layout.id)}
        className="cursor-pointer"
      >
        <rect
          x={layout.x}
          y={layout.y}
          width={layout.width}
          height={layout.height}
          rx={6}
          fill={fillColor}
          stroke={isSelected ? "#3b82f6" : "transparent"}
          strokeWidth={2}
        />
        <text
          x={layout.x + layout.width / 2}
          y={layout.y + layout.height / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={13}
          fill={textColor}
          fontWeight={node.bold ? "bold" : "normal"}
          fontStyle={node.italic ? "italic" : "normal"}
        >
          {(node.text || "Node").length > 20
            ? (node.text || "Node").slice(0, 18) + "..."
            : node.text || "Node"}
        </text>

        {/* Collapse indicator */}
        {hasChildren && node.collapsed && (
          <g>
            <circle
              cx={layout.x + layout.width + 8}
              cy={layout.y + layout.height / 2}
              r={8}
              fill="#e2e8f0"
              stroke="#94a3b8"
              strokeWidth={1}
            />
            <text
              x={layout.x + layout.width + 8}
              y={layout.y + layout.height / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={9}
              fill="#475569"
            >
              {node.children.length}
            </text>
          </g>
        )}
      </g>

      {/* Render children */}
      {layout.children.map((child) => (
        <MindMapNode
          key={child.id}
          layout={child}
          nodes={nodes}
          selectedId={selectedId}
          onSelect={onSelect}
          onToggleCollapse={onToggleCollapse}
        />
      ))}
    </g>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function MindNoteEditor({
  documentId,
  yjsDocId,
  token,
  userName,
  userColor,
  onSyncStatusChange,
  onCollaboratorsChange,
}: MindNoteEditorProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("outline");
  const [nodes, setNodes] = useState<Map<string, MindNode>>(new Map());
  const [rootIds, setRootIds] = useState<string[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const pendingFocusRef = useRef<string | null>(null);

  // Yjs state
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const yNodesRef = useRef<Y.Map<unknown> | null>(null);
  const yRootsRef = useRef<Y.Array<string> | null>(null);
  const suppressYjsUpdate = useRef(false);

  // SVG panning
  const [svgOffset, setSvgOffset] = useState({ x: 40, y: 40 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  // ─── Yjs setup ───────────────────────────────────────────────────────

  const syncFromYjs = useCallback(() => {
    const yNodes = yNodesRef.current;
    const yRoots = yRootsRef.current;
    if (!yNodes || !yRoots) return;

    const newNodes = new Map<string, MindNode>();
    yNodes.forEach((val, key) => {
      const raw = val as Record<string, unknown>;
      newNodes.set(key, {
        id: key,
        text: (raw.text as string) || "",
        bold: (raw.bold as boolean) || false,
        italic: (raw.italic as boolean) || false,
        color: (raw.color as string) || undefined,
        collapsed: (raw.collapsed as boolean) || false,
        children: (raw.children as string[]) || [],
      });
    });

    setNodes(newNodes);
    setRootIds(yRoots.toArray());
  }, []);

  useEffect(() => {
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const wsUrl =
      process.env.NEXT_PUBLIC_COLLAB_WS_URL || "ws://localhost:1234";

    const provider = new HocuspocusProvider({
      url: wsUrl,
      name: yjsDocId,
      document: ydoc,
      token,
      onSynced() {
        onSyncStatusChange?.("synced");
        // Initialize with a root node if empty
        const yRoots = ydoc.getArray<string>("mindnote_roots");
        const yNodes = ydoc.getMap("mindnote_nodes");
        if (yRoots.length === 0) {
          const rootId = generateId();
          ydoc.transact(() => {
            yNodes.set(rootId, {
              text: "Central Topic",
              bold: true,
              children: [],
            });
            yRoots.push([rootId]);
          });
        }
        syncFromYjs();
      },
      onStatus({ status }: { status: string }) {
        if (status === "connecting") onSyncStatusChange?.("syncing");
        if (status === "disconnected") onSyncStatusChange?.("offline");
      },
    });

    providerRef.current = provider;

    // Set awareness
    provider.awareness?.setLocalStateField("user", {
      name: userName,
      color: userColor || "#3b82f6",
    });

    // Track collaborators
    const updateCollaborators = () => {
      const states = provider.awareness?.getStates();
      if (!states) return;
      const collabs: Collaborator[] = [];
      states.forEach((state, clientId) => {
        if (clientId === provider.awareness?.clientID) return;
        const u = state.user as { name: string; color: string } | undefined;
        if (u) {
          collabs.push({ clientId, name: u.name, color: u.color });
        }
      });
      onCollaboratorsChange?.(collabs);
    };
    provider.awareness?.on("change", updateCollaborators);

    // Yjs maps
    const yNodes = ydoc.getMap("mindnote_nodes");
    const yRoots = ydoc.getArray<string>("mindnote_roots");
    yNodesRef.current = yNodes;
    yRootsRef.current = yRoots;

    const observer = () => {
      if (!suppressYjsUpdate.current) {
        syncFromYjs();
      }
    };
    yNodes.observeDeep(observer);
    yRoots.observe(observer);

    return () => {
      yNodes.unobserveDeep(observer);
      yRoots.unobserve(observer);
      provider.destroy();
      ydoc.destroy();
    };
  }, [yjsDocId, token, userName, userColor, onSyncStatusChange, onCollaboratorsChange, syncFromYjs]);

  // ─── Node operations ─────────────────────────────────────────────────

  const updateNode = useCallback(
    (id: string, updates: Partial<MindNode>) => {
      const yNodes = yNodesRef.current;
      const ydoc = ydocRef.current;
      if (!yNodes || !ydoc) return;

      const existing = yNodes.get(id) as Record<string, unknown> | undefined;
      if (!existing) return;

      suppressYjsUpdate.current = true;
      ydoc.transact(() => {
        yNodes.set(id, { ...existing, ...updates });
      });
      suppressYjsUpdate.current = false;

      // Optimistic local update
      setNodes((prev) => {
        const next = new Map(prev);
        const node = next.get(id);
        if (node) {
          next.set(id, { ...node, ...updates });
        }
        return next;
      });
    },
    []
  );

  const findParent = useCallback(
    (nodeId: string): { parentId: string | null; index: number } => {
      // Check roots
      const rootIdx = rootIds.indexOf(nodeId);
      if (rootIdx >= 0) return { parentId: null, index: rootIdx };

      // Check all nodes
      for (const [id, node] of nodes) {
        const idx = node.children.indexOf(nodeId);
        if (idx >= 0) return { parentId: id, index: idx };
      }
      return { parentId: null, index: -1 };
    },
    [nodes, rootIds]
  );

  const addSibling = useCallback(
    (nodeId: string): string | null => {
      const ydoc = ydocRef.current;
      const yNodes = yNodesRef.current;
      const yRoots = yRootsRef.current;
      if (!ydoc || !yNodes || !yRoots) return null;

      const { parentId, index } = findParent(nodeId);
      const newId = generateId();

      ydoc.transact(() => {
        yNodes.set(newId, { text: "", children: [] });

        if (parentId === null) {
          // Add after in roots
          yRoots.insert(index + 1, [newId]);
        } else {
          const parent = yNodes.get(parentId) as Record<string, unknown>;
          const children = [...((parent.children as string[]) || [])];
          children.splice(index + 1, 0, newId);
          yNodes.set(parentId, { ...parent, children });
        }
      });

      syncFromYjs();
      return newId;
    },
    [findParent, syncFromYjs]
  );

  const addChild = useCallback(
    (nodeId: string): string | null => {
      const ydoc = ydocRef.current;
      const yNodes = yNodesRef.current;
      if (!ydoc || !yNodes) return null;

      const newId = generateId();
      const parent = yNodes.get(nodeId) as Record<string, unknown>;
      if (!parent) return null;

      ydoc.transact(() => {
        yNodes.set(newId, { text: "", children: [] });
        const children = [...((parent.children as string[]) || []), newId];
        yNodes.set(nodeId, { ...parent, children, collapsed: false });
      });

      syncFromYjs();
      return newId;
    },
    [syncFromYjs]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      const ydoc = ydocRef.current;
      const yNodes = yNodesRef.current;
      const yRoots = yRootsRef.current;
      if (!ydoc || !yNodes || !yRoots) return;

      // Don't delete if it's the last root
      if (rootIds.length <= 1 && rootIds[0] === nodeId) return;

      const { parentId, index } = findParent(nodeId);

      // Recursively collect all descendant IDs
      const collectIds = (id: string): string[] => {
        const n = nodes.get(id);
        if (!n) return [id];
        return [id, ...n.children.flatMap(collectIds)];
      };
      const idsToDelete = collectIds(nodeId);

      ydoc.transact(() => {
        if (parentId === null) {
          yRoots.delete(index, 1);
        } else {
          const parent = yNodes.get(parentId) as Record<string, unknown>;
          const children = ((parent.children as string[]) || []).filter(
            (c) => c !== nodeId
          );
          yNodes.set(parentId, { ...parent, children });
        }

        for (const id of idsToDelete) {
          yNodes.delete(id);
        }
      });

      syncFromYjs();
    },
    [findParent, nodes, rootIds, syncFromYjs]
  );

  const indentNode = useCallback(
    (nodeId: string) => {
      const ydoc = ydocRef.current;
      const yNodes = yNodesRef.current;
      const yRoots = yRootsRef.current;
      if (!ydoc || !yNodes || !yRoots) return;

      const { parentId, index } = findParent(nodeId);

      if (parentId === null) {
        // Root node: make it a child of previous root
        if (index <= 0) return;
        const prevRootId = rootIds[index - 1];
        const prevRoot = yNodes.get(prevRootId) as Record<string, unknown>;
        if (!prevRoot) return;

        ydoc.transact(() => {
          yRoots.delete(index, 1);
          const children = [...((prevRoot.children as string[]) || []), nodeId];
          yNodes.set(prevRootId, { ...prevRoot, children, collapsed: false });
        });
      } else {
        // Non-root: make it a child of previous sibling
        const parent = nodes.get(parentId);
        if (!parent || index <= 0) return;
        const prevSiblingId = parent.children[index - 1];
        const prevSibling = yNodes.get(prevSiblingId) as Record<string, unknown>;
        if (!prevSibling) return;

        const yParent = yNodes.get(parentId) as Record<string, unknown>;
        ydoc.transact(() => {
          // Remove from parent
          const parentChildren = ((yParent.children as string[]) || []).filter(
            (c) => c !== nodeId
          );
          yNodes.set(parentId, { ...yParent, children: parentChildren });
          // Add to prev sibling
          const sibChildren = [...((prevSibling.children as string[]) || []), nodeId];
          yNodes.set(prevSiblingId, { ...prevSibling, children: sibChildren, collapsed: false });
        });
      }

      syncFromYjs();
    },
    [findParent, nodes, rootIds, syncFromYjs]
  );

  const outdentNode = useCallback(
    (nodeId: string) => {
      const ydoc = ydocRef.current;
      const yNodes = yNodesRef.current;
      const yRoots = yRootsRef.current;
      if (!ydoc || !yNodes || !yRoots) return;

      const { parentId, index } = findParent(nodeId);
      if (parentId === null) return; // Already root

      const grandparent = findParent(parentId);
      const yParent = yNodes.get(parentId) as Record<string, unknown>;
      if (!yParent) return;

      ydoc.transact(() => {
        // Remove from parent's children
        const parentChildren = ((yParent.children as string[]) || []).filter(
          (c) => c !== nodeId
        );
        yNodes.set(parentId, { ...yParent, children: parentChildren });

        if (grandparent.parentId === null) {
          // Parent is root: make this a root after parent
          const parentRootIdx = rootIds.indexOf(parentId);
          yRoots.insert(parentRootIdx + 1, [nodeId]);
        } else {
          // Insert after parent in grandparent's children
          const gp = yNodes.get(grandparent.parentId) as Record<string, unknown>;
          const gpChildren = [...((gp.children as string[]) || [])];
          const parentIdx = gpChildren.indexOf(parentId);
          gpChildren.splice(parentIdx + 1, 0, nodeId);
          yNodes.set(grandparent.parentId, { ...gp, children: gpChildren });
        }
      });

      syncFromYjs();
    },
    [findParent, rootIds, syncFromYjs]
  );

  const toggleCollapse = useCallback(
    (nodeId: string) => {
      const node = nodes.get(nodeId);
      if (!node || node.children.length === 0) return;
      updateNode(nodeId, { collapsed: !node.collapsed });
    },
    [nodes, updateNode]
  );

  // ─── Mind Map Layout ──────────────────────────────────────────────────

  const treeLayout = useMemo(() => {
    if (rootIds.length === 0) return null;

    // If multiple roots, create a virtual root
    if (rootIds.length === 1) {
      return layoutTree(rootIds[0], nodes, 0, 0);
    }

    // Multiple roots: layout each separately stacked
    let y = 0;
    const layouts: LayoutNode[] = [];
    for (const rootId of rootIds) {
      const result = layoutTree(rootId, nodes, 0, y);
      layouts.push(result.layout);
      y += result.totalHeight + MAP_NODE_GAP_Y * 3;
    }

    return {
      layout: {
        id: "__virtual__",
        x: -1000,
        y: -1000,
        width: 0,
        height: 0,
        children: layouts,
      },
      totalHeight: y,
    };
  }, [rootIds, nodes]);

  // SVG viewBox calculation
  const svgBounds = useMemo(() => {
    if (!treeLayout) return { minX: 0, minY: 0, width: 800, height: 600 };

    function collectBounds(layout: LayoutNode): {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    } {
      let minX = layout.x;
      let minY = layout.y;
      let maxX = layout.x + layout.width;
      let maxY = layout.y + layout.height;

      for (const child of layout.children) {
        const cb = collectBounds(child);
        minX = Math.min(minX, cb.minX);
        minY = Math.min(minY, cb.minY);
        maxX = Math.max(maxX, cb.maxX);
        maxY = Math.max(maxY, cb.maxY);
      }

      return { minX, minY, maxX, maxY };
    }

    const bounds = collectBounds(treeLayout.layout);
    return {
      minX: bounds.minX - 40,
      minY: bounds.minY - 40,
      width: Math.max(800, bounds.maxX - bounds.minX + 120),
      height: Math.max(400, bounds.maxY - bounds.minY + 120),
    };
  }, [treeLayout]);

  // ─── Mind Map keyboard shortcuts ──────────────────────────────────────

  const handleMapKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!selectedMapId) return;

      if (e.key === "Enter") {
        e.preventDefault();
        const newId = addSibling(selectedMapId);
        if (newId) setSelectedMapId(newId);
      } else if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        const newId = addChild(selectedMapId);
        if (newId) setSelectedMapId(newId);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        const { parentId, index } = findParent(selectedMapId);
        deleteNode(selectedMapId);
        // Select parent or sibling
        if (parentId) {
          setSelectedMapId(parentId);
        } else if (rootIds.length > 1) {
          setSelectedMapId(rootIds[Math.max(0, index - 1)]);
        }
      } else if (e.key === " ") {
        e.preventDefault();
        toggleCollapse(selectedMapId);
      }
    },
    [selectedMapId, addSibling, addChild, deleteNode, findParent, rootIds, toggleCollapse]
  );

  // ─── Panning handlers ─────────────────────────────────────────────────

  const handlePanStart = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      // Only pan on background clicks
      if ((e.target as SVGElement).tagName !== "svg" && (e.target as SVGElement).tagName !== "rect") return;
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, ox: svgOffset.x, oy: svgOffset.y };
    },
    [svgOffset]
  );

  const handlePanMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setSvgOffset({
        x: panStartRef.current.ox + dx,
        y: panStartRef.current.oy + dy,
      });
    },
    [isPanning]
  );

  const handlePanEnd = useCallback(() => {
    setIsPanning(false);
  }, []);

  // ─── Formatting toolbar ───────────────────────────────────────────────

  const activeId = viewMode === "outline" ? focusedId : selectedMapId;
  const activeNode = activeId ? nodes.get(activeId) : null;

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
        {/* View toggle */}
        <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-0.5">
          <button
            onClick={() => setViewMode("outline")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === "outline"
                ? "bg-blue-100 text-blue-700"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <List className="w-4 h-4" />
            Outline
          </button>
          <button
            onClick={() => setViewMode("mindmap")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === "mindmap"
                ? "bg-blue-100 text-blue-700"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Network className="w-4 h-4" />
            Mind Map
          </button>
        </div>

        {/* Formatting buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              if (activeId && activeNode) {
                updateNode(activeId, { bold: !activeNode.bold });
              }
            }}
            className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${
              activeNode?.bold ? "bg-gray-200 text-blue-600" : "text-gray-600"
            }`}
            title="Bold"
            disabled={!activeId}
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (activeId && activeNode) {
                updateNode(activeId, { italic: !activeNode.italic });
              }
            }}
            className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${
              activeNode?.italic ? "bg-gray-200 text-blue-600" : "text-gray-600"
            }`}
            title="Italic"
            disabled={!activeId}
          >
            <Italic className="w-4 h-4" />
          </button>

          {/* Color picker */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                className="p-1.5 rounded hover:bg-gray-200 transition-colors text-gray-600"
                title="Color"
                disabled={!activeId}
              >
                <Palette className="w-4 h-4" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="bg-white rounded-lg shadow-lg border border-gray-200 p-2 z-50"
                sideOffset={4}
              >
                <div className="grid grid-cols-5 gap-1.5">
                  {/* Reset color */}
                  <DropdownMenu.Item
                    className="w-6 h-6 rounded-full border-2 border-gray-300 bg-white cursor-pointer hover:scale-110 transition-transform flex items-center justify-center focus:outline-none"
                    onSelect={() => {
                      if (activeId) updateNode(activeId, { color: undefined });
                    }}
                  >
                    <Minus className="w-3 h-3 text-gray-400" />
                  </DropdownMenu.Item>
                  {NODE_COLORS.map((color) => (
                    <DropdownMenu.Item
                      key={color}
                      className="w-6 h-6 rounded-full cursor-pointer hover:scale-110 transition-transform focus:outline-none"
                      style={{ backgroundColor: color }}
                      onSelect={() => {
                        if (activeId) updateNode(activeId, { color });
                      }}
                    />
                  ))}
                </div>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          <div className="w-px h-5 bg-gray-300 mx-1" />

          {/* Add root node */}
          <button
            onClick={() => {
              const ydoc = ydocRef.current;
              const yNodes = yNodesRef.current;
              const yRoots = yRootsRef.current;
              if (!ydoc || !yNodes || !yRoots) return;

              const newId = generateId();
              ydoc.transact(() => {
                yNodes.set(newId, { text: "", children: [] });
                yRoots.push([newId]);
              });
              syncFromYjs();

              if (viewMode === "outline") {
                pendingFocusRef.current = newId;
              } else {
                setSelectedMapId(newId);
              }
            }}
            className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Topic
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === "outline" ? (
          <div className="h-full overflow-y-auto px-4 py-3">
            {rootIds.map((rootId) => (
              <OutlineItem
                key={rootId}
                nodeId={rootId}
                nodes={nodes}
                depth={0}
                focusedId={focusedId}
                onFocus={setFocusedId}
                onUpdate={updateNode}
                onAddSibling={addSibling}
                onAddChild={addChild}
                onDelete={deleteNode}
                onIndent={indentNode}
                onOutdent={outdentNode}
                onToggleCollapse={toggleCollapse}
                pendingFocusRef={pendingFocusRef}
              />
            ))}

            {rootIds.length === 0 && (
              <div className="text-center text-gray-400 mt-20">
                <Network className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Click &quot;Add Topic&quot; to get started</p>
              </div>
            )}
          </div>
        ) : (
          <div
            className="h-full overflow-hidden bg-gray-50"
            tabIndex={0}
            onKeyDown={handleMapKeyDown}
          >
            <svg
              width="100%"
              height="100%"
              viewBox={`${svgBounds.minX - svgOffset.x} ${svgBounds.minY - svgOffset.y} ${svgBounds.width} ${svgBounds.height}`}
              onMouseDown={handlePanStart}
              onMouseMove={handlePanMove}
              onMouseUp={handlePanEnd}
              onMouseLeave={handlePanEnd}
              className={isPanning ? "cursor-grabbing" : "cursor-grab"}
            >
              {treeLayout &&
                (rootIds.length === 1 ? (
                  <MindMapNode
                    layout={treeLayout.layout}
                    nodes={nodes}
                    selectedId={selectedMapId}
                    onSelect={setSelectedMapId}
                    onToggleCollapse={toggleCollapse}
                  />
                ) : (
                  treeLayout.layout.children.map((rootLayout) => (
                    <MindMapNode
                      key={rootLayout.id}
                      layout={rootLayout}
                      nodes={nodes}
                      selectedId={selectedMapId}
                      onSelect={setSelectedMapId}
                      onToggleCollapse={toggleCollapse}
                    />
                  ))
                ))}
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
