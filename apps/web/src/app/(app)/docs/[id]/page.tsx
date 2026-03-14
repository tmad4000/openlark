"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { DocumentEditor } from "@/components/docs/document-editor";
import { SheetEditor } from "@/components/docs/sheet-editor";
import { SlidesEditor } from "@/components/docs/slides-editor";
import { AppShell } from "@/components/layout/app-shell";
import { DocumentList, CreateDocumentDialog } from "@/components/docs";
import { api, type Document } from "@/lib/api";
import { ArrowLeft, FileText } from "lucide-react";

export default function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: documentId } = use(params);
  const router = useRouter();
  const { user, organization } = useAuth();
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .getDocument(documentId)
      .then((res) => {
        if (!cancelled) {
          setDocument(res.document);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || "Failed to load document");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const handleSelectDocument = useCallback(
    (doc: Document) => {
      router.push(`/app/docs/${doc.id}`);
    },
    [router]
  );

  const handleDocumentCreated = useCallback(
    (doc: Document) => {
      DocumentList.addDocument(doc);
      router.push(`/app/docs/${doc.id}`);
    },
    [router]
  );

  const sidebar = (
    <DocumentList
      selectedDocumentId={documentId}
      onSelectDocument={handleSelectDocument}
      onCreateDocument={() => setIsCreateDialogOpen(true)}
    />
  );

  return (
    <>
      <AppShell sidebar={sidebar}>
        {loading ? (
          <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeDasharray="50" strokeDashoffset="15" />
              </svg>
              <span>Loading document...</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900">
            <div className="text-center">
              <FileText className="h-8 w-8 text-gray-400 mx-auto mb-3" />
              <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
                Document not found
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{error}</p>
              <button
                onClick={() => router.push("/app/docs")}
                className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to documents
              </button>
            </div>
          </div>
        ) : document ? (
          document.type === "sheet" ? (
            <SheetEditor document={document} readOnly={false} currentUser={user} />
          ) : document.type === "slide" ? (
            <SlidesEditor document={document} readOnly={false} currentUser={user} />
          ) : (
            <DocumentEditor document={document} readOnly={false} currentUser={user} />
          )
        ) : null}
      </AppShell>

      <CreateDocumentDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onDocumentCreated={handleDocumentCreated}
      />
    </>
  );
}
