"use client";

import { useState, useEffect, useCallback } from "react";
import type { Editor } from "@tiptap/react";
import { api, type DocumentComment, type User } from "@/lib/api";

interface CommentsPanelProps {
  documentId: string;
  editor: Editor | null;
  currentUser?: User | null;
  isOpen: boolean;
  onClose: () => void;
}

interface CommentThread {
  root: DocumentComment;
  replies: DocumentComment[];
}

export function CommentsPanel({
  documentId,
  editor,
  currentUser,
  isOpen,
  onClose,
}: CommentsPanelProps) {
  const [comments, setComments] = useState<DocumentComment[]>([]);
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchComments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getDocumentComments(documentId);
      setComments(res.comments);
    } catch {
      // Silently handle - comments will show empty
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (isOpen) {
      fetchComments();
    }
  }, [isOpen, fetchComments]);

  // Group comments into threads
  useEffect(() => {
    const rootComments = comments.filter((c) => !c.threadId);
    const grouped: CommentThread[] = rootComments.map((root) => ({
      root,
      replies: comments
        .filter((c) => c.threadId === root.id)
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ),
    }));
    // Sort: unresolved first, then by creation date desc
    grouped.sort((a, b) => {
      if (a.root.resolved && !b.root.resolved) return 1;
      if (!a.root.resolved && b.root.resolved) return -1;
      return (
        new Date(b.root.createdAt).getTime() -
        new Date(a.root.createdAt).getTime()
      );
    });
    setThreads(grouped);
  }, [comments]);

  const handleReply = async (threadId: string) => {
    if (!replyContent.trim()) return;
    try {
      await api.createDocumentComment(documentId, {
        content: replyContent.trim(),
        threadId,
      });
      setReplyContent("");
      setReplyingTo(null);
      await fetchComments();
    } catch {
      // Handle error silently
    }
  };

  const handleResolve = async (commentId: string, resolved: boolean) => {
    try {
      if (resolved) {
        await api.resolveComment(commentId);
      } else {
        await api.unresolveComment(commentId);
      }
      await fetchComments();
    } catch {
      // Handle error silently
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await api.deleteComment(commentId);
      // Remove the comment mark from editor if it exists
      if (editor) {
        const comment = comments.find((c) => c.id === commentId);
        if (comment?.anchorJson) {
          removeCommentMark(editor, commentId);
        }
      }
      await fetchComments();
    } catch {
      // Handle error silently
    }
  };

  const scrollToComment = (comment: DocumentComment) => {
    if (!editor || !comment.anchorJson) return;
    const { from } = comment.anchorJson;
    try {
      editor.commands.setTextSelection(from);
      editor.commands.scrollIntoView();
    } catch {
      // Position may have shifted due to edits
    }
  };

  if (!isOpen) return null;

  return (
    <div className="w-80 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Comments
        </h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Comment threads */}
      <div className="flex-1 overflow-y-auto">
        {loading && threads.length === 0 ? (
          <div className="p-4 text-sm text-gray-500 dark:text-gray-400 text-center">
            Loading comments...
          </div>
        ) : threads.length === 0 ? (
          <div className="p-4 text-sm text-gray-500 dark:text-gray-400 text-center">
            No comments yet. Select text and click the comment icon to add one.
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {threads.map((thread) => (
              <CommentThreadItem
                key={thread.root.id}
                thread={thread}
                currentUser={currentUser}
                replyingTo={replyingTo}
                replyContent={replyContent}
                onSetReplyingTo={setReplyingTo}
                onSetReplyContent={setReplyContent}
                onReply={handleReply}
                onResolve={handleResolve}
                onDelete={handleDelete}
                onScrollTo={scrollToComment}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CommentThreadItem({
  thread,
  currentUser,
  replyingTo,
  replyContent,
  onSetReplyingTo,
  onSetReplyContent,
  onReply,
  onResolve,
  onDelete,
  onScrollTo,
}: {
  thread: CommentThread;
  currentUser?: User | null;
  replyingTo: string | null;
  replyContent: string;
  onSetReplyingTo: (id: string | null) => void;
  onSetReplyContent: (content: string) => void;
  onReply: (threadId: string) => void;
  onResolve: (commentId: string, resolved: boolean) => void;
  onDelete: (commentId: string) => void;
  onScrollTo: (comment: DocumentComment) => void;
}) {
  const { root, replies } = thread;
  const isResolved = !!root.resolved;
  const isOwner = currentUser?.id === root.userId;
  const isReplying = replyingTo === root.id;

  return (
    <div
      className={`p-3 ${isResolved ? "opacity-60" : ""} hover:bg-gray-50 dark:hover:bg-gray-800/50`}
    >
      {/* Quoted text anchor */}
      {root.anchorJson && (
        <button
          onClick={() => onScrollTo(root)}
          className="w-full text-left mb-2 px-2 py-1 text-xs bg-yellow-50 dark:bg-yellow-900/20 border-l-2 border-yellow-400 text-gray-600 dark:text-gray-400 truncate rounded-r hover:bg-yellow-100 dark:hover:bg-yellow-900/30"
        >
          &ldquo;{root.anchorJson.text}&rdquo;
        </button>
      )}

      {/* Root comment */}
      <CommentItem
        comment={root}
        isOwner={isOwner}
        onDelete={onDelete}
      />

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-1.5 ml-1">
        <button
          onClick={() => {
            if (isReplying) {
              onSetReplyingTo(null);
            } else {
              onSetReplyingTo(root.id);
              onSetReplyContent("");
            }
          }}
          className="text-xs text-gray-500 hover:text-blue-600 dark:hover:text-blue-400"
        >
          Reply
        </button>
        <button
          onClick={() => onResolve(root.id, !isResolved)}
          className="text-xs text-gray-500 hover:text-green-600 dark:hover:text-green-400"
        >
          {isResolved ? "Reopen" : "Resolve"}
        </button>
      </div>

      {/* Replies */}
      {replies.length > 0 && (
        <div className="ml-4 mt-2 space-y-2 border-l-2 border-gray-100 dark:border-gray-700 pl-3">
          {replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              isOwner={currentUser?.id === reply.userId}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {/* Reply input */}
      {isReplying && (
        <div className="mt-2 ml-4">
          <textarea
            value={replyContent}
            onChange={(e) => onSetReplyContent(e.target.value)}
            placeholder="Write a reply..."
            className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
            rows={2}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                onReply(root.id);
              }
              if (e.key === "Escape") {
                onSetReplyingTo(null);
              }
            }}
          />
          <div className="flex justify-end gap-1 mt-1">
            <button
              onClick={() => onSetReplyingTo(null)}
              className="px-2 py-0.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Cancel
            </button>
            <button
              onClick={() => onReply(root.id)}
              disabled={!replyContent.trim()}
              className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Reply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CommentItem({
  comment,
  isOwner,
  onDelete,
}: {
  comment: DocumentComment;
  isOwner: boolean;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="group">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
          {comment.userId.slice(0, 8)}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-400">
            {formatRelativeTime(comment.createdAt)}
          </span>
          {isOwner && (
            <button
              onClick={() => onDelete(comment.id)}
              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"
              title="Delete"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 whitespace-pre-wrap">
        {comment.content}
      </p>
    </div>
  );
}

function removeCommentMark(editor: Editor, commentId: string) {
  const { doc, tr } = editor.state;
  doc.descendants((node, pos) => {
    node.marks.forEach((mark) => {
      if (
        mark.type.name === "commentMark" &&
        mark.attrs.commentId === commentId
      ) {
        tr.removeMark(pos, pos + node.nodeSize, mark.type);
      }
    });
  });
  editor.view.dispatch(tr);
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
