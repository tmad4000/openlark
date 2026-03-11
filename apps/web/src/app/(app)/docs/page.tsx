"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { DocumentList, DocumentEditor, CreateDocumentDialog } from "@/components/docs";
import { AppShell } from "@/components/layout/app-shell";
import { FileText } from "lucide-react";
import type { Document } from "@/lib/api";

export default function DocsPage() {
  const { organization } = useAuth();
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const handleSelectDocument = useCallback((document: Document) => {
    setSelectedDocument(document);
  }, []);

  const handleCreateDocument = useCallback(() => {
    setIsCreateDialogOpen(true);
  }, []);

  const handleDocumentCreated = useCallback((document: Document) => {
    // Add the new document to the list and select it
    DocumentList.addDocument(document);
    setSelectedDocument(document);
  }, []);

  const sidebar = (
    <DocumentList
      selectedDocumentId={selectedDocument?.id}
      onSelectDocument={handleSelectDocument}
      onCreateDocument={handleCreateDocument}
    />
  );

  return (
    <>
      <AppShell sidebar={sidebar}>
        {selectedDocument ? (
          <div className="flex flex-col h-full">
            {/* Document header */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
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
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900">
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="p-4 rounded-full bg-gray-100 dark:bg-gray-800">
                  <FileText className="h-8 w-8 text-gray-400 dark:text-gray-500" />
                </div>
              </div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Documents
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Welcome to {organization?.name || "your organization"}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-4">
                Select a document from the sidebar or create a new one
              </p>
            </div>
          </div>
        )}
      </AppShell>

      {/* Create document dialog */}
      <CreateDocumentDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onDocumentCreated={handleDocumentCreated}
      />
    </>
  );
}
