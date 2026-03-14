"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import {
  api,
  type Chat,
  type CalendarEvent,
  type Task,
  type Document,
} from "@/lib/api";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  Calendar,
  CheckSquare,
  FileText,
  Plus,
  Loader2,
  LayoutGrid,
  Video,
  Database,
  BookOpen,
  ClipboardCheck,
  Target,
  Clock,
  Mail,
  BarChart3,
  Zap,
  Users,
  Shield,
} from "lucide-react";

// ─── Module Launcher Grid ───
const MODULES = [
  { icon: MessageSquare, label: "Messenger", href: "/messenger", color: "text-blue-600" },
  { icon: Calendar, label: "Calendar", href: "/calendar", color: "text-orange-500" },
  { icon: FileText, label: "Docs", href: "/docs", color: "text-indigo-600" },
  { icon: BookOpen, label: "Wiki", href: "/wiki", color: "text-teal-600" },
  { icon: Database, label: "Base", href: "/base", color: "text-purple-600" },
  { icon: CheckSquare, label: "Tasks", href: "/tasks", color: "text-green-600" },
  { icon: ClipboardCheck, label: "Approvals", href: "/approvals", color: "text-pink-600" },
  { icon: Target, label: "OKR", href: "/okr", color: "text-amber-600" },
  { icon: Clock, label: "Attendance", href: "/workplace/attendance", color: "text-cyan-600" },
  { icon: Mail, label: "Email", href: "/email", color: "text-red-500" },
  { icon: Video, label: "Meetings", href: "/meeting", color: "text-violet-600" },
  { icon: BarChart3, label: "Forms", href: "/forms", color: "text-emerald-600" },
] as const;

// ─── Quick Actions ───
function QuickActions() {
  const router = useRouter();
  const actions = [
    { icon: MessageSquare, label: "New Chat", action: () => router.push("/messenger") },
    { icon: FileText, label: "New Doc", action: () => router.push("/docs") },
    { icon: Calendar, label: "New Event", action: () => router.push("/calendar") },
    { icon: CheckSquare, label: "New Task", action: () => router.push("/tasks") },
  ];

  return (
    <div className="flex items-center gap-2">
      {actions.map((a) => (
        <Button
          key={a.label}
          variant="outline"
          size="sm"
          onClick={a.action}
          className="gap-1.5"
        >
          <a.icon className="w-3.5 h-3.5" />
          {a.label}
        </Button>
      ))}
    </div>
  );
}

// ─── Recent Chats Widget ───
function RecentChatsWidget() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const result = await api.getChats();
        setChats(result.chats.slice(0, 5));
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <WidgetCard title="Recent Chats" icon={MessageSquare} href="/messenger">
      {loading ? (
        <WidgetLoader />
      ) : chats.length === 0 ? (
        <WidgetEmpty message="No chats yet" />
      ) : (
        <div className="space-y-1">
          {chats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => router.push("/messenger")}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
            >
              <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xs font-medium text-blue-700 dark:text-blue-300 shrink-0">
                {chat.type === "group" ? <Users className="w-3.5 h-3.5" /> : chat.name?.[0]?.toUpperCase() || "?"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{chat.name}</p>
                <p className="text-xs text-gray-400 truncate">
                  {chat.type === "group" ? "Group" : "Direct Message"}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}

// ─── Upcoming Events Widget ───
function UpcomingEventsWidget() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const now = new Date();
        const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const result = await api.getEvents({
          startDate: now.toISOString(),
          endDate: weekLater.toISOString(),
        });
        setEvents(result.events.slice(0, 5));
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <WidgetCard title="Upcoming Events" icon={Calendar} href="/calendar">
      {loading ? (
        <WidgetLoader />
      ) : events.length === 0 ? (
        <WidgetEmpty message="No upcoming events" />
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <button
              key={event.id}
              onClick={() => router.push("/calendar")}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{event.title}</p>
              <p className="text-xs text-gray-400">
                {new Date(event.startTime).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}{" "}
                {new Date(event.startTime).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </button>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}

// ─── My Tasks Widget ───
function MyTasksWidget() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const result = await api.getTasks({ status: "todo" });
        setTasks(result.tasks.slice(0, 5));
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const priorityColors: Record<string, string> = {
    urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
    low: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    none: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };

  return (
    <WidgetCard title="My Tasks" icon={CheckSquare} href="/tasks">
      {loading ? (
        <WidgetLoader />
      ) : tasks.length === 0 ? (
        <WidgetEmpty message="All caught up!" />
      ) : (
        <div className="space-y-1">
          {tasks.map((task) => (
            <button
              key={task.id}
              onClick={() => router.push("/tasks")}
              className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="w-4 h-4 rounded border-2 border-gray-300 dark:border-gray-600 shrink-0" />
              <span className="text-sm text-gray-900 dark:text-gray-100 truncate flex-1">
                {task.title}
              </span>
              {task.priority !== "none" && (
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", priorityColors[task.priority])}>
                  {task.priority}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}

// ─── Recent Docs Widget ───
function RecentDocsWidget() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const result = await api.getDocuments({ limit: 5 });
        setDocs(result.documents);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const typeIcons: Record<string, string> = {
    doc: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    sheet: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
    slide: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
    mindnote: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
    board: "bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400",
  };

  return (
    <WidgetCard title="Recent Docs" icon={FileText} href="/docs">
      {loading ? (
        <WidgetLoader />
      ) : docs.length === 0 ? (
        <WidgetEmpty message="No documents yet" />
      ) : (
        <div className="space-y-1">
          {docs.map((doc) => (
            <button
              key={doc.id}
              onClick={() => router.push(`/docs/${doc.id}`)}
              className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <div className={cn("w-7 h-7 rounded flex items-center justify-center text-xs font-bold shrink-0", typeIcons[doc.type] || typeIcons.doc)}>
                {doc.type[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{doc.title}</p>
                <p className="text-xs text-gray-400">
                  {doc.lastEditedAt
                    ? `Edited ${new Date(doc.lastEditedAt).toLocaleDateString()}`
                    : `Created ${new Date(doc.createdAt).toLocaleDateString()}`}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}

// ─── Shared Widget Components ───
function WidgetCard({
  title,
  icon: Icon,
  href,
  children,
}: {
  title: string;
  icon: typeof MessageSquare;
  href: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</h3>
        </div>
        <button
          onClick={() => router.push(href)}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          View all
        </button>
      </div>
      <div className="p-3 flex-1">{children}</div>
    </div>
  );
}

function WidgetLoader() {
  return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
    </div>
  );
}

function WidgetEmpty({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-8">
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}

// ─── Main Workplace Page ───
export default function WorkplacePage() {
  const { user } = useAuth();
  const router = useRouter();

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="px-8 pt-8 pb-6">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {greeting}, {user?.displayName || "there"}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
          <div className="mt-4">
            <QuickActions />
          </div>
        </div>

        <div className="px-8 pb-8 space-y-6">
          {/* Widgets Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RecentChatsWidget />
            <UpcomingEventsWidget />
            <MyTasksWidget />
            <RecentDocsWidget />
          </div>

          {/* App Launcher */}
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-gray-500" />
              All Apps
            </h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {MODULES.map((mod) => (
                <button
                  key={mod.label}
                  onClick={() => router.push(mod.href)}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <mod.icon className={cn("w-6 h-6", mod.color)} />
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{mod.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
