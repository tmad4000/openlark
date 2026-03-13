"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Search,
  X,
  MessageSquare,
  FileText,
  Calendar,
  Users,
  CheckSquare,
  Mail,
  Clock,
  Loader2,
} from "lucide-react";

interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  module: string;
  icon: string;
  href: string;
  timestamp: string | null;
  avatarUrl?: string | null;
}

interface SearchResults {
  contacts?: SearchResult[];
  messages?: SearchResult[];
  docs?: SearchResult[];
  events?: SearchResult[];
  tasks?: SearchResult[];
  email?: SearchResult[];
}

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "messages", label: "Messages" },
  { id: "docs", label: "Docs" },
  { id: "events", label: "Events" },
  { id: "contacts", label: "Contacts" },
  { id: "tasks", label: "Tasks" },
  { id: "email", label: "Email" },
] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];

const ICON_MAP: Record<string, typeof Search> = {
  "message-square": MessageSquare,
  "file-text": FileText,
  calendar: Calendar,
  user: Users,
  "check-square": CheckSquare,
  mail: Mail,
};

const MODULE_LABELS: Record<string, string> = {
  contacts: "Contacts",
  messages: "Messages",
  docs: "Docs",
  events: "Events",
  tasks: "Tasks",
  email: "Email",
};

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return "";
  const date = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

const RECENT_SEARCHES_KEY = "openlark_recent_searches";

function getRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  if (typeof window === "undefined") return;
  try {
    const recent = getRecentSearches().filter((s) => s !== query);
    recent.unshift(query);
    localStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(recent.slice(0, 10))
    );
  } catch {
    // ignore
  }
}

export function GlobalSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryId>("all");
  const [results, setResults] = useState<SearchResults>({});
  const [isLoading, setIsLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Load recent searches when dialog opens
  useEffect(() => {
    if (open) {
      setRecentSearches(getRecentSearches());
      setQuery("");
      setResults({});
      setSelectedIndex(-1);
      // Focus input after dialog animation
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const performSearch = useCallback(
    async (searchQuery: string, searchCategory: CategoryId) => {
      const token = getCookie("session_token");
      if (!token || !searchQuery.trim()) {
        setResults({});
        return;
      }

      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          q: searchQuery.trim(),
          category: searchCategory,
          limit: "8",
        });
        const res = await fetch(`/api/search?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || {});
        }
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults({});
      return;
    }
    const timer = setTimeout(() => {
      performSearch(query, category);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, category, performSearch]);

  // Flatten results for keyboard navigation
  const flatResults: SearchResult[] = [];
  for (const key of Object.keys(results)) {
    const items = results[key as keyof SearchResults];
    if (items) flatResults.push(...items);
  }

  const handleResultClick = (result: SearchResult) => {
    saveRecentSearch(query);
    onOpenChange(false);
    router.push(result.href);
  };

  const handleRecentClick = (recent: string) => {
    setQuery(recent);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < flatResults.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev > 0 ? prev - 1 : flatResults.length - 1
      );
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      const selected = flatResults[selectedIndex];
      if (selected) handleResultClick(selected);
    }
  };

  const hasResults = flatResults.length > 0;
  const showRecent = !query.trim() && recentSearches.length > 0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-[15%] -translate-x-1/2 w-full max-w-2xl z-50 outline-none"
          onKeyDown={handleKeyDown}
        >
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
            {/* Search Input */}
            <div className="flex items-center px-4 border-b border-gray-200">
              <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(-1);
                }}
                placeholder="Search messages, docs, events, contacts, tasks, email..."
                className="flex-1 px-3 py-4 text-base text-gray-900 placeholder-gray-400 outline-none bg-transparent"
              />
              {isLoading && (
                <Loader2 className="w-5 h-5 text-gray-400 animate-spin mr-2" />
              )}
              {query && (
                <button
                  onClick={() => {
                    setQuery("");
                    setResults({});
                    inputRef.current?.focus();
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <kbd className="ml-2 hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-400 bg-gray-100 rounded border border-gray-200">
                ESC
              </kbd>
            </div>

            {/* Category Tabs */}
            <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-100 overflow-x-auto">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setCategory(cat.id);
                    setSelectedIndex(-1);
                  }}
                  className={`px-3 py-1.5 text-sm rounded-md whitespace-nowrap transition-colors ${
                    category === cat.id
                      ? "bg-blue-100 text-blue-700 font-medium"
                      : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Results / Recent Searches */}
            <div className="max-h-[60vh] overflow-y-auto">
              {/* Recent Searches */}
              {showRecent && (
                <div className="p-3">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide px-2 mb-2">
                    Recent Searches
                  </p>
                  {recentSearches.map((recent, i) => (
                    <button
                      key={i}
                      onClick={() => handleRecentClick(recent)}
                      className="flex items-center gap-3 w-full px-2 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
                    >
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span>{recent}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* No Results */}
              {query.trim() && !isLoading && !hasResults && (
                <div className="p-8 text-center">
                  <Search className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm text-gray-500">
                    No results found for &ldquo;{query}&rdquo;
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Try a different search term or category
                  </p>
                </div>
              )}

              {/* Grouped Results */}
              {hasResults &&
                Object.entries(results).map(([module, items]) => {
                  const typedItems = items as SearchResult[] | undefined;
                  if (!typedItems || typedItems.length === 0) return null;
                  return (
                    <div key={module} className="py-2">
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide px-6 mb-1">
                        {MODULE_LABELS[module] || module}
                      </p>
                      {typedItems.map((result) => {
                        const globalIdx = flatResults.indexOf(result);
                        const isSelected = globalIdx === selectedIndex;
                        const IconComponent =
                          ICON_MAP[result.icon] || FileText;

                        return (
                          <button
                            key={`${module}-${result.id}`}
                            onClick={() => handleResultClick(result)}
                            className={`flex items-center gap-3 w-full px-6 py-2.5 text-left transition-colors ${
                              isSelected
                                ? "bg-blue-50"
                                : "hover:bg-gray-50"
                            }`}
                          >
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                isSelected
                                  ? "bg-blue-100 text-blue-600"
                                  : "bg-gray-100 text-gray-500"
                              }`}
                            >
                              <IconComponent className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {result.title}
                              </p>
                              {result.snippet && (
                                <p className="text-xs text-gray-500 truncate">
                                  {result.snippet}
                                </p>
                              )}
                            </div>
                            {result.timestamp && (
                              <span className="text-xs text-gray-400 flex-shrink-0">
                                {formatTimestamp(result.timestamp)}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}

              {/* Empty state when no query */}
              {!query.trim() && !showRecent && (
                <div className="p-8 text-center">
                  <Search className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm text-gray-500">
                    Start typing to search across all modules
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Messages, docs, events, contacts, tasks, and email
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            {hasResults && (
              <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
                <div className="flex items-center gap-3">
                  <span>
                    <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-xs">
                      ↑↓
                    </kbd>{" "}
                    navigate
                  </span>
                  <span>
                    <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-xs">
                      ↵
                    </kbd>{" "}
                    open
                  </span>
                  <span>
                    <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-xs">
                      esc
                    </kbd>{" "}
                    close
                  </span>
                </div>
                <span>{flatResults.length} results</span>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
