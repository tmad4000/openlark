"use client";

import React, { useState, useEffect, useCallback } from "react";
import { api, type BaseField, type BaseRecord } from "@/lib/api";
import {
  Type,
  Hash,
  Calendar,
  CheckSquare,
  List,
  Link as LinkIcon,
  AtSign,
  Settings,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const fieldTypeIcons: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  text: Type,
  number: Hash,
  date: Calendar,
  checkbox: CheckSquare,
  select: List,
  url: LinkIcon,
  email: AtSign,
};

export interface FormViewConfig {
  requiredFields?: string[];
  description?: string;
  submitLabel?: string;
  successMessage?: string;
  isPublic?: boolean;
}

interface BaseFormViewProps {
  tableId: string;
  tableName: string;
  viewId: string;
  viewConfig: FormViewConfig;
  onViewConfigChange?: (config: FormViewConfig) => void;
}

export function BaseFormView({
  tableId,
  tableName,
  viewId,
  viewConfig,
  onViewConfigChange,
}: BaseFormViewProps) {
  const [fields, setFields] = useState<BaseField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [submissions, setSubmissions] = useState<BaseRecord[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);

  // Settings state
  const [description, setDescription] = useState(viewConfig.description || "");
  const [submitLabel, setSubmitLabel] = useState(
    viewConfig.submitLabel || "Submit"
  );
  const [successMessage, setSuccessMessage] = useState(
    viewConfig.successMessage || "Thank you! Your response has been recorded."
  );
  const [requiredFields, setRequiredFields] = useState<Set<string>>(
    new Set(viewConfig.requiredFields || [])
  );
  const [isPublic, setIsPublic] = useState(viewConfig.isPublic ?? false);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [fieldsRes, recordsRes] = await Promise.all([
          api.getTableFields(tableId),
          api.getTableRecords(tableId, { limit: 10 }),
        ]);
        setFields(fieldsRes.fields);
        setSubmissions(recordsRes.records);
      } catch {
        // silently handle
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tableId]);

  // Sync config changes back
  useEffect(() => {
    setDescription(viewConfig.description || "");
    setSubmitLabel(viewConfig.submitLabel || "Submit");
    setSuccessMessage(
      viewConfig.successMessage || "Thank you! Your response has been recorded."
    );
    setRequiredFields(new Set(viewConfig.requiredFields || []));
    setIsPublic(viewConfig.isPublic ?? false);
  }, [viewConfig]);

  const handleSaveSettings = useCallback(() => {
    const newConfig: FormViewConfig = {
      requiredFields: Array.from(requiredFields),
      description,
      submitLabel,
      successMessage,
      isPublic,
    };
    onViewConfigChange?.(newConfig);
    setShowSettings(false);
  }, [
    requiredFields,
    description,
    submitLabel,
    successMessage,
    isPublic,
    onViewConfigChange,
  ]);

  const toggleRequired = useCallback((fieldId: string) => {
    setRequiredFields((prev) => {
      const next = new Set(prev);
      if (next.has(fieldId)) {
        next.delete(fieldId);
      } else {
        next.add(fieldId);
      }
      return next;
    });
  }, []);

  const formUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/base/form/${viewId}`
      : "";

  const handleCopyLink = useCallback(() => {
    if (formUrl) {
      navigator.clipboard.writeText(formUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  }, [formUrl]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-gray-500">Loading form...</div>
      </div>
    );
  }

  // Settings panel
  if (showSettings) {
    return (
      <div className="flex-1 overflow-auto p-6 max-w-2xl mx-auto">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Form Settings
            </h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSettings(false)}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveSettings}>
                Save Settings
              </Button>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Form Description
            </label>
            <textarea
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 resize-none"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description for your form..."
            />
          </div>

          {/* Submit button label */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Submit Button Label
            </label>
            <Input
              value={submitLabel}
              onChange={(e) => setSubmitLabel(e.target.value)}
              placeholder="Submit"
            />
          </div>

          {/* Success message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Success Message
            </label>
            <textarea
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 resize-none"
              rows={2}
              value={successMessage}
              onChange={(e) => setSuccessMessage(e.target.value)}
              placeholder="Thank you! Your response has been recorded."
            />
          </div>

          {/* Public access */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="rounded border-gray-300"
              />
              Allow access without login (public form)
            </label>
            <p className="text-xs text-gray-500 mt-1 ml-6">
              When enabled, anyone with the link can submit responses
            </p>
          </div>

          {/* Required fields */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Required Fields
            </label>
            <div className="space-y-2">
              {fields.map((field) => {
                const Icon = fieldTypeIcons[field.type] || Type;
                return (
                  <label
                    key={field.id}
                    className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                  >
                    <input
                      type="checkbox"
                      checked={requiredFields.has(field.id)}
                      onChange={() => toggleRequired(field.id)}
                      className="rounded border-gray-300"
                    />
                    <Icon className="w-3.5 h-3.5 text-gray-400" />
                    {field.name}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main form view - split into preview and settings
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowSettings(true)}
        >
          <Settings className="w-3.5 h-3.5 mr-1" />
          Settings
        </Button>
        <Button variant="outline" size="sm" onClick={handleCopyLink}>
          {copiedLink ? (
            <Check className="w-3.5 h-3.5 mr-1" />
          ) : (
            <Copy className="w-3.5 h-3.5 mr-1" />
          )}
          {copiedLink ? "Copied!" : "Copy Link"}
        </Button>
        <a
          href={`/base/form/${viewId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open Form
        </a>
        <div className="ml-auto text-xs text-gray-500">
          {submissions.length} response{submissions.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Form preview */}
      <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-xl mx-auto">
          <FormPreview
            tableName={tableName}
            fields={fields}
            viewConfig={viewConfig}
            onSubmit={async (data) => {
              await api.createRecord(tableId, data);
              const recordsRes = await api.getTableRecords(tableId, {
                limit: 10,
              });
              setSubmissions(recordsRes.records);
            }}
          />
        </div>
      </div>
    </div>
  );
}

