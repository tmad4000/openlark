"use client";

import { useState, useRef, useEffect } from "react";
import type { BaseField, BaseRecord } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Filter,
  ArrowUpDown,
  Layers,
  Plus,
  X,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ============ Types ============

export interface FilterCondition {
  id: string;
  fieldId: string;
  operator: string;
  value: string;
}

export interface SortRule {
  id: string;
  fieldId: string;
  direction: "asc" | "desc";
}

export interface ViewConfig {
  filters?: {
    conjunction: "and" | "or";
    conditions: FilterCondition[];
  };
  sorts?: SortRule[];
  groupByFieldId?: string;
}

const OPERATORS_BY_TYPE: Record<string, { value: string; label: string }[]> = {
  text: [
    { value: "contains", label: "contains" },
    { value: "eq", label: "is" },
    { value: "neq", label: "is not" },
    { value: "empty", label: "is empty" },
    { value: "not_empty", label: "is not empty" },
  ],
  number: [
    { value: "eq", label: "=" },
    { value: "neq", label: "≠" },
    { value: "gt", label: ">" },
    { value: "lt", label: "<" },
    { value: "gte", label: "≥" },
    { value: "lte", label: "≤" },
    { value: "empty", label: "is empty" },
    { value: "not_empty", label: "is not empty" },
  ],
  select: [
    { value: "eq", label: "is" },
    { value: "neq", label: "is not" },
    { value: "empty", label: "is empty" },
    { value: "not_empty", label: "is not empty" },
  ],
  checkbox: [
    { value: "eq", label: "is" },
  ],
  date: [
    { value: "eq", label: "is" },
    { value: "gt", label: "is after" },
    { value: "lt", label: "is before" },
    { value: "empty", label: "is empty" },
    { value: "not_empty", label: "is not empty" },
  ],
  url: [
    { value: "contains", label: "contains" },
    { value: "eq", label: "is" },
    { value: "empty", label: "is empty" },
    { value: "not_empty", label: "is not empty" },
  ],
  email: [
    { value: "contains", label: "contains" },
    { value: "eq", label: "is" },
    { value: "empty", label: "is empty" },
    { value: "not_empty", label: "is not empty" },
  ],
};

function getOperators(fieldType: string) {
  return OPERATORS_BY_TYPE[fieldType] || OPERATORS_BY_TYPE.text;
}

function needsValue(operator: string) {
  return operator !== "empty" && operator !== "not_empty";
}

let idCounter = 0;
function genId() {
  return `vc_${Date.now()}_${++idCounter}`;
}

// ============ Dropdown wrapper ============

