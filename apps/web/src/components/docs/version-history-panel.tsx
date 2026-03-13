"use client";

import { useState, useEffect, useCallback } from "react";
import { api, type DocumentVersion } from "@/lib/api";

interface VersionHistoryPanelProps {
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
  onRestore: () => void;
}

export function VersionHistoryPanel({
  documentId,
  isOpen,
  onClose,
  onRestore,
}: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [newVersionName, setNewVersionName] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);

  const loadVersions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getDocumentVersions(documentId);
      setVersions(res.versions);
    } catch {
      // Failed to load versions
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (isOpen) {
      loadVersions();
      setPreviewVersionId(null);
    }
  }, [isOpen, loadVersions]);

  const handleCreate = async () => {
    const name = newVersionName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await api.createDocumentVersion(documentId, { name });
      setNewVersionName("");
      setShowCreateForm(false);
      await loadVersions();
    } catch {
      // Failed to create version
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (versionId: string) => {
    if (!confirm("Restore this version? Current content will be replaced.")) return;
    setRestoring(versionId);
    try {
      await api.restoreDocumentVersion(documentId, versionId);
      onRestore();
    } catch {
      // Failed to restore
    } finally {
      setRestoring(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="w-72 border-l border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Version History
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

      {/* Create version button */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        {showCreateForm ? (
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={newVersionName}
              onChange={(e) => setNewVersionName(e.target.value)}
              placeholder="Version name..."
              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") {
                  setShowCreateForm(false);
                  setNewVersionName("");
                }
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={creating || !newVersionName.trim()}
                className="flex-1 px-2 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded transition-colors"
              >
                {creating ? "Saving..." : "Save Version"}
              </button>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setNewVersionName("");
                }}
                className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCreateForm(true)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-700 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Create Named Version
          </button>
        )}
      </div>

      {/* Versions list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-gray-400">
            Loading versions...
          </div>
        ) : versions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <svg className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 8v4l3 3" />
              <circle cx="12" cy="12" r="9" />
            </svg>
            <p className="text-sm text-gray-500 dark:text-gray-400">No versions yet</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Create a named version to save a snapshot
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {versions.map((version) => (
              <div
                key={version.id}
                className={`px-4 py-3 cursor-pointer transition-colors ${
                  previewVersionId === version.id
                    ? "bg-blue-50 dark:bg-blue-900/20"
                    : "hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
                onClick={() =>
                  setPreviewVersionId(
                    previewVersionId === version.id ? null : version.id
                  )
                }
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {version.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {new Date(version.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
                {previewVersionId === version.id && (
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRestore(version.id);
                      }}
                      disabled={restoring === version.id}
                      className="flex-1 px-2 py-1 text-xs font-medium text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 rounded transition-colors"
                    >
                      {restoring === version.id ? "Restoring..." : "Restore"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
