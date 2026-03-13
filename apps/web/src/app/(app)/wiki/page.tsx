"use client";

import { useState, useCallback, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { WikiSpaceList, WikiPageTree, WikiBreadcrumb } from "@/components/wiki";
import { DocumentEditor } from "@/components/docs";
import { api, type WikiSpace, type WikiPage, type Document } from "@/lib/api";

export default function WikiPage() {
  const [selectedSpace, setSelectedSpace] = useState<WikiSpace | null>(null);
  const [selectedPage, setSelectedPage] = useState<WikiPage | null>(null);
  const [allPages, setAllPages] = useState<WikiPage[]>([]);
  const [document, setDocument] = useState<Document | null>(null);

  // Load pages when space is selected (for breadcrumb)
  useEffect(() => {
    if (!selectedSpace) {
      setAllPages([]);
      return;
    }
    async function loadPages() {
      try {
        const result = await api.getWikiPages(selectedSpace!.id);
        setAllPages(result.pages);
      } catch {
        // Silently handle
      }
    }
    loadPages();
  }, [selectedSpace]);

  // Load document when page is selected
  useEffect(() => {
    if (!selectedPage) {
      setDocument(null);
      return;
    }
    async function loadDocument() {
      try {
        const result = await api.getDocument(selectedPage!.documentId);
        setDocument(result.document);
      } catch {
        // Silently handle
      }
    }
    loadDocument();
  }, [selectedPage]);

  const handleSelectSpace = useCallback((space: WikiSpace) => {
    setSelectedSpace(space);
    setSelectedPage(null);
    setDocument(null);
  }, []);

  const handleSelectPage = useCallback((page: WikiPage) => {
    setSelectedPage(page);
  }, []);

  const handleBackToSpaces = useCallback(() => {
    setSelectedSpace(null);
    setSelectedPage(null);
    setDocument(null);
    setAllPages([]);
  }, []);

  const handleNavigateSpaceFromBreadcrumb = useCallback(() => {
    setSelectedPage(null);
    setDocument(null);
  }, []);

  // View 1: Space list (no space selected)
  if (!selectedSpace) {
    return (
      <AppShell>
        <WikiSpaceList onSelectSpace={handleSelectSpace} />
      </AppShell>
    );
  }

  // View 2: Space with page tree sidebar + document editor
  const sidebar = (
    <WikiPageTree
      space={selectedSpace}
      selectedPageId={selectedPage?.id ?? null}
      onSelectPage={handleSelectPage}
      onBack={handleBackToSpaces}
    />
  );

  return (
    <AppShell sidebar={sidebar}>
      <div className="flex flex-col h-full">
        {/* Breadcrumb */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <WikiBreadcrumb
            space={selectedSpace}
            pages={allPages}
            currentPage={selectedPage}
            onNavigateSpace={handleNavigateSpaceFromBreadcrumb}
            onNavigatePage={handleSelectPage}
          />
        </div>

        {/* Content */}
        {selectedPage && document ? (
          <DocumentEditor document={document} readOnly={false} />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
            <div className="text-center">
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Select a page from the sidebar to view its content
              </p>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
