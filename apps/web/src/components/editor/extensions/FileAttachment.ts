import { Node, mergeAttributes } from "@tiptap/react";

export interface FileAttachmentOptions {
  HTMLAttributes: Record<string, unknown>;
}

export interface FileAttachmentAttributes {
  url: string;
  filename: string;
  size: number;
  contentType: string;
}

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    fileAttachment: {
      /**
       * Insert a file attachment
       */
      setFileAttachment: (attributes: FileAttachmentAttributes) => ReturnType;
    };
  }
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/**
 * Get icon for file type
 */
function getFileIcon(contentType: string): string {
  if (contentType.startsWith("image/")) return "🖼️";
  if (contentType.startsWith("video/")) return "🎬";
  if (contentType.startsWith("audio/")) return "🎵";
  if (contentType === "application/pdf") return "📄";
  if (
    contentType.includes("word") ||
    contentType.includes("document")
  )
    return "📝";
  if (
    contentType.includes("excel") ||
    contentType.includes("spreadsheet")
  )
    return "📊";
  if (
    contentType.includes("powerpoint") ||
    contentType.includes("presentation")
  )
    return "📽️";
  if (contentType.includes("zip") || contentType.includes("archive"))
    return "📦";
  return "📎";
}

export const FileAttachment = Node.create<FileAttachmentOptions>({
  name: "fileAttachment",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  group: "block",

  atom: true,

  draggable: true,

  addAttributes() {
    return {
      url: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-url"),
        renderHTML: (attributes) => ({
          "data-url": attributes.url,
        }),
      },
      filename: {
        default: "file",
        parseHTML: (element) => element.getAttribute("data-filename"),
        renderHTML: (attributes) => ({
          "data-filename": attributes.filename,
        }),
      },
      size: {
        default: 0,
        parseHTML: (element) =>
          parseInt(element.getAttribute("data-size") || "0", 10),
        renderHTML: (attributes) => ({
          "data-size": attributes.size,
        }),
      },
      contentType: {
        default: "application/octet-stream",
        parseHTML: (element) => element.getAttribute("data-content-type"),
        renderHTML: (attributes) => ({
          "data-content-type": attributes.contentType,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="file-attachment"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { url, filename, size, contentType } = node.attrs;
    const icon = getFileIcon(contentType);
    const sizeText = formatFileSize(size);

    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "file-attachment",
        class:
          "file-attachment inline-flex items-center gap-3 px-4 py-3 my-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors max-w-md cursor-pointer",
      }),
      [
        "a",
        {
          href: url,
          target: "_blank",
          rel: "noopener noreferrer",
          download: filename,
          class: "flex items-center gap-3 text-inherit no-underline w-full",
        },
        ["span", { class: "text-2xl flex-shrink-0" }, icon],
        [
          "div",
          { class: "flex-1 min-w-0" },
          [
            "div",
            { class: "font-medium text-gray-900 truncate text-sm" },
            filename,
          ],
          [
            "div",
            { class: "text-xs text-gray-500" },
            sizeText,
          ],
        ],
        [
          "span",
          { class: "text-gray-400 flex-shrink-0" },
          "↓",
        ],
      ],
    ];
  },

  addCommands() {
    return {
      setFileAttachment:
        (attributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          });
        },
    };
  },
});
