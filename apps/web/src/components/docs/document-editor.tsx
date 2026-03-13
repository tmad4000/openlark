"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
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
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { all, createLowlight } from "lowlight";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { api, type Document } from "@/lib/api";
import { SlashCommand } from "./slash-command-menu";
import { FloatingToolbar } from "./floating-toolbar";
import { DragHandle } from "./drag-handle";

// Create lowlight instance with all languages
const lowlight = createLowlight(all);

type SaveStatus = "saved" | "saving" | "unsaved";

interface DocumentEditorProps {
  document: Document;
  readOnly?: boolean;
}

export function DocumentEditor({ document, readOnly = false }: DocumentEditorProps) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "connecting" | "disconnected">("connecting");

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

  // Track connection status reactively
  useEffect(() => {
    if (!provider) {
      setConnectionStatus("disconnected");
      return;
    }

    const onStatus = () => {
      if (provider.wsconnected) {
        setConnectionStatus("connected");
      } else if (provider.wsconnecting) {
        setConnectionStatus("connecting");
      } else {
        setConnectionStatus("disconnected");
      }
    };

    provider.on("status", onStatus);
    // Set initial status
    onStatus();

    return () => {
      provider.off("status", onStatus);
    };
  }, [provider]);

  // Cleanup provider on unmount
  useEffect(() => {
    return () => {
      provider?.destroy();
    };
  }, [provider]);

  // Auto-save indicator: listen to Yjs doc updates
  const handleUpdate = useCallback(() => {
    setSaveStatus("saving");
    // Hocuspocus auto-saves with debounce; show "saved" after a delay
    const timer = setTimeout(() => setSaveStatus("saved"), 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    ydoc.on("update", handleUpdate);
    return () => {
      ydoc.off("update", handleUpdate);
    };
  }, [ydoc, handleUpdate]);

  // Create editor with TipTap extensions
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // We'll use CodeBlockLowlight instead of the default
        codeBlock: false,
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
      }),
      Placeholder.configure({
        placeholder: "Type '/' for commands...",
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
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-blue-600 dark:text-blue-400 underline cursor-pointer",
        },
      }),
      SlashCommand,
    ],
    editable: !readOnly,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose lg:prose-lg dark:prose-invert max-w-none focus:outline-none min-h-[500px] p-8",
      },
    },
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header with auto-save indicator */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate max-w-md">
            {document.title || "Untitled"}
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {/* Auto-save status */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            {saveStatus === "saving" && (
              <>
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="8" cy="8" r="6" strokeDasharray="28" strokeDashoffset="8" />
                </svg>
                <span>Saving...</span>
              </>
            )}
            {saveStatus === "saved" && (
              <>
                <svg className="w-3 h-3 text-green-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 8l3 3 5-5" />
                </svg>
                <span>Saved</span>
              </>
            )}
            {saveStatus === "unsaved" && (
              <>
                <span className="w-2 h-2 rounded-full bg-yellow-500" />
                <span>Unsaved changes</span>
              </>
            )}
          </div>

          {/* Connection status */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
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
      </div>

      {/* Editor content with floating toolbar and drag handle */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-900 relative">
        <FloatingToolbar editor={editor} />
        <DragHandle editor={editor} />
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
