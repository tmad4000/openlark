"use client";

import { useEffect, useRef, useMemo } from "react";
import { useEditor, EditorContent, JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import * as Y from "yjs";
import { X, RotateCcw, Loader2 } from "lucide-react";

const lowlight = createLowlight(common);

interface VersionPreviewEditorProps {
  versionId: string;
  versionName: string;
  snapshot: string; // base64 encoded Yjs state
  onClose: () => void;
  onRestore: () => void;
  isRestoring?: boolean;
}

export default function VersionPreviewEditor({
  versionName,
  snapshot,
  onClose,
  onRestore,
  isRestoring = false,
}: VersionPreviewEditorProps) {
  const ydocRef = useRef<Y.Doc | null>(null);

  // Parse the snapshot and get the content
  const content = useMemo((): JSONContent | null => {
    try {
      // Create a new Y.Doc and apply the snapshot
      const ydoc = new Y.Doc();
      ydocRef.current = ydoc;

      // Decode base64 to Uint8Array
      const binaryString = atob(snapshot);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Apply the update to the doc
      Y.applyUpdate(ydoc, bytes);

      // Get the XML fragment for prosemirror
      const xmlFragment = ydoc.getXmlFragment("default");

      // Convert to JSON for TipTap
      // This is a simplified conversion - we need to traverse the XML structure
      const jsonContent = xmlFragmentToJson(xmlFragment);

      return jsonContent;
    } catch (err) {
      console.error("Failed to parse version snapshot:", err);
      return null;
    }
  }, [snapshot]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Underline,
      Link.configure({
        openOnClick: true,
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Table.configure({
        resizable: false,
      }),
      TableRow,
      TableCell,
      TableHeader,
      CodeBlockLowlight.configure({
        lowlight,
      }),
    ],
    content: content || "<p>Unable to load version content</p>",
    editable: false,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none p-8",
      },
    },
  });

  useEffect(() => {
    return () => {
      if (ydocRef.current) {
        ydocRef.current.destroy();
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-amber-50">
        <div className="flex items-center gap-3">
          <div className="px-2 py-1 bg-amber-200 text-amber-800 rounded text-sm font-medium">
            Preview Mode
          </div>
          <span className="text-gray-700 font-medium">
            {versionName}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRestore}
            disabled={isRestoring}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {isRestoring ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4" />
            )}
            Restore This Version
          </button>
          <button
            onClick={onClose}
            className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Editor content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

/**
 * Convert a Yjs XmlFragment to TipTap/ProseMirror JSON format
 */
function xmlFragmentToJson(fragment: Y.XmlFragment): JSONContent {
  const content: JSONContent[] = [];

  fragment.forEach((item) => {
    if (item instanceof Y.XmlElement) {
      const node = xmlElementToJson(item);
      if (node) {
        content.push(node);
      }
    } else if (item instanceof Y.XmlText) {
      const text = item.toString();
      if (text) {
        content.push({
          type: "text",
          text: text,
        });
      }
    }
  });

  return {
    type: "doc",
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  };
}

function xmlElementToJson(element: Y.XmlElement): JSONContent | null {
  const nodeName = element.nodeName;
  const attrs = element.getAttributes();

  // Map Y.js element names to ProseMirror node types
  const typeMap: Record<string, string> = {
    paragraph: "paragraph",
    heading: "heading",
    bulletList: "bulletList",
    orderedList: "orderedList",
    listItem: "listItem",
    blockquote: "blockquote",
    codeBlock: "codeBlock",
    horizontalRule: "horizontalRule",
    taskList: "taskList",
    taskItem: "taskItem",
    table: "table",
    tableRow: "tableRow",
    tableCell: "tableCell",
    tableHeader: "tableHeader",
    image: "image",
    hardBreak: "hardBreak",
  };

  const type = typeMap[nodeName] || nodeName;

  const node: JSONContent = { type };

  // Handle attributes
  if (Object.keys(attrs).length > 0) {
    node.attrs = attrs;
  }

  // Handle children
  const children: JSONContent[] = [];
  element.forEach((child) => {
    if (child instanceof Y.XmlElement) {
      const childNode = xmlElementToJson(child);
      if (childNode) {
        children.push(childNode);
      }
    } else if (child instanceof Y.XmlText) {
      const delta = child.toDelta();
      for (const op of delta) {
        if (typeof op.insert === "string") {
          const textNode: JSONContent = {
            type: "text",
            text: op.insert,
          };

          if (op.attributes) {
            const marks: Array<{ type: string; attrs?: Record<string, unknown> }> = [];

            if (op.attributes.bold) marks.push({ type: "bold" });
            if (op.attributes.italic) marks.push({ type: "italic" });
            if (op.attributes.underline) marks.push({ type: "underline" });
            if (op.attributes.strike) marks.push({ type: "strike" });
            if (op.attributes.code) marks.push({ type: "code" });
            if (op.attributes.link) {
              marks.push({
                type: "link",
                attrs: { href: op.attributes.link as string },
              });
            }

            if (marks.length > 0) {
              textNode.marks = marks;
            }
          }

          children.push(textNode);
        }
      }
    }
  });

  if (children.length > 0) {
    node.content = children;
  }

  return node;
}
