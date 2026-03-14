"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  MessageSquare,
  Calendar,
  FileText,
  Database,
  ClipboardList,
  Search,
  Users,
  Mail,
  Clock,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { api, type GlobalSearchResult } from "@/lib/api";

type SearchCategory = "all" | "messages" | "docs" | "events" | "contacts" | "tasks" | "email";

const CATEGORIES: { key: SearchCategory; label: string; icon: React.ReactNode }[] = [
  { key: "all", label: "All", icon: <Search className="h-3.5 w-3.5" /> },
  { key: "messages", label: "Messages", icon: <MessageSquare className="h-3.5 w-3.5" /> },
  { key: "docs", label: "Docs", icon: <FileText className="h-3.5 w-3.5" /> },
  { key: "events", label: "Events", icon: <Calendar className="h-3.5 w-3.5" /> },
  { key: "contacts", label: "Contacts", icon: <Users className="h-3.5 w-3.5" /> },
  { key: "tasks", label: "Tasks", icon: <ClipboardList className="h-3.5 w-3.5" /> },
  { key: "email", label: "Email", icon: <Mail className="h-3.5 w-3.5" /> },
];

const RECENT_SEARCHES_KEY = "openlark_recent_searches";
const MAX_RECENT = 8;

function getRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  const recent = getRecentSearches().filter((s) => s !== query);
  recent.unshift(query);
  localStorage.setItem(
    RECENT_SEARCHES_KEY,
    JSON.stringify(recent.slice(0, MAX_RECENT))
  );
}

function clearRecentSearches() {
  localStorage.removeItem(RECENT_SEARCHES_KEY);
}

function getResultIcon(type: GlobalSearchResult["type"]) {
  switch (type) {
    case "message": return <MessageSquare className="h-4 w-4" />;
    case "document": return <FileText className="h-4 w-4" />;
    case "event": return <Calendar className="h-4 w-4" />;
    case "contact": return <Users className="h-4 w-4" />;
    case "task": return <ClipboardList className="h-4 w-4" />;
    case "email": return <Mail className="h-4 w-4" />;
  }
}

function getResultRoute(result: GlobalSearchResult): string {
  switch (result.type) {
    case "message": return `/messenger?chatId=${result.sourceId}`;
    case "document": return `/docs/${result.id}`;
    case "event": return `/calendar?eventId=${result.id}`;
    case "contact": return `/messenger?userId=${result.id}`;
    case "task": return `/tasks?taskId=${result.id}`;
    case "email": return `/email?messageId=${result.id}`;
  }
}

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SearchCategory>("all");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Load recent searches when dialog opens
  useEffect(() => {
    if (open) {
      setRecentSearches(getRecentSearches());
    } else {
      setQuery("");
      setCategory("all");
      setResults([]);
      setSelectedIndex(0);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.globalSearch({
          q: query,
          category: category === "all" ? undefined : category,
          limit: 20,
        });
        setResults(res.results);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, category]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  const navigateToResult = useCallback(
    (result: GlobalSearchResult) => {
      saveRecentSearch(query);
      router.push(getResultRoute(result));
      onOpenChange(false);
    },
    [router, onOpenChange, query]
  );

  const handleRecentClick = useCallback(
    (searchQuery: string) => {
      setQuery(searchQuery);
    },
    []
  );

  const selectableItems = query.trim() ? results : [];

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setSelectedIndex((i) =>
            i < selectableItems.length - 1 ? i + 1 : 0
          );
          break;
        case "ArrowUp":
          event.preventDefault();
          setSelectedIndex((i) =>
            i > 0 ? i - 1 : selectableItems.length - 1
          );
          break;
        case "Enter":
          event.preventDefault();
          if (selectableItems[selectedIndex]) {
            navigateToResult(selectableItems[selectedIndex]);
          }
          break;
        case "Escape":
          event.preventDefault();
          onOpenChange(false);
          break;
      }
    },
    [selectableItems, selectedIndex, onOpenChange, navigateToResult]
  );

  // Scroll selected item into view
  useEffect(() => {
    if (!resultsRef.current) return;
    const selected = resultsRef.current.querySelector("[data-selected=true]");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const showRecent = !query.trim() && recentSearches.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <VisuallyHidden>
          <DialogTitle>Global Search</DialogTitle>
          <DialogDescription>
            Search across messages, documents, events, contacts, tasks, and email
          </DialogDescription>
        </VisuallyHidden>
        <div className="flex flex-col">
          {/* Search Input */}
          <div className="flex items-center border-b border-gray-200 dark:border-gray-800 px-3">
            <Search className="h-4 w-4 text-gray-500 dark:text-gray-400 shrink-0" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search messages, docs, events, people..."
              className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
              autoFocus
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <kbd className="hidden sm:inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 ml-2">
              ESC
            </kbd>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
                  category === cat.key
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                )}
              >
                {cat.icon}
                {cat.label}
              </button>
            ))}
          </div>

          {/* Results */}
          <div ref={resultsRef} className="max-h-96 overflow-y-auto p-2">
            {isLoading ? (
              <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                <span className="ml-2">Searching...</span>
              </div>
            ) : query.trim() && results.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                No results found for &ldquo;{query}&rdquo;
              </div>
            ) : showRecent ? (
              <div>
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                    Recent Searches
                  </span>
                  <button
                    onClick={() => {
                      clearRecentSearches();
                      setRecentSearches([]);
                    }}
                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    Clear
                  </button>
                </div>
                {recentSearches.map((search, i) => (
                  <button
                    key={i}
                    onClick={() => handleRecentClick(search)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <Clock className="h-4 w-4 text-gray-400" />
                    <span className="truncate">{search}</span>
                  </button>
                ))}
              </div>
            ) : !query.trim() ? (
              <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                Start typing to search across all modules
              </div>
            ) : (
              results.map((result, i) => {
                const isSelected = i === selectedIndex;
                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    data-selected={isSelected}
                    onClick={() => navigateToResult(result)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors",
                      isSelected
                        ? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                        : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/50"
                    )}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 shrink-0">
                      {getResultIcon(result.type)}
                    </span>
                    <div className="flex-1 overflow-hidden min-w-0">
                      <div className="font-medium truncate">{result.title}</div>
                      {result.snippet && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {result.snippet}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {result.sourceModule}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {formatTimestamp(result.timestamp)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-800 px-4 py-2">
            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-gray-200 bg-gray-100 px-1 py-0.5 font-mono dark:border-gray-700 dark:bg-gray-800">
                  ↑
                </kbd>
                <kbd className="rounded border border-gray-200 bg-gray-100 px-1 py-0.5 font-mono dark:border-gray-700 dark:bg-gray-800">
                  ↓
                </kbd>
                <span>Navigate</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-gray-200 bg-gray-100 px-1 py-0.5 font-mono dark:border-gray-700 dark:bg-gray-800">
                  ↵
                </kbd>
                <span>Open</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-gray-200 bg-gray-100 px-1 py-0.5 font-mono dark:border-gray-700 dark:bg-gray-800">
                  ⌘K
                </kbd>
                <span>Search</span>
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A wrapper component that provides the command palette with Cmd+K shortcut.
 * This should be included in the app layout.
 */
export function CommandPaletteProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Register Cmd+K / Ctrl+K keyboard shortcut globally (works even from inputs)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      {children}
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
