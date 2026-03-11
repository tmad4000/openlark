"use client";

import { useEffect, useState, useCallback } from "react";
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
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import dynamic from "next/dynamic";

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
        setDocument(docData.document);
        setEditedTitle(docData.document.title);
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
          {/* Share button */}
          <button
            onClick={() => {
              // TODO: Open share dialog
              alert("Share functionality coming soon");
            }}
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

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <DocumentEditor
          documentId={document.id}
          yjsDocId={document.yjsDocId}
          token={token}
          userName={user.displayName || user.email}
          onSyncStatusChange={handleSyncStatusChange}
        />
      </div>
    </div>
  );
}
