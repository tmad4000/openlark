"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Inbox,
  Send,
  FileText,
  Archive,
  Trash2,
  PenSquare,
  Search,
  Star,
  Paperclip,
  Reply,
  Forward,
  MoreHorizontal,
  X,
  ChevronLeft,
  RefreshCw,
  Mail,
  MailOpen,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";

// ─── Types ──────────────────────────────────────────────────────────────────

interface EmailMessage {
  id: string;
  fromAddress: string;
  toAddresses: string[];
  ccAddresses: string[] | null;
  subject: string;
  bodyHtml: string | null;
  bodyText: string | null;
  folder: string;
  status: string;
  isRead: boolean;
  isFlagged: boolean;
  attachments: Array<{ name: string; url: string; size: number; mimeType: string }> | null;
  sentAt: string | null;
  receivedAt: string | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ─── Folders ────────────────────────────────────────────────────────────────

const FOLDERS = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "sent", label: "Sent", icon: Send },
  { id: "drafts", label: "Drafts", icon: FileText },
  { id: "archive", label: "Archive", icon: Archive },
  { id: "trash", label: "Trash", icon: Trash2 },
] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("token") || "";
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const thisYear = d.getFullYear() === now.getFullYear();
  if (thisYear) {
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function senderName(address: string): string {
  const at = address.indexOf("@");
  if (at === -1) return address;
  return address.slice(0, at);
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function EmailPage() {
  const [activeFolder, setActiveFolder] = useState("inbox");
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<"new" | "reply" | "forward">("new");
  const [composePrefill, setComposePrefill] = useState<{
    to?: string;
    subject?: string;
    body?: string;
  }>({});

  // ─── Fetch emails ───────────────────────────────────────────────────────

  const fetchEmails = useCallback(
    async (folder: string, page = 1) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/email/messages?folder=${folder}&page=${page}&limit=50`,
          { headers: { Authorization: `Bearer ${getToken()}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setEmails(data.messages || []);
          setPagination(data.pagination || null);
        }
      } catch {
        // silently handle
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchEmails(activeFolder);
    setSelectedEmail(null);
  }, [activeFolder, fetchEmails]);

  // ─── Select email ───────────────────────────────────────────────────────

  const handleSelectEmail = async (email: EmailMessage) => {
    setSelectedEmail(email);
    if (!email.isRead) {
      await fetch(`/api/email/messages/${email.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ is_read: true }),
      });
      setEmails((prev) =>
        prev.map((e) => (e.id === email.id ? { ...e, isRead: true } : e))
      );
    }
  };

  // ─── Toggle flag ────────────────────────────────────────────────────────

  const handleToggleFlag = async (email: EmailMessage, e: React.MouseEvent) => {
    e.stopPropagation();
    const newVal = !email.isFlagged;
    await fetch(`/api/email/messages/${email.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ is_flagged: newVal }),
    });
    setEmails((prev) =>
      prev.map((e) => (e.id === email.id ? { ...e, isFlagged: newVal } : e))
    );
    if (selectedEmail?.id === email.id) {
      setSelectedEmail({ ...email, isFlagged: newVal });
    }
  };

  // ─── Delete email ───────────────────────────────────────────────────────

  const handleDeleteEmail = async (email: EmailMessage) => {
    await fetch(`/api/email/messages/${email.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    setEmails((prev) => prev.filter((e) => e.id !== email.id));
    if (selectedEmail?.id === email.id) {
      setSelectedEmail(null);
    }
  };

  // ─── Archive email ──────────────────────────────────────────────────────

  const handleArchiveEmail = async (email: EmailMessage) => {
    await fetch(`/api/email/messages/${email.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ folder: "archive" }),
    });
    setEmails((prev) => prev.filter((e) => e.id !== email.id));
    if (selectedEmail?.id === email.id) {
      setSelectedEmail(null);
    }
  };

  // ─── Reply / Forward ───────────────────────────────────────────────────

  const handleReply = (email: EmailMessage) => {
    setComposeMode("reply");
    setComposePrefill({
      to: email.fromAddress,
      subject: email.subject.startsWith("Re:") ? email.subject : `Re: ${email.subject}`,
      body: `\n\n--- Original Message ---\nFrom: ${email.fromAddress}\nDate: ${formatDate(email.sentAt || email.createdAt)}\n\n${email.bodyText || ""}`,
    });
    setComposeOpen(true);
  };

  const handleForward = (email: EmailMessage) => {
    setComposeMode("forward");
    setComposePrefill({
      to: "",
      subject: email.subject.startsWith("Fwd:") ? email.subject : `Fwd: ${email.subject}`,
      body: `\n\n--- Forwarded Message ---\nFrom: ${email.fromAddress}\nTo: ${(email.toAddresses || []).join(", ")}\nDate: ${formatDate(email.sentAt || email.createdAt)}\nSubject: ${email.subject}\n\n${email.bodyText || ""}`,
    });
    setComposeOpen(true);
  };

  // ─── Compose new ───────────────────────────────────────────────────────

  const handleCompose = () => {
    setComposeMode("new");
    setComposePrefill({});
    setComposeOpen(true);
  };

  // ─── Filtered emails ───────────────────────────────────────────────────

  const filteredEmails = searchQuery
    ? emails.filter(
        (e) =>
          e.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.fromAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (e.bodyText || "").toLowerCase().includes(searchQuery.toLowerCase())
      )
    : emails;

  const unreadCount = emails.filter((e) => !e.isRead).length;

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex bg-gray-50">
      {/* ── Column 1: Folder List ──────────────────────────────────────── */}
      <div className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-3">
          <button
            onClick={handleCompose}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm"
          >
            <PenSquare className="w-4 h-4" />
            Compose
          </button>
        </div>

        <nav className="flex-1 px-2 pb-2">
          {FOLDERS.map((folder) => {
            const Icon = folder.icon;
            const isActive = activeFolder === folder.id;
            return (
              <button
                key={folder.id}
                onClick={() => setActiveFolder(folder.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5 ${
                  isActive
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 text-left">{folder.label}</span>
                {folder.id === "inbox" && unreadCount > 0 && (
                  <span className="text-xs bg-blue-600 text-white rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                    {unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Column 2: Email List ───────────────────────────────────────── */}
      <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
        {/* Search bar */}
        <div className="p-3 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search emails..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-500">
              {pagination ? `${pagination.total} email${pagination.total !== 1 ? "s" : ""}` : ""}
            </span>
            <button
              onClick={() => fetchEmails(activeFolder)}
              className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Email list */}
        <div className="flex-1 overflow-y-auto">
          {loading && emails.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
              Loading...
            </div>
          ) : filteredEmails.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm gap-1">
              <Mail className="w-8 h-8 text-gray-300" />
              <span>No emails</span>
            </div>
          ) : (
            filteredEmails.map((email) => (
              <button
                key={email.id}
                onClick={() => handleSelectEmail(email)}
                className={`w-full text-left px-3 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                  selectedEmail?.id === email.id ? "bg-blue-50" : ""
                } ${!email.isRead ? "bg-white" : "bg-gray-50/50"}`}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm truncate ${
                          !email.isRead ? "font-semibold text-gray-900" : "text-gray-700"
                        }`}
                      >
                        {senderName(email.fromAddress)}
                      </span>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {formatDate(email.sentAt || email.createdAt)}
                      </span>
                    </div>
                    <div
                      className={`text-sm truncate mt-0.5 ${
                        !email.isRead ? "font-medium text-gray-900" : "text-gray-600"
                      }`}
                    >
                      {email.subject || "(no subject)"}
                    </div>
                    <div className="text-xs text-gray-400 truncate mt-0.5">
                      {email.bodyText?.slice(0, 80) || ""}
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1 flex-shrink-0">
                    {!email.isRead && (
                      <div className="w-2 h-2 rounded-full bg-blue-600" />
                    )}
                    <button
                      onClick={(e) => handleToggleFlag(email, e)}
                      className="p-0.5 hover:text-yellow-500 transition-colors"
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${
                          email.isFlagged
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-gray-300"
                        }`}
                      />
                    </button>
                    {email.attachments && email.attachments.length > 0 && (
                      <Paperclip className="w-3 h-3 text-gray-400" />
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="p-2 border-t border-gray-200 flex items-center justify-between">
            <button
              disabled={pagination.page <= 1}
              onClick={() => fetchEmails(activeFolder, pagination.page - 1)}
              className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900 disabled:opacity-40"
            >
              Prev
            </button>
            <span className="text-xs text-gray-500">
              {pagination.page} / {pagination.totalPages}
            </span>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => fetchEmails(activeFolder, pagination.page + 1)}
              className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* ── Column 3: Email View ───────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-white">
        {selectedEmail ? (
          <>
            {/* Email view header */}
            <div className="border-b border-gray-200 px-6 py-3 flex items-center justify-between">
              <button
                onClick={() => setSelectedEmail(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors lg:hidden"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleReply(selectedEmail)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Reply className="w-4 h-4" />
                  Reply
                </button>
                <button
                  onClick={() => handleForward(selectedEmail)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Forward className="w-4 h-4" />
                  Forward
                </button>
                <button
                  onClick={() => handleArchiveEmail(selectedEmail)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Archive"
                >
                  <Archive className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteEmail(selectedEmail)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Email content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <h2 className="text-xl font-semibold text-gray-900">
                {selectedEmail.subject || "(no subject)"}
              </h2>

              <div className="mt-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-medium text-blue-700">
                    {senderName(selectedEmail.fromAddress).charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 text-sm">
                      {senderName(selectedEmail.fromAddress)}
                    </span>
                    <span className="text-xs text-gray-400">
                      &lt;{selectedEmail.fromAddress}&gt;
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    To: {(selectedEmail.toAddresses || []).join(", ")}
                    {selectedEmail.ccAddresses && selectedEmail.ccAddresses.length > 0 && (
                      <span> | Cc: {selectedEmail.ccAddresses.join(", ")}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {formatDate(selectedEmail.sentAt || selectedEmail.createdAt)}
                  </div>
                </div>
              </div>

              {/* Attachments */}
              {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedEmail.attachments.map((att, i) => (
                    <a
                      key={i}
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                    >
                      <Paperclip className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-700">{att.name}</span>
                      <span className="text-xs text-gray-400">
                        {formatFileSize(att.size)}
                      </span>
                    </a>
                  ))}
                </div>
              )}

              {/* Email body */}
              <div className="mt-6 border-t border-gray-100 pt-4">
                {selectedEmail.bodyHtml ? (
                  <div
                    className="prose prose-sm max-w-none text-gray-800"
                    dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans">
                    {selectedEmail.bodyText || ""}
                  </pre>
                )}
              </div>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <MailOpen className="w-16 h-16 text-gray-200 mb-3" />
            <p className="text-sm">Select an email to read</p>
          </div>
        )}
      </div>

      {/* ── Compose Dialog ─────────────────────────────────────────────── */}
      <ComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        mode={composeMode}
        prefill={composePrefill}
        onSent={() => {
          setComposeOpen(false);
          if (activeFolder === "sent") {
            fetchEmails("sent");
          }
        }}
      />
    </div>
  );
}

// ─── Compose Dialog ───────────────────────────────────────────────────────────

function ComposeDialog({
  open,
  onOpenChange,
  mode,
  prefill,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "new" | "reply" | "forward";
  prefill: { to?: string; subject?: string; body?: string };
  onSent: () => void;
}) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setTo(prefill.to || "");
      setSubject(prefill.subject || "");
      setBody(prefill.body || "");
      setCc("");
      setShowCc(false);
      setError("");
    }
  }, [open, prefill]);

  const handleSend = async () => {
    if (!to.trim()) {
      setError("Recipient is required");
      return;
    }
    if (!subject.trim()) {
      setError("Subject is required");
      return;
    }

    setSending(true);
    setError("");

    try {
      const toAddresses = to.split(",").map((a) => a.trim()).filter(Boolean);
      const ccAddresses = cc ? cc.split(",").map((a) => a.trim()).filter(Boolean) : undefined;

      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: toAddresses,
          cc: ccAddresses,
          subject: subject.trim(),
          body_html: `<div>${body.replace(/\n/g, "<br/>")}</div>`,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to send email");
        return;
      }

      onSent();
    } catch {
      setError("Network error");
    } finally {
      setSending(false);
    }
  };

  const title =
    mode === "reply" ? "Reply" : mode === "forward" ? "Forward" : "New Email";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed bottom-4 right-4 w-[560px] bg-white rounded-xl shadow-2xl z-50 flex flex-col max-h-[80vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-xl">
            <Dialog.Title className="text-sm font-semibold text-gray-900">
              {title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors">
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Form */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2">
              <label className="text-sm text-gray-500 w-10">To</label>
              <input
                type="text"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="recipient@example.com"
                className="flex-1 text-sm py-1 focus:outline-none"
              />
              {!showCc && (
                <button
                  onClick={() => setShowCc(true)}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  Cc
                </button>
              )}
            </div>

            {showCc && (
              <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2">
                <label className="text-sm text-gray-500 w-10">Cc</label>
                <input
                  type="text"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="cc@example.com"
                  className="flex-1 text-sm py-1 focus:outline-none"
                />
              </div>
            )}

            <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2">
              <label className="text-sm text-gray-500 w-10">Subj</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                className="flex-1 text-sm py-1 focus:outline-none"
              />
            </div>

            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your email..."
              className="w-full px-4 py-3 text-sm focus:outline-none resize-none min-h-[200px]"
            />
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <div>
              {error && (
                <span className="text-xs text-red-600">{error}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Dialog.Close asChild>
                <button className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 transition-colors">
                  Discard
                </button>
              </Dialog.Close>
              <button
                onClick={handleSend}
                disabled={sending}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
