"use client";

import { useCallback, useRef, useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { useEditor, EditorContent, ReactRenderer } from "@tiptap/react";
import { BubbleMenu, FloatingMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Heading from "@tiptap/extension-heading";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Image } from "@tiptap/extension-image";
import { common, createLowlight } from "lowlight";
import tippy, { Instance as TippyInstance } from "tippy.js";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import {
  Bold,
  Italic,
  Strikethrough,
  Underline as UnderlineIcon,
  Code,
  Link as LinkIcon,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Minus,
  Code2,
  Type,
  X,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Table as TableIcon,
  ImageIcon,
  Paperclip,
  ChevronRight,
  Info,
  Upload,
} from "lucide-react";
import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Callout, CalloutType, Toggle, ToggleSummary, ToggleContent, FileAttachment } from "./editor/extensions";

// Create lowlight instance with common languages
const lowlight = createLowlight(common);

interface DocumentEditorProps {
  documentId: string;
  yjsDocId: string;
  token: string;
  userName: string;
  userColor?: string;
  onSyncStatusChange?: (status: "syncing" | "synced" | "offline") => void;
}

// Slash command menu items
interface SlashCommandItem {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  command: (editor: ReturnType<typeof useEditor>) => void;
  group?: string;
}

const SLASH_COMMANDS: SlashCommandItem[] = [
  // Basic blocks
  {
    title: "Text",
    description: "Plain paragraph text",
    icon: Type,
    command: (editor) => editor?.chain().focus().setParagraph().run(),
    group: "Basic",
  },
  {
    title: "Heading 1",
    description: "Large section heading",
    icon: Heading1,
    command: (editor) => editor?.chain().focus().toggleHeading({ level: 1 }).run(),
    group: "Basic",
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    icon: Heading2,
    command: (editor) => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
    group: "Basic",
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    icon: Heading3,
    command: (editor) => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
    group: "Basic",
  },
  {
    title: "Heading 4",
    description: "Smaller section heading",
    icon: Heading4,
    command: (editor) => editor?.chain().focus().toggleHeading({ level: 4 }).run(),
    group: "Basic",
  },
  {
    title: "Heading 5",
    description: "Tiny section heading",
    icon: Heading5,
    command: (editor) => editor?.chain().focus().toggleHeading({ level: 5 }).run(),
    group: "Basic",
  },
  {
    title: "Heading 6",
    description: "Smallest section heading",
    icon: Heading6,
    command: (editor) => editor?.chain().focus().toggleHeading({ level: 6 }).run(),
    group: "Basic",
  },
  // Lists
  {
    title: "Bullet List",
    description: "Create a simple bullet list",
    icon: List,
    command: (editor) => editor?.chain().focus().toggleBulletList().run(),
    group: "Lists",
  },
  {
    title: "Numbered List",
    description: "Create a numbered list",
    icon: ListOrdered,
    command: (editor) => editor?.chain().focus().toggleOrderedList().run(),
    group: "Lists",
  },
  {
    title: "Todo List",
    description: "Create a checklist with checkboxes",
    icon: CheckSquare,
    command: (editor) => editor?.chain().focus().toggleTaskList().run(),
    group: "Lists",
  },
  // Content blocks
  {
    title: "Quote",
    description: "Capture a quote",
    icon: Quote,
    command: (editor) => editor?.chain().focus().toggleBlockquote().run(),
    group: "Content",
  },
  {
    title: "Divider",
    description: "Visual divider line",
    icon: Minus,
    command: (editor) => editor?.chain().focus().setHorizontalRule().run(),
    group: "Content",
  },
  {
    title: "Code Block",
    description: "Code snippet with syntax highlighting",
    icon: Code2,
    command: (editor) => editor?.chain().focus().toggleCodeBlock().run(),
    group: "Content",
  },
  // Callouts
  {
    title: "Info Callout",
    description: "Blue info box for notes",
    icon: Info,
    command: (editor) => editor?.chain().focus().setCallout({ type: "info" }).run(),
    group: "Callouts",
  },
  {
    title: "Warning Callout",
    description: "Yellow warning box",
    icon: AlertTriangle,
    command: (editor) => editor?.chain().focus().setCallout({ type: "warning" }).run(),
    group: "Callouts",
  },
  {
    title: "Success Callout",
    description: "Green success box",
    icon: CheckCircle,
    command: (editor) => editor?.chain().focus().setCallout({ type: "success" }).run(),
    group: "Callouts",
  },
  {
    title: "Error Callout",
    description: "Red error/danger box",
    icon: XCircle,
    command: (editor) => editor?.chain().focus().setCallout({ type: "error" }).run(),
    group: "Callouts",
  },
  // Advanced
  {
    title: "Table",
    description: "Insert a table with rows and columns",
    icon: TableIcon,
    command: (editor) =>
      editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    group: "Advanced",
  },
  {
    title: "Image",
    description: "Upload or embed an image",
    icon: ImageIcon,
    command: (editor) => {
      // Trigger file input for image upload
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          // For now, use object URL - in production this would upload to S3
          const url = URL.createObjectURL(file);
          editor?.chain().focus().setImage({ src: url, alt: file.name }).run();
        }
      };
      input.click();
    },
    group: "Advanced",
  },
  {
    title: "File Attachment",
    description: "Attach a file to the document",
    icon: Paperclip,
    command: (editor) => {
      // Trigger file input for file upload
      const input = document.createElement("input");
      input.type = "file";
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          // For now, use object URL - in production this would upload to S3
          const url = URL.createObjectURL(file);
          editor?.chain().focus().setFileAttachment({
            url,
            filename: file.name,
            size: file.size,
            contentType: file.type,
          }).run();
        }
      };
      input.click();
    },
    group: "Advanced",
  },
  {
    title: "Toggle",
    description: "Collapsible section with hidden content",
    icon: ChevronRight,
    command: (editor) => editor?.chain().focus().setToggle().run(),
    group: "Advanced",
  },
];

