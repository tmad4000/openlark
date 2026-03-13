"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  MessageSquare,
  Calendar,
  FileText,
  CheckSquare,
  Database,
  BookOpen,
  Mail,
  FileCheck,
  Settings,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Bell,
  X,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

interface UserData {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

interface NotificationData {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

const NAV_ITEMS = [
  { id: "messenger", label: "Messenger", icon: MessageSquare, href: "/app/messenger" },
  { id: "calendar", label: "Calendar", icon: Calendar, href: "/app/calendar" },
  { id: "docs", label: "Docs", icon: FileText, href: "/app/docs" },
  { id: "tasks", label: "Tasks", icon: CheckSquare, href: "/app/tasks" },
  { id: "base", label: "Base", icon: Database, href: "/app/base" },
  { id: "wiki", label: "Wiki", icon: BookOpen, href: "/app/wiki" },
  { id: "approvals", label: "Approvals", icon: FileCheck, href: "/app/approvals" },
  { id: "email", label: "Email", icon: Mail, href: "/app/email" },
  { id: "admin", label: "Admin", icon: Settings, href: "/app/admin" },
];

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<UserData | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [isResizing, setIsResizing] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const token = getCookie("session_token");
    if (!token) {
      router.push("/login");
      return;
    }

    // Validate session and fetch user data
    fetch("/api/auth/me", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error("Invalid session");
        }
        return res.json();
      })
      .then((data) => {
        setUser(data.user);
        setIsLoading(false);
        // Fetch initial notifications and unread count
        fetchNotifications(token);
      })
      .catch(() => {
        document.cookie = "session_token=; path=/; max-age=0";
        router.push("/login");
      });
  }, [router]);

  const handleLogout = async () => {
    const token = getCookie("session_token");
    if (token) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    }
    document.cookie = "session_token=; path=/; max-age=0";
    router.push("/login");
  };

  const fetchNotifications = async (token: string) => {
    try {
      const res = await fetch("/api/notifications?limit=20", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    }
  };

  const markNotificationAsRead = async (notificationId: string) => {
    const token = getCookie("session_token");
    if (!token) return;

    try {
      const res = await fetch(`/api/notifications/${notificationId}/read`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId ? { ...n, readAt: new Date().toISOString() } : n
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  const markAllNotificationsAsRead = async () => {
    const token = getCookie("session_token");
    if (!token) return;

    try {
      const res = await fetch("/api/notifications/read-all", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() }))
        );
        setUnreadCount(0);
      }
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
    }
  };

  const handleNotificationClick = (notification: NotificationData) => {
    // Mark as read
    if (!notification.readAt) {
      markNotificationAsRead(notification.id);
    }
    // Navigate based on entity type
    if (notification.entityType === "message" && notification.entityId) {
      // For messages, navigate to messenger - in a real app, we'd navigate to the specific chat
      router.push("/app/messenger");
      setNotificationPanelOpen(false);
    }
  };

  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const handleMouseDown = () => {
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = e.clientX - 56; // subtract nav rail width
      if (newWidth >= 120 && newWidth <= 400) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const getActiveModule = () => {
    const segments = pathname.split("/");
    return segments[2] || "";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  const activeModule = getActiveModule();

  // Modules that have their own sidebar layout
  const modulesWithOwnSidebar = ["messenger", "calendar", "wiki", "base"];
  const hasOwnSidebar = modulesWithOwnSidebar.includes(activeModule);

  return (
    <div className="h-screen flex overflow-hidden bg-gray-100">
      {/* Navigation Rail - 56px fixed width */}
      <nav className="w-14 bg-gray-900 flex flex-col items-center py-3 flex-shrink-0">
        {/* Logo */}
        <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center mb-4">
          <span className="text-white font-bold text-lg">O</span>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 flex flex-col items-center space-y-1 w-full px-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                onClick={() => router.push(item.href)}
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors group relative ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`}
                title={item.label}
              >
                <Icon className="w-5 h-5" />
                {/* Tooltip */}
                <span className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Notification Bell */}
        <div className="mt-auto mb-2 relative">
          <button
            onClick={() => setNotificationPanelOpen(!notificationPanelOpen)}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors group relative ${
              notificationPanelOpen
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
            title="Notifications"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
            {/* Tooltip */}
            <span className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              Notifications
            </span>
          </button>
        </div>

        {/* User Avatar + Dropdown */}
        <div>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="w-10 h-10 rounded-full overflow-hidden border-2 border-transparent hover:border-gray-600 transition-colors focus:outline-none focus:border-blue-500">
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.displayName || "User"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-blue-600 flex items-center justify-center text-white text-sm font-medium">
                    {user?.displayName?.charAt(0).toUpperCase() ||
                      user?.email?.charAt(0).toUpperCase() ||
                      "U"}
                  </div>
                )}
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="min-w-[200px] bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
                sideOffset={8}
                side="right"
                align="end"
              >
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900">
                    {user?.displayName || "User"}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                </div>

                <DropdownMenu.Item
                  className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer focus:outline-none focus:bg-gray-100"
                  onSelect={() => router.push("/app/profile")}
                >
                  <User className="w-4 h-4 mr-2" />
                  Profile
                </DropdownMenu.Item>

                <DropdownMenu.Item
                  className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer focus:outline-none focus:bg-gray-100"
                  onSelect={() => router.push("/app/settings")}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </DropdownMenu.Item>

                <DropdownMenu.Separator className="h-px bg-gray-200 my-1" />

                <DropdownMenu.Item
                  className="flex items-center px-3 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer focus:outline-none focus:bg-red-50"
                  onSelect={handleLogout}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </nav>

      {/* Notification Panel - slides in from left */}
      {notificationPanelOpen && (
        <aside className="w-80 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 shadow-lg">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Notifications</h2>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllNotificationsAsRead}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setNotificationPanelOpen(false)}
                className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notification List */}
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Bell className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`w-full p-4 text-left hover:bg-gray-50 transition-colors ${
                      !notification.readAt ? "bg-blue-50/50" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Unread indicator */}
                      {!notification.readAt && (
                        <span className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                      )}
                      <div className={`flex-1 min-w-0 ${notification.readAt ? "pl-5" : ""}`}>
                        <p className={`text-sm ${!notification.readAt ? "font-medium" : ""} text-gray-900 line-clamp-2`}>
                          {notification.title}
                        </p>
                        {notification.body && (
                          <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                            {notification.body}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                          {formatTimeAgo(notification.createdAt)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Resizable Sidebar Panel - hidden for modules with their own sidebar */}
      {!hasOwnSidebar && !isSidebarCollapsed && (
        <aside
          className="bg-white border-r border-gray-200 flex flex-col relative"
          style={{ width: sidebarWidth }}
        >
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 capitalize">
              {activeModule || "Dashboard"}
            </h2>
            <button
              onClick={() => setIsSidebarCollapsed(true)}
              className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <p className="text-sm text-gray-500">
              {activeModule ? `${activeModule} content` : "Select a module from the navigation"}
            </p>
          </div>

          {/* Resize Handle */}
          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 transition-colors"
            onMouseDown={handleMouseDown}
          />
        </aside>
      )}

      {/* Collapsed Sidebar Toggle - hidden for modules with their own sidebar */}
      {!hasOwnSidebar && isSidebarCollapsed && (
        <button
          onClick={() => setIsSidebarCollapsed(false)}
          className="w-6 bg-white border-r border-gray-200 flex items-center justify-center hover:bg-gray-50"
        >
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </button>
      )}

      {/* Main Content Area */}
      <main className={`flex-1 overflow-hidden ${hasOwnSidebar ? "" : "bg-gray-50"}`}>{children}</main>
    </div>
  );
}
