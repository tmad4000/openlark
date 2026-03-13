"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { api, type BaseField, type BaseRecord } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Plus,
  Check,
  X,
  Type,
  Hash,
  Calendar,
  CheckSquare,
  List,
  Link as LinkIcon,
  AtSign,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BaseViewToolbar,
  applyViewConfig,
  type ViewConfig,
} from "./base-view-toolbar";

// Field type icon mapping
const fieldTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  text: Type,
  number: Hash,
  date: Calendar,
  checkbox: CheckSquare,
  select: List,
  url: LinkIcon,
  email: AtSign,
};

// Inline cell editor
function CellEditor({
  field,
  value,
  onSave,
  onCancel,
}: {
  field: BaseField;
  value: unknown;
  onSave: (value: unknown) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [editValue, setEditValue] = useState<string>(
    value != null ? String(value) : ""
  );

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  const handleSave = () => {
    let parsed: unknown = editValue;
    if (field.type === "number") {
      parsed = editValue === "" ? null : Number(editValue);
    } else if (field.type === "checkbox") {
      parsed = editValue === "true";
    }
    onSave(parsed);
  };

  if (field.type === "checkbox") {
    return (
      <div className="flex items-center justify-center h-full">
        <input
          type="checkbox"
          checked={editValue === "true"}
          onChange={(e) => {
            onSave(e.target.checked);
          }}
          className="w-4 h-4 rounded border-gray-300"
          autoFocus
        />
      </div>
    );
  }

  if (field.type === "select") {
    const options = ((field.config as { options?: string[] })?.options) || [];
    return (
      <select
        value={editValue}
        onChange={(e) => {
          onSave(e.target.value);
        }}
        onBlur={() => onCancel()}
        className="w-full h-full px-2 text-sm bg-white dark:bg-gray-800 border-0 outline-none focus:ring-2 focus:ring-blue-500"
        autoFocus
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

  if (field.type === "date") {
    return (
      <input
        ref={inputRef}
        type="date"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="w-full h-full px-2 text-sm bg-white dark:bg-gray-800 border-0 outline-none focus:ring-2 focus:ring-blue-500"
      />
    );
  }

  return (
    <input
      ref={inputRef}
      type={field.type === "number" ? "number" : "text"}
      value={editValue}
      onChange={(e) => setEditValue(e.target.value)}
      onBlur={handleSave}
      onKeyDown={handleKeyDown}
      className="w-full h-full px-2 text-sm bg-white dark:bg-gray-800 border-0 outline-none focus:ring-2 focus:ring-blue-500"
    />
  );
}

// Display cell value
function CellDisplay({ field, value }: { field: BaseField; value: unknown }) {
  if (value == null || value === "") {
    return <span className="text-gray-400 text-sm"></span>;
  }

  if (field.type === "checkbox") {
    return (
      <div className="flex items-center justify-center">
        {value ? (
          <Check className="w-4 h-4 text-green-600" />
        ) : (
          <X className="w-4 h-4 text-gray-300" />
        )}
      </div>
    );
  }

  if (field.type === "url") {
    return (
      <a
        href={String(value)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:underline text-sm truncate"
        onClick={(e) => e.stopPropagation()}
      >
        {String(value)}
      </a>
    );
  }

  return <span className="text-sm truncate">{String(value)}</span>;
}

interface BaseGridViewProps {
  tableId: string;
  tableName: string;
  viewConfig?: ViewConfig;
  onViewConfigChange?: (config: ViewConfig) => void;
}

export function BaseGridView({ tableId, tableName, viewConfig, onViewConfigChange }: BaseGridViewProps) {
  const [fields, setFields] = useState<BaseField[]>([]);
  const [records, setRecords] = useState<BaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{
    recordId: string;
    fieldId: string;
  } | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [renamingField, setRenamingField] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [addingField, setAddingField] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [fieldsRes, recordsRes] = await Promise.all([
        api.getTableFields(tableId),
        api.getTableRecords(tableId, { limit: 100 }),
      ]);
      setFields(fieldsRes.fields);
      setRecords(recordsRes.records);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [tableId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCellSave = useCallback(
    async (recordId: string, fieldId: string, value: unknown) => {
      setEditingCell(null);
      try {
        const record = records.find((r) => r.id === recordId);
        const currentData = (record?.data as Record<string, unknown>) || {};
        const newData = { ...currentData, [fieldId]: value };
        await api.updateRecord(recordId, newData);
        setRecords((prev) =>
          prev.map((r) => (r.id === recordId ? { ...r, data: newData } : r))
        );
      } catch {
        // Revert on error
        loadData();
      }
    },
    [records, loadData]
  );

  const handleAddRow = useCallback(async () => {
    try {
      const result = await api.createRecord(tableId, {});
      setRecords((prev) => [...prev, result.record]);
    } catch {
      // Silently handle
    }
  }, [tableId]);

  const handleAddField = useCallback(async () => {
    if (!newFieldName.trim()) return;
    try {
      const result = await api.createField(tableId, {
        name: newFieldName.trim(),
        type: newFieldType,
      });
      setFields((prev) => [...prev, result.field]);
      setNewFieldName("");
      setNewFieldType("text");
      setAddingField(false);
    } catch {
      // Silently handle
    }
  }, [tableId, newFieldName, newFieldType]);

  const handleRenameField = useCallback(
    async (fieldId: string) => {
      if (!renameValue.trim()) {
        setRenamingField(null);
        return;
      }
      try {
        await api.updateField(fieldId, { name: renameValue.trim() });
        setFields((prev) =>
          prev.map((f) =>
            f.id === fieldId ? { ...f, name: renameValue.trim() } : f
          )
        );
      } catch {
        // Silently handle
      }
      setRenamingField(null);
    },
    [renameValue]
  );

  const handleSelectAll = useCallback(() => {
    if (selectedRows.size === records.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(records.map((r) => r.id)));
    }
  }, [records, selectedRows.size]);

  const handleSelectRow = useCallback((recordId: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) {
        next.delete(recordId);
      } else {
        next.add(recordId);
      }
      return next;
    });
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-pulse text-gray-500">Loading table data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <p className="text-red-500 text-sm">{error}</p>
        <Button variant="outline" size="sm" onClick={loadData}>
          Retry
        </Button>
      </div>
    );
  }

  const currentConfig: ViewConfig = viewConfig || {};
  const { records: processedRecords, groups } = applyViewConfig(
    records,
    fields,
    currentConfig
  );

  const renderRecordRow = (record: BaseRecord, rowIndex: number) => {
    const data = (record.data as Record<string, unknown>) || {};
    return (
      <tr
        key={record.id}
        className={cn(
          "border-b border-gray-100 dark:border-gray-800 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors",
          selectedRows.has(record.id) &&
            "bg-blue-50 dark:bg-blue-950/30"
        )}
      >
        {/* Checkbox */}
        <td className="px-2 py-1 border-r border-gray-100 dark:border-gray-800">
          <input
            type="checkbox"
            checked={selectedRows.has(record.id)}
            onChange={() => handleSelectRow(record.id)}
            className="w-4 h-4 rounded border-gray-300"
          />
        </td>
        {/* Row number */}
        <td className="px-2 py-1 text-xs text-gray-400 text-center border-r border-gray-100 dark:border-gray-800">
          {rowIndex + 1}
        </td>
        {/* Field cells */}
        {fields.map((field) => {
          const isEditing =
            editingCell?.recordId === record.id &&
            editingCell?.fieldId === field.id;
          return (
            <td
              key={field.id}
              className={cn(
                "px-0 py-0 min-w-[150px] h-8 border-r border-gray-100 dark:border-gray-800 cursor-pointer",
                isEditing && "ring-2 ring-blue-500 ring-inset"
              )}
              onClick={() => {
                if (!isEditing) {
                  setEditingCell({
                    recordId: record.id,
                    fieldId: field.id,
                  });
                }
              }}
            >
              {isEditing ? (
                <CellEditor
                  field={field}
                  value={data[field.id]}
                  onSave={(value) =>
                    handleCellSave(record.id, field.id, value)
                  }
                  onCancel={() => setEditingCell(null)}
                />
              ) : (
                <div className="px-2 py-1 h-full flex items-center">
                  <CellDisplay field={field} value={data[field.id]} />
                </div>
              )}
            </td>
          );
        })}
        <td className="border-r border-gray-100 dark:border-gray-800" />
      </tr>
    );
  };

  const colCount = fields.length + 3; // checkbox + row number + fields + add-field

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* View toolbar */}
      {onViewConfigChange && (
        <BaseViewToolbar
          fields={fields}
          config={currentConfig}
          onChange={onViewConfigChange}
        />
      )}

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse min-w-max">
          {/* Header */}
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              {/* Checkbox column */}
              <th className="w-10 px-2 py-2 border-r border-gray-200 dark:border-gray-700">
                <input
                  type="checkbox"
                  checked={
                    processedRecords.length > 0 && selectedRows.size === processedRecords.length
                  }
                  onChange={handleSelectAll}
                  className="w-4 h-4 rounded border-gray-300"
                />
              </th>
              {/* Row number */}
              <th className="w-10 px-2 py-2 text-xs text-gray-500 font-medium border-r border-gray-200 dark:border-gray-700">
                #
              </th>
              {/* Field columns */}
              {fields.map((field) => {
                const IconComp =
                  fieldTypeIcons[field.type] || Type;
                return (
                  <th
                    key={field.id}
                    className="min-w-[150px] px-3 py-2 text-left border-r border-gray-200 dark:border-gray-700 group"
                  >
                    {renamingField === field.id ? (
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => handleRenameField(field.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameField(field.id);
                          if (e.key === "Escape") setRenamingField(null);
                        }}
                        className="w-full px-1 py-0 text-xs font-medium bg-white dark:bg-gray-800 border border-blue-500 rounded outline-none"
                        autoFocus
                      />
                    ) : (
                      <button
                        className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 w-full"
                        onClick={() => {
                          setRenamingField(field.id);
                          setRenameValue(field.name);
                        }}
                      >
                        <IconComp className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <span className="truncate">{field.name}</span>
                      </button>
                    )}
                  </th>
                );
              })}
              {/* Add field button */}
              <th className="w-10 px-2 py-2 border-r border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setAddingField(true)}
                  className="flex items-center justify-center w-6 h-6 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600"
                  title="Add field"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </th>
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {groups ? (
              <>
                {groups.map((group) => {
                  // Compute subtotal for number fields
                  const numberFields = fields.filter((f) => f.type === "number");
                  return (
                    <React.Fragment key={group.value}>
                      {/* Group header row */}
                      <tr className="bg-gray-100 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                        <td colSpan={colCount} className="px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                              {group.fieldName}: {group.value}
                            </span>
                            <span className="text-[10px] text-gray-400 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">
                              {group.count}
                            </span>
                            {numberFields.length > 0 && (
                              <span className="text-[10px] text-gray-400 ml-2">
                                {numberFields.map((nf) => {
                                  const sum = group.records.reduce((acc, r) => {
                                    const d = (r.data as Record<string, unknown>) || {};
                                    const v = Number(d[nf.id]);
                                    return acc + (isNaN(v) ? 0 : v);
                                  }, 0);
                                  return sum !== 0 ? `${nf.name}: ${sum}` : null;
                                }).filter(Boolean).join(" | ")}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                      {group.records.map((record, idx) =>
                        renderRecordRow(record, idx + 1)
                      )}
                    </React.Fragment>
                  );
                })}
              </>
            ) : (
              processedRecords.map((record, rowIndex) =>
                renderRecordRow(record, rowIndex + 1)
              )
            )}
          </tbody>
        </table>
      </div>

      {/* Add row button */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-2 bg-gray-50 dark:bg-gray-900">
        <button
          onClick={handleAddRow}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          <Plus className="w-4 h-4" />
          Add row
        </button>
      </div>

      {/* Add field dialog */}
      {addingField && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl p-4 w-80 space-y-3">
            <h3 className="font-medium text-sm">Add Field</h3>
            <Input
              placeholder="Field name"
              value={newFieldName}
              onChange={(e) => setNewFieldName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddField();
                if (e.key === "Escape") setAddingField(false);
              }}
              autoFocus
            />
            <select
              value={newFieldType}
              onChange={(e) => setNewFieldType(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
            >
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="date">Date</option>
              <option value="checkbox">Checkbox</option>
              <option value="select">Select</option>
              <option value="url">URL</option>
              <option value="email">Email</option>
            </select>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddingField(false)}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleAddField}>
                Add
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
