"use client";

// Reportes On Street: página integral de analítica (§ "ANALÍTICA /
// REPORTES ON STREET", 2026-08-30) -- 6 pestañas (Resumen/Sesiones/Pagos/
// Extensiones/Rendimiento por ubicación/Gráficos) sobre los MISMOS
// endpoints y cálculos ya existentes, sin duplicar lógica:
//  - Sesiones/Pagos/Extensiones/Rendimiento por ubicación: reutilizan
//    /api/on-street-qr/reportes (getOnStreetReport) tal como ya existía,
//    con paginación server-side (§7 de la auditoría 2026-08-28) -- el
//    navegador nunca recibe más de "pageSize" filas salvo al exportar,
//    que pide el detalle completo filtrado en una llamada aparte.
//  - Resumen y Gráficos son NUEVOS como pestañas, pero NO nuevo cálculo:
//    reutilizan /api/on-street-qr/dashboard/overview (el mismo endpoint
//    del Dashboard On Street, getOnStreetDashboardOverview) para todo lo
//    basado en sesiones (KPIs, sesiones por día/estado/hora, duración,
//    minutos, rendimiento por lugar), y el propio /reportes?type=pagos
//    (summary.charts, ya construido para la pestaña Gráficos de Pagos) y
//    /reportes?type=extensiones (filas ya existentes, agregadas por día
//    en el navegador) para lo que falta -- ningún cálculo financiero
//    nuevo, todo ya probado y usado en otras pantallas.
import { useCallback, useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import ParkFacilDataGrid from "@/components/ui/ParkFacilDataGrid";

const money = (v) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(v || 0);
const pct = (v) => `${Math.round((v || 0) * 100)}%`;
const dt = (v) => (v ? new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(v)) : "—");
const dayLabel = (iso) => new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "2-digit" }).format(new Date(`${iso}T12:00:00`));

const PERIODS = [
  { key: "today", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "month", label: "Mes" },
  { key: "year", label: "Año" },
  { key: "custom", label: "Personalizado" },
];

// Pestañas superiores (§ "Estructura" del requerimiento). "resumen" y
// "graficos" no son un "type" real de /api/on-street-qr/reportes -- son
// vistas que combinan datos de otros endpoints ya existentes (ver cabecera
// del archivo). Las otras 4 SÍ son exactamente los "type" que ya aceptaba
// getOnStreetReport, solo reordenadas/renombradas en la UI.
const TOP_TABS = [
  { key: "resumen", label: "Resumen" },
  { key: "sesiones", label: "Sesiones" },
  { key: "pagos", label: "Pagos" },
  { key: "extensiones", label: "Extensiones" },
  { key: "lugar", label: "Rendimiento por ubicación" },
  { key: "graficos", label: "Gráficos" },
];
const TABLE_TYPES = new Set(["sesiones", "pagos", "extensiones", "lugar"]);
const SEARCHABLE_TYPES = new Set(["sesiones", "pagos", "extensiones"]);

const GROUP_BY_OPTIONS = [
  { key: "qrLocation", label: "Ubicación QR" },
  { key: "segment", label: "Tramo" },
  { key: "street", label: "Calle" },
  { key: "area", label: "Área" },
  { key: "parking", label: "Estacionamiento" },
];

const PAGE_SIZE_OPTIONS = [25, 50, 100];

const STATUS_LABELS = { ACTIVE: "Activa", CLOSED: "Finalizada", EXPIRED: "Vencida" };
const PAYMENT_STATUS_LABEL = { CREATED: "Iniciado", REDIRECTED: "En Webpay", COMMITTING: "Confirmando", COMMITTED: "Pagado", REJECTED: "Rechazado", ABORTED: "Abortado", FAILED: "Fallido" };
const SMS_REMINDER_LABEL = { PENDING: "Pendiente", SENT: "Enviado", FAILED: "Fallido", CANCELLED: "Cancelado", "—": "Sin recordatorio" };

function todayIso() { return new Date().toISOString().slice(0, 10); }

const PAYMENT_METHOD_LABEL = { DEBIT: "Débito", CREDIT: "Crédito", UNKNOWN: "No informado" };