// Reusable form preview/submission component
export function FormPreview({
  tableName,
  fields,
  viewConfig,
  onSubmit,
  standalone = false,
}: {
  tableName: string;
  fields: BaseField[];
  viewConfig: FormViewConfig;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  standalone?: boolean;
}) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const requiredFields = new Set(viewConfig.requiredFields || []);

  const handleChange = useCallback((fieldId: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Validate required fields
      const newErrors: Record<string, string> = {};
      for (const fieldId of requiredFields) {
        const val = formData[fieldId];
        if (val === undefined || val === null || val === "") {
          const field = fields.find((f) => f.id === fieldId);
          newErrors[fieldId] = `${field?.name || "This field"} is required`;
        }
      }

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }

      try {
        setSubmitting(true);
        await onSubmit(formData);
        setSubmitted(true);
      } catch {
        // silently handle
      } finally {
        setSubmitting(false);
      }
    },
    [formData, requiredFields, fields, onSubmit]
  );

  const handleReset = useCallback(() => {
    setFormData({});
    setSubmitted(false);
    setErrors({});
  }, []);

  if (submitted) {
    return (
      <div
        className={cn(
          "bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center",
          standalone && "shadow-md"
        )}
      >
        <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
        </div>
        <p className="text-gray-900 dark:text-gray-100 font-medium mb-2">
          {viewConfig.successMessage ||
            "Thank you! Your response has been recorded."}
        </p>
        <Button variant="outline" size="sm" onClick={handleReset} className="mt-4">
          Submit another response
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700",
        standalone && "shadow-md"
      )}
    >
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {tableName}
        </h2>
        {viewConfig.description && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {viewConfig.description}
          </p>
        )}
      </div>

      {/* Fields */}
      <div className="px-6 py-4 space-y-5">
        {fields.map((field) => {
          const isRequired = requiredFields.has(field.id);
          const error = errors[field.id];
          const Icon = fieldTypeIcons[field.type] || Type;

          return (
            <div key={field.id}>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                <Icon className="w-3.5 h-3.5 text-gray-400" />
                {field.name}
                {isRequired && (
                  <span className="text-red-500 text-xs">*</span>
                )}
              </label>
              <FormFieldInput
                field={field}
                value={formData[field.id]}
                onChange={(val) => handleChange(field.id, val)}
                error={error}
              />
              {error && (
                <p className="text-xs text-red-500 mt-1">{error}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Submit */}
      <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Submitting..." : viewConfig.submitLabel || "Submit"}
        </Button>
      </div>
    </form>
  );
}

function FormFieldInput({
  field,
  value,
  onChange,
  error,
}: {
  field: BaseField;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
}) {
  const config = (field.config as Record<string, unknown>) || {};

  switch (field.type) {
    case "checkbox":
      return (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Yes
          </span>
        </label>
      );

    case "select": {
      const options = (config.options as string[]) || [];
      return (
        <select
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value || null)}
          className={cn(
            "w-full border rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100",
            error
              ? "border-red-300 dark:border-red-700"
              : "border-gray-300 dark:border-gray-600"
          )}
        >
          <option value="">Select...</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    case "number":
      return (
        <Input
          type="number"
          value={value !== undefined && value !== null ? String(value) : ""}
          onChange={(e) =>
            onChange(e.target.value ? Number(e.target.value) : null)
          }
          className={cn(
            error && "border-red-300 dark:border-red-700"
          )}
          placeholder={`Enter ${field.name.toLowerCase()}...`}
        />
      );

    case "date":
      return (
        <Input
          type="date"
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value || null)}
          className={cn(
            error && "border-red-300 dark:border-red-700"
          )}
        />
      );

    case "url":
      return (
        <Input
          type="url"
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            error && "border-red-300 dark:border-red-700"
          )}
          placeholder="https://..."
        />
      );

    case "email":
      return (
        <Input
          type="email"
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            error && "border-red-300 dark:border-red-700"
          )}
          placeholder="email@example.com"
        />
      );

    default:
      return (
        <Input
          type="text"
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            error && "border-red-300 dark:border-red-700"
          )}
          placeholder={`Enter ${field.name.toLowerCase()}...`}
        />
      );
  }
}
