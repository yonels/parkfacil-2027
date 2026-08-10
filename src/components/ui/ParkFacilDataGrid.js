"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Check,
  ChevronDown,
  Download,
  GripVertical,
  LayoutList,
  Search,
} from "lucide-react";

function storageGet(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function storageSet(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage write failures.
  }
}

function normalizeOrder(columns, currentOrder) {
  const keys = columns.map((column) => column.key);
  const available = new Set(keys);
  const safeOrder = Array.isArray(currentOrder) ? currentOrder.filter((key) => available.has(key)) : [];
  const missing = keys.filter((key) => !safeOrder.includes(key));
  return [...safeOrder, ...missing];
}

function defaultComparator(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;

  const da = new Date(a);
  const db = new Date(b);
  if (!Number.isNaN(da.getTime()) && !Number.isNaN(db.getTime()) && (String(a).includes("-") || String(b).includes("-"))) {
    return da.getTime() - db.getTime();
  }

  return String(a).localeCompare(String(b), "es", { sensitivity: "base", numeric: true });
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function toCellText(column, row) {
  if (typeof column.exportValue === "function") return column.exportValue(row);
  if (typeof column.getValue === "function") return column.getValue(row);
  return row[column.key];
}

function sortIndicator(direction) {
  if (direction === "asc") return <ArrowUpAZ className="h-3.5 w-3.5" aria-hidden="true" />;
  if (direction === "desc") return <ArrowDownAZ className="h-3.5 w-3.5" aria-hidden="true" />;
  return <ChevronDown className="h-3.5 w-3.5 opacity-35" aria-hidden="true" />;
}

export default function ParkFacilDataGrid({
  storageKey,
  columns,
  rows,
  rowIdKey = "id",
  globalSearchPlaceholder = "Buscar...",
  globalSearchAccessor,
  onRowDoubleClick,
  emptyMessage = "Sin resultados.",
  exportFilename = "parkfacil_datos",
  exportSheetName = "Datos",
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: null, direction: null });
  const [filters, setFilters] = useState({});
  const [orderedKeys, setOrderedKeys] = useState(columns.map((column) => column.key));
  const [widthByKey, setWidthByKey] = useState({});
  const [visibleKeys, setVisibleKeys] = useState(columns.map((column) => column.key));
  const [selectedIds, setSelectedIds] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const allCheckboxRef = useRef(null);
  const liveWidthRef = useRef({});

  useEffect(() => {
    liveWidthRef.current = widthByKey;
  }, [widthByKey]);

  useEffect(() => {
    const order = normalizeOrder(columns, storageGet(`parkfacil:grid:${storageKey}:order`, []));
    const storedWidths = storageGet(`parkfacil:grid:${storageKey}:widths`, {});
    const storedVisible = storageGet(`parkfacil:grid:${storageKey}:visible`, columns.map((column) => column.key));
    const safeVisible = normalizeOrder(columns, storedVisible).filter((key) => columns.some((column) => column.key === key));
    const timer = window.setTimeout(() => {
      setOrderedKeys(order);
      setWidthByKey(storedWidths || {});
      setVisibleKeys(safeVisible.length ? safeVisible : columns.map((column) => column.key));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [columns, storageKey]);

  const orderedColumns = useMemo(() => {
    const byKey = new Map(columns.map((column) => [column.key, column]));
    return normalizeOrder(columns, orderedKeys).map((key) => byKey.get(key)).filter(Boolean);
  }, [columns, orderedKeys]);

  const visibleColumns = useMemo(() => {
    const keySet = new Set(visibleKeys);
    return orderedColumns.filter((column) => keySet.has(column.key));
  }, [orderedColumns, visibleKeys]);

  const pinnedOffsets = useMemo(() => {
    let left = 0;
    const map = {};
    for (const column of visibleColumns) {
      if (!column.pinned) continue;
      map[column.key] = left;
      left += Number(widthByKey[column.key] || column.width || 180);
    }
    return map;
  }, [visibleColumns, widthByKey]);

  const filteredRows = useMemo(() => {
    const query = String(search || "").trim().toLocaleLowerCase("es");
    return rows.filter((row) => {
      const globalText = typeof globalSearchAccessor === "function"
        ? String(globalSearchAccessor(row) || "")
        : visibleColumns.map((column) => String(toCellText(column, row) ?? "")).join(" ");
      if (query && !globalText.toLocaleLowerCase("es").includes(query)) return false;

      for (const column of columns) {
        const rawFilter = filters[column.key];
        if (!rawFilter || rawFilter === "ALL") continue;
        const cellValue = toCellText(column, row);
        if (column.filterType === "select") {
          if (String(cellValue ?? "") !== String(rawFilter)) return false;
        } else {
          const haystack = String(cellValue ?? "").toLocaleLowerCase("es");
          if (!haystack.includes(String(rawFilter).toLocaleLowerCase("es"))) return false;
        }
      }
      return true;
    });
  }, [rows, search, globalSearchAccessor, visibleColumns, columns, filters]);

  const sortedRows = useMemo(() => {
    if (!sort.key || !sort.direction) return filteredRows;
    const column = columns.find((item) => item.key === sort.key);
    if (!column) return filteredRows;
    const factor = sort.direction === "asc" ? 1 : -1;
    const compare = column.comparator || defaultComparator;
    return [...filteredRows].sort((a, b) => {
      const av = toCellText(column, a);
      const bv = toCellText(column, b);
      return compare(av, bv, a, b) * factor;
    });
  }, [filteredRows, sort, columns]);

  const rowIds = useMemo(() => sortedRows.map((row) => String(row[rowIdKey])), [sortedRows, rowIdKey]);
  const selectedSet = useMemo(() => {
    const visibleSet = new Set(rowIds);
    return new Set(selectedIds.filter((id) => visibleSet.has(id)));
  }, [selectedIds, rowIds]);

  const allSelected = rowIds.length > 0 && selectedSet.size === rowIds.length;
  const partiallySelected = selectedSet.size > 0 && !allSelected;

  useEffect(() => {
    if (allCheckboxRef.current) allCheckboxRef.current.indeterminate = partiallySelected;
  }, [partiallySelected]);

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : rowIds);
  };

  const toggleOne = (rowId) => {
    setSelectedIds((current) => current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId]);
  };

  const cycleSort = (columnKey) => {
    setSort((current) => {
      if (current.key !== columnKey) return { key: columnKey, direction: "asc" };
      if (current.direction === "asc") return { key: columnKey, direction: "desc" };
      if (current.direction === "desc") return { key: null, direction: null };
      return { key: columnKey, direction: "asc" };
    });
  };

  const onResizeStart = (event, column) => {
    event.preventDefault();
    const startX = event.clientX;
    const baseWidth = Number(widthByKey[column.key] || column.width || 180);
    const minWidth = Number(column.minWidth || 80);
    let latest = baseWidth;
    const onMove = (moveEvent) => {
      const next = Math.max(minWidth, baseWidth + (moveEvent.clientX - startX));
      latest = next;
      setWidthByKey((current) => ({ ...current, [column.key]: next }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      storageSet(`parkfacil:grid:${storageKey}:widths`, {
        ...liveWidthRef.current,
        [column.key]: Number(latest),
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onColumnDrop = (fromKey, toKey) => {
    if (!fromKey || !toKey || fromKey === toKey) return;
    const fromColumn = orderedColumns.find((column) => column.key === fromKey);
    const toColumn = orderedColumns.find((column) => column.key === toKey);
    if (!fromColumn || !toColumn) return;
    if (fromColumn.pinned !== toColumn.pinned) return;
    setOrderedKeys((current) => {
      const normalized = normalizeOrder(columns, current);
      const next = [...normalized];
      const from = next.indexOf(fromKey);
      const to = next.indexOf(toKey);
      if (from < 0 || to < 0) return normalized;
      next.splice(from, 1);
      next.splice(to, 0, fromKey);
      storageSet(`parkfacil:grid:${storageKey}:order`, next);
      return next;
    });
  };

  const toggleVisibleColumn = (columnKey) => {
    setVisibleKeys((current) => {
      const isVisible = current.includes(columnKey);
      const next = isVisible ? current.filter((key) => key !== columnKey) : [...current, columnKey];
      const normalized = normalizeOrder(columns, next);
      storageSet(`parkfacil:grid:${storageKey}:visible`, normalized);
      return normalized;
    });
  };

  const exportRows = selectedSet.size
    ? sortedRows.filter((row) => selectedSet.has(String(row[rowIdKey])))
    : sortedRows;

  const exportColumns = visibleColumns.filter((column) => column.key !== "_selection");

  const exportCsv = () => {
    const header = exportColumns.map((column) => csvEscape(column.label));
    const body = exportRows.map((row) => exportColumns.map((column) => csvEscape(toCellText(column, row))).join(","));
    const content = [header.join(","), ...body].join("\n");
    triggerDownload(new Blob([content], { type: "text/csv;charset=utf-8;" }), `${exportFilename}.csv`);
  };

  const exportXlsx = async () => {
    const exceljs = await import("exceljs");
    const Workbook = exceljs.default?.Workbook || exceljs.Workbook;
    const workbook = new Workbook();
    workbook.creator = "ParkFacil 2027";
    const sheet = workbook.addWorksheet(exportSheetName.slice(0, 31));
    sheet.columns = exportColumns.map((column) => ({
      header: column.label,
      key: column.key,
      width: Math.max(14, Math.round(Number(widthByKey[column.key] || column.width || 140) / 10)),
    }));
    exportRows.forEach((row) => {
      const item = {};
      exportColumns.forEach((column) => {
        item[column.key] = toCellText(column, row);
      });
      sheet.addRow(item);
    });
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.getRow(1).font = { bold: true };
    const bytes = await workbook.xlsx.writeBuffer();
    triggerDownload(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${exportFilename}.xlsx`);
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex min-w-[260px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <Search className="h-4 w-4 text-[#3150D8]" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={globalSearchPlaceholder}
            className="w-full bg-transparent outline-none"
            aria-label="Buscar en la grilla"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold">{sortedRows.length} filas</span>
          <span className="rounded-full bg-[#F5F9FF] px-3 py-1.5 font-semibold text-[#3150D8]">{selectedSet.size} seleccionadas</span>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((current) => !current)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold"
            >
              <LayoutList className="h-3.5 w-3.5" /> Columnas
            </button>
            {menuOpen ? (
              <div className="absolute right-0 z-30 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
                {orderedColumns.map((column) => {
                  if (column.key === "_selection") return null;
                  const visible = visibleKeys.includes(column.key);
                  const canHide = !column.required;
                  return (
                    <button
                      key={column.key}
                      type="button"
                      disabled={!canHide}
                      onClick={() => canHide && toggleVisibleColumn(column.key)}
                      className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span>{column.label}</span>
                      <span className={`inline-flex h-5 w-5 items-center justify-center rounded border ${visible ? "border-[#3150D8] bg-[#3150D8] text-white" : "border-slate-300 text-transparent"}`}>
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold">
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
          <button type="button" onClick={exportXlsx} className="inline-flex items-center gap-1 rounded-full bg-[#3150D8] px-3 py-1.5 font-semibold text-white">
            <Download className="h-3.5 w-3.5" /> XLSX
          </button>
        </div>
      </header>

      <div className="overflow-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 z-20 bg-[#F7FAFF] text-[#041E42]">
            <tr>
              {visibleColumns.map((column) => {
                const isSorted = sort.key === column.key;
                const width = Number(widthByKey[column.key] || column.width || 180);
                const sticky = column.pinned
                  ? { position: "sticky", left: `${pinnedOffsets[column.key]}px`, zIndex: 25, background: "#F7FAFF" }
                  : undefined;
                return (
                  <th
                    key={column.key}
                    draggable={column.key !== "_selection"}
                    onDragStart={(event) => event.dataTransfer.setData("text/plain", column.key)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => onColumnDrop(event.dataTransfer.getData("text/plain"), column.key)}
                    className="relative border-b border-r border-slate-200 px-2 py-2 align-top"
                    style={{ width: `${width}px`, minWidth: `${width}px`, ...sticky }}
                  >
                    {column.key === "_selection" ? (
                      <label className="inline-flex items-center">
                        <input
                          ref={allCheckboxRef}
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          aria-label="Seleccionar todas las filas visibles"
                        />
                      </label>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => column.sortable !== false && cycleSort(column.key)}
                          className={`inline-flex items-center gap-1 text-sm font-semibold ${column.sortable === false ? "cursor-default" : "hover:text-[#3150D8]"}`}
                          aria-label={`Ordenar por ${column.label}`}
                        >
                          <GripVertical className="h-3.5 w-3.5 text-slate-400" />
                          <span>{column.label}</span>
                          {sortIndicator(isSorted ? sort.direction : null)}
                        </button>
                      </div>
                    )}

                    {column.resizable === false ? null : (
                      <span
                        onMouseDown={(event) => onResizeStart(event, column)}
                        className="absolute right-0 top-0 h-full w-2 cursor-col-resize"
                        aria-hidden="true"
                      />
                    )}
                  </th>
                );
              })}
            </tr>

            <tr>
              {visibleColumns.map((column) => {
                const sticky = column.pinned
                  ? { position: "sticky", left: `${pinnedOffsets[column.key]}px`, zIndex: 24, background: "#F7FAFF" }
                  : undefined;
                return (
                  <th key={`filter:${column.key}`} className="border-b border-r border-slate-200 px-2 py-2" style={sticky}>
                    {column.key === "_selection" ? null : column.filterType === "select" ? (
                      <select
                        value={filters[column.key] || "ALL"}
                        onChange={(event) => setFilters((current) => ({ ...current, [column.key]: event.target.value }))}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                        aria-label={`Filtrar ${column.label}`}
                      >
                        <option value="ALL">Todos</option>
                        {(column.filterOptions || []).map((option) => (
                          <option key={`${column.key}:${option.value}`} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={filters[column.key] || ""}
                        onChange={(event) => setFilters((current) => ({ ...current, [column.key]: event.target.value }))}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                        placeholder="Filtrar"
                        aria-label={`Filtrar ${column.label}`}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {sortedRows.map((row, index) => {
              const rowId = String(row[rowIdKey]);
              const selected = selectedSet.has(rowId);
              return (
                <tr
                  key={rowId}
                  onDoubleClick={() => onRowDoubleClick?.(row)}
                  className={`border-b border-slate-100 ${selected ? "bg-[#F5F9FF]" : index % 2 ? "bg-slate-50/50" : "bg-white"} ${onRowDoubleClick ? "cursor-pointer" : ""}`}
                >
                  {visibleColumns.map((column) => {
                    const width = Number(widthByKey[column.key] || column.width || 180);
                    const sticky = column.pinned
                      ? { position: "sticky", left: `${pinnedOffsets[column.key]}px`, zIndex: 10, background: selected ? "#F5F9FF" : index % 2 ? "#f8fafc" : "#ffffff" }
                      : undefined;
                    const value = toCellText(column, row);
                    return (
                      <td
                        key={`${rowId}:${column.key}`}
                        className="border-r border-slate-100 px-2 py-2 text-slate-700"
                        style={{ width: `${width}px`, minWidth: `${width}px`, ...sticky }}
                      >
                        {column.key === "_selection" ? (
                          <label className="inline-flex items-center">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleOne(rowId)}
                              aria-label={`Seleccionar fila ${rowId}`}
                            />
                          </label>
                        ) : (
                          <div className="truncate">{typeof column.render === "function" ? column.render(value, row) : String(value ?? "-")}</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {!sortedRows.length ? (
              <tr>
                <td colSpan={Math.max(1, visibleColumns.length)} className="px-4 py-10 text-center text-sm text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
