"use client";

import { useEffect, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Collaboration from "@tiptap/extension-collaboration";
import { all, createLowlight } from "lowlight";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { api, type Document } from "@/lib/api";

// Create lowlight instance with all languages
const lowlight = createLowlight(all);

interface DocumentEditorProps {
  document: Document;
  readOnly?: boolean;
}

export function DocumentEditor({ document, readOnly = false }: DocumentEditorProps) {
  // Create Yjs document
  const ydoc = useMemo(() => new Y.Doc(), []);

  // Create WebSocket provider for real-time collaboration
  const provider = useMemo(() => {
    const token = api.getToken();
    if (!token) return null;

    // Connect to Hocuspocus server
    const wsUrl = process.env.NEXT_PUBLIC_COLLAB_URL || "ws://localhost:3002";
    const wsProvider = new WebsocketProvider(wsUrl, document.id, ydoc, {
      params: { token },
    });

    return wsProvider;
  }, [document.id, ydoc]);

  // Cleanup provider on unmount
  useEffect(() => {
    return () => {
      provider?.destroy();
    };
  }, [provider]);

  // Create editor with TipTap extensions
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // We'll use CodeBlockLowlight instead of the default
        codeBlock: false,
      }),
      Placeholder.configure({
        placeholder: "Start writing... Use '/' for commands",
        emptyEditorClass: "is-editor-empty",
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      CodeBlockLowlight.configure({
        lowlight,
      }),
      Collaboration.configure({
        document: ydoc,
      }),
    ],
    editable: !readOnly,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose lg:prose-lg dark:prose-invert max-w-none focus:outline-none min-h-[500px] p-8",
      },
    },
  });

  // Connection status
  const connectionStatus = provider?.wsconnected
    ? "connected"
    : provider?.wsconnecting
      ? "connecting"
      : "disconnected";

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-1">
          {editor && (
            <>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBold().run()}
                active={editor.isActive("bold")}
                title="Bold"
              >
                <span className="font-bold">B</span>
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleItalic().run()}
                active={editor.isActive("italic")}
                title="Italic"
              >
                <span className="italic">I</span>
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleStrike().run()}
                active={editor.isActive("strike")}
                title="Strikethrough"
              >
                <span className="line-through">S</span>
              </ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 1 }).run()
                }
                active={editor.isActive("heading", { level: 1 })}
                title="Heading 1"
              >
                H1
              </ToolbarButton>
              <ToolbarButton
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 2 }).run()
                }
                active={editor.isActive("heading", { level: 2 })}
                title="Heading 2"
              >
                H2
              </ToolbarButton>
              <ToolbarButton
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 3 }).run()
                }
                active={editor.isActive("heading", { level: 3 })}
                title="Heading 3"
              >
                H3
              </ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                active={editor.isActive("bulletList")}
                title="Bullet List"
              >
                •
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                active={editor.isActive("orderedList")}
                title="Numbered List"
              >
                1.
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleTaskList().run()}
                active={editor.isActive("taskList")}
                title="Task List"
              >
                ☑
              </ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                active={editor.isActive("codeBlock")}
                title="Code Block"
              >
                {"</>"}
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                active={editor.isActive("blockquote")}
                title="Quote"
              >
                "
              </ToolbarButton>
              <ToolbarButton
                onClick={() =>
                  editor
                    .chain()
                    .focus()
                    .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                    .run()
                }
                title="Insert Table"
              >
                ⊞
              </ToolbarButton>
            </>
          )}
        </div>

        {/* Connection status */}
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span
            className={`w-2 h-2 rounded-full ${
              connectionStatus === "connected"
                ? "bg-green-500"
                : connectionStatus === "connecting"
                  ? "bg-yellow-500"
                  : "bg-red-500"
            }`}
          />
          <span className="capitalize">{connectionStatus}</span>
        </div>
      </div>

      {/* Editor content */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-900">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

// Toolbar button component
function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`px-2 py-1 text-sm rounded transition-colors ${
        active
          ? "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
      }`}
    >
      {children}
    </button>
  );
}

// Toolbar divider
function ToolbarDivider() {
  return (
    <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
  );
}
