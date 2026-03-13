import { Node, mergeAttributes } from "@tiptap/react";

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    fileAttachment: {
      setFileAttachment: (attrs: {
        src: string;
        fileName: string;
        fileSize?: number;
        fileType?: string;
      }) => ReturnType;
    };
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const FileAttachment = Node.create({
  name: "fileAttachment",

  group: "block",

  atom: true,

  addAttributes() {
    return {
      src: { default: null },
      fileName: { default: "Untitled file" },
      fileSize: { default: 0 },
      fileType: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="file-attachment"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const fileName = HTMLAttributes.fileName || "Untitled file";
    const fileSize = HTMLAttributes.fileSize
      ? formatFileSize(Number(HTMLAttributes.fileSize))
      : "";
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "file-attachment",
        class:
          "file-attachment flex items-center gap-3 border border-gray-200 dark:border-gray-700 rounded-lg p-3 my-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer",
      }),
      [
        "div",
        { class: "flex-shrink-0 w-10 h-10 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-lg" },
        "\uD83D\uDCCE",
      ],
      [
        "div",
        { class: "min-w-0 flex-1" },
        ["div", { class: "text-sm font-medium text-gray-700 dark:text-gray-300 truncate" }, fileName],
        ["div", { class: "text-xs text-gray-500 dark:text-gray-400" }, fileSize],
      ],
    ];
  },

  addCommands() {
    return {
      setFileAttachment:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
    };
  },
});
