"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { api, type FormInfo } from "@/lib/api";
import {
  Plus,
  FileText,
  Trash2,
  Loader2,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function FormsPage() {
  const router = useRouter();
  const [forms, setForms] = useState<FormInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const loadForms = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api.getForms();
      setForms(result.forms);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadForms();
  }, [loadForms]);

  const handleCreate = useCallback(async () => {
    try {
      const result = await api.createForm({
        title: "Untitled Form",
        questions: [],
      });
      router.push(`/forms/${result.form.id}/edit`);
    } catch {
      // silently handle
    }
  }, [router]);

  const handleDelete = useCallback(
    async (e: React.MouseEvent, formId: string) => {
      e.stopPropagation();
      try {
        await api.deleteForm(formId);
        setForms((prev) => prev.filter((f) => f.id !== formId));
      } catch {
        // silently handle
      }
    },
    []
  );

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Forms
        </h2>
        <Button variant="ghost" size="icon" onClick={handleCreate}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        {forms.map((form) => (
          <div
            key={form.id}
            onClick={() => router.push(`/forms/${form.id}/edit`)}
            className="flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
          >
            <FileText className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">
              {form.title}
            </span>
            <button
              onClick={(e) => handleDelete(e, form.id)}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-opacity"
            >
              <Trash2 className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <AppShell sidebar={sidebar}>
      <div className="flex-1 flex items-center justify-center">
        {loading ? (
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        ) : forms.length === 0 ? (
          <div className="text-center">
            <ClipboardList className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
              No forms yet
            </p>
            <Button onClick={handleCreate}>
              <Plus className="w-4 h-4 mr-1" />
              Create Form
            </Button>
          </div>
        ) : (
          <div className="text-center text-gray-400 text-sm">
            <ClipboardList className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
            Select a form to edit
          </div>
        )}
      </div>
    </AppShell>
  );
}
