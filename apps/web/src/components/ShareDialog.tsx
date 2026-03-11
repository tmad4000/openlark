"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  Search,
  Link2,
  Check,
  ChevronDown,
  Users,
  User,
  Building2,
  Loader2,
  Trash2,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

type PermissionRole = "viewer" | "editor" | "manager";
type PrincipalType = "user" | "department" | "org";

interface Principal {
  id: string;
  name: string;
  email?: string;
  avatarUrl: string | null;
  memberCount?: number;
}

interface Collaborator {
  id: string;
  principalId: string;
  principalType: PrincipalType;
  role: PermissionRole | "owner";
  createdAt: string;
  principal: Principal;
}

interface SearchResult {
  id: string;
  type: "user" | "department";
  name: string;
  email?: string;
  avatarUrl: string | null;
  memberCount?: number;
}

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  token: string;
  currentUserRole: "viewer" | "editor" | "manager" | "owner";
}

const ROLE_LABELS: Record<PermissionRole | "owner", string> = {
  viewer: "Viewer",
  editor: "Editor",
  manager: "Manager",
  owner: "Owner",
};

const ROLE_DESCRIPTIONS: Record<PermissionRole, string> = {
  viewer: "Can view the document",
  editor: "Can view and edit",
  manager: "Can view, edit, and manage sharing",
};

