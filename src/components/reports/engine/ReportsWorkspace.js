"use client";

// Motor común de reportes (SOL-2026-10-28-005, E2): árbol Producto →
// Reportes → Categoría → Reporte, filtros comunes y vista (KPI, gráficos,
// tabla y exportación .xlsx desde el servidor). Componente aislado: aún no
// reemplaza la página productiva de Reportes.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Download, FileBarChart, LoaderCircle, Menu, Search } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { findReport, flattenReports, REPORT_STATUS, REPORT_STATUS_LABELS, reportAncestors, searchTree, subTree, treeKeyAction, visibleNodes } from "@/lib/reports/engine/registry.mjs";
import { PERIOD_LABELS, PERIOD_PRESETS } from "@/lib/reports/engine/periodCore.mjs";
import { PLATE_STATUS, PLATE_STATUS_LABELS } from "@/lib/releasedPlates/releasedPlateCore.mjs";
import { formatLocalDateTime } from "@/lib/releasedPayment/zonedTime.mjs";

const LAST_REPORT_KEY = "parkfacil.reportes.ultimo";
const STATUS_TONE = {
  AVAILABLE: "bg-emerald-50 text-emerald-700",
  PLANNED: "bg-slate-100 text-slate-500",
  EXPERIMENTAL: "bg-amber-50 text-amber-800",
  NOT_APPLICABLE: "bg-slate-100 text-slate-400",
};

function formatValue(value, format) {
  if (value === null || value === undefined || value === "") return "—";
  if (format === "clp") return `$${Number(value).toLocaleString("es-CL")}`;
  if (format === "uf") return `UF ${Number(value).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (format === "int") return Number(value).toLocaleString("es-CL");
  if (format === "pct") return `${(Number(value) * 100).toLocaleString("es-CL", { maximumFractionDigits: 1 })} %`;
  if (format === "datetime") return formatLocalDateTime(value);
  return String(value);
}

function readStorage(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeStorage(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* sin almacenamiento: no se recuerda */ }
}

function BarChart({ chart }) {
  const max = Math.max(1, ...chart.data.map((point) => Number(point.value) || 0));
  return (
    <figure className="rounded-2xl border border-slate-200 bg-white p-4">
      <figcaption className="text-sm font-bold text-[#041E42]">{chart.title}</figcaption>
      {chart.data.length === 0 ? <p className="mt-3 text-sm text-slate-500">Sin datos en el período.</p> : (
        <ul className="mt-3 space-y-2" aria-label={chart.title}>
          {chart.data.map((point) => (
            <li key={point.label} className="grid grid-cols-[minmax(0,140px)_1fr_auto] items-center gap-3 text-sm">
              <span className="truncate text-slate-600" title={point.label}>{point.label}</span>
              <span className="h-3 rounded-full bg-slate-100" aria-hidden="true"><span className="block h-3 rounded-full bg-[#3150D8]" style={{ width: `${(Number(point.value) / max) * 100}%` }} /></span>
              <span className="font-semibold text-[#041E42]">{formatValue(point.value, chart.format)}</span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

function ReportTree({ tree, activeId, onSelect }) {
  const [expanded, setExpanded] = useState(() => new Set([tree[0]?.id, ...reportAncestors(activeId)].filter(Boolean)));
  const [query, setQuery] = useState("");
  const [focusId, setFocusId] = useState(activeId || "off-street");
  const refs = useRef(new Map());
  const filter = useMemo(() => searchTree(query, tree), [query, tree]);
  const nodes = useMemo(() => visibleNodes(tree, expanded, filter), [tree, expanded, filter]);

  useEffect(() => { refs.current.get(focusId)?.focus({ preventScroll: false }); }, [focusId]);

  function toggle(id) {
    setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function onKeyDown(event) {
    const action = treeKeyAction(event.key, nodes, focusId, expanded);
    if (!action) return;
    event.preventDefault();
    if (action.focus) setFocusId(action.focus);
    if (action.expand || action.collapse || action.toggle) toggle(action.expand || action.collapse || action.toggle);
    if (action.select) onSelect(action.select);
  }

  const item = (node, label, extra = null) => {
    const isGroup = node.type !== "report";
    const isOpen = expanded.has(node.id) || Boolean(filter);
    const active = node.id === activeId;
    return (
      <div
        key={node.id}
        ref={(el) => { if (el) refs.current.set(node.id, el); else refs.current.delete(node.id); }}
        role="treeitem"
        aria-level={node.level}
        aria-expanded={isGroup ? isOpen : undefined}
        aria-selected={active}
        tabIndex={node.id === focusId ? 0 : -1}
        onClick={() => { setFocusId(node.id); if (isGroup) toggle(node.id); else onSelect(node.id); }}
        className={`flex cursor-pointer items-center gap-2 rounded-xl py-1.5 pr-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#3150D8] ${active ? "bg-[#3150D8] font-semibold text-white" : "text-slate-700 hover:bg-slate-100"}`}
        style={{ paddingLeft: `${(node.level - 1) * 14 + 8}px` }}
      >
        {isGroup ? (isOpen ? <ChevronDown className="h-4 w-4 flex-none" /> : <ChevronRight className="h-4 w-4 flex-none" />) : <FileBarChart className="h-4 w-4 flex-none opacity-70" />}
        <span className={`min-w-0 flex-1 truncate ${node.level === 1 ? "font-bold uppercase tracking-wide" : node.level === 2 ? "font-semibold" : ""}`}>{label}</span>
        {extra}
      </div>
    );
  };

  return (
    <nav aria-label="Árbol de reportes" className="space-y-3">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar reporte" aria-label="Buscar reporte" className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm" />
      </label>
      <div role="tree" aria-label="Reportes" onKeyDown={onKeyDown} className="space-y-0.5">
        {nodes.length === 0 ? <p className="px-2 text-sm text-slate-500">Sin coincidencias.</p> : nodes.map((node) => {
          if (node.type === "product") return item(node, tree.find((p) => p.id === node.id).label);
          if (node.type === "category") {
            const category = tree.flatMap((p) => p.categories).find((c) => c.id === node.id);
            return item(node, category.label);
          }
          const report = findReport(node.id);
          return item(node, report.label, report.status === REPORT_STATUS.AVAILABLE ? null : (
            <span className={`flex-none rounded-full px-2 py-0.5 text-[10px] font-bold ${node.id === activeId ? "bg-white/20 text-white" : STATUS_TONE[report.status]}`}>{REPORT_STATUS_LABELS[report.status]}</span>
          ));
        })}
      </div>
    </nav>
  );
}

