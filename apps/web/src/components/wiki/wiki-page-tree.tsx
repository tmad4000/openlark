"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api, type WikiPage, type WikiSpace } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Plus,
  GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TreeNode extends WikiPage {
  children: TreeNode[];
}

function buildTree(pages: WikiPage[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const page of pages) {
    map.set(page.id, { ...page, children: [] });
  }

  for (const page of pages) {
    const node = map.get(page.id)!;
    if (page.parentPageId && map.has(page.parentPageId)) {
      map.get(page.parentPageId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by position
  const sortChildren = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.position - b.position);
    for (const node of nodes) {
      sortChildren(node.children);
    }
  };
  sortChildren(roots);

  return roots;
}

interface WikiPageTreeProps {
  space: WikiSpace;
  selectedPageId: string | null;
  onSelectPage: (page: WikiPage) => void;
  onBack: () => void;
}

export function WikiPageTree({
  space,
  selectedPageId,
  onSelectPage,
  onBack,
}: WikiPageTreeProps) {
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [newPageTitle, setNewPageTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<"before" | "inside" | "after" | null>(null);

  const loadPages = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await api.getWikiPages(space.id);
      setPages(result.pages);
      setTree(buildTree(result.pages));
    } catch {
      // Silently handle
    } finally {
      setIsLoading(false);
    }
  }, [space.id]);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  const toggleExpand = useCallback((pageId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  }, []);

  const handleCreatePage = useCallback(async () => {
    if (!newPageTitle.trim()) return;
    try {
      setIsCreating(true);
      const result = await api.createWikiPage(space.id, {
        title: newPageTitle.trim(),
        parentPageId: createParentId,
      });
      setPages((prev) => [...prev, result.page]);
      setTree((prev) => {
        const allPages = [...pages, result.page];
        return buildTree(allPages);
      });
      // Auto-expand parent if creating as child
      if (createParentId) {
        setExpandedIds((prev) => new Set([...prev, createParentId]));
      }
      setNewPageTitle("");
      setShowCreateForm(false);
      setCreateParentId(null);
      // Reload to get correct tree
      loadPages();
    } catch {
      // Silently handle
    } finally {
      setIsCreating(false);
    }
  }, [newPageTitle, createParentId, space.id, pages, loadPages]);

  const startCreatePage = useCallback((parentId: string | null = null) => {
    setCreateParentId(parentId);
    setShowCreateForm(true);
    setNewPageTitle("");
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, pageId: string) => {
    setDraggedPageId(pageId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", pageId);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      e.stopPropagation();
      if (targetId === draggedPageId) return;

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const y = e.clientY - rect.top;
      const height = rect.height;

      if (y < height * 0.25) {
        setDropPosition("before");
      } else if (y > height * 0.75) {
        setDropPosition("after");
      } else {
        setDropPosition("inside");
      }
      setDropTargetId(targetId);
    },
    [draggedPageId]
  );

  const handleDragEnd = useCallback(() => {
    setDraggedPageId(null);
    setDropTargetId(null);
    setDropPosition(null);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      if (!draggedPageId || !dropTargetId || !dropPosition) return;
      if (draggedPageId === dropTargetId) return;

      const targetPage = pages.find((p) => p.id === dropTargetId);
      if (!targetPage) return;

      let newParentId: string | null;
      let newPosition: number;

      if (dropPosition === "inside") {
        newParentId = dropTargetId;
        const children = pages.filter((p) => p.parentPageId === dropTargetId);
        newPosition = children.length;
        setExpandedIds((prev) => new Set([...prev, dropTargetId]));
      } else {
        newParentId = targetPage.parentPageId;
        const siblings = pages.filter(
          (p) => p.parentPageId === targetPage.parentPageId && p.id !== draggedPageId
        );
        const targetIndex = siblings.findIndex((p) => p.id === dropTargetId);
        newPosition = dropPosition === "before" ? targetIndex : targetIndex + 1;
      }

      try {
        await api.updateWikiPage(draggedPageId, {
          parentPageId: newParentId,
          position: newPosition,
        });
        loadPages();
      } catch {
        // Silently handle
      }

      setDraggedPageId(null);
      setDropTargetId(null);
      setDropPosition(null);
    },
    [draggedPageId, dropTargetId, dropPosition, pages, loadPages]
  );

  const renderTreeNode = (node: TreeNode, depth: number = 0) => {
    const isExpanded = expandedIds.has(node.id);
    const isSelected = selectedPageId === node.id;
    const hasChildren = node.children.length > 0;
    const isDragOver = dropTargetId === node.id;

    return (
      <div key={node.id}>
        <div
          className={cn(
            "group flex items-center gap-0.5 py-1 px-2 rounded-md cursor-pointer transition-colors text-sm",
            isSelected
              ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
              : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800",
            isDragOver && dropPosition === "inside" && "ring-2 ring-blue-400",
            isDragOver && dropPosition === "before" && "border-t-2 border-blue-400",
            isDragOver && dropPosition === "after" && "border-b-2 border-blue-400"
          )}
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
          draggable
          onDragStart={(e) => handleDragStart(e, node.id)}
          onDragOver={(e) => handleDragOver(e, node.id)}
          onDragEnd={handleDragEnd}
          onDrop={handleDrop}
        >
          {/* Drag handle */}
          <GripVertical className="h-3 w-3 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 flex-shrink-0 cursor-grab" />

          {/* Expand/collapse */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) toggleExpand(node.id);
            }}
            className="flex-shrink-0 w-4 h-4 flex items-center justify-center"
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )
            ) : (
              <span className="w-3.5" />
            )}
          </button>

          {/* Page icon + title */}
          <button
            onClick={() => onSelectPage(node)}
            className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
          >
            <FileText className="h-3.5 w-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500" />
            <span className="truncate">{node.document.title}</span>
          </button>

          {/* Add child page button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              startCreatePage(node.id);
            }}
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-opacity"
            title="Add child page"
          >
            <Plus className="h-3 w-3 text-gray-400" />
          </button>
        </div>

        {/* Children */}
        {isExpanded && hasChildren && (
          <div>
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-3 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2 mb-1">
          <button
            onClick={onBack}
            className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            &larr; Spaces
          </button>
        </div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
          {space.name}
        </h2>
      </div>

      {/* Create page form */}
      {showCreateForm && (
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800">
          <Input
            value={newPageTitle}
            onChange={(e) => setNewPageTitle(e.target.value)}
            placeholder={createParentId ? "Child page title" : "Page title"}
            className="text-sm h-8 mb-2"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreatePage();
              if (e.key === "Escape") {
                setShowCreateForm(false);
                setCreateParentId(null);
              }
            }}
          />
          <div className="flex gap-1">
            <Button size="sm" className="h-7 text-xs" onClick={handleCreatePage} disabled={isCreating || !newPageTitle.trim()}>
              Create
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => {
                setShowCreateForm(false);
                setCreateParentId(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Add page button */}
      <div className="px-3 py-2">
        <button
          onClick={() => startCreatePage(null)}
          className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add page
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {isLoading ? (
          <div className="space-y-2 px-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-6 rounded bg-gray-200 dark:bg-gray-800 animate-pulse"
              />
            ))}
          </div>
        ) : tree.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <FileText className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-xs text-gray-400 dark:text-gray-500">
              No pages yet
            </p>
          </div>
        ) : (
          tree.map((node) => renderTreeNode(node, 0))
        )}
      </div>
    </div>
  );
}
