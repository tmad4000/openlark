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

interface BaseGanttViewProps {
  tableId: string;
  tableName: string;
  startFieldId: string | null;
  endFieldId: string | null;
  onFieldMapping: (startFieldId: string, endFieldId: string) => void;
  viewConfig?: ViewConfig;
  onViewConfigChange?: (config: ViewConfig) => void;
}

const DAY_WIDTH = 32;

function daysBetween(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function BaseGanttView({
  tableId,
  tableName,
  startFieldId,
  endFieldId,
  onFieldMapping,
  viewConfig,
  onViewConfigChange,
}: BaseGanttViewProps) {
  const [fields, setFields] = useState<BaseField[]>([]);
  const [records, setRecords] = useState<BaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewStart, setViewStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d;
  });

  const totalDays = 42;

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

  const titleField = fields.find(
    (f) => f.name.toLowerCase() === "name" || f.name.toLowerCase() === "title"
  );

  const filteredRecords = useMemo(() => {
    if (!viewConfig) return records;
    const result = applyViewConfig(records, fields, viewConfig);
    return result.records;
  }, [records, fields, viewConfig]);

  const dates = useMemo(() => {
    const result: Date[] = [];
    for (let i = 0; i < totalDays; i++) {
      result.push(addDays(viewStart, i));
    }
    return result;
  }, [viewStart]);

  const scrollLeft = () => setViewStart(addDays(viewStart, -7));
  const scrollRight = () => setViewStart(addDays(viewStart, 7));
  const goToToday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    setViewStart(d);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  if (dateFields.length < 2 && (!startFieldId || !endFieldId)) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Gantt view requires at least two date fields (start and end).
          {dateFields.length > 0
            ? ` Found ${dateFields.length} date field(s).`
            : " Add date fields to use Gantt view."}
        </p>
      </div>
    );
  }

  if (!startFieldId && !endFieldId && dateFields.length >= 2) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Select start and end date fields for the Gantt chart:
        </p>
        <div className="flex gap-4">
          {dateFields.map((f, i) => (
            <button
              key={f.id}
              onClick={() => {
                const other = dateFields[i === 0 ? 1 : 0];
                onFieldMapping(
                  i === 0 ? f.id : other.id,
                  i === 0 ? other.id : f.id
                );
              }}
              className="px-3 py-1.5 text-sm rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200"
            >
              Start: {f.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div className="flex flex-col h-full">
      <BaseViewToolbar
        fields={fields}
        config={viewConfig || {}}
        onChange={onViewConfigChange || (() => {})}
      />

      {/* Gantt controls */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <Button variant="outline" size="sm" onClick={scrollLeft}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={scrollRight}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={goToToday}>
          Today
        </Button>
        <span className="text-xs text-gray-500 ml-2">
          {tableName} - Gantt View
        </span>
      </div>

      {/* Gantt chart */}
      <div className="flex-1 overflow-auto">
        <div className="flex min-w-max">
          {/* Row labels */}
          <div className="w-48 flex-shrink-0 border-r border-gray-200 dark:border-gray-700">
            <div className="h-8 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-2 flex items-center">
              <span className="text-xs font-medium text-gray-500">Task</span>
            </div>
            {filteredRecords.map((record) => {
              const data = record.data as Record<string, unknown>;
              const title = titleField
                ? (data[titleField.id] as string) || "Untitled"
                : "Record";
              return (
                <div
                  key={record.id}
                  className="h-8 border-b border-gray-100 dark:border-gray-800 px-2 flex items-center"
                >
                  <span className="text-xs text-gray-700 dark:text-gray-300 truncate">
                    {title}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Timeline */}
          <div className="flex-1">
            {/* Date headers */}
            <div className="flex h-8 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              {dates.map((date) => {
                const dateStr = date.toISOString().split("T")[0];
                const isToday = dateStr === todayStr;
                return (
                  <div
                    key={dateStr}
                    className={cn(
                      "flex-shrink-0 flex items-center justify-center border-r border-gray-200 dark:border-gray-700",
                      isToday && "bg-blue-50 dark:bg-blue-950/30"
                    )}
                    style={{ width: DAY_WIDTH }}
                  >
                    <span
                      className={cn(
                        "text-[9px]",
                        isToday
                          ? "font-bold text-blue-600"
                          : "text-gray-400"
                      )}
                    >
                      {date.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Bars */}
            {filteredRecords.map((record) => {
              const data = record.data as Record<string, unknown>;
              const startStr = startFieldId ? (data[startFieldId] as string) : null;
              const endStr = endFieldId ? (data[endFieldId] as string) : null;

              let barLeft = 0;
              let barWidth = 0;
              let hasBar = false;

              if (startStr && endStr) {
                const start = new Date(startStr);
                const end = new Date(endStr);
                const offset = daysBetween(viewStart, start);
                const duration = Math.max(1, daysBetween(start, end));
                barLeft = offset * DAY_WIDTH;
                barWidth = duration * DAY_WIDTH;
                hasBar = true;
              }

              return (
                <div
                  key={record.id}
                  className="h-8 border-b border-gray-100 dark:border-gray-800 relative"
                  style={{ width: totalDays * DAY_WIDTH }}
                >
                  {hasBar && (
                    <div
                      className="absolute top-1.5 h-5 rounded bg-blue-500 dark:bg-blue-600 opacity-80"
                      style={{ left: barLeft, width: Math.max(barWidth, DAY_WIDTH) }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
