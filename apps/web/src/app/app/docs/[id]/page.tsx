"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  Cloud,
  CloudOff,
  Loader2,
  MoreHorizontal,
  Share2,
  Star,
  Trash2,
  MessageSquare,
  History,
  X,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import dynamic from "next/dynamic";
import type { Collaborator, DocumentEditorHandle } from "@/components/DocumentEditor";
import CommentsPanel from "@/components/CommentsPanel";
import AddCommentDialog from "@/components/AddCommentDialog";
import ShareDialog from "@/components/ShareDialog";
import VersionHistoryPanel from "@/components/VersionHistoryPanel";
import VersionPreviewEditor from "@/components/VersionPreviewEditor";

// Dynamically import the editor to avoid SSR issues with Yjs
const DocumentEditor = dynamic(
  () => import("@/components/DocumentEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-500">Loading editor...</div>
      </div>
    ),
  }
);

const SheetEditor = dynamic(
  () => import("@/components/SheetEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-500">Loading spreadsheet...</div>
      </div>
    ),
  }
);

const SlideEditor = dynamic(
  () => import("@/components/SlideEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-500">Loading presentation...</div>
      </div>
    ),
  }
);

const MindNoteEditor = dynamic(
  () => import("@/components/MindNoteEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-500">Loading mind map...</div>
      </div>
    ),
  }
);

const BoardEditor = dynamic(
  () => import("@/components/BoardEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-500">Loading whiteboard...</div>
      </div>
    ),
  }
);

interface DocumentData {
  id: string;
  title: string;
  type: "doc" | "sheet" | "slide" | "mindnote" | "board";
  yjsDocId: string;
  ownerId: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  permissions: Array<{
    id: string;
    principalId: string;
    principalType: "user" | "department" | "org";
    role: "viewer" | "editor" | "manager" | "owner";
  }>;
  currentUserRole: "viewer" | "editor" | "manager" | "owner";
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

type SyncStatus = "syncing" | "synced" | "offline";

export default function DocumentEditorPage() {
  const router = useRouter();
  const params = useParams();
  const documentId = params.id as string;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [document, setDocument] = useState<DocumentData | null>(null);
  const [user, setUser] = useState<UserData | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("syncing");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);

  // Comments state
  const [showCommentsPanel, setShowCommentsPanel] = useState(false);
  const [showAddCommentDialog, setShowAddCommentDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [pendingComment, setPendingComment] = useState<{
    selectedText: string;
    from: number;
    to: number;
  } | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [commentsPanelKey, setCommentsPanelKey] = useState(0);

  // Version history state
  const [showVersionPanel, setShowVersionPanel] = useState(false);
  const [versionPreview, setVersionPreview] = useState<{
    versionId: string;
    snapshot: string;
    name: string;
  } | null>(null);
  const [isRestoringVersion, setIsRestoringVersion] = useState(false);

  const editorRef = useRef<DocumentEditorHandle>(null);

  // Fetch user and document data
  useEffect(() => {
    const sessionToken = getCookie("session_token");
    if (!sessionToken) {
      router.push("/login");
      return;
    }

    setToken(sessionToken);

    const fetchData = async () => {
      try {
        // Fetch user data
        const userRes = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });

        if (!userRes.ok) {
          router.push("/login");
          return;
        }

        const userData = await userRes.json();
        setUser(userData.user);

        // Fetch document data
        const docRes = await fetch(`/api/documents/${documentId}`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });

        if (!docRes.ok) {
          if (docRes.status === 404) {
            setError("Document not found");
          } else if (docRes.status === 403) {
            setError("You don't have permission to access this document");
          } else {
            setError("Failed to load document");
          }
          setIsLoading(false);
          return;
        }

        const docData = await docRes.json();
        setDocument(docData);
        setEditedTitle(docData.title);
        setIsLoading(false);
      } catch (err) {
        console.error("Failed to fetch data:", err);
        setError("Failed to load document");
        setIsLoading(false);
      }
    };

