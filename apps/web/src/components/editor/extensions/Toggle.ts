import { Node, mergeAttributes } from "@tiptap/react";

export interface ToggleOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    toggle: {
      /**
       * Set a toggle/collapsible block
       */
      setToggle: () => ReturnType;
      /**
       * Toggle a toggle block on/off
       */
      toggleToggle: () => ReturnType;
    };
  }
}

export const Toggle = Node.create<ToggleOptions>({
  name: "toggle",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  group: "block",

  content: "toggleSummary toggleContent",

  defining: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (element) => element.getAttribute("data-open") === "true",
        renderHTML: (attributes) => ({
          "data-open": attributes.open ? "true" : "false",
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="toggle"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "toggle",
        class: "toggle-block my-2 border border-gray-200 rounded-lg overflow-hidden",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setToggle:
        () =>
        ({ commands, chain }) => {
          return chain()
            .insertContent({
              type: this.name,
              attrs: { open: true },
              content: [
                {
                  type: "toggleSummary",
                  content: [{ type: "text", text: "Toggle title" }],
                },
                {
                  type: "toggleContent",
                  content: [{ type: "paragraph" }],
                },
              ],
            })
            .run();
        },
      toggleToggle:
        () =>
        ({ state, chain }) => {
          // Find the toggle node and toggle its open state
          const { selection } = state;
          const { $from } = selection;

          let depth = $from.depth;
          while (depth > 0) {
            const node = $from.node(depth);
            if (node.type.name === this.name) {
              const pos = $from.before(depth);
              return chain()
                .command(({ tr }) => {
                  tr.setNodeMarkup(pos, undefined, {
                    ...node.attrs,
                    open: !node.attrs.open,
                  });
                  return true;
                })
                .run();
            }
            depth--;
          }
          return false;
        },
    };
  },
});

export const ToggleSummary = Node.create({
  name: "toggleSummary",

  group: "block",

  content: "inline*",

  defining: true,

  parseHTML() {
    return [
      {
        tag: 'div[data-type="toggle-summary"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "toggle-summary",
        class:
          "toggle-summary flex items-center gap-2 px-3 py-2 bg-gray-50 cursor-pointer select-none font-medium",
      }),
      ["span", { class: "toggle-icon text-gray-400" }, "▶"],
      ["span", { class: "flex-1" }, 0],
    ];
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        // Move to the content when pressing enter in summary
        const { state, view } = this.editor;
        const { selection } = state;
        const { $from } = selection;

        if ($from.parent.type.name === this.name) {
          // Find the toggle node
          let depth = $from.depth;
          while (depth > 0) {
            const node = $from.node(depth);
            if (node.type.name === "toggle") {
              // Find the toggleContent child and move cursor there
              const togglePos = $from.before(depth);
              const toggleNode = state.doc.nodeAt(togglePos);
              if (toggleNode && toggleNode.childCount >= 2) {
                // Position after toggleSummary
                const contentPos = togglePos + toggleNode.child(0).nodeSize + 1;
                // Move cursor to start of content
                this.editor.commands.setTextSelection(contentPos + 1);
                return true;
              }
            }
            depth--;
          }
        }
        return false;
      },
    };
  },
});

export const ToggleContent = Node.create({
  name: "toggleContent",

  group: "block",

  content: "block+",

  defining: true,

  parseHTML() {
    return [
      {
        tag: 'div[data-type="toggle-content"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "toggle-content",
        class: "toggle-content px-3 py-2 pl-8",
      }),
      0,
    ];
  },
});