// `categoryIds`: limita el árbol a esas categorías (vacío = árbol completo).
// `storageKey`: el último reporte se recuerda por vista.
// `hideTree`: el árbol vive en el menú lateral y cada reporte tiene su ruta
// (Reportes Pago liberado); el reporte lo fija `initialReportId`.
export default function ReportsWorkspace({ initialReportId = "pl-listado", categoryIds = null, storageKey = LAST_REPORT_KEY, hideTree = false }) {
  const tree = useMemo(() => subTree(categoryIds), [categoryIds]);
  const allowedIds = useMemo(() => new Set(flattenReports(tree).map((r) => r.id)), [tree]);
  const [reportId, setReportId] = useState(initialReportId);
  const [treeOpen, setTreeOpen] = useState(false);
  const [filters, setFilters] = useState({ periodo: PERIOD_PRESETS.MONTH, desde: "", hasta: "", patente: "", estado: "", estacionamiento: "", ventana: "7", companyId: "" });
  const [state, setState] = useState({ loading: false, error: "", data: null });
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  // Memorizado: findReport crea un objeto nuevo en cada llamada y, sin esto,
  // la carga se volvería a disparar en cada render.
  const report = useMemo(() => findReport(reportId), [reportId]);

  useEffect(() => {
    if (hideTree) return undefined;
    const stored = readStorage(storageKey);
    if (stored && allowedIds.has(stored)) { const timer = window.setTimeout(() => setReportId(stored), 0); return () => window.clearTimeout(timer); }
    return undefined;
  }, [allowedIds, storageKey, hideTree]);

  const query = useCallback((extra = {}) => {
    const params = new URLSearchParams();
    const uses = report?.filters || [];
    const allowed = { periodo: uses.includes("period"), desde: uses.includes("period"), hasta: uses.includes("period"), patente: uses.includes("plate"), estado: uses.includes("status"), estacionamiento: uses.includes("parking"), ventana: uses.includes("window"), companyId: true, formato: true };
    for (const [key, value] of Object.entries({ ...filters, ...extra })) if (value && allowed[key]) params.set(key, value);
    if (filters.periodo !== PERIOD_PRESETS.CUSTOM) { params.delete("desde"); params.delete("hasta"); }
    return params.toString();
  }, [filters, report]);

  const load = useCallback(async () => {
    if (!report || report.status !== REPORT_STATUS.AVAILABLE) { setState({ loading: false, error: "", data: null }); return; }
    if (filters.periodo === PERIOD_PRESETS.CUSTOM && (!filters.desde || !filters.hasta)) return;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await authenticatedFetch(`/api/reportes/${report.id}?${query()}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible cargar el reporte.");
      setState({ loading: false, error: "", data: body.data });
      setPage(1);
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : "No fue posible cargar el reporte.", data: null });
    }
  }, [report, filters.periodo, filters.desde, filters.hasta, query]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  function select(id) {
    // Al cambiar de reporte no se muestran datos del anterior mientras carga.
    if (id !== reportId) setState({ loading: true, error: "", data: null });
    setReportId(id);
    writeStorage(storageKey, id);
    setTreeOpen(false);
  }

  async function exportXlsx() {
    setExporting(true);
    try {
      const response = await authenticatedFetch(`/api/reportes/${report.id}?${query({ formato: "xlsx" })}`, { cache: "no-store" });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || "No fue posible exportar."); }
      const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") || "")?.[1] || `${report.id}.xlsx`;
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = name; link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : "No fue posible exportar." }));
    } finally {
      setExporting(false);
    }
  }

  const data = state.data;
  const pageSize = 25;
  const rows = data?.rows || [];
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const input = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-[#041E42]";
  const label = "block text-xs font-bold uppercase tracking-wide text-slate-500";
  const uses = (key) => Boolean(report?.filters?.includes(key));

  return (
    <div className={hideTree ? "" : "grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]"}>
      <aside className={`rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-4 lg:self-start ${hideTree ? "hidden" : ""}`}>
        <button type="button" onClick={() => setTreeOpen((open) => !open)} className="flex w-full items-center justify-between rounded-xl px-2 py-1 text-sm font-bold text-[#041E42] lg:hidden" aria-expanded={treeOpen}>
          <span className="truncate">{report ? report.label : "Reportes"}</span><Menu className="h-5 w-5" />
        </button>
        <div className={`${treeOpen ? "mt-3 block" : "hidden"} lg:block`}>
          <ReportTree tree={tree} activeId={reportId} onSelect={select} />
        </div>
      </aside>

      <section className="min-w-0 space-y-5">
        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-[#3150D8]">{report ? `${report.productLabel} · Reportes · ${report.categoryLabel}` : "Reportes"}</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold text-[#041E42]">{report?.label || "Selecciona un reporte"}</h2>
            {report?.status === REPORT_STATUS.AVAILABLE ? (
              <button type="button" onClick={() => void exportXlsx()} disabled={exporting || state.loading || !data} className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1E5EFF] disabled:opacity-50">
                {exporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Exportar Excel
              </button>
            ) : null}
          </div>
          {report?.description ? <p className="mt-2 text-sm text-slate-600">{report.description}</p> : null}
        </header>

        {report && report.status !== REPORT_STATUS.AVAILABLE ? (
          <p className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm font-semibold text-slate-500">
            {report.status === REPORT_STATUS.NOT_APPLICABLE ? report.description || "Este reporte no aplica." : report.status === REPORT_STATUS.EXPERIMENTAL ? "Reporte experimental: se habilitará cuando existan datos y pruebas suficientes." : "Reporte en preparación."}
          </p>
        ) : (
          <>
            <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 xl:grid-cols-4">
              {data?.companies ? (
                <label className={label}>Empresa
                  <select className={input} value={filters.companyId || data.meta.companyId} onChange={(e) => setFilters({ ...filters, companyId: e.target.value, estacionamiento: "" })}>
                    {data.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              ) : null}
              {uses("period") ? (
                <label className={label}>Período
                  <select className={input} value={filters.periodo} onChange={(e) => setFilters({ ...filters, periodo: e.target.value })}>
                    {Object.values(PERIOD_PRESETS).map((value) => <option key={value} value={value}>{PERIOD_LABELS[value]}</option>)}
                  </select>
                </label>
              ) : <p className="self-end pb-2 text-xs font-semibold text-slate-500">Estado a la fecha y hora de emisión.</p>}
              {uses("period") && filters.periodo === PERIOD_PRESETS.CUSTOM ? (
                <>
                  <label className={label}>Desde<input type="date" className={input} value={filters.desde} onChange={(e) => setFilters({ ...filters, desde: e.target.value })} /></label>
                  <label className={label}>Hasta<input type="date" className={input} value={filters.hasta} onChange={(e) => setFilters({ ...filters, hasta: e.target.value })} /></label>
                </>
              ) : null}
              {uses("parking") && data?.parkingOptions ? (
                <label className={label}>Estacionamiento
                  <select className={input} value={filters.estacionamiento} onChange={(e) => setFilters({ ...filters, estacionamiento: e.target.value })}>
                    <option value="">Todos</option>
                    {data.parkingOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              ) : null}
              {uses("plate") ? <label className={label}>Patente<input className={input} value={filters.patente} maxLength={8} placeholder="Ej.: BCDF" onChange={(e) => setFilters({ ...filters, patente: e.target.value.toUpperCase() })} /></label> : null}
              {uses("status") ? (
                <label className={label}>Estado
                  <select className={input} value={filters.estado} onChange={(e) => setFilters({ ...filters, estado: e.target.value })}>
                    <option value="">Todos (sin eliminadas)</option>
                    {Object.values(PLATE_STATUS).map((code) => <option key={code} value={code}>{PLATE_STATUS_LABELS[code]}</option>)}
                  </select>
                </label>
              ) : null}
              {uses("window") ? (
                <label className={label}>Vencen en
                  <select className={input} value={filters.ventana} onChange={(e) => setFilters({ ...filters, ventana: e.target.value })}>
                    {[7, 15, 30].map((days) => <option key={days} value={String(days)}>{days} días</option>)}
                  </select>
                </label>
              ) : null}
            </div>

            {state.error ? <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{state.error}</p> : null}
            {state.loading && !data ? <p className="flex items-center gap-2 rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin" /> Cargando reporte…</p> : null}

            {data ? (
              <>
                <p className="text-xs text-slate-500">{data.meta.companyName} · {data.meta.periodLabel} · Emitido {formatLocalDateTime(data.meta.generatedAt)} (America/Santiago){state.loading ? " · actualizando…" : ""}</p>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                  {data.kpis.map((kpi) => (
                    <div key={kpi.key} className="rounded-2xl border border-slate-200 bg-[#F5F9FF] px-4 py-3" title={kpi.note || undefined}>
                      <p className="text-xl font-bold text-[#041E42]">{kpi.value === null || kpi.value === undefined ? "No calculable" : formatValue(kpi.value, kpi.format)}</p>
                      <p className="text-xs font-semibold text-slate-500">{kpi.label}</p>
                    </div>
                  ))}
                </div>
                <div className="grid gap-4 xl:grid-cols-2">{data.charts.map((chart) => <BarChart key={chart.key} chart={chart} />)}</div>
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-[#041E42]">Detalle ({rows.length.toLocaleString("es-CL")} registros)</p>
                    {pages > 1 ? (
                      <div className="flex items-center gap-2 text-sm">
                        <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-full border px-3 py-1 disabled:opacity-40">Anterior</button>
                        <span>{page} / {pages}</span>
                        <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded-full border px-3 py-1 disabled:opacity-40">Siguiente</button>
                      </div>
                    ) : null}
                  </div>
                  {rows.length === 0 ? <p className="mt-3 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Sin registros para los filtros.</p> : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="min-w-full text-left text-xs">
                        <thead><tr className="bg-[#3150D8] text-white">{data.columns.map((column) => <th key={column.key} className="whitespace-nowrap p-2 font-semibold">{column.label}</th>)}</tr></thead>
                        <tbody>{pageRows.map((row, index) => (
                          <tr key={row.id || index} className="border-b">{data.columns.map((column) => <td key={column.key} className="whitespace-nowrap p-2">{formatValue(row[column.key], column.format)}</td>)}</tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                  <p className="mt-2 text-xs text-slate-500">La exportación incluye todos los registros de los filtros (no solo esta página), con hojas Resumen, Detalle y Gráficos.</p>
                </div>
              </>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
