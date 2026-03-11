"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  FileText,
  GripVertical,
  BookOpen,
  MoreHorizontal,
  Trash2,
  ArrowLeft,
  Users,
  Settings,
  Lock,
  Globe,
  Loader2,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import dynamic from "next/dynamic";
import type { DocumentEditorHandle } from "@/components/DocumentEditor";

// Dynamically import the editor to avoid SSR issues with Yjs
const DocumentEditor = dynamic(() => import("@/components/DocumentEditor"), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center">
      <div className="text-gray-500">Loading editor...</div>
    </div>
  ),
});

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

interface WikiPage {
  id: string;
  documentId: string;
  title: string;
  position: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  children: WikiPage[];
}

interface WikiPageDetails {
  id: string;
  spaceId: string;
  documentId: string;
  parentPageId: string | null;
  position: number;
  title: string;
  yjsDocId: string;
  createdBy: string;
  creator: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  } | null;
  breadcrumb: Array<{ id: string; title: string }>;
  space: {
    id: string;
    name: string;
    icon: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

interface UserData {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

// PageTreeItem component with drag-and-drop support
function PageTreeItem({
  page,
  level,
  selectedPageId,
  expandedPages,
  onSelect,
  onToggleExpand,
  onCreateChildPage,
  onDeletePage,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  dragOverPageId,
  dragOverPosition,
  userRole,
}: {
  page: WikiPage;
  level: number;
  selectedPageId: string | null;
  expandedPages: Set<string>;
  onSelect: (pageId: string) => void;
  onToggleExpand: (pageId: string) => void;
  onCreateChildPage: (parentPageId: string) => void;
  onDeletePage: (pageId: string) => void;
  onDragStart: (e: React.DragEvent, pageId: string) => void;
  onDragOver: (
    e: React.DragEvent,
    pageId: string,
    position: "before" | "inside" | "after"
  ) => void;
  onDragEnd: () => void;
  onDrop: (e: React.DragEvent) => void;
  dragOverPageId: string | null;
  dragOverPosition: "before" | "inside" | "after" | null;
  userRole: string | null;
}) {
  const isExpanded = expandedPages.has(page.id);
  const isSelected = selectedPageId === page.id;
  const hasChildren = page.children.length > 0;
  const canEdit = userRole === "admin" || userRole === "editor";

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    let position: "before" | "inside" | "after";
    if (y < height * 0.25) {
      position = "before";
    } else if (y > height * 0.75) {
      position = "after";
    } else {
      position = "inside";
    }
    onDragOver(e, page.id, position);
  };

  return (
    <div>
      <div
        draggable={canEdit}
        onDragStart={(e) => canEdit && onDragStart(e, page.id)}
        onDragOver={handleDragOver}
        onDragEnd={onDragEnd}
        onDrop={onDrop}
        className={`relative ${
          dragOverPageId === page.id && dragOverPosition === "before"
            ? "before:absolute before:top-0 before:left-0 before:right-0 before:h-0.5 before:bg-blue-500"
            : ""
        } ${
          dragOverPageId === page.id && dragOverPosition === "after"
            ? "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-blue-500"
            : ""
        }`}
      >
        <div
          onClick={() => onSelect(page.id)}
          className={`flex items-center gap-1 py-1.5 px-2 rounded-md cursor-pointer group transition-colors ${
            isSelected
              ? "bg-blue-100 text-blue-900"
              : "hover:bg-gray-100 text-gray-700"
          } ${
            dragOverPageId === page.id && dragOverPosition === "inside"
              ? "ring-2 ring-blue-500 ring-inset"
              : ""
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          {/* Drag handle */}
          {canEdit && (
            <GripVertical className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 cursor-grab flex-shrink-0" />
          )}

          {/* Expand/collapse button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) {
                onToggleExpand(page.id);
              }
            }}
            className={`w-4 h-4 flex items-center justify-center flex-shrink-0 ${
              hasChildren ? "text-gray-500" : "text-transparent"
            }`}
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Page icon */}
          <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />

          {/* Page title */}
          <span className="flex-1 truncate text-sm">{page.title}</span>

          {/* Actions */}
          {canEdit && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateChildPage(page.id);
                }}
                className="p-1 hover:bg-gray-200 rounded transition-colors"
                title="Add child page"
              >
                <Plus className="w-3.5 h-3.5 text-gray-500" />
              </button>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="p-1 hover:bg-gray-200 rounded transition-colors"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="min-w-[140px] bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
                    sideOffset={4}
                    align="start"
                  >
                    <DropdownMenu.Item
                      className="flex items-center px-3 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer focus:outline-none focus:bg-red-50"
                      onSelect={() => onDeletePage(page.id)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          )}
        </div>
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div>
          {page.children.map((child) => (
            <PageTreeItem
              key={child.id}
              page={child}
              level={level + 1}
              selectedPageId={selectedPageId}
              expandedPages={expandedPages}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
              onCreateChildPage={onCreateChildPage}
              onDeletePage={onDeletePage}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
              onDrop={onDrop}
              dragOverPageId={dragOverPageId}
              dragOverPosition={dragOverPosition}
              userRole={userRole}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function WikiSpacePage() {
  const router = useRouter();
  const params = useParams();
  const spaceId = params.spaceId as string;

  const [space, setSpace] = useState<WikiSpace | null>(null);
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [selectedPage, setSelectedPage] = useState<WikiPageDetails | null>(
    null
  );
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [isLoadingSpace, setIsLoadingSpace] = useState(true);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<
    "syncing" | "synced" | "offline"
  >("syncing");

  // Create page dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState("");
  const [newPageParentId, setNewPageParentId] = useState<string | null>(null);
  const [isCreatingPage, setIsCreatingPage] = useState(false);

  // Drag and drop state
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [dragOverPageId, setDragOverPageId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<
    "before" | "inside" | "after" | null
  >(null);

  const editorRef = useRef<DocumentEditorHandle>(null);

  // Fetch space details and pages
  const fetchSpaceAndPages = useCallback(
    async (sessionToken: string) => {
      try {
        setIsLoadingSpace(true);
        setError(null);

        // Fetch space details
        const spaceRes = await fetch(`/api/wiki/spaces/${spaceId}`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });

        if (!spaceRes.ok) {
          if (spaceRes.status === 404) {
            setError("Wiki space not found");
          } else if (spaceRes.status === 403) {
            setError("You don't have permission to access this wiki space");
          } else {
            setError("Failed to load wiki space");
          }
          setIsLoadingSpace(false);
          return;
        }

        const spaceData = await spaceRes.json();
        setSpace(spaceData);

        // Fetch pages
        const pagesRes = await fetch(`/api/wiki/spaces/${spaceId}/pages`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });

        if (pagesRes.ok) {
          const pagesData = await pagesRes.json();
          setPages(pagesData.pages || []);

          // Auto-select first page if none selected
          if (pagesData.pages?.length > 0 && !selectedPageId) {
            setSelectedPageId(pagesData.pages[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to fetch wiki space:", err);
        setError("Failed to load wiki space");
      } finally {
        setIsLoadingSpace(false);
      }
    },
    [spaceId, selectedPageId]
  );

  // Fetch page details when selection changes
  const fetchPageDetails = useCallback(
    async (pageId: string, sessionToken: string) => {
      try {
        setIsLoadingPage(true);

        const res = await fetch(`/api/wiki/pages/${pageId}`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });

        if (res.ok) {
          const data = await res.json();
          setSelectedPage(data);
        }
      } catch (err) {
        console.error("Failed to fetch page details:", err);
      } finally {
        setIsLoadingPage(false);
      }
    },
    []
  );

  // Initialize
  useEffect(() => {
    const sessionToken = getCookie("session_token");
    if (!sessionToken) {
      router.push("/login");
      return;
    }

    setToken(sessionToken);

    // Fetch user data
    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${sessionToken}` },
    })
      .then((res) => res.json())
      .then((data) => setUser(data.user))
      .catch(console.error);

    fetchSpaceAndPages(sessionToken);
  }, [router, fetchSpaceAndPages]);

  // Fetch page details when selection changes
  useEffect(() => {
    if (selectedPageId && token) {
      fetchPageDetails(selectedPageId, token);
    } else {
      setSelectedPage(null);
    }
  }, [selectedPageId, token, fetchPageDetails]);

  // Handle page selection
  const handleSelectPage = useCallback((pageId: string) => {
    setSelectedPageId(pageId);
  }, []);

  // Handle expand/collapse
  const handleToggleExpand = useCallback((pageId: string) => {
    setExpandedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  }, []);

  // Create page
  const handleCreatePage = useCallback(async () => {
    if (!token || !newPageTitle.trim()) return;

    try {
      setIsCreatingPage(true);
      const res = await fetch(`/api/wiki/spaces/${spaceId}/pages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: newPageTitle.trim(),
          parentPageId: newPageParentId || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Refresh pages
        const pagesRes = await fetch(`/api/wiki/spaces/${spaceId}/pages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (pagesRes.ok) {
          const pagesData = await pagesRes.json();
          setPages(pagesData.pages || []);
        }

        // If we created under a parent, expand that parent
        if (newPageParentId) {
          setExpandedPages((prev) => new Set([...prev, newPageParentId]));
        }

        // Select the new page
        setSelectedPageId(data.id);

        // Close dialog
        setShowCreateDialog(false);
        setNewPageTitle("");
        setNewPageParentId(null);
      } else {
        const error = await res.json();
        alert(error.error || "Failed to create page");
      }
    } catch (err) {
      console.error("Failed to create page:", err);
      alert("Failed to create page");
    } finally {
      setIsCreatingPage(false);
    }
  }, [token, newPageTitle, newPageParentId, spaceId]);

  // Delete page
  const handleDeletePage = useCallback(
    async (pageId: string) => {
      if (
        !token ||
        !confirm(
          "Are you sure you want to delete this page? Child pages will be moved to the parent."
        )
      ) {
        return;
      }

      try {
        const res = await fetch(`/api/wiki/pages/${pageId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          // Refresh pages
          const pagesRes = await fetch(`/api/wiki/spaces/${spaceId}/pages`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (pagesRes.ok) {
            const pagesData = await pagesRes.json();
            setPages(pagesData.pages || []);
          }

          // If deleted page was selected, deselect
          if (selectedPageId === pageId) {
            setSelectedPageId(null);
            setSelectedPage(null);
          }
        } else {
          const error = await res.json();
          alert(error.error || "Failed to delete page");
        }
      } catch (err) {
        console.error("Failed to delete page:", err);
        alert("Failed to delete page");
      }
    },
    [token, spaceId, selectedPageId]
  );

  // Open create page dialog with parent
  const handleCreateChildPage = useCallback((parentPageId: string) => {
    setNewPageParentId(parentPageId);
    setShowCreateDialog(true);
  }, []);

  // Drag and drop handlers
  const handleDragStart = useCallback(
    (e: React.DragEvent, pageId: string) => {
      setDraggedPageId(pageId);
      e.dataTransfer.effectAllowed = "move";
    },
    []
  );

  const handleDragOver = useCallback(
    (
      e: React.DragEvent,
      pageId: string,
      position: "before" | "inside" | "after"
    ) => {
      e.preventDefault();
      if (pageId === draggedPageId) return;
      setDragOverPageId(pageId);
      setDragOverPosition(position);
    },
    [draggedPageId]
  );

  const handleDragEnd = useCallback(() => {
    setDraggedPageId(null);
    setDragOverPageId(null);
    setDragOverPosition(null);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      if (!draggedPageId || !dragOverPageId || !dragOverPosition || !token) {
        handleDragEnd();
        return;
      }

      try {
        // Find the target page to get its parent and position
        const findPage = (
          pages: WikiPage[],
          id: string
        ): { page: WikiPage; parent: WikiPage | null; siblings: WikiPage[] } | null => {
          for (const page of pages) {
            if (page.id === id) {
              return { page, parent: null, siblings: pages };
            }
            const found = findPage(page.children, id);
            if (found) {
              if (found.parent === null) {
                found.parent = page;
                found.siblings = page.children;
              }
              return found;
            }
          }
          return null;
        };

        const targetInfo = findPage(pages, dragOverPageId);
        if (!targetInfo) {
          handleDragEnd();
          return;
        }

        let newParentId: string | null = null;
        let newPosition: number;

        if (dragOverPosition === "inside") {
          // Moving inside the target - becomes a child
          newParentId = dragOverPageId;
          // Find max position of target's children
          const targetChildren = targetInfo.page.children;
          newPosition =
            targetChildren.length > 0
              ? Math.max(...targetChildren.map((c) => c.position)) + 1
              : 0;
        } else {
          // Moving before or after the target - same parent
          newParentId = targetInfo.parent?.id || null;
          const targetIndex = targetInfo.siblings.findIndex(
            (p) => p.id === dragOverPageId
          );
          if (dragOverPosition === "before") {
            newPosition = targetInfo.page.position;
          } else {
            newPosition = targetInfo.page.position + 1;
          }
        }

        // Call API to move page
        const res = await fetch(`/api/wiki/pages/${draggedPageId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            parentPageId: newParentId,
            position: newPosition,
          }),
        });

        if (res.ok) {
          // Refresh pages
          const pagesRes = await fetch(`/api/wiki/spaces/${spaceId}/pages`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (pagesRes.ok) {
            const pagesData = await pagesRes.json();
            setPages(pagesData.pages || []);
          }

          // Expand parent if we moved inside
          if (newParentId && dragOverPosition === "inside") {
            setExpandedPages((prev) => new Set([...prev, newParentId as string]));
          }
        }
      } catch (err) {
        console.error("Failed to move page:", err);
      }

      handleDragEnd();
    },
    [draggedPageId, dragOverPageId, dragOverPosition, token, pages, spaceId, handleDragEnd]
  );

  // Handle sync status change
  const handleSyncStatusChange = useCallback(
    (status: "syncing" | "synced" | "offline") => {
      setSyncStatus(status);
    },
    []
  );

  // Loading state
  if (isLoadingSpace) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading wiki space...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-white">
        <div className="text-gray-500 mb-4">{error}</div>
        <button
          onClick={() => router.push("/app/wiki")}
          className="text-blue-600 hover:text-blue-700 font-medium"
        >
          Back to Wiki
        </button>
      </div>
    );
  }

  if (!space || !token) {
    return null;
  }

  const canEdit =
    space.currentUserRole === "admin" || space.currentUserRole === "editor";

  return (
    <div className="h-full flex bg-white">
      {/* Sidebar with page tree */}
      <aside className="w-64 border-r border-gray-200 flex flex-col flex-shrink-0">
        {/* Space header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => router.push("/app/wiki")}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
              title="Back to Wiki"
            >
              <ArrowLeft className="w-4 h-4 text-gray-600" />
            </button>
            <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
              {space.icon ? (
                <span className="text-lg">{space.icon}</span>
              ) : (
                <BookOpen className="w-4 h-4 text-purple-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-gray-900 truncate text-sm">
                {space.name}
              </h2>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                {space.type === "private" ? (
                  <Lock className="w-3 h-3" />
                ) : (
                  <Globe className="w-3 h-3" />
                )}
                <Users className="w-3 h-3 ml-1" />
                <span>{space.memberCount}</span>
              </div>
            </div>
            {space.currentUserRole === "admin" && (
              <button
                onClick={() => router.push(`/app/wiki/${spaceId}/settings`)}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
                title="Space Settings"
              >
                <Settings className="w-4 h-4 text-gray-500" />
              </button>
            )}
          </div>
        </div>

        {/* Create page button */}
        {canEdit && (
          <div className="px-3 py-2">
            <button
              onClick={() => {
                setNewPageParentId(null);
                setShowCreateDialog(true);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>New Page</span>
            </button>
          </div>
        )}

        {/* Page tree */}
        <div className="flex-1 overflow-y-auto px-2 py-1">
          {pages.length === 0 ? (
            <div className="text-center py-8 px-4">
              <FileText className="w-10 h-10 mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-500 mb-3">No pages yet</p>
              {canEdit && (
                <button
                  onClick={() => {
                    setNewPageParentId(null);
                    setShowCreateDialog(true);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Create first page
                </button>
              )}
            </div>
          ) : (
            pages.map((page) => (
              <PageTreeItem
                key={page.id}
                page={page}
                level={0}
                selectedPageId={selectedPageId}
                expandedPages={expandedPages}
                onSelect={handleSelectPage}
                onToggleExpand={handleToggleExpand}
                onCreateChildPage={handleCreateChildPage}
                onDeletePage={handleDeletePage}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDrop={handleDrop}
                dragOverPageId={dragOverPageId}
                dragOverPosition={dragOverPosition}
                userRole={space.currentUserRole}
              />
            ))
          )}
        </div>
      </aside>

      {/* Main content - Document editor */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {selectedPage ? (
          <>
            {/* Breadcrumb */}
            <div className="px-6 py-3 border-b border-gray-200 bg-gray-50">
              <nav className="flex items-center text-sm text-gray-500 overflow-x-auto">
                <button
                  onClick={() => router.push("/app/wiki")}
                  className="hover:text-gray-700 flex-shrink-0"
                >
                  Wiki
                </button>
                <ChevronRight className="w-4 h-4 mx-1 flex-shrink-0" />
                <button
                  onClick={() => router.push(`/app/wiki/${spaceId}`)}
                  className="hover:text-gray-700 truncate max-w-[150px]"
                >
                  {selectedPage.space.name}
                </button>
                {selectedPage.breadcrumb.map((crumb) => (
                  <span key={crumb.id} className="flex items-center">
                    <ChevronRight className="w-4 h-4 mx-1 flex-shrink-0" />
                    <button
                      onClick={() => setSelectedPageId(crumb.id)}
                      className="hover:text-gray-700 truncate max-w-[150px]"
                    >
                      {crumb.title}
                    </button>
                  </span>
                ))}
                <ChevronRight className="w-4 h-4 mx-1 flex-shrink-0" />
                <span className="text-gray-900 font-medium truncate">
                  {selectedPage.title}
                </span>
              </nav>
            </div>

            {/* Editor */}
            {isLoadingPage ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : user ? (
              <div className="flex-1 overflow-hidden">
                <DocumentEditor
                  ref={editorRef}
                  documentId={selectedPage.documentId}
                  yjsDocId={selectedPage.yjsDocId}
                  token={token}
                  userName={user.displayName || user.email}
                  onSyncStatusChange={handleSyncStatusChange}
                />
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            <BookOpen className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-lg mb-2">Select a page to view</p>
            <p className="text-sm">
              Or{" "}
              {canEdit ? (
                <button
                  onClick={() => {
                    setNewPageParentId(null);
                    setShowCreateDialog(true);
                  }}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  create a new page
                </button>
              ) : (
                "ask an admin to create pages"
              )}
            </p>
          </div>
        )}
      </main>

      {/* Create Page Dialog */}
      <Dialog.Root open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-full max-w-md z-50">
            <Dialog.Title className="text-lg font-semibold text-gray-900 mb-4">
              Create Page
            </Dialog.Title>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newPageTitle}
                  onChange={(e) => setNewPageTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newPageTitle.trim()) {
                      handleCreatePage();
                    }
                  }}
                  placeholder="e.g., Getting Started"
                  autoFocus
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {newPageParentId && (
                <p className="text-sm text-gray-500">
                  This page will be created as a child of the selected page.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Dialog.Close asChild>
                <button className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={handleCreatePage}
                disabled={!newPageTitle.trim() || isCreatingPage}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {isCreatingPage ? "Creating..." : "Create Page"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
