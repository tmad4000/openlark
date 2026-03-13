"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  Calendar,
  FileText,
  CheckSquare,
  Database,
  BookOpen,
  Mail,
  FileCheck,
  Target,
  Clock,
  Palmtree,
  ClipboardList,
  Plus,
  ArrowRight,
  AlertCircle,
} from "lucide-react";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

interface ChatItem {
  id: string;
  name: string | null;
  type: string;
  updatedAt: string;
}

interface EventItem {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  location: string | null;
}

interface TaskItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
}

interface DocItem {
  id: string;
  title: string;
  type: string;
  updatedAt: string;
}

const APP_MODULES = [
  { id: "messenger", label: "Messenger", icon: MessageSquare, href: "/app/messenger", color: "bg-blue-500" },
  { id: "calendar", label: "Calendar", icon: Calendar, href: "/app/calendar", color: "bg-orange-500" },
  { id: "docs", label: "Docs", icon: FileText, href: "/app/docs", color: "bg-emerald-500" },
  { id: "tasks", label: "Tasks", icon: CheckSquare, href: "/app/tasks", color: "bg-purple-500" },
  { id: "base", label: "Base", icon: Database, href: "/app/base", color: "bg-pink-500" },
  { id: "wiki", label: "Wiki", icon: BookOpen, href: "/app/wiki", color: "bg-teal-500" },
  { id: "approvals", label: "Approvals", icon: FileCheck, href: "/app/approvals", color: "bg-amber-500" },
  { id: "okr", label: "OKR", icon: Target, href: "/app/okr", color: "bg-red-500" },
  { id: "attendance", label: "Attendance", icon: Clock, href: "/app/attendance", color: "bg-indigo-500" },
  { id: "leave", label: "Leave", icon: Palmtree, href: "/app/leave", color: "bg-green-500" },
  { id: "email", label: "Email", icon: Mail, href: "/app/email", color: "bg-sky-500" },
  { id: "forms", label: "Forms", icon: ClipboardList, href: "/app/forms", color: "bg-violet-500" },
];

const QUICK_ACTIONS = [
  { label: "New Chat", icon: MessageSquare, href: "/app/messenger", color: "text-blue-600 bg-blue-50 hover:bg-blue-100" },
  { label: "New Doc", icon: FileText, href: "/app/docs", color: "text-emerald-600 bg-emerald-50 hover:bg-emerald-100" },
  { label: "New Event", icon: Calendar, href: "/app/calendar", color: "text-orange-600 bg-orange-50 hover:bg-orange-100" },
  { label: "New Task", icon: CheckSquare, href: "/app/tasks", color: "text-purple-600 bg-purple-50 hover:bg-purple-100" },
];

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "text-red-600",
  high: "text-orange-500",
  medium: "text-yellow-500",
  low: "text-blue-400",
  none: "text-gray-400",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  todo: { label: "To Do", color: "bg-gray-200 text-gray-700" },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700" },
  done: { label: "Done", color: "bg-green-100 text-green-700" },
};

const DOC_TYPE_COLORS: Record<string, string> = {
  doc: "text-blue-600",
  sheet: "text-green-600",
  slide: "text-orange-600",
  mindnote: "text-purple-600",
  board: "text-pink-600",
};

function formatTimeAgo(dateString: string): string {
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
}

