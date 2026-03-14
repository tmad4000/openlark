"use client";

import { useState, useEffect, useMemo } from "react";
import { api, type BaseField, type BaseRecord } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BaseViewToolbar,
  applyViewConfig,
  type ViewConfig,
} from "./base-view-toolbar";

interface BaseCalendarViewProps {
  tableId: string;
  tableName: string;
  dateFieldId: string | null;
  onDateFieldChange: (fieldId: string) => void;
  viewConfig?: ViewConfig;
  onViewConfigChange?: (config: ViewConfig) => void;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const startDayOfWeek = firstDay.getDay();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }

  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i));
  }

  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push(new Date(year, month + 1, i));
  }

  return days;
}

export function BaseCalendarView({
  tableId,
  tableName,
  dateFieldId,
  onDateFieldChange,
  viewConfig,
  onViewConfigChange,
}: BaseCalendarViewProps) {
  const [fields, setFields] = useState<BaseField[]>([]);
  const [records, setRecords] = useState<BaseRecord[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(true);

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

  const dateFields = useMemo(
    () => fields.filter((f) => f.type === "date"),
    [fields]
  );

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);

  const filteredRecords = useMemo(() => {
    if (!viewConfig) return records;
    const result = applyViewConfig(records, fields, viewConfig);
    return result.records;
  }, [records, fields, viewConfig]);

  const recordsByDate = useMemo(() => {
    if (!dateFieldId) return new Map<string, BaseRecord[]>();
    const map = new Map<string, BaseRecord[]>();
    for (const record of filteredRecords) {
      const data = record.data as Record<string, unknown>;
      const dateVal = data[dateFieldId];
      if (typeof dateVal === "string") {
        const key = dateVal.split("T")[0];
        const existing = map.get(key) || [];
        existing.push(record);
        map.set(key, existing);
      }
    }
    return map;
  }, [filteredRecords, dateFieldId]);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const today = () => setCurrentDate(new Date());

  const titleField = fields.find(
    (f) => f.name.toLowerCase() === "name" || f.name.toLowerCase() === "title"
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!dateFieldId && dateFields.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No date fields found. Add a date field to use Calendar view.
        </p>
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

      {/* Date field selector */}
      {!dateFieldId && dateFields.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-yellow-50 dark:bg-yellow-950/20">
          <span className="text-sm text-gray-600 dark:text-gray-400 mr-2">
            Select a date field:
          </span>
          {dateFields.map((f) => (
            <button
              key={f.id}
              onClick={() => onDateFieldChange(f.id)}
              className="mr-2 px-2 py-0.5 text-xs rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800"
            >
              {f.name}
            </button>
          ))}
        </div>
      )}

      {/* Calendar header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prevMonth}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={nextMonth}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={today}>
            Today
          </Button>
        </div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {MONTHS[month]} {year}
        </h2>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
          {DAYS.map((day) => (
            <div
              key={day}
              className="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 text-center border-r border-gray-200 dark:border-gray-700 last:border-r-0"
            >
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 auto-rows-fr" style={{ minHeight: "calc(100% - 28px)" }}>
          {days.map((day, i) => {
            const key = day.toISOString().split("T")[0];
            const dayRecords = recordsByDate.get(key) || [];
            const isCurrentMonth = day.getMonth() === month;
            const isToday = key === new Date().toISOString().split("T")[0];

            return (
              <div
                key={i}
                className={cn(
                  "border-r border-b border-gray-200 dark:border-gray-700 p-1 min-h-[80px] last:border-r-0",
                  !isCurrentMonth && "bg-gray-50 dark:bg-gray-900/50"
                )}
              >
                <div
                  className={cn(
                    "text-xs mb-1 w-6 h-6 flex items-center justify-center rounded-full",
                    isToday && "bg-blue-500 text-white",
                    !isToday && !isCurrentMonth && "text-gray-400 dark:text-gray-600",
                    !isToday && isCurrentMonth && "text-gray-700 dark:text-gray-300"
                  )}
                >
                  {day.getDate()}
                </div>
                {dayRecords.slice(0, 3).map((record) => {
                  const data = record.data as Record<string, unknown>;
                  const title = titleField
                    ? (data[titleField.id] as string) || "Untitled"
                    : "Record";
                  return (
                    <div
                      key={record.id}
                      className="text-[10px] px-1 py-0.5 mb-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 truncate"
                    >
                      {title}
                    </div>
                  );
                })}
                {dayRecords.length > 3 && (
                  <div className="text-[10px] text-gray-400 px-1">
                    +{dayRecords.length - 3} more
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
