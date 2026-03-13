"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  useCallback,
} from "react";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";

export interface MentionItem {
  id: string;
  label: string;
  avatarUrl?: string | null;
}

interface MentionListProps {
  items: MentionItem[];
  command: (item: MentionItem) => void;
}

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const MentionList = forwardRef<MentionListRef, MentionListProps>(
  function MentionList({ items, command }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) {
          command(item);
        }
      },
      [items, command]
    );

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((prev) =>
            prev <= 0 ? items.length - 1 : prev - 1
          );
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((prev) =>
            prev >= items.length - 1 ? 0 : prev + 1
          );
          return true;
        }
        if (event.key === "Enter") {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 text-sm text-gray-500">
          No results
        </div>
      );
    }

    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 max-h-[200px] overflow-y-auto">
        {items.map((item, index) => (
          <button
            key={item.id}
            onClick={() => selectItem(index)}
            className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${
              index === selectedIndex
                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            <span className="w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-xs font-medium text-white flex-shrink-0">
              {item.label?.charAt(0)?.toUpperCase() || "?"}
            </span>
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </div>
    );
  }
);

/**
 * Creates suggestion options for the TipTap Mention extension.
 * The `items` callback fetches and filters chat members.
 */
export function createMentionSuggestion(
  fetchMembers: () => Promise<MentionItem[]>
): Omit<SuggestionOptions<MentionItem>, "editor"> {
  let cachedMembers: MentionItem[] = [];
  let cacheLoaded = false;

  return {
    items: async ({ query }: { query: string }) => {
      if (!cacheLoaded) {
        cachedMembers = await fetchMembers();
        cacheLoaded = true;
      }
      const lower = query.toLowerCase();
      return cachedMembers
        .filter((m) => m.label.toLowerCase().includes(lower))
        .slice(0, 8);
    },

    render: () => {
      let component: ReactRenderer<MentionListRef> | null = null;
      let popup: HTMLDivElement | null = null;

      return {
        onStart: (props: SuggestionProps<MentionItem>) => {
          component = new ReactRenderer(MentionList, {
            props,
            editor: props.editor,
          });

          // Create a simple positioned div instead of tippy
          popup = document.createElement("div");
          popup.style.position = "absolute";
          popup.style.zIndex = "50";
          document.body.appendChild(popup);

          if (component.element) {
            popup.appendChild(component.element);
          }

          updatePosition(props, popup);
        },

        onUpdate: (props: SuggestionProps<MentionItem>) => {
          component?.updateProps(props);
          if (popup) {
            updatePosition(props, popup);
          }
        },

        onKeyDown: (props: { event: KeyboardEvent }) => {
          if (props.event.key === "Escape") {
            popup?.remove();
            popup = null;
            return true;
          }
          return component?.ref?.onKeyDown(props) ?? false;
        },

        onExit: () => {
          popup?.remove();
          popup = null;
          component?.destroy();
          component = null;
          // Reset cache so next mention trigger fetches fresh members
          cacheLoaded = false;
        },
      };
    },
  };
}

function updatePosition(
  props: SuggestionProps<MentionItem>,
  popup: HTMLDivElement
) {
  const rect = props.clientRect?.();
  if (rect) {
    popup.style.left = `${rect.left}px`;
    popup.style.top = `${rect.top - 8}px`;
    popup.style.transform = "translateY(-100%)";
  }
}
