"use client";

import { useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { Pin, FileText, File, Plus, X, GripVertical, ExternalLink } from "lucide-react";

export type BuiltinTab = "chat" | "docs" | "files" | "pins";

export interface CustomTab {
  id: string;
  name: string;
  url: string;
}

interface ChatTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  pinnedCount: number;
  docsCount: number;
  filesCount: number;
  customTabs: CustomTab[];
  onAddCustomTab: (name: string, url: string) => void;
  onDeleteCustomTab: (id: string) => void;
  onReorderCustomTabs: (tabs: CustomTab[]) => void;
}

export function ChatTabs({
  activeTab,
  onTabChange,
  pinnedCount,
  docsCount,
  filesCount,
  customTabs,
  onAddCustomTab,
  onDeleteCustomTab,
  onReorderCustomTabs,
}: ChatTabsProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [newTabUrl, setNewTabUrl] = useState("");
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragItemRef = useRef<string | null>(null);

  const handleAddTab = useCallback(() => {
    const name = newTabName.trim();
    const url = newTabUrl.trim();
    if (!name || !url) return;
    if (customTabs.length >= 20) return;
    onAddCustomTab(name, url);
    setNewTabName("");
    setNewTabUrl("");
    setShowAddForm(false);
  }, [newTabName, newTabUrl, customTabs.length, onAddCustomTab]);

  const handleDragStart = useCallback((id: string) => {
    dragItemRef.current = id;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    setDragOverId(id);
  }, []);

  const handleDrop = useCallback((targetId: string) => {
    const sourceId = dragItemRef.current;
    if (!sourceId || sourceId === targetId) {
      setDragOverId(null);
      dragItemRef.current = null;
      return;
    }
    const tabs = [...customTabs];
    const sourceIdx = tabs.findIndex((t) => t.id === sourceId);
    const targetIdx = tabs.findIndex((t) => t.id === targetId);
    if (sourceIdx === -1 || targetIdx === -1) return;
    const [moved] = tabs.splice(sourceIdx, 1);
    tabs.splice(targetIdx, 0, moved);
    onReorderCustomTabs(tabs);
    setDragOverId(null);
    dragItemRef.current = null;
  }, [customTabs, onReorderCustomTabs]);

  const tabClass = (id: string) =>
    cn(
      "pb-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1 whitespace-nowrap",
      activeTab === id
        ? "border-blue-500 text-blue-600 dark:text-blue-400"
        : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
    );

  const badge = (count: number) =>
    count > 0 ? (
      <span className="ml-1 text-xs bg-gray-200 dark:bg-gray-700 rounded-full px-1.5">
        {count}
      </span>
    ) : null;

  return (
    <div className="relative">
      <div className="flex px-4 gap-4 overflow-x-auto scrollbar-thin">
        {/* Built-in tabs */}
        <button onClick={() => onTabChange("chat")} className={tabClass("chat")}>
          Messages
        </button>

        {docsCount > 0 && (
          <button onClick={() => onTabChange("docs")} className={tabClass("docs")}>
            <FileText className="h-3.5 w-3.5" />
            Docs
            {badge(docsCount)}
          </button>
        )}

        {filesCount > 0 && (
          <button onClick={() => onTabChange("files")} className={tabClass("files")}>
            <File className="h-3.5 w-3.5" />
            Files
            {badge(filesCount)}
          </button>
        )}

        {pinnedCount > 0 && (
          <button onClick={() => onTabChange("pins")} className={tabClass("pins")}>
            <Pin className="h-3.5 w-3.5" />
            Pins
            {badge(pinnedCount)}
          </button>
        )}

        {/* Custom tabs */}
        {customTabs.map((tab) => (
          <div
            key={tab.id}
            draggable
            onDragStart={() => handleDragStart(tab.id)}
            onDragOver={(e) => handleDragOver(e, tab.id)}
            onDrop={() => handleDrop(tab.id)}
            onDragEnd={() => { setDragOverId(null); dragItemRef.current = null; }}
            className={cn(
              "flex items-center gap-1 group",
              dragOverId === tab.id && "border-l-2 border-blue-400 pl-1"
            )}
          >
            <GripVertical className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100 cursor-grab" />
            <button
              onClick={() => onTabChange(tab.id)}
              className={tabClass(tab.id)}
            >
              <ExternalLink className="h-3 w-3" />
              {tab.name}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteCustomTab(tab.id);
                if (activeTab === tab.id) onTabChange("chat");
              }}
              className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600"
              title="Remove tab"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        {/* Add custom tab button */}
        {customTabs.length < 20 && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className={cn(
              "pb-2 text-sm border-b-2 border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            )}
            title="Add custom tab"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Add tab form */}
      {showAddForm && (
        <div className="absolute top-full left-0 right-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3 shadow-md">
          <div className="flex items-center gap-2 max-w-lg">
            <input
              type="text"
              placeholder="Tab name"
              value={newTabName}
              onChange={(e) => setNewTabName(e.target.value)}
              className="flex-1 px-2 py-1 text-sm border rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              maxLength={30}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddTab();
                if (e.key === "Escape") setShowAddForm(false);
              }}
            />
            <input
              type="url"
              placeholder="https://..."
              value={newTabUrl}
              onChange={(e) => setNewTabUrl(e.target.value)}
              className="flex-[2] px-2 py-1 text-sm border rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddTab();
                if (e.key === "Escape") setShowAddForm(false);
              }}
            />
            <button
              onClick={handleAddTab}
              disabled={!newTabName.trim() || !newTabUrl.trim()}
              className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
