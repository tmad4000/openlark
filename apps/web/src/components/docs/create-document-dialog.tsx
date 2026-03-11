"use client";

import { useState, useEffect } from "react";
import { api, type Document } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, FileSpreadsheet, Presentation, Brain, Layout } from "lucide-react";

interface CreateDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDocumentCreated?: (document: Document) => void;
}

type DocumentType = "doc" | "sheet" | "slide" | "mindnote" | "board";

const documentTypes: { type: DocumentType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: "doc", label: "Document", icon: FileText },
  { type: "sheet", label: "Spreadsheet", icon: FileSpreadsheet },
  { type: "slide", label: "Presentation", icon: Presentation },
  { type: "mindnote", label: "Mind Map", icon: Brain },
  { type: "board", label: "Whiteboard", icon: Layout },
];

export function CreateDocumentDialog({
  open,
  onOpenChange,
  onDocumentCreated,
}: CreateDocumentDialogProps) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<DocumentType>("doc");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setTitle("");
      setType("doc");
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await api.createDocument({
        title: title.trim() || "Untitled",
        type,
      });
      onDocumentCreated?.(response.document);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create document");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Document</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Untitled"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <div className="grid grid-cols-3 gap-2">
              {documentTypes.map(({ type: docType, label, icon: Icon }) => (
                <button
                  key={docType}
                  type="button"
                  onClick={() => setType(docType)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors ${
                    type === docType
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <Icon className={`h-6 w-6 ${
                    type === docType
                      ? "text-blue-500"
                      : "text-gray-400 dark:text-gray-500"
                  }`} />
                  <span className={`text-xs ${
                    type === docType
                      ? "text-blue-700 dark:text-blue-300"
                      : "text-gray-600 dark:text-gray-400"
                  }`}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
