"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { api, type BaseField, type BaseRecord } from "@/lib/api";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecordDetailPanel } from "./record-detail-panel";
import {
  BaseViewToolbar,
  applyViewConfig,
  type ViewConfig,
} from "./base-view-toolbar";

interface BaseGalleryViewProps {
  tableId: string;
  tableName: string;
  viewConfig?: ViewConfig;
  onViewConfigChange?: (config: ViewConfig) => void;
}

export function BaseGalleryView({
  tableId,
  tableName,
  viewConfig,
  onViewConfigChange,
}: BaseGalleryViewProps) {
  const [fields, setFields] = useState<BaseField[]>([]);
  const [records, setRecords] = useState<BaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<BaseRecord | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [fieldRes, recordRes] = await Promise.all([
          api.getTableFields(tableId),
          api.getTableRecords(tableId),
        ]);
        setFields(fieldRes.fields);
        setRecords(recordRes.records);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tableId]);

  const filteredRecords = useMemo(() => {
    if (!viewConfig) return records;
    const result = applyViewConfig(records, fields, viewConfig);
    return result.records;
  }, [records, fields, viewConfig]);

  const titleField = fields.find(
    (f) => f.name.toLowerCase() === "name" || f.name.toLowerCase() === "title"
  );

  const cardFields = useMemo(
    () =>
      fields
        .filter((f) => f.id !== titleField?.id)
        .slice(0, 4),
    [fields, titleField]
  );

  const handleAddRecord = async () => {
    try {
      const result = await api.createRecord(tableId, {});
      setRecords((prev) => [...prev, result.record]);
    } catch {
      // ignore
    }
  };

  const handleRecordUpdate = useCallback(
    (recordId: string, fieldId: string, value: unknown) => {
      setRecords((prev) =>
        prev.map((r) => {
          if (r.id !== recordId) return r;
          const data = (r.data as Record<string, unknown>) || {};
          return { ...r, data: { ...data, [fieldId]: value } };
        })
      );
      if (selectedRecord && selectedRecord.id === recordId) {
        setSelectedRecord((prev) => {
          if (!prev) return prev;
          const data = (prev.data as Record<string, unknown>) || {};
          return { ...prev, data: { ...data, [fieldId]: value } };
        });
      }
    },
    [selectedRecord]
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <BaseViewToolbar
        fields={fields}
        config={viewConfig || {}}
        onChange={onViewConfigChange || (() => {})}
      />

      <div className="flex-1 overflow-auto p-4">
        {filteredRecords.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              No records yet. Add one to get started.
            </p>
            <Button size="sm" onClick={handleAddRecord}>
              <Plus className="w-4 h-4 mr-1" />
              Add Record
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredRecords.map((record) => {
              const data = record.data as Record<string, unknown>;
              const title = titleField
                ? (data[titleField.id] as string) || "Untitled"
                : "Record";

              return (
                <button
                  key={record.id}
                  onClick={() => setSelectedRecord(record)}
                  className="text-left bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition-all"
                >
                  <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate mb-2">
                    {title}
                  </h3>

                  <div className="space-y-1.5">
                    {cardFields.map((field) => {
                      const value = data[field.id];
                      const displayValue =
                        value === null || value === undefined
                          ? "-"
                          : typeof value === "object"
                            ? JSON.stringify(value)
                            : String(value);

                      return (
                        <div key={field.id} className="flex items-start gap-2">
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider flex-shrink-0 w-16 truncate">
                            {field.name}
                          </span>
                          <span className="text-xs text-gray-600 dark:text-gray-300 truncate">
                            {displayValue}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                    <span className="text-[10px] text-gray-400">
                      Updated {new Date(record.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              );
            })}

            <button
              onClick={handleAddRecord}
              className="flex items-center justify-center border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-4 min-h-[120px] hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
            >
              <Plus className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            </button>
          </div>
        )}
      </div>

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