function Popover({
  trigger,
  open,
  onOpenChange,
  children,
  align = "left",
}: {
  trigger: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onOpenChange]);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => onOpenChange(!open)}>{trigger}</div>
      {open && (
        <div
          className={cn(
            "absolute top-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-30 min-w-[320px]",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// ============ Filter Panel ============

function FilterPanel({
  fields,
  config,
  onChange,
}: {
  fields: BaseField[];
  config: ViewConfig;
  onChange: (config: ViewConfig) => void;
}) {
  const conditions = config.filters?.conditions || [];
  const conjunction = config.filters?.conjunction || "and";

  const addCondition = () => {
    const firstField = fields[0];
    if (!firstField) return;
    const ops = getOperators(firstField.type);
    const newCondition: FilterCondition = {
      id: genId(),
      fieldId: firstField.id,
      operator: ops[0]?.value || "eq",
      value: "",
    };
    onChange({
      ...config,
      filters: {
        conjunction,
        conditions: [...conditions, newCondition],
      },
    });
  };

  const updateCondition = (id: string, updates: Partial<FilterCondition>) => {
    onChange({
      ...config,
      filters: {
        conjunction,
        conditions: conditions.map((c) =>
          c.id === id ? { ...c, ...updates } : c
        ),
      },
    });
  };

  const removeCondition = (id: string) => {
    const newConditions = conditions.filter((c) => c.id !== id);
    onChange({
      ...config,
      filters:
        newConditions.length === 0
          ? undefined
          : { conjunction, conditions: newConditions },
    });
  };

  const setConjunction = (conj: "and" | "or") => {
    onChange({
      ...config,
      filters: { conjunction: conj, conditions },
    });
  };

  return (
    <div className="p-3 space-y-2 max-h-[300px] overflow-auto">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
          Filters
        </span>
      </div>

      {conditions.length === 0 && (
        <p className="text-xs text-gray-400 py-2">No filters applied</p>
      )}

      {conditions.map((condition, idx) => {
        const field = fields.find((f) => f.id === condition.fieldId);
        const fieldType = field?.type || "text";
        const operators = getOperators(fieldType);
        const showValue = needsValue(condition.operator);

        return (
          <div key={condition.id} className="flex items-center gap-1.5">
            {/* Conjunction label */}
            <div className="w-12 flex-shrink-0 text-right">
              {idx === 0 ? (
                <span className="text-[10px] text-gray-400 uppercase">
                  Where
                </span>
              ) : (
                <select
                  value={conjunction}
                  onChange={(e) =>
                    setConjunction(e.target.value as "and" | "or")
                  }
                  className="text-[10px] uppercase bg-transparent border-none text-gray-500 cursor-pointer p-0 focus:outline-none"
                >
                  <option value="and">AND</option>
                  <option value="or">OR</option>
                </select>
              )}
            </div>

            {/* Field select */}
            <select
              value={condition.fieldId}
              onChange={(e) => {
                const newField = fields.find((f) => f.id === e.target.value);
                const newOps = getOperators(newField?.type || "text");
                updateCondition(condition.id, {
                  fieldId: e.target.value,
                  operator: newOps[0]?.value || "eq",
                  value: "",
                });
              }}
              className="text-xs px-1.5 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 min-w-[80px] max-w-[120px]"
            >
              {fields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>

            {/* Operator select */}
            <select
              value={condition.operator}
              onChange={(e) =>
                updateCondition(condition.id, { operator: e.target.value })
              }
              className="text-xs px-1.5 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 min-w-[70px]"
            >
              {operators.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>

            {/* Value input */}
            {showValue && (
              <>
                {fieldType === "select" ? (
                  <select
                    value={condition.value}
                    onChange={(e) =>
                      updateCondition(condition.id, { value: e.target.value })
                    }
                    className="text-xs px-1.5 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 min-w-[80px] flex-1"
                  >
                    <option value="">-- Select --</option>
                    {(
                      (field?.config as { options?: string[] })?.options || []
                    ).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : fieldType === "checkbox" ? (
                  <select
                    value={condition.value}
                    onChange={(e) =>
                      updateCondition(condition.id, { value: e.target.value })
                    }
                    className="text-xs px-1.5 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 min-w-[80px]"
                  >
                    <option value="true">Checked</option>
                    <option value="false">Unchecked</option>
                  </select>
                ) : (
                  <input
                    type={fieldType === "number" ? "number" : fieldType === "date" ? "date" : "text"}
                    value={condition.value}
                    onChange={(e) =>
                      updateCondition(condition.id, { value: e.target.value })
                    }
                    placeholder="Value..."
                    className="text-xs px-1.5 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 min-w-[80px] flex-1"
                  />
                )}
              </>
            )}

            {/* Remove */}
            <button
              onClick={() => removeCondition(condition.id)}
              className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}

      <button
        onClick={addCondition}
        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 pt-1"
      >
        <Plus className="w-3 h-3" />
        Add filter
      </button>
    </div>
  );
}

// ============ Sort Panel ============

function SortPanel({
  fields,
  config,
  onChange,
}: {
  fields: BaseField[];
  config: ViewConfig;
  onChange: (config: ViewConfig) => void;
}) {
  const sorts = config.sorts || [];

  const addSort = () => {
    const usedFieldIds = new Set(sorts.map((s) => s.fieldId));
    const available = fields.find((f) => !usedFieldIds.has(f.id));
    if (!available) return;
    const newSort: SortRule = {
      id: genId(),
      fieldId: available.id,
      direction: "asc",
    };
    onChange({ ...config, sorts: [...sorts, newSort] });
  };

  const updateSort = (id: string, updates: Partial<SortRule>) => {
    onChange({
      ...config,
      sorts: sorts.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    });
  };

  const removeSort = (id: string) => {
    const newSorts = sorts.filter((s) => s.id !== id);
    onChange({
      ...config,
      sorts: newSorts.length === 0 ? undefined : newSorts,
    });
  };

  return (
    <div className="p-3 space-y-2 max-h-[300px] overflow-auto">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
          Sort
        </span>
      </div>

      {sorts.length === 0 && (
        <p className="text-xs text-gray-400 py-2">No sort rules</p>
      )}

      {sorts.map((sort, idx) => (
        <div key={sort.id} className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400 uppercase w-12 text-right flex-shrink-0">
            {idx === 0 ? "Sort by" : "Then by"}
          </span>

          <select
            value={sort.fieldId}
            onChange={(e) => updateSort(sort.id, { fieldId: e.target.value })}
            className="text-xs px-1.5 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 min-w-[100px] flex-1"
          >
            {fields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>

          <select
            value={sort.direction}
            onChange={(e) =>
              updateSort(sort.id, {
                direction: e.target.value as "asc" | "desc",
              })
            }
            className="text-xs px-1.5 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 min-w-[80px]"
          >
            <option value="asc">A → Z</option>
            <option value="desc">Z → A</option>
          </select>

          <button
            onClick={() => removeSort(sort.id)}
            className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}

      {sorts.length < fields.length && (
        <button
          onClick={addSort}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 pt-1"
        >
          <Plus className="w-3 h-3" />
          Add sort
        </button>
      )}
    </div>
  );
}

// ============ Group Panel ============

function GroupPanel({
  fields,
  config,
  onChange,
}: {
  fields: BaseField[];
  config: ViewConfig;
  onChange: (config: ViewConfig) => void;
}) {
  const groupByFieldId = config.groupByFieldId || "";

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
          Group by
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <select
          value={groupByFieldId}
          onChange={(e) =>
            onChange({
              ...config,
              groupByFieldId: e.target.value || undefined,
            })
          }
          className="text-xs px-1.5 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 flex-1"
        >
          <option value="">None</option>
          {fields.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>

        {groupByFieldId && (
          <button
            onClick={() => onChange({ ...config, groupByFieldId: undefined })}
            className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ============ Main Toolbar ============

interface BaseViewToolbarProps {
  fields: BaseField[];
  config: ViewConfig;
  onChange: (config: ViewConfig) => void;
}

export function BaseViewToolbar({
  fields,
  config,
  onChange,
}: BaseViewToolbarProps) {
  const [openPanel, setOpenPanel] = useState<
    "filter" | "sort" | "group" | null
  >(null);

  const filterCount = config.filters?.conditions?.length || 0;
  const sortCount = config.sorts?.length || 0;
  const hasGroup = !!config.groupByFieldId;

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950">
      {/* Filter */}
      <Popover
        open={openPanel === "filter"}
        onOpenChange={(open) => setOpenPanel(open ? "filter" : null)}
        trigger={
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 px-2 text-xs gap-1",
              filterCount > 0 &&
                "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30"
            )}
          >
            <Filter className="w-3.5 h-3.5" />
            Filter
            {filterCount > 0 && (
              <span className="ml-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1 py-0 rounded text-[10px] leading-4">
                {filterCount}
              </span>
            )}
          </Button>
        }
      >
        <FilterPanel fields={fields} config={config} onChange={onChange} />
      </Popover>

      {/* Sort */}
      <Popover
        open={openPanel === "sort"}
        onOpenChange={(open) => setOpenPanel(open ? "sort" : null)}
        trigger={
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 px-2 text-xs gap-1",
              sortCount > 0 &&
                "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30"
            )}
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            Sort
            {sortCount > 0 && (
              <span className="ml-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1 py-0 rounded text-[10px] leading-4">
                {sortCount}
              </span>
            )}
          </Button>
        }
      >
        <SortPanel fields={fields} config={config} onChange={onChange} />
      </Popover>

      {/* Group */}
      <Popover
        open={openPanel === "group"}
        onOpenChange={(open) => setOpenPanel(open ? "group" : null)}
        trigger={
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 px-2 text-xs gap-1",
              hasGroup &&
                "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30"
            )}
          >
            <Layers className="w-3.5 h-3.5" />
            Group
            {hasGroup && (
              <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-blue-500" />
            )}
          </Button>
        }
      >
        <GroupPanel fields={fields} config={config} onChange={onChange} />
      </Popover>
    </div>
  );
}

// ============ Client-side data processing ============

export function applyViewConfig(
  records: BaseRecord[],
  fields: BaseField[],
  config: ViewConfig
): {
  records: BaseRecord[];
  groups: { fieldId: string; fieldName: string; value: string; records: BaseRecord[]; count: number }[] | null;
} {
  let filtered = [...records];

  // Apply filters
  if (config.filters && config.filters.conditions.length > 0) {
    const { conjunction, conditions } = config.filters;

    filtered = filtered.filter((record) => {
      const data = (record.data as Record<string, unknown>) || {};
      const results = conditions.map((cond) => {
        const rawValue = data[cond.fieldId];
        const strValue = rawValue != null ? String(rawValue) : "";
        const field = fields.find((f) => f.id === cond.fieldId);

        switch (cond.operator) {
          case "eq":
            if (field?.type === "checkbox") {
              return String(!!rawValue) === cond.value;
            }
            return strValue === cond.value;
          case "neq":
            return strValue !== cond.value;
          case "contains":
            return strValue.toLowerCase().includes(cond.value.toLowerCase());
          case "gt":
            return Number(rawValue) > Number(cond.value);
          case "lt":
            return Number(rawValue) < Number(cond.value);
          case "gte":
            return Number(rawValue) >= Number(cond.value);
          case "lte":
            return Number(rawValue) <= Number(cond.value);
          case "empty":
            return rawValue == null || rawValue === "";
          case "not_empty":
            return rawValue != null && rawValue !== "";
          default:
            return true;
        }
      });

      return conjunction === "and"
        ? results.every(Boolean)
        : results.some(Boolean);
    });
  }

  // Apply sorts
  if (config.sorts && config.sorts.length > 0) {
    filtered.sort((a, b) => {
      const dataA = (a.data as Record<string, unknown>) || {};
      const dataB = (b.data as Record<string, unknown>) || {};

      for (const sort of config.sorts!) {
        const valA = dataA[sort.fieldId];
        const valB = dataB[sort.fieldId];

        let cmp = 0;
        if (valA == null && valB == null) cmp = 0;
        else if (valA == null) cmp = -1;
        else if (valB == null) cmp = 1;
        else if (typeof valA === "number" && typeof valB === "number") {
          cmp = valA - valB;
        } else {
          cmp = String(valA).localeCompare(String(valB));
        }

        if (cmp !== 0) {
          return sort.direction === "desc" ? -cmp : cmp;
        }
      }
      return 0;
    });
  }

  // Apply grouping
  if (config.groupByFieldId) {
    const field = fields.find((f) => f.id === config.groupByFieldId);
    if (field) {
      const groupMap = new Map<string, BaseRecord[]>();

      // Collect unique group values
      for (const record of filtered) {
        const data = (record.data as Record<string, unknown>) || {};
        const val = data[config.groupByFieldId];
        const key = val != null && val !== "" ? String(val) : "__empty__";
        if (!groupMap.has(key)) groupMap.set(key, []);
        groupMap.get(key)!.push(record);
      }

      // For select fields, order by the options list
      let orderedKeys: string[];
      if (field.type === "select") {
        const options =
          ((field.config as { options?: string[] })?.options) || [];
        orderedKeys = [
          ...options.filter((o) => groupMap.has(o)),
          ...[...groupMap.keys()].filter((k) => !options.includes(k)),
        ];
      } else {
        orderedKeys = [...groupMap.keys()].sort();
      }

      const groups = orderedKeys.map((key) => ({
        fieldId: config.groupByFieldId!,
        fieldName: field.name,
        value: key === "__empty__" ? "(Empty)" : key,
        records: groupMap.get(key) || [],
        count: groupMap.get(key)?.length || 0,
      }));

      return { records: filtered, groups };
    }
  }

  return { records: filtered, groups: null };
}
