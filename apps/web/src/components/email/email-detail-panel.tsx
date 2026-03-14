"use client";

import { useCallback } from "react";
import { type EmailMessage, api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  X,
  Reply,
  Forward,
  Paperclip,
  Star,
  Archive,
  Trash2,
} from "lucide-react";

interface EmailDetailPanelProps {
  email: EmailMessage;
  onClose: () => void;
  onReply: () => void;
  onForward: () => void;
  onUpdate: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EmailDetailPanel({
  email,
  onClose,
  onReply,
  onForward,
  onUpdate,
}: EmailDetailPanelProps) {
  const handleFlag = useCallback(async () => {
    try {
      await api.updateEmailMessage(email.id, { isFlagged: !email.isFlagged });
      onUpdate();
    } catch {
      // ignore
    }
  }, [email, onUpdate]);

  const handleArchive = useCallback(async () => {
    try {
      await api.updateEmailMessage(email.id, { folder: "archive" });
      onUpdate();
      onClose();
    } catch {
      // ignore
    }
  }, [email.id, onUpdate, onClose]);

  const handleDelete = useCallback(async () => {
    try {
      await api.deleteEmailMessage(email.id);
      onUpdate();
      onClose();
    } catch {
      // ignore
    }
  }, [email.id, onUpdate, onClose]);

  const dateStr = email.sentAt
    ? new Date(email.sentAt).toLocaleString()
    : new Date(email.createdAt).toLocaleString();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          Email
        </span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-200 dark:border-gray-800">
        <Button variant="ghost" size="sm" onClick={onReply}>
          <Reply className="w-4 h-4 mr-1" />
          Reply
        </Button>
        <Button variant="ghost" size="sm" onClick={onForward}>
          <Forward className="w-4 h-4 mr-1" />
          Forward
        </Button>
        <div className="flex-1" />
        <button
          onClick={handleFlag}
          className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 ${
            email.isFlagged
              ? "text-yellow-500"
              : "text-gray-400 hover:text-gray-600"
          }`}
        >
          <Star
            className="w-4 h-4"
            fill={email.isFlagged ? "currentColor" : "none"}
          />
        </button>
        <button
          onClick={handleArchive}
          className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <Archive className="w-4 h-4" />
        </button>
        <button
          onClick={handleDelete}
          className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Email content */}
      <div className="flex-1 overflow-y-auto p-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
          {email.subject}
        </h2>

        <div className="space-y-1 mb-4 text-sm">
          <div className="flex gap-2">
            <span className="text-gray-500 w-12">From</span>
            <span className="text-gray-900 dark:text-gray-100">
              {email.fromAddress}
            </span>
          </div>
          <div className="flex gap-2">
            <span className="text-gray-500 w-12">To</span>
            <span className="text-gray-900 dark:text-gray-100">
              {email.toAddresses.join(", ")}
            </span>
          </div>
          {email.ccAddresses && email.ccAddresses.length > 0 && (
            <div className="flex gap-2">
              <span className="text-gray-500 w-12">Cc</span>
              <span className="text-gray-900 dark:text-gray-100">
                {email.ccAddresses.join(", ")}
              </span>
            </div>
          )}
          <div className="flex gap-2">
            <span className="text-gray-500 w-12">Date</span>
            <span className="text-gray-500">{dateStr}</span>
          </div>
        </div>

        {/* Attachments */}
        {email.attachments && email.attachments.length > 0 && (
          <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-md">
            <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
              <Paperclip className="w-3 h-3" />
              {email.attachments.length} attachment
              {email.attachments.length > 1 ? "s" : ""}
            </div>
            <div className="space-y-1">
              {email.attachments.map((att, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  <Paperclip className="w-3 h-3" />
                  {att.name}
                  <span className="text-xs text-gray-400">
                    ({formatFileSize(att.size)})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* HTML body */}
        <div
          className="prose dark:prose-invert max-w-none text-sm"
          dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
        />
      </div>
    </div>
  );
}
