"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type KeyboardEvent,
} from "react";
import { type Document as DocType } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  Type,
  Hash,
} from "lucide-react";

// ─── Types ───
interface CellData {
  value: string;
  formula?: string;
  format?: CellFormat;
}

interface CellFormat {
  bold?: boolean;
  italic?: boolean;
  fontSize?: number;
  textColor?: string;
  bgColor?: string;
  align?: "left" | "center" | "right";
  numberFormat?: "auto" | "number" | "currency" | "percent";
  borderBottom?: boolean;
  borderRight?: boolean;
}

type CellKey = string; // "A1", "B2", etc.

interface SheetState {
  cells: Record<CellKey, CellData>;
  colWidths: Record<number, number>;
  rowHeights: Record<number, number>;
}

// ─── Helpers ───
const DEFAULT_COL_WIDTH = 100;
const DEFAULT_ROW_HEIGHT = 28;
const NUM_COLS = 26; // A-Z
const NUM_ROWS = 100;

function colLabel(col: number): string {
  return String.fromCharCode(65 + col);
}

function cellKey(row: number, col: number): CellKey {
  return `${colLabel(col)}${row + 1}`;
}

function parseCellKey(key: string): { row: number; col: number } | null {
  const match = key.match(/^([A-Z])(\d+)$/);
  if (!match) return null;
  return {
    col: match[1]!.charCodeAt(0) - 65,
    row: parseInt(match[2]!) - 1,
  };
}

// Simple formula evaluator
function evaluateFormula(
  formula: string,
  cells: Record<CellKey, CellData>
): string {
  if (!formula.startsWith("=")) return formula;

  const expr = formula.slice(1).toUpperCase();

  // Parse range references like A1:A5
  const getCellValue = (key: string): number => {
    const cell = cells[key];
    if (!cell) return 0;
    if (cell.formula) {
      const result = evaluateFormula(cell.formula, cells);
      return parseFloat(result) || 0;
    }
    return parseFloat(cell.value) || 0;
  };

  const expandRange = (range: string): string[] => {
    const parts = range.split(":");
    if (parts.length !== 2) return [range];
    const start = parseCellKey(parts[0]!);
    const end = parseCellKey(parts[1]!);
    if (!start || !end) return [range];

    const keys: string[] = [];
    for (let r = start.row; r <= end.row; r++) {
      for (let c = start.col; c <= end.col; c++) {
        keys.push(cellKey(r, c));
      }
    }
    return keys;
  };

  try {
    // =SUM(A1:A5) or =SUM(A1, B1, C1)
    const sumMatch = expr.match(/^SUM\((.+)\)$/);
    if (sumMatch) {
      const args = sumMatch[1]!.split(",").flatMap((a) => expandRange(a.trim()));
      const sum = args.reduce((acc, key) => acc + getCellValue(key), 0);
      return String(sum);
    }

    // =AVERAGE(A1:A5)
    const avgMatch = expr.match(/^AVERAGE\((.+)\)$/);
    if (avgMatch) {
      const args = avgMatch[1]!.split(",").flatMap((a) => expandRange(a.trim()));
      const sum = args.reduce((acc, key) => acc + getCellValue(key), 0);
      return args.length > 0 ? String(sum / args.length) : "0";
    }

    // =COUNT(A1:A5)
    const countMatch = expr.match(/^COUNT\((.+)\)$/);
    if (countMatch) {
      const args = countMatch[1]!.split(",").flatMap((a) => expandRange(a.trim()));
      const count = args.filter((key) => {
        const cell = cells[key];
        return cell && cell.value !== "" && !isNaN(parseFloat(cell.value));
      }).length;
      return String(count);
    }

    // =IF(condition, true_val, false_val) - simplified
    const ifMatch = expr.match(/^IF\((.+)\)$/);
    if (ifMatch) {
      const parts = ifMatch[1]!.split(",").map((p) => p.trim());
      if (parts.length >= 3) {
        // Simple comparison: A1>0
        const cond = parts[0]!;
        const gtMatch = cond.match(/^([A-Z]\d+)>(\d+)$/);
        const ltMatch = cond.match(/^([A-Z]\d+)<(\d+)$/);
        const eqMatch = cond.match(/^([A-Z]\d+)=(\d+)$/);

        let result = false;
        if (gtMatch) result = getCellValue(gtMatch[1]!) > parseFloat(gtMatch[2]!);
        else if (ltMatch) result = getCellValue(ltMatch[1]!) < parseFloat(ltMatch[2]!);
        else if (eqMatch) result = getCellValue(eqMatch[1]!) === parseFloat(eqMatch[2]!);

        return result ? parts[1]! : parts[2]!;
      }
    }

    // =VLOOKUP(search, range, col_index) - simplified
    const vlookupMatch = expr.match(/^VLOOKUP\((.+)\)$/);
    if (vlookupMatch) {
      const parts = vlookupMatch[1]!.split(",").map((p) => p.trim());
      if (parts.length >= 3) {
        const searchVal = getCellValue(parts[0]!);
        const range = expandRange(parts[1]!);
        const colIdx = parseInt(parts[2]!) - 1;

        // Find first match in the first column of range
        for (const key of range) {
          if (getCellValue(key) === searchVal) {
            const pos = parseCellKey(key);
            if (pos) {
              const resultKey = cellKey(pos.row, pos.col + colIdx);
              const resultCell = cells[resultKey];
              return resultCell?.value ?? "";
            }
          }
        }
        return "#N/A";
      }
    }

    // Simple cell reference: =A1
    const refMatch = expr.match(/^([A-Z]\d+)$/);
    if (refMatch) {
      return String(getCellValue(refMatch[1]!));
    }

    // Basic arithmetic: =A1+B1, =A1*2
    const arithExpr = expr.replace(/([A-Z]\d+)/g, (match) => String(getCellValue(match)));
    try {
      // Only allow safe characters
      if (/^[\d+\-*/().%\s]+$/.test(arithExpr)) {
        const fn = new Function(`return ${arithExpr}`);
        const result = fn();
        return String(result);
      }
    } catch {
      // fall through
    }

    return "#ERROR";
  } catch {
    return "#ERROR";
  }
}

