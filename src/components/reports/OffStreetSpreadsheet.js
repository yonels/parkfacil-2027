"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { groupedSpreadsheetRows, normalizeColumnView, numericTotals, spreadsheetRows } from "@/lib/offStreetSpreadsheetCore.mjs";
import { buildCsvContent } from "@/lib/offStreetReportsCore.mjs";

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}
function safeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
const control = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50";

export default function OffStreetSpreadsheet({ rows, columns, storageKey, title, context, onOpen, loading = false, disabled = false }) {
  const [view, setView] = useState(() => normalizeColumnView(columns.map((column) => column.key)));
  const [readyKey, setReadyKey] = useState(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState({});
  const [group, setGroup] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dragging = useRef(null);
  useEffect(() => {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch { /* Default view. */ }
    const timer = setTimeout(() => { setView(normalizeColumnView(columns.map((column) => column.key), saved)); setReadyKey(storageKey); }, 0);
    return () => clearTimeout(timer);
  }, [columns, storageKey]);
  useEffect(() => {
    if (readyKey !== storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(view)); } catch { /* Browsing remains available. */ }
  }, [view, storageKey, readyKey]);
  const visible = useMemo(() => view.order.map((key) => columns.find((column) => column.key === key)).filter((column) => column && view.visible.includes(column.key)), [view, columns]);
  const matching = useMemo(() => spreadsheetRows(rows, columns, { search, filters, sort, group }), [rows, columns, search, filters, sort, group]);
  const totals = useMemo(() => numericTotals(matching, columns), [matching, columns]);
  const groups = useMemo(() => groupedSpreadsheetRows(matching, group, columns), [matching, group, columns]);
  const totalPages = Math.max(1, Math.ceil(matching.length / size));
  const currentPage = Math.min(page, totalPages);
  const pageRows = matching.slice((currentPage - 1) * size, currentPage * size);
  function move(key, direction) {
    const order = [...view.order], index = order.indexOf(key), target = index + direction;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    setView({ ...view, order });
  }
  function toggleColumn(key) {
    if (view.visible.includes(key) && view.visible.length === 1) return;
    setView({ ...view, visible: view.visible.includes(key) ? view.visible.filter((item) => item !== key) : [...view.visible, key] });
  }
  const display = (column, row) => column.format ? column.format(column.value(row), row) : String(column.value(row) ?? "—");
  const totalDisplay = (column, value) => value == null ? "" : column.format ? column.format(value) : String(value);
  function exportMatrix() {
    const result = [];
    const append = (items) => items.forEach((row) => result.push(visible.map((column) => column.value(row) ?? "")));
    if (group) groups.forEach((item) => { result.push([`Grupo: ${item.label} (${item.rows.length})`]); append(item.rows); result.push(visible.map((column, index) => column.total ? item.totals[column.key] : index === 0 ? "Subtotal" : "")); });
    else append(matching);
    if (visible.some((column) => column.total)) result.push(visible.map((column, index) => column.total ? totals[column.key] : index === 0 ? "Total general" : ""));
    return result;
  }
  async function exportFile(kind) {
    setBusy(true); setError("");
    try {
      const matrix = exportMatrix();
      if (kind === "csv") download(new Blob([buildCsvContent(visible.map((column) => column.label), matrix)], { type: "text/csv;charset=utf-8" }), `${title}.csv`);
      else {
        const { default: ExcelJS } = await import("exceljs");
        const book = new ExcelJS.Workbook(), sheet = book.addWorksheet("Reporte");
        book.creator = "ParkFacil";
        sheet.addRow([title]); sheet.addRow([context]); sheet.addRow([`Generado: ${new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" })} · America/Santiago`]);
        sheet.addRow(visible.map((column) => column.label));
        matrix.forEach((row) => sheet.addRow(row));
        sheet.columns.forEach((column) => { column.width = 24; });
        sheet.views = [{ state: "frozen", ySplit: 4 }];
        download(new Blob([await book.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${title}.xlsx`);
      }
    } catch { setError("No fue posible exportar el reporte. Intenta nuevamente."); }
    finally { setBusy(false); }
  }
  function printReport() {
    const popup = window.open("", "_blank", "width=1100,height=750");
    if (!popup) { setError("Permite ventanas emergentes para imprimir o guardar como PDF."); return; }
    const header = visible.map((column) => `<th>${safeHtml(column.label)}</th>`).join("");
    const htmlRows = exportMatrix().map((row) => `<tr>${visible.map((column, index) => `<td>${safeHtml(typeof row[index] === "number" ? totalDisplay(column, row[index]) : row[index])}</td>`).join("")}</tr>`).join("");
    popup.document.write(`<!doctype html><html lang="es"><head><title>${safeHtml(title)}</title><style>@page{size:A4 landscape;margin:12mm}body{font:12px Arial;color:#102c50}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd4e0;padding:6px;text-align:left}thead{display:table-header-group}h1{font-size:20px}</style></head><body><h1>${safeHtml(title)}</h1><p>${safeHtml(context)}</p><p>${matching.length} registros · ${safeHtml(new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" }))} · America/Santiago</p><table><thead><tr>${header}</tr></thead><tbody>${htmlRows}</tbody></table></body></html>`);
    popup.document.close(); popup.focus(); popup.print();
  }
  return <section className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
      <label className="text-sm">Buscar en todo el resultado <input aria-label="Buscar en el reporte completo" className={`${control} ml-2`} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Patente, ticket o dato" /></label>
      <label className="text-sm">Agrupar <select className={`${control} ml-2`} value={group} onChange={(event) => { setGroup(event.target.value); setPage(1); }}><option value="">Sin agrupación</option>{columns.filter((column) => column.groupable).map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}</select></label>
      <details className="w-full"><summary className="cursor-pointer text-sm font-semibold text-[#3150D8]">Columnas: elegir, mover y ajustar ancho</summary><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{view.order.map((key) => { const column = columns.find((item) => item.key === key); if (!column) return null; return <div key={key} className="flex items-center gap-2"><label className="min-w-0 flex-1 text-xs"><input type="checkbox" checked={view.visible.includes(key)} onChange={() => toggleColumn(key)} /> {column.label}</label><button className={control} type="button" aria-label={`Mover ${column.label} a la izquierda`} onClick={() => move(key, -1)}>←</button><button className={control} type="button" aria-label={`Mover ${column.label} a la derecha`} onClick={() => move(key, 1)}>→</button><input aria-label={`Ancho de ${column.label}`} className="w-16 rounded border border-slate-300 p-1 text-xs" type="number" min="100" max="600" value={view.widths[key] || 180} onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) setView({ ...view, widths: { ...view.widths, [key]: Math.max(100, Math.min(600, value)) } }); }} /></div>; })}</div></details>
      <button className={control} type="button" disabled={busy || loading || disabled || !matching.length} onClick={() => exportFile("xlsx")}>Exportar Excel</button><button className={control} type="button" disabled={busy || loading || disabled || !matching.length} onClick={() => exportFile("csv")}>Exportar CSV</button><button className={control} type="button" disabled={busy || loading || disabled || !matching.length} onClick={printReport}>Imprimir / guardar PDF</button>
      <button className={control} type="button" onClick={() => { setFilters({}); setSearch(""); setSort({}); setGroup(""); setPage(1); }}>Limpiar filtros de tabla</button>
      <p className="w-full text-xs text-slate-500">{context} · {matching.length} de {rows.length} registros. Orden, filtros, agrupación y exportación se aplican al resultado completo cargado.</p>
      {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
    </div>
    <div className="max-h-[650px] overflow-auto"><table className="w-full border-collapse text-left text-sm"><thead className="sticky top-0 z-10 bg-[#E2F0D9] text-[#041E42]"><tr>{visible.map((column) => <th key={column.key} style={{ minWidth: view.widths[column.key] || 180 }} draggable onDragStart={() => { dragging.current = column.key; }} onDragOver={(event) => event.preventDefault()} onDrop={() => { const key = dragging.current; if (!key || key === column.key) return; const order = view.order.filter((item) => item !== key); order.splice(order.indexOf(column.key), 0, key); setView({ ...view, order }); dragging.current = null; }} className="border border-slate-300 px-3 py-2"><button type="button" onClick={() => { setSort({ key: column.key, direction: sort.key === column.key && sort.direction === "asc" ? "desc" : "asc" }); setPage(1); }}>{column.label} {sort.key === column.key ? sort.direction === "asc" ? "↑" : "↓" : "↕"}</button></th>)}</tr><tr>{visible.map((column) => <th key={column.key} className="border border-slate-300 p-2"><input aria-label={`Filtrar ${column.label}`} className="w-full min-w-0 rounded border border-slate-300 bg-white px-2 py-1 font-normal" value={filters[column.key] || ""} onChange={(event) => { setFilters({ ...filters, [column.key]: event.target.value }); setPage(1); }} placeholder="Filtrar columna" /></th>)}</tr></thead><tbody>
      {pageRows.map((row, index) => { const column = columns.find((item) => item.key === group); const label = column ? String(column.value(row) ?? "Sin dato") : ""; const previous = pageRows[index - 1]; const showGroup = group && (!previous || String(column.value(previous) ?? "Sin dato") !== label); const info = groups.find((item) => item.label === label); return <Row key={row.id || index} row={row} visible={visible} display={display} onOpen={onOpen} showGroup={showGroup} groupInfo={info} totalDisplay={totalDisplay} />; })}
      {!pageRows.length ? <tr><td colSpan={Math.max(1, visible.length)} className="p-8 text-center text-slate-500">{loading ? "Cargando…" : disabled ? "No hay un resultado disponible." : "Sin resultados para estos filtros."}</td></tr> : null}
    </tbody><tfoot className="bg-slate-100"><tr>{visible.map((column, index) => <td key={column.key} className="border border-slate-300 px-3 py-3 font-semibold">{column.total ? totalDisplay(column, totals[column.key]) : index === 0 ? "Total general" : ""}</td>)}</tr></tfoot></table></div>
    <footer className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"><label>Filas por página <select className={control} value={size} onChange={(event) => { setSize(Number(event.target.value)); setPage(1); }}>{[25, 50, 100].map((value) => <option key={value}>{value}</option>)}</select></label><div className="flex items-center gap-3"><button className={control} type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</button><span aria-live="polite">Página {currentPage} de {totalPages}</span><button className={control} type="button" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Siguiente</button></div></footer>
  </section>;
}

function Row({ row, visible, display, onOpen, showGroup, groupInfo, totalDisplay }) {
  return <>{showGroup ? <tr className="bg-blue-50"><td colSpan={visible.length} className="border border-slate-300 px-3 py-2 font-semibold">{groupInfo.label} · {groupInfo.rows.length} registros {visible.filter((column) => column.total).map((column) => <span key={column.key} className="ml-4 text-xs">Subtotal {column.label}: {totalDisplay(column, groupInfo.totals[column.key])}</span>)}</td></tr> : null}<tr className="even:bg-slate-50 hover:bg-amber-50">{visible.map((column, index) => <td key={column.key} className="border border-slate-200 px-3 py-2">{onOpen ? <button type="button" onClick={() => onOpen(row)} className="w-full text-left hover:text-[#3150D8]" aria-label={`Abrir detalle ${index === 0 ? display(column, row) : column.label}`}>{display(column, row)}</button> : display(column, row)}</td>)}</tr></>;
}
