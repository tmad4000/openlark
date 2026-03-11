"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Users,
  BookOpen,
  Lock,
  Globe,
  MoreHorizontal,
  Trash2,
  Settings,
  FolderOpen,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";

interface WikiSpace {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  type: "private" | "public";
  memberCount: number;
  currentUserRole: string | null;
  createdAt: string;
  updatedAt: string;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

export default function WikiPage() {
  const router = useRouter();
  const [spaces, setSpaces] = useState<WikiSpace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [newSpaceDescription, setNewSpaceDescription] = useState("");
  const [newSpaceType, setNewSpaceType] = useState<"private" | "public">(
    "private"
  );
  const [isCreating, setIsCreating] = useState(false);

  // Fetch wiki spaces
  const fetchSpaces = useCallback(async (sessionToken: string) => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/wiki/spaces", {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      if (res.ok) {
        const data = await res.json();
        setSpaces(data.spaces || []);
      }
    } catch (err) {
      console.error("Failed to fetch wiki spaces:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const sessionToken = getCookie("session_token");
    if (!sessionToken) {
      router.push("/login");
      return;
    }

    setToken(sessionToken);
    fetchSpaces(sessionToken);
  }, [fetchSpaces, router]);

  // Create new space
  const handleCreateSpace = useCallback(async () => {
    if (!token || !newSpaceName.trim()) return;

    try {
      setIsCreating(true);
      const res = await fetch("/api/wiki/spaces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newSpaceName.trim(),
          description: newSpaceDescription.trim() || undefined,
          type: newSpaceType,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Navigate to the new space
        router.push(`/app/wiki/${data.id}`);
      } else {
        const error = await res.json();
        alert(error.error || "Failed to create space");
      }
    } catch (err) {
      console.error("Failed to create space:", err);
      alert("Failed to create space");
    } finally {
      setIsCreating(false);
      setShowCreateDialog(false);
      setNewSpaceName("");
      setNewSpaceDescription("");
      setNewSpaceType("private");
    }
  }, [token, newSpaceName, newSpaceDescription, newSpaceType, router]);

  // Delete space
  const handleDeleteSpace = useCallback(
    async (spaceId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (
        !token ||
        !confirm(
          "Are you sure you want to delete this wiki space? All pages within it will be deleted."
        )
      ) {
        return;
      }

      try {
        const res = await fetch(`/api/wiki/spaces/${spaceId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          setSpaces((prev) => prev.filter((s) => s.id !== spaceId));
        } else {
          const error = await res.json();
          alert(error.error || "Failed to delete space");
        }
      } catch (err) {
        console.error("Failed to delete space:", err);
        alert("Failed to delete space");
      }
    },
    [token]
  );

  // Filter spaces by search query
  const filteredSpaces = spaces.filter(
    (space) =>
      space.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      space.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading wiki spaces...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Wiki</h1>

          {/* Create new space button */}
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>New Space</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search wiki spaces..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {filteredSpaces.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <FolderOpen className="w-16 h-16 text-gray-300 mb-4" />
            {searchQuery ? (
              <>
                <p className="text-gray-600 mb-2">No wiki spaces found</p>
                <p className="text-sm text-gray-500">
                  Try a different search term
                </p>
              </>
            ) : (
              <>
                <p className="text-gray-600 mb-2">No wiki spaces yet</p>
                <p className="text-sm text-gray-500 mb-4">
                  Create your first wiki space to organize knowledge
                </p>
                <button
                  onClick={() => setShowCreateDialog(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  <span>New Space</span>
                </button>
              </>
            )}
          </div>
        ) : (
          /* Space cards grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredSpaces.map((space) => (
              <div
                key={space.id}
                onClick={() => router.push(`/app/wiki/${space.id}`)}
                className="bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group p-4"
              >
                {/* Space icon and type indicator */}
                <div className="flex items-start justify-between mb-3">
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    {space.icon ? (
                      <span className="text-2xl">{space.icon}</span>
                    ) : (
                      <BookOpen className="w-6 h-6 text-purple-600" />
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {space.type === "private" ? (
                      <span title="Private">
                        <Lock className="w-4 h-4 text-gray-400" />
                      </span>
                    ) : (
                      <span title="Public">
                        <Globe className="w-4 h-4 text-gray-400" />
                      </span>
                    )}
                    {space.currentUserRole === "admin" && (
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-100 transition-all"
                          >
                            <MoreHorizontal className="w-4 h-4 text-gray-500" />
                          </button>
                        </DropdownMenu.Trigger>

                        <DropdownMenu.Portal>
                          <DropdownMenu.Content
                            className="min-w-[160px] bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
                            sideOffset={4}
                            align="end"
                          >
                            <DropdownMenu.Item
                              className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer focus:outline-none focus:bg-gray-100"
                              onSelect={(e) => {
                                e.preventDefault();
                                router.push(`/app/wiki/${space.id}/settings`);
                              }}
                            >
                              <Settings className="w-4 h-4 mr-2" />
                              Settings
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator className="h-px bg-gray-200 my-1" />
                            <DropdownMenu.Item
                              className="flex items-center px-3 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer focus:outline-none focus:bg-red-50"
                              onSelect={(e) =>
                                handleDeleteSpace(
                                  space.id,
                                  e as unknown as React.MouseEvent
                                )
                              }
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    )}
                  </div>
                </div>

                {/* Space name */}
                <h3 className="font-semibold text-gray-900 truncate mb-1">
                  {space.name}
                </h3>

                {/* Description */}
                {space.description && (
                  <p className="text-sm text-gray-500 line-clamp-2 mb-3">
                    {space.description}
                  </p>
                )}

                {/* Member count */}
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Users className="w-3.5 h-3.5" />
                  <span>
                    {space.memberCount}{" "}
                    {space.memberCount === 1 ? "member" : "members"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Space Dialog */}
      <Dialog.Root open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-full max-w-md z-50">
            <Dialog.Title className="text-lg font-semibold text-gray-900 mb-4">
              Create Wiki Space
            </Dialog.Title>

            <div className="space-y-4">
              {/* Space name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newSpaceName}
                  onChange={(e) => setNewSpaceName(e.target.value)}
                  placeholder="e.g., Engineering Wiki"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newSpaceDescription}
                  onChange={(e) => setNewSpaceDescription(e.target.value)}
                  placeholder="What is this wiki space about?"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Type selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Visibility
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setNewSpaceType("private")}
                    className={`flex-1 flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                      newSpaceType === "private"
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <Lock
                      className={`w-4 h-4 ${newSpaceType === "private" ? "text-blue-600" : "text-gray-400"}`}
                    />
                    <div className="text-left">
                      <p
                        className={`text-sm font-medium ${newSpaceType === "private" ? "text-blue-900" : "text-gray-700"}`}
                      >
                        Private
                      </p>
                      <p className="text-xs text-gray-500">
                        Only invited members
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewSpaceType("public")}
                    className={`flex-1 flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                      newSpaceType === "public"
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <Globe
                      className={`w-4 h-4 ${newSpaceType === "public" ? "text-blue-600" : "text-gray-400"}`}
                    />
                    <div className="text-left">
                      <p
                        className={`text-sm font-medium ${newSpaceType === "public" ? "text-blue-900" : "text-gray-700"}`}
                      >
                        Public
                      </p>
                      <p className="text-xs text-gray-500">
                        Visible to organization
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6">
              <Dialog.Close asChild>
                <button className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={handleCreateSpace}
                disabled={!newSpaceName.trim() || isCreating}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {isCreating ? "Creating..." : "Create Space"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