// Excel real de 2 hojas (§31-32 del brief, revalidado en §17 de esta
// tarea): Hoja 1 = Detalle, Hoja 2 = Resumen. "rows" debe ser el dataset
// COMPLETO filtrado (nunca solo la página visible) -- ver
// requestFullDataset más abajo, que es lo único que llama a esta función.
async function exportReportExcel({ type, label, rows, columns, summary, bounds }) {
  const exceljs = await import("exceljs");
  const Workbook = exceljs.default?.Workbook || exceljs.Workbook;
  const workbook = new Workbook();
  workbook.creator = "ParkFacil 2027";

  const detailSheet = workbook.addWorksheet("Detalle".slice(0, 31));
  const exportColumns = columns.filter((c) => c.key !== "_selection" && c.key !== "_actions");
  detailSheet.columns = exportColumns.map((c) => ({ header: c.label, key: c.key, width: 22 }));
  const cellValue = (column, row) => {
    const raw = typeof column.getValue === "function" ? column.getValue(row) : row[column.key];
    if (raw == null) return "—";
    if (/^(started_at|expires_at|ended_at|created_at|committed_at|fiscalizedAt|previous_expires_at|new_expires_at|smsReminderAt)$/.test(column.key)) {
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? String(raw) : d;
    }
    if (typeof raw === "boolean") return raw ? "Sí" : "No";
    return raw;
  };
  rows.forEach((row) => {
    const item = {};
    exportColumns.forEach((column) => { item[column.key] = cellValue(column, row); });
    detailSheet.addRow(item);
  });
  detailSheet.getRow(1).font = { bold: true };
  detailSheet.views = [{ state: "frozen", ySplit: 1 }];
  exportColumns.forEach((column, index) => {
    if (/fecha|vencimiento|inicio|hora/i.test(column.label)) detailSheet.getColumn(index + 1).numFmt = "dd/mm/yyyy hh:mm";
  });

  const summarySheet = workbook.addWorksheet("Resumen".slice(0, 31));
  summarySheet.columns = [{ header: "Indicador", key: "k", width: 40 }, { header: "Valor", key: "v", width: 24 }];
  summarySheet.getRow(1).font = { bold: true };
  const addRow = (k, v) => summarySheet.addRow({ k, v });
  addRow("Tipo de reporte", label);
  addRow("Período", bounds ? `${new Date(bounds.from).toLocaleString("es-CL")} — ${new Date(bounds.to).toLocaleString("es-CL")}` : "—");
  addRow("Filas exportadas", rows.length);
  summarySheet.addRow({});
  const k = summary?.kpis || {};
  addRow("Vehículos / sesiones en el período", k.sessionsInPeriod ?? 0);
  addRow("Sesiones activas ahora", k.activeSessionsNow ?? 0);
  addRow("Recaudación total (sesiones)", Number(k.revenue ?? 0));
  addRow("Ticket promedio", Number(k.averageTicket ?? 0));
  addRow("Minutos comprados (total)", Number(k.minutesPurchased ?? 0));
  addRow("Minutos promedio por sesión", Number(k.averageMinutesPerSession ?? 0));
  addRow("Pagos aprobados", k.paymentsApproved ?? 0);
  addRow("Pagos rechazados", k.paymentsRejected ?? 0);
  summarySheet.addRow({});
  const rev = summary?.revenue || {};
  addRow("Ingreso por pago inicial", Number(rev.initial ?? 0));
  addRow("Ingreso por extensiones", Number(rev.extension ?? 0));
  addRow("Ingreso total confirmado (payment_transactions COMMITTED)", Number(rev.total ?? 0));
  summarySheet.addRow({});
  const ext = summary?.extensions || {};
  addRow("Sesiones sin extensión", ext.none ?? 0);
  addRow("Sesiones con 1 extensión", ext.one ?? 0);
  addRow("Sesiones con 2+ extensiones", ext.many ?? 0);
  addRow("% sesiones extendidas", `${Math.round((ext.extensionsRate || 0) * 100)}%`);
  summarySheet.addRow({});
  const pm = summary?.paymentMethods || {};
  Object.entries(pm).forEach(([key, value]) => addRow(`Medio de pago: ${PAYMENT_METHOD_LABEL[key] || key}`, `${value.count} pagos · ${new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value.amount || 0)}`));
  summarySheet.addRow({});
  const insp = summary?.inspections || {};
  addRow("Fiscalizaciones totales", insp.total ?? 0);
  addRow("Fiscalizaciones por exceso de tiempo", insp.overstay ?? 0);
  addRow("Fiscalizaciones sin sesión", insp.noSession ?? 0);
  addRow("Patentes distintas fiscalizadas", insp.distinctPlates ?? 0);
  addRow("Reincidencias (misma patente 2+ veces)", insp.reincidences ?? 0);
  addRow("SMS de fiscalización enviados", insp.smsSent ?? 0);
  if ((summary?.places || []).length) {
    summarySheet.addRow({});
    addRow("Recaudación por lugar (top 10)", "");
    (summary.places || []).forEach((p) => addRow(p.label, Number(p.revenue || 0)));
  }
  summarySheet.getColumn("v").numFmt = "#,##0";

  const bytes = await workbook.xlsx.writeBuffer();
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  triggerDownload(blob, `on_street_reporte_${type}.xlsx`);
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

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Exportación CSV (§ "TABLAS" del requerimiento 2026-08-30: "exportar CSV;
// exportar XLSX" -- antes solo existía XLSX para las tablas en modo
// servidor, ver nota de ParkFacilDataGrid.js sobre por qué sus botones
// CSV/XLSX propios se ocultan en serverMode). Mismo dataset COMPLETO
// filtrado que exportReportExcel (una sola hoja "Detalle", sin la hoja
// Resumen -- CSV no tiene formato de hojas), mismo criterio de celda que
// ahí (fechas legibles, booleanos Sí/No) para que ambos formatos
// coincidan.
function exportReportCsv({ type, rows, columns }) {
  const exportColumns = columns.filter((c) => c.key !== "_selection" && c.key !== "_actions");
  const cellText = (column, row) => {
    const raw = typeof column.getValue === "function" ? column.getValue(row) : row[column.key];
    if (raw == null) return "";
    if (/^(started_at|expires_at|ended_at|created_at|committed_at|fiscalizedAt|previous_expires_at|new_expires_at|smsReminderAt)$/.test(column.key)) {
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? String(raw) : d.toLocaleString("es-CL");
    }
    if (typeof raw === "boolean") return raw ? "Sí" : "No";
    return String(raw);
  };
  const lines = [exportColumns.map((c) => csvEscape(c.label)).join(",")];
  rows.forEach((row) => lines.push(exportColumns.map((c) => csvEscape(cellText(c, row))).join(",")));
  // BOM (﻿) para que Excel en Windows reconozca UTF-8 y no rompa las
  // tildes/ñ del contenido -- mismo criterio que csvEscape en
  // ParkFacilDataGrid.js.
  triggerDownload(new Blob([`﻿${lines.join("\n")}`], { type: "text/csv;charset=utf-8;" }), `on_street_reporte_${type}.csv`);
}

function columnsFor(type) {
  if (type === "sesiones") return [
    { key: "operational_number", label: "Sesión" },
    { key: "license_plate_normalized", label: "Patente", render: (v) => v || "—" },
    { key: "ubicacion", label: "Ubicación" },
    { key: "phone", label: "Teléfono" },
    { key: "started_at", label: "Inicio", render: dt },
    { key: "purchased_minutes", label: "Minutos", render: (v) => (v ? `${v} min` : "—") },
    { key: "expires_at", label: "Vencimiento", render: (v) => (v ? dt(v) : "Sin vencimiento") },
    { key: "amount_paid", label: "Monto", render: (v) => money(v) },
    { key: "extensionCount", label: "Extensiones" },
    { key: "status", label: "Estado", render: (v) => STATUS_LABELS[v] || v },
    { key: "fiscalized", label: "Fiscalizado", render: (v) => (v ? "Sí" : "No") },
    { key: "inspector", label: "Inspector" },
    { key: "fiscalizedAt", label: "Fecha/hora fiscalización", render: dt },
    { key: "smsReminderSent", label: "SMS recordatorio enviado", render: (v) => (v ? "Sí" : "No") },
    { key: "smsReminderAt", label: "SMS recordatorio fecha/hora", render: dt },
    { key: "smsReminderStatus", label: "Estado SMS recordatorio", render: (v) => SMS_REMINDER_LABEL[v] || v },
  ];
  if (type === "pagos") return [
    { key: "created_at", label: "Fecha/hora", render: (_, row) => dt(row.committed_at || row.created_at) },
    { key: "sessionNumber", label: "Sesión" },
    { key: "licensePlate", label: "Patente", render: (v) => v || "—" },
    { key: "ubicacion", label: "Ubicación" },
    { key: "operationType", label: "Tipo", render: (v) => (v === "EXTENSION" ? "Extensión" : v === "INITIAL" ? "Inicial" : "—") },
    { key: "amount", label: "Monto", render: (v) => money(v) },
    { key: "paymentTypeLabel", label: "Medio de pago" },
    { key: "status", label: "Estado", render: (v) => PAYMENT_STATUS_LABEL[v] || v },
    { key: "buy_order", label: "Buy Order" },
    { key: "authorization_code", label: "Código autorización" },
  ];
  if (type === "lugar") return [
    { key: "label", label: "Lugar" },
    { key: "parkingName", label: "Estacionamiento" },
    { key: "areaName", label: "Área" },
    { key: "streetName", label: "Calle" },
    { key: "segmentName", label: "Tramo" },
    { key: "vehicles", label: "Vehículos" },
    { key: "sessions", label: "Sesiones" },
    { key: "revenue", label: "Ingresos", render: (v) => money(v) },
    { key: "averageTicket", label: "Ticket promedio", render: (v) => money(v) },
    { key: "averageDurationMinutes", label: "Duración promedio", render: (v) => (v ? `${v} min` : "—") },
    { key: "extensionsCount", label: "Extensiones" },
    { key: "extensionsRevenue", label: "Ingresos por extensión", render: (v) => money(v) },
    { key: "fiscalizations", label: "Fiscalizaciones" },
    { key: "occupancy", label: "Ocupación", getValue: (r) => r.occupancy?.rate, render: (v, r) => (r.occupancy ? `${Math.round(r.occupancy.rate * 100)}% (${r.occupancy.active}/${r.occupancy.capacity})` : "No disponible") },
  ];
  // extensiones
  return [
    { key: "operational_number", label: "Sesión" },
    { key: "licensePlate", label: "Patente", render: (v) => v || "—" },
    { key: "ubicacion", label: "Ubicación" },
    { key: "additional_minutes", label: "Minutos adicionales" },
    { key: "amount", label: "Monto extensión", render: (v) => money(v) },
    { key: "previous_expires_at", label: "Vencimiento anterior", render: dt },
    { key: "new_expires_at", label: "Nuevo vencimiento", render: dt },
    { key: "created_at", label: "Fecha", render: dt },
  ];
}

export default function OnStreetReports() {
  const [type, setType] = useState("resumen");
  const [period, setPeriod] = useState("7d");
  const [customFrom, setCustomFrom] = useState(todayIso());
  const [customTo, setCustomTo] = useState(todayIso());
  const [companyId, setCompanyId] = useState("");
  const [parkingId, setParkingId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [streetId, setStreetId] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [groupBy, setGroupBy] = useState("qrLocation");

  // Filtros de CLIC (§ "INTERACTIVIDAD" del requerimiento): nunca tocan el
  // cálculo de los gráficos/KPIs (que siempre reflejan solo los filtros
  // globales de arriba, ver getOnStreetReport rama "pagos"/"sesiones"),
  // solo acotan la tabla Detalle de la pestaña a la que saltan. Se limpian
  // al cambiar de pestaña manualmente.
  const [paymentTypeFilter, setPaymentTypeFilter] = useState("");
  const [operationTypeFilter, setOperationTypeFilter] = useState("");
  const [approvalFilter, setApprovalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  // Búsqueda por patente (§ "TABLAS": buscar) -- Sesiones/Pagos/Extensiones.
  const [plateSearch, setPlateSearch] = useState("");

  // Paginación/orden server-side (§7). Cambiar cualquier filtro o el tipo
  // de reporte vuelve a página 1 (§7.3) -- ver el useEffect de abajo.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState({ key: null, direction: null });

  // "data": resultado de /reportes para los 4 tipos-tabla (sesiones/pagos/
  // extensiones/lugar). "overviewData": resultado de /dashboard/overview,
  // reutilizado por Resumen Y Gráficos. "graficosExtra": solo para
  // Gráficos -- summary.charts de /reportes?type=pagos (recaudación por
  // jerarquía/medio de pago/inicial-extensión) + filas completas de
  // /reportes?type=extensiones (para la evolución día a día). Ninguno de
  // los tres duplica cálculo: son las respuestas tal cual de endpoints que
  // ya existían.
  const [data, setData] = useState(null);
  const [overviewData, setOverviewData] = useState(null);
  const [graficosExtra, setGraficosExtra] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  // Corrección UX/funcional "Proyectos On Street" (2026-08-29): la ficha de
  // un Proyecto enlaza aquí con ?parkingId=... -- mismo patrón ya usado por
  // Sesiones/Pagos en OnStreetWorkspace.js (window.location.search en vez de
  // useSearchParams(), que exige un límite Suspense y no llegaba a resolver
  // con Turbopack). Antes este filtro se quedaba siempre en "" (todos), así
  // que Reportes nunca partía acotado al Proyecto de origen.
  //
  // "?tab=..." (§ menú On Street 2026-08-30): "Gráficos" pasó a ser un hijo
  // REAL del nodo "Reportes" en el Sidebar (ver navigation.js), no solo una
  // pestaña interna sin entrada propia en el menú -- el hijo enlaza a
  // /on-street-qr/reportes?tab=graficos, que esta misma página lee para
  // abrir directamente esa pestaña. Mismo patrón que parkingId arriba;
  // nunca reemplaza la interacción normal de clic en las pestañas (que
  // sigue funcionando igual), solo fija el estado inicial al entrar por
  // ese enlace. Un valor inválido/ausente se ignora (queda "resumen").
  //
  // Resto de filtros globales + de clic (§ "Dashboard On Street: cada dato
  // debe ser clickeable", 2026-08-30): el Dashboard enlaza aquí con
  // ?period=/from=/to=/companyId=/areaId=/streetId=/segmentId= (además de
  // parkingId/tab ya existentes) para conservar EXACTAMENTE los mismos
  // filtros activos en el Dashboard al saltar a Reportes, y opcionalmente
  // ?status=/approval=/paymentType=/operationType=/day= (el filtro de clic
  // específico del KPI/gráfico donde se hizo clic). Mismo criterio: un
  // valor inválido se ignora, nunca rompe la carga.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const fromProject = params.get("parkingId");
      if (fromProject) setParkingId(fromProject);
      const fromTab = params.get("tab");
      if (fromTab && TOP_TABS.some((t) => t.key === fromTab)) setType(fromTab);
      const fromPeriod = params.get("period");
      if (fromPeriod && PERIODS.some((p) => p.key === fromPeriod)) setPeriod(fromPeriod);
      const fromFrom = params.get("from");
      const fromTo = params.get("to");
      if (fromFrom) setCustomFrom(fromFrom);
      if (fromTo) setCustomTo(fromTo);
      const fromCompany = params.get("companyId");
      if (fromCompany) setCompanyId(fromCompany);
      const fromArea = params.get("areaId");
      if (fromArea) setAreaId(fromArea);
      const fromStreet = params.get("streetId");
      if (fromStreet) setStreetId(fromStreet);
      const fromSegment = params.get("segmentId");
      if (fromSegment) setSegmentId(fromSegment);
      const fromDay = params.get("day");
      if (fromDay) { setPeriod("custom"); setCustomFrom(fromDay); setCustomTo(fromDay); }
      const fromStatus = params.get("status");
      if (fromStatus && ["ACTIVE", "CLOSED", "EXPIRED"].includes(fromStatus)) setStatusFilter(fromStatus);
      const fromApproval = params.get("approval");
      if (fromApproval && ["approved", "rejected"].includes(fromApproval)) setApprovalFilter(fromApproval);
      const fromPaymentType = params.get("paymentType");
      if (fromPaymentType && ["DEBIT", "CREDIT", "UNKNOWN"].includes(fromPaymentType)) setPaymentTypeFilter(fromPaymentType);
      const fromOperationType = params.get("operationType");
      if (fromOperationType && ["INITIAL", "EXTENSION"].includes(fromOperationType)) setOperationTypeFilter(fromOperationType);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Filtros GLOBALES únicamente (período/Empresa/Estacionamiento/Área/
  // Calle/Tramo) -- usados por Resumen/Gráficos (dashboard/overview,
  // reportes?type=pagos, reportes?type=extensiones), que nunca deben
  // incluir paginación/orden/filtros de clic (esos son exclusivos de la
  // tabla Detalle de cada tipo, ver buildParams más abajo).
  const buildGlobalParams = useCallback((extra = {}) => {
    const params = new URLSearchParams({ period, ...extra });
    if (period === "custom") { params.set("from", customFrom); params.set("to", customTo); }
    if (companyId) params.set("companyId", companyId);
    if (parkingId) params.set("parkingId", parkingId);
    if (areaId) params.set("areaId", areaId);
    if (streetId) params.set("streetId", streetId);
    if (segmentId) params.set("segmentId", segmentId);
    return params;
  }, [period, customFrom, customTo, companyId, parkingId, areaId, streetId, segmentId]);

  const buildParams = useCallback((overrides = {}) => {
    const effectiveType = overrides.type || type;
    const params = buildGlobalParams({ type: effectiveType });
    if (effectiveType === "lugar") params.set("groupBy", groupBy);
    // Filtros de clic (§ "INTERACTIVIDAD"): acotan el Detalle sin tocar el
    // cálculo de los gráficos (ver getOnStreetReport). La exportación
    // reutiliza este mismo buildParams, así que también los respeta.
    if (effectiveType === "pagos") {
      if (paymentTypeFilter) params.set("paymentType", paymentTypeFilter);
      if (operationTypeFilter) params.set("operationType", operationTypeFilter);
      if (approvalFilter) params.set("approval", approvalFilter);
    }
    if (effectiveType === "sesiones" && statusFilter) params.set("status", statusFilter);
    if (SEARCHABLE_TYPES.has(effectiveType) && plateSearch) params.set("plate", plateSearch);
    const effective = { page, pageSize, sortKey: sort.key, sortDirection: sort.direction, ...overrides };
    if (effective.page) params.set("page", effective.page);
    if (effective.pageSize) params.set("pageSize", effective.pageSize);
    if (effective.sortKey) { params.set("sortKey", effective.sortKey); params.set("sortDirection", effective.sortDirection || "asc"); }
    if (effective.export) params.set("export", "1");
    return params;
  }, [type, buildGlobalParams, groupBy, paymentTypeFilter, operationTypeFilter, approvalFilter, statusFilter, plateSearch, page, pageSize, sort]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (type === "resumen" || type === "graficos") {
        const overviewResponse = await authenticatedFetch(`/api/on-street-qr/dashboard/overview?${buildGlobalParams({ groupBy: "segment", placeSortBy: "revenue" })}`, { cache: "no-store" });
        const overviewBody = await overviewResponse.json().catch(() => ({}));
        if (overviewResponse.status === 401) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
        if (!overviewResponse.ok) throw new Error(overviewBody.error || "No fue posible cargar el resumen.");
        setOverviewData(overviewBody.data);
        if (type === "graficos") {
          const [pagosResponse, extResponse] = await Promise.all([
            authenticatedFetch(`/api/on-street-qr/reportes?${buildGlobalParams({ type: "pagos" })}`, { cache: "no-store" }),
            authenticatedFetch(`/api/on-street-qr/reportes?${buildGlobalParams({ type: "extensiones", export: "1" })}`, { cache: "no-store" }),
          ]);
          const pagosBody = await pagosResponse.json().catch(() => ({}));
          const extBody = await extResponse.json().catch(() => ({}));
          if (!pagosResponse.ok) throw new Error(pagosBody.error || "No fue posible cargar los gráficos de pagos.");
          if (!extResponse.ok) throw new Error(extBody.error || "No fue posible cargar la evolución de extensiones.");
          setGraficosExtra({ pagosSummary: pagosBody.data.summary, extensionRows: extBody.data.rows || [], bounds: pagosBody.data.bounds });
        } else {
          setGraficosExtra(null);
        }
      } else {
        const response = await authenticatedFetch(`/api/on-street-qr/reportes?${buildParams()}`, { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (response.status === 401) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
        if (!response.ok) throw new Error(body.error || "No fue posible cargar el reporte.");
        setData(body.data);
      }
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, [type, buildGlobalParams, buildParams]);

  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  // Cambiar filtro/tipo/orden vuelve a página 1 (§7.3). El setState se
  // difiere con setTimeout(...,0) -- mismo patrón ya usado en el resto del
  // módulo On-Street (ver OnStreetWorkspace.js) para satisfacer la regla
  // react-hooks/set-state-in-effect sin cambiar el comportamiento.
  useEffect(() => {
    const timer = window.setTimeout(() => setPage(1), 0);
    return () => window.clearTimeout(timer);
  }, [type, period, customFrom, customTo, companyId, parkingId, areaId, streetId, segmentId, groupBy, paymentTypeFilter, operationTypeFilter, approvalFilter, statusFilter, plateSearch, pageSize, sort.key, sort.direction]);

  // Opciones (Empresa/Estacionamiento/Área/Calle/Tramo) vienen tanto de
  // /reportes (tipos-tabla) como de /dashboard/overview (Resumen/
  // Gráficos) -- ambos endpoints devuelven exactamente la misma forma
  // "options", así que se toma la que corresponda al modo activo.
  const options = (type === "resumen" || type === "graficos" ? overviewData?.options : data?.options) || {};
  const areas = useMemo(() => (options.areas || []).filter((a) => !parkingId || a.parkingId === parkingId), [options.areas, parkingId]);
  const streets = useMemo(() => (options.streets || []).filter((s) => !areaId || s.sectorId === areaId), [options.streets, areaId]);
  const segments = useMemo(() => (options.segments || []).filter((s) => !streetId || s.streetId === streetId), [options.segments, streetId]);

  // Deriva columnas/rowIdKey del tipo que realmente corresponde a
  // `data.rows` (data?.type, devuelto por la API), no del estado local
  // `type`: al cambiar de pestaña, `type` cambia de inmediato pero
  // `data.rows` sigue siendo el del reporte anterior hasta que llega la
  // respuesta nueva — usar `type` directamente aquí desincroniza
  // columnas/rowIdKey de las filas todavía visibles y produce keys
  // duplicadas ("undefined") en ParkFacilDataGrid durante ese instante.
  const renderedType = data?.type || (TABLE_TYPES.has(type) ? type : "sesiones");
  const columns = useMemo(() => columnsFor(renderedType), [renderedType]);

  // Exportación (§ "TABLAS": CSV Y XLSX, respetando los filtros activos):
  // ambas piden el dataset COMPLETO filtrado en una llamada aparte (nunca
  // precargan miles de filas antes de que se pidan, nunca exportan solo la
  // página visible) -- se comparte la misma llamada, solo cambia el
  // formato de salida.
  const fetchFullDataset = useCallback(async () => {
    const response = await authenticatedFetch(`/api/on-street-qr/reportes?${buildParams({ export: true })}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "No fue posible generar la exportación.");
    return body.data;
  }, [buildParams]);

  const exportXlsx = useCallback(async () => {
    setExporting(true);
    setError("");
    try {
      const full = await fetchFullDataset();
      await exportReportExcel({
        type: full.type,
        label: TOP_TABS.find((t) => t.key === full.type)?.label || "Reporte",
        rows: full.rows || [],
        columns: columnsFor(full.type),
        summary: full.summary,
        bounds: full.bounds,
      });
    } catch (cause) {
      setError(cause.message);
    } finally {
      setExporting(false);
    }
  }, [fetchFullDataset]);

  const exportCsv = useCallback(async () => {
    setExportingCsv(true);
    setError("");
    try {
      const full = await fetchFullDataset();
      exportReportCsv({ type: full.type, rows: full.rows || [], columns: columnsFor(full.type) });
    } catch (cause) {
      setError(cause.message);
    } finally {
      setExportingCsv(false);
    }
  }, [fetchFullDataset]);

  // Interactividad (§ "INTERACTIVIDAD" del requerimiento): clic en
  // cualquier KPI/gráfico salta a la pestaña de detalle correspondiente,
  // aplica el filtro relacionado y CONSERVA todos los filtros globales
  // existentes (período/Empresa/Estacionamiento/Área/Calle/Tramo -- nunca
  // se tocan salvo que el propio patch lo pida explícitamente).
  const goToDetail = useCallback((targetType, patch = {}) => {
    if (patch.parkingId !== undefined) { setParkingId(patch.parkingId); setAreaId(""); setStreetId(""); setSegmentId(""); }
    if (patch.areaId !== undefined) { setAreaId(patch.areaId); setStreetId(""); setSegmentId(""); }
    if (patch.streetId !== undefined) { setStreetId(patch.streetId); setSegmentId(""); }
    if (patch.segmentId !== undefined) setSegmentId(patch.segmentId);
    if (patch.day !== undefined) { setPeriod("custom"); setCustomFrom(patch.day); setCustomTo(patch.day); }
    if (patch.paymentType !== undefined) setPaymentTypeFilter(patch.paymentType);
    if (patch.operationType !== undefined) setOperationTypeFilter(patch.operationType);
    if (patch.approval !== undefined) setApprovalFilter(patch.approval);
    if (patch.status !== undefined) setStatusFilter(patch.status);
    setSort({ key: null, direction: null });
    setType(targetType);
  }, []);

  const clickFiltersActive = Boolean(paymentTypeFilter || operationTypeFilter || approvalFilter || statusFilter);
  const clickFilterLabels = [
    paymentTypeFilter && PAYMENT_METHOD_LABEL[paymentTypeFilter],
    operationTypeFilter && (operationTypeFilter === "EXTENSION" ? "Extensión" : "Inicial"),
    approvalFilter && (approvalFilter === "approved" ? "Aprobados" : "Rechazados"),
    statusFilter && (STATUS_LABELS[statusFilter] || statusFilter),
  ].filter(Boolean);
  const clearClickFilters = () => { setPaymentTypeFilter(""); setOperationTypeFilter(""); setApprovalFilter(""); setStatusFilter(""); };

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-[var(--pf-color-onstreet-border)] bg-gradient-to-br from-[var(--pf-color-onstreet-primary-700)] to-[var(--pf-color-onstreet-primary-800)] p-6 text-white shadow-sm">
        <h1 className="text-xl font-black">Reportes On Street</h1>
        <p className="mt-1 text-sm text-white/85">Analítica integral: Resumen, Sesiones, Pagos, Extensiones, Rendimiento por ubicación y Gráficos — con filtros, detalle y exportación (CSV / Excel).</p>
      </header>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {TOP_TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => { setType(t.key); setSort({ key: null, direction: null }); clearClickFilters(); setPlateSearch(""); }} className={`rounded-full px-4 py-2 text-xs font-semibold transition ${type === t.key ? "bg-[var(--pf-color-onstreet-primary)] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          {PERIODS.map((p) => (
            <button key={p.key} type="button" onClick={() => setPeriod(p.key)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${period === p.key ? "bg-[#041E42] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {p.label}
            </button>
          ))}
        </div>
        {period === "custom" ? (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-slate-600">Desde<input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
            <label className="text-xs font-semibold text-slate-600">Hasta<input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {options.companies?.length ? (
            <FilterSelect label="Empresa" value={companyId} onChange={(v) => { setCompanyId(v); setParkingId(""); }} rows={options.companies} />
          ) : null}
          <FilterSelect label="Estacionamiento" value={parkingId} onChange={(v) => { setParkingId(v); setAreaId(""); setStreetId(""); setSegmentId(""); }} rows={options.parkings} />
          <FilterSelect label="Área" value={areaId} onChange={(v) => { setAreaId(v); setStreetId(""); setSegmentId(""); }} rows={areas} disabled={!parkingId && !options.parkings?.length} />
          <FilterSelect label="Calle" value={streetId} onChange={(v) => { setStreetId(v); setSegmentId(""); }} rows={streets} disabled={!areaId} />
          <FilterSelect label="Tramo" value={segmentId} onChange={setSegmentId} rows={segments} disabled={!streetId} />
          {type === "lugar" ? (
            <label className="text-xs font-semibold text-slate-600">
              Agrupar por
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                {GROUP_BY_OPTIONS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
              </select>
            </label>
          ) : null}
        </div>
      </section>

      {error ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">{error}</p> : null}

      {clickFiltersActive && TABLE_TYPES.has(type) ? (
        <button type="button" onClick={clearClickFilters} className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100">
          Filtro de gráfico/KPI activo: {clickFilterLabels.join(" · ")} · Quitar ✕
        </button>
      ) : null}

      {type === "resumen" ? (
        loading ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">Cargando…</div>
        ) : (
          <ResumenTab data={overviewData} onFilter={goToDetail} />
        )
      ) : null}

      {type === "graficos" ? (
        loading ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">Cargando…</div>
        ) : (
          <AnalyticsCharts overview={overviewData} extra={graficosExtra} onFilter={goToDetail} />
        )
      ) : null}

      {TABLE_TYPES.has(type) ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          {loading ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">Cargando…</div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                {SEARCHABLE_TYPES.has(type) ? (
                  <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    Buscar por patente
                    <input value={plateSearch} onChange={(e) => setPlateSearch(e.target.value)} placeholder="Ej: ABCD12" className="ml-1 w-full bg-transparent outline-none" />
                  </label>
                ) : <span />}
                <div className="flex items-center gap-2">
                  <button type="button" onClick={exportCsv} disabled={exportingCsv || !(data?.pagination?.totalRows)} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                    {exportingCsv ? "Generando CSV…" : "EXPORTAR CSV"}
                  </button>
                  <button type="button" onClick={exportXlsx} disabled={exporting || !(data?.pagination?.totalRows)} className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {exporting ? "Generando Excel…" : "EXPORTAR A EXCEL (Detalle + Resumen)"}
                  </button>
                </div>
              </div>
              <ParkFacilDataGrid
                storageKey={`on-street:reportes:${renderedType}`}
                columns={columns}
                rows={data?.rows || []}
                rowIdKey={renderedType === "lugar" ? "key" : "id"}
                emptyMessage="Sin datos para el período y filtros seleccionados."
                serverMode
                serverSort={sort}
                onSortChange={(key, direction) => setSort({ key, direction })}
                pagination={data?.pagination || { page: 1, pageSize, totalRows: 0, totalPages: 1 }}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
              />
            </>
          )}
        </section>
      ) : null}

      <section className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
        <p><strong>Operadores</strong>: no se implementa como tipo de reporte todavía — el modelo actual no registra qué operador atendió cada sesión.</p>
      </section>
    </div>
  );
}

function FilterSelect({ label, value, onChange, rows, disabled }) {
  return (
    <label className="text-xs font-semibold text-slate-600">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-100">
        <option value="">Todos</option>
        {(rows || []).map((row) => <option key={row.id} value={row.id}>{row.name || row.code}</option>)}
      </select>
    </label>
  );
}

// ============================================================
// Pestaña "Resumen" (§ página integral "Reportes On Street", 2026-08-30):
// KPIs y 2 gráficos-titulares, TODOS reutilizando /dashboard/overview (el
// mismo endpoint del Dashboard On Street) -- ningún cálculo nuevo. Todo
// clickeable (§ "INTERACTIVIDAD"): cada KPI/gráfico llama a
// onFilter(targetType, patch) = goToDetail, que aplica el filtro
// relacionado y conserva el resto de filtros globales.
// ============================================================
function ResumenTab({ data, onFilter }) {
  if (!data) return null;
  const kpis = data.kpis || {};
  const vencidas = data.sessionStateBreakdown?.VENCIDA || 0;
  const granularity = data.revenueTimeSeries?.granularity || "day";
  const formatBucketX = (v) => (granularity === "hour" ? String(v).slice(11, 16) : granularity === "month" ? String(v) : dayLabel(v));
  const topDays = [...(data.revenueByDay || [])].filter((d) => d.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <ClickableStat label="Recaudación del período (pagos confirmados)" value={money(kpis.revenue)} onClick={() => onFilter("pagos", { approval: "approved" })} />
        <ClickableStat label="Cantidad de sesiones" value={kpis.sessionsInPeriod ?? 0} onClick={() => onFilter("sesiones")} />
        <ClickableStat label="Sesiones activas ahora" value={kpis.activeSessionsNow ?? 0} onClick={() => onFilter("sesiones", { status: "ACTIVE" })} />
        <ClickableStat label="Sesiones vencidas" value={vencidas} onClick={() => onFilter("sesiones", { status: "EXPIRED" })} />
        <ClickableStat label="Minutos contratados" value={kpis.minutesPurchased ?? 0} onClick={() => onFilter("sesiones")} />
        <ClickableStat label="Ticket promedio" value={money(kpis.averageTicket)} onClick={() => onFilter("pagos", { approval: "approved" })} />
        <ClickableStat label="Pagos aprobados" value={kpis.paymentsApproved ?? 0} onClick={() => onFilter("pagos", { approval: "approved" })} />
        <ClickableStat label="Pagos rechazados" value={kpis.paymentsRejected ?? 0} onClick={() => onFilter("pagos", { approval: "rejected" })} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="Recaudación por período" subtitle={`Solo pagos confirmados, por fecha de autorización. Granularidad automática: ${{ hour: "por hora", day: "por día", month: "por mes" }[granularity] || granularity}. Clic filtra Pagos.`}>
          <LineChart data={data.revenueTimeSeries?.points || []} xKey="bucket" yKey="amount" formatX={formatBucketX} formatY={money} color="#059669" onPointClick={granularity === "day" ? (row) => onFilter("pagos", { day: row.bucket, approval: "approved" }) : (() => onFilter("pagos", { approval: "approved" }))} />
        </ChartCard>
        <ChartCard title="Cantidad de sesiones por día" subtitle="Clic en una barra filtra Sesiones a ese día.">
          <BarChart data={data.sessionsByDay || []} xKey="day" yKey="count" formatX={dayLabel} color="var(--pf-color-onstreet-primary)" onBarClick={(row) => onFilter("sesiones", { day: row.day })} />
        </ChartCard>
      </div>

      <ChartCard title="Días de mayor recaudación" subtitle="Top 5 días del período (por fecha de inicio de sesión). Clic filtra Sesiones a ese día.">
        <HorizontalBarList data={topDays.map((d) => ({ id: d.day, label: dayLabel(d.day), amount: d.amount }))} formatValue={money} formatMeta={() => ""} onRowClick={(row) => onFilter("sesiones", { day: row.id })} />
      </ChartCard>

      {(data.placePerformance || []).length ? (
        <ChartCard title="Rendimiento por ubicación (top 8 por recaudación)" subtitle="Clic en una fila filtra Sesiones a ese tramo.">
          <HorizontalBarList data={(data.placePerformance || []).slice(0, 8).map((p) => ({ id: p.key, label: p.label, amount: p.revenue, count: p.sessions }))} formatValue={money} formatMeta={(row) => `${row.count} ${row.count === 1 ? "sesión" : "sesiones"}`} onRowClick={(row) => onFilter("sesiones", { segmentId: row.id })} />
        </ChartCard>
      ) : null}
    </div>
  );
}

// ============================================================
// Pestaña "Gráficos" (global, ya no exclusiva de Pagos -- §
// "Estructura"/"Resumen/Gráficos" del requerimiento 2026-08-30). Combina
// TRES fuentes, todas ya existentes, sin duplicar cálculo:
//  - "overview" = /dashboard/overview (sesiones, KPIs, distribución por
//    estado/hora/duración, rendimiento por ubicación).
//  - "extra.pagosSummary" = summary de /reportes?type=pagos (charts por
//    día/jerarquía, medios de pago, inicial vs extensión, aprobados vs
//    rechazados) -- exactamente lo que ya se construyó para la antigua
//    pestaña "Gráficos" de Pagos.
//  - "extra.extensionRows" = filas completas de /reportes?type=extensiones
//    (mismas que alimentan la tabla Detalle de Extensiones), agregadas por
//    día EN EL NAVEGADOR solo para el gráfico de evolución -- ninguna
//    consulta nueva a la base de datos.
// Todo clickeable, preservando filtros globales (goToDetail).
// ============================================================
function AnalyticsCharts({ overview, extra, onFilter }) {
  // Evolución de extensiones (agregación EN EL NAVEGADOR de filas ya
  // traídas para Detalle -- Chile tz vía slice del ISO, mismo criterio
  // simple ya usado para agrupar por día en el resto de la pantalla).
  // useMemo va ANTES del "if (!overview) return null" de abajo -- los
  // Hooks de React deben llamarse siempre en el mismo orden, nunca detrás
  // de un return condicional.
  const extensionsByDay = useMemo(() => {
    const rows = extra?.extensionRows || [];
    const totals = new Map();
    for (const row of rows) {
      const day = String(row.created_at || "").slice(0, 10);
      if (!day) continue;
      const bucket = totals.get(day) || { day, count: 0, amount: 0 };
      bucket.count += 1;
      bucket.amount += Number(row.amount || 0);
      totals.set(day, bucket);
    }
    return [...totals.values()].sort((a, b) => a.day.localeCompare(b.day));
  }, [extra]);

  if (!overview) return null;
  const pm = overview.paymentMethodBreakdown || { DEBIT: { count: 0, amount: 0 }, CREDIT: { count: 0, amount: 0 }, UNKNOWN: { count: 0, amount: 0 } };
  const revenue = overview.revenueBreakdown || { initial: 0, extension: 0, total: 0, initialCount: 0, extensionCount: 0 };
  const kpis = overview.kpis || {};
  const totalAttempts = (kpis.paymentsApproved || 0) + (kpis.paymentsRejected || 0);
  const approvedRejected = [
    { key: "approved", label: "Aprobados", value: kpis.paymentsApproved || 0 },
    { key: "rejected", label: "Rechazados", value: kpis.paymentsRejected || 0 },
  ];
  const stateBreakdown = overview.sessionStateBreakdown || { VIGENTE: 0, POR_VENCER: 0, VENCIDA: 0, FINALIZADA: 0, FISCALIZADA: 0 };
  const charts = extra?.pagosSummary?.charts || { byDay: [], byParking: [], byArea: [], byStreet: [], bySegment: [] };
  const topDays = [...charts.byDay].filter((d) => d.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ClickableStat label="Recaudación total (pagos confirmados)" value={money(revenue.total)} onClick={() => onFilter("pagos", { approval: "approved" })} />
        <ClickableStat label="Pagos confirmados" value={kpis.paymentsApproved || 0} onClick={() => onFilter("pagos", { approval: "approved" })} />
        <ClickableStat label="Ticket promedio" value={money(kpis.averageTicket)} onClick={() => onFilter("pagos", { approval: "approved" })} />
        <ClickableStat label="Tasa de aprobación" value={pct(totalAttempts > 0 ? kpis.paymentsApproved / totalAttempts : 0)} onClick={() => onFilter("pagos")} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="Sesiones activas / vencidas" subtitle="Vigente y Por vencer son ambas ACTIVE; Fiscalizada es transversal (no se suma a las demás). Clic filtra Sesiones por estado.">
          <BarChart
            data={[
              { key: "VIGENTE", label: "Vigente", value: stateBreakdown.VIGENTE, status: "ACTIVE" },
              { key: "POR_VENCER", label: "Por vencer", value: stateBreakdown.POR_VENCER, status: "ACTIVE" },
              { key: "VENCIDA", label: "Vencida", value: stateBreakdown.VENCIDA, status: "EXPIRED" },
              { key: "FINALIZADA", label: "Finalizada", value: stateBreakdown.FINALIZADA, status: "CLOSED" },
            ]}
            xKey="label" yKey="value" color="var(--pf-color-onstreet-primary)"
            onBarClick={(row) => onFilter("sesiones", { status: row.status })}
          />
        </ChartCard>
        <ChartCard title="Minutos contratados" subtitle="Distribución por rango de minutos contratados.">
          <BarChart data={overview.minutesDistribution || []} xKey="label" yKey="count" color="#7C3AED" />
        </ChartCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="Crédito vs Débito (cantidad)" subtitle="Clic en un segmento filtra Pagos por ese medio de pago.">
          <DonutChart
            data={[
              { key: "DEBIT", label: "Débito", value: pm.DEBIT.count, color: "#0EA5E9" },
              { key: "CREDIT", label: "Crédito", value: pm.CREDIT.count, color: "#7C3AED" },
              { key: "UNKNOWN", label: "No informado", value: pm.UNKNOWN.count, color: "#94A3B8" },
            ]}
            formatValue={(v) => `${v}`}
            onSliceClick={(d) => onFilter("pagos", { paymentType: d.key })}
          />
        </ChartCard>
        <ChartCard title="Crédito vs Débito (monto)" subtitle="Clic en un tramo de la barra filtra Pagos por ese medio de pago.">
          <ProportionalBar
            data={[
              { key: "DEBIT", label: "Débito", value: pm.DEBIT.amount, color: "#0EA5E9" },
              { key: "CREDIT", label: "Crédito", value: pm.CREDIT.amount, color: "#7C3AED" },
              { key: "UNKNOWN", label: "No informado", value: pm.UNKNOWN.amount, color: "#94A3B8" },
            ]}
            formatValue={money}
            onSegmentClick={(d) => onFilter("pagos", { paymentType: d.key })}
          />
        </ChartCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="Pago inicial vs Extensión" subtitle="Por monto (cantidad entre paréntesis). Clic en un tramo filtra Pagos.">
          <ProportionalBar
            data={[
              { key: "INITIAL", label: `Inicial (${revenue.initialCount})`, value: revenue.initial, color: "var(--pf-color-onstreet-primary)" },
              { key: "EXTENSION", label: `Extensión (${revenue.extensionCount})`, value: revenue.extension, color: "#F59E0B" },
            ]}
            formatValue={money}
            onSegmentClick={(d) => onFilter("pagos", { operationType: d.key })}
          />
        </ChartCard>
        <ChartCard title="Pagos aprobados vs rechazados" subtitle="Clic en una barra filtra Pagos por ese resultado.">
          <BarChart data={approvedRejected} xKey="label" yKey="value" color="#DC2626" onBarClick={(row) => onFilter("pagos", { approval: row.key })} />
        </ChartCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="Recaudación por Estacionamiento" subtitle="Clic en una fila filtra Pagos a ese estacionamiento.">
          <HorizontalBarList data={charts.byParking} formatValue={money} onRowClick={(row) => onFilter("pagos", { parkingId: row.id })} />
        </ChartCard>
        <ChartCard title="Recaudación por Área" subtitle="Clic en una fila filtra Pagos a esa área.">
          <HorizontalBarList data={charts.byArea} formatValue={money} onRowClick={(row) => onFilter("pagos", { areaId: row.id })} />
        </ChartCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="Recaudación por Calle" subtitle="Clic en una fila filtra Pagos a esa calle.">
          <HorizontalBarList data={charts.byStreet} formatValue={money} onRowClick={(row) => onFilter("pagos", { streetId: row.id })} />
        </ChartCard>
        <ChartCard title="Recaudación por Tramo" subtitle="Clic en una fila filtra Pagos a ese tramo.">
          <HorizontalBarList data={charts.bySegment} formatValue={money} onRowClick={(row) => onFilter("pagos", { segmentId: row.id })} />
        </ChartCard>
      </div>

      {(overview.placePerformance || []).length ? (
        <ChartCard title="Sesiones por ubicación" subtitle="Por cantidad de sesiones (no por recaudación). Clic en una fila filtra Sesiones a ese tramo.">
          <HorizontalBarList
            data={(overview.placePerformance || []).map((p) => ({ id: p.key, label: p.label, amount: p.sessions }))}
            formatValue={(v) => `${v} ${v === 1 ? "sesión" : "sesiones"}`}
            formatMeta={() => ""}
            onRowClick={(row) => onFilter("sesiones", { segmentId: row.id })}
          />
        </ChartCard>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="Evolución de extensiones" subtitle="Cantidad y monto de extensiones por día. Clic en una barra filtra Extensiones a ese día.">
          <BarChart data={extensionsByDay} xKey="day" yKey="count" formatX={dayLabel} color="#F59E0B" onBarClick={(row) => onFilter("extensiones", { day: row.day })} />
        </ChartCard>
        <ChartCard title="Horarios de mayor uso" subtitle="Cantidad de sesiones por hora de inicio (0-23h, todo el período). Clic abre Sesiones.">
          <BarChart data={overview.sessionsByHourOfDay || []} xKey="hour" yKey="count" formatX={(h) => `${String(h).padStart(2, "0")}h`} color="#0EA5E9" onBarClick={() => onFilter("sesiones")} />
        </ChartCard>
      </div>

      <ChartCard title="Días de mayor recaudación" subtitle="Top 5 días del período (pagos confirmados, por fecha de autorización). Clic filtra Pagos a ese día.">
        <HorizontalBarList data={topDays.map((d) => ({ id: d.day, label: dayLabel(d.day), amount: d.amount, count: d.count }))} formatValue={money} onRowClick={(row) => onFilter("pagos", { day: row.id, approval: "approved" })} />
      </ChartCard>

      <ChartCard title="Evolución del ticket promedio" subtitle="Monto promedio por pago confirmado, día a día. Clic filtra Pagos a ese día.">
        <LineChart data={charts.byDay} xKey="day" yKey="averageTicket" formatX={dayLabel} formatY={money} color="#0EA5E9" onPointClick={(row) => onFilter("pagos", { day: row.day, approval: "approved" })} />
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-[#041E42]">{title}</h2>
      {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// KPI clickeable (§ "INTERACTIVIDAD": "Todos los gráficos y KPI deben ser
// clickeables") -- un <button> con la misma apariencia visual que el resto
// de tarjetas KPI del módulo (ver KpiGrid en OnStreetDashboard.js).
function ClickableStat({ label, value, onClick }) {
  return (
    <button type="button" onClick={onClick} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-[var(--pf-color-onstreet-primary)] hover:shadow-md">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black tabular-nums text-[#041E42]">{value}</p>
    </button>
  );
}

// Barras verticales en divs -- mismo criterio ya establecido en
// OnStreetDashboard.js (el proyecto no tiene ninguna librería de gráficos
// instalada): reimplementado aquí (no importado, ese componente no se
// exporta) con la única adición real que este requerimiento pide: clic en
// una barra dispara onBarClick(row).
function BarChart({ data, xKey, yKey, formatX = (v) => v, formatY = (v) => v, color = "var(--pf-color-onstreet-primary)", onBarClick }) {
  if (!data || !data.length) return <p className="p-6 text-center text-sm text-slate-500">Sin datos para el período y filtros seleccionados.</p>;
  const values = data.map((d) => Number(d[yKey]) || 0);
  const max = Math.max(1, ...values);
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[420px] items-end gap-1.5" style={{ height: 180 }}>
        {data.map((row) => {
          const value = Number(row[yKey]) || 0;
          const heightPct = Math.max(2, Math.round((value / max) * 100));
          return (
            <button
              key={row[xKey]}
              type="button"
              onClick={onBarClick ? () => onBarClick(row) : undefined}
              className={`flex flex-1 flex-col items-center justify-end gap-1 rounded-t-md ${onBarClick ? "cursor-pointer hover:opacity-80" : ""}`}
              title={`${formatX(row[xKey])}: ${formatY(value)}`}
            >
              <span className="text-[10px] font-semibold text-slate-500">{value > 0 ? formatY(value) : ""}</span>
              <div className="w-full rounded-t-md" style={{ height: `${heightPct}%`, backgroundColor: color, minHeight: 2 }} />
              <span className="text-[10px] text-slate-400">{formatX(row[xKey])}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Línea en SVG puro (sin librería, igual criterio que BarChart) -- para
// series temporales (montos/ticket promedio por día), donde una línea
// comunica mejor la tendencia que barras.
function LineChart({ data, xKey, yKey, formatX = (v) => v, formatY = (v) => v, color = "#059669", onPointClick }) {
  if (!data || !data.length) return <p className="p-6 text-center text-sm text-slate-500">Sin datos para el período y filtros seleccionados.</p>;
  const values = data.map((d) => Number(d[yKey]) || 0);
  const max = Math.max(1, ...values);
  const height = 160, topPad = 20, bottomPad = 24;
  const width = Math.max(360, data.length * 64);
  const stepX = data.length > 1 ? width / (data.length - 1) : width;
  const points = data.map((row, i) => {
    const x = data.length > 1 ? i * stepX : width / 2;
    const y = topPad + (height - topPad) * (1 - (Number(row[yKey]) || 0) / max);
    return { x, y, row };
  });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height + bottomPad}`} width={width} height={height + bottomPad} className="min-w-full" role="img" aria-label="Gráfico de línea">
        <path d={path} fill="none" stroke={color} strokeWidth="2" />
        {points.map((p) => (
          <g key={p.row[xKey]} onClick={onPointClick ? () => onPointClick(p.row) : undefined} style={onPointClick ? { cursor: "pointer" } : undefined}>
            <title>{`${formatX(p.row[xKey])}: ${formatY(Number(p.row[yKey]) || 0)}`}</title>
            <circle cx={p.x} cy={p.y} r={onPointClick ? 6 : 4} fill={color} opacity={onPointClick ? 0.001 : 1} />
            <circle cx={p.x} cy={p.y} r="3.5" fill={color} />
            <text x={p.x} y={height + 16} fontSize="9" textAnchor="middle" fill="#94a3b8">{formatX(p.row[xKey])}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// Torta/donut en SVG puro -- único gráfico circular del set, reservado
// para "Crédito vs Débito (cantidad)" (§3 del requerimiento pide
// explícitamente variar barras/líneas/torta-donut/barras apiladas; el
// resto de comparaciones ya usa barra proporcional para no repetir el
// mismo tipo de gráfico para todo).
function DonutChart({ data, formatValue = (v) => v, onSliceClick }) {
  const rows = (data || []).filter((d) => d.value > 0);
  const total = rows.reduce((sum, d) => sum + d.value, 0);
  if (!total) return <p className="p-6 text-center text-sm text-slate-500">Sin datos para el período y filtros seleccionados.</p>;
  const radius = 60, circumference = 2 * Math.PI * radius;
  const segments = rows.reduce((acc, d) => {
    const previousOffset = acc.offset;
    const length = (d.value / total) * circumference;
    acc.list.push({ ...d, dasharray: `${length} ${circumference - length}`, dashoffset: -previousOffset });
    acc.offset = previousOffset + length;
    return acc;
  }, { list: [], offset: 0 }).list;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 160 160" width="160" height="160" role="img" aria-label="Gráfico de torta">
        <g transform="translate(80,80) rotate(-90)">
          <circle r={radius} fill="none" stroke="#e2e8f0" strokeWidth="24" />
          {segments.map((s) => (
            <circle
              key={s.key} r={radius} fill="none" stroke={s.color} strokeWidth="24"
              strokeDasharray={s.dasharray} strokeDashoffset={s.dashoffset}
              onClick={onSliceClick ? () => onSliceClick(s) : undefined}
              style={onSliceClick ? { cursor: "pointer" } : undefined}
            >
              <title>{`${s.label}: ${formatValue(s.value)}`}</title>
            </circle>
          ))}
        </g>
        <text x="80" y="84" textAnchor="middle" fontSize="16" fontWeight="700" fill="#041E42">{total}</text>
      </svg>
      <ul className="space-y-2 text-sm">
        {rows.map((d) => (
          <li key={d.key}>
            <button type="button" onClick={onSliceClick ? () => onSliceClick(d) : undefined} className={`flex items-center gap-2 ${onSliceClick ? "cursor-pointer hover:underline" : ""}`}>
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="font-semibold text-slate-700">{d.label}</span>
              <span className="text-slate-400">{formatValue(d.value)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Barra horizontal apilada (única "barras apiladas" del set, §3) -- usada
// para comparaciones de 2-3 categorías por monto (Crédito/Débito por
// monto, Inicial/Extensión), donde una sola barra proporcional comunica
// mejor "qué parte del total" que barras separadas.
function ProportionalBar({ data, formatValue = (v) => v, onSegmentClick }) {
  const rows = (data || []).filter((d) => d.value > 0);
  const total = rows.reduce((sum, d) => sum + d.value, 0);
  if (!total) return <p className="p-6 text-center text-sm text-slate-500">Sin datos para el período y filtros seleccionados.</p>;
  return (
    <div>
      <div className="flex h-8 w-full overflow-hidden rounded-full bg-slate-100">
        {rows.map((d) => {
          const pct = Math.max(2, (d.value / total) * 100);
          return (
            <button
              key={d.key} type="button" onClick={onSegmentClick ? () => onSegmentClick(d) : undefined}
              className={onSegmentClick ? "cursor-pointer hover:opacity-80" : ""}
              style={{ width: `${pct}%`, backgroundColor: d.color }}
              title={`${d.label}: ${formatValue(d.value)}`}
            />
          );
        })}
      </div>
      <ul className="mt-3 flex flex-wrap gap-4 text-sm">
        {rows.map((d) => (
          <li key={d.key}>
            <button type="button" onClick={onSegmentClick ? () => onSegmentClick(d) : undefined} className={`flex items-center gap-2 ${onSegmentClick ? "cursor-pointer hover:underline" : ""}`}>
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="font-semibold text-slate-700">{d.label}</span>
              <span className="text-slate-400">{formatValue(d.value)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Lista de barras horizontales proporcionales -- usada para los rankings
// de jerarquía (Estacionamiento/Área/Calle/Tramo), donde puede haber más
// de 2-3 filas y una etiqueta legible por fila importa más que un único
// círculo.
// "formatMeta" (opcional): texto secundario por fila -- por defecto "N
// pagos" (uso original, jerarquía de Pagos); las nuevas listas basadas en
// sesiones/días pasan su propio formatMeta (p. ej. "N sesiones", o
// ninguno) en vez de reinventar el componente.
function HorizontalBarList({ data, formatValue = (v) => v, formatMeta, onRowClick }) {
  const rows = (data || []).slice(0, 10);
  if (!rows.length) return <p className="p-6 text-center text-sm text-slate-500">Sin datos para el período y filtros seleccionados.</p>;
  const max = Math.max(1, ...rows.map((r) => r.amount));
  const metaFor = formatMeta || ((row) => (row.count != null ? `${row.count} ${row.count === 1 ? "pago" : "pagos"}` : ""));
  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const pct = Math.max(3, Math.round((row.amount / max) * 100));
        const meta = metaFor(row);
        return (
          <li key={row.id}>
            <button type="button" onClick={onRowClick ? () => onRowClick(row) : undefined} className={`block w-full text-left ${onRowClick ? "cursor-pointer" : ""}`}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">{row.label}</span>
                <span className="text-slate-400">{formatValue(row.amount)}{meta ? ` · ${meta}` : ""}</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-[var(--pf-color-onstreet-primary)] transition-all" style={{ width: `${pct}%` }} />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
