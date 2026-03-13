"use client";

import { useState, useCallback } from "react";
import { Megaphone, Plus, Pencil, Trash2, X, Check } from "lucide-react";
import type { Announcement } from "@/lib/api";

interface AnnouncementsViewProps {
  announcements: Announcement[];
  isPrivileged: boolean;
  currentUserId: string;
  onCreate: (content: string) => Promise<void>;
  onUpdate: (id: string, content: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function AnnouncementsView({
  announcements,
  isPrivileged,
  currentUserId,
  onCreate,
  onUpdate,
  onDelete,
}: AnnouncementsViewProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = useCallback(async () => {
    const content = newContent.trim();
    if (!content || loading) return;
    setLoading(true);
    try {
      await onCreate(content);
      setNewContent("");
      setShowCreateForm(false);
    } finally {
      setLoading(false);
    }
  }, [newContent, loading, onCreate]);

  const handleUpdate = useCallback(async (id: string) => {
    const content = editContent.trim();
    if (!content || loading) return;
    setLoading(true);
    try {
      await onUpdate(id, content);
      setEditingId(null);
      setEditContent("");
    } finally {
      setLoading(false);
    }
  }, [editContent, loading, onUpdate]);

  const handleDelete = useCallback(async (id: string) => {
    if (loading) return;
    setLoading(true);
    try {
      await onDelete(id);
    } finally {
      setLoading(false);
    }
  }, [loading, onDelete]);

  const canModify = (announcement: Announcement) =>
    isPrivileged || announcement.authorId === currentUserId;

  if (announcements.length === 0 && !isPrivileged) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
        <Megaphone className="h-8 w-8 text-gray-400 dark:text-gray-500 mb-2" />
        <p className="text-sm text-gray-500 dark:text-gray-400">No announcements</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Group announcements will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
      {/* Create button for admins/owners */}
      {isPrivileged && !showCreateForm && (
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-blue-600 dark:text-blue-400 border border-dashed border-blue-300 dark:border-blue-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Announcement
        </button>
      )}

      {/* Create form */}
      {showCreateForm && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Write an announcement..."
            className="w-full px-3 py-2 text-sm border rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
            rows={3}
            maxLength={5000}
            autoFocus
          />
          <div className="flex items-center justify-end gap-2 mt-2">
            <button
              onClick={() => { setShowCreateForm(false); setNewContent(""); }}
              className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!newContent.trim() || loading}
              className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Post
            </button>
          </div>
        </div>
      )}

      {/* Announcements list */}
      {announcements.map((ann) => (
        <div
          key={ann.id}
          className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3"
        >
          {editingId === ann.id ? (
            <div>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
                rows={3}
                maxLength={5000}
                autoFocus
              />
              <div className="flex items-center justify-end gap-2 mt-2">
                <button
                  onClick={() => { setEditingId(null); setEditContent(""); }}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400"
                >
                  <X className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleUpdate(ann.id)}
                  disabled={!editContent.trim() || loading}
                  className="p-1 rounded hover:bg-green-200 dark:hover:bg-green-800 text-green-600 dark:text-green-400 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <Megaphone className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                    Announcement
                  </span>
                </div>
                <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
                  {ann.content}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {new Date(ann.createdAt).toLocaleDateString()} at{" "}
                  {new Date(ann.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              {canModify(ann) && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => { setEditingId(ann.id); setEditContent(ann.content); }}
                    className="p-1 rounded hover:bg-amber-200 dark:hover:bg-amber-800 text-gray-400 hover:text-gray-600"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(ann.id)}
                    className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-600"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {announcements.length === 0 && isPrivileged && !showCreateForm && (
        <div className="text-center py-8">
          <Megaphone className="h-8 w-8 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No announcements yet</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Create one to notify all group members
          </p>
        </div>
      )}
    </div>
  );
}
