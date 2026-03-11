"use client";

import { useState, useRef, useEffect } from "react";
import {
  Filter,
  ArrowUpDown,
  Group,
  Plus,
  X,
  ChevronDown,
  Trash2,
} from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

// Types
interface FieldData {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
}

interface FilterCondition {
  fieldId: string;
  op: string;
  value: unknown;
}

interface SortRule {
  fieldId: string;
  direction: "asc" | "desc";
}

interface ViewToolbarProps {
  fields: FieldData[];
  filters: FilterCondition[];
  sorts: SortRule[];
  groupByFieldId?: string;
  onFiltersChange: (filters: FilterCondition[]) => void;
  onSortsChange: (sorts: SortRule[]) => void;
  onGroupByChange: (fieldId: string | undefined) => void;
  showGroupBy?: boolean;
}

// Filter operators by field type
const FILTER_OPERATORS: Record<string, { value: string; label: string }[]> = {
  text: [
    { value: "eq", label: "is" },
    { value: "neq", label: "is not" },
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "does not contain" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  long_text: [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "does not contain" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  number: [
    { value: "eq", label: "=" },
    { value: "neq", label: "≠" },
    { value: "gt", label: ">" },
    { value: "gte", label: "≥" },
    { value: "lt", label: "<" },
    { value: "lte", label: "≤" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  currency: [
    { value: "eq", label: "=" },
    { value: "neq", label: "≠" },
    { value: "gt", label: ">" },
    { value: "gte", label: "≥" },
    { value: "lt", label: "<" },
    { value: "lte", label: "≤" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  percent: [
    { value: "eq", label: "=" },
    { value: "neq", label: "≠" },
    { value: "gt", label: ">" },
    { value: "gte", label: "≥" },
    { value: "lt", label: "<" },
    { value: "lte", label: "≤" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  date: [
    { value: "eq", label: "is" },
    { value: "neq", label: "is not" },
    { value: "gt", label: "is after" },
    { value: "lt", label: "is before" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  datetime: [
    { value: "eq", label: "is" },
    { value: "neq", label: "is not" },
    { value: "gt", label: "is after" },
    { value: "lt", label: "is before" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  checkbox: [
    { value: "eq", label: "is" },
  ],
  single_select: [
    { value: "eq", label: "is" },
    { value: "neq", label: "is not" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  multi_select: [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "does not contain" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  user: [
    { value: "eq", label: "is" },
    { value: "neq", label: "is not" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  url: [
    { value: "eq", label: "is" },
    { value: "neq", label: "is not" },
    { value: "contains", label: "contains" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  email: [
    { value: "eq", label: "is" },
    { value: "neq", label: "is not" },
    { value: "contains", label: "contains" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  phone: [
    { value: "eq", label: "is" },
    { value: "contains", label: "contains" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  rating: [
    { value: "eq", label: "=" },
    { value: "neq", label: "≠" },
    { value: "gt", label: ">" },
    { value: "gte", label: "≥" },
    { value: "lt", label: "<" },
    { value: "lte", label: "≤" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  duration: [
    { value: "eq", label: "=" },
    { value: "gt", label: ">" },
    { value: "lt", label: "<" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
};

// Get operators for a field type
function getOperatorsForField(type: string): { value: string; label: string }[] {
  return FILTER_OPERATORS[type] || FILTER_OPERATORS.text;
}

// Check if operator needs a value
function operatorNeedsValue(op: string): boolean {
  return !["is_empty", "is_not_empty"].includes(op);
}

// Filter Row Component
function FilterRow({
  filter,
  fields,
  index,
  isFirst,
  conjunction,
  onConjunctionChange,
  onChange,
  onRemove,
}: {
  filter: FilterCondition;
  fields: FieldData[];
  index: number;
  isFirst: boolean;
  conjunction: "and" | "or";
  onConjunctionChange: (value: "and" | "or") => void;
  onChange: (filter: FilterCondition) => void;
  onRemove: () => void;
}) {
  const field = fields.find((f) => f.id === filter.fieldId);
  const operators = field ? getOperatorsForField(field.type) : getOperatorsForField("text");
  const needsValue = operatorNeedsValue(filter.op);

  return (
    <div className="flex items-center gap-2 py-1">
      {/* Conjunction selector (AND/OR) */}
      <div className="w-14 flex-shrink-0">
        {isFirst ? (
          <span className="text-sm text-gray-500 px-1">Where</span>
        ) : (
          <select
            value={conjunction}
            onChange={(e) => onConjunctionChange(e.target.value as "and" | "or")}
            className="w-full text-sm px-1 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="and">And</option>
            <option value="or">Or</option>
          </select>
        )}
      </div>

      {/* Field selector */}
      <select
        value={filter.fieldId}
        onChange={(e) => {
          const newField = fields.find((f) => f.id === e.target.value);
          const newOps = newField ? getOperatorsForField(newField.type) : operators;
          onChange({
            ...filter,
            fieldId: e.target.value,
            op: newOps[0]?.value || "eq",
            value: "",
          });
        }}
        className="flex-1 min-w-[100px] text-sm px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {fields.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>

      {/* Operator selector */}
      <select
        value={filter.op}
        onChange={(e) => onChange({ ...filter, op: e.target.value })}
        className="w-28 text-sm px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {operators.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>

      {/* Value input */}
      {needsValue && (
        <>
          {field?.type === "single_select" ? (
            <select
              value={String(filter.value || "")}
              onChange={(e) => onChange({ ...filter, value: e.target.value })}
              className="flex-1 min-w-[100px] text-sm px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select...</option>
              {((field.config?.options as string[]) || []).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : field?.type === "checkbox" ? (
            <select
              value={filter.value ? "true" : "false"}
              onChange={(e) => onChange({ ...filter, value: e.target.value === "true" })}
              className="flex-1 min-w-[80px] text-sm px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="true">Checked</option>
              <option value="false">Unchecked</option>
            </select>
          ) : field?.type === "date" || field?.type === "datetime" ? (
            <input
              type={field.type === "datetime" ? "datetime-local" : "date"}
              value={String(filter.value || "")}
              onChange={(e) => onChange({ ...filter, value: e.target.value })}
              className="flex-1 min-w-[120px] text-sm px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          ) : field?.type === "number" || field?.type === "currency" || field?.type === "percent" || field?.type === "rating" ? (
            <input
              type="number"
              value={String(filter.value || "")}
              onChange={(e) => onChange({ ...filter, value: e.target.valueAsNumber || "" })}
              className="flex-1 min-w-[80px] text-sm px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Value"
            />
          ) : (
            <input
              type="text"
              value={String(filter.value || "")}
              onChange={(e) => onChange({ ...filter, value: e.target.value })}
              className="flex-1 min-w-[100px] text-sm px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Value"
            />
          )}
        </>
      )}

      {/* Remove button */}
      <button
        onClick={onRemove}
        className="p-1 text-gray-400 hover:text-red-500 rounded"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// Sort Row Component
function SortRow({
  sort,
  fields,
  onChange,
  onRemove,
}: {
  sort: SortRule;
  fields: FieldData[];
  onChange: (sort: SortRule) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      {/* Field selector */}
      <select
        value={sort.fieldId}
        onChange={(e) => onChange({ ...sort, fieldId: e.target.value })}
        className="flex-1 text-sm px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {fields.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>

      {/* Direction selector */}
      <select
        value={sort.direction}
        onChange={(e) => onChange({ ...sort, direction: e.target.value as "asc" | "desc" })}
        className="w-32 text-sm px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="asc">Ascending</option>
        <option value="desc">Descending</option>
      </select>

      {/* Remove button */}
      <button
        onClick={onRemove}
        className="p-1 text-gray-400 hover:text-red-500 rounded"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// Main ViewToolbar Component
export function ViewToolbar({
  fields,
  filters,
  sorts,
  groupByFieldId,
  onFiltersChange,
  onSortsChange,
  onGroupByChange,
  showGroupBy = false,
}: ViewToolbarProps) {
  const [filterConjunction, setFilterConjunction] = useState<"and" | "or">("and");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);

  // Fields that can be grouped (single_select, user)
  const groupableFields = fields.filter(
    (f) => f.type === "single_select" || f.type === "user"
  );

  const activeGroupField = groupByFieldId
    ? fields.find((f) => f.id === groupByFieldId)
    : null;

  // Add a new empty filter
  const addFilter = () => {
    if (fields.length === 0) return;
    const newFilter: FilterCondition = {
      fieldId: fields[0].id,
      op: getOperatorsForField(fields[0].type)[0]?.value || "eq",
      value: "",
    };
    onFiltersChange([...filters, newFilter]);
  };

  // Update a filter
  const updateFilter = (index: number, filter: FilterCondition) => {
    const newFilters = [...filters];
    newFilters[index] = filter;
    onFiltersChange(newFilters);
  };

  // Remove a filter
  const removeFilter = (index: number) => {
    onFiltersChange(filters.filter((_, i) => i !== index));
  };

  // Clear all filters
  const clearFilters = () => {
    onFiltersChange([]);
    setFilterOpen(false);
  };

  // Add a new sort rule
  const addSort = () => {
    if (fields.length === 0) return;
    // Find a field not already being sorted
    const usedFieldIds = new Set(sorts.map((s) => s.fieldId));
    const availableField = fields.find((f) => !usedFieldIds.has(f.id)) || fields[0];
    const newSort: SortRule = {
      fieldId: availableField.id,
      direction: "asc",
    };
    onSortsChange([...sorts, newSort]);
  };

  // Update a sort rule
  const updateSort = (index: number, sort: SortRule) => {
    const newSorts = [...sorts];
    newSorts[index] = sort;
    onSortsChange(newSorts);
  };

  // Remove a sort rule
  const removeSort = (index: number) => {
    onSortsChange(sorts.filter((_, i) => i !== index));
  };

  // Clear all sorts
  const clearSorts = () => {
    onSortsChange([]);
    setSortOpen(false);
  };

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-200 bg-white">
      {/* Filter Button */}
      <Popover.Root open={filterOpen} onOpenChange={setFilterOpen}>
        <Popover.Trigger asChild>
          <button
            className={`flex items-center gap-1.5 px-2 py-1 text-sm rounded hover:bg-gray-100 transition-colors ${
              filters.length > 0
                ? "text-blue-600 bg-blue-50 hover:bg-blue-100"
                : "text-gray-600"
            }`}
          >
            <Filter className="w-4 h-4" />
            <span>Filter</span>
            {filters.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                {filters.length}
              </span>
            )}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[400px] max-w-[600px] z-50"
            sideOffset={4}
            align="start"
          >
            <div className="space-y-2">
              {filters.length === 0 ? (
                <p className="text-sm text-gray-500 py-2">No filter conditions</p>
              ) : (
                filters.map((filter, index) => (
                  <FilterRow
                    key={index}
                    filter={filter}
                    fields={fields}
                    index={index}
                    isFirst={index === 0}
                    conjunction={filterConjunction}
                    onConjunctionChange={setFilterConjunction}
                    onChange={(f) => updateFilter(index, f)}
                    onRemove={() => removeFilter(index)}
                  />
                ))
              )}
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <button
                onClick={addFilter}
                disabled={fields.length === 0}
                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 disabled:text-gray-400"
              >
                <Plus className="w-4 h-4" />
                Add condition
              </button>
              {filters.length > 0 && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear all
                </button>
              )}
            </div>
            <Popover.Arrow className="fill-white" />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {/* Sort Button */}
      <Popover.Root open={sortOpen} onOpenChange={setSortOpen}>
        <Popover.Trigger asChild>
          <button
            className={`flex items-center gap-1.5 px-2 py-1 text-sm rounded hover:bg-gray-100 transition-colors ${
              sorts.length > 0
                ? "text-blue-600 bg-blue-50 hover:bg-blue-100"
                : "text-gray-600"
            }`}
          >
            <ArrowUpDown className="w-4 h-4" />
            <span>Sort</span>
            {sorts.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                {sorts.length}
              </span>
            )}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[300px] z-50"
            sideOffset={4}
            align="start"
          >
            <div className="space-y-2">
              {sorts.length === 0 ? (
                <p className="text-sm text-gray-500 py-2">No sort rules</p>
              ) : (
                sorts.map((sort, index) => (
                  <SortRow
                    key={index}
                    sort={sort}
                    fields={fields}
                    onChange={(s) => updateSort(index, s)}
                    onRemove={() => removeSort(index)}
                  />
                ))
              )}
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <button
                onClick={addSort}
                disabled={fields.length === 0}
                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 disabled:text-gray-400"
              >
                <Plus className="w-4 h-4" />
                Add sort
              </button>
              {sorts.length > 0 && (
                <button
                  onClick={clearSorts}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear all
                </button>
              )}
            </div>
            <Popover.Arrow className="fill-white" />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {/* Group By Button (conditional) */}
      {showGroupBy && groupableFields.length > 0 && (
        <Popover.Root open={groupOpen} onOpenChange={setGroupOpen}>
          <Popover.Trigger asChild>
            <button
              className={`flex items-center gap-1.5 px-2 py-1 text-sm rounded hover:bg-gray-100 transition-colors ${
                activeGroupField
                  ? "text-blue-600 bg-blue-50 hover:bg-blue-100"
                  : "text-gray-600"
              }`}
            >
              <Group className="w-4 h-4" />
              <span>Group</span>
              {activeGroupField && (
                <span className="ml-0.5 text-xs text-blue-700">
                  ({activeGroupField.name})
                </span>
              )}
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px] z-50"
              sideOffset={4}
              align="start"
            >
              {/* No grouping option */}
              <button
                onClick={() => {
                  onGroupByChange(undefined);
                  setGroupOpen(false);
                }}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2 ${
                  !activeGroupField ? "text-blue-600 font-medium" : "text-gray-700"
                }`}
              >
                None
              </button>

              <div className="h-px bg-gray-200 my-1" />

              {/* Groupable fields */}
              {groupableFields.map((field) => (
                <button
                  key={field.id}
                  onClick={() => {
                    onGroupByChange(field.id);
                    setGroupOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2 ${
                    field.id === groupByFieldId ? "text-blue-600 font-medium" : "text-gray-700"
                  }`}
                >
                  {field.name}
                </button>
              ))}
              <Popover.Arrow className="fill-white" />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </div>
  );
}

export default ViewToolbar;
