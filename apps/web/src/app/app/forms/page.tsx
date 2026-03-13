"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  ClipboardList,
  MoreHorizontal,
  Trash2,
  ExternalLink,
  BarChart3,
} from "lucide-react";

interface FormData {
  id: string;
  title: string;
  description: string | null;
  settings: Record<string, unknown>;
  createdAt: string;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

export default function FormsListPage() {
  const router = useRouter();
  const [forms, setForms] = useState<FormData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const fetchForms = useCallback(async () => {
    const token = getCookie("session_token");
    if (!token) return;

    try {
      const res = await fetch("/api/forms", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setForms(data.forms || []);
      }
    } catch (err) {
      console.error("Failed to fetch forms:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchForms();
  }, [fetchForms]);

  const handleCreate = async () => {
    const token = getCookie("session_token");
    if (!token) return;

    try {
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Untitled Form" }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/app/forms/${data.form.id}/edit`);
      }
    } catch (err) {
      console.error("Failed to create form:", err);
    }
  };

  const handleDelete = async (id: string) => {
    const token = getCookie("session_token");
    if (!token) return;

    try {
      const res = await fetch(`/api/forms/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok || res.status === 204) {
        setForms((prev) => prev.filter((f) => f.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete form:", err);
    }
    setMenuOpenId(null);
  };

  const copyShareLink = (id: string) => {
    const url = `${window.location.origin}/form/${id}`;
    navigator.clipboard.writeText(url);
    setMenuOpenId(null);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-500">Loading forms...</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Forms</h1>
            <p className="text-sm text-gray-500 mt-1">
              Create and manage forms to collect responses
            </p>
          </div>
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            New Form
          </button>
        </div>

        {/* Forms Grid */}
        {forms.length === 0 ? (
          <div className="text-center py-16">
            <ClipboardList className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No forms yet
            </h3>
            <p className="text-gray-500 mb-6">
              Create your first form to start collecting responses.
            </p>
            <button
              onClick={handleCreate}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
            >
              <Plus className="w-4 h-4" />
              Create Form
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {forms.map((form) => (
              <div
                key={form.id}
                className="bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow cursor-pointer relative"
              >
                <div
                  className="p-5"
                  onClick={() => router.push(`/app/forms/${form.id}/edit`)}
                >
                  <h3 className="font-semibold text-gray-900 truncate">
                    {form.title}
                  </h3>
                  {form.description && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                      {form.description}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-3">
                    Created {new Date(form.createdAt).toLocaleDateString()}
                  </p>
                </div>

                {/* Actions menu */}
                <div className="absolute top-3 right-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenId(menuOpenId === form.id ? null : form.id);
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>

                  {menuOpenId === form.id && (
                    <div className="absolute right-0 top-9 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/app/forms/${form.id}/edit`);
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <ClipboardList className="w-4 h-4" />
                        Edit Form
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/app/forms/${form.id}/edit?tab=responses`);
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <BarChart3 className="w-4 h-4" />
                        View Responses
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyShareLink(form.id);
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Copy Share Link
                      </button>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(form.id);
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
