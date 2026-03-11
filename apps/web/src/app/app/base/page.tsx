"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Database, Search, MoreVertical } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";

interface BaseData {
  id: string;
  name: string;
  icon: string | null;
  owner: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
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

export default function BasesPage() {
  const router = useRouter();
  const [bases, setBases] = useState<BaseData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newBaseName, setNewBaseName] = useState("");
  const [newBaseIcon, setNewBaseIcon] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchBases();
  }, []);

  const fetchBases = async () => {
    const token = getCookie("session_token");
    if (!token) return;

    try {
      const res = await fetch("/api/bases", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBases(data.bases || []);
      }
    } catch (error) {
      console.error("Failed to fetch bases:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const createBase = async () => {
    if (!newBaseName.trim()) return;

    const token = getCookie("session_token");
    if (!token) return;

    setIsCreating(true);
    try {
      const res = await fetch("/api/bases", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newBaseName.trim(),
          icon: newBaseIcon.trim() || undefined,
        }),
      });

      if (res.ok) {
        const newBase = await res.json();
        // Navigate to the new base
        router.push(`/app/base/${newBase.id}`);
      }
    } catch (error) {
      console.error("Failed to create base:", error);
    } finally {
      setIsCreating(false);
      setIsCreateDialogOpen(false);
      setNewBaseName("");
      setNewBaseIcon("");
    }
  };

  const filteredBases = bases.filter((base) =>
    base.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-500">Loading bases...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-gray-900">Bases</h1>
          <button
            onClick={() => setIsCreateDialogOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Base
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search bases..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Base Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredBases.length === 0 ? (
          <div className="text-center py-12">
            <Database className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 mb-4">
              {searchQuery ? "No bases match your search" : "No bases yet"}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setIsCreateDialogOpen(true)}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Create your first base
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredBases.map((base) => (
              <div
                key={base.id}
                onClick={() => router.push(`/app/base/${base.id}`)}
                className="group bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    {base.icon ? (
                      <span className="text-xl">{base.icon}</span>
                    ) : (
                      <Database className="w-5 h-5 text-blue-600" />
                    )}
                  </div>
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[120px] z-50"
                        sideOffset={4}
                      >
                        <DropdownMenu.Item
                          className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer focus:outline-none"
                          onSelect={() => router.push(`/app/base/${base.id}`)}
                        >
                          Open
                        </DropdownMenu.Item>
                        <DropdownMenu.Item className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer focus:outline-none">
                          Rename
                        </DropdownMenu.Item>
                        <DropdownMenu.Item className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer focus:outline-none">
                          Delete
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </div>

                <h3 className="font-medium text-gray-900 mb-1 truncate">
                  {base.name}
                </h3>
                <p className="text-sm text-gray-500">
                  Updated {formatDate(base.updatedAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Base Dialog */}
      <Dialog.Root open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-[400px] max-w-[90vw]">
            <Dialog.Title className="text-lg font-semibold text-gray-900 mb-4">
              Create New Base
            </Dialog.Title>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={newBaseName}
                  onChange={(e) => setNewBaseName(e.target.value)}
                  placeholder="My Base"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Icon (emoji)
                </label>
                <input
                  type="text"
                  value={newBaseIcon}
                  onChange={(e) => setNewBaseIcon(e.target.value)}
                  placeholder="📊"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsCreateDialogOpen(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createBase}
                disabled={!newBaseName.trim() || isCreating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isCreating ? "Creating..." : "Create"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
