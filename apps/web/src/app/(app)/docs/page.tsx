"use client";

import { useState, useCallback } from "react";
import { DocumentEditor, CreateDocumentDialog, DocsHub } from "@/components/docs";
import { AppShell } from "@/components/layout/app-shell";
import type { Document } from "@/lib/api";

export default function DocsPage() {
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const handleSelectDocument = useCallback((document: Document) => {
    setSelectedDocument(document);
  }, []);

  const handleCreateDocument = useCallback(() => {
    setIsCreateDialogOpen(true);
  }, []);

  const handleDocumentCreated = useCallback((document: Document) => {
    DocsHub.addDocument(document);
    setSelectedDocument(document);
  }, []);

  const handleBackToHub = useCallback(() => {
    setSelectedDocument(null);
  }, []);

  // When a document is selected, show the editor
  if (selectedDocument) {
    return (
      <>
        <AppShell>
          <div className="flex flex-col h-full">
            {/* Document header with back button */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center gap-3">
              <button
                onClick={handleBackToHub}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                &larr; Docs
              </button>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {selectedDocument.title || "Untitled"}
              </h1>
            </div>
            {/* Document editor */}
            <DocumentEditor
              document={selectedDocument}
              readOnly={false}
            />
          </div>
        </AppShell>

        <CreateDocumentDialog
          open={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
          onDocumentCreated={handleDocumentCreated}
        />
      </>
    );
  }

  // Default: show the docs hub
  return (
    <>
      <AppShell>
        <DocsHub
          onSelectDocument={handleSelectDocument}
          onCreateDocument={handleCreateDocument}
        />
      </AppShell>

      <CreateDocumentDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onDocumentCreated={handleDocumentCreated}
      />
    </>
  );
}