export default function ShareDialog({
  isOpen,
  onClose,
  documentId,
  token,
  currentUserRole,
}: ShareDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [owner, setOwner] = useState<Principal | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<PermissionRole>("viewer");
  const [copyLinkRole, setCopyLinkRole] = useState<"viewer" | "editor">("viewer");
  const [linkCopied, setLinkCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingPrincipal, setAddingPrincipal] = useState<string | null>(null);
  const [removingPermission, setRemovingPermission] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch collaborators
  const fetchCollaborators = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents/${documentId}/collaborators`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error("Failed to fetch collaborators");
      }

      const data = await res.json();
      setCollaborators(data.collaborators);
      setOwner(data.owner);
      setCanManage(data.canManage);
    } catch (err) {
      console.error("Failed to fetch collaborators:", err);
      setError("Failed to load collaborators");
    } finally {
      setIsLoading(false);
    }
  }, [documentId, token]);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setError(null);
      setSearchQuery("");
      setSearchResults([]);
      setLinkCopied(false);
      fetchCollaborators();
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen, fetchCollaborators]);

  // Search for principals
  const searchPrincipals = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const res = await fetch(
          `/api/documents/${documentId}/search-principals?q=${encodeURIComponent(query)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (!res.ok) {
          throw new Error("Search failed");
        }

        const data = await res.json();
        setSearchResults(data.results);
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setIsSearching(false);
      }
    },
    [documentId, token]
  );

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchQuery.trim()) {
      searchTimeoutRef.current = setTimeout(() => {
        searchPrincipals(searchQuery);
      }, 300);
    } else {
      setSearchResults([]);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, searchPrincipals]);

  // Add collaborator
  const handleAddCollaborator = async (result: SearchResult) => {
    setAddingPrincipal(result.id);
    try {
      const res = await fetch(`/api/documents/${documentId}/permissions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          principalId: result.id,
          principalType: result.type,
          role: selectedRole,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add collaborator");
      }

      // Refresh collaborators
      await fetchCollaborators();
      setSearchQuery("");
      setSearchResults([]);
    } catch (err) {
      console.error("Failed to add collaborator:", err);
      setError(err instanceof Error ? err.message : "Failed to add collaborator");
    } finally {
      setAddingPrincipal(null);
    }
  };

  // Update collaborator role
  const handleUpdateRole = async (permissionId: string, newRole: PermissionRole) => {
    try {
      const res = await fetch(
        `/api/documents/${documentId}/permissions/${permissionId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ role: newRole }),
        }
      );

      if (!res.ok) {
        throw new Error("Failed to update permission");
      }

      // Update local state
      setCollaborators((prev) =>
        prev.map((c) => (c.id === permissionId ? { ...c, role: newRole } : c))
      );
    } catch (err) {
      console.error("Failed to update role:", err);
      setError("Failed to update permission");
    }
  };

  // Remove collaborator
  const handleRemoveCollaborator = async (permissionId: string) => {
    setRemovingPermission(permissionId);
    try {
      const res = await fetch(
        `/api/documents/${documentId}/permissions/${permissionId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        throw new Error("Failed to remove collaborator");
      }

      // Update local state
      setCollaborators((prev) => prev.filter((c) => c.id !== permissionId));
    } catch (err) {
      console.error("Failed to remove collaborator:", err);
      setError("Failed to remove collaborator");
    } finally {
      setRemovingPermission(null);
    }
  };

  // Copy link
  const handleCopyLink = async () => {
    try {
      const res = await fetch(`/api/documents/${documentId}/copy-link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: copyLinkRole }),
      });

      if (!res.ok) {
        throw new Error("Failed to generate link");
      }

      const data = await res.json();
      const fullUrl = `${window.location.origin}${data.link}`;
      await navigator.clipboard.writeText(fullUrl);
      setLinkCopied(true);

      // Refresh collaborators to show org permission
      await fetchCollaborators();

      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy link:", err);
      setError("Failed to copy link");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Share Document</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
              <button
                onClick={() => setError(null)}
                className="text-xs text-red-600 underline mt-1"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Search section */}
          {canManage && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Add people or departments
              </label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name or email..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  {isSearching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
                  )}
                </div>

                {/* Role selector for new collaborators */}
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                      {ROLE_LABELS[selectedRole]}
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      className="min-w-[180px] bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
                      sideOffset={4}
                      align="end"
                    >
                      {(["viewer", "editor", "manager"] as PermissionRole[]).map(
                        (role) => (
                          <DropdownMenu.Item
                            key={role}
                            className="px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer focus:outline-none focus:bg-gray-100"
                            onSelect={() => setSelectedRole(role)}
                          >
                            <div className="font-medium text-gray-900">
                              {ROLE_LABELS[role]}
                            </div>
                            <div className="text-xs text-gray-500">
                              {ROLE_DESCRIPTIONS[role]}
                            </div>
                          </DropdownMenu.Item>
                        )
                      )}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </div>

              {/* Search results */}
              {searchResults.length > 0 && (
                <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                  {searchResults.map((result) => (
                    <button
                      key={result.id}
                      onClick={() => handleAddCollaborator(result)}
                      disabled={addingPrincipal === result.id}
                      className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                        {result.type === "user" ? (
                          result.avatarUrl ? (
                            <img
                              src={result.avatarUrl}
                              alt=""
                              className="w-8 h-8 rounded-full"
                            />
                          ) : (
                            <User className="w-4 h-4 text-gray-500" />
                          )
                        ) : (
                          <Users className="w-4 h-4 text-gray-500" />
                        )}
                      </div>
                      <div className="flex-1 text-left">
                        <div className="text-sm font-medium text-gray-900">
                          {result.name}
                        </div>
                        {result.email && (
                          <div className="text-xs text-gray-500">{result.email}</div>
                        )}
                        {result.type === "department" && result.memberCount !== undefined && (
                          <div className="text-xs text-gray-500">
                            {result.memberCount} member{result.memberCount !== 1 ? "s" : ""}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 capitalize">
                        {result.type}
                      </div>
                      {addingPrincipal === result.id && (
                        <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Current collaborators */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">
              People with access
            </h4>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                {/* Owner */}
                {owner && (
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      {owner.avatarUrl ? (
                        <img
                          src={owner.avatarUrl}
                          alt=""
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <span className="text-sm font-medium text-blue-600">
                          {owner.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        {owner.name}
                      </div>
                      {owner.email && (
                        <div className="text-xs text-gray-500">{owner.email}</div>
                      )}
                    </div>
                    <span className="text-xs font-medium text-gray-500 bg-gray-200 px-2 py-1 rounded">
                      Owner
                    </span>
                  </div>
                )}

                {/* Collaborators */}
                {collaborators
                  .filter((c) => c.role !== "owner")
                  .map((collaborator) => (
                    <div
                      key={collaborator.id}
                      className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg"
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                        {collaborator.principalType === "user" ? (
                          collaborator.principal.avatarUrl ? (
                            <img
                              src={collaborator.principal.avatarUrl}
                              alt=""
                              className="w-8 h-8 rounded-full"
                            />
                          ) : (
                            <User className="w-4 h-4 text-gray-500" />
                          )
                        ) : collaborator.principalType === "department" ? (
                          <Users className="w-4 h-4 text-gray-500" />
                        ) : (
                          <Building2 className="w-4 h-4 text-gray-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {collaborator.principal.name}
                          {collaborator.principalType === "org" && " (Everyone)"}
                        </div>
                        {collaborator.principal.email && (
                          <div className="text-xs text-gray-500 truncate">
                            {collaborator.principal.email}
                          </div>
                        )}
                        {collaborator.principalType === "department" &&
                          collaborator.principal.memberCount !== undefined && (
                            <div className="text-xs text-gray-500">
                              {collaborator.principal.memberCount} member
                              {collaborator.principal.memberCount !== 1 ? "s" : ""}
                            </div>
                          )}
                      </div>

                      {canManage ? (
                        <div className="flex items-center gap-2">
                          <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                              <button className="flex items-center gap-1 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 rounded">
                                {ROLE_LABELS[collaborator.role as PermissionRole]}
                                <ChevronDown className="w-3 h-3" />
                              </button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                              <DropdownMenu.Content
                                className="min-w-[160px] bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
                                sideOffset={4}
                                align="end"
                              >
                                {(["viewer", "editor", "manager"] as PermissionRole[]).map(
                                  (role) => (
                                    <DropdownMenu.Item
                                      key={role}
                                      className="flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer focus:outline-none focus:bg-gray-100"
                                      onSelect={() =>
                                        handleUpdateRole(collaborator.id, role)
                                      }
                                    >
                                      <span>{ROLE_LABELS[role]}</span>
                                      {collaborator.role === role && (
                                        <Check className="w-4 h-4 text-blue-600" />
                                      )}
                                    </DropdownMenu.Item>
                                  )
                                )}
                              </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                          </DropdownMenu.Root>

                          <button
                            onClick={() => handleRemoveCollaborator(collaborator.id)}
                            disabled={removingPermission === collaborator.id}
                            className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-50"
                            title="Remove"
                          >
                            {removingPermission === collaborator.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500">
                          {ROLE_LABELS[collaborator.role as PermissionRole]}
                        </span>
                      )}
                    </div>
                  ))}

                {collaborators.filter((c) => c.role !== "owner").length === 0 && !owner && (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No collaborators yet
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Copy link section */}
        {canManage && (
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-700 flex-1">
                Copy link with access
              </span>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button className="flex items-center gap-1 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200 rounded">
                    {copyLinkRole === "viewer" ? "Can view" : "Can edit"}
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="min-w-[120px] bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
                    sideOffset={4}
                    align="end"
                  >
                    <DropdownMenu.Item
                      className="flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer focus:outline-none focus:bg-gray-100"
                      onSelect={() => setCopyLinkRole("viewer")}
                    >
                      <span>Can view</span>
                      {copyLinkRole === "viewer" && (
                        <Check className="w-4 h-4 text-blue-600" />
                      )}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer focus:outline-none focus:bg-gray-100"
                      onSelect={() => setCopyLinkRole("editor")}
                    >
                      <span>Can edit</span>
                      {copyLinkRole === "editor" && (
                        <Check className="w-4 h-4 text-blue-600" />
                      )}
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              <button
                onClick={handleCopyLink}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  linkCopied
                    ? "bg-green-600 text-white"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                {linkCopied ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Link2 className="w-4 h-4" />
                    Copy link
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Anyone in your organization with this link will get the selected access level.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
