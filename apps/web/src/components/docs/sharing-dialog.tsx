"use client";

import { useState, useEffect, useCallback } from "react";
import {
  api,
  type Document,
  type DocumentPermission,
  type UserSearchResult,
} from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link2, X, Check, Search, UserPlus, Trash2 } from "lucide-react";

type PermissionRole = "viewer" | "editor" | "manager";

interface SharingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: Document;
}

interface PermissionWithUser extends DocumentPermission {
  displayName?: string;
  email?: string;
  avatarUrl?: string | null;
}

export function SharingDialog({
  open,
  onOpenChange,
  document,
}: SharingDialogProps) {
  const [permissions, setPermissions] = useState<PermissionWithUser[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [newRole, setNewRole] = useState<PermissionRole>("editor");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [linkRole, setLinkRole] = useState<PermissionRole>("viewer");

  const loadPermissions = useCallback(async () => {
    try {
      const { permissions: perms } = await api.getDocumentPermissions(
        document.id
      );
      // Enrich with user info
      const { users } = await api.searchUsers();
      const userMap = new Map(users.map((u) => [u.id, u]));
      const enriched: PermissionWithUser[] = perms.map((p) => {
        const user = userMap.get(p.principalId);
        return {
          ...p,
          displayName: user?.displayName,
          email: user?.email,
          avatarUrl: user?.avatarUrl,
        };
      });
      setPermissions(enriched);
    } catch {
      // Permission fetch may fail if user is not a manager
    }
  }, [document.id]);

  useEffect(() => {
    if (open) {
      loadPermissions();
      setSearchQuery("");
      setSearchResults([]);
      setError(null);
      setLinkCopied(false);
    }
  }, [open, loadPermissions]);

  // Search users with debounce
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const { users } = await api.searchUsers(searchQuery.trim());
        // Filter out users who already have permissions
        const existingIds = new Set(permissions.map((p) => p.principalId));
        setSearchResults(users.filter((u) => !existingIds.has(u.id)));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, permissions]);

  const handleAddPermission = async (user: UserSearchResult) => {
    setError(null);
    setLoading(true);
    try {
      await api.addDocumentPermission(document.id, {
        principalId: user.id,
        principalType: "user",
        role: newRole,
      });
      setSearchQuery("");
      setSearchResults([]);
      await loadPermissions();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to add collaborator"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRole = async (
    permissionId: string,
    role: PermissionRole
  ) => {
    try {
      await api.updateDocumentPermission(permissionId, { role });
      setPermissions((prev) =>
        prev.map((p) => (p.id === permissionId ? { ...p, role } : p))
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update permission"
      );
    }
  };

  const handleRemovePermission = async (permissionId: string) => {
    try {
      await api.removeDocumentPermission(permissionId);
      setPermissions((prev) => prev.filter((p) => p.id !== permissionId));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to remove collaborator"
      );
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/app/docs/${document.id}?access=${linkRole}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Share &ldquo;{document.title || "Untitled"}&rdquo;</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search and add users */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search users or departments..."
                  className="pl-9"
                  autoFocus
                />
              </div>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as PermissionRole)}
                className="px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="manager">Manager</option>
              </select>
            </div>

            {/* Search results dropdown */}
            {(searchResults.length > 0 || searching) && (
              <div className="border border-gray-200 dark:border-gray-700 rounded-md max-h-48 overflow-y-auto bg-white dark:bg-gray-900">
                {searching && (
                  <div className="px-3 py-2 text-sm text-gray-500">
                    Searching...
                  </div>
                )}
                {searchResults.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleAddPermission(user)}
                    disabled={loading}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-sm font-medium text-blue-600 dark:text-blue-400 shrink-0">
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={user.displayName}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        user.displayName.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {user.displayName}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {user.email}
                      </div>
                    </div>
                    <UserPlus className="w-4 h-4 text-gray-400 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Copy link section */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <Link2 className="w-4 h-4 text-gray-500 shrink-0" />
            <span className="text-sm text-gray-600 dark:text-gray-400 flex-1">
              Copy link with access
            </span>
            <select
              value={linkRole}
              onChange={(e) => setLinkRole(e.target.value as PermissionRole)}
              className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300"
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="manager">Manager</option>
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className="text-xs"
            >
              {linkCopied ? (
                <>
                  <Check className="w-3 h-3 mr-1" /> Copied
                </>
              ) : (
                "Copy link"
              )}
            </Button>
          </div>

          {/* Current collaborators */}
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Collaborators
            </h4>
            <div className="max-h-56 overflow-y-auto space-y-1">
              {/* Owner row */}
              {permissions
                .filter((p) => p.role === "owner")
                .map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 px-2 py-2 rounded"
                  >
                    <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center text-sm font-medium text-purple-600 dark:text-purple-400 shrink-0">
                      {p.avatarUrl ? (
                        <img
                          src={p.avatarUrl}
                          alt={p.displayName || "Owner"}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        (p.displayName || "O").charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {p.displayName || "Unknown user"}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {p.email || p.principalId}
                      </div>
                    </div>
                    <span className="text-xs text-gray-500 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">
                      Owner
                    </span>
                  </div>
                ))}

              {/* Other collaborators */}
              {permissions
                .filter((p) => p.role !== "owner")
                .map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 px-2 py-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-sm font-medium text-blue-600 dark:text-blue-400 shrink-0">
                      {p.avatarUrl ? (
                        <img
                          src={p.avatarUrl}
                          alt={p.displayName || "User"}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        (p.displayName || "U").charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {p.displayName || "Unknown user"}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {p.email || p.principalId}
                      </div>
                    </div>
                    <select
                      value={p.role}
                      onChange={(e) =>
                        handleUpdateRole(p.id, e.target.value as PermissionRole)
                      }
                      className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      <option value="manager">Manager</option>
                    </select>
                    <button
                      onClick={() => handleRemovePermission(p.id)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      title="Remove collaborator"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}

              {permissions.length === 0 && (
                <div className="py-4 text-center text-sm text-gray-500">
                  No collaborators yet. Search for users above to share.
                </div>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
