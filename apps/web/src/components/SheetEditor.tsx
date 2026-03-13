"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import { HyperFormula } from "hyperformula";
import {
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Paintbrush,
  Type,
  ChevronDown,
  Undo,
  Redo,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CellData {
  v?: string; // raw value or formula
  f?: string; // display format
  s?: CellStyle;
}

interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  fontSize?: number;
  textColor?: string;
  bgColor?: string;
  align?: "left" | "center" | "right";
  numberFormat?: string;
  borderTop?: boolean;
  borderRight?: boolean;
  borderBottom?: boolean;
  borderLeft?: boolean;
}

export interface Collaborator {
  clientId: number;
  name: string;
  color: string;
}

export interface SheetEditorHandle {
  // expose nothing for now
}

interface SheetEditorProps {
  documentId: string;
  yjsDocId: string;
  token: string;
  userName: string;
  userColor?: string;
  onSyncStatusChange?: (status: "syncing" | "synced" | "offline") => void;
  onCollaboratorsChange?: (collaborators: Collaborator[]) => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_ROWS = 100;
const DEFAULT_COLS = 26;
const ROW_HEIGHT = 28;
const DEFAULT_COL_WIDTH = 100;
const ROW_HEADER_WIDTH = 50;
const HEADER_HEIGHT = 28;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function colLabel(index: number): string {
  let label = "";
  let n = index;
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

function cellRef(row: number, col: number): string {
  return `${colLabel(col)}${row + 1}`;
}

// Random user color
function randomColor(): string {
  const colors = [
    "#ef4444",
    "#f97316",
    "#eab308",
    "#22c55e",
    "#06b6d4",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// ─── Component ───────────────────────────────────────────────────────────────

const SheetEditor = forwardRef<SheetEditorHandle, SheetEditorProps>(
  function SheetEditor(
    {
      documentId,
      yjsDocId,
      token,
      userName,
      userColor,
      onSyncStatusChange,
      onCollaboratorsChange,
    },
    ref
  ) {
    // ─── Refs & State ──────────────────────────────────────────────────────

    const containerRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const formulaInputRef = useRef<HTMLInputElement>(null);

    const ydocRef = useRef<Y.Doc | null>(null);
    const providerRef = useRef<HocuspocusProvider | null>(null);
    const hfRef = useRef<HyperFormula | null>(null);
    const yCellsRef = useRef<Y.Map<unknown> | null>(null);
    const yStylesRef = useRef<Y.Map<unknown> | null>(null);

    const [selectedCell, setSelectedCell] = useState<{
      row: number;
      col: number;
    } | null>(null);
    const [editingCell, setEditingCell] = useState<{
      row: number;
      col: number;
    } | null>(null);
    const [editValue, setEditValue] = useState("");
    const [formulaBarValue, setFormulaBarValue] = useState("");
    const [formulaBarFocused, setFormulaBarFocused] = useState(false);

    // Computed cell values from HyperFormula
    const [displayValues, setDisplayValues] = useState<
      Map<string, string>
    >(new Map());
    // Raw cell data from Yjs
    const [cellData, setCellData] = useState<Map<string, CellData>>(
      new Map()
    );
    // Cell styles from Yjs
    const [cellStyles, setCellStyles] = useState<Map<string, CellStyle>>(
      new Map()
    );
    // Collaborator cursors
    const [collaboratorCursors, setCollaboratorCursors] = useState<
      Map<number, { row: number; col: number; name: string; color: string }>
    >(new Map());

    // Selection range for multi-cell select
    const [selectionRange, setSelectionRange] = useState<{
      startRow: number;
      startCol: number;
      endRow: number;
      endCol: number;
    } | null>(null);
    const isSelectingRef = useRef(false);

    // Scroll state for virtualization
    const [scrollTop, setScrollTop] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);

    // Formatting UI
    const [showBgColorPicker, setShowBgColorPicker] = useState(false);
    const [showTextColorPicker, setShowTextColorPicker] = useState(false);
    const [showFontSizePicker, setShowFontSizePicker] = useState(false);
    const [showNumberFormatPicker, setShowNumberFormatPicker] = useState(false);

    useImperativeHandle(ref, () => ({}));

    // ─── HyperFormula Setup ────────────────────────────────────────────────

    useEffect(() => {
      const hf = HyperFormula.buildEmpty({
        licenseKey: "gpl-v3",
      });
      hf.addSheet("Sheet1");
      hfRef.current = hf;

      return () => {
        hf.destroy();
      };
    }, []);

    // ─── Yjs + Hocuspocus Setup ────────────────────────────────────────────

    useEffect(() => {
      const ydoc = new Y.Doc();
      ydocRef.current = ydoc;

      const yCells = ydoc.getMap("sheet-cells");
      const yStyles = ydoc.getMap("sheet-styles");
      yCellsRef.current = yCells;
      yStylesRef.current = yStyles;

      const color = userColor || randomColor();

      const provider = new HocuspocusProvider({
        url:
          process.env.NEXT_PUBLIC_COLLAB_WS_URL || "ws://localhost:1234",
        name: yjsDocId,
        document: ydoc,
        token,
        onSynced() {
          onSyncStatusChange?.("synced");
          // Load initial data from Yjs into state
          syncFromYjs();
        },
        onStatus({ status }: { status: string }) {
          if (status === "connecting") {
            onSyncStatusChange?.("syncing");
          } else if (status === "disconnected") {
            onSyncStatusChange?.("offline");
          }
        },
        onAwarenessUpdate({
          states,
        }: {
          states: Array<{
            clientId: number;
            [key: string]: unknown;
          }>;
        }) {
          const cursors = new Map<
            number,
            { row: number; col: number; name: string; color: string }
          >();
          const collabs: Collaborator[] = [];

          for (const state of states) {
            const user = state.user as
              | { name: string; color: string; cursor?: { row: number; col: number } }
              | undefined;
            if (
              user &&
              state.clientId !== ydoc.clientID
            ) {
              collabs.push({
                clientId: state.clientId,
                name: user.name,
                color: user.color,
              });
              if (user.cursor) {
                cursors.set(state.clientId, {
                  row: user.cursor.row,
                  col: user.cursor.col,
                  name: user.name,
                  color: user.color,
                });
              }
            }
          }

          setCollaboratorCursors(cursors);
          onCollaboratorsChange?.(collabs);
        },
      });

      providerRef.current = provider;

      // Set awareness
      provider.setAwarenessField("user", {
        name: userName,
        color,
        cursor: null,
      });

      // Listen for Yjs changes
      const handleCellsChange = () => {
        syncFromYjs();
      };

      yCells.observe(handleCellsChange);
      yStyles.observe(() => {
        syncStylesFromYjs();
      });

      function syncFromYjs() {
        const hf = hfRef.current;
        if (!hf) return;

        const newCellData = new Map<string, CellData>();
        const newDisplayValues = new Map<string, string>();

        // Clear HyperFormula sheet and rebuild
        const sheetId = hf.getSheetId("Sheet1");
        if (sheetId === undefined) return;

        // Build a 2D array for HyperFormula
        let maxRow = 0;
        let maxCol = 0;

        yCells.forEach((_val: unknown, key: string) => {
          try {
            const data = JSON.parse(String(_val)) as CellData;
            newCellData.set(key, data);
            // Parse key like "0,5"
            const [r, c] = key.split(",").map(Number);
            if (r > maxRow) maxRow = r;
            if (c > maxCol) maxCol = c;
          } catch {
            // ignore invalid
          }
        });

        // Build content array
        const rows = maxRow + 1;
        const cols = maxCol + 1;
        const content: (string | number | null)[][] = Array.from(
          { length: rows },
          () => Array.from({ length: cols }, () => null)
        );

        newCellData.forEach((data, key) => {
          const [r, c] = key.split(",").map(Number);
          const raw = data.v ?? "";
          // If it starts with '=', it's a formula
          if (typeof raw === "string" && raw.startsWith("=")) {
            content[r][c] = raw;
          } else {
            // Try to parse as number
            const num = Number(raw);
            content[r][c] = raw === "" ? null : isNaN(num) ? raw : num;
          }
        });

        // Set sheet content
        hf.setSheetContent(sheetId, content);

        // Compute display values
        for (const [key, data] of newCellData) {
          const [r, c] = key.split(",").map(Number);
          try {
            const val = hf.getCellValue({
              sheet: sheetId,
              row: r,
              col: c,
            });
            if (val === null || val === undefined) {
              newDisplayValues.set(key, "");
            } else if (typeof val === "object" && "type" in val) {
              // Error object
              newDisplayValues.set(key, `#${(val as { type: string }).type}!`);
            } else {
              newDisplayValues.set(key, String(val));
            }
          } catch {
            newDisplayValues.set(key, data.v ?? "");
          }
        }

        setCellData(newCellData);
        setDisplayValues(newDisplayValues);
      }

      function syncStylesFromYjs() {
        const newStyles = new Map<string, CellStyle>();
        yStyles.forEach((_val: unknown, key: string) => {
          try {
            newStyles.set(key, JSON.parse(String(_val)) as CellStyle);
          } catch {
            // ignore
          }
        });
        setCellStyles(newStyles);
      }

      return () => {
        yCells.unobserve(handleCellsChange);
        provider.destroy();
        ydoc.destroy();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [yjsDocId, token, userName, userColor]);

    // ─── Cell Operations ───────────────────────────────────────────────────

    const setCellValue = useCallback(
      (row: number, col: number, value: string) => {
        const yCells = yCellsRef.current;
        if (!yCells) return;

        const key = `${row},${col}`;
        if (value === "") {
          yCells.delete(key);
        } else {
          const existing = yCells.get(key);
          let data: CellData = {};
          if (existing) {
            try {
              data = JSON.parse(String(existing)) as CellData;
            } catch {
              // ignore
            }
          }
          data.v = value;
          yCells.set(key, JSON.stringify(data));
        }
        onSyncStatusChange?.("syncing");
        // Will sync back through Yjs observer
      },
      [onSyncStatusChange]
    );

    const setCellStyleValue = useCallback(
      (row: number, col: number, style: Partial<CellStyle>) => {
        const yStyles = yStylesRef.current;
        if (!yStyles) return;

        const key = `${row},${col}`;
        const existing = yStyles.get(key);
        let current: CellStyle = {};
        if (existing) {
          try {
            current = JSON.parse(String(existing)) as CellStyle;
          } catch {
            // ignore
          }
        }
        const merged = { ...current, ...style };
        yStyles.set(key, JSON.stringify(merged));
      },
      []
    );

    // ─── Selection & Navigation ────────────────────────────────────────────

    const selectCell = useCallback(
      (row: number, col: number) => {
        setSelectedCell({ row, col });
        setSelectionRange(null);
        setEditingCell(null);

        // Update formula bar
        const key = `${row},${col}`;
        const data = cellData.get(key);
        setFormulaBarValue(data?.v ?? "");

        // Update awareness cursor
        const provider = providerRef.current;
        if (provider) {
          provider.setAwarenessField("user", {
            name: userName,
            color: userColor || "#3b82f6",
            cursor: { row, col },
          });
        }
      },
      [cellData, userName, userColor]
    );

    const startEditing = useCallback(
      (row: number, col: number, initialValue?: string) => {
        const key = `${row},${col}`;
        const data = cellData.get(key);
        const val = initialValue ?? data?.v ?? "";
        setEditingCell({ row, col });
        setEditValue(val);
        setFormulaBarValue(val);
      },
      [cellData]
    );

    const commitEdit = useCallback(() => {
      if (!editingCell) return;
      setCellValue(editingCell.row, editingCell.col, editValue);
      setEditingCell(null);
    }, [editingCell, editValue, setCellValue]);

    const cancelEdit = useCallback(() => {
      setEditingCell(null);
      setEditValue("");
    }, []);

    // ─── Keyboard Navigation ───────────────────────────────────────────────

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (!selectedCell) return;

        const { row, col } = selectedCell;

        if (editingCell) {
          if (e.key === "Enter") {
            e.preventDefault();
            commitEdit();
            selectCell(
              Math.min(row + 1, DEFAULT_ROWS - 1),
              col
            );
          } else if (e.key === "Tab") {
            e.preventDefault();
            commitEdit();
            if (e.shiftKey) {
              selectCell(row, Math.max(col - 1, 0));
            } else {
              selectCell(row, Math.min(col + 1, DEFAULT_COLS - 1));
            }
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancelEdit();
          }
          return;
        }

        // Not editing
        switch (e.key) {
          case "Enter":
            e.preventDefault();
            startEditing(row, col);
            break;
          case "Tab":
            e.preventDefault();
            if (e.shiftKey) {
              selectCell(row, Math.max(col - 1, 0));
            } else {
              selectCell(row, Math.min(col + 1, DEFAULT_COLS - 1));
            }
            break;
          case "ArrowUp":
            e.preventDefault();
            selectCell(Math.max(row - 1, 0), col);
            break;
          case "ArrowDown":
            e.preventDefault();
            selectCell(Math.min(row + 1, DEFAULT_ROWS - 1), col);
            break;
          case "ArrowLeft":
            e.preventDefault();
            selectCell(row, Math.max(col - 1, 0));
            break;
          case "ArrowRight":
            e.preventDefault();
            selectCell(row, Math.min(col + 1, DEFAULT_COLS - 1));
            break;
          case "Delete":
          case "Backspace":
            e.preventDefault();
            setCellValue(row, col, "");
            setFormulaBarValue("");
            break;
          case "F2":
            e.preventDefault();
            startEditing(row, col);
            break;
          default:
            // Start typing -> enter edit mode
            if (
              e.key.length === 1 &&
              !e.ctrlKey &&
              !e.metaKey &&
              !e.altKey
            ) {
              e.preventDefault();
              startEditing(row, col, e.key);
            }
            break;
        }
      },
      [
        selectedCell,
        editingCell,
        commitEdit,
        cancelEdit,
        selectCell,
        startEditing,
        setCellValue,
      ]
    );

    // ─── Formula Bar ───────────────────────────────────────────────────────

    const handleFormulaBarKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (selectedCell) {
            setCellValue(
              selectedCell.row,
              selectedCell.col,
              formulaBarValue
            );
            setEditingCell(null);
            setFormulaBarFocused(false);
            // Refocus grid
            gridRef.current?.focus();
          }
        } else if (e.key === "Escape") {
          e.preventDefault();
          if (selectedCell) {
            const key = `${selectedCell.row},${selectedCell.col}`;
            const data = cellData.get(key);
            setFormulaBarValue(data?.v ?? "");
          }
          setFormulaBarFocused(false);
          gridRef.current?.focus();
        }
      },
      [selectedCell, formulaBarValue, cellData, setCellValue]
    );

    const handleFormulaBarChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormulaBarValue(e.target.value);
        if (editingCell) {
          setEditValue(e.target.value);
        }
      },
      [editingCell]
    );

    // ─── Formatting Operations ─────────────────────────────────────────────

    const applyStyleToSelection = useCallback(
      (style: Partial<CellStyle>) => {
        if (selectionRange) {
          const { startRow, startCol, endRow, endCol } = selectionRange;
          const r0 = Math.min(startRow, endRow);
          const r1 = Math.max(startRow, endRow);
          const c0 = Math.min(startCol, endCol);
          const c1 = Math.max(startCol, endCol);
          for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) {
              setCellStyleValue(r, c, style);
            }
          }
        } else if (selectedCell) {
          setCellStyleValue(selectedCell.row, selectedCell.col, style);
        }
      },
      [selectedCell, selectionRange, setCellStyleValue]
    );

    const getSelectedStyle = useCallback((): CellStyle => {
      if (!selectedCell) return {};
      const key = `${selectedCell.row},${selectedCell.col}`;
      return cellStyles.get(key) || {};
    }, [selectedCell, cellStyles]);

    const currentStyle = useMemo(() => getSelectedStyle(), [getSelectedStyle]);

    // ─── Scroll Handling ───────────────────────────────────────────────────

    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      setScrollTop(target.scrollTop);
      setScrollLeft(target.scrollLeft);
    }, []);

    // ─── Virtualized Grid Rendering ────────────────────────────────────────

    const gridHeight = containerRef.current?.clientHeight
      ? containerRef.current.clientHeight - HEADER_HEIGHT - 84 // toolbar + formula bar
      : 600;
    const gridWidth = containerRef.current?.clientWidth ?? 1000;

    const visibleRowStart = Math.max(
      0,
      Math.floor(scrollTop / ROW_HEIGHT) - 2
    );
    const visibleRowEnd = Math.min(
      DEFAULT_ROWS,
      visibleRowStart + Math.ceil(gridHeight / ROW_HEIGHT) + 4
    );

    const visibleColStart = Math.max(
      0,
      Math.floor(scrollLeft / DEFAULT_COL_WIDTH) - 1
    );
    const visibleColEnd = Math.min(
      DEFAULT_COLS,
      visibleColStart + Math.ceil(gridWidth / DEFAULT_COL_WIDTH) + 2
    );

    // ─── Mouse Handlers ────────────────────────────────────────────────────

    const handleCellMouseDown = useCallback(
      (row: number, col: number, e: React.MouseEvent) => {
        e.preventDefault();
        if (editingCell) {
          commitEdit();
        }
        selectCell(row, col);
        setSelectionRange({
          startRow: row,
          startCol: col,
          endRow: row,
          endCol: col,
        });
        isSelectingRef.current = true;
      },
      [editingCell, commitEdit, selectCell]
    );

    const handleCellMouseEnter = useCallback(
      (row: number, col: number) => {
        if (isSelectingRef.current && selectionRange) {
          setSelectionRange((prev) =>
            prev ? { ...prev, endRow: row, endCol: col } : null
          );
        }
      },
      [selectionRange]
    );

    const handleMouseUp = useCallback(() => {
      isSelectingRef.current = false;
    }, []);

    const handleCellDoubleClick = useCallback(
      (row: number, col: number) => {
        startEditing(row, col);
      },
      [startEditing]
    );

    // Focus the editing input when editingCell changes
    useEffect(() => {
      if (editingCell && inputRef.current) {
        inputRef.current.focus();
      }
    }, [editingCell]);

    // ─── Cell in selection? ────────────────────────────────────────────────

    const isCellInSelection = useCallback(
      (row: number, col: number): boolean => {
        if (!selectionRange) return false;
        const { startRow, startCol, endRow, endCol } = selectionRange;
        const r0 = Math.min(startRow, endRow);
        const r1 = Math.max(startRow, endRow);
        const c0 = Math.min(startCol, endCol);
        const c1 = Math.max(startCol, endCol);
        return row >= r0 && row <= r1 && col >= c0 && col <= c1;
      },
      [selectionRange]
    );

    // ─── Color presets ─────────────────────────────────────────────────────

    const colorPresets = [
      "#000000",
      "#434343",
      "#666666",
      "#999999",
      "#cccccc",
      "#ffffff",
      "#ff0000",
      "#ff9900",
      "#ffff00",
      "#00ff00",
      "#00ffff",
      "#0000ff",
      "#9900ff",
      "#ff00ff",
      "#f4cccc",
      "#fce5cd",
      "#fff2cc",
      "#d9ead3",
      "#d0e0e3",
      "#cfe2f3",
      "#d9d2e9",
      "#ead1dc",
    ];

    const fontSizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36];

    const numberFormats = [
      { label: "Auto", value: "" },
      { label: "Number", value: "#,##0.00" },
      { label: "Currency", value: "$#,##0.00" },
      { label: "Percent", value: "0.00%" },
      { label: "Date", value: "MM/DD/YYYY" },
      { label: "Text", value: "@" },
    ];

    // ─── Render ────────────────────────────────────────────────────────────

    return (
      <div
        ref={containerRef}
        className="h-full flex flex-col bg-white select-none"
        onMouseUp={handleMouseUp}
      >
        {/* Formatting Toolbar */}
        <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-200 bg-gray-50 flex-shrink-0">
          {/* Font Size */}
          <div className="relative">
            <button
              onClick={() => setShowFontSizePicker(!showFontSizePicker)}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-gray-200 border border-gray-300 bg-white min-w-[48px]"
            >
              <span>{currentStyle.fontSize || 12}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {showFontSizePicker && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-50 max-h-48 overflow-auto">
                {fontSizes.map((size) => (
                  <button
                    key={size}
                    onClick={() => {
                      applyStyleToSelection({ fontSize: size });
                      setShowFontSizePicker(false);
                    }}
                    className="block w-full px-3 py-1 text-left text-sm hover:bg-gray-100"
                  >
                    {size}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-px h-5 bg-gray-300 mx-1" />

          {/* Bold */}
          <button
            onClick={() =>
              applyStyleToSelection({ bold: !currentStyle.bold })
            }
            className={`p-1.5 rounded hover:bg-gray-200 ${
              currentStyle.bold ? "bg-gray-200 text-blue-600" : "text-gray-700"
            }`}
            title="Bold"
          >
            <Bold className="w-4 h-4" />
          </button>

          {/* Italic */}
          <button
            onClick={() =>
              applyStyleToSelection({ italic: !currentStyle.italic })
            }
            className={`p-1.5 rounded hover:bg-gray-200 ${
              currentStyle.italic
                ? "bg-gray-200 text-blue-600"
                : "text-gray-700"
            }`}
            title="Italic"
          >
            <Italic className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-gray-300 mx-1" />

          {/* Text Color */}
          <div className="relative">
            <button
              onClick={() => setShowTextColorPicker(!showTextColorPicker)}
              className="p-1.5 rounded hover:bg-gray-200 text-gray-700"
              title="Text Color"
            >
              <Type className="w-4 h-4" />
              <div
                className="h-0.5 w-4 mt-0.5 rounded"
                style={{
                  backgroundColor: currentStyle.textColor || "#000000",
                }}
              />
            </button>
            {showTextColorPicker && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-50 p-2 w-48">
                <div className="grid grid-cols-8 gap-1">
                  {colorPresets.map((color) => (
                    <button
                      key={color}
                      onClick={() => {
                        applyStyleToSelection({ textColor: color });
                        setShowTextColorPicker(false);
                      }}
                      className="w-5 h-5 rounded border border-gray-200 hover:scale-110 transition-transform"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Background Color */}
          <div className="relative">
            <button
              onClick={() => setShowBgColorPicker(!showBgColorPicker)}
              className="p-1.5 rounded hover:bg-gray-200 text-gray-700"
              title="Background Color"
            >
              <Paintbrush className="w-4 h-4" />
            </button>
            {showBgColorPicker && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-50 p-2 w-48">
                <div className="grid grid-cols-8 gap-1">
                  <button
                    onClick={() => {
                      applyStyleToSelection({ bgColor: undefined });
                      setShowBgColorPicker(false);
                    }}
                    className="w-5 h-5 rounded border border-gray-300 hover:scale-110 transition-transform bg-white relative"
                    title="No fill"
                  >
                    <div className="absolute inset-0 flex items-center justify-center text-red-500 text-xs font-bold">
                      ×
                    </div>
                  </button>
                  {colorPresets.slice(0, -1).map((color) => (
                    <button
                      key={color}
                      onClick={() => {
                        applyStyleToSelection({ bgColor: color });
                        setShowBgColorPicker(false);
                      }}
                      className="w-5 h-5 rounded border border-gray-200 hover:scale-110 transition-transform"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="w-px h-5 bg-gray-300 mx-1" />

          {/* Borders */}
          <button
            onClick={() => {
              applyStyleToSelection({
                borderTop: true,
                borderRight: true,
                borderBottom: true,
                borderLeft: true,
              });
            }}
            className="p-1.5 rounded hover:bg-gray-200 text-gray-700"
            title="Borders"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="2" y="2" width="12" height="12" />
            </svg>
          </button>

          <div className="w-px h-5 bg-gray-300 mx-1" />

          {/* Alignment */}
          <button
            onClick={() => applyStyleToSelection({ align: "left" })}
            className={`p-1.5 rounded hover:bg-gray-200 ${
              currentStyle.align === "left" || !currentStyle.align
                ? "text-blue-600 bg-gray-200"
                : "text-gray-700"
            }`}
            title="Align Left"
          >
            <AlignLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => applyStyleToSelection({ align: "center" })}
            className={`p-1.5 rounded hover:bg-gray-200 ${
              currentStyle.align === "center"
                ? "text-blue-600 bg-gray-200"
                : "text-gray-700"
            }`}
            title="Align Center"
          >
            <AlignCenter className="w-4 h-4" />
          </button>
          <button
            onClick={() => applyStyleToSelection({ align: "right" })}
            className={`p-1.5 rounded hover:bg-gray-200 ${
              currentStyle.align === "right"
                ? "text-blue-600 bg-gray-200"
                : "text-gray-700"
            }`}
            title="Align Right"
          >
            <AlignRight className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-gray-300 mx-1" />

          {/* Number Format */}
          <div className="relative">
            <button
              onClick={() =>
                setShowNumberFormatPicker(!showNumberFormatPicker)
              }
              className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-gray-200 border border-gray-300 bg-white"
            >
              <span>
                {numberFormats.find(
                  (f) => f.value === (currentStyle.numberFormat || "")
                )?.label || "Auto"}
              </span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {showNumberFormatPicker && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-50">
                {numberFormats.map((fmt) => (
                  <button
                    key={fmt.value}
                    onClick={() => {
                      applyStyleToSelection({ numberFormat: fmt.value });
                      setShowNumberFormatPicker(false);
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 whitespace-nowrap"
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Formula Bar */}
        <div className="flex items-center border-b border-gray-200 bg-white flex-shrink-0">
          <div className="w-20 px-2 py-1.5 text-xs font-medium text-gray-600 border-r border-gray-200 text-center bg-gray-50">
            {selectedCell ? cellRef(selectedCell.row, selectedCell.col) : ""}
          </div>
          <div className="px-2 py-0.5 text-xs text-gray-400 border-r border-gray-200">
            <em>fx</em>
          </div>
          <input
            ref={formulaInputRef}
            type="text"
            value={formulaBarValue}
            onChange={handleFormulaBarChange}
            onKeyDown={handleFormulaBarKeyDown}
            onFocus={() => {
              setFormulaBarFocused(true);
              if (selectedCell && !editingCell) {
                startEditing(
                  selectedCell.row,
                  selectedCell.col,
                  formulaBarValue
                );
              }
            }}
            onBlur={() => setFormulaBarFocused(false)}
            className="flex-1 px-2 py-1.5 text-sm outline-none"
            placeholder="Enter value or formula..."
          />
        </div>

        {/* Grid */}
        <div
          ref={gridRef}
          className="flex-1 overflow-auto relative outline-none"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          onClick={() => {
            // Close any open pickers
            setShowBgColorPicker(false);
            setShowTextColorPicker(false);
            setShowFontSizePicker(false);
            setShowNumberFormatPicker(false);
          }}
        >
          <div
            style={{
              width: ROW_HEADER_WIDTH + DEFAULT_COLS * DEFAULT_COL_WIDTH,
              height: HEADER_HEIGHT + DEFAULT_ROWS * ROW_HEIGHT,
              position: "relative",
            }}
          >
            {/* Column Headers (sticky top) */}
            <div
              className="sticky top-0 z-20 flex"
              style={{ height: HEADER_HEIGHT }}
            >
              {/* Top-left corner */}
              <div
                className="sticky left-0 z-30 bg-gray-100 border-b border-r border-gray-300"
                style={{
                  width: ROW_HEADER_WIDTH,
                  height: HEADER_HEIGHT,
                  minWidth: ROW_HEADER_WIDTH,
                }}
              />
              {/* Column headers */}
              {Array.from(
                { length: visibleColEnd - visibleColStart },
                (_, i) => {
                  const col = visibleColStart + i;
                  return (
                    <div
                      key={col}
                      className="bg-gray-100 border-b border-r border-gray-300 flex items-center justify-center text-xs font-medium text-gray-600"
                      style={{
                        position: "absolute",
                        left:
                          ROW_HEADER_WIDTH + col * DEFAULT_COL_WIDTH,
                        top: 0,
                        width: DEFAULT_COL_WIDTH,
                        height: HEADER_HEIGHT,
                      }}
                    >
                      {colLabel(col)}
                    </div>
                  );
                }
              )}
            </div>

            {/* Row Headers (sticky left) */}
            {Array.from(
              { length: visibleRowEnd - visibleRowStart },
              (_, i) => {
                const row = visibleRowStart + i;
                return (
                  <div
                    key={row}
                    className="sticky left-0 z-10 bg-gray-100 border-b border-r border-gray-300 flex items-center justify-center text-xs font-medium text-gray-600"
                    style={{
                      position: "absolute",
                      top: HEADER_HEIGHT + row * ROW_HEIGHT,
                      left: 0,
                      width: ROW_HEADER_WIDTH,
                      height: ROW_HEIGHT,
                    }}
                  >
                    {row + 1}
                  </div>
                );
              }
            )}

            {/* Cells */}
            {Array.from(
              { length: visibleRowEnd - visibleRowStart },
              (_, ri) => {
                const row = visibleRowStart + ri;
                return Array.from(
                  { length: visibleColEnd - visibleColStart },
                  (_, ci) => {
                    const col = visibleColStart + ci;
                    const key = `${row},${col}`;
                    const isSelected =
                      selectedCell?.row === row &&
                      selectedCell?.col === col;
                    const isEditing =
                      editingCell?.row === row &&
                      editingCell?.col === col;
                    const inSelection = isCellInSelection(row, col);
                    const style = cellStyles.get(key) || {};
                    const displayVal = displayValues.get(key) || "";

                    // Collaborator cursor on this cell
                    let collabCursor: { name: string; color: string } | null = null;
                    for (const [, cursor] of collaboratorCursors) {
                      if (cursor.row === row && cursor.col === col) {
                        collabCursor = { name: cursor.name, color: cursor.color };
                        break;
                      }
                    }

                    return (
                      <div
                        key={key}
                        className={`absolute border-r border-b border-gray-200 ${
                          isSelected
                            ? "ring-2 ring-blue-500 ring-inset z-10"
                            : ""
                        } ${
                          inSelection && !isSelected
                            ? "bg-blue-50"
                            : ""
                        }`}
                        style={{
                          left:
                            ROW_HEADER_WIDTH +
                            col * DEFAULT_COL_WIDTH,
                          top: HEADER_HEIGHT + row * ROW_HEIGHT,
                          width: DEFAULT_COL_WIDTH,
                          height: ROW_HEIGHT,
                          backgroundColor: inSelection && !isSelected
                            ? undefined
                            : style.bgColor || undefined,
                          borderTop: style.borderTop
                            ? "1px solid #333"
                            : undefined,
                          borderRight: style.borderRight
                            ? "1px solid #333"
                            : undefined,
                          borderBottom: style.borderBottom
                            ? "1px solid #333"
                            : undefined,
                          borderLeft: style.borderLeft
                            ? "1px solid #333"
                            : undefined,
                        }}
                        onMouseDown={(e) =>
                          handleCellMouseDown(row, col, e)
                        }
                        onMouseEnter={() =>
                          handleCellMouseEnter(row, col)
                        }
                        onDoubleClick={() =>
                          handleCellDoubleClick(row, col)
                        }
                      >
                        {isEditing ? (
                          <input
                            ref={inputRef}
                            type="text"
                            value={editValue}
                            onChange={(e) => {
                              setEditValue(e.target.value);
                              setFormulaBarValue(e.target.value);
                            }}
                            onBlur={() => commitEdit()}
                            className="w-full h-full px-1 text-sm outline-none bg-white border-none"
                            style={{
                              fontWeight: style.bold
                                ? "bold"
                                : "normal",
                              fontStyle: style.italic
                                ? "italic"
                                : "normal",
                              fontSize: style.fontSize
                                ? `${style.fontSize}px`
                                : "12px",
                              color:
                                style.textColor || "#000",
                              textAlign: style.align || "left",
                            }}
                          />
                        ) : (
                          <div
                            className="w-full h-full px-1 flex items-center overflow-hidden whitespace-nowrap text-ellipsis"
                            style={{
                              fontWeight: style.bold
                                ? "bold"
                                : "normal",
                              fontStyle: style.italic
                                ? "italic"
                                : "normal",
                              fontSize: style.fontSize
                                ? `${style.fontSize}px`
                                : "12px",
                              color:
                                style.textColor || "#000",
                              textAlign: style.align || "left",
                              justifyContent:
                                style.align === "center"
                                  ? "center"
                                  : style.align === "right"
                                  ? "flex-end"
                                  : "flex-start",
                            }}
                          >
                            {displayVal}
                          </div>
                        )}

                        {/* Collaborator cursor indicator */}
                        {collabCursor && (
                          <div
                            className="absolute -top-4 left-0 text-[10px] text-white px-1 rounded-t whitespace-nowrap z-20"
                            style={{
                              backgroundColor: collabCursor.color,
                            }}
                          >
                            {collabCursor.name}
                          </div>
                        )}
                      </div>
                    );
                  }
                );
              }
            )}
          </div>
        </div>
      </div>
    );
  }
);

export default SheetEditor;
