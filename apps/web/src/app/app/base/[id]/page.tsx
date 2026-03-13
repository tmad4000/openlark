"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Plus,
  ChevronDown,
  Grid3X3,
  Kanban,
  Calendar,
  X,
  Check,
  Type,
  Hash,
  Calendar as CalendarIcon,
  CheckSquare,
  Link,
  Mail,
  Phone,
  Star,
  Clock,
  User,
  Paperclip,
  List,
  GripVertical,
  Filter,
  ArrowUpDown,
  Layers,
  FileText,
  Copy,
  ExternalLink,
  Settings,
  CheckCircle,
  Zap,
  BarChart3,
  GanttChart,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
} from "lucide-react";
import { ViewToolbar } from "@/components/base/ViewToolbar";
import { AutomationsPanel } from "@/components/base/AutomationsPanel";
import { DashboardPanel } from "@/components/base/DashboardPanel";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

// Types
interface BaseData {
  id: string;
  name: string;
  icon: string | null;
  tables: TableData[];
}

interface TableData {
  id: string;
  name: string;
  position: number;
}

interface FieldData {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  position: number;
}

interface ViewData {
  id: string;
  name: string;
  type: "grid" | "kanban" | "calendar" | "gantt" | "gallery" | "form";
  config: ViewConfig;
  position: number;
}

interface ViewConfig {
  groupByFieldId?: string;
  filters?: Array<{ fieldId: string; op: string; value: unknown }>;
  sorts?: Array<{ fieldId: string; direction: "asc" | "desc" }>;
  hiddenFields?: string[];
  fieldOrder?: string[];
  rowHeight?: "short" | "medium" | "tall" | "extra_tall";
  columnWidths?: Record<string, number>;
  dateFieldId?: string;
  endDateFieldId?: string;
  startDateFieldId?: string;
  durationFieldId?: string;
  coverFieldId?: string;
  showTitleOnly?: boolean;
  // Form-specific
  formDescription?: string;
  formSubmitLabel?: string;
  formSuccessMessage?: string;
  formRequiredFields?: string[];
  formPublicAccess?: boolean;
  formShareToken?: string;
}

interface RecordData {
  id: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface TableWithDetails {
  id: string;
  name: string;
  fields: FieldData[];
  views: ViewData[];
}

// Field type icons
const FIELD_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  text: Type,
  long_text: Type,
  number: Hash,
  currency: Hash,
  percent: Hash,
  date: CalendarIcon,
  datetime: CalendarIcon,
  checkbox: CheckSquare,
  single_select: List,
  multi_select: List,
  user: User,
  attachment: Paperclip,
  url: Link,
  email: Mail,
  phone: Phone,
  rating: Star,
  duration: Clock,
};

// Field type labels
const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Single line text",
  long_text: "Long text",
  number: "Number",
  currency: "Currency",
  percent: "Percent",
  date: "Date",
  datetime: "Date & Time",
  checkbox: "Checkbox",
  single_select: "Single select",
  multi_select: "Multi select",
  user: "User",
  attachment: "Attachment",
  url: "URL",
  email: "Email",
  phone: "Phone",
  rating: "Rating",
  duration: "Duration",
};

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

// Cell Editor Component
function CellEditor({
  field,
  value,
  onSave,
  onCancel,
}: {
  field: FieldData;
  value: unknown;
  onSave: (value: unknown) => void;
  onCancel: () => void;
}) {
  const [editValue, setEditValue] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    if (inputRef.current instanceof HTMLInputElement) {
      inputRef.current.select();
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSave(editValue);
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  const handleBlur = () => {
    onSave(editValue);
  };

  switch (field.type) {
    case "checkbox":
      return (
        <button
          onClick={() => onSave(!value)}
          className="w-full h-full flex items-center justify-center"
        >
          {value ? (
            <CheckSquare className="w-4 h-4 text-blue-600" />
          ) : (
            <div className="w-4 h-4 border border-gray-300 rounded" />
          )}
        </button>
      );

    case "number":
    case "currency":
    case "percent":
      return (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="number"
          value={String(editValue)}
          onChange={(e) => setEditValue(e.target.valueAsNumber || "")}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="w-full h-full px-2 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50"
        />
      );

    case "date":
    case "datetime":
      return (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type={field.type === "datetime" ? "datetime-local" : "date"}
          value={String(editValue)}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="w-full h-full px-2 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50"
        />
      );

    case "single_select":
      const options = (field.config?.options as string[]) || [];
      return (
        <select
          ref={inputRef as unknown as React.RefObject<HTMLSelectElement>}
          value={String(editValue)}
          onChange={(e) => {
            setEditValue(e.target.value);
            onSave(e.target.value);
          }}
          onBlur={handleBlur}
          className="w-full h-full px-2 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50"
        >
          <option value="">Select...</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );

    case "long_text":
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={String(editValue)}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="w-full h-full px-2 py-1 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50 resize-none"
          rows={3}
        />
      );

    default:
      return (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={String(editValue)}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="w-full h-full px-2 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50"
        />
      );
  }
}

// Cell Display Component
function CellDisplay({ field, value }: { field: FieldData; value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-gray-400">-</span>;
  }

  switch (field.type) {
    case "checkbox":
      return value ? (
        <CheckSquare className="w-4 h-4 text-blue-600" />
      ) : (
        <div className="w-4 h-4 border border-gray-300 rounded" />
      );

    case "date":
      return <span>{new Date(String(value)).toLocaleDateString()}</span>;

    case "datetime":
      return <span>{new Date(String(value)).toLocaleString()}</span>;

    case "url":
      return (
        <a
          href={String(value)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline truncate block"
          onClick={(e) => e.stopPropagation()}
        >
          {String(value)}
        </a>
      );

    case "email":
      return (
        <a
          href={`mailto:${String(value)}`}
          className="text-blue-600 hover:underline truncate block"
          onClick={(e) => e.stopPropagation()}
        >
          {String(value)}
        </a>
      );

    case "single_select":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          {String(value)}
        </span>
      );

    case "rating":
      const rating = Number(value) || 0;
      return (
        <div className="flex">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star
              key={i}
              className={`w-4 h-4 ${i <= rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`}
            />
          ))}
        </div>
      );

    case "currency":
      return <span>${Number(value).toFixed(2)}</span>;

    case "percent":
      return <span>{Number(value)}%</span>;

    default:
      return <span className="truncate">{String(value)}</span>;
  }
}

