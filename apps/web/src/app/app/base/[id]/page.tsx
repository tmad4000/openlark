"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Plus,
  ChevronDown,
  Grid3X3,
  Kanban,
  Calendar,
  MoreHorizontal,
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
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import { useVirtualizer } from "@tanstack/react-virtual";

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
  config: Record<string, unknown>;
  position: number;
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
      const options = ((field.config?.options as string[]) || []);
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
  const [isResizing, setIsResizing] = useState(false);
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
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(80, startWidth + moveEvent.clientX - startX);
      onResize(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
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
                {table.fields.map((field) => {
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

  // Dialog states
  const [isAddTableOpen, setIsAddTableOpen] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [isAddFieldOpen, setIsAddFieldOpen] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");

  const getToken = () => getCookie("session_token");

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

  // Fetch records
  const fetchRecords = useCallback(async () => {
    if (!activeTableId) return;

    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch(`/api/tables/${activeTableId}/records?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
      }
    } catch (error) {
      console.error("Failed to fetch records:", error);
    }
  }, [activeTableId]);

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

  // Add new record
  const addRecord = async () => {
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
        body: JSON.stringify({ data: {} }),
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
            onClick={() => setActiveTableId(table.id)}
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
            const ViewIcon = view.type === "kanban" ? Kanban : view.type === "calendar" ? Calendar : Grid3X3;
            return (
              <button
                key={view.id}
                onClick={() => setActiveViewId(view.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border-b-2 -mb-px ${
                  activeViewId === view.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-600 hover:text-gray-900"
                }`}
              >
                <ViewIcon className="w-4 h-4" />
                {view.name}
              </button>
            );
          })}
          {activeTable.views.length === 0 && (
            <span className="px-3 py-1.5 text-sm text-gray-500 flex items-center gap-1.5">
              <Grid3X3 className="w-4 h-4" />
              Grid View
            </span>
          )}
        </div>
      )}

      {/* Grid view */}
      {activeTable && (
        <GridView
          table={activeTable}
          records={records}
          selectedRows={selectedRows}
          onSelectRow={selectRow}
          onSelectAll={selectAll}
          onCellEdit={editCell}
          onAddRow={addRecord}
          onAddField={() => setIsAddFieldOpen(true)}
          onFieldRename={renameField}
          onFieldChangeType={changeFieldType}
          onFieldDelete={deleteField}
          columnWidths={columnWidths}
          onColumnResize={resizeColumn}
        />
      )}

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
    </div>
  );
}