function formatEventTime(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const now = new Date();
  const isToday = startDate.toDateString() === now.toDateString();
  const isTomorrow =
    startDate.toDateString() === new Date(now.getTime() + 86400000).toDateString();

  const time = startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const endTime = endDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (isToday) return `Today ${time} - ${endTime}`;
  if (isTomorrow) return `Tomorrow ${time} - ${endTime}`;
  return `${startDate.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

export default function WorkplaceDashboard() {
  const router = useRouter();
  const [recentChats, setRecentChats] = useState<ChatItem[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<EventItem[]>([]);
  const [myTasks, setMyTasks] = useState<TaskItem[]>([]);
  const [recentDocs, setRecentDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getCookie("session_token");
    if (!token) return;

    fetch("/api/dashboard", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setRecentChats(data.recentChats || []);
          setUpcomingEvents(data.upcomingEvents || []);
          setMyTasks(data.myTasks || []);
          setRecentDocs(data.recentDocs || []);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="h-full overflow-y-auto p-6 bg-gray-50">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workplace</h1>
          <p className="text-sm text-gray-500 mt-1">Your personal dashboard</p>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-3">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                onClick={() => router.push(action.href)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors ${action.color}`}
              >
                <Plus className="w-4 h-4" />
                {action.label}
              </button>
            );
          })}
        </div>

        {/* Widgets Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Chats */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-500" />
                <h2 className="font-semibold text-gray-900 text-sm">Recent Chats</h2>
              </div>
              <button
                onClick={() => router.push("/app/messenger")}
                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                View all <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {loading ? (
                <div className="px-5 py-8 text-center text-sm text-gray-400">Loading...</div>
              ) : recentChats.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-gray-400">No recent chats</div>
              ) : (
                recentChats.map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => router.push("/app/messenger")}
                    className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <MessageSquare className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {chat.name || "Direct Message"}
                        </p>
                        <p className="text-xs text-gray-400 capitalize">{chat.type.replace("_", " ")}</p>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                      {formatTimeAgo(chat.updatedAt)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Upcoming Events */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-orange-500" />
                <h2 className="font-semibold text-gray-900 text-sm">Upcoming Events</h2>
              </div>
              <button
                onClick={() => router.push("/app/calendar")}
                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                View all <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {loading ? (
                <div className="px-5 py-8 text-center text-sm text-gray-400">Loading...</div>
              ) : upcomingEvents.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-gray-400">No upcoming events</div>
              ) : (
                upcomingEvents.map((event) => (
                  <button
                    key={event.id}
                    onClick={() => router.push("/app/calendar")}
                    className="w-full px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-4 h-4 text-orange-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{event.title}</p>
                      <p className="text-xs text-gray-500">
                        {formatEventTime(event.startTime, event.endTime)}
                        {event.location && ` \u00B7 ${event.location}`}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* My Tasks */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-purple-500" />
                <h2 className="font-semibold text-gray-900 text-sm">My Tasks</h2>
              </div>
              <button
                onClick={() => router.push("/app/tasks")}
                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                View all <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {loading ? (
                <div className="px-5 py-8 text-center text-sm text-gray-400">Loading...</div>
              ) : myTasks.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-gray-400">No active tasks</div>
              ) : (
                myTasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => router.push("/app/tasks")}
                    className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <AlertCircle className={`w-4 h-4 flex-shrink-0 ${PRIORITY_COLORS[task.priority] || "text-gray-400"}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                        {task.dueDate && (
                          <p className="text-xs text-gray-400">
                            Due {new Date(task.dueDate).toLocaleDateString([], { month: "short", day: "numeric" })}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${STATUS_LABELS[task.status]?.color || "bg-gray-100 text-gray-500"}`}>
                      {STATUS_LABELS[task.status]?.label || task.status}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Recent Docs */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-500" />
                <h2 className="font-semibold text-gray-900 text-sm">Recent Docs</h2>
              </div>
              <button
                onClick={() => router.push("/app/docs")}
                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                View all <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {loading ? (
                <div className="px-5 py-8 text-center text-sm text-gray-400">Loading...</div>
              ) : recentDocs.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-gray-400">No recent documents</div>
              ) : (
                recentDocs.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => router.push(`/app/docs/${doc.id}`)}
                    className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <FileText className={`w-4 h-4 ${DOC_TYPE_COLORS[doc.type] || "text-gray-500"}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{doc.title}</p>
                        <p className="text-xs text-gray-400 capitalize">{doc.type}</p>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                      {formatTimeAgo(doc.updatedAt)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* App Launcher */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">All Apps</h2>
          </div>
          <div className="p-5 grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-4">
            {APP_MODULES.map((mod) => {
              const Icon = mod.icon;
              return (
                <button
                  key={mod.id}
                  onClick={() => router.push(mod.href)}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-gray-50 transition-colors group"
                >
                  <div className={`w-10 h-10 rounded-xl ${mod.color} flex items-center justify-center group-hover:scale-105 transition-transform`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xs text-gray-600 font-medium">{mod.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
