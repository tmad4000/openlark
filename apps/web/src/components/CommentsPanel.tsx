"use client";

import { useState, useEffect, useCallback } from "react";
import {
  MessageSquare,
  X,
  Send,
  Check,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Loader2,
  Trash2,
} from "lucide-react";

interface Author {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  email: string;
}

interface Reply {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: Author;
}

interface Comment {
  id: string;
  documentId: string;
  blockId: string | null;
  content: string;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
  author: Author;
  replyCount: number;
  replies?: Reply[];
}

interface CommentsPanelProps {
  documentId: string;
  token: string;
  currentUserId: string;
  onCommentClick?: (commentId: string) => void;
  onCommentResolved?: (commentId: string, resolved: boolean) => void;
  onCommentDeleted?: (commentId: string) => void;
  selectedCommentId?: string | null;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;

  return date.toLocaleDateString();
}

export default function CommentsPanel({
  documentId,
  token,
  currentUserId,
  onCommentClick,
  onCommentResolved,
  onCommentDeleted,
  selectedCommentId,
}: CommentsPanelProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);

  // Fetch comments
  const fetchComments = useCallback(async () => {
    try {
      const resolvedParam = showResolved ? "" : "&resolved=false";
      const res = await fetch(
        `/api/documents/${documentId}/comments?limit=100${resolvedParam}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        throw new Error("Failed to fetch comments");
      }

      const data = await res.json();
      setComments(data.comments);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch comments:", err);
      setError("Failed to load comments");
    } finally {
      setIsLoading(false);
    }
  }, [documentId, token, showResolved]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Fetch replies for a comment
  const fetchReplies = useCallback(
    async (commentId: string) => {
      try {
        const res = await fetch(
          `/api/documents/${documentId}/comments/${commentId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (!res.ok) {
          throw new Error("Failed to fetch replies");
        }

        const data = await res.json();

        // Update the comment with its replies
        setComments((prev) =>
          prev.map((c) =>
            c.id === commentId ? { ...c, replies: data.comment.replies } : c
          )
        );
      } catch (err) {
        console.error("Failed to fetch replies:", err);
      }
    },
    [documentId, token]
  );

  // Toggle expanded state and fetch replies
  const toggleExpanded = useCallback(
    (commentId: string) => {
      const comment = comments.find((c) => c.id === commentId);

      setExpandedComments((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(commentId)) {
          newSet.delete(commentId);
        } else {
          newSet.add(commentId);
          // Fetch replies if we don't have them yet
          if (comment && !comment.replies && comment.replyCount > 0) {
            fetchReplies(commentId);
          }
        }
        return newSet;
      });
    },
    [comments, fetchReplies]
  );

  // Handle resolve/reopen
  const handleResolve = useCallback(
    async (commentId: string, resolved: boolean) => {
      try {
        const res = await fetch(
          `/api/documents/${documentId}/comments/${commentId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ resolved }),
          }
        );

        if (!res.ok) {
          throw new Error("Failed to update comment");
        }

        // Update local state
        setComments((prev) =>
          prev.map((c) => (c.id === commentId ? { ...c, resolved } : c))
        );

        // If hiding resolved and we just resolved, remove from list
        if (!showResolved && resolved) {
          setComments((prev) => prev.filter((c) => c.id !== commentId));
        }

        // Notify parent
        onCommentResolved?.(commentId, resolved);
      } catch (err) {
        console.error("Failed to resolve comment:", err);
      }
    },
    [documentId, token, showResolved, onCommentResolved]
  );

  // Handle delete
  const handleDelete = useCallback(
    async (commentId: string) => {
      if (!confirm("Are you sure you want to delete this comment?")) {
        return;
      }

      try {
        const res = await fetch(
          `/api/documents/${documentId}/comments/${commentId}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (!res.ok) {
          throw new Error("Failed to delete comment");
        }

        // Remove from local state
        setComments((prev) => prev.filter((c) => c.id !== commentId));

        // Notify parent
        onCommentDeleted?.(commentId);
      } catch (err) {
        console.error("Failed to delete comment:", err);
      }
    },
    [documentId, token, onCommentDeleted]
  );

  // Handle send reply
  const handleSendReply = useCallback(
    async (commentId: string) => {
      if (!replyContent.trim()) return;

      setIsSendingReply(true);

      try {
        const res = await fetch(`/api/documents/${documentId}/comments`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content: replyContent.trim(),
            threadId: commentId,
          }),
        });

        if (!res.ok) {
          throw new Error("Failed to send reply");
        }

        const data = await res.json();

        // Add the reply to the comment
        setComments((prev) =>
          prev.map((c) => {
            if (c.id === commentId) {
              return {
                ...c,
                replyCount: c.replyCount + 1,
                replies: [...(c.replies || []), data.comment],
              };
            }
            return c;
          })
        );

        // Clear reply state
        setReplyContent("");
        setReplyingTo(null);

        // Make sure the comment is expanded
        setExpandedComments((prev) => new Set([...prev, commentId]));
      } catch (err) {
        console.error("Failed to send reply:", err);
      } finally {
        setIsSendingReply(false);
      }
    },
    [documentId, token, replyContent]
  );

  // Auto-expand selected comment
  useEffect(() => {
    if (selectedCommentId) {
      setExpandedComments((prev) => new Set([...prev, selectedCommentId]));
      const comment = comments.find((c) => c.id === selectedCommentId);
      if (comment && !comment.replies && comment.replyCount > 0) {
        fetchReplies(selectedCommentId);
      }
    }
  }, [selectedCommentId, comments, fetchReplies]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4">
        <p className="text-sm text-red-500 mb-2">{error}</p>
        <button
          onClick={fetchComments}
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-gray-600" />
          <span className="font-medium text-gray-900">Comments</span>
          {comments.length > 0 && (
            <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
              {comments.length}
            </span>
          )}
        </div>

        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
            className="rounded border-gray-300"
          />
          Show resolved
        </label>
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto">
        {comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <MessageSquare className="w-10 h-10 text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">No comments yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Select text and click the comment button to add a comment
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className={`p-4 transition-colors ${
                  selectedCommentId === comment.id
                    ? "bg-yellow-50"
                    : "hover:bg-gray-50"
                }`}
              >
                {/* Comment header */}
                <div className="flex items-start gap-2">
                  {/* Author avatar */}
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-white flex-shrink-0"
                    style={{ backgroundColor: "#6366f1" }}
                  >
                    {comment.author.displayName?.charAt(0).toUpperCase() ||
                      comment.author.email.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {comment.author.displayName || comment.author.email}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatRelativeTime(comment.createdAt)}
                      </span>
                      {comment.resolved && (
                        <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                          Resolved
                        </span>
                      )}
                    </div>

                    {/* Comment content */}
                    <p
                      className="mt-1 text-sm text-gray-700 whitespace-pre-wrap cursor-pointer"
                      onClick={() => onCommentClick?.(comment.id)}
                    >
                      {comment.content}
                    </p>

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() =>
                          setReplyingTo(replyingTo === comment.id ? null : comment.id)
                        }
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Reply
                      </button>
                      <button
                        onClick={() => handleResolve(comment.id, !comment.resolved)}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                      >
                        {comment.resolved ? (
                          <>
                            <RotateCcw className="w-3 h-3" />
                            Reopen
                          </>
                        ) : (
                          <>
                            <Check className="w-3 h-3" />
                            Resolve
                          </>
                        )}
                      </button>
                      {comment.author.id === currentUserId && (
                        <button
                          onClick={() => handleDelete(comment.id)}
                          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      )}
                    </div>

                    {/* Replies toggle */}
                    {comment.replyCount > 0 && (
                      <button
                        onClick={() => toggleExpanded(comment.id)}
                        className="flex items-center gap-1 mt-2 text-xs text-blue-600 hover:text-blue-700"
                      >
                        {expandedComments.has(comment.id) ? (
                          <>
                            <ChevronUp className="w-3 h-3" />
                            Hide replies
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3 h-3" />
                            {comment.replyCount}{" "}
                            {comment.replyCount === 1 ? "reply" : "replies"}
                          </>
                        )}
                      </button>
                    )}

                    {/* Replies */}
                    {expandedComments.has(comment.id) && comment.replies && (
                      <div className="mt-3 pl-4 border-l-2 border-gray-200 space-y-3">
                        {comment.replies.map((reply) => (
                          <div key={reply.id} className="flex items-start gap-2">
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-white flex-shrink-0"
                              style={{ backgroundColor: "#8b5cf6" }}
                            >
                              {reply.author.displayName?.charAt(0).toUpperCase() ||
                                reply.author.email.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-gray-900">
                                  {reply.author.displayName || reply.author.email}
                                </span>
                                <span className="text-xs text-gray-400">
                                  {formatRelativeTime(reply.createdAt)}
                                </span>
                              </div>
                              <p className="mt-0.5 text-xs text-gray-700 whitespace-pre-wrap">
                                {reply.content}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Reply input */}
                    {replyingTo === comment.id && (
                      <div className="mt-3 flex items-start gap-2">
                        <textarea
                          value={replyContent}
                          onChange={(e) => setReplyContent(e.target.value)}
                          placeholder="Write a reply..."
                          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                          rows={2}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleSendReply(comment.id);
                            }
                          }}
                        />
                        <button
                          onClick={() => handleSendReply(comment.id)}
                          disabled={!replyContent.trim() || isSendingReply}
                          className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSendingReply ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
