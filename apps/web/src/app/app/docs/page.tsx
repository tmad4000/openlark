"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  FileText,
  Search,
  Grid3X3,
  List,
  Clock,
  User,
  MoreHorizontal,
  Trash2,
  Star,
  FolderOpen,
  ChevronDown,
  Table2,
  Presentation,
  Brain,
  Layout,
  ArrowUpDown,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

type DocType = "doc" | "sheet" | "slide" | "mindnote" | "board";
type OwnershipFilter = "all" | "owned" | "shared";
type SortOption = "modified" | "created" | "title";

interface DocumentListItem {
  id: string;
  title: string;
  type: DocType;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  owner?: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

// Document type config
const docTypeConfig: Record<
  DocType,
  { icon: typeof FileText; label: string; color: string; bgColor: string }
> = {
  doc: {
    icon: FileText,
    label: "Doc",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  sheet: {
    icon: Table2,
    label: "Sheet",
    color: "text-green-600",
    bgColor: "bg-green-50",
  },
  slide: {
    icon: Presentation,
    label: "Slide",
    color: "text-orange-600",
    bgColor: "bg-orange-50",
  },
  mindnote: {
    icon: Brain,
    label: "MindNote",
    color: "text-purple-600",
    bgColor: "bg-purple-50",
  },
  board: {
    icon: Layout,
    label: "Board",
    color: "text-pink-600",
    bgColor: "bg-pink-50",
  },
};

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "Today";
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  }
}