    fetchData();
  }, [documentId, router]);

  // Handle title update
  const handleTitleSave = useCallback(async () => {
    if (!document || !token || editedTitle.trim() === document.title) {
      setIsEditingTitle(false);
      return;
    }

    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: editedTitle.trim() }),
      });

      if (res.ok) {
        setDocument((prev) =>
          prev ? { ...prev, title: editedTitle.trim() } : prev
        );
      }
    } catch (err) {
      console.error("Failed to update title:", err);
      setEditedTitle(document.title);
    }

    setIsEditingTitle(false);
  }, [document, documentId, editedTitle, token]);

  // Handle document deletion
  const handleDelete = useCallback(async () => {
    if (!token || !confirm("Are you sure you want to delete this document?")) {
      return;
    }

    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        router.push("/app/docs");
      } else {
        alert("Failed to delete document");
      }
    } catch (err) {
      console.error("Failed to delete document:", err);
      alert("Failed to delete document");
    }
  }, [documentId, router, token]);

  // Handle sync status change
  const handleSyncStatusChange = useCallback((status: SyncStatus) => {
    setSyncStatus(status);
  }, []);

  // Handle collaborators change
  const handleCollaboratorsChange = useCallback((newCollaborators: Collaborator[]) => {
    setCollaborators(newCollaborators);
  }, []);

  // Handle add comment request from editor
  const handleAddComment = useCallback(
    (selectedText: string, from: number, to: number) => {
      if (!selectedText.trim()) return;
      setPendingComment({ selectedText, from, to });
      setShowAddCommentDialog(true);
    },
    []
  );

  // Handle comment click from editor
  const handleCommentClick = useCallback((commentId: string) => {
    setSelectedCommentId(commentId);
    setShowCommentsPanel(true);
  }, []);

  // Handle comment submit
  const handleCommentSubmit = useCallback(
    async (content: string) => {
      if (!token || !pendingComment) return;

      try {
        // Generate a temporary ID that will be replaced by the server response
        const res = await fetch(`/api/documents/${documentId}/comments`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content,
            blockId: `${pendingComment.from}-${pendingComment.to}`,
          }),
        });

        if (!res.ok) {
          throw new Error("Failed to create comment");
        }

        const data = await res.json();
        const commentId = data.comment.id;

        // Set the comment mark in the editor
        editorRef.current?.setCommentMark(
          commentId,
          pendingComment.from,
          pendingComment.to
        );

        // Open comments panel and select the new comment
        setShowCommentsPanel(true);
        setSelectedCommentId(commentId);

        // Refresh comments panel
        setCommentsPanelKey((prev) => prev + 1);
      } catch (err) {
        console.error("Failed to create comment:", err);
        throw err;
      } finally {
        setPendingComment(null);
      }
    },
    [documentId, pendingComment, token]
  );

  // Handle comment resolved/reopened
  const handleCommentResolved = useCallback(
    (commentId: string, resolved: boolean) => {
      if (resolved) {
        editorRef.current?.resolveComment(commentId);
      } else {
        editorRef.current?.unresolveComment(commentId);
      }
    },
    []
  );

  // Handle comment deleted
  const handleCommentDeleted = useCallback((commentId: string) => {
    editorRef.current?.removeCommentMark(commentId);
    if (selectedCommentId === commentId) {
      setSelectedCommentId(null);
    }
  }, [selectedCommentId]);

  // Handle version preview
  const handlePreviewVersion = useCallback(
    (versionId: string, snapshot: string, name: string) => {
      setVersionPreview({ versionId, snapshot, name });
    },
    []
  );

  // Handle version restore from panel
  const handleRestoreVersion = useCallback(() => {
    // Force reload the page to get fresh content after restore
    window.location.reload();
  }, []);

  // Handle restore from preview
  const handleRestoreFromPreview = useCallback(async () => {
    if (!versionPreview || !token) return;

    try {
      setIsRestoringVersion(true);

      const res = await fetch(
        `/api/documents/${documentId}/versions/${versionPreview.versionId}/restore`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to restore version");
      }

      // Force reload to get fresh content
      window.location.reload();
    } catch (err) {
      console.error("Failed to restore version:", err);
      alert(err instanceof Error ? err.message : "Failed to restore version");
      setIsRestoringVersion(false);
    }
  }, [documentId, token, versionPreview]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading document...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-white">
        <div className="text-gray-500 mb-4">{error}</div>
        <button
          onClick={() => router.push("/app/docs")}
          className="text-blue-600 hover:text-blue-700 font-medium"
        >
          Back to Documents
        </button>
      </div>
    );
  }

  if (!document || !user || !token) {
    return null;
  }

  const canEdit =
    document.currentUserRole === "editor" ||
    document.currentUserRole === "manager" ||
    document.currentUserRole === "owner";

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          {/* Back button */}
          <button
            onClick={() => router.push("/app/docs")}
            className="p-1.5 rounded hover:bg-gray-100 transition-colors"
            title="Back to documents"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>

          {/* Document title */}
          {isEditingTitle && canEdit ? (
            <input
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleTitleSave();
                } else if (e.key === "Escape") {
                  setEditedTitle(document.title);
                  setIsEditingTitle(false);
                }
              }}
              autoFocus
              className="text-lg font-semibold text-gray-900 bg-transparent border-b-2 border-blue-500 focus:outline-none px-1"
            />
          ) : (
            <button
              onClick={() => canEdit && setIsEditingTitle(true)}
              className={`text-lg font-semibold text-gray-900 hover:bg-gray-100 px-2 py-1 rounded transition-colors ${
                canEdit ? "cursor-text" : "cursor-default"
              }`}
              disabled={!canEdit}
            >
              {document.title}
            </button>
          )}

          {/* Sync status indicator */}
          <div className="flex items-center gap-1.5">
            {syncStatus === "syncing" && (
              <>
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                <span className="text-xs text-gray-500">Saving...</span>
              </>
            )}
            {syncStatus === "synced" && (
              <>
                <Cloud className="w-4 h-4 text-green-500" />
                <span className="text-xs text-gray-500">Saved</span>
              </>
            )}
            {syncStatus === "offline" && (
              <>
                <CloudOff className="w-4 h-4 text-red-500" />
                <span className="text-xs text-gray-500">Offline</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Collaborators avatars */}
          {collaborators.length > 0 && (
            <Tooltip.Provider>
              <div className="flex items-center -space-x-2 mr-2">
                {collaborators.slice(0, 4).map((collaborator) => (
                  <Tooltip.Root key={collaborator.clientId}>
                    <Tooltip.Trigger asChild>
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium text-white border-2 border-white cursor-default"
                        style={{ backgroundColor: collaborator.color }}
                        title={collaborator.name}
                      >
                        {collaborator.name.charAt(0).toUpperCase()}
                      </div>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content
                        className="bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg z-50"
                        sideOffset={5}
                      >
                        {collaborator.name}
                        <Tooltip.Arrow className="fill-gray-900" />
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                ))}
                {collaborators.length > 4 && (
                  <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium text-gray-600 bg-gray-200 border-2 border-white cursor-default">
                        +{collaborators.length - 4}
                      </div>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content
                        className="bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg z-50 max-w-[200px]"
                        sideOffset={5}
                      >
                        {collaborators.slice(4).map((c) => c.name).join(", ")}
                        <Tooltip.Arrow className="fill-gray-900" />
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                )}
              </div>
            </Tooltip.Provider>
          )}

          {/* Version History button */}
          <button
            onClick={() => {
              setShowVersionPanel(!showVersionPanel);
              if (!showVersionPanel) {
                setShowCommentsPanel(false);
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              showVersionPanel
                ? "bg-purple-100 text-purple-700"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <History className="w-4 h-4" />
            <span>History</span>
          </button>

          {/* Comments button */}
          <button
            onClick={() => {
              setShowCommentsPanel(!showCommentsPanel);
              if (!showCommentsPanel) {
                setShowVersionPanel(false);
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              showCommentsPanel
                ? "bg-yellow-100 text-yellow-700"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Comments</span>
          </button>

          {/* Share button */}
          <button
            onClick={() => setShowShareDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Share2 className="w-4 h-4" />
            <span>Share</span>
          </button>

          {/* More options menu */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="p-1.5 rounded hover:bg-gray-100 transition-colors">
                <MoreHorizontal className="w-5 h-5 text-gray-600" />
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="min-w-[180px] bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
                sideOffset={8}
                align="end"
              >
                <DropdownMenu.Item
                  className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer focus:outline-none focus:bg-gray-100"
                  onSelect={() => {
                    // TODO: Add to favorites
                    alert("Favorites coming soon");
                  }}
                >
                  <Star className="w-4 h-4 mr-2" />
                  Add to Favorites
                </DropdownMenu.Item>

                {document.currentUserRole === "owner" && (
                  <>
                    <DropdownMenu.Separator className="h-px bg-gray-200 my-1" />
                    <DropdownMenu.Item
                      className="flex items-center px-3 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer focus:outline-none focus:bg-red-50"
                      onSelect={handleDelete}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Document
                    </DropdownMenu.Item>
                  </>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </header>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div className={`flex-1 overflow-hidden ${showCommentsPanel ? "" : ""}`}>
          {document.type === "sheet" ? (
            <SheetEditor
              documentId={document.id}
              yjsDocId={document.yjsDocId}
              token={token}
              userName={user.displayName || user.email}
              onSyncStatusChange={handleSyncStatusChange}
              onCollaboratorsChange={handleCollaboratorsChange}
            />
          ) : document.type === "slide" ? (
            <SlideEditor
              documentId={document.id}
              yjsDocId={document.yjsDocId}
              token={token}
              userName={user.displayName || user.email}
              onSyncStatusChange={handleSyncStatusChange}
              onCollaboratorsChange={handleCollaboratorsChange}
            />
          ) : document.type === "mindnote" ? (
            <MindNoteEditor
              documentId={document.id}
              yjsDocId={document.yjsDocId}
              token={token}
              userName={user.displayName || user.email}
              onSyncStatusChange={handleSyncStatusChange}
              onCollaboratorsChange={handleCollaboratorsChange}
            />
          ) : document.type === "board" ? (
            <BoardEditor
              documentId={document.id}
              yjsDocId={document.yjsDocId}
              token={token}
              userName={user.displayName || user.email}
              onSyncStatusChange={handleSyncStatusChange}
              onCollaboratorsChange={handleCollaboratorsChange}
            />
          ) : (
            <DocumentEditor
              ref={editorRef}
              documentId={document.id}
              yjsDocId={document.yjsDocId}
              token={token}
              userName={user.displayName || user.email}
              onSyncStatusChange={handleSyncStatusChange}
              onCollaboratorsChange={handleCollaboratorsChange}
              onAddComment={handleAddComment}
              onCommentClick={handleCommentClick}
            />
          )}
        </div>

        {/* Version History Panel */}
        {showVersionPanel && (
          <div className="w-80 border-l border-gray-200 flex flex-col">
            <VersionHistoryPanel
              documentId={documentId}
              token={token}
              onPreviewVersion={handlePreviewVersion}
              onRestoreVersion={handleRestoreVersion}
              onClose={() => setShowVersionPanel(false)}
            />
          </div>
        )}

        {/* Comments Panel */}
        {showCommentsPanel && (
          <div className="w-80 border-l border-gray-200 flex flex-col">
            <div className="flex items-center justify-end px-2 py-1 border-b border-gray-100">
              <button
                onClick={() => setShowCommentsPanel(false)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <CommentsPanel
                key={commentsPanelKey}
                documentId={documentId}
                token={token}
                currentUserId={user.id}
                selectedCommentId={selectedCommentId}
                onCommentClick={handleCommentClick}
                onCommentResolved={handleCommentResolved}
                onCommentDeleted={handleCommentDeleted}
              />
            </div>
          </div>
        )}
      </div>

      {/* Add Comment Dialog */}
      <AddCommentDialog
        isOpen={showAddCommentDialog}
        onClose={() => {
          setShowAddCommentDialog(false);
          setPendingComment(null);
        }}
        onSubmit={handleCommentSubmit}
        selectedText={pendingComment?.selectedText}
      />

      {/* Share Dialog */}
      <ShareDialog
        isOpen={showShareDialog}
        onClose={() => setShowShareDialog(false)}
        documentId={document.id}
        token={token}
        currentUserRole={document.currentUserRole}
      />

      {/* Version Preview Overlay */}
      {versionPreview && (
        <VersionPreviewEditor
          versionId={versionPreview.versionId}
          versionName={versionPreview.name}
          snapshot={versionPreview.snapshot}
          onClose={() => setVersionPreview(null)}
          onRestore={handleRestoreFromPreview}
          isRestoring={isRestoringVersion}
        />
      )}
    </div>
  );
}
