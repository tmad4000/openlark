"use client";

import type { WikiSpace, WikiPage } from "@/lib/api";
import { ChevronRight } from "lucide-react";

interface WikiBreadcrumbProps {
  space: WikiSpace;
  pages: WikiPage[];
  currentPage: WikiPage | null;
  onNavigateSpace: () => void;
  onNavigatePage: (page: WikiPage) => void;
}

function getAncestors(
  currentPage: WikiPage,
  allPages: WikiPage[]
): WikiPage[] {
  const ancestors: WikiPage[] = [];
  let current = currentPage;

  while (current.parentPageId) {
    const parent = allPages.find((p) => p.id === current.parentPageId);
    if (!parent) break;
    ancestors.unshift(parent);
    current = parent;
  }

  return ancestors;
}

export function WikiBreadcrumb({
  space,
  pages,
  currentPage,
  onNavigateSpace,
  onNavigatePage,
}: WikiBreadcrumbProps) {
  const ancestors = currentPage ? getAncestors(currentPage, pages) : [];

  return (
    <nav
      className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 overflow-x-auto"
      aria-label="Breadcrumb"
    >
      <button
        onClick={onNavigateSpace}
        className="hover:text-gray-700 dark:hover:text-gray-200 whitespace-nowrap flex-shrink-0"
      >
        {space.name}
      </button>

      {ancestors.map((ancestor) => (
        <span key={ancestor.id} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
          <button
            onClick={() => onNavigatePage(ancestor)}
            className="hover:text-gray-700 dark:hover:text-gray-200 whitespace-nowrap truncate max-w-[200px]"
          >
            {ancestor.document.title}
          </button>
        </span>
      ))}

      {currentPage && (
        <span className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="text-gray-900 dark:text-gray-100 font-medium whitespace-nowrap truncate max-w-[200px]">
            {currentPage.document.title}
          </span>
        </span>
      )}
    </nav>
  );
}