// Fuzzy search helper
function fuzzySearch(query: string, text: string): boolean {
  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();

  // Check if all characters in query appear in order in text
  let queryIndex = 0;
  for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      queryIndex++;
    }
  }

  return queryIndex === lowerQuery.length;
}

// Slash command list component
interface SlashCommandListProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
  query: string;
}

interface SlashCommandListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const SlashCommandList = forwardRef<SlashCommandListRef, SlashCommandListProps>(
  ({ items, command, query }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Filter items based on query using fuzzy search
    const filteredItems = items.filter(
      (item) =>
        fuzzySearch(query, item.title) || fuzzySearch(query, item.description)
    );

    // Group items by category
    const groupedItems = filteredItems.reduce((acc, item) => {
      const group = item.group || "Other";
      if (!acc[group]) acc[group] = [];
      acc[group].push(item);
      return acc;
    }, {} as Record<string, SlashCommandItem[]>);

    const flatFilteredItems = filteredItems;

    useEffect(() => {
      setSelectedIndex(0);
    }, [query]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((prev) =>
            prev === 0 ? flatFilteredItems.length - 1 : prev - 1
          );
          return true;
        }

        if (event.key === "ArrowDown") {
          setSelectedIndex((prev) =>
            prev === flatFilteredItems.length - 1 ? 0 : prev + 1
          );
          return true;
        }

        if (event.key === "Enter") {
          const selectedItem = flatFilteredItems[selectedIndex];
          if (selectedItem) {
            command(selectedItem);
          }
          return true;
        }

        return false;
      },
    }));

    if (flatFilteredItems.length === 0) {
      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm text-gray-500 min-w-[300px]">
          No results found
        </div>
      );
    }

    let flatIndex = -1;

    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-96 overflow-y-auto min-w-[300px]">
        {Object.entries(groupedItems).map(([group, groupItems]) => (
          <div key={group}>
            <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50">
              {group}
            </div>
            {groupItems.map((item) => {
              flatIndex++;
              const currentIndex = flatIndex;
              const Icon = item.icon;
              return (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => command(item)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                    currentIndex === selectedIndex
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      currentIndex === selectedIndex
                        ? "bg-blue-100 text-blue-600"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{item.title}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {item.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  }
);

SlashCommandList.displayName = "SlashCommandList";

// Custom slash commands extension
const SlashCommands = Extension.create({
  name: "slashCommands",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        command: ({
          editor,
          range,
          props,
        }: {
          editor: ReturnType<typeof useEditor>;
          range: { from: number; to: number };
          props: SlashCommandItem;
        }) => {
          props.command(editor);
          editor?.view.dispatch(
            editor.view.state.tr.delete(range.from, range.to)
          );
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("slashCommands"),
        state: {
          init() {
            return { active: false };
          },
          apply(tr, prev) {
            return prev;
          },
        },
        props: {
          handleKeyDown(view, event) {
            if (event.key === "/") {
              return false;
            }
            return false;
          },
        },
      }),
    ];
  },
});

// Drag handle decoration extension
const DragHandle = Extension.create({
  name: "dragHandle",

  addProseMirrorPlugins() {
    let dragHandleElement: HTMLElement | null = null;
    let hoveredNodePos: number | null = null;

    const showDragHandle = (view: unknown, pos: number) => {
      const v = view as { coordsAtPos: (pos: number) => { left: number; top: number }; dom: HTMLElement };
      if (!dragHandleElement) {
        dragHandleElement = document.createElement("div");
        dragHandleElement.className =
          "drag-handle fixed z-50 opacity-0 hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity";
        dragHandleElement.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400"><circle cx="9" cy="5" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>`;
        document.body.appendChild(dragHandleElement);
      }

      const coords = v.coordsAtPos(pos);
      const editorRect = v.dom.getBoundingClientRect();

      dragHandleElement.style.left = `${editorRect.left - 24}px`;
      dragHandleElement.style.top = `${coords.top}px`;
      dragHandleElement.style.opacity = "1";
    };

    const hideDragHandle = () => {
      if (dragHandleElement) {
        dragHandleElement.style.opacity = "0";
      }
    };

    return [
      new Plugin({
        key: new PluginKey("dragHandle"),
        props: {
          handleDOMEvents: {
            mousemove(view, event) {
              const pos = view.posAtCoords({
                left: event.clientX,
                top: event.clientY,
              });

              if (pos) {
                const node = view.state.doc.nodeAt(pos.pos);
                if (node && pos.inside >= 0) {
                  const resolved = view.state.doc.resolve(pos.inside);
                  const blockPos = resolved.before(1);
                  if (blockPos !== hoveredNodePos) {
                    hoveredNodePos = blockPos;
                    showDragHandle(view, blockPos);
                  }
                  return false;
                }
              }

              hideDragHandle();
              hoveredNodePos = null;
              return false;
            },
            mouseleave() {
              hideDragHandle();
              hoveredNodePos = null;
              return false;
            },
          },
        },
        view() {
          return {
            destroy() {
              if (dragHandleElement) {
                dragHandleElement.remove();
                dragHandleElement = null;
              }
            },
          };
        },
      }),
    ];
  },
});

// Generate a random color for cursor
function generateUserColor(): string {
  const colors = [
    "#958DF1",
    "#F98181",
    "#FBBC88",
    "#FAF594",
    "#70CFF8",
    "#94FADB",
    "#B9F18D",
    "#C3E2C2",
    "#EAECCC",
    "#FFC8DD",
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

interface LinkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (url: string) => void;
  initialUrl?: string;
}

function LinkDialog({ isOpen, onClose, onSubmit, initialUrl = "" }: LinkDialogProps) {
  const [url, setUrl] = useState(initialUrl);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setUrl(initialUrl);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialUrl]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      let finalUrl = url.trim();
      if (!/^https?:\/\//i.test(finalUrl)) {
        finalUrl = `https://${finalUrl}`;
      }
      onSubmit(finalUrl);
    }
    onClose();
  };

  return (
    <div className="absolute top-full left-0 mt-2 p-3 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[300px]">
      <form onSubmit={handleSubmit}>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter URL..."
            className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
          >
            Add
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

// Image upload dialog component
interface ImageUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (url: string, alt?: string) => void;
}

function ImageUploadDialog({ isOpen, onClose, onUpload }: ImageUploadDialogProps) {
  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [url, setUrl] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setUrl("");
      setMode("upload");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFile = async (file: File) => {
    if (file.type.startsWith("image/")) {
      // For now use object URL - in production this would upload to S3
      const objectUrl = URL.createObjectURL(file);
      onUpload(objectUrl, file.name);
      onClose();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onUpload(url.trim());
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">Insert Image</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setMode("upload")}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                mode === "upload"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Upload
            </button>
            <button
              onClick={() => setMode("url")}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                mode === "url"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              URL
            </button>
          </div>

          {mode === "upload" ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragging
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <Upload className="w-10 h-10 mx-auto text-gray-400 mb-3" />
              <p className="text-sm text-gray-600 mb-1">
                Drag and drop an image, or click to select
              </p>
              <p className="text-xs text-gray-400">
                Supports JPG, PNG, GIF, WebP
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </div>
          ) : (
            <form onSubmit={handleUrlSubmit}>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste image URL..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={!url.trim()}
                className="mt-3 w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Insert Image
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DocumentEditor({
  documentId,
  yjsDocId,
  token,
  userName,
  userColor,
  onSyncStatusChange,
}: DocumentEditorProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashMenuQuery, setSlashMenuQuery] = useState("");
  const [slashMenuPosition, setSlashMenuPosition] = useState<{ from: number; to: number } | null>(null);

  const providerRef = useRef<HocuspocusProvider | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const colorRef = useRef<string>(userColor || generateUserColor());

  // Initialize Yjs document and Hocuspocus provider
  useEffect(() => {
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // Determine WebSocket URL - use environment variable or default to localhost
    const wsUrl = process.env.NEXT_PUBLIC_COLLAB_WS_URL || "ws://localhost:1234";

    const provider = new HocuspocusProvider({
      url: wsUrl,
      name: yjsDocId,
      document: ydoc,
      token: token,
      onConnect: () => {
        setIsConnected(true);
        onSyncStatusChange?.("syncing");
      },
      onDisconnect: () => {
        setIsConnected(false);
        onSyncStatusChange?.("offline");
      },
      onSynced: () => {
        setIsSynced(true);
        onSyncStatusChange?.("synced");
      },
      onStatus: ({ status }) => {
        if (status === "connected") {
          setIsConnected(true);
        } else if (status === "disconnected") {
          setIsConnected(false);
        }
      },
    });

    providerRef.current = provider;

    return () => {
      provider.destroy();
    };
  }, [yjsDocId, token, onSyncStatusChange]);

  // Setup slash command suggestion
  const slashCommandSuggestion = {
    items: ({ query }: { query: string }) => {
      setSlashMenuQuery(query);
      return SLASH_COMMANDS.filter(
        (item) =>
          fuzzySearch(query, item.title) || fuzzySearch(query, item.description)
      );
    },
    render: () => {
      let component: ReactRenderer<SlashCommandListRef, SlashCommandListProps> | null = null;
      let popup: TippyInstance[] | null = null;

      return {
        onStart: (props: {
          clientRect: (() => DOMRect | null) | null;
          items: SlashCommandItem[];
          command: (item: SlashCommandItem) => void;
          editor: ReturnType<typeof useEditor>;
          range: { from: number; to: number };
        }) => {
          setSlashMenuOpen(true);
          setSlashMenuPosition({ from: props.range.from, to: props.range.to });

          component = new ReactRenderer(SlashCommandList, {
            props: {
              items: props.items,
              command: props.command,
              query: "",
            },
            editor: props.editor,
          });

          if (!props.clientRect) {
            return;
          }

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

        onUpdate: (props: {
          items: SlashCommandItem[];
          command: (item: SlashCommandItem) => void;
          clientRect: (() => DOMRect | null) | null;
          range: { from: number; to: number };
        }) => {
          setSlashMenuPosition({ from: props.range.from, to: props.range.to });

          component?.updateProps({
            items: props.items,
            command: props.command,
            query: slashMenuQuery,
          });

          if (props.clientRect) {
            popup?.[0]?.setProps({
              getReferenceClientRect: props.clientRect as () => DOMRect,
            });
          }
        },

        onKeyDown: (props: { event: KeyboardEvent }) => {
          if (props.event.key === "Escape") {
            popup?.[0]?.hide();
            setSlashMenuOpen(false);
            return true;
          }

          return component?.ref?.onKeyDown(props) || false;
        },

        onExit: () => {
          popup?.[0]?.destroy();
          component?.destroy();
          setSlashMenuOpen(false);
          setSlashMenuPosition(null);
        },
      };
    },
  };

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: false, // We use the separate Heading extension
          horizontalRule: false, // We use the separate HorizontalRule extension
          codeBlock: false, // We use CodeBlockLowlight
          undoRedo: false, // Collaboration handles undo/redo
        }),
        Heading.configure({
          levels: [1, 2, 3, 4, 5, 6],
        }),
        HorizontalRule,
        Underline,
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: "text-blue-600 underline cursor-pointer",
          },
        }),
        Placeholder.configure({
          placeholder: ({ node }) => {
            if (node.type.name === "heading") {
              return `Heading ${node.attrs.level}`;
            }
            return 'Type "/" for commands...';
          },
        }),
        TaskList,
        TaskItem.configure({
          nested: true,
        }),
        CodeBlockLowlight.configure({
          lowlight,
          defaultLanguage: "javascript",
          HTMLAttributes: {
            class: "bg-gray-900 text-gray-100 rounded-lg p-4 my-2 overflow-x-auto font-mono text-sm",
          },
        }),
        // Table extension
        Table.configure({
          resizable: true,
          HTMLAttributes: {
            class: "border-collapse table-auto w-full my-4",
          },
        }),
        TableRow.configure({
          HTMLAttributes: {
            class: "border-b border-gray-200",
          },
        }),
        TableHeader.configure({
          HTMLAttributes: {
            class: "bg-gray-50 px-4 py-2 text-left font-semibold text-gray-700 border border-gray-200",
          },
        }),
        TableCell.configure({
          HTMLAttributes: {
            class: "px-4 py-2 border border-gray-200",
          },
        }),
        // Image extension
        Image.configure({
          HTMLAttributes: {
            class: "max-w-full h-auto rounded-lg my-4",
          },
          allowBase64: true,
        }),
        // Custom extensions
        Callout,
        Toggle,
        ToggleSummary,
        ToggleContent,
        FileAttachment,
        // Collaboration extensions
        ...(providerRef.current && ydocRef.current
          ? [
              Collaboration.configure({
                document: ydocRef.current,
              }),
              CollaborationCursor.configure({
                provider: providerRef.current,
                user: {
                  name: userName,
                  color: colorRef.current,
                },
              }),
            ]
          : []),
        DragHandle,
        // Slash commands handled via suggestion extension
        Extension.create({
          name: "slashSuggestion",
          addOptions() {
            return {
              suggestion: slashCommandSuggestion,
            };
          },
          addProseMirrorPlugins() {
            const suggestionPlugin = new Plugin({
              key: new PluginKey("slashSuggestion"),
              state: {
                init() {
                  return { active: false, query: "", from: 0, to: 0 };
                },
                apply(tr, prev, _oldState, newState) {
                  const selection = newState.selection;
                  if (!selection.empty) return { active: false, query: "", from: 0, to: 0 };

                  const $from = selection.$from;
                  const textBefore = $from.parent.textBetween(
                    0,
                    $from.parentOffset,
                    undefined,
                    "\ufffc"
                  );

                  const slashMatch = textBefore.match(/\/([^\s]*)$/);
                  if (slashMatch) {
                    const query = slashMatch[1];
                    const from = $from.pos - query.length - 1;
                    const to = $from.pos;
                    return { active: true, query, from, to };
                  }

                  return { active: false, query: "", from: 0, to: 0 };
                },
              },
            });

            return [suggestionPlugin];
          },
        }),
      ],
      editorProps: {
        attributes: {
          class:
            "prose prose-lg max-w-none focus:outline-none min-h-[500px] px-8 py-6",
        },
        // Handle paste for images
        handlePaste: (view, event) => {
          const items = event.clipboardData?.items;
          if (!items) return false;

          for (const item of items) {
            if (item.type.startsWith("image/")) {
              event.preventDefault();
              const file = item.getAsFile();
              if (file) {
                const url = URL.createObjectURL(file);
                const { state } = view;
                const { schema, tr } = state;
                const imageNode = schema.nodes.image?.create({ src: url, alt: file.name });
                if (imageNode) {
                  view.dispatch(tr.replaceSelectionWith(imageNode));
                }
                return true;
              }
            }
          }
          return false;
        },
        // Handle drop for images
        handleDrop: (view, event) => {
          const files = event.dataTransfer?.files;
          if (!files || files.length === 0) return false;

          const file = files[0];
          if (!file.type.startsWith("image/")) return false;

          event.preventDefault();
          const url = URL.createObjectURL(file);
          const { state } = view;
          const { schema, tr } = state;

          // Get drop position
          const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (!coordinates) return false;

          const imageNode = schema.nodes.image?.create({ src: url, alt: file.name });
          if (imageNode) {
            view.dispatch(tr.insert(coordinates.pos, imageNode));
          }
          return true;
        },
      },
      immediatelyRender: false,
    },
    [providerRef.current, ydocRef.current]
  );

  // Handle link dialog
  const handleSetLink = useCallback(
    (url: string) => {
      if (!editor) return;
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    },
    [editor]
  );

  const openLinkDialog = useCallback(() => {
    setShowLinkDialog(true);
  }, []);

  // Handle image upload
  const handleImageUpload = useCallback(
    (url: string, alt?: string) => {
      if (!editor) return;
      editor.chain().focus().setImage({ src: url, alt: alt || "" }).run();
    },
    [editor]
  );

  if (!editor) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-500">Loading editor...</div>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-auto bg-white">
      {/* Bubble Menu - floating toolbar on text selection */}
      <BubbleMenu
        editor={editor}
        className="bg-white border border-gray-200 rounded-lg shadow-lg flex items-center gap-0.5 p-1"
      >
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-1.5 rounded transition-colors ${
            editor.isActive("bold")
              ? "bg-blue-100 text-blue-600"
              : "text-gray-600 hover:bg-gray-100"
          }`}
          title="Bold"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-1.5 rounded transition-colors ${
            editor.isActive("italic")
              ? "bg-blue-100 text-blue-600"
              : "text-gray-600 hover:bg-gray-100"
          }`}
          title="Italic"
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`p-1.5 rounded transition-colors ${
            editor.isActive("underline")
              ? "bg-blue-100 text-blue-600"
              : "text-gray-600 hover:bg-gray-100"
          }`}
          title="Underline"
        >
          <UnderlineIcon className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`p-1.5 rounded transition-colors ${
            editor.isActive("strike")
              ? "bg-blue-100 text-blue-600"
              : "text-gray-600 hover:bg-gray-100"
          }`}
          title="Strikethrough"
        >
          <Strikethrough className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <button
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={`p-1.5 rounded transition-colors ${
            editor.isActive("code")
              ? "bg-blue-100 text-blue-600"
              : "text-gray-600 hover:bg-gray-100"
          }`}
          title="Inline Code"
        >
          <Code className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            if (editor.isActive("link")) {
              editor.chain().focus().unsetLink().run();
            } else {
              openLinkDialog();
            }
          }}
          className={`p-1.5 rounded transition-colors ${
            editor.isActive("link")
              ? "bg-blue-100 text-blue-600"
              : "text-gray-600 hover:bg-gray-100"
          }`}
          title="Link"
        >
          <LinkIcon className="w-4 h-4" />
        </button>

        {/* Link Dialog */}
        <LinkDialog
          isOpen={showLinkDialog}
          onClose={() => setShowLinkDialog(false)}
          onSubmit={handleSetLink}
          initialUrl={editor.getAttributes("link").href || ""}
        />
      </BubbleMenu>

      {/* Floating Menu - shows on empty lines */}
      <FloatingMenu
        editor={editor}
        className="bg-white border border-gray-200 rounded-lg shadow-lg flex items-center gap-0.5 p-1"
      >
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className="p-1.5 rounded text-gray-600 hover:bg-gray-100 transition-colors"
          title="Heading 1"
        >
          <Heading1 className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className="p-1.5 rounded text-gray-600 hover:bg-gray-100 transition-colors"
          title="Heading 2"
        >
          <Heading2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className="p-1.5 rounded text-gray-600 hover:bg-gray-100 transition-colors"
          title="Bullet List"
        >
          <List className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className="p-1.5 rounded text-gray-600 hover:bg-gray-100 transition-colors"
          title="Numbered List"
        >
          <ListOrdered className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          className="p-1.5 rounded text-gray-600 hover:bg-gray-100 transition-colors"
          title="Todo List"
        >
          <CheckSquare className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className="p-1.5 rounded text-gray-600 hover:bg-gray-100 transition-colors"
          title="Code Block"
        >
          <Code2 className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <button
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          className="p-1.5 rounded text-gray-600 hover:bg-gray-100 transition-colors"
          title="Insert Table"
        >
          <TableIcon className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowImageDialog(true)}
          className="p-1.5 rounded text-gray-600 hover:bg-gray-100 transition-colors"
          title="Insert Image"
        >
          <ImageIcon className="w-4 h-4" />
        </button>
      </FloatingMenu>

      {/* Image Upload Dialog */}
      <ImageUploadDialog
        isOpen={showImageDialog}
        onClose={() => setShowImageDialog(false)}
        onUpload={handleImageUpload}
      />

      {/* Editor Content */}
      <EditorContent editor={editor} />

      {/* Table toolbar when table is selected */}
      {editor.isActive("table") && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-white border border-gray-200 rounded-lg shadow-lg flex items-center gap-1 p-1 z-50">
          <button
            onClick={() => editor.chain().focus().addColumnBefore().run()}
            className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
            title="Add column before"
          >
            + Col Before
          </button>
          <button
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
            title="Add column after"
          >
            + Col After
          </button>
          <button
            onClick={() => editor.chain().focus().deleteColumn().run()}
            className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
            title="Delete column"
          >
            - Col
          </button>
          <div className="w-px h-4 bg-gray-200 mx-1" />
          <button
            onClick={() => editor.chain().focus().addRowBefore().run()}
            className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
            title="Add row before"
          >
            + Row Before
          </button>
          <button
            onClick={() => editor.chain().focus().addRowAfter().run()}
            className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
            title="Add row after"
          >
            + Row After
          </button>
          <button
            onClick={() => editor.chain().focus().deleteRow().run()}
            className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
            title="Delete row"
          >
            - Row
          </button>
          <div className="w-px h-4 bg-gray-200 mx-1" />
          <button
            onClick={() => editor.chain().focus().deleteTable().run()}
            className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
            title="Delete table"
          >
            Delete Table
          </button>
        </div>
      )}
    </div>
  );
}