// ─── Sheet Editor Component ───
interface SheetEditorProps {
  document: DocType;
  readOnly?: boolean;
  currentUser?: { id: string; displayName: string | null } | null;
}

export function SheetEditor({ document, readOnly = false }: SheetEditorProps) {
  const [sheetState, setSheetState] = useState<SheetState>({
    cells: {},
    colWidths: {},
    rowHeights: {},
  });
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [formulaBarValue, setFormulaBarValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Current cell format
  const selectedKey = selectedCell ? cellKey(selectedCell.row, selectedCell.col) : null;
  const selectedCellData = selectedKey ? sheetState.cells[selectedKey] : null;
  const currentFormat: CellFormat = selectedCellData?.format ?? {};

  // Get display value for a cell
  const getDisplayValue = useCallback(
    (key: CellKey): string => {
      const cell = sheetState.cells[key];
      if (!cell) return "";
      if (cell.formula) {
        return evaluateFormula(cell.formula, sheetState.cells);
      }
      return cell.value;
    },
    [sheetState.cells]
  );

  // Update formula bar when selection changes
  useEffect(() => {
    if (selectedKey) {
      const cell = sheetState.cells[selectedKey];
      setFormulaBarValue(cell?.formula || cell?.value || "");
    } else {
      setFormulaBarValue("");
    }
  }, [selectedKey, sheetState.cells]);

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    const key = cellKey(editingCell.row, editingCell.col);
    const isFormula = editValue.startsWith("=");

    setSheetState((prev) => ({
      ...prev,
      cells: {
        ...prev.cells,
        [key]: {
          ...prev.cells[key],
          value: isFormula ? "" : editValue,
          formula: isFormula ? editValue : undefined,
          format: prev.cells[key]?.format,
        },
      },
    }));
    setEditingCell(null);
  }, [editingCell, editValue]);

  const startEditing = useCallback(
    (row: number, col: number) => {
      if (readOnly) return;
      const key = cellKey(row, col);
      const cell = sheetState.cells[key];
      setEditingCell({ row, col });
      setEditValue(cell?.formula || cell?.value || "");
      setTimeout(() => editInputRef.current?.focus(), 0);
    },
    [readOnly, sheetState.cells]
  );

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      setSelectedCell({ row, col });
      if (editingCell) commitEdit();
    },
    [editingCell, commitEdit]
  );

  const handleCellDoubleClick = useCallback(
    (row: number, col: number) => {
      startEditing(row, col);
    },
    [startEditing]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!selectedCell) return;

      if (editingCell) {
        if (e.key === "Enter") {
          e.preventDefault();
          commitEdit();
          setSelectedCell({ row: selectedCell.row + 1, col: selectedCell.col });
        } else if (e.key === "Tab") {
          e.preventDefault();
          commitEdit();
          setSelectedCell({
            row: selectedCell.row,
            col: Math.min(selectedCell.col + 1, NUM_COLS - 1),
          });
        } else if (e.key === "Escape") {
          setEditingCell(null);
        }
        return;
      }

      // Navigation without editing
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          setSelectedCell({ row: Math.max(0, selectedCell.row - 1), col: selectedCell.col });
          break;
        case "ArrowDown":
        case "Enter":
          e.preventDefault();
          setSelectedCell({ row: Math.min(NUM_ROWS - 1, selectedCell.row + 1), col: selectedCell.col });
          break;
        case "ArrowLeft":
          e.preventDefault();
          setSelectedCell({ row: selectedCell.row, col: Math.max(0, selectedCell.col - 1) });
          break;
        case "ArrowRight":
        case "Tab":
          e.preventDefault();
          setSelectedCell({ row: selectedCell.row, col: Math.min(NUM_COLS - 1, selectedCell.col + 1) });
          break;
        case "Delete":
        case "Backspace":
          e.preventDefault();
          if (!readOnly && selectedKey) {
            setSheetState((prev) => {
              const next = { ...prev, cells: { ...prev.cells } };
              delete next.cells[selectedKey];
              return next;
            });
          }
          break;
        default:
          // Start editing on any printable character
          if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
            startEditing(selectedCell.row, selectedCell.col);
          }
      }
    },
    [selectedCell, editingCell, commitEdit, readOnly, selectedKey, startEditing]
  );

  // Toggle format
  const toggleFormat = useCallback(
    (key: keyof CellFormat, value?: unknown) => {
      if (!selectedKey) return;
      setSheetState((prev) => {
        const cell = prev.cells[selectedKey] ?? { value: "" };
        const format = cell.format ?? {};
        return {
          ...prev,
          cells: {
            ...prev.cells,
            [selectedKey]: {
              ...cell,
              format: {
                ...format,
                [key]: value !== undefined ? value : !format[key as keyof CellFormat],
              },
            },
          },
        };
      });
    },
    [selectedKey]
  );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-950" onKeyDown={handleKeyDown} tabIndex={0}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
        <button
          onClick={() => toggleFormat("bold")}
          className={cn(
            "p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700",
            currentFormat.bold && "bg-gray-200 dark:bg-gray-700"
          )}
          title="Bold"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          onClick={() => toggleFormat("italic")}
          className={cn(
            "p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700",
            currentFormat.italic && "bg-gray-200 dark:bg-gray-700"
          )}
          title="Italic"
        >
          <Italic className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-gray-300 dark:bg-gray-700 mx-1" />
        <button
          onClick={() => toggleFormat("align", "left")}
          className={cn(
            "p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700",
            currentFormat.align === "left" && "bg-gray-200 dark:bg-gray-700"
          )}
          title="Align Left"
        >
          <AlignLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => toggleFormat("align", "center")}
          className={cn(
            "p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700",
            currentFormat.align === "center" && "bg-gray-200 dark:bg-gray-700"
          )}
          title="Align Center"
        >
          <AlignCenter className="w-4 h-4" />
        </button>
        <button
          onClick={() => toggleFormat("align", "right")}
          className={cn(
            "p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700",
            currentFormat.align === "right" && "bg-gray-200 dark:bg-gray-700"
          )}
          title="Align Right"
        >
          <AlignRight className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-gray-300 dark:bg-gray-700 mx-1" />
        <select
          value={currentFormat.fontSize ?? 13}
          onChange={(e) => toggleFormat("fontSize", parseInt(e.target.value))}
          className="px-1 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300"
          title="Font Size"
        >
          {[10, 11, 12, 13, 14, 16, 18, 20, 24].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <div className="w-px h-5 bg-gray-300 dark:bg-gray-700 mx-1" />
        <label className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer" title="Text Color">
          <Type className="w-4 h-4" style={{ color: currentFormat.textColor || "currentColor" }} />
          <input
            type="color"
            className="sr-only"
            value={currentFormat.textColor || "#000000"}
            onChange={(e) => toggleFormat("textColor", e.target.value)}
          />
        </label>
        <label className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer" title="Background Color">
          <Palette className="w-4 h-4" style={{ color: currentFormat.bgColor || "currentColor" }} />
          <input
            type="color"
            className="sr-only"
            value={currentFormat.bgColor || "#ffffff"}
            onChange={(e) => toggleFormat("bgColor", e.target.value)}
          />
        </label>
        <div className="w-px h-5 bg-gray-300 dark:bg-gray-700 mx-1" />
        <select
          value={currentFormat.numberFormat ?? "auto"}
          onChange={(e) => toggleFormat("numberFormat", e.target.value)}
          className="px-1 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300"
          title="Number Format"
        >
          <option value="auto">Auto</option>
          <option value="number">Number</option>
          <option value="currency">Currency</option>
          <option value="percent">Percent</option>
        </select>
      </div>

      {/* Formula bar */}
      <div className="flex items-center px-2 py-1 border-b border-gray-200 dark:border-gray-800 gap-2">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-10 text-center shrink-0">
          {selectedKey || ""}
        </span>
        <div className="w-px h-5 bg-gray-300 dark:bg-gray-700" />
        <Hash className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <input
          type="text"
          value={formulaBarValue}
          onChange={(e) => setFormulaBarValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && selectedCell) {
              e.preventDefault();
              const key = cellKey(selectedCell.row, selectedCell.col);
              const isFormula = formulaBarValue.startsWith("=");
              setSheetState((prev) => ({
                ...prev,
                cells: {
                  ...prev.cells,
                  [key]: {
                    ...prev.cells[key],
                    value: isFormula ? "" : formulaBarValue,
                    formula: isFormula ? formulaBarValue : undefined,
                    format: prev.cells[key]?.format,
                  },
                },
              }));
            }
          }}
          className="flex-1 text-sm bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none"
          placeholder="Enter value or formula (e.g., =SUM(A1:A5))"
          readOnly={readOnly}
        />
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto" ref={gridRef}>
        <table className="border-collapse" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr>
              {/* Row number header corner */}
              <th className="sticky left-0 top-0 z-20 w-10 h-7 bg-gray-100 dark:bg-gray-900 border-b border-r border-gray-300 dark:border-gray-700" />
              {/* Column headers */}
              {Array.from({ length: NUM_COLS }, (_, col) => (
                <th
                  key={col}
                  className="sticky top-0 z-10 h-7 bg-gray-100 dark:bg-gray-900 border-b border-r border-gray-300 dark:border-gray-700 text-xs font-medium text-gray-500 dark:text-gray-400 text-center"
                  style={{ width: sheetState.colWidths[col] ?? DEFAULT_COL_WIDTH }}
                >
                  {colLabel(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: NUM_ROWS }, (_, row) => (
              <tr key={row}>
                {/* Row number */}
                <td className="sticky left-0 z-10 w-10 bg-gray-100 dark:bg-gray-900 border-b border-r border-gray-300 dark:border-gray-700 text-xs font-medium text-gray-500 dark:text-gray-400 text-center">
                  {row + 1}
                </td>
                {/* Cells */}
                {Array.from({ length: NUM_COLS }, (_, col) => {
                  const key = cellKey(row, col);
                  const isSelected =
                    selectedCell?.row === row && selectedCell?.col === col;
                  const isEditing =
                    editingCell?.row === row && editingCell?.col === col;
                  const cellData = sheetState.cells[key];
                  const format = cellData?.format;
                  const displayVal = getDisplayValue(key);

                  return (
                    <td
                      key={col}
                      className={cn(
                        "border-b border-r border-gray-200 dark:border-gray-800 relative",
                        isSelected && "outline outline-2 outline-blue-500 z-10",
                        format?.borderBottom && "border-b-2 border-b-gray-400",
                        format?.borderRight && "border-r-2 border-r-gray-400"
                      )}
                      style={{
                        width: sheetState.colWidths[col] ?? DEFAULT_COL_WIDTH,
                        height: sheetState.rowHeights[row] ?? DEFAULT_ROW_HEIGHT,
                        backgroundColor: format?.bgColor,
                      }}
                      onClick={() => handleCellClick(row, col)}
                      onDoubleClick={() => handleCellDoubleClick(row, col)}
                    >
                      {isEditing ? (
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="absolute inset-0 w-full h-full px-1 text-sm bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 border-none outline-none"
                          style={{
                            fontSize: format?.fontSize ?? 13,
                            textAlign: format?.align ?? "left",
                          }}
                        />
                      ) : (
                        <div
                          className="px-1 truncate text-sm leading-7 text-gray-900 dark:text-gray-100"
                          style={{
                            fontWeight: format?.bold ? "bold" : undefined,
                            fontStyle: format?.italic ? "italic" : undefined,
                            fontSize: format?.fontSize ?? 13,
                            color: format?.textColor,
                            textAlign: format?.align ?? "left",
                          }}
                        >
                          {displayVal}
                        </div>
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
