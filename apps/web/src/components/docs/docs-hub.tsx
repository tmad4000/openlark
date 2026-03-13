"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { api, type Document } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import {
  FileText,
  FileSpreadsheet,
  Presentation,
  Brain,
  Layout,
  Plus,
  Search,
  ArrowUpDown,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DocumentType = Document["type"];
type FilterMode = "all" | "owned" | "shared";
type SortMode = "modified" | "created" | "title";

const documentTypeConfig: Record<
  DocumentType,
  { label: string; fullLabel: string; icon: React.ComponentType<{ className?: string }> }
> = {
  doc: { label: "Doc", fullLabel: "Document", icon: FileText },
  sheet: { label: "Sheet", fullLabel: "Spreadsheet", icon: FileSpreadsheet },
  slide: { label: "Slide", fullLabel: "Presentation", icon: Presentation },
  mindnote: { label: "MindNote", fullLabel: "Mind Map", icon: Brain },
  board: { label: "Board", fullLabel: "Whiteboard", icon: Layout },
};

interface DocsHubProps {
  onSelectDocument: (document: Document) => void;
  onCreateDocument: () => void;
}

export function DocsHub({ onSelectDocument, onCreateDocument }: DocsHubProps) {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [sortMode, setSortMode] = useState<SortMode>("modified");
  const [showSortMenu, setShowSortMenu] = useState(false);

  useEffect(() => {
    async function loadDocuments() {
      try {
        setIsLoading(true);
        setError(null);
        const response = await api.getDocuments();
        setDocuments(response.documents);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load documents");
      } finally {
        setIsLoading(false);
      }
    }
    loadDocuments();
  }, []);

  // Expose a way for parent to add documents after creation
  DocsHub.addDocument = useCallback((doc: Document) => {
    setDocuments((prev) => {
      if (prev.some((d) => d.id === doc.id)) return prev;
      return [doc, ...prev];
    });
  }, []);

  const filteredAndSorted = useMemo(() => {
    let result = [...documents];

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((d) => d.title.toLowerCase().includes(q));
    }

    // Filter by ownership
    if (filterMode === "owned" && user) {
      result = result.filter((d) => d.ownerId === user.id);
    } else if (filterMode === "shared" && user) {
      result = result.filter((d) => d.ownerId !== user.id);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortMode) {
        case "modified":
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case "created":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "title":
          return (a.title || "Untitled").localeCompare(b.title || "Untitled");
        default:
          return 0;
      }
    });

    return result;
  }, [documents, searchQuery, filterMode, sortMode, user]);

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const sortLabels: Record<SortMode, string> = {
    modified: "Last modified",
    created: "Created date",
    title: "Title",
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Documents
          </h1>
          <Button onClick={onCreateDocument} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Create New
          </Button>
        </div>

        {/* Search and filters row */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents..."
              className="pl-9"
            />
          </div>

          {/* Filter buttons */}
          <div className="flex items-center gap-1 border border-gray-200 dark:border-gray-700 rounded-lg p-0.5">
            {(["all", "owned", "shared"] as FilterMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md transition-colors",
                  filterMode === mode
                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                )}
              >
                {mode === "all" ? "All" : mode === "owned" ? "My docs" : "Shared"}
              </button>
            ))}
          </div>

          {/* Sort dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg transition-colors"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {sortLabels[sortMode]}
              <ChevronDown className="h-3 w-3" />
            </button>
            {showSortMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowSortMenu(false)}
                />
                <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[160px]">
                  {(Object.entries(sortLabels) as [SortMode, string][]).map(
                    ([mode, label]) => (
                      <button
                        key={mode}
                        onClick={() => {
                          setSortMode(mode);
                          setShowSortMenu(false);
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm transition-colors",
                          sortMode === mode
                            ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                        )}
                      >
                        {label}
                      </button>
                    )
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-32 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse"
              />
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <p className="text-sm text-red-500 mb-2">{error}</p>
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                Retry
              </Button>
            </div>
          </div>
        ) : filteredAndSorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64">
            <FileText className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400 mb-1">
              {searchQuery
                ? "No documents match your search"
                : "No documents yet"}
            </p>
            {!searchQuery && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={onCreateDocument}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create your first document
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredAndSorted.map((document) => {
              const typeConfig = documentTypeConfig[document.type];
              const Icon = typeConfig.icon;

              return (
                <button
                  key={document.id}
                  onClick={() => onSelectDocument(document)}
                  className="group text-left rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 transition-all hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {/* Type icon */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 rounded-md bg-gray-100 dark:bg-gray-700">
                      <Icon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                      {typeConfig.label}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                    {document.title || "Untitled"}
                  </h3>

                  {/* Meta row */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatRelativeTime(document.lastEditedAt || document.updatedAt)}
                    </span>
                    {/* Owner avatar placeholder */}
                    <div className="h-5 w-5 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                      <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
                        {document.ownerId.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Static method placeholder - will be overwritten by component instance
DocsHub.addDocument = (_document: Document) => {};
