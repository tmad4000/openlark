import { Node, mergeAttributes } from "@tiptap/react";
import { ReactNodeViewRenderer } from "@tiptap/react";

export type CalloutType = "info" | "warning" | "success" | "error";

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (attrs?: { type?: CalloutType }) => ReturnType;
      toggleCallout: (attrs?: { type?: CalloutType }) => ReturnType;
    };
  }
}

export const Callout = Node.create({
  name: "callout",

  group: "block",

  content: "block+",

  defining: true,

  addAttributes() {
    return {
      type: {
        default: "info" as CalloutType,
        parseHTML: (element) => element.getAttribute("data-callout-type") || "info",
        renderHTML: (attributes) => ({
          "data-callout-type": attributes.type,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="callout"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const type = (HTMLAttributes["data-callout-type"] || "info") as CalloutType;
    const colors: Record<CalloutType, string> = {
      info: "border-l-4 border-l-blue-500 bg-blue-50 dark:bg-blue-950/30",
      warning: "border-l-4 border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950/30",
      success: "border-l-4 border-l-green-500 bg-green-50 dark:bg-green-950/30",
      error: "border-l-4 border-l-red-500 bg-red-50 dark:bg-red-950/30",
    };
    const icons: Record<CalloutType, string> = {
      info: "\u2139\uFE0F",
      warning: "\u26A0\uFE0F",
      success: "\u2705",
      error: "\u274C",
    };
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "callout",
        class: `callout callout-${type} ${colors[type]} rounded-r-lg p-4 my-2`,
      }),
      [
        "div",
        { class: "callout-icon text-sm mb-1", contenteditable: "false" },
        icons[type],
      ],
      ["div", { class: "callout-content" }, 0],
    ];
  },

  addCommands() {
    return {
      setCallout:
        (attrs) =>
        ({ commands }) => {
          return commands.wrapIn(this.name, attrs);
        },
      toggleCallout:
        (attrs) =>
        ({ commands }) => {
          return commands.toggleWrap(this.name, attrs);
        },
    };
  },
});
