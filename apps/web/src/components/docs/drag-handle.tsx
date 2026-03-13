"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";

interface DragHandleProps {
  editor: Editor | null;
}

export function DragHandle({ editor }: DragHandleProps) {
  const handleRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const dragNodePos = useRef<number | null>(null);

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!editor?.view) return;

      const view = editor.view;
      const editorRect = view.dom.getBoundingClientRect();
      const { clientX, clientY } = event;

      // Only show when mouse is near the left edge of the editor
      if (
        clientX < editorRect.left - 10 ||
        clientX > editorRect.left + 60 ||
        clientY < editorRect.top ||
        clientY > editorRect.bottom
      ) {
        setVisible(false);
        return;
      }

      // Find the block-level node at this position
      const pos = view.posAtCoords({ left: editorRect.left + 20, top: clientY });
      if (!pos) {
        setVisible(false);
        return;
      }

      // Resolve to the top-level block node
      const resolvedPos = view.state.doc.resolve(pos.pos);
      const blockDepth = resolvedPos.depth > 0 ? 1 : 0;
      const blockStart = resolvedPos.start(blockDepth);
      const node = resolvedPos.node(blockDepth);

      if (!node || node.type.name === "doc") {
        setVisible(false);
        return;
      }

      // Get the DOM node for this block
      const domNode = view.nodeDOM(blockStart - (blockDepth > 0 ? 1 : 0));
      if (!domNode || !(domNode instanceof HTMLElement)) {
        setVisible(false);
        return;
      }

      const nodeRect = domNode.getBoundingClientRect();
      dragNodePos.current = blockStart - (blockDepth > 0 ? 1 : 0);

      setPosition({
        top: nodeRect.top + 2,
        left: editorRect.left - 28,
      });
      setVisible(true);
    },
    [editor]
  );

  useEffect(() => {
    document.addEventListener("mousemove", handleMouseMove);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
    };
  }, [handleMouseMove]);

  const handleDragStart = useCallback(
    (event: React.DragEvent) => {
      if (!editor?.view || dragNodePos.current === null) return;

      const pos = dragNodePos.current;
      const resolvedPos = editor.view.state.doc.resolve(pos);
      const node = resolvedPos.nodeAfter;
      if (!node) return;

      // Select the node
      editor
        .chain()
        .focus()
        .setNodeSelection(pos)
        .run();

      // Set drag data
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", "");

      // Use a transparent drag image
      const dragImage = document.createElement("div");
      dragImage.style.opacity = "0";
      document.body.appendChild(dragImage);
      event.dataTransfer.setDragImage(dragImage, 0, 0);
      setTimeout(() => document.body.removeChild(dragImage), 0);
    },
    [editor]
  );

  if (!editor) return null;

  return (
    <div
      ref={handleRef}
      draggable
      onDragStart={handleDragStart}
      className={`fixed z-40 flex items-center justify-center w-6 h-6 rounded cursor-grab active:cursor-grabbing transition-opacity ${
        visible
          ? "opacity-60 hover:opacity-100"
          : "opacity-0 pointer-events-none"
      }`}
      style={{ top: position.top, left: position.left }}
      title="Drag to reorder"
    >
      <svg
        className="w-4 h-4 text-gray-400 dark:text-gray-500"
        viewBox="0 0 16 16"
        fill="currentColor"
      >
        <circle cx="5" cy="3" r="1.5" />
        <circle cx="11" cy="3" r="1.5" />
        <circle cx="5" cy="8" r="1.5" />
        <circle cx="11" cy="8" r="1.5" />
        <circle cx="5" cy="13" r="1.5" />
        <circle cx="11" cy="13" r="1.5" />
      </svg>
    </div>
  );
}
