import { Node, mergeAttributes } from "@tiptap/react";

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    toggleBlock: {
      setToggleBlock: () => ReturnType;
    };
  }
}

export const ToggleBlock = Node.create({
  name: "toggleBlock",

  group: "block",

  content: "block+",

  defining: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (element) => element.getAttribute("data-open") !== "false",
        renderHTML: (attributes) => ({
          "data-open": attributes.open ? "true" : "false",
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'details[data-type="toggle"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const isOpen = HTMLAttributes["data-open"] !== "false";
    return [
      "details",
      mergeAttributes(HTMLAttributes, {
        "data-type": "toggle",
        class: "toggle-block border border-gray-200 dark:border-gray-700 rounded-lg my-2",
        ...(isOpen ? { open: "true" } : {}),
      }),
      [
        "summary",
        {
          class:
            "px-4 py-2 cursor-pointer select-none font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-t-lg list-none",
        },
        "Toggle block",
      ],
      ["div", { class: "px-4 pb-3 pt-1" }, 0],
    ];
  },

  addCommands() {
    return {
      setToggleBlock:
        () =>
        ({ commands }) => {
          return commands.wrapIn(this.name);
        },
    };
  },
});
