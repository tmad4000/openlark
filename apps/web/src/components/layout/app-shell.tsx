"use client";

import { type ReactNode } from "react";
import { NavigationRail } from "./navigation-rail";
import { TooltipProvider } from "@/components/ui/tooltip";

interface AppShellProps {
  children: ReactNode;
  sidebar?: ReactNode;
  rightPanel?: ReactNode;
}

export function AppShell({ children, sidebar, rightPanel }: AppShellProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen bg-white dark:bg-gray-950">
        {/* Navigation Rail */}
        <NavigationRail />

        {/* Left Sidebar (content list) */}
        {sidebar && (
          <aside className="w-64 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden">
            {sidebar}
          </aside>
        )}

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {children}
        </main>

        {/* Right Panel (contextual info) */}
        {rightPanel && (
          <aside className="w-80 border-l border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden">
            {rightPanel}
          </aside>
        )}
      </div>
    </TooltipProvider>
  );
}
