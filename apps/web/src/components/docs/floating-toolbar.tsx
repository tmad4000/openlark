"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";

interface FloatingToolbarProps {
  editor: Editor | null;
}

export function FloatingToolbar({ editor }: FloatingToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    if (!editor) return;

    const { from, to, empty } = editor.state.selection;
    if (empty || from === to) {
      setIsVisible(false);
      return;
    }

    // Don't show toolbar in code blocks
    if (editor.isActive("codeBlock")) {
      setIsVisible(false);
      return;
    }

    const view = editor.view;
    const start = view.coordsAtPos(from);
    const end = view.coordsAtPos(to);

    // Position toolbar above the selection
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const toolbarWidth = toolbar.offsetWidth || 320;
    const left = Math.max(
      8,
      Math.min(
        (start.left + end.left) / 2 - toolbarWidth / 2,
        window.innerWidth - toolbarWidth - 8
      )
    );
    const top = start.top - 48;

    setPosition({ top, left });
    setIsVisible(true);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;

    editor.on("selectionUpdate", updatePosition);
    editor.on("blur", () => setIsVisible(false));
    editor.on("focus", updatePosition);

    return () => {
      editor.off("selectionUpdate", updatePosition);
      editor.off("blur", () => setIsVisible(false));
      editor.off("focus", updatePosition);
    };
  }, [editor, updatePosition]);

  if (!editor) return null;

  const setLink = () => {
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("Enter URL", previousUrl);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url })
      .run();
  };

  return (
    <div
      ref={toolbarRef}
      className={`fixed z-50 flex items-center gap-0.5 px-1.5 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg transition-opacity ${
        isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      style={{ top: position.top, left: position.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <FloatingButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        title="Bold"
      >
        <span className="font-bold">B</span>
      </FloatingButton>
      <FloatingButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        title="Italic"
      >
        <span className="italic">I</span>
      </FloatingButton>
      <FloatingButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
        title="Underline"
      >
        <span className="underline">U</span>
      </FloatingButton>
      <FloatingButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive("strike")}
        title="Strikethrough"
      >
        <span className="line-through">S</span>
      </FloatingButton>
      <FloatingButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive("code")}
        title="Code"
      >
        <span className="font-mono text-xs">{"`"}</span>
      </FloatingButton>
      <div className="w-px h-5 bg-gray-200 dark:bg-gray-600 mx-0.5" />
      <FloatingButton
        onClick={setLink}
        active={editor.isActive("link")}
        title="Link"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </FloatingButton>
    </div>
  );
}

function FloatingButton({
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
      className={`flex items-center justify-center w-7 h-7 rounded text-sm transition-colors ${
        active
          ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
          : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
      }`}
    >
      {children}
    </button>
  );
}
