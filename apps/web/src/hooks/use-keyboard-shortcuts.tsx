"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

export interface KeyboardShortcut {
  id: string;
  keys: string; // Display string, e.g. "Cmd+K"
  description: string;
  category: string;
  handler: () => void;
}

interface ShortcutEntry {
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  key: string;
  handler: () => void;
  id: string;
  description: string;
  category: string;
  displayKeys: string;
}

interface KeyboardShortcutsContextType {
  shortcuts: ShortcutEntry[];
  register: (shortcut: ShortcutEntry) => void;
  unregister: (id: string) => void;
  isDialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
}

const KeyboardShortcutsContext =
  createContext<KeyboardShortcutsContextType | null>(null);

export function KeyboardShortcutsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [shortcuts, setShortcuts] = useState<ShortcutEntry[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const register = useCallback((shortcut: ShortcutEntry) => {
    setShortcuts((prev) => {
      const filtered = prev.filter((s) => s.id !== shortcut.id);
      return [...filtered, shortcut];
    });
  }, []);

  const unregister = useCallback((id: string) => {
    setShortcuts((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const openDialog = useCallback(() => setIsDialogOpen(true), []);
  const closeDialog = useCallback(() => setIsDialogOpen(false), []);

  // Global keyboard listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // '?' key opens shortcuts dialog (not in input/textarea)
      if (
        e.key === "?" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target as HTMLElement)?.isContentEditable
      ) {
        e.preventDefault();
        setIsDialogOpen((prev) => !prev);
        return;
      }

      for (const shortcut of shortcuts) {
        const metaMatch = shortcut.metaKey
          ? e.metaKey || e.ctrlKey
          : !e.metaKey && !e.ctrlKey;
        const shiftMatch = shortcut.shiftKey ? e.shiftKey : !e.shiftKey;
        const altMatch = shortcut.altKey ? e.altKey : !e.altKey;

        if (
          metaMatch &&
          shiftMatch &&
          altMatch &&
          e.key.toLowerCase() === shortcut.key.toLowerCase()
        ) {
          // Don't intercept if already handled by command palette (Cmd+K)
          if (shortcut.metaKey && shortcut.key === "k") return;

          e.preventDefault();
          shortcut.handler();
          return;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts]);

  return (
    <KeyboardShortcutsContext.Provider
      value={{
        shortcuts,
        register,
        unregister,
        isDialogOpen,
        openDialog,
        closeDialog,
      }}
    >
      {children}
      {isDialogOpen && <ShortcutsDialog />}
    </KeyboardShortcutsContext.Provider>
  );
}

export function useKeyboardShortcuts() {
  const context = useContext(KeyboardShortcutsContext);
  if (!context) {
    throw new Error(
      "useKeyboardShortcuts must be used within a KeyboardShortcutsProvider"
    );
  }
  return context;
}

/**
 * Hook to register a keyboard shortcut. Auto-unregisters on unmount.
 */
export function useShortcut(
  id: string,
  opts: {
    key: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    description: string;
    category?: string;
    displayKeys: string;
  },
  handler: () => void
) {
  const { register, unregister } = useKeyboardShortcuts();

  useEffect(() => {
    register({
      id,
      key: opts.key,
      metaKey: opts.metaKey,
      ctrlKey: opts.ctrlKey,
      shiftKey: opts.shiftKey,
      altKey: opts.altKey,
      description: opts.description,
      category: opts.category || "General",
      displayKeys: opts.displayKeys,
      handler,
    });

    return () => unregister(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, handler]);
}

// ─── Shortcuts Dialog ───

function ShortcutsDialog() {
  const { shortcuts, closeDialog } = useKeyboardShortcuts();

  // Group by category
  const grouped = shortcuts.reduce<Record<string, ShortcutEntry[]>>(
    (acc, s) => {
      const cat = s.category || "General";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(s);
      return acc;
    },
    {}
  );

  // Add the ? shortcut info
  const allCategories = { ...grouped };
  if (!allCategories["Help"]) allCategories["Help"] = [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        role="dialog"
        aria-label="Keyboard shortcuts"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={closeDialog}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm"
          >
            Esc
          </button>
        </div>

        {/* Content */}
        <div className="p-5 max-h-[60vh] overflow-auto space-y-4">
          {/* Built-in shortcuts */}
          <div>
            <h3 className="text-[10px] uppercase tracking-wider text-gray-400 font-medium mb-2">
              Navigation
            </h3>
            <ShortcutRow keys="Cmd+K" description="Open search / command palette" />
            <ShortcutRow keys="?" description="Show keyboard shortcuts" />
          </div>

          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <h3 className="text-[10px] uppercase tracking-wider text-gray-400 font-medium mb-2">
                {category}
              </h3>
              {items.map((s) => (
                <ShortcutRow
                  key={s.id}
                  keys={s.displayKeys}
                  description={s.description}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ShortcutRow({
  keys,
  description,
}: {
  keys: string;
  description: string;
}) {
  const parts = keys.split("+");
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-gray-600 dark:text-gray-300">
        {description}
      </span>
      <div className="flex items-center gap-1">
        {parts.map((part, i) => (
          <kbd
            key={i}
            className="min-w-[24px] h-6 px-1.5 flex items-center justify-center bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-[11px] font-mono text-gray-600 dark:text-gray-300"
          >
            {part}
          </kbd>
        ))}
      </div>
    </div>
  );
}
