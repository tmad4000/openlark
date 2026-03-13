"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
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
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { all, createLowlight } from "lowlight";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { api, type Document, type User } from "@/lib/api";
import { SlashCommand } from "./slash-command-menu";
import { FloatingToolbar } from "./floating-toolbar";
import { DragHandle } from "./drag-handle";
import { Callout } from "./extensions/callout";
import { ToggleBlock } from "./extensions/toggle";
import { FileAttachment } from "./extensions/file-attachment";
import { CommentMark } from "./extensions/comment-mark";
import { CommentsPanel } from "./comments-panel";

// 12 distinct colors for collaborator cursors
const CURSOR_COLORS = [
  "#E06C75", "#61AFEF", "#98C379", "#E5C07B", "#C678DD", "#56B6C2",
  "#FF6B6B", "#4ECDC4", "#F7DC6F", "#BB8FCE", "#85C1E9", "#F0B27A",
];

function getCursorColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

export interface CollaboratorPresence {
  userId: string;
  name: string;
  avatarUrl: string | null;
  color: string;
}

// Create lowlight instance with all languages
const lowlight = createLowlight(all);

type SaveStatus = "saved" | "saving" | "unsaved";

interface DocumentEditorProps {
  document: Document;
  readOnly?: boolean;
  currentUser?: User | null;
}

export function DocumentEditor({ document, readOnly = false, currentUser }: DocumentEditorProps) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "connecting" | "disconnected">("connecting");
  const [collaborators, setCollaborators] = useState<CollaboratorPresence[]>([]);
  const [commentsPanelOpen, setCommentsPanelOpen] = useState(false);

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

  // Set local awareness state and track remote collaborators
  useEffect(() => {
    if (!provider || !currentUser) return;

    const awareness = provider.awareness;
    const color = getCursorColor(currentUser.id);

    // Set our own presence
    awareness.setLocalStateField("user", {
      userId: currentUser.id,
      name: currentUser.displayName,
      avatarUrl: currentUser.avatarUrl,
      color,
    });

    const updateCollaborators = () => {
      const states = awareness.getStates();
      const others: CollaboratorPresence[] = [];
      states.forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const u = state.user as CollaboratorPresence | undefined;
        if (u?.userId) {
          // Deduplicate by userId (user may have multiple tabs)
          if (!others.some((o) => o.userId === u.userId)) {
            others.push(u);
          }
        }
      });
      setCollaborators(others);
    };

    awareness.on("change", updateCollaborators);
    updateCollaborators();

    return () => {
      awareness.off("change", updateCollaborators);
    };
  }, [provider, currentUser]);

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
      ...(provider
        ? [
            CollaborationCursor.configure({
              provider,
              user: currentUser
                ? {
                    name: currentUser.displayName,
                    color: getCursorColor(currentUser.id),
                  }
                : { name: "Anonymous", color: "#999999" },
            }),
          ]
        : []),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-blue-600 dark:text-blue-400 underline cursor-pointer",
        },
      }),
      Image.configure({
        allowBase64: true,
        HTMLAttributes: {
          class: "max-w-full h-auto rounded-lg my-2",
        },
      }),
      Callout,
      ToggleBlock,
      FileAttachment,
      SlashCommand,
      CommentMark,
    ],
    editable: !readOnly,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose lg:prose-lg dark:prose-invert max-w-none focus:outline-none min-h-[500px] p-8",
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (!files?.length) return false;
        const file = files[0];
        if (file.type.startsWith("image/")) {
          event.preventDefault();
          const reader = new FileReader();
          reader.onload = () => {
            const src = reader.result as string;
            view.dispatch(
              view.state.tr.replaceSelectionWith(
                view.state.schema.nodes.image.create({ src, alt: file.name })
              )
            );
          };
          reader.readAsDataURL(file);
          return true;
        }
        return false;
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of Array.from(items)) {
          if (item.type.startsWith("image/")) {
            event.preventDefault();
            const file = item.getAsFile();
            if (!file) return false;
            const reader = new FileReader();
            reader.onload = () => {
              const src = reader.result as string;
              view.dispatch(
                view.state.tr.replaceSelectionWith(
                  view.state.schema.nodes.image.create({ src, alt: file.name })
                )
              );
            };
            reader.readAsDataURL(file);
            return true;
          }
        }
        return false;
      },
    },
  });

  const handleAddComment = useCallback(() => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) return;
    const selectedText = editor.state.doc.textBetween(from, to, " ");
    const content = window.prompt("Add a comment:");
    if (!content?.trim()) return;
    const anchor = { from, to, text: selectedText.slice(0, 200) };
    // Create comment via API then add mark
    api
      .createDocumentComment(document.id, {
        content: content.trim(),
        anchorJson: anchor,
      })
      .then((res) => {
        editor.chain().focus().setComment(res.comment.id).run();
        setCommentsPanelOpen(true);
      })
      .catch(() => {
        // Failed to create comment
      });
  }, [editor, document.id]);

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
          {/* Collaborator presence avatars */}
          {collaborators.length > 0 && (
            <div className="flex items-center -space-x-2">
              {collaborators.slice(0, 5).map((c) => (
                <div
                  key={c.userId}
                  className="relative w-7 h-7 rounded-full border-2 border-white dark:border-gray-900 flex items-center justify-center text-[10px] font-medium text-white"
                  style={{ backgroundColor: c.color }}
                  title={c.name}
                >
                  {c.avatarUrl ? (
                    <img
                      src={c.avatarUrl}
                      alt={c.name}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    c.name.charAt(0).toUpperCase()
                  )}
                </div>
              ))}
              {collaborators.length > 5 && (
                <div className="w-7 h-7 rounded-full border-2 border-white dark:border-gray-900 bg-gray-400 flex items-center justify-center text-[10px] font-medium text-white">
                  +{collaborators.length - 5}
                </div>
              )}
            </div>
          )}

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

          {/* Comments toggle */}
          <button
            onClick={() => setCommentsPanelOpen(!commentsPanelOpen)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
              commentsPanelOpen
                ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
                : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-400"
            }`}
            title="Toggle comments panel"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Comments
          </button>
        </div>
      </div>

      {/* Editor content with floating toolbar, drag handle, and comments panel */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-900 relative">
          <FloatingToolbar editor={editor} onAddComment={readOnly ? undefined : handleAddComment} />
          <DragHandle editor={editor} />
          <EditorContent editor={editor} />
        </div>
        <CommentsPanel
          documentId={document.id}
          editor={editor}
          currentUser={currentUser}
          isOpen={commentsPanelOpen}
          onClose={() => setCommentsPanelOpen(false)}
        />
      </div>
    </div>
  );
}