// Column Header Component
function ColumnHeader({
  field,
  onRename,
  onChangeType,
  onDelete,
  width,
  onResize,
}: {
  field: FieldData;
  onRename: (name: string) => void;
  onChangeType: (type: string) => void;
  onDelete: () => void;
  width: number;
  onResize: (width: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(field.name);
  const Icon = FIELD_TYPE_ICONS[field.type] || Type;

  const handleSaveName = () => {
    if (editName.trim() && editName !== field.name) {
      onRename(editName.trim());
    }
    setIsEditing(false);
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(80, startWidth + moveEvent.clientX - startX);
      onResize(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div
      className="relative flex items-center h-8 px-2 bg-gray-50 border-b border-r border-gray-200 group"
      style={{ width }}
    >
      {isEditing ? (
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleSaveName}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSaveName();
            if (e.key === "Escape") setIsEditing(false);
          }}
          className="flex-1 px-1 text-sm border border-blue-500 rounded focus:outline-none"
          autoFocus
        />
      ) : (
        <>
          <Icon className="w-4 h-4 text-gray-500 mr-1.5 flex-shrink-0" />
          <span className="text-sm font-medium text-gray-700 truncate flex-1">
            {field.name}
          </span>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronDown className="w-3 h-3" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px] z-50"
                sideOffset={4}
              >
                <DropdownMenu.Item
                  className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer focus:outline-none"
                  onSelect={() => setIsEditing(true)}
                >
                  Rename field
                </DropdownMenu.Item>
                <DropdownMenu.Sub>
                  <DropdownMenu.SubTrigger className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer focus:outline-none flex items-center justify-between">
                    Change type
                    <ChevronDown className="w-3 h-3 -rotate-90" />
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent
                      className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px] z-50"
                      sideOffset={4}
                    >
                      {Object.entries(FIELD_TYPE_LABELS).map(([type, label]) => {
                        const TypeIcon = FIELD_TYPE_ICONS[type] || Type;
                        return (
                          <DropdownMenu.Item
                            key={type}
                            className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer focus:outline-none flex items-center gap-2"
                            onSelect={() => onChangeType(type)}
                          >
                            <TypeIcon className="w-4 h-4 text-gray-500" />
                            {label}
                            {type === field.type && <Check className="w-4 h-4 text-blue-600 ml-auto" />}
                          </DropdownMenu.Item>
                        );
                      })}
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Portal>
                </DropdownMenu.Sub>
                <DropdownMenu.Separator className="h-px bg-gray-200 my-1" />
                <DropdownMenu.Item
                  className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer focus:outline-none"
                  onSelect={onDelete}
                >
                  Delete field
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </>
      )}

      {/* Resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 transition-colors"
        onMouseDown={handleResizeStart}
      />
    </div>
  );
}

// Grid View Component
function GridView({
  table,
  records,
  selectedRows,
  onSelectRow,
  onSelectAll,
  onCellEdit,
  onAddRow,
  onAddField,
  onFieldRename,
  onFieldChangeType,
  onFieldDelete,
  columnWidths,
  onColumnResize,
  onRecordClick,
}: {
  table: TableWithDetails;
  records: RecordData[];
  selectedRows: Set<string>;
  onSelectRow: (id: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onCellEdit: (recordId: string, fieldId: string, value: unknown) => void;
  onAddRow: () => void;
  onAddField: () => void;
  onFieldRename: (fieldId: string, name: string) => void;
  onFieldChangeType: (fieldId: string, type: string) => void;
  onFieldDelete: (fieldId: string) => void;
  columnWidths: Record<string, number>;
  onColumnResize: (fieldId: string, width: number) => void;
  onRecordClick: (record: RecordData) => void;
}) {
  const [editingCell, setEditingCell] = useState<{ recordId: string; fieldId: string } | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 5,
  });

  const allSelected = records.length > 0 && selectedRows.size === records.length;
  const someSelected = selectedRows.size > 0 && selectedRows.size < records.length;

  const getColumnWidth = (fieldId: string) => columnWidths[fieldId] || 180;

  const totalWidth = 40 + table.fields.reduce((acc, f) => acc + getColumnWidth(f.id), 0) + 100;

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header row */}
      <div className="flex border-b border-gray-200 bg-gray-50 flex-shrink-0" style={{ width: totalWidth }}>
        {/* Selection checkbox column */}
        <div className="w-10 flex items-center justify-center border-r border-gray-200 h-8">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={(e) => onSelectAll(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </div>

        {/* Field columns */}
        {table.fields.map((field) => (
          <ColumnHeader
            key={field.id}
            field={field}
            width={getColumnWidth(field.id)}
            onRename={(name) => onFieldRename(field.id, name)}
            onChangeType={(type) => onFieldChangeType(field.id, type)}
            onDelete={() => onFieldDelete(field.id)}
            onResize={(width) => onColumnResize(field.id, width)}
          />
        ))}

        {/* Add field button */}
        <button
          onClick={onAddField}
          className="w-24 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 border-b border-gray-200"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Virtualized rows */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: totalWidth,
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const record = records[virtualRow.index];
            const isSelected = selectedRows.has(record.id);

            return (
              <div
                key={record.id}
                className={`flex border-b border-gray-100 ${isSelected ? "bg-blue-50" : "hover:bg-gray-50"}`}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {/* Selection checkbox */}
                <div className="w-10 flex items-center justify-center border-r border-gray-100">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => onSelectRow(record.id, e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </div>

                {/* Data cells */}
                {table.fields.map((field, fieldIndex) => {
                  const isEditing =
                    editingCell?.recordId === record.id && editingCell?.fieldId === field.id;
                  const value = record.data[field.id];

                  return (
                    <div
                      key={field.id}
                      className="border-r border-gray-100 flex items-center cursor-pointer"
                      style={{ width: getColumnWidth(field.id), minWidth: getColumnWidth(field.id) }}
                      onClick={() => {
                        if (!isEditing) {
                          // First column click opens detail panel
                          if (fieldIndex === 0) {
                            onRecordClick(record);
                          } else {
                            setEditingCell({ recordId: record.id, fieldId: field.id });
                          }
                        }
                      }}
                      onDoubleClick={() => {
                        if (!isEditing) {
                          setEditingCell({ recordId: record.id, fieldId: field.id });
                        }
                      }}
                    >
                      {isEditing ? (
                        <CellEditor
                          field={field}
                          value={value}
                          onSave={(newValue) => {
                            onCellEdit(record.id, field.id, newValue);
                            setEditingCell(null);
                          }}
                          onCancel={() => setEditingCell(null)}
                        />
                      ) : (
                        <div className="w-full h-full px-2 flex items-center overflow-hidden">
                          <CellDisplay field={field} value={value} />
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Empty cell for add field column */}
                <div className="w-24 border-r border-gray-100" />
              </div>
            );
          })}
        </div>

        {/* Add row button */}
        <button
          onClick={onAddRow}
          className="flex items-center gap-2 px-4 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-50 w-full border-b border-gray-100"
          style={{ width: totalWidth }}
        >
          <Plus className="w-4 h-4" />
          <span className="text-sm">Add row</span>
        </button>
      </div>
    </div>
  );
}

// Kanban Card Component
function KanbanCard({
  record,
  fields,
  titleField,
  displayFields,
  isDragging,
  onClick,
}: {
  record: RecordData;
  fields: FieldData[];
  titleField: FieldData | null;
  displayFields: FieldData[];
  isDragging?: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: record.id,
    data: { record },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  const titleValue = titleField ? record.data[titleField.id] : null;
  const title = titleValue ? String(titleValue) : "Untitled";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={`bg-white border border-gray-200 rounded-lg p-3 mb-2 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all ${
        isDragging ? "opacity-50 shadow-lg ring-2 ring-blue-500" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0 cursor-grab" />
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900 truncate mb-1">{title}</h4>
          {displayFields.slice(0, 3).map((field) => {
            const value = record.data[field.id];
            if (value === null || value === undefined || value === "") return null;
            return (
              <div key={field.id} className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                <span className="text-gray-400 text-xs truncate max-w-[60px]">{field.name}:</span>
                <div className="truncate flex-1">
                  <CellDisplay field={field} value={value} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Kanban Column Component
function KanbanColumn({
  columnValue,
  records,
  fields,
  titleField,
  displayFields,
  groupField,
  onRecordClick,
  onAddRecord,
}: {
  columnValue: string;
  records: RecordData[];
  fields: FieldData[];
  titleField: FieldData | null;
  displayFields: FieldData[];
  groupField: FieldData;
  onRecordClick: (record: RecordData) => void;
  onAddRecord: (columnValue: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: columnValue || "__empty__",
    data: { columnValue },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-72 flex-shrink-0 bg-gray-100 rounded-lg ${
        isOver ? "ring-2 ring-blue-500 ring-opacity-50" : ""
      }`}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
        <div className="flex items-center gap-2">
          {columnValue ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {columnValue}
            </span>
          ) : (
            <span className="text-sm text-gray-500">No {groupField.name}</span>
          )}
          <span className="text-xs text-gray-400">({records.length})</span>
        </div>
      </div>

      {/* Cards container */}
      <div className="flex-1 overflow-y-auto p-2 min-h-[200px]">
        {records.map((record) => (
          <KanbanCard
            key={record.id}
            record={record}
            fields={fields}
            titleField={titleField}
            displayFields={displayFields}
            onClick={() => onRecordClick(record)}
          />
        ))}
      </div>

      {/* Add card button */}
      <button
        onClick={() => onAddRecord(columnValue)}
        className="flex items-center gap-2 px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-b-lg transition-colors"
      >
        <Plus className="w-4 h-4" />
        <span className="text-sm">Add card</span>
      </button>
    </div>
  );
}

// Kanban View Component
function KanbanView({
  table,
  records,
  view,
  onCellEdit,
  onAddRecord,
  onRecordClick,
  onUpdateViewConfig,
}: {
  table: TableWithDetails;
  records: RecordData[];
  view: ViewData;
  onCellEdit: (recordId: string, fieldId: string, value: unknown) => void;
  onAddRecord: (initialData?: Record<string, unknown>) => void;
  onRecordClick: (record: RecordData) => void;
  onUpdateViewConfig: (config: Partial<ViewConfig>) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Find the grouping field (single_select or user type)
  const groupByFieldId = view.config?.groupByFieldId;
  const groupField = groupByFieldId
    ? table.fields.find((f) => f.id === groupByFieldId)
    : table.fields.find((f) => f.type === "single_select" || f.type === "user");

  // Get title field (first text field)
  const titleField = table.fields.find((f) => f.type === "text") || table.fields[0] || null;

  // Get display fields (exclude title and group field)
  const displayFields = table.fields.filter(
    (f) => f.id !== titleField?.id && f.id !== groupField?.id
  );

  // Group records by the grouping field
  const groupedRecords = useMemo(() => {
    if (!groupField) {
      return { "": records };
    }

    const groups: Record<string, RecordData[]> = {};

    // Get possible values for single_select
    const options = (groupField.config?.options as string[]) || [];

    // Initialize groups with empty arrays for all options
    options.forEach((opt) => {
      groups[opt] = [];
    });

    // Also add empty group for records without a value
    groups[""] = [];

    // Distribute records to groups
    records.forEach((record) => {
      const value = String(record.data[groupField.id] || "");
      if (!groups[value]) {
        groups[value] = [];
      }
      groups[value].push(record);
    });

    return groups;
  }, [records, groupField]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || !groupField) return;

    const recordId = active.id as string;
    const newColumnValue = over.data.current?.columnValue ?? "";

    // Only update if the column changed
    const record = records.find((r) => r.id === recordId);
    if (record) {
      const currentValue = String(record.data[groupField.id] || "");
      if (currentValue !== newColumnValue) {
        onCellEdit(recordId, groupField.id, newColumnValue || null);
      }
    }
  };

  const handleAddRecord = (columnValue: string) => {
    if (groupField) {
      onAddRecord({ [groupField.id]: columnValue || null });
    } else {
      onAddRecord();
    }
  };

  const activeRecord = activeId ? records.find((r) => r.id === activeId) : null;

  // Check if there are any groupable fields
  const hasGroupableFields = table.fields.some(
    (f) => f.type === "single_select" || f.type === "user"
  );

  // Show empty state if no grouping field is available
  if (!groupField && !hasGroupableFields) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <Kanban className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 mb-4">
            Kanban view requires a Single Select or User field to group records.
          </p>
          <p className="text-sm text-gray-400">
            Add a Single Select field to your table to use Kanban view.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 h-full">
            {Object.entries(groupedRecords).map(([columnValue, columnRecords]) => (
              <KanbanColumn
                key={columnValue || "__empty__"}
                columnValue={columnValue}
                records={columnRecords}
                fields={table.fields}
                titleField={titleField}
                displayFields={displayFields}
                groupField={groupField!}
                onRecordClick={onRecordClick}
                onAddRecord={handleAddRecord}
              />
            ))}
          </div>

          <DragOverlay>
            {activeRecord && groupField ? (
              <div className="bg-white border border-blue-500 rounded-lg p-3 shadow-xl">
                <KanbanCard
                  record={activeRecord}
                  fields={table.fields}
                  titleField={titleField}
                  displayFields={displayFields}
                  isDragging
                  onClick={() => {}}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}

// Form View Component
function FormView({
  table,
  view,
  onUpdateViewConfig,
  onAddRecord,
  baseId,
}: {
  table: TableWithDetails;
  view: ViewData;
  onUpdateViewConfig: (config: Partial<ViewConfig>) => void;
  onAddRecord: (data?: Record<string, unknown>) => Promise<void>;
  baseId: string;
}) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Form settings from view config
  const description = view.config?.formDescription || "";
  const submitLabel = view.config?.formSubmitLabel || "Submit";
  const successMessage = view.config?.formSuccessMessage || "Thank you! Your response has been recorded.";
  const requiredFields = view.config?.formRequiredFields || [];
  const isPublic = view.config?.formPublicAccess ?? false;
  const shareToken = view.config?.formShareToken || "";

  // Get visible fields (exclude hidden fields)
  const visibleFields = table.fields.filter(
    (f) => !view.config?.hiddenFields?.includes(f.id)
  );

  // Generate share URL
  const shareUrl = shareToken
    ? `${window.location.origin}/form/${shareToken}`
    : "";

  const handleFieldChange = (fieldId: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = async () => {
    // Validate required fields
    for (const fieldId of requiredFields) {
      const value = formData[fieldId];
      if (value === undefined || value === null || value === "") {
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await onAddRecord(formData);
      setFormData({});
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error("Failed to submit form:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const togglePublicAccess = async () => {
    if (!isPublic) {
      // Generate a share token when enabling public access
      const token = crypto.randomUUID();
      onUpdateViewConfig({
        formPublicAccess: true,
        formShareToken: token,
      });
    } else {
      onUpdateViewConfig({
        formPublicAccess: false,
        formShareToken: "",
      });
    }
  };

  const copyShareLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const isFieldRequired = (fieldId: string) => requiredFields.includes(fieldId);

  const toggleRequired = (fieldId: string) => {
    const newRequired = isFieldRequired(fieldId)
      ? requiredFields.filter((id) => id !== fieldId)
      : [...requiredFields, fieldId];
    onUpdateViewConfig({ formRequiredFields: newRequired });
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Form preview */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-8">
        <div className="max-w-2xl mx-auto">
          {showSuccess ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
              <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Submitted!</h2>
              <p className="text-gray-600">{successMessage}</p>
              <button
                onClick={() => setShowSuccess(false)}
                className="mt-6 px-4 py-2 text-blue-600 hover:text-blue-700 font-medium"
              >
                Submit another response
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              {/* Form header */}
              <div className="px-6 py-5 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">{view.name}</h2>
                {description && (
                  <p className="mt-2 text-gray-600">{description}</p>
                )}
              </div>

              {/* Form fields */}
              <div className="px-6 py-4 space-y-5">
                {visibleFields.map((field) => {
                  const Icon = FIELD_TYPE_ICONS[field.type] || Type;
                  const required = isFieldRequired(field.id);
                  const value = formData[field.id];

                  return (
                    <div key={field.id}>
                      <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                        <Icon className="w-4 h-4 text-gray-400" />
                        {field.name}
                        {required && <span className="text-red-500">*</span>}
                      </label>
                      <FormFieldInput
                        field={field}
                        value={value}
                        onChange={(val) => handleFieldChange(field.id, val)}
                        required={required}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Submit button */}
              <div className="px-6 py-4 border-t border-gray-100">
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="w-full px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "Submitting..." : submitLabel}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Settings sidebar */}
      <div className="w-80 border-l border-gray-200 bg-white flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Form Settings</h3>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Share settings */}
          <div>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm font-medium text-gray-700">Public access</span>
              <button
                onClick={togglePublicAccess}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  isPublic ? "bg-blue-600" : "bg-gray-200"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isPublic ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </label>
            <p className="mt-1 text-xs text-gray-500">
              Allow anyone with the link to submit responses
            </p>

            {isPublic && shareUrl && (
              <div className="mt-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={shareUrl}
                    readOnly
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-gray-50 truncate"
                  />
                  <button
                    onClick={copyShareLink}
                    className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                    title="Copy link"
                  >
                    {copiedLink ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                    title="Open in new tab"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => onUpdateViewConfig({ formDescription: e.target.value })}
              placeholder="Add a description for your form..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
              rows={3}
            />
          </div>

          {/* Submit button label */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Submit button label
            </label>
            <input
              type="text"
              value={submitLabel}
              onChange={(e) => onUpdateViewConfig({ formSubmitLabel: e.target.value })}
              placeholder="Submit"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          {/* Success message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Success message
            </label>
            <textarea
              value={successMessage}
              onChange={(e) => onUpdateViewConfig({ formSuccessMessage: e.target.value })}
              placeholder="Thank you for your submission!"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
              rows={2}
            />
          </div>

          {/* Required fields */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Required fields
            </label>
            <div className="space-y-2">
              {visibleFields.map((field) => (
                <label key={field.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isFieldRequired(field.id)}
                    onChange={() => toggleRequired(field.id)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{field.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Form Field Input Component
function FormFieldInput({
  field,
  value,
  onChange,
  required,
}: {
  field: FieldData;
  value: unknown;
  onChange: (value: unknown) => void;
  required?: boolean;
}) {
  switch (field.type) {
    case "checkbox":
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-600">Yes</span>
        </label>
      );

    case "number":
    case "currency":
    case "percent":
      return (
        <input
          type="number"
          value={value !== undefined && value !== null ? String(value) : ""}
          onChange={(e) => onChange(e.target.valueAsNumber || null)}
          required={required}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={`Enter ${field.name.toLowerCase()}...`}
        />
      );

    case "date":
      return (
        <input
          type="date"
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value || null)}
          required={required}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      );

    case "datetime":
      return (
        <input
          type="datetime-local"
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value || null)}
          required={required}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      );

    case "single_select":
      const options = (field.config?.options as string[]) || [];
      return (
        <select
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value || null)}
          required={required}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select...</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );

    case "long_text":
      return (
        <textarea
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value || null)}
          required={required}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          rows={4}
          placeholder={`Enter ${field.name.toLowerCase()}...`}
        />
      );

    case "email":
      return (
        <input
          type="email"
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value || null)}
          required={required}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="email@example.com"
        />
      );

    case "url":
      return (
        <input
          type="url"
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value || null)}
          required={required}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="https://..."
        />
      );

    case "phone":
      return (
        <input
          type="tel"
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value || null)}
          required={required}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="+1 234 567 8900"
        />
      );

    case "rating":
      const currentRating = Number(value) || 0;
      return (
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => onChange(i === currentRating ? null : i)}
              className="p-1"
            >
              <Star
                className={`w-6 h-6 ${
                  i <= currentRating
                    ? "text-yellow-400 fill-yellow-400"
                    : "text-gray-300 hover:text-yellow-200"
                }`}
              />
            </button>
          ))}
        </div>
      );

    default:
      return (
        <input
          type="text"
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value || null)}
          required={required}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={`Enter ${field.name.toLowerCase()}...`}
        />
      );
  }
}

// Record Detail Panel Component
function RecordDetailPanel({
  record,
  fields,
  onClose,
  onCellEdit,
}: {
  record: RecordData;
  fields: FieldData[];
  onClose: () => void;
  onCellEdit: (fieldId: string, value: unknown) => void;
}) {
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);

  return (
    <div className="w-96 border-l border-gray-200 bg-white flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Record Details</h3>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {fields.map((field) => {
            const value = record.data[field.id];
            const isEditing = editingFieldId === field.id;
            const Icon = FIELD_TYPE_ICONS[field.type] || Type;

            return (
              <div key={field.id} className="space-y-1">
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-500">
                  <Icon className="w-4 h-4" />
                  {field.name}
                </label>
                <div
                  className="min-h-[36px] px-3 py-2 border border-gray-200 rounded-lg cursor-pointer hover:border-gray-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500"
                  onClick={() => {
                    if (!isEditing) {
                      setEditingFieldId(field.id);
                    }
                  }}
                >
                  {isEditing ? (
                    <CellEditor
                      field={field}
                      value={value}
                      onSave={(newValue) => {
                        onCellEdit(field.id, newValue);
                        setEditingFieldId(null);
                      }}
                      onCancel={() => setEditingFieldId(null)}
                    />
                  ) : value !== null && value !== undefined && value !== "" ? (
                    <CellDisplay field={field} value={value} />
                  ) : (
                    <span className="text-gray-400">Empty</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 text-xs text-gray-400">
        <div>Created: {new Date(record.createdAt).toLocaleString()}</div>
        <div>Updated: {new Date(record.updatedAt).toLocaleString()}</div>
      </div>
    </div>
  );
}

// Calendar View Component
function CalendarView({
  table,
  records,
  view,
  onCellEdit,
  onRecordClick,
  onUpdateViewConfig,
}: {
  table: TableWithDetails;
  records: RecordData[];
  view: ViewData;
  onCellEdit: (recordId: string, fieldId: string, value: unknown) => void;
  onRecordClick: (record: RecordData) => void;
  onUpdateViewConfig: (config: Partial<ViewConfig>) => void;
}) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dragRecord, setDragRecord] = useState<RecordData | null>(null);

  // Get date fields
  const dateFields = table.fields.filter(
    (f) => f.type === "date" || f.type === "datetime"
  );
  const dateFieldId = view.config?.dateFieldId || dateFields[0]?.id;
  const endDateFieldId = view.config?.endDateFieldId;
  const titleField = table.fields.find((f) => f.type === "text") || table.fields[0];

  // Navigation
  const prevMonth = () => setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  // Build calendar grid
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay();
  const totalDays = lastDay.getDate();

  const weeks: (number | null)[][] = [];
  let currentWeek: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) currentWeek.push(null);
  for (let d = 1; d <= totalDays; d++) {
    currentWeek.push(d);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }

  // Map records to dates
  const recordsByDate = useMemo(() => {
    const map: Record<string, RecordData[]> = {};
    if (!dateFieldId) return map;
    records.forEach((r) => {
      const val = r.data[dateFieldId];
      if (!val) return;
      const dateStr = String(val).slice(0, 10);
      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push(r);
    });
    return map;
  }, [records, dateFieldId]);

  const formatDateKey = (day: number) => {
    const m = String(month + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    return `${year}-${m}-${d}`;
  };

  const today = new Date();
  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const handleDrop = (day: number) => {
    if (!dragRecord || !dateFieldId) return;
    const newDate = formatDateKey(day);
    onCellEdit(dragRecord.id, dateFieldId, newDate);
    setDragRecord(null);
  };

  if (!dateFieldId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <Calendar className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 mb-4">
            Calendar view requires a Date or Date & Time field.
          </p>
          <p className="text-sm text-gray-400">
            Add a Date field to your table to use Calendar view.
          </p>
        </div>
      </div>
    );
  }

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Config bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-gray-50">
        <label className="text-xs text-gray-500">Date field:</label>
        <select
          value={dateFieldId}
          onChange={(e) => onUpdateViewConfig({ dateFieldId: e.target.value })}
          className="text-sm px-2 py-1 border border-gray-300 rounded"
        >
          {dateFields.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <label className="text-xs text-gray-500 ml-2">End date:</label>
        <select
          value={endDateFieldId || ""}
          onChange={(e) => onUpdateViewConfig({ endDateFieldId: e.target.value || undefined })}
          className="text-sm px-2 py-1 border border-gray-300 rounded"
        >
          <option value="">None</option>
          {dateFields.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      {/* Month navigation */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-100">
        <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold text-gray-900 min-w-[180px] text-center">
          {monthNames[month]} {year}
        </h2>
        <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded">
          <ChevronRight className="w-5 h-5" />
        </button>
        <button
          onClick={goToday}
          className="text-sm text-blue-600 hover:text-blue-700 ml-2"
        >
          Today
        </button>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse table-fixed">
          <thead>
            <tr>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <th
                  key={d}
                  className="text-xs font-medium text-gray-500 py-2 text-center border-b border-gray-200"
                >
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, wi) => (
              <tr key={wi}>
                {week.map((day, di) => {
                  const dateKey = day ? formatDateKey(day) : "";
                  const dayRecords = day ? recordsByDate[dateKey] || [] : [];
                  return (
                    <td
                      key={di}
                      className={`border border-gray-100 align-top h-28 p-1 ${
                        day ? "bg-white hover:bg-gray-50" : "bg-gray-50"
                      }`}
                      onDragOver={(e) => { if (day) e.preventDefault(); }}
                      onDrop={() => { if (day) handleDrop(day); }}
                    >
                      {day && (
                        <>
                          <div
                            className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                              isToday(day)
                                ? "bg-blue-600 text-white"
                                : "text-gray-600"
                            }`}
                          >
                            {day}
                          </div>
                          <div className="space-y-0.5 overflow-hidden max-h-20">
                            {dayRecords.slice(0, 3).map((r) => (
                              <div
                                key={r.id}
                                draggable
                                onDragStart={() => setDragRecord(r)}
                                onDragEnd={() => setDragRecord(null)}
                                onClick={() => onRecordClick(r)}
                                className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded truncate cursor-pointer hover:bg-blue-200"
                                title={titleField ? String(r.data[titleField.id] || "Untitled") : "Record"}
                              >
                                {titleField ? String(r.data[titleField.id] || "Untitled") : "Record"}
                              </div>
                            ))}
                            {dayRecords.length > 3 && (
                              <div className="text-xs text-gray-400 pl-1.5">
                                +{dayRecords.length - 3} more
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Gantt View Component
function GanttView({
  table,
  records,
  view,
  onCellEdit,
  onRecordClick,
  onUpdateViewConfig,
}: {
  table: TableWithDetails;
  records: RecordData[];
  view: ViewData;
  onCellEdit: (recordId: string, fieldId: string, value: unknown) => void;
  onRecordClick: (record: RecordData) => void;
  onUpdateViewConfig: (config: Partial<ViewConfig>) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{
    recordId: string;
    mode: "move" | "resize";
    startX: number;
    originalStart: string;
    originalEnd: string;
  } | null>(null);

  const dateFields = table.fields.filter(
    (f) => f.type === "date" || f.type === "datetime"
  );
  const startFieldId = view.config?.startDateFieldId || dateFields[0]?.id;
  const endFieldId = view.config?.endDateFieldId || view.config?.durationFieldId || dateFields[1]?.id || dateFields[0]?.id;
  const titleField = table.fields.find((f) => f.type === "text") || table.fields[0];

  // Link fields for dependency arrows
  const linkFields = table.fields.filter((f) => f.type === "link");

  // Compute date range
  const { minDate, maxDate, dayCount, dayWidth } = useMemo(() => {
    const DAY_WIDTH = 36;
    let min = new Date();
    let max = new Date();
    let hasDate = false;

    records.forEach((r) => {
      if (startFieldId && r.data[startFieldId]) {
        const d = new Date(String(r.data[startFieldId]));
        if (!isNaN(d.getTime())) {
          if (!hasDate || d < min) min = new Date(d);
          if (!hasDate || d > max) max = new Date(d);
          hasDate = true;
        }
      }
      if (endFieldId && r.data[endFieldId]) {
        const d = new Date(String(r.data[endFieldId]));
        if (!isNaN(d.getTime())) {
          if (!hasDate || d < min) min = new Date(d);
          if (!hasDate || d > max) max = new Date(d);
          hasDate = true;
        }
      }
    });

    // Pad by 7 days on each side
    min.setDate(min.getDate() - 7);
    max.setDate(max.getDate() + 14);
    const days = Math.max(30, Math.ceil((max.getTime() - min.getTime()) / (1000 * 60 * 60 * 24)));
    return { minDate: min, maxDate: max, dayCount: days, dayWidth: DAY_WIDTH };
  }, [records, startFieldId, endFieldId]);

  const dayToX = (dateStr: string) => {
    const d = new Date(dateStr);
    const diff = (d.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24);
    return Math.round(diff * dayWidth);
  };

  const xToDate = (x: number) => {
    const days = Math.round(x / dayWidth);
    const d = new Date(minDate);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  // Generate month labels and day columns
  const headerMonths = useMemo(() => {
    const months: { label: string; startX: number; width: number }[] = [];
    const d = new Date(minDate);
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    while (d <= maxDate) {
      const monthStart = new Date(d);
      const monthLabel = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const endOfPeriod = nextMonth <= maxDate ? nextMonth : new Date(maxDate);
      const daysDiff = (endOfPeriod.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24);
      const startX = dayToX(monthStart.toISOString().slice(0, 10));
      months.push({ label: monthLabel, startX, width: daysDiff * dayWidth });
      d.setMonth(d.getMonth() + 1);
      d.setDate(1);
    }
    return months;
  }, [minDate, maxDate, dayWidth]);

  // Drag handling
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragState || !startFieldId) return;
      const dx = e.clientX - dragState.startX;
      const daysDelta = Math.round(dx / dayWidth);
      if (daysDelta === 0) return;

      const origStart = new Date(dragState.originalStart);
      const origEnd = new Date(dragState.originalEnd);

      if (dragState.mode === "move") {
        const newStart = new Date(origStart);
        newStart.setDate(newStart.getDate() + daysDelta);
        const newEnd = new Date(origEnd);
        newEnd.setDate(newEnd.getDate() + daysDelta);
        onCellEdit(dragState.recordId, startFieldId, newStart.toISOString().slice(0, 10));
        if (endFieldId && endFieldId !== startFieldId) {
          onCellEdit(dragState.recordId, endFieldId, newEnd.toISOString().slice(0, 10));
        }
      } else {
        // resize - move end date
        const newEnd = new Date(origEnd);
        newEnd.setDate(newEnd.getDate() + daysDelta);
        if (newEnd >= origStart && endFieldId) {
          onCellEdit(dragState.recordId, endFieldId, newEnd.toISOString().slice(0, 10));
        }
      }
    },
    [dragState, dayWidth, startFieldId, endFieldId, onCellEdit]
  );

  const handleMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  useEffect(() => {
    if (dragState) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [dragState, handleMouseMove, handleMouseUp]);

  if (!startFieldId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <GanttChart className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 mb-4">
            Gantt view requires at least one Date field for start dates.
          </p>
          <p className="text-sm text-gray-400">
            Add Date fields to your table to use Gantt view.
          </p>
        </div>
      </div>
    );
  }

  // Build dependency map from link fields
  const dependencies: { from: string; to: string }[] = [];
  linkFields.forEach((lf) => {
    records.forEach((r) => {
      const linked = r.data[lf.id];
      if (Array.isArray(linked)) {
        linked.forEach((targetId) => {
          if (typeof targetId === "string") {
            dependencies.push({ from: r.id, to: targetId });
          }
        });
      } else if (typeof linked === "string" && linked) {
        dependencies.push({ from: r.id, to: linked });
      }
    });
  });

  // Row positions for dependency arrows
  const ROW_HEIGHT = 40;
  const HEADER_HEIGHT = 56;
  const recordIndexMap: Record<string, number> = {};
  records.forEach((r, i) => { recordIndexMap[r.id] = i; });

  const totalWidth = dayCount * dayWidth;
  const todayX = dayToX(new Date().toISOString().slice(0, 10));

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Config bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-gray-50">
        <label className="text-xs text-gray-500">Start date:</label>
        <select
          value={startFieldId}
          onChange={(e) => onUpdateViewConfig({ startDateFieldId: e.target.value })}
          className="text-sm px-2 py-1 border border-gray-300 rounded"
        >
          {dateFields.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <label className="text-xs text-gray-500 ml-2">End date:</label>
        <select
          value={endFieldId || ""}
          onChange={(e) => onUpdateViewConfig({ endDateFieldId: e.target.value || undefined })}
          className="text-sm px-2 py-1 border border-gray-300 rounded"
        >
          <option value="">Same as start</option>
          {dateFields.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      {/* Gantt chart */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar - record names */}
        <div className="w-52 flex-shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
          <div className="h-14 border-b border-gray-200 flex items-end px-3 pb-2">
            <span className="text-xs font-medium text-gray-500 uppercase">Records</span>
          </div>
          {records.map((r) => (
            <div
              key={r.id}
              className="h-10 flex items-center px-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 truncate"
              onClick={() => onRecordClick(r)}
            >
              <span className="text-sm text-gray-800 truncate">
                {titleField ? String(r.data[titleField.id] || "Untitled") : "Record"}
              </span>
            </div>
          ))}
        </div>

        {/* Right - timeline */}
        <div ref={scrollRef} className="flex-1 overflow-auto">
          <div style={{ width: totalWidth, minHeight: "100%" }} className="relative">
            {/* Month header */}
            <div className="sticky top-0 z-10 bg-white border-b border-gray-200 h-14">
              <div className="h-7 flex border-b border-gray-100">
                {headerMonths.map((m, i) => (
                  <div
                    key={i}
                    className="text-xs font-medium text-gray-600 px-2 flex items-center border-r border-gray-100"
                    style={{ position: "absolute", left: m.startX, width: m.width }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
              {/* Day ticks */}
              <div className="h-7 relative">
                {Array.from({ length: dayCount }).map((_, i) => {
                  const d = new Date(minDate);
                  d.setDate(d.getDate() + i);
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <div
                      key={i}
                      className={`absolute text-center text-[10px] leading-7 ${
                        isWeekend ? "text-gray-300" : "text-gray-400"
                      }`}
                      style={{ left: i * dayWidth, width: dayWidth }}
                    >
                      {d.getDate()}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Today line */}
            <div
              className="absolute top-0 bottom-0 w-px bg-red-400 z-5"
              style={{ left: todayX }}
            />

            {/* Rows */}
            {records.map((r, rowIndex) => {
              const startVal = r.data[startFieldId];
              const endVal = endFieldId ? r.data[endFieldId] : startVal;
              if (!startVal) {
                return (
                  <div
                    key={r.id}
                    className="h-10 border-b border-gray-50"
                  />
                );
              }

              const startStr = String(startVal).slice(0, 10);
              const endStr = endVal ? String(endVal).slice(0, 10) : startStr;

              const barLeft = dayToX(startStr);
              const barRight = dayToX(endStr) + dayWidth;
              const barWidth = Math.max(barRight - barLeft, dayWidth);

              return (
                <div
                  key={r.id}
                  className="h-10 relative border-b border-gray-50"
                >
                  {/* Weekend shading handled by bars */}
                  <div
                    className="absolute top-1 rounded h-8 bg-blue-500 hover:bg-blue-600 cursor-grab flex items-center px-2 group select-none"
                    style={{ left: barLeft, width: barWidth }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setDragState({
                        recordId: r.id,
                        mode: "move",
                        startX: e.clientX,
                        originalStart: startStr,
                        originalEnd: endStr,
                      });
                    }}
                    onClick={() => onRecordClick(r)}
                  >
                    <span className="text-xs text-white truncate font-medium">
                      {titleField ? String(r.data[titleField.id] || "") : ""}
                    </span>
                    {/* Resize handle */}
                    {endFieldId && endFieldId !== startFieldId && (
                      <div
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-700 rounded-r"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragState({
                            recordId: r.id,
                            mode: "resize",
                            startX: e.clientX,
                            originalStart: startStr,
                            originalEnd: endStr,
                          });
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}

            {/* Dependency arrows (SVG overlay) */}
            {dependencies.length > 0 && (
              <svg
                className="absolute top-0 left-0 pointer-events-none"
                style={{ width: totalWidth, height: records.length * ROW_HEIGHT + HEADER_HEIGHT }}
              >
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="8"
                    markerHeight="6"
                    refX="8"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 8 3, 0 6" fill="#6b7280" />
                  </marker>
                </defs>
                {dependencies.map((dep, i) => {
                  const fromIdx = recordIndexMap[dep.from];
                  const toIdx = recordIndexMap[dep.to];
                  if (fromIdx === undefined || toIdx === undefined) return null;

                  const fromRecord = records[fromIdx];
                  const toRecord = records[toIdx];
                  const fromEnd = fromRecord.data[endFieldId || startFieldId];
                  const toStart = toRecord.data[startFieldId];
                  if (!fromEnd || !toStart) return null;

                  const fromX = dayToX(String(fromEnd).slice(0, 10)) + dayWidth;
                  const fromY = HEADER_HEIGHT + fromIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
                  const toX = dayToX(String(toStart).slice(0, 10));
                  const toY = HEADER_HEIGHT + toIdx * ROW_HEIGHT + ROW_HEIGHT / 2;

                  const midX = fromX + (toX - fromX) / 2;

                  return (
                    <path
                      key={i}
                      d={`M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`}
                      fill="none"
                      stroke="#9ca3af"
                      strokeWidth="1.5"
                      markerEnd="url(#arrowhead)"
                    />
                  );
                })}
              </svg>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Main Base Page Component
export default function BasePage() {
  const params = useParams();
  const router = useRouter();
  const baseId = params.id as string;

  const [base, setBase] = useState<BaseData | null>(null);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [activeTable, setActiveTable] = useState<TableWithDetails | null>(null);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [records, setRecords] = useState<RecordData[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<RecordData | null>(null);

  // Dialog states
  const [isAddTableOpen, setIsAddTableOpen] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [isAddFieldOpen, setIsAddFieldOpen] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [isAddViewOpen, setIsAddViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [newViewType, setNewViewType] = useState<"grid" | "kanban" | "calendar" | "gantt" | "form">("grid");
  const [showAutomations, setShowAutomations] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);

  const getToken = () => getCookie("session_token");

  // Get active view
  const activeView = activeTable?.views.find((v) => v.id === activeViewId) || activeTable?.views[0];

  // Fetch base data
  const fetchBase = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch(`/api/bases/${baseId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBase(data);
        // Set first table as active if exists
        if (data.tables?.length > 0 && !activeTableId) {
          setActiveTableId(data.tables[0].id);
        }
      } else if (res.status === 404) {
        router.push("/app/base");
      }
    } catch (error) {
      console.error("Failed to fetch base:", error);
    } finally {
      setIsLoading(false);
    }
  }, [baseId, router, activeTableId]);

  // Fetch table details
  const fetchTable = useCallback(async () => {
    if (!activeTableId) return;

    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch(`/api/tables/${activeTableId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setActiveTable(data);
        // Set first view as active if exists
        if (data.views?.length > 0 && !activeViewId) {
          setActiveViewId(data.views[0].id);
        }
      }
    } catch (error) {
      console.error("Failed to fetch table:", error);
    }
  }, [activeTableId, activeViewId]);

  // Fetch records with filters and sorts from view config
  const fetchRecords = useCallback(async () => {
    if (!activeTableId) return;

    const token = getToken();
    if (!token) return;

    try {
      // Build query params
      const params = new URLSearchParams();
      params.set("limit", "100");

      // Apply filters from view config
      if (activeView?.config?.filters && activeView.config.filters.length > 0) {
        // Convert filter array to the API format: { fieldId: { op, value } }
        const filterObj: Record<string, { op: string; value: unknown }> = {};
        for (const filter of activeView.config.filters) {
          filterObj[filter.fieldId] = { op: filter.op, value: filter.value };
        }
        params.set("filters", JSON.stringify(filterObj));
      }

      // Apply sorts from view config
      if (activeView?.config?.sorts && activeView.config.sorts.length > 0) {
        params.set("sort", JSON.stringify(activeView.config.sorts));
      }

      const res = await fetch(`/api/tables/${activeTableId}/records?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
      }
    } catch (error) {
      console.error("Failed to fetch records:", error);
    }
  }, [activeTableId, activeView?.config?.filters, activeView?.config?.sorts]);

  useEffect(() => {
    fetchBase();
  }, [fetchBase]);

  useEffect(() => {
    if (activeTableId) {
      fetchTable();
      fetchRecords();
    }
  }, [activeTableId, fetchTable, fetchRecords]);

  // Add new table
  const addTable = async () => {
    if (!newTableName.trim()) return;

    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch(`/api/bases/${baseId}/tables`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newTableName.trim() }),
      });

      if (res.ok) {
        const newTable = await res.json();
        setBase((prev) =>
          prev ? { ...prev, tables: [...prev.tables, newTable] } : null
        );
        setActiveTableId(newTable.id);
        setIsAddTableOpen(false);
        setNewTableName("");
      }
    } catch (error) {
      console.error("Failed to create table:", error);
    }
  };

  // Add new field
  const addField = async () => {
    if (!newFieldName.trim() || !activeTableId) return;

    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch(`/api/tables/${activeTableId}/fields`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newFieldName.trim(),
          type: newFieldType,
        }),
      });

      if (res.ok) {
        fetchTable();
        setIsAddFieldOpen(false);
        setNewFieldName("");
        setNewFieldType("text");
      }
    } catch (error) {
      console.error("Failed to create field:", error);
    }
  };

  // Add new view
  const addView = async () => {
    if (!newViewName.trim() || !activeTableId) return;

    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch(`/api/tables/${activeTableId}/views`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newViewName.trim(),
          type: newViewType,
          config: {},
        }),
      });

      if (res.ok) {
        const newView = await res.json();
        fetchTable();
        setActiveViewId(newView.id);
        setIsAddViewOpen(false);
        setNewViewName("");
        setNewViewType("grid");
      }
    } catch (error) {
      console.error("Failed to create view:", error);
    }
  };

  // Update view config
  const updateViewConfig = async (config: Partial<ViewConfig>) => {
    if (!activeView) return;

    const token = getToken();
    if (!token) return;

    try {
      await fetch(`/api/views/${activeView.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ config }),
      });
      fetchTable();
    } catch (error) {
      console.error("Failed to update view config:", error);
    }
  };

  // Add new record
  const addRecord = async (initialData?: Record<string, unknown>) => {
    if (!activeTableId) return;

    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch(`/api/tables/${activeTableId}/records`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: initialData || {} }),
      });

      if (res.ok) {
        const newRecord = await res.json();
        setRecords((prev) => [...prev, newRecord]);
      }
    } catch (error) {
      console.error("Failed to create record:", error);
    }
  };

  // Edit cell
  const editCell = async (recordId: string, fieldId: string, value: unknown) => {
    const token = getToken();
    if (!token) return;

    // Optimistic update
    setRecords((prev) =>
      prev.map((r) =>
        r.id === recordId ? { ...r, data: { ...r.data, [fieldId]: value } } : r
      )
    );

    // Also update selected record if it's the same
    if (selectedRecord?.id === recordId) {
      setSelectedRecord((prev) =>
        prev ? { ...prev, data: { ...prev.data, [fieldId]: value } } : null
      );
    }

    try {
      await fetch(`/api/records/${recordId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: { [fieldId]: value } }),
      });
    } catch (error) {
      console.error("Failed to update record:", error);
      // Revert on error
      fetchRecords();
    }
  };

  // Field operations
  const renameField = async (fieldId: string, name: string) => {
    const token = getToken();
    if (!token) return;

    try {
      await fetch(`/api/fields/${fieldId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });
      fetchTable();
    } catch (error) {
      console.error("Failed to rename field:", error);
    }
  };

  const changeFieldType = async (fieldId: string, type: string) => {
    const token = getToken();
    if (!token) return;

    try {
      await fetch(`/api/fields/${fieldId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type }),
      });
      fetchTable();
    } catch (error) {
      console.error("Failed to change field type:", error);
    }
  };

  const deleteField = async (fieldId: string) => {
    const token = getToken();
    if (!token) return;

    try {
      await fetch(`/api/fields/${fieldId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchTable();
    } catch (error) {
      console.error("Failed to delete field:", error);
    }
  };

  // Row selection
  const selectRow = (id: string, selected: boolean) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const selectAll = (selected: boolean) => {
    if (selected) {
      setSelectedRows(new Set(records.map((r) => r.id)));
    } else {
      setSelectedRows(new Set());
    }
  };

  // Column resize
  const resizeColumn = (fieldId: string, width: number) => {
    setColumnWidths((prev) => ({ ...prev, [fieldId]: width }));
  };

  // Record click handler
  const handleRecordClick = (record: RecordData) => {
    setSelectedRecord(record);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!base) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-500">Base not found</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Base header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
          {base.icon ? (
            <span className="text-lg">{base.icon}</span>
          ) : (
            <Grid3X3 className="w-4 h-4 text-blue-600" />
          )}
        </div>
        <h1 className="text-lg font-semibold text-gray-900">{base.name}</h1>
      </div>

      {/* Table tabs */}
      <div className="flex items-center border-b border-gray-200 px-2 bg-gray-50">
        {base.tables.map((table) => (
          <button
            key={table.id}
            onClick={() => {
              setActiveTableId(table.id);
              setActiveViewId(null);
              setSelectedRecord(null);
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTableId === table.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {table.name}
          </button>
        ))}
        <button
          onClick={() => setIsAddTableOpen(true)}
          className="px-3 py-2 text-gray-500 hover:text-gray-700"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* View tabs */}
      {activeTable && (
        <div className="flex items-center border-b border-gray-200 px-2 bg-white">
          {activeTable.views.map((view) => {
            const ViewIcon = view.type === "kanban" ? Kanban : view.type === "calendar" ? Calendar : view.type === "gantt" ? GanttChart : view.type === "form" ? FileText : Grid3X3;
            return (
              <button
                key={view.id}
                onClick={() => {
                  setActiveViewId(view.id);
                  setSelectedRecord(null);
                  setShowAutomations(false);
                  setShowDashboard(false);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border-b-2 -mb-px ${
                  activeViewId === view.id && !showAutomations && !showDashboard
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-600 hover:text-gray-900"
                }`}
              >
                <ViewIcon className="w-4 h-4" />
                {view.name}
              </button>
            );
          })}
          {activeTable.views.length === 0 && !showAutomations && (
            <span className="px-3 py-1.5 text-sm text-gray-500 flex items-center gap-1.5">
              <Grid3X3 className="w-4 h-4" />
              Grid View
            </span>
          )}
          <button
            onClick={() => setIsAddViewOpen(true)}
            className="px-3 py-1.5 text-gray-500 hover:text-gray-700"
          >
            <Plus className="w-4 h-4" />
          </button>
          {/* Right-aligned tabs */}
          <div className="flex-1" />
          <button
            onClick={() => {
              setShowDashboard(true);
              setShowAutomations(false);
              setSelectedRecord(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border-b-2 -mb-px ${
              showDashboard
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Dashboard
          </button>
          <button
            onClick={() => {
              setShowAutomations(true);
              setShowDashboard(false);
              setSelectedRecord(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border-b-2 -mb-px ${
              showAutomations
                ? "border-yellow-500 text-yellow-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            <Zap className="w-4 h-4" />
            Automations
          </button>
        </div>
      )}

      {/* View toolbar with filter/sort/group - hidden when showing automations */}
      {activeTable && activeView && !showAutomations && !showDashboard && (
        <ViewToolbar
          fields={activeTable.fields}
          filters={activeView.config?.filters || []}
          sorts={activeView.config?.sorts || []}
          groupByFieldId={activeView.config?.groupByFieldId}
          onFiltersChange={(filters) => updateViewConfig({ filters })}
          onSortsChange={(sorts) => updateViewConfig({ sorts })}
          onGroupByChange={(groupByFieldId) => updateViewConfig({ groupByFieldId })}
          showGroupBy={activeView.type === "kanban" || activeView.type === "grid"}
        />
      )}

      {/* Main content area with optional detail panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Dashboard panel */}
        {showDashboard && base && (
          <DashboardPanel
            baseId={baseId}
            tables={base.tables.map((t) => ({
              id: t.id,
              name: t.name,
              fields: activeTable?.id === t.id ? activeTable.fields : [],
            }))}
            token={getToken() || ""}
          />
        )}

        {/* Automations panel */}
        {showAutomations && base && (
          <AutomationsPanel
            baseId={baseId}
            tables={base.tables.map((t) => ({
              id: t.id,
              name: t.name,
              fields: activeTable?.id === t.id ? activeTable.fields : [],
            }))}
            token={getToken() || ""}
          />
        )}

        {/* View content - hidden when showing automations */}
        {activeTable && !showAutomations && !showDashboard && (
          <>
            {activeView?.type === "kanban" ? (
              <KanbanView
                table={activeTable}
                records={records}
                view={activeView}
                onCellEdit={editCell}
                onAddRecord={addRecord}
                onRecordClick={handleRecordClick}
                onUpdateViewConfig={updateViewConfig}
              />
            ) : activeView?.type === "form" ? (
              <FormView
                table={activeTable}
                view={activeView}
                onUpdateViewConfig={updateViewConfig}
                onAddRecord={addRecord}
                baseId={baseId}
              />
            ) : activeView?.type === "calendar" ? (
              <CalendarView
                table={activeTable}
                records={records}
                view={activeView}
                onCellEdit={editCell}
                onRecordClick={handleRecordClick}
                onUpdateViewConfig={updateViewConfig}
              />
            ) : activeView?.type === "gantt" ? (
              <GanttView
                table={activeTable}
                records={records}
                view={activeView}
                onCellEdit={editCell}
                onRecordClick={handleRecordClick}
                onUpdateViewConfig={updateViewConfig}
              />
            ) : (
              <GridView
                table={activeTable}
                records={records}
                selectedRows={selectedRows}
                onSelectRow={selectRow}
                onSelectAll={selectAll}
                onCellEdit={editCell}
                onAddRow={() => addRecord()}
                onAddField={() => setIsAddFieldOpen(true)}
                onFieldRename={renameField}
                onFieldChangeType={changeFieldType}
                onFieldDelete={deleteField}
                columnWidths={columnWidths}
                onColumnResize={resizeColumn}
                onRecordClick={handleRecordClick}
              />
            )}
          </>
        )}

        {/* Record detail panel (not shown for form view or automations) */}
        {selectedRecord && activeTable && activeView?.type !== "form" && !showAutomations && !showDashboard && (
          <RecordDetailPanel
            record={selectedRecord}
            fields={activeTable.fields}
            onClose={() => setSelectedRecord(null)}
            onCellEdit={(fieldId, value) => editCell(selectedRecord.id, fieldId, value)}
          />
        )}
      </div>

      {/* Empty state */}
      {!activeTable && base.tables.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Grid3X3 className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 mb-4">No tables yet</p>
            <button
              onClick={() => setIsAddTableOpen(true)}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Create your first table
            </button>
          </div>
        </div>
      )}

      {/* Add Table Dialog */}
      <Dialog.Root open={isAddTableOpen} onOpenChange={setIsAddTableOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-[400px]">
            <Dialog.Title className="text-lg font-semibold text-gray-900 mb-4">
              Add Table
            </Dialog.Title>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                type="text"
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                placeholder="Table name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") addTable();
                }}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsAddTableOpen(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={addTable}
                disabled={!newTableName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Add Field Dialog */}
      <Dialog.Root open={isAddFieldOpen} onOpenChange={setIsAddFieldOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-[400px]">
            <Dialog.Title className="text-lg font-semibold text-gray-900 mb-4">
              Add Field
            </Dialog.Title>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  placeholder="Field name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type
                </label>
                <select
                  value={newFieldType}
                  onChange={(e) => setNewFieldType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(FIELD_TYPE_LABELS).map(([type, label]) => (
                    <option key={type} value={type}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsAddFieldOpen(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={addField}
                disabled={!newFieldName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Add View Dialog */}
      <Dialog.Root open={isAddViewOpen} onOpenChange={setIsAddViewOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-[400px]">
            <Dialog.Title className="text-lg font-semibold text-gray-900 mb-4">
              Add View
            </Dialog.Title>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={newViewName}
                  onChange={(e) => setNewViewName(e.target.value)}
                  placeholder="View name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setNewViewType("grid")}
                    className={`flex items-center gap-2 px-4 py-3 border rounded-lg transition-colors ${
                      newViewType === "grid"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <Grid3X3 className="w-5 h-5" />
                    <span className="font-medium">Grid</span>
                  </button>
                  <button
                    onClick={() => setNewViewType("kanban")}
                    className={`flex items-center gap-2 px-4 py-3 border rounded-lg transition-colors ${
                      newViewType === "kanban"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <Kanban className="w-5 h-5" />
                    <span className="font-medium">Kanban</span>
                  </button>
                  <button
                    onClick={() => setNewViewType("calendar")}
                    className={`flex items-center gap-2 px-4 py-3 border rounded-lg transition-colors ${
                      newViewType === "calendar"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <Calendar className="w-5 h-5" />
                    <span className="font-medium">Calendar</span>
                  </button>
                  <button
                    onClick={() => setNewViewType("gantt")}
                    className={`flex items-center gap-2 px-4 py-3 border rounded-lg transition-colors ${
                      newViewType === "gantt"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <GanttChart className="w-5 h-5" />
                    <span className="font-medium">Gantt</span>
                  </button>
                  <button
                    onClick={() => setNewViewType("form")}
                    className={`flex items-center gap-2 px-4 py-3 border rounded-lg transition-colors ${
                      newViewType === "form"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <FileText className="w-5 h-5" />
                    <span className="font-medium">Form</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsAddViewOpen(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={addView}
                disabled={!newViewName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
