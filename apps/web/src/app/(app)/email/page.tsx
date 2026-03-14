"use client";

import { useState, useEffect, useCallback } from "react";
import { api, type EmailMessage, type EmailFolder } from "@/lib/api";
import { AppShell } from "@/components/layout/app-shell";
import { EmailDetailPanel } from "@/components/email/email-detail-panel";
import { EmailComposeDialog } from "@/components/email/email-compose-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Mail,
  Plus,
  Inbox,
  Send,
  FileEdit,
  Archive,
  Trash2,
  Loader2,
  Star,
  Paperclip,
} from "lucide-react";

const FOLDERS: { id: EmailFolder; label: string; icon: React.ElementType }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "sent", label: "Sent", icon: Send },
  { id: "drafts", label: "Drafts", icon: FileEdit },
  { id: "archive", label: "Archive", icon: Archive },
  { id: "trash", label: "Trash", icon: Trash2 },
];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function senderName(address: string): string {
  const match = address.match(/^(.+?)@/);
  return match ? match[1] : address;
}

export default function EmailPage() {
  const [folder, setFolder] = useState<EmailFolder>("inbox");
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [composeReplyTo, setComposeReplyTo] = useState<{
    to: string;
    subject: string;
  } | null>(null);
  const [composeForwardBody, setComposeForwardBody] = useState<string | null>(
    null
  );

  const loadMessages = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getEmailMessages(folder);
      setMessages(res.messages);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [folder]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const handleSelectEmail = useCallback(
    async (email: EmailMessage) => {
      setSelectedEmail(email);
      if (!email.isRead) {
        try {
          await api.updateEmailMessage(email.id, { isRead: true });
          loadMessages();
        } catch {
          // ignore
        }
      }
    },
    [loadMessages]
  );

  const handleReply = useCallback(() => {
    if (!selectedEmail) return;
    setComposeReplyTo({
      to: selectedEmail.fromAddress,
      subject: selectedEmail.subject,
    });
    setComposeForwardBody(null);
    setShowCompose(true);
  }, [selectedEmail]);

  const handleForward = useCallback(() => {
    if (!selectedEmail) return;
    setComposeReplyTo(null);
    setComposeForwardBody(
      `\n\n---------- Forwarded message ----------\nFrom: ${selectedEmail.fromAddress}\nSubject: ${selectedEmail.subject}\n\n${selectedEmail.bodyText || selectedEmail.bodyHtml}`
    );
    setShowCompose(true);
  }, [selectedEmail]);

  const handleCompose = useCallback(() => {
    setComposeReplyTo(null);
    setComposeForwardBody(null);
    setShowCompose(true);
  }, []);

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2 mb-3">
          <Mail className="w-5 h-5 text-blue-600" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Email
          </h2>
        </div>
        <Button onClick={handleCompose} className="w-full" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Compose
        </Button>
      </div>

      <div className="p-2 space-y-0.5">
        {FOLDERS.map((f) => {
          const Icon = f.icon;
          return (
            <button
              key={f.id}
              onClick={() => {
                setFolder(f.id);
                setSelectedEmail(null);
              }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors",
                folder === f.id
                  ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 font-medium"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              )}
            >
              <Icon className="w-4 h-4" />
              {f.label}
            </button>
          );
        })}
      </div>
      <div className="flex-1" />
    </div>
  );

  const rightPanel = selectedEmail ? (
    <EmailDetailPanel
      email={selectedEmail}
      onClose={() => setSelectedEmail(null)}
      onReply={handleReply}
      onForward={handleForward}
      onUpdate={loadMessages}
    />
  ) : undefined;

  return (
    <AppShell sidebar={sidebar} rightPanel={rightPanel}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {FOLDERS.find((f) => f.id === folder)?.label || "Inbox"}
          </h1>
          <span className="text-xs text-gray-400">
            {messages.length} message{messages.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Email list */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <Mail className="w-10 h-10 mb-2" />
            <p className="text-sm">No emails in {folder}</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
            {messages.map((email) => (
              <button
                key={email.id}
                onClick={() => handleSelectEmail(email)}
                className={cn(
                  "w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors",
                  selectedEmail?.id === email.id &&
                    "bg-blue-50 dark:bg-blue-950/20",
                  !email.isRead && "bg-white dark:bg-gray-900"
                )}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className={cn(
                      "text-sm truncate flex-1",
                      !email.isRead
                        ? "font-semibold text-gray-900 dark:text-gray-100"
                        : "text-gray-600 dark:text-gray-400"
                    )}
                  >
                    {senderName(email.fromAddress)}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {email.isFlagged && (
                      <Star
                        className="w-3 h-3 text-yellow-500"
                        fill="currentColor"
                      />
                    )}
                    {email.attachments && email.attachments.length > 0 && (
                      <Paperclip className="w-3 h-3 text-gray-400" />
                    )}
                    <span className="text-xs text-gray-400">
                      {formatDate(email.sentAt || email.createdAt)}
                    </span>
                  </div>
                </div>
                <div
                  className={cn(
                    "text-sm truncate",
                    !email.isRead
                      ? "text-gray-800 dark:text-gray-200"
                      : "text-gray-500 dark:text-gray-500"
                  )}
                >
                  {email.subject}
                </div>
                {email.bodyText && (
                  <div className="text-xs text-gray-400 truncate mt-0.5">
                    {email.bodyText.slice(0, 100)}
                  </div>
                )}
                {!email.isRead && (
                  <div className="absolute left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Compose dialog */}
      <EmailComposeDialog
        open={showCompose}
        onClose={() => setShowCompose(false)}
        onSent={loadMessages}
        replyTo={composeReplyTo}
        forwardBody={composeForwardBody}
      />
    </AppShell>
  );
}
