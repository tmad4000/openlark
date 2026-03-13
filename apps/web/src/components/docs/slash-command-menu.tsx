"use client";

import {
  useState,
  useEffect,
  useCallback,
  useLayoutEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Extension } from "@tiptap/react";
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from "@tiptap/suggestion";
import type { Editor, Range } from "@tiptap/react";
import { ReactRenderer } from "@tiptap/react";
import tippy, { type Instance as TippyInstance } from "tippy.js";

interface CommandItem {
  title: string;
  description: string;
  icon: string;
  command: (props: { editor: Editor; range: Range }) => void;
}

const COMMANDS: CommandItem[] = [
  {
    title: "Paragraph",
    description: "Plain text block",
    icon: "¶",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setParagraph().run();
    },
  },
  {
    title: "Heading 1",
    description: "Large heading",
    icon: "H1",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
    },
  },
  {
    title: "Heading 2",
    description: "Medium heading",
    icon: "H2",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
    },
  },
  {
    title: "Heading 3",
    description: "Small heading",
    icon: "H3",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
    },
  },
  {
    title: "Heading 4",
    description: "Smaller heading",
    icon: "H4",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 4 }).run();
    },
  },
  {
    title: "Heading 5",
    description: "Tiny heading",
    icon: "H5",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 5 }).run();
    },
  },
  {
    title: "Heading 6",
    description: "Smallest heading",
    icon: "H6",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 6 }).run();
    },
  },
  {
    title: "Bullet List",
    description: "Unordered list",
    icon: "•",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: "Numbered List",
    description: "Ordered list",
    icon: "1.",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: "Todo List",
    description: "Checkbox list",
    icon: "☑",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    title: "Blockquote",
    description: "Quote block",
    icon: '"',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    title: "Horizontal Rule",
    description: "Divider line",
    icon: "—",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    title: "Code Block",
    description: "Code with syntax highlighting",
    icon: "</>",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    title: "Table",
    description: "Insert a table",
    icon: "\u25A6",
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
    },
  },
  {
    title: "Callout - Info",
    description: "Information callout block",
    icon: "\u2139\uFE0F",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setCallout({ type: "info" }).run();
    },
  },
  {
    title: "Callout - Warning",
    description: "Warning callout block",
    icon: "\u26A0\uFE0F",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setCallout({ type: "warning" }).run();
    },
  },
  {
    title: "Callout - Success",
    description: "Success callout block",
    icon: "\u2705",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setCallout({ type: "success" }).run();
    },
  },
  {
    title: "Callout - Error",
    description: "Error/danger callout block",
    icon: "\u274C",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setCallout({ type: "error" }).run();
    },
  },
  {
    title: "Image",
    description: "Upload or embed an image",
    icon: "\uD83D\uDDBC",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      // Open file picker for image upload
      const input = window.document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          editor
            .chain()
            .focus()
            .setImage({ src: reader.result as string, alt: file.name })
            .run();
        };
        reader.readAsDataURL(file);
      };
      input.click();
    },
  },
  {
    title: "File Attachment",
    description: "Attach a file",
    icon: "\uD83D\uDCCE",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      const input = window.document.createElement("input");
      input.type = "file";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        // In production this would upload to S3; for now use data URL
        const reader = new FileReader();
        reader.onload = () => {
          editor
            .chain()
            .focus()
            .setFileAttachment({
              src: reader.result as string,
              fileName: file.name,
              fileSize: file.size,
              fileType: file.type,
            })
            .run();
        };
        reader.readAsDataURL(file);
      };
      input.click();
    },
  },
  {
    title: "Divider",
    description: "Horizontal divider line",
    icon: "\u2500",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    title: "Toggle",
    description: "Collapsible content block",
    icon: "\u25B6",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setToggleBlock().run();
    },
  },
];

function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

interface CommandListProps {
  items: CommandItem[];
  command: (item: CommandItem) => void;
}

interface CommandListRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const CommandList = forwardRef<CommandListRef, CommandListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    // Scroll selected item into view
    useLayoutEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const selected = container.children[selectedIndex] as HTMLElement | undefined;
      if (selected) {
        selected.scrollIntoView({ block: "nearest" });
      }
    }, [selectedIndex]);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) command(item);
      },
      [items, command]
    );

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: SuggestionKeyDownProps) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((prev) => (prev + 1) % items.length);
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
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 text-sm text-gray-500 dark:text-gray-400">
          No results
        </div>
      );
    }

    return (
      <div
        ref={containerRef}
        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-y-auto max-h-72 w-64"
      >
        {items.map((item, index) => (
          <button
            key={item.title}
            onClick={() => selectItem(index)}
            className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
              index === selectedIndex
                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
            }`}
          >
            <span className="flex items-center justify-center w-8 h-8 rounded bg-gray-100 dark:bg-gray-700 text-xs font-mono shrink-0">
              {item.icon}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{item.title}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {item.description}
              </div>
            </div>
          </button>
        ))}
      </div>
    );
  }
);

CommandList.displayName = "CommandList";

export const SlashCommand = Extension.create({
  name: "slashCommand",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor;
          range: Range;
          props: CommandItem;
        }) => {
          props.command({ editor, range });
        },
        items: ({ query }: { query: string }) => {
          if (!query) return COMMANDS;
          return COMMANDS.filter(
            (item) =>
              fuzzyMatch(query, item.title) ||
              fuzzyMatch(query, item.description)
          );
        },
        render: () => {
          let component: ReactRenderer<CommandListRef> | null = null;
          let popup: TippyInstance[] | null = null;

          return {
            onStart: (props: SuggestionProps) => {
              component = new ReactRenderer(CommandList, {
                props,
                editor: props.editor,
              });

              if (!props.clientRect) return;

              popup = tippy("body", {
                getReferenceClientRect: props.clientRect as () => DOMRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: "manual",
                placement: "bottom-start",
              });
            },
            onUpdate: (props: SuggestionProps) => {
              component?.updateProps(props);
              if (popup && props.clientRect) {
                popup[0]?.setProps({
                  getReferenceClientRect: props.clientRect as () => DOMRect,
                });
              }
            },
            onKeyDown: (props: SuggestionKeyDownProps) => {
              if (props.event.key === "Escape") {
                popup?.[0]?.hide();
                return true;
              }
              return component?.ref?.onKeyDown(props) ?? false;
            },
            onExit: () => {
              popup?.[0]?.destroy();
              component?.destroy();
            },
          };
        },
      } as Record<string, unknown>,
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
