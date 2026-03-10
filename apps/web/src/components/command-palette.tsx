"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  CheckCircle,
  Settings,
  Sun,
  Moon,
  Search,
  Users,
} from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
import { cn } from "@/lib/utils";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

interface CommandItem {
  id: string;
  title: string;
  description?: string;
  icon: React.ReactNode;
  category: string;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const commands = useMemo<CommandItem[]>(
    () => [
      // Navigation
      {
        id: "nav-messenger",
        title: "Go to Messenger",
        description: "Open the messaging app",
        icon: <MessageSquare className="h-4 w-4" />,
        category: "Navigation",
        action: () => {
          router.push("/messenger");
          onOpenChange(false);
        },
        keywords: ["chat", "message", "dm"],
      },
      {
        id: "nav-calendar",
        title: "Go to Calendar",
        description: "View your calendar",
        icon: <Calendar className="h-4 w-4" />,
        category: "Navigation",
        action: () => {
          router.push("/calendar");
          onOpenChange(false);
        },
        keywords: ["events", "schedule", "meetings"],
      },
      {
        id: "nav-docs",
        title: "Go to Docs",
        description: "Open documents",
        icon: <FileText className="h-4 w-4" />,
        category: "Navigation",
        action: () => {
          router.push("/docs");
          onOpenChange(false);
        },
        keywords: ["documents", "files", "notes"],
      },
      {
        id: "nav-base",
        title: "Go to Base",
        description: "Open database tables",
        icon: <Database className="h-4 w-4" />,
        category: "Navigation",
        action: () => {
          router.push("/base");
          onOpenChange(false);
        },
        keywords: ["database", "tables", "airtable"],
      },
      {
        id: "nav-tasks",
        title: "Go to Tasks",
        description: "View your tasks",
        icon: <ClipboardList className="h-4 w-4" />,
        category: "Navigation",
        action: () => {
          router.push("/tasks");
          onOpenChange(false);
        },
        keywords: ["todo", "projects", "kanban"],
      },
      {
        id: "nav-approvals",
        title: "Go to Approvals",
        description: "View pending approvals",
        icon: <CheckCircle className="h-4 w-4" />,
        category: "Navigation",
        action: () => {
          router.push("/approvals");
          onOpenChange(false);
        },
        keywords: ["workflow", "requests", "review"],
      },
      {
        id: "nav-admin",
        title: "Go to Admin Console",
        description: "Manage organization settings",
        icon: <Settings className="h-4 w-4" />,
        category: "Navigation",
        action: () => {
          router.push("/admin");
          onOpenChange(false);
        },
        keywords: ["settings", "organization", "users"],
      },
      // Actions
      {
        id: "action-new-chat",
        title: "New Chat",
        description: "Start a new conversation",
        icon: <Users className="h-4 w-4" />,
        category: "Actions",
        action: () => {
          router.push("/messenger?new=true");
          onOpenChange(false);
        },
        keywords: ["message", "conversation", "dm", "group"],
      },
      {
        id: "action-search",
        title: "Search Everything",
        description: "Search messages, docs, and more",
        icon: <Search className="h-4 w-4" />,
        category: "Actions",
        action: () => {
          // For now, just keep palette open - search will be built later
          setQuery("");
        },
        keywords: ["find", "look", "query"],
      },
      // Theme
      {
        id: "theme-light",
        title: "Switch to Light Mode",
        description: "Use light color scheme",
        icon: <Sun className="h-4 w-4" />,
        category: "Theme",
        action: () => {
          setTheme("light");
          onOpenChange(false);
        },
        keywords: ["appearance", "bright", "day"],
      },
      {
        id: "theme-dark",
        title: "Switch to Dark Mode",
        description: "Use dark color scheme",
        icon: <Moon className="h-4 w-4" />,
        category: "Theme",
        action: () => {
          setTheme("dark");
          onOpenChange(false);
        },
        keywords: ["appearance", "night"],
      },
      {
        id: "theme-system",
        title: "Use System Theme",
        description: "Match your system preferences",
        icon: theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />,
        category: "Theme",
        action: () => {
          setTheme("system");
          onOpenChange(false);
        },
        keywords: ["appearance", "auto"],
      },
    ],
    [router, onOpenChange, theme, setTheme]
  );

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;

    const lowerQuery = query.toLowerCase();
    return commands.filter((cmd) => {
      const matchesTitle = cmd.title.toLowerCase().includes(lowerQuery);
      const matchesDescription = cmd.description?.toLowerCase().includes(lowerQuery);
      const matchesKeywords = cmd.keywords?.some((kw) =>
        kw.toLowerCase().includes(lowerQuery)
      );
      return matchesTitle || matchesDescription || matchesKeywords;
    });
  }, [commands, query]);

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    filteredCommands.forEach((cmd) => {
      if (!groups[cmd.category]) {
        groups[cmd.category] = [];
      }
      groups[cmd.category].push(cmd);
    });
    return groups;
  }, [filteredCommands]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Reset query when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [open]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setSelectedIndex((i) =>
            i < filteredCommands.length - 1 ? i + 1 : 0
          );
          break;
        case "ArrowUp":
          event.preventDefault();
          setSelectedIndex((i) =>
            i > 0 ? i - 1 : filteredCommands.length - 1
          );
          break;
        case "Enter":
          event.preventDefault();
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action();
          }
          break;
        case "Escape":
          event.preventDefault();
          onOpenChange(false);
          break;
      }
    },
    [filteredCommands, selectedIndex, onOpenChange]
  );

  let itemIndex = -1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <VisuallyHidden>
          <DialogTitle>Command Palette</DialogTitle>
          <DialogDescription>
            Search for commands, navigate to pages, or change settings
          </DialogDescription>
        </VisuallyHidden>
        <div className="flex flex-col">
          {/* Search Input */}
          <div className="flex items-center border-b border-gray-200 dark:border-gray-800 px-3">
            <Search className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a command or search..."
              className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
              autoFocus
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-96 overflow-y-auto p-2">
            {filteredCommands.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                No results found.
              </div>
            ) : (
              Object.entries(groupedCommands).map(([category, items]) => (
                <div key={category} className="mb-2">
                  <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
                    {category}
                  </div>
                  {items.map((item) => {
                    itemIndex++;
                    const isSelected = itemIndex === selectedIndex;
                    return (
                      <button
                        key={item.id}
                        onClick={() => item.action()}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors",
                          isSelected
                            ? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                            : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/50"
                        )}
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                          {item.icon}
                        </span>
                        <div className="flex-1 overflow-hidden">
                          <div className="font-medium truncate">{item.title}</div>
                          {item.description && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {item.description}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))
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
                <span>Select</span>
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

  // Register Cmd+K / Ctrl+K keyboard shortcut
  useKeyboardShortcut({
    key: "k",
    modifiers: ["meta"],
    callback: () => setOpen(true),
  });

  return (
    <>
      {children}
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
