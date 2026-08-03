"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, GripVertical } from "lucide-react";
import useReorderableColumns from "@/components/ui/useReorderableColumns";

export default function SpreadsheetTable({ columns, rows, emptyMessage = "No hay registros disponibles.", rowHref, minWidth = 900, storageKey, sortable = true }) {
  const stableStorageKey = storageKey || columns.map((column) => column.key).join("-");
  const { orderedColumns, getHeaderProps } = useReorderableColumns(columns, stableStorageKey);
  const [sort, setSort] = useState({ key: null, direction: "asc" });
  const sortedRows = useMemo(() => {
    if (!sort.key) return rows;
    const column = columns.find((item) => item.key === sort.key);
    return [...rows].sort((left, right) => {
      const leftValue = column?.getSortValue ? column.getSortValue(left) : left[sort.key];
      const rightValue = column?.getSortValue ? column.getSortValue(right) : right[sort.key];
      const comparison = String(leftValue ?? "").localeCompare(String(rightValue ?? ""), "es", { numeric: true, sensitivity: "base" });
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [columns, rows, sort]);
  const toggleSort = (key) => setSort((current) => ({
    key,
    direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
  }));

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-300 bg-white shadow-sm">
      <table className="w-full border-collapse text-left text-sm" style={{ minWidth }}>
        <thead className="bg-[#E2F0D9] text-[#041E42]">
          <tr>
            {orderedColumns.map((column) => {
              const dragProps = getHeaderProps(column.key);
              return (
              <th {...dragProps} key={column.key} scope="col" className={`cursor-grab whitespace-nowrap border border-slate-300 px-3 py-3 font-semibold active:cursor-grabbing ${dragProps.className}`}>
                <span className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={!sortable || column.sortable === false}
                    onClick={() => toggleSort(column.key)}
                    className="inline-flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
                    title={sortable && column.sortable !== false ? `Ordenar por ${column.label}` : undefined}
                  >
                    <span>{column.label}</span>
                    {sortable && column.sortable !== false
                      ? sort.key === column.key
                        ? sort.direction === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                        : <ArrowUpDown className="h-3.5 w-3.5 opacity-70" />
                      : null}
                  </button>
                  <GripVertical className="h-4 w-4 shrink-0 text-white/70" />
                </span>
              </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.length ? sortedRows.map((row, index) => (
            <tr key={row.id ?? index} className="even:bg-slate-50 hover:bg-[#FFF2CC]">
              {orderedColumns.map((column) => {
                const content = column.render ? column.render(row) : row[column.key] ?? "—";
                const cellClass = `border border-slate-200 p-0 text-slate-700 ${column.nowrap === false ? "" : "whitespace-nowrap"} ${column.className || ""}`;
                return (
                  <td key={column.key} className={cellClass}>
                    {rowHref
                      ? <Link href={rowHref(row)} className="block min-h-10 px-3 py-2 transition hover:bg-[#EEF4FF] hover:text-[#3150D8]">{content}</Link>
                      : <span className="block min-h-10 px-3 py-2">{content}</span>}
                  </td>
                );
              })}
            </tr>
          )) : (
            <tr><td colSpan={orderedColumns.length} className="px-4 py-10 text-center text-slate-500">{emptyMessage}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
