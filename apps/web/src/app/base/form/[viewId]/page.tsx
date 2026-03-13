"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { FormPreview, type FormViewConfig } from "@/components/base/base-form-view";
import type { BaseField } from "@/lib/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function PublicFormPage() {
  const params = useParams();
  const viewId = params.viewId as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tableName, setTableName] = useState("");
  const [fields, setFields] = useState<BaseField[]>([]);
  const [viewConfig, setViewConfig] = useState<FormViewConfig>({});

  useEffect(() => {
    async function loadForm() {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE_URL}/api/base/forms/${viewId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError("Form not found");
          } else if (res.status === 403) {
            setError("This form is not publicly accessible");
          } else {
            setError("Failed to load form");
          }
          return;
        }
        const { data } = await res.json();
        setTableName(data.tableName);
        setFields(data.fields);
        setViewConfig(data.config || {});
      } catch {
        setError("Failed to load form");
      } finally {
        setLoading(false);
      }
    }
    loadForm();
  }, [viewId]);

  const handleSubmit = async (formData: Record<string, unknown>) => {
    const res = await fetch(`${API_BASE_URL}/api/base/forms/${viewId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: formData }),
    });
    if (!res.ok) {
      throw new Error("Submission failed");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-sm text-gray-500">Loading form...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4">
      <div className="max-w-xl mx-auto">
        <FormPreview
          tableName={tableName}
          fields={fields}
          viewConfig={viewConfig}
          onSubmit={handleSubmit}
          standalone
        />
        <p className="text-center text-xs text-gray-400 mt-6">
          Powered by OpenLark Base
        </p>
      </div>
    </div>
  );
}
