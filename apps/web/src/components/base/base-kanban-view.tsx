"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api, type BaseField, type BaseRecord } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Plus, GripVertical, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecordDetailPanel } from "./record-detail-panel";

interface BaseKanbanViewProps {
  tableId: string;
  tableName: string;
  groupByFieldId: string | null;
  onGroupByChange: (fieldId: string) => void;
}

interface DragState {
  recordId: string;
  sourceColumn: string;
}

export function BaseKanbanView({
  tableId,
  tableName,
  groupByFieldId,
  onGroupByChange,
}: BaseKanbanViewProps) {
  const [fields, setFields] = useState<BaseField[]>([]);
  const [records, setRecords] = useState<BaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<BaseRecord | null>(null);

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

      // Auto-select first select field if no groupBy is set
      if (!groupByFieldId) {
        const selectField = fieldsRes.fields.find((f) => f.type === "select");
        if (selectField) {
          onGroupByChange(selectField.id);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [tableId, groupByFieldId, onGroupByChange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const groupByField = fields.find((f) => f.id === groupByFieldId);
  const groupableFields = fields.filter((f) => f.type === "select");

  // Get columns from the select field options
  const columns: string[] = groupByField
    ? [
        ...((groupByField.config as { options?: string[] })?.options || []),
        "__uncategorized__",
      ]
    : ["__uncategorized__"];

  // Group records by column value
  const groupedRecords: Record<string, BaseRecord[]> = {};
  for (const col of columns) {
    groupedRecords[col] = [];
  }

  for (const record of records) {
    const data = (record.data as Record<string, unknown>) || {};
    const value = groupByField ? String(data[groupByField.id] ?? "") : "";
    const col = value && columns.includes(value) ? value : "__uncategorized__";
    if (!groupedRecords[col]) groupedRecords[col] = [];
    groupedRecords[col].push(record);
  }

  // Get display fields (first 3 fields that aren't the groupBy field)
  const displayFields = fields
    .filter((f) => f.id !== groupByFieldId)
    .slice(0, 3);

  // Title field is the first text field, or first field
  const titleField =
    fields.find((f) => f.type === "text" && f.id !== groupByFieldId) ||
    fields.find((f) => f.id !== groupByFieldId);

  const handleDragStart = useCallback(
    (e: React.DragEvent, recordId: string, sourceColumn: string) => {
      setDragState({ recordId, sourceColumn });
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", recordId);
    },
    []
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, column: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverColumn(column);
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setDragOverColumn(null);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetColumn: string) => {
      e.preventDefault();
      setDragOverColumn(null);

      if (!dragState || !groupByField) return;
      if (dragState.sourceColumn === targetColumn) {
        setDragState(null);
        return;
      }

      const { recordId } = dragState;
      setDragState(null);

      const newValue = targetColumn === "__uncategorized__" ? "" : targetColumn;

      // Optimistic update
      setRecords((prev) =>
        prev.map((r) => {
          if (r.id !== recordId) return r;
          const currentData = (r.data as Record<string, unknown>) || {};
          return { ...r, data: { ...currentData, [groupByField.id]: newValue } };
        })
      );

      try {
        const record = records.find((r) => r.id === recordId);
        const currentData = (record?.data as Record<string, unknown>) || {};
        await api.updateRecord(recordId, {
          ...currentData,
          [groupByField.id]: newValue,
        });
      } catch {
        loadData();
      }
    },
    [dragState, groupByField, records, loadData]
  );

  const handleRecordUpdate = useCallback(
    async (recordId: string, fieldId: string, value: unknown) => {
      try {
        const record = records.find((r) => r.id === recordId);
        const currentData = (record?.data as Record<string, unknown>) || {};
        const newData = { ...currentData, [fieldId]: value };
        await api.updateRecord(recordId, newData);
        setRecords((prev) =>
          prev.map((r) => (r.id === recordId ? { ...r, data: newData } : r))
        );
        if (selectedRecord?.id === recordId) {
          setSelectedRecord((prev) =>
            prev ? { ...prev, data: newData } : null
          );
        }
      } catch {
        loadData();
      }
    },
    [records, selectedRecord, loadData]
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-pulse text-gray-500">Loading kanban...</div>
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

  // No select field available — show picker
  if (!groupByField) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-500 text-sm">
          Select a field to group by for the Kanban view
        </p>
        {groupableFields.length === 0 ? (
          <p className="text-gray-400 text-xs">
            No select fields found. Add a select field to use Kanban view.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {groupableFields.map((f) => (
              <Button
                key={f.id}
                variant="outline"
                size="sm"
                onClick={() => onGroupByChange(f.id)}
              >
                Group by: {f.name}
              </Button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const columnLabel = (col: string) =>
    col === "__uncategorized__" ? "Uncategorized" : col;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950">
        <span className="text-xs text-gray-500">Group by:</span>
        <select
          value={groupByFieldId || ""}
          onChange={(e) => onGroupByChange(e.target.value)}
          className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900"
        >
          {groupableFields.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-3 p-4 h-full min-w-max">
          {columns.map((col) => (
            <div
              key={col}
              className={cn(
                "flex flex-col w-72 min-w-[288px] bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700",
                dragOverColumn === col &&
                  "border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-950/30"
              )}
              onDragOver={(e) => handleDragOver(e, col)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col)}
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {columnLabel(col)}
                  </span>
                  <span className="text-xs text-gray-400 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">
                    {groupedRecords[col]?.length || 0}
                  </span>
                </div>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {(groupedRecords[col] || []).map((record) => {
                  const data = (record.data as Record<string, unknown>) || {};
                  const title = titleField
                    ? String(data[titleField.id] ?? "")
                    : "";

                  return (
                    <div
                      key={record.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, record.id, col)}
                      onClick={() => setSelectedRecord(record)}
                      className={cn(
                        "bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-3 cursor-pointer hover:shadow-sm hover:border-blue-300 dark:hover:border-blue-700 transition-all",
                        dragState?.recordId === record.id && "opacity-50"
                      )}
                    >
                      {/* Card title */}
                      <div className="flex items-start gap-1.5">
                        <GripVertical className="w-3.5 h-3.5 text-gray-300 mt-0.5 flex-shrink-0 cursor-grab" />
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">
                          {title || "Untitled"}
                        </p>
                      </div>

                      {/* Card fields */}
                      {displayFields.length > 0 && (
                        <div className="mt-2 space-y-1 pl-5">
                          {displayFields
                            .filter((f) => f.id !== titleField?.id)
                            .slice(0, 2)
                            .map((field) => {
                              const val = data[field.id];
                              if (val == null || val === "") return null;

                              return (
                                <div
                                  key={field.id}
                                  className="flex items-center gap-1.5"
                                >
                                  <span className="text-[10px] text-gray-400 uppercase tracking-wider">
                                    {field.name}
                                  </span>
                                  <CardFieldValue field={field} value={val} />
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Record detail panel */}
      {selectedRecord && (
        <RecordDetailPanel
          record={selectedRecord}
          fields={fields}
          onClose={() => setSelectedRecord(null)}
          onUpdate={handleRecordUpdate}
        />
      )}
    </div>
  );
}

function CardFieldValue({
  field,
  value,
}: {
  field: BaseField;
  value: unknown;
}) {
  if (value == null || value === "") return null;

  if (field.type === "checkbox") {
    return value ? (
      <Check className="w-3 h-3 text-green-600" />
    ) : (
      <X className="w-3 h-3 text-gray-300" />
    );
  }

  return (
    <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
      {String(value)}
    </span>
  );
}