export default function DocsListPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [token, setToken] = useState<string | null>(null);
  const [ownershipFilter, setOwnershipFilter] =
    useState<OwnershipFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("modified");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Fetch documents
  const fetchDocuments = useCallback(
    async (sessionToken: string) => {
      try {
        setIsLoading(true);
        const params = new URLSearchParams();
        params.set("ownership", ownershipFilter);
        params.set("sort", sortOption);

        const res = await fetch(`/api/documents?${params.toString()}`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });

        if (res.ok) {
          const data = await res.json();
          setDocuments(data.documents || []);
        }
      } catch (err) {
        console.error("Failed to fetch documents:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [ownershipFilter, sortOption]
  );

  // Get current user info
  const fetchCurrentUser = useCallback(async (sessionToken: string) => {
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUserId(data.user.id);
      }
    } catch (err) {
      console.error("Failed to fetch current user:", err);
    }
  }, []);

  useEffect(() => {
    const sessionToken = getCookie("session_token");
    if (!sessionToken) {
      router.push("/login");
      return;
    }

    setToken(sessionToken);
    fetchCurrentUser(sessionToken);
    fetchDocuments(sessionToken);
  }, [fetchDocuments, fetchCurrentUser, router]);

  // Create new document
  const handleCreateDocument = useCallback(
    async (type: DocType) => {
      if (!token) return;

      try {
        const res = await fetch("/api/documents", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: `Untitled ${docTypeConfig[type].label}`,
            type,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          router.push(`/app/docs/${data.id}`);
        } else {
          alert("Failed to create document");
        }
      } catch (err) {
        console.error("Failed to create document:", err);
        alert("Failed to create document");
      }
    },
    [router, token]
  );

  // Delete document
  const handleDeleteDocument = useCallback(
    async (docId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (
        !token ||
        !confirm("Are you sure you want to delete this document?")
      ) {
        return;
      }

      try {
        const res = await fetch(`/api/documents/${docId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          setDocuments((prev) => prev.filter((d) => d.id !== docId));
        } else {
          alert("Failed to delete document");
        }
      } catch (err) {
        console.error("Failed to delete document:", err);
        alert("Failed to delete document");
      }
    },
    [token]
  );

  // Filter documents by search query
  const filteredDocuments = documents.filter((doc) =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get document type icon component
  const DocTypeIcon = ({ type }: { type: DocType }) => {
    const config = docTypeConfig[type];
    const IconComponent = config.icon;
    return <IconComponent className={`w-5 h-5 ${config.color}`} />;
  };

  // Sort option labels
  const sortLabels: Record<SortOption, string> = {
    modified: "Last modified",
    created: "Date created",
    title: "Title",
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading documents...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>

          {/* Create new button with type selector */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">
                <Plus className="w-5 h-5" />
                <span>New</span>
                <ChevronDown className="w-4 h-4" />
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="min-w-[180px] bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
                sideOffset={4}
                align="end"
              >
                {(
                  Object.entries(docTypeConfig) as [
                    DocType,
                    (typeof docTypeConfig)[DocType]
                  ][]
                ).map(([type, config]) => {
                  const IconComponent = config.icon;
                  return (
                    <DropdownMenu.Item
                      key={type}
                      className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer focus:outline-none focus:bg-gray-100"
                      onSelect={() => handleCreateDocument(type)}
                    >
                      <IconComponent
                        className={`w-4 h-4 mr-3 ${config.color}`}
                      />
                      {config.label}
                    </DropdownMenu.Item>
                  );
                })}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>

        {/* Filters row */}
        <div className="flex items-center justify-between gap-4">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Ownership filter tabs */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {(["all", "owned", "shared"] as OwnershipFilter[]).map((filter) => (
              <button
                key={filter}
                onClick={() => setOwnershipFilter(filter)}
                className={`px-3 py-1.5 text-sm rounded transition-colors ${
                  ownershipFilter === filter
                    ? "bg-white text-gray-900 shadow-sm font-medium"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {filter === "all"
                  ? "All"
                  : filter === "owned"
                    ? "Owned by me"
                    : "Shared with me"}
              </button>
            ))}
          </div>

          {/* Sort dropdown */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                <ArrowUpDown className="w-4 h-4" />
                <span>{sortLabels[sortOption]}</span>
                <ChevronDown className="w-4 h-4" />
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="min-w-[160px] bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
                sideOffset={4}
                align="end"
              >
                {(Object.entries(sortLabels) as [SortOption, string][]).map(
                  ([option, label]) => (
                    <DropdownMenu.Item
                      key={option}
                      className={`flex items-center px-3 py-2 text-sm cursor-pointer focus:outline-none ${
                        sortOption === option
                          ? "bg-blue-50 text-blue-700"
                          : "text-gray-700 hover:bg-gray-100"
                      }`}
                      onSelect={() => setSortOption(option)}
                    >
                      {label}
                    </DropdownMenu.Item>
                  )
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          {/* View mode toggle */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded transition-colors ${
                viewMode === "grid"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
              title="Grid view"
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded transition-colors ${
                viewMode === "list"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {filteredDocuments.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <FolderOpen className="w-16 h-16 text-gray-300 mb-4" />
            {searchQuery ? (
              <>
                <p className="text-gray-600 mb-2">No documents found</p>
                <p className="text-sm text-gray-500">
                  Try a different search term
                </p>
              </>
            ) : ownershipFilter === "shared" ? (
              <>
                <p className="text-gray-600 mb-2">No shared documents yet</p>
                <p className="text-sm text-gray-500">
                  Documents shared with you will appear here
                </p>
              </>
            ) : (
              <>
                <p className="text-gray-600 mb-2">No documents yet</p>
                <p className="text-sm text-gray-500 mb-4">
                  Create your first document to get started
                </p>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">
                      <Plus className="w-5 h-5" />
                      <span>New Document</span>
                    </button>
                  </DropdownMenu.Trigger>

                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      className="min-w-[180px] bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
                      sideOffset={4}
                    >
                      {(
                        Object.entries(docTypeConfig) as [
                          DocType,
                          (typeof docTypeConfig)[DocType]
                        ][]
                      ).map(([type, config]) => {
                        const IconComponent = config.icon;
                        return (
                          <DropdownMenu.Item
                            key={type}
                            className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer focus:outline-none focus:bg-gray-100"
                            onSelect={() => handleCreateDocument(type)}
                          >
                            <IconComponent
                              className={`w-4 h-4 mr-3 ${config.color}`}
                            />
                            {config.label}
                          </DropdownMenu.Item>
                        );
                      })}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </>
            )}
          </div>
        ) : viewMode === "grid" ? (
          /* Grid View */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredDocuments.map((doc) => {
              const typeConfig = docTypeConfig[doc.type];
              const TypeIcon = typeConfig.icon;
              const isOwner = doc.ownerId === currentUserId;

              return (
                <div
                  key={doc.id}
                  onClick={() => router.push(`/app/docs/${doc.id}`)}
                  className="bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group"
                >
                  {/* Preview area with type icon */}
                  <div
                    className={`aspect-[4/3] ${typeConfig.bgColor} rounded-t-lg flex items-center justify-center border-b border-gray-100`}
                  >
                    <TypeIcon className={`w-12 h-12 ${typeConfig.color}`} />
                  </div>

                  {/* Document info */}
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium text-gray-900 truncate flex-1">
                        {doc.title}
                      </h3>
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
                              onSelect={() => {
                                alert("Favorites coming soon");
                              }}
                            >
                              <Star className="w-4 h-4 mr-2" />
                              Add to Favorites
                            </DropdownMenu.Item>
                            {isOwner && (
                              <>
                                <DropdownMenu.Separator className="h-px bg-gray-200 my-1" />
                                <DropdownMenu.Item
                                  className="flex items-center px-3 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer focus:outline-none focus:bg-red-50"
                                  onSelect={(e) =>
                                    handleDeleteDocument(
                                      doc.id,
                                      e as unknown as React.MouseEvent
                                    )
                                  }
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Delete
                                </DropdownMenu.Item>
                              </>
                            )}
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    </div>

                    {/* Owner and timestamp row */}
                    <div className="flex items-center justify-between mt-2">
                      {/* Owner avatar */}
                      <div className="flex items-center gap-1.5">
                        {doc.owner?.avatarUrl ? (
                          <img
                            src={doc.owner.avatarUrl}
                            alt=""
                            className="w-5 h-5 rounded-full"
                          />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center">
                            <User className="w-3 h-3 text-gray-500" />
                          </div>
                        )}
                        <span className="text-xs text-gray-500 truncate max-w-[80px]">
                          {doc.ownerId === currentUserId
                            ? "Me"
                            : doc.owner?.displayName || "Unknown"}
                        </span>
                      </div>

                      {/* Timestamp */}
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />
                        <span>{formatDate(doc.updatedAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Owner
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Modified
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredDocuments.map((doc) => {
                  const typeConfig = docTypeConfig[doc.type];
                  const isOwner = doc.ownerId === currentUserId;

                  return (
                    <tr
                      key={doc.id}
                      onClick={() => router.push(`/app/docs/${doc.id}`)}
                      className="hover:bg-gray-50 cursor-pointer group"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <DocTypeIcon type={doc.type} />
                          <span className="font-medium text-gray-900 truncate">
                            {doc.title}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${typeConfig.bgColor} ${typeConfig.color}`}
                        >
                          {typeConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {doc.owner?.avatarUrl ? (
                            <img
                              src={doc.owner.avatarUrl}
                              alt=""
                              className="w-6 h-6 rounded-full"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
                              <User className="w-3 h-3 text-gray-500" />
                            </div>
                          )}
                          <span className="text-sm text-gray-600">
                            {doc.ownerId === currentUserId
                              ? "Me"
                              : doc.owner?.displayName || "Unknown"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatDate(doc.updatedAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger asChild>
                            <button
                              onClick={(e) => e.stopPropagation()}
                              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 transition-all"
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
                                onSelect={() => {
                                  alert("Favorites coming soon");
                                }}
                              >
                                <Star className="w-4 h-4 mr-2" />
                                Add to Favorites
                              </DropdownMenu.Item>
                              {isOwner && (
                                <>
                                  <DropdownMenu.Separator className="h-px bg-gray-200 my-1" />
                                  <DropdownMenu.Item
                                    className="flex items-center px-3 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer focus:outline-none focus:bg-red-50"
                                    onSelect={(e) =>
                                      handleDeleteDocument(
                                        doc.id,
                                        e as unknown as React.MouseEvent
                                      )
                                    }
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete
                                  </DropdownMenu.Item>
                                </>
                              )}
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
