"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Clock,
  History,
  RotateCcw,
  Eye,
  Plus,
  X,
  Loader2,
  AlertCircle,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";

interface Version {
  id: string;
  documentId: string;
  name: string;
  createdAt: string;
  creator: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

interface VersionHistoryPanelProps {
  documentId: string;
  token: string;
  onPreviewVersion: (versionId: string, snapshot: string, name: string) => void;
  onRestoreVersion: (versionId: string) => void;
  onClose: () => void;
}

export default function VersionHistoryPanel({
  documentId,
  token,
  onPreviewVersion,
  onRestoreVersion,
  onClose,
}: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newVersionName, setNewVersionName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [previewingVersionId, setPreviewingVersionId] = useState<string | null>(null);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);

  const fetchVersions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch(`/api/documents/${documentId}/versions`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error("Failed to fetch versions");
      }

      const data = await res.json();
      setVersions(data.versions);
    } catch (err) {
      console.error("Failed to fetch versions:", err);
      setError("Failed to load version history");
    } finally {
      setIsLoading(false);
    }
  }, [documentId, token]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const handleCreateVersion = useCallback(async () => {
    if (!newVersionName.trim()) {
      setCreateError("Please enter a version name");
      return;
    }

    try {
      setIsCreating(true);
      setCreateError(null);

      const res = await fetch(`/api/documents/${documentId}/versions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newVersionName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create version");
      }

      // Refresh versions list
      await fetchVersions();

      // Close dialog and reset form
      setShowCreateDialog(false);
      setNewVersionName("");
    } catch (err) {
      console.error("Failed to create version:", err);
      setCreateError(err instanceof Error ? err.message : "Failed to create version");
    } finally {
      setIsCreating(false);
    }
  }, [documentId, newVersionName, token, fetchVersions]);

  const handlePreview = useCallback(async (version: Version) => {
    try {
      setPreviewingVersionId(version.id);

      const res = await fetch(
        `/api/documents/${documentId}/versions/${version.id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        throw new Error("Failed to fetch version");
      }

      const data = await res.json();

      if (!data.snapshot) {
        throw new Error("Version has no snapshot data");
      }

      onPreviewVersion(version.id, data.snapshot, version.name);
    } catch (err) {
      console.error("Failed to preview version:", err);
      alert(err instanceof Error ? err.message : "Failed to preview version");
    } finally {
      setPreviewingVersionId(null);
    }
  }, [documentId, token, onPreviewVersion]);

  const handleRestore = useCallback(async (version: Version) => {
    if (!confirm(`Are you sure you want to restore to "${version.name}"? This will replace the current content.`)) {
      return;
    }

    try {
      setRestoringVersionId(version.id);

      const res = await fetch(
        `/api/documents/${documentId}/versions/${version.id}/restore`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to restore version");
      }

      onRestoreVersion(version.id);
    } catch (err) {
      console.error("Failed to restore version:", err);
      alert(err instanceof Error ? err.message : "Failed to restore version");
    } finally {
      setRestoringVersionId(null);
    }
  }, [documentId, token, onRestoreVersion]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `Today at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    } else if (diffDays === 1) {
      return `Yesterday at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: "long", hour: "2-digit", minute: "2-digit" });
    } else {
      return date.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
        hour: "2-digit",
        minute: "2-digit"
      });
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-gray-600" />
          <h2 className="font-semibold text-gray-900">Version History</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 rounded"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Create version button */}
      <div className="p-4 border-b border-gray-100">
        <button
          onClick={() => setShowCreateDialog(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Version
        </button>
      </div>

      {/* Versions list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={fetchVersions}
              className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Try again
            </button>
          </div>
        ) : versions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <Clock className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">No versions yet</p>
            <p className="text-sm text-gray-400 mt-1">
              Create a version to save a snapshot of this document
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {versions.map((version) => (
              <div
                key={version.id}
                className="px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 truncate">
                      {version.name}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-500">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{formatDate(version.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      {version.creator.avatarUrl ? (
                        <img
                          src={version.creator.avatarUrl}
                          alt={version.creator.displayName}
                          className="w-5 h-5 rounded-full"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center text-xs font-medium text-gray-600">
                          {version.creator.displayName?.charAt(0).toUpperCase() || "?"}
                        </div>
                      )}
                      <span className="text-xs text-gray-500">
                        {version.creator.displayName}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handlePreview(version)}
                      disabled={previewingVersionId === version.id}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
                      title="Preview version"
                    >
                      {previewingVersionId === version.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleRestore(version)}
                      disabled={restoringVersionId === version.id}
                      className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
                      title="Restore version"
                    >
                      {restoringVersionId === version.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RotateCcw className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Version Dialog */}
      <Dialog.Root open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl p-6 w-full max-w-md z-50">
            <Dialog.Title className="text-lg font-semibold text-gray-900">
              Create Version
            </Dialog.Title>
            <Dialog.Description className="text-sm text-gray-500 mt-1">
              Save a snapshot of the current document state
            </Dialog.Description>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Version Name
              </label>
              <input
                type="text"
                value={newVersionName}
                onChange={(e) => {
                  setNewVersionName(e.target.value);
                  setCreateError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isCreating) {
                    handleCreateVersion();
                  }
                }}
                placeholder="e.g., v1.0, Draft 1, Before restructure"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
              {createError && (
                <p className="text-sm text-red-600 mt-1">{createError}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Dialog.Close asChild>
                <button
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  disabled={isCreating}
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={handleCreateVersion}
                disabled={isCreating || !newVersionName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
                Create Version
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
