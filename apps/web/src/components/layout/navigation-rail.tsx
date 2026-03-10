"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  MessageSquare,
  Calendar,
  FileText,
  Mail,
  CheckSquare,
  Database,
  BookOpen,
  Home,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface NavItem {
  icon: LucideIcon;
  label: string;
  href: string;
}

const navItems: NavItem[] = [
  { icon: MessageSquare, label: "Messenger", href: "/messenger" },
  { icon: Calendar, label: "Calendar", href: "/calendar" },
  { icon: FileText, label: "Docs", href: "/docs" },
  { icon: Mail, label: "Email", href: "/email" },
  { icon: CheckSquare, label: "Tasks", href: "/tasks" },
  { icon: Database, label: "Base", href: "/base" },
  { icon: BookOpen, label: "Wiki", href: "/wiki" },
  { icon: Home, label: "Workplace", href: "/workplace" },
];

export function NavigationRail() {
  const pathname = usePathname();

  return (
    <nav
      className="flex flex-col h-full w-14 bg-gray-100 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800"
      aria-label="Main navigation"
    >
      <div className="flex flex-col items-center py-4 gap-1 flex-1">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-lg transition-colors",
                    isActive
                      ? "bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="sr-only">{item.label}</span>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <div className="flex flex-col items-center py-4 border-t border-gray-200 dark:border-gray-800">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/settings"
              className={cn(
                "flex items-center justify-center w-10 h-10 rounded-lg transition-colors",
                pathname.startsWith("/settings")
                  ? "bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800"
              )}
            >
              <Settings className="w-5 h-5" />
              <span className="sr-only">Settings</span>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>
      </div>
    </nav>
  );
}
