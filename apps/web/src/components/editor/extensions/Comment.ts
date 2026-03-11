import { Mark, mergeAttributes } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export interface CommentOptions {
  HTMLAttributes: Record<string, unknown>;
}

export interface CommentAttributes {
  commentId: string;
  resolved?: boolean;
}

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    comment: {
      /**
       * Set a comment mark
       */
      setComment: (attributes: CommentAttributes) => ReturnType;
      /**
       * Unset a comment mark
       */
      unsetComment: (commentId: string) => ReturnType;
      /**
       * Toggle a comment mark
       */
      toggleComment: (attributes: CommentAttributes) => ReturnType;
      /**
       * Mark comment as resolved
       */
      resolveComment: (commentId: string) => ReturnType;
      /**
       * Mark comment as unresolved
       */
      unresolveComment: (commentId: string) => ReturnType;
    };
  }
}

export const Comment = Mark.create<CommentOptions>({
  name: "comment",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-comment-id"),
        renderHTML: (attributes) => ({
          "data-comment-id": attributes.commentId,
        }),
      },
      resolved: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-comment-resolved") === "true",
        renderHTML: (attributes) => ({
          "data-comment-resolved": attributes.resolved ? "true" : "false",
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="comment"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const isResolved = HTMLAttributes["data-comment-resolved"] === "true";

    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "comment",
        class: `comment-highlight ${
          isResolved
            ? "bg-gray-100 border-b border-dashed border-gray-400"
            : "bg-yellow-100 border-b-2 border-yellow-400"
        } cursor-pointer transition-colors hover:bg-yellow-200`,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setComment:
        (attributes) =>
        ({ commands }) => {
          return commands.setMark(this.name, attributes);
        },
      unsetComment:
        (commentId) =>
        ({ tr, state }) => {
          const { from, to } = state.selection;

          // Find and remove the specific comment mark
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (node.marks) {
              node.marks.forEach((mark) => {
                if (mark.type.name === this.name && mark.attrs.commentId === commentId) {
                  tr.removeMark(pos, pos + node.nodeSize, mark);
                }
              });
            }
          });

          return true;
        },
      toggleComment:
        (attributes) =>
        ({ commands }) => {
          return commands.toggleMark(this.name, attributes);
        },
      resolveComment:
        (commentId) =>
        ({ tr, state }) => {
          // Find all marks with this commentId and update resolved attribute
          state.doc.descendants((node, pos) => {
            if (node.marks) {
              node.marks.forEach((mark) => {
                if (mark.type.name === this.name && mark.attrs.commentId === commentId) {
                  tr.removeMark(pos, pos + node.nodeSize, mark);
                  tr.addMark(
                    pos,
                    pos + node.nodeSize,
                    state.schema.marks[this.name].create({
                      ...mark.attrs,
                      resolved: true,
                    })
                  );
                }
              });
            }
          });
          return true;
        },
      unresolveComment:
        (commentId) =>
        ({ tr, state }) => {
          // Find all marks with this commentId and update resolved attribute
          state.doc.descendants((node, pos) => {
            if (node.marks) {
              node.marks.forEach((mark) => {
                if (mark.type.name === this.name && mark.attrs.commentId === commentId) {
                  tr.removeMark(pos, pos + node.nodeSize, mark);
                  tr.addMark(
                    pos,
                    pos + node.nodeSize,
                    state.schema.marks[this.name].create({
                      ...mark.attrs,
                      resolved: false,
                    })
                  );
                }
              });
            }
          });
          return true;
        },
    };
  },

  // Allow clicking on comments to trigger events
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("commentClickHandler"),
        props: {
          handleClick(_view, _pos, event) {
            const target = event.target as HTMLElement;
            const commentElement = target.closest('[data-type="comment"]');

            if (commentElement) {
              const commentId = commentElement.getAttribute("data-comment-id");
              if (commentId) {
                // Dispatch a custom event that the parent can listen to
                const customEvent = new CustomEvent("comment-click", {
                  detail: { commentId },
                  bubbles: true,
                });
                target.dispatchEvent(customEvent);
                return true;
              }
            }

            return false;
          },
        },
      }),
    ];
  },
});
