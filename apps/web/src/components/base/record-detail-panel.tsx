"use client";

import { useState, useRef, useEffect } from "react";
import { type BaseField, type BaseRecord } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  X,
  Type,
  Hash,
  Calendar,
  CheckSquare,
  List,
  Link as LinkIcon,
  AtSign,
  Check,
} from "lucide-react";

const fieldTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  text: Type,
  number: Hash,
  date: Calendar,
  checkbox: CheckSquare,
  select: List,
  url: LinkIcon,
  email: AtSign,
};

interface RecordDetailPanelProps {
  record: BaseRecord;
  fields: BaseField[];
  onClose: () => void;
  onUpdate: (recordId: string, fieldId: string, value: unknown) => void;
}

export function RecordDetailPanel({
  record,
  fields,
  onClose,
  onUpdate,
}: RecordDetailPanelProps) {
  const data = (record.data as Record<string, unknown>) || {};

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-xl z-40 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Record Details
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {fields.map((field) => {
          const IconComp = fieldTypeIcons[field.type] || Type;
          return (
            <div key={field.id} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <IconComp className="w-3.5 h-3.5 text-gray-400" />
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {field.name}
                </label>
              </div>
              <DetailFieldEditor
                field={field}
                value={data[field.id]}
                onSave={(value) => onUpdate(record.id, field.id, value)}
              />
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400">
        Created {new Date(record.createdAt).toLocaleString()}
      </div>
    </div>
  );
}

function DetailFieldEditor({
  field,
  value,
  onSave,
}: {
  field: BaseField;
  value: unknown;
  onSave: (value: unknown) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const startEdit = () => {
    setEditValue(value != null ? String(value) : "");
    setEditing(true);
  };

  const handleSave = () => {
    setEditing(false);
    let parsed: unknown = editValue;
    if (field.type === "number") {
      parsed = editValue === "" ? null : Number(editValue);
    }
    onSave(parsed);
  };

  if (field.type === "checkbox") {
    return (
      <div className="flex items-center">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onSave(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300"
        />
        <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
          {value ? "Checked" : "Unchecked"}
        </span>
      </div>
    );
  }

  if (field.type === "select") {
    const options = ((field.config as { options?: string[] })?.options) || [];
    return (
      <select
        value={value != null ? String(value) : ""}
        onChange={(e) => onSave(e.target.value)}
        className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
      >
        <option value="">-- Select --</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-full px-2 py-1.5 text-sm border border-blue-500 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none"
      />
    );
  }

  const displayValue = value != null && value !== "" ? String(value) : "";

  return (
    <div
      onClick={startEdit}
      className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded cursor-pointer hover:border-gray-300 dark:hover:border-gray-600 min-h-[34px] flex items-center"
    >
      {field.type === "url" && displayValue ? (
        <a
          href={displayValue}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline truncate"
          onClick={(e) => e.stopPropagation()}
        >
          {displayValue}
        </a>
      ) : (
        <span
          className={cn(
            "truncate",
            displayValue
              ? "text-gray-900 dark:text-gray-100"
              : "text-gray-400"
          )}
        >
          {displayValue || "Empty"}
        </span>
      )}
    </div>
  );
}
