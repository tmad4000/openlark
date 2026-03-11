"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { api, type Document } from "@/lib/api";
import { FileText, FileSpreadsheet, Presentation, Brain, Layout, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DocumentListProps {
  selectedDocumentId?: string | null;
  onSelectDocument?: (document: Document) => void;
  onCreateDocument?: () => void;
}

// Get icon for document type
function getDocumentIcon(type: Document["type"]) {
  switch (type) {
    case "doc":
      return FileText;
    case "sheet":
      return FileSpreadsheet;
    case "slide":
      return Presentation;
    case "mindnote":
      return Brain;
    case "board":
      return Layout;
    default:
      return FileText;
  }
}

export function DocumentList({
  selectedDocumentId,
  onSelectDocument,
  onCreateDocument,
}: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDocuments() {
      try {
        setIsLoading(true);
        setError(null);
        const response = await api.getDocuments();
        setDocuments(response.documents);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load documents");
      } finally {
        setIsLoading(false);
      }
    }

    loadDocuments();
  }, []);

  // Function to add a new document to the list (called from parent)
  const addDocument = (document: Document) => {
    setDocuments((prev) => {
      // Avoid duplicates
      if (prev.some((d) => d.id === document.id)) return prev;
      // Add to the beginning (most recent first)
      return [document, ...prev];
    });
  };

  // Expose addDocument for parent components
  DocumentList.addDocument = addDocument;

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Loading documents...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-sm text-red-500 text-center">{error}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Documents
        </h2>
        {onCreateDocument && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onCreateDocument}
            className="h-8 w-8"
            aria-label="New document"
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto">
        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <FileText className="h-8 w-8 text-gray-400 dark:text-gray-600 mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No documents yet
            </p>
            {onCreateDocument && (
              <Button
                variant="outline"
                size="sm"
                onClick={onCreateDocument}
                className="mt-4"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create document
              </Button>
            )}
          </div>
        ) : (
          <ul role="list" className="divide-y divide-gray-200 dark:divide-gray-800">
            {documents.map((document) => {
              const Icon = getDocumentIcon(document.type);
              const isSelected = selectedDocumentId === document.id;

              return (
                <li key={document.id}>
                  <button
                    onClick={() => onSelectDocument?.(document)}
                    className={cn(
                      "w-full text-left px-4 py-3 transition-colors",
                      "hover:bg-gray-50 dark:hover:bg-gray-800",
                      isSelected && "bg-blue-50 dark:bg-blue-900/20"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className="h-5 w-5 text-gray-400 dark:text-gray-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {document.title || "Untitled"}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Updated {formatDate(document.updatedAt)}
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// Static method placeholder - will be overwritten by component instance
DocumentList.addDocument = (_document: Document) => {};
