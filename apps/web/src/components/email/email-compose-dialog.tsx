"use client";

import { useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { X, Send, Loader2 } from "lucide-react";

interface ComposeDialogProps {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
  replyTo?: { to: string; subject: string } | null;
  forwardBody?: string | null;
}

export function EmailComposeDialog({
  open,
  onClose,
  onSent,
  replyTo,
  forwardBody,
}: ComposeDialogProps) {
  const [to, setTo] = useState(replyTo?.to || "");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(
    replyTo ? `Re: ${replyTo.subject}` : ""
  );
  const [body, setBody] = useState(forwardBody || "");
  const [sending, setSending] = useState(false);
  const [showCc, setShowCc] = useState(false);

  const handleSend = useCallback(async () => {
    if (!to.trim() || !subject.trim()) return;
    setSending(true);
    try {
      const toAddresses = to
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
      const ccAddresses = cc
        ? cc
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean)
        : undefined;
      await api.sendEmail({
        to: toAddresses,
        cc: ccAddresses,
        subject,
        body_html: `<div>${body.replace(/\n/g, "<br/>")}</div>`,
      });
      onSent();
      onClose();
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  }, [to, cc, subject, body, onSent, onClose]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>New Email</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Label className="w-12 text-right text-sm text-gray-500">To</Label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              className="flex-1"
            />
            {!showCc && (
              <button
                onClick={() => setShowCc(true)}
                className="text-xs text-blue-600 hover:underline"
              >
                Cc
              </button>
            )}
          </div>
          {showCc && (
            <div className="flex items-center gap-2">
              <Label className="w-12 text-right text-sm text-gray-500">
                Cc
              </Label>
              <Input
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="cc@example.com"
                className="flex-1"
              />
              <button
                onClick={() => {
                  setShowCc(false);
                  setCc("");
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Label className="w-12 text-right text-sm text-gray-500">
              Subject
            </Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
              className="flex-1"
            />
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your email..."
            className="w-full min-h-[200px] p-3 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} size="sm">
              Discard
            </Button>
            <Button
              onClick={handleSend}
              disabled={sending || !to.trim() || !subject.trim()}
              size="sm"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Send
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
