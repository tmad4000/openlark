import { Node, mergeAttributes } from "@tiptap/react";

export type CalloutType = "info" | "warning" | "success" | "error";

export interface CalloutOptions {
  HTMLAttributes: Record<string, unknown>;
  types: CalloutType[];
}

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    callout: {
      /**
       * Set a callout node
       */
      setCallout: (attributes?: { type?: CalloutType }) => ReturnType;
      /**
       * Toggle a callout node
       */
      toggleCallout: (attributes?: { type?: CalloutType }) => ReturnType;
      /**
       * Update the callout type
       */
      updateCalloutType: (type: CalloutType) => ReturnType;
    };
  }
}

export const Callout = Node.create<CalloutOptions>({
  name: "callout",

  addOptions() {
    return {
      HTMLAttributes: {},
      types: ["info", "warning", "success", "error"],
    };
  },

  group: "block",

  content: "block+",

  defining: true,

  addAttributes() {
    return {
      type: {
        default: "info",
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

  renderHTML({ node, HTMLAttributes }) {
    const type = node.attrs.type as CalloutType;

    // Define colors for each callout type
    const typeStyles: Record<CalloutType, { bg: string; border: string; icon: string }> = {
      info: {
        bg: "bg-blue-50",
        border: "border-l-4 border-blue-500",
        icon: "ℹ️",
      },
      warning: {
        bg: "bg-yellow-50",
        border: "border-l-4 border-yellow-500",
        icon: "⚠️",
      },
      success: {
        bg: "bg-green-50",
        border: "border-l-4 border-green-500",
        icon: "✅",
      },
      error: {
        bg: "bg-red-50",
        border: "border-l-4 border-red-500",
        icon: "❌",
      },
    };

    const style = typeStyles[type] || typeStyles.info;

    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "callout",
        class: `callout callout-${type} ${style.bg} ${style.border} p-4 my-4 rounded-r-lg`,
      }),
      [
        "div",
        { class: "flex gap-3" },
        ["span", { class: "callout-icon text-lg flex-shrink-0" }, style.icon],
        ["div", { class: "callout-content flex-1 min-w-0" }, 0],
      ],
    ];
  },

  addCommands() {
    return {
      setCallout:
        (attributes) =>
        ({ commands }) => {
          return commands.wrapIn(this.name, attributes);
        },
      toggleCallout:
        (attributes) =>
        ({ commands }) => {
          return commands.toggleWrap(this.name, attributes);
        },
      updateCalloutType:
        (type) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, { type });
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      // Allow backspace to unwrap when at the start of a callout
      Backspace: () => {
        const { selection, doc } = this.editor.state;
        const { empty, $anchor } = selection;

        if (!empty || $anchor.parent.type.name !== "paragraph") {
          return false;
        }

        const isAtStart = $anchor.parentOffset === 0;
        if (!isAtStart) {
          return false;
        }

        // Check if we're inside a callout
        let depth = $anchor.depth;
        while (depth > 0) {
          const node = $anchor.node(depth);
          if (node.type.name === this.name) {
            return this.editor.commands.lift(this.name);
          }
          depth--;
        }

        return false;
      },
    };
  },
});
