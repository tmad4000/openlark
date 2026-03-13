"use client";

import { useState, useEffect, useCallback } from "react";
import { api, type WikiSpace } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BookOpen,
  Plus,
  Users,
  Lock,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WikiSpaceListProps {
  onSelectSpace: (space: WikiSpace) => void;
}

export function WikiSpaceList({ onSelectSpace }: WikiSpaceListProps) {
  const [spaces, setSpaces] = useState<WikiSpace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [newSpaceDescription, setNewSpaceDescription] = useState("");
  const [newSpaceType, setNewSpaceType] = useState<"public" | "private">("public");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    async function loadSpaces() {
      try {
        setIsLoading(true);
        setError(null);
        const result = await api.getWikiSpaces();
        setSpaces(result.spaces);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load spaces");
      } finally {
        setIsLoading(false);
      }
    }
    loadSpaces();
  }, []);

  const handleCreateSpace = useCallback(async () => {
    if (!newSpaceName.trim()) return;
    try {
      setIsCreating(true);
      const result = await api.createWikiSpace({
        name: newSpaceName.trim(),
        description: newSpaceDescription.trim() || undefined,
        type: newSpaceType,
      });
      setSpaces((prev) => [...prev, result.space]);
      setNewSpaceName("");
      setNewSpaceDescription("");
      setShowCreateForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create space");
    } finally {
      setIsCreating(false);
    }
  }, [newSpaceName, newSpaceDescription, newSpaceType]);

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Wiki
          </h1>
          <Button
            size="sm"
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Space
          </Button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Organize knowledge in shared spaces
        </p>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="px-6 py-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
          <div className="flex flex-col gap-3 max-w-md">
            <Input
              value={newSpaceName}
              onChange={(e) => setNewSpaceName(e.target.value)}
              placeholder="Space name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateSpace();
                if (e.key === "Escape") setShowCreateForm(false);
              }}
            />
            <Input
              value={newSpaceDescription}
              onChange={(e) => setNewSpaceDescription(e.target.value)}
              placeholder="Description (optional)"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => setNewSpaceType("public")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors",
                  newSpaceType === "public"
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"
                )}
              >
                <Globe className="h-3.5 w-3.5" />
                Public
              </button>
              <button
                onClick={() => setNewSpaceType("private")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors",
                  newSpaceType === "private"
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"
                )}
              >
                <Lock className="h-3.5 w-3.5" />
                Private
              </button>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreateSpace} disabled={isCreating || !newSpaceName.trim()}>
                {isCreating ? "Creating..." : "Create Space"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-32 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse"
              />
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <p className="text-sm text-red-500 mb-2">{error}</p>
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                Retry
              </Button>
            </div>
          </div>
        ) : spaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64">
            <BookOpen className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400 mb-1">
              No wiki spaces yet
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setShowCreateForm(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create your first space
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {spaces.map((space) => (
              <button
                key={space.id}
                onClick={() => onSelectSpace(space)}
                className="group text-left rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 transition-all hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {/* Icon and type badge */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30">
                      <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                      {space.type}
                    </span>
                  </div>
                  {space.type === "private" ? (
                    <Lock className="h-3.5 w-3.5 text-gray-400" />
                  ) : (
                    <Globe className="h-3.5 w-3.5 text-gray-400" />
                  )}
                </div>

                {/* Title */}
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                  {space.name}
                </h3>

                {/* Description */}
                {space.description && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">
                    {space.description}
                  </p>
                )}

                {/* Meta */}
                <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                  <Users className="h-3.5 w-3.5" />
                  <span>Space</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
