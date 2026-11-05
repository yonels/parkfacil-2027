"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Banknote,
  Ban,
  BarChart3,
  CalendarDays,
  CalendarClock,
  CarFront,
  ChevronDown,
  ChevronUp,
  Clock3,
  CircleDollarSign,
  CreditCard,
  FileSpreadsheet,
  GripVertical,
  LineChart,
  LogOut,
  ReceiptText,
  Search,
  X,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";

const periods = ["Hoy", "7 días", "Mes", "Año"];

const activity = [
  { id: "pendientes", label: "Vehículos pendientes", status: "Pendiente", icon: Clock3, tone: "warning" },
  { id: "ingresos", label: "Ingresos", status: "Registrados", icon: CarFront, tone: "info" },
  { id: "salidas", label: "Salidas", status: "Registradas", icon: LogOut, tone: "positive" },
  { id: "anulados", label: "Anulados", status: "Anulados", icon: Ban, tone: "danger" },
];

const payments = [
  { id: "efectivo", label: "Efectivo", icon: Banknote },
  { id: "debito", label: "Débito", icon: CreditCard },
  { id: "credito", label: "Crédito", icon: CreditCard },
];
const UNCLASSIFIED_PAYMENT = { id: "sinClasificar", label: "Tarjeta sin clasificar", icon: CreditCard };

const count = (value) => new Intl.NumberFormat("es-CL").format(Number(value) || 0);

// Marcas del eje de un gráfico: de 0 al máximo real, sin decimales.
function axisTicks(max, steps) {
  const top = Math.max(steps, Math.ceil(max / steps) * steps);
  return Array.from({ length: steps + 1 }, (_, index) => top - (top / steps) * index);
}

// Datos reales de la pantalla (GET /api/dashboard-general).
async function loadDashboardSection(params) {
  const response = await fetch(`/api/dashboard-general?${new URLSearchParams(params).toString()}`, { cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || "No fue posible obtener los indicadores.");
  return payload.data;
}

function heatTone(value) {
  if (value === null) return "bg-slate-50 text-slate-400";
  if (value >= 90) return "bg-[#041E42] text-white";
  if (value >= 80) return "bg-[#3150D8] text-white";
  if (value >= 65) return "bg-[#2EA8FF] text-white";
  if (value >= 45) return "bg-cyan-100 text-cyan-900";
  return "bg-slate-100 text-slate-600";
}

// Actividades reales soportadas por GET /api/reportes/actividad — deben
// coincidir exactamente con REPORT_ACTIVITIES en
// src/lib/pos/activityReportCore.mjs (fuente de verdad del backend).
const REPORT_ACTIVITIES = ["ingresos", "salidas", "pendientes", "anulados"];

// Fecha de referencia real para el filtro "Periodo": el día de hoy en Chile,
// el mismo día operacional con que el servidor agrupa las cifras.
function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const MONTH_ABBR_ES = { Ene: "01", Feb: "02", Mar: "03", Abr: "04", May: "05", Jun: "06", Jul: "07", Ago: "08", Sep: "09", Oct: "10", Nov: "11", Dic: "12" };

// "22 Jul" (etiqueta del gráfico "Flujo de vehículos por día", sin año) ->
// "2026-07-22", usando el año actual real.
function parseDayLabelToIsoDate(label) {
  const match = /^(\d{1,2})\s+([A-Za-zÁ-ú]{3})$/.exec(String(label || "").trim());
  if (!match) return null;
  const month = MONTH_ABBR_ES[match[2]];
  if (!month) return null;
  return `${new Date().getFullYear()}-${month}-${match[1].padStart(2, "0")}`;
}

// Traduce QUÉ se clickeó (selection) a los filtros reales que entiende el
// endpoint (activity/paymentMethod/dateFrom/dateTo) — Estacionamiento y el
// rango base de fechas vienen aparte, de appliedFilters (capa 1 del modal).
// Devolver `null` significa "no consultar el backend": el mapa de calor de
// ocupación no está vinculado a permanencias individuales.
function selectionToQueryParams(selection) {
  const type = selection?.type;
  const id = selection?.id || "";

  if (type === "ocupacion") return null;

  // Un indicador «del día» abre el detalle de hoy; barras y distribución traen su rango.
  const range = selection?.dateFrom ? { dateFrom: selection.dateFrom, dateTo: selection.dateTo } : id.startsWith("day-") ? { dateFrom: todayIso(), dateTo: todayIso() } : {};

  if (type === "pago" || type === "pago-dia") {
    // "pago-dia" usa el mismo prefijo "day-" que "actividad-dia" (ver las
    // tarjetas de "Actividad del día" más abajo: id: `day-${item.id}`).
    const barePaymentId = id.startsWith("day-") ? id.slice(4) : id;
    // Los pagos se cuentan por fecha de salida, igual que Recaudación.
    if (barePaymentId === "ingresos-pie") return { activity: "salidas", ...range };
    if (barePaymentId === "efectivo") return { activity: "salidas", paymentMethod: "CASH", ...range };
    if (barePaymentId === "debito") return { activity: "salidas", paymentMethod: "CARD", cardType: "DEBIT", ...range };
    if (barePaymentId === "credito") return { activity: "salidas", paymentMethod: "CARD", cardType: "CREDIT", ...range };
    if (barePaymentId === "sinClasificar") return { activity: "salidas", paymentMethod: "CARD", cardType: "NONE", ...range };
    return { activity: "salidas", ...range };
  }

  if (type === "actividad" || type === "actividad-dia") {
    const bareId = id.startsWith("day-") ? id.slice(4) : id;
    if (REPORT_ACTIVITIES.includes(bareId)) return { activity: bareId, ...range };
    if (bareId.startsWith("entries-") || bareId.startsWith("exits-")) {
      const activity = bareId.startsWith("entries-") ? "ingresos" : "salidas";
      if (range.dateFrom) return { activity, ...range };
      const date = parseDayLabelToIsoDate(bareId.replace(/^(entries|exits)-/, ""));
      return date ? { activity, dateFrom: date, dateTo: date } : { activity };
    }
    return {};
  }

  // La tarjeta cuenta todos los vehículos adentro, sin importar cuándo entraron.
  if (type === "general" && id === "Vehículos pendientes") return { activity: "pendientes", allDates: true };
  return { activity: "salidas" }; // "Total mensual cobrado" / "Transacciones totales": pagos del mes
}

function validateDateRange(from, to) {
  if (from && to && from > to) {
    return { ok: false, message: "La fecha desde no puede ser posterior a la fecha hasta." };
  }
  return { ok: true, message: "" };
}

// El selector "Periodo" no es un filtro independiente: ajusta el rango
// desde/hasta de forma coherente (Fase 8). "Mes" y "Año" se calculan sobre
// el mes/año calendario de la fecha de referencia, no solo "hasta hoy".
function periodToRange(periodLabel, referenceIso) {
  const ref = new Date(`${referenceIso}T00:00:00Z`);
  const toIso = (date) => date.toISOString().slice(0, 10);
  if (periodLabel === "Hoy") return { from: referenceIso, to: referenceIso };
  if (periodLabel === "7 días") {
    const from = new Date(ref);
    from.setUTCDate(from.getUTCDate() - 6);
    return { from: toIso(from), to: referenceIso };
  }
  if (periodLabel === "Año") {
    const year = ref.getUTCFullYear();
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
  // "Mes" (default)
  const year = ref.getUTCFullYear();
  const month = ref.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  return { from: `${year}-${String(month + 1).padStart(2, "0")}-01`, to: toIso(lastDay) };
}

// Valores por defecto del filtro del modal cada vez que se abre una nueva
// selección: todos los estacionamientos accesibles y el mes calendario
// actual, ya aplicados de entrada (sin exigir un BUSCAR previo solo para
// ver algo).
const DEFAULT_MODAL_FILTERS = { parking: "todos", periodLabel: "Mes", ...periodToRange("Mes", todayIso()) };

// Único punto de ordenamiento — usado tanto por el pipeline de filas finales
// como por los tests, para no duplicar el criterio de comparación.
function sortRows(rows, sort) {
  const next = [...rows];
  next.sort((a, b) => {
    const left = sort.key === "detail" ? a.id : a[sort.key];
    const right = sort.key === "detail" ? b.id : b[sort.key];
    const comparison = typeof left === "number" ? left - right : String(left).localeCompare(String(right), "es", { numeric: true });
    return sort.direction === "asc" ? comparison : -comparison;
  });
  return next;
}

// Exportar Excel: debe exportar EXACTAMENTE las filas visibles (finalRows —
// la misma consulta real ya aplicada), nunca un universo aparte. Se genera
// como CSV (Excel lo abre nativamente) para no sumar una dependencia nueva
// — si más adelante se necesita un .xlsx real, es un cambio de alcance aparte.
function buildCsvFromRows(rows, columns) {
  const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const header = columns.map((column) => escape(column.label)).join(",");
  const lines = rows.map((row) => columns.map((column) => escape(column.key === "detail" ? "" : row[column.key])).join(","));
  return [header, ...lines].join("\r\n");
}

// Columnas alineadas a los campos reales que entrega
// GET /api/reportes/actividad (ver toActivityReportRow en
// activityReportCore.mjs) — "plan" desapareció (no existe en parking_stays)
// y "ticket" lo reemplaza; "user"/"payment" pasan a "operator"/"paymentMethod".
const transactionColumns = [
  { key: "plate", label: "Patente" },
  { key: "ticket", label: "Ticket" },
  { key: "entryDate", label: "Fecha entrada" },
  { key: "entryTime", label: "Hora entrada" },
  { key: "exitDate", label: "Fecha salida" },
  { key: "exitTime", label: "Hora salida" },
  { key: "minutes", label: "Minutos consumidos" },
  { key: "operator", label: "Operador" },
  { key: "amount", label: "Monto" },
  { key: "paymentMethod", label: "Medio de pago" },
  { key: "detail", label: "Detalle" },
];

const transactionColumnWidths = {
  plate: "w-[8%]",
  ticket: "w-[10%]",
  entryDate: "w-[10%]",
  entryTime: "w-[8%]",
  exitDate: "w-[10%]",
  exitTime: "w-[8%]",
  minutes: "w-[10%]",
  operator: "w-[10%]",
  amount: "w-[9%]",
  paymentMethod: "w-[9%]",
  detail: "w-[6%]",
};

const toneClasses = {
  warning: "bg-amber-50 text-amber-700",
  info: "bg-blue-50 text-[#3150D8]",
  positive: "bg-emerald-50 text-emerald-700",
  danger: "bg-rose-50 text-rose-700",
};

// parking_stays.payment_method solo distingue CASH/CARD (ver
// activityReportCore.mjs) — "Tarjeta" cubre débito y crédito por igual,
// nunca se inventa una distinción que el backend no tiene.
function paymentMethodLabel(method) {
  if (method === "CASH") return "Efectivo";
  if (method === "CARD") return "Tarjeta";
  return "—";
}

function money(value) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
}

function ExcelTable({ title, description, icon: Icon, columns, children }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
        <div className="rounded-xl bg-[#EEF4FF] p-2 text-[#3150D8]"><Icon className="h-5 w-5" /></div>
        <div>
          <h2 className="font-semibold text-[#041E42]">{title}</h2>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>
      <div className="overflow-hidden">
        <table className="w-full table-fixed border-collapse text-left text-[11px]">
          <thead className="bg-[#041E42] text-[9px] uppercase tracking-[0.04em] text-white sm:text-[10px]">
            <tr>{columns.map((column, index) => <th key={`${column}-${index}`} className={`${index === 0 || index === columns.length - 1 ? "w-[8%]" : ""} break-words border-r border-white/10 px-2 py-2.5 font-semibold leading-tight last:border-r-0`}>{column}</th>)}</tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  );
}

export default function ModeloDashboardPage() {
  // Estado del toggle "Hoy/7 días/Mes/Año" del gráfico "Flujo de vehículos
  // por día" — antes compartía el mismo estado que el selector "Periodo"
  // del modal de detalle (bug real encontrado en la auditoría: cambiar uno
  // afectaba al otro sin ninguna relación). Ahora quedan desacoplados: este
  // es exclusivo del gráfico; el del modal vive en filterPeriodDraft.
  const [flowPeriod, setFlowPeriod] = useState("7 días");
  const [selection, setSelection] = useState({ type: "actividad", id: "ingresos", label: "Ingresos" });
  const [query, setQuery] = useState("");
  const [columnOrder, setColumnOrder] = useState(transactionColumns.map((column) => column.key));
  const [sort, setSort] = useState({ key: "entryDate", direction: "desc" });
  const [draggedColumn, setDraggedColumn] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [hourlyOpen, setHourlyOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [flowDate, setFlowDate] = useState(() => todayIso());
  const [flowHour, setFlowHour] = useState("09:00");
  const [incomePeriod, setIncomePeriod] = useState("month");
  const [incomeMonth, setIncomeMonth] = useState(() => todayIso().slice(0, 7));
  const [incomeDate, setIncomeDate] = useState(() => todayIso());
  const [overview, setOverview] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [flow, setFlow] = useState(null);
  const [flowError, setFlowError] = useState("");
  const [income, setIncome] = useState(null);
  const [incomeError, setIncomeError] = useState("");
  const [hourly, setHourly] = useState(null);
  const [hourlyError, setHourlyError] = useState("");

  // CAPA 1 — filtro superior del modal ("Estacionamiento"/"Periodo"/"Fecha
  // desde"/"Fecha hasta" + BUSCAR). Valores "draft": lo que el usuario está
  // editando, que NO afecta la tabla todavía. Cambiar un draft nunca toca
  // `appliedFilters` por sí solo — solo BUSCAR (runSearch) lo hace, previa
  // validación del rango de fechas.
  const [filterParkingDraft, setFilterParkingDraft] = useState(DEFAULT_MODAL_FILTERS.parking);
  const [filterPeriodDraft, setFilterPeriodDraft] = useState(DEFAULT_MODAL_FILTERS.periodLabel);
  const [filterFromDraft, setFilterFromDraft] = useState(DEFAULT_MODAL_FILTERS.from);
  const [filterToDraft, setFilterToDraft] = useState(DEFAULT_MODAL_FILTERS.to);
  const [filterError, setFilterError] = useState("");
  // Filtros realmente "aplicados" — solo cambian al pulsar BUSCAR.
  const [appliedFilters, setAppliedFilters] = useState({ parking: DEFAULT_MODAL_FILTERS.parking, from: DEFAULT_MODAL_FILTERS.from, to: DEFAULT_MODAL_FILTERS.to });

  // Datos reales de GET /api/reportes/actividad — `rows` es la página
  // actual ya filtrada/paginada por el backend (nunca el dataset ficticio).
  // `availableParkings` viene de la propia respuesta del endpoint (los
  // estacionamientos realmente accesibles para el usuario autenticado, no
  // una lista hardcodeada).
  const [rows, setRows] = useState([]);
  const [reportTotal, setReportTotal] = useState(0);
  const [reportPage, setReportPage] = useState(1);
  const REPORT_PAGE_SIZE = 25;
  const [availableParkings, setAvailableParkings] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await loadDashboardSection({ section: "overview" });
        if (!active) return;
        setOverview(data);
        setLoadError("");
      } catch (error) {
        if (active) setLoadError(error.message);
      }
    })();
    return () => { active = false; };
  }, [reloadKey]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await loadDashboardSection({ section: "flow", period: flowPeriod });
        if (!active) return;
        setFlow(data);
        setFlowError("");
      } catch (error) {
        if (active) setFlowError(error.message);
      }
    })();
    return () => { active = false; };
  }, [flowPeriod, reloadKey]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await loadDashboardSection(incomePeriod === "month" ? { section: "income", month: incomeMonth } : { section: "income", date: incomeDate });
        if (!active) return;
        setIncome(data);
        setIncomeError("");
      } catch (error) {
        if (active) setIncomeError(error.message);
      }
    })();
    return () => { active = false; };
  }, [incomePeriod, incomeMonth, incomeDate, reloadKey]);

  useEffect(() => {
    if (!hourlyOpen) return undefined;
    let active = true;
    (async () => {
      try {
        const data = await loadDashboardSection({ section: "hourly", date: flowDate });
        if (!active) return;
        setHourly(data);
        setHourlyError("");
      } catch (error) {
        if (active) setHourlyError(error.message);
      }
    })();
    return () => { active = false; };
  }, [hourlyOpen, flowDate]);

  const ready = Boolean(overview);
  const activityCards = activity.map((item) => ({ ...item, day: overview?.activity.day[item.id] ?? 0, month: overview?.activity.month[item.id] ?? 0 }));
  const hasUnclassified = Boolean(overview?.payments.day.sinClasificar || overview?.payments.month.sinClasificar);
  const paymentCards = [...payments, ...(hasUnclassified ? [UNCLASSIFIED_PAYMENT] : [])].map((item) => ({
    ...item,
    isPayment: true,
    day: overview?.payments.day[item.id] ?? 0,
    month: overview?.payments.month[item.id] ?? 0,
    share: overview?.payments.month.shares[item.id] ?? 0,
  }));
  const incomeData = income?.payments;
  const incomePayments = [...payments, ...(incomeData?.sinClasificar ? [UNCLASSIFIED_PAYMENT] : [])].map((item) => ({
    ...item,
    selectedAmount: incomeData?.[item.id] ?? 0,
    selectedShare: incomeData?.shares[item.id] ?? 0,
  }));
  const incomeTotal = incomeData?.total ?? 0;
  const incomeRange = income ? { dateFrom: income.dateFrom, dateTo: income.dateTo } : {};
  const cashShare = incomeData?.shares.efectivo ?? 0;
  const debitShare = incomeData?.shares.debito ?? 0;
  const creditShare = incomeData?.shares.credito ?? 0;
  const otherShare = incomeData?.shares.sinClasificar ?? 0;
  const incomeStops = incomeTotal > 0
    ? `#3150D8 0% ${creditShare}%, #10B981 ${creditShare}% ${creditShare + cashShare}%, #94A3B8 ${creditShare + cashShare}% ${creditShare + cashShare + debitShare}%, #F59E0B ${creditShare + cashShare + debitShare}% 100%`
    : "#E2E8F0 0% 100%";
  const flowSeries = flow?.series ?? [];
  const flowTicks = axisTicks(Math.max(0, ...flowSeries.flatMap((item) => [item.entries, item.exits])), 5);
  const flowTop = flowTicks[0];
  const flowDescription = { Hoy: "Ingresos y salidas registrados hoy", "7 días": "Ingresos y salidas registrados durante los últimos siete días", Mes: "Ingresos y salidas registrados este mes", Año: "Ingresos y salidas registrados este año, por mes" }[flowPeriod];
  const hourlyFlow = hourly?.date === flowDate ? hourly.hours : [];
  const hourlyTicks = axisTicks(Math.max(0, ...hourlyFlow.flatMap((item) => [item.entries, item.exits])), 6);
  const hourlyY = (value) => 320 - (value / hourlyTicks[0]) * 280;
  const hourlyX = (index) => 75 + index * 112;
  const occupancy = overview?.occupancy;
  const occupancyHours = occupancy?.hours ?? [];
  const occupancyRows = occupancy?.rows ?? [];
  // FUENTE ÚNICA DE FILAS — pipeline lineal, cada paso deriva del anterior,
  // sin estados duplicados desincronizables (Fase 9):
  //   rows (backend, ya filtrado por selección + Estacionamiento/fechas/
  //   medio de pago + paginado) → búsqueda interna → orden → finalRows
  // Tabla, contador, total y exportación consumen exclusivamente finalRows;
  // nunca hay un array ficticio de respaldo.
  const searchedRows = useMemo(() => rows.filter((item) => Object.values(item).some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase()))), [query, rows]);
  const finalRows = useMemo(() => sortRows(searchedRows, sort), [searchedRows, sort]);
  const finalTotal = useMemo(() => finalRows.reduce((sum, item) => sum + (Number(item.amount) || 0), 0), [finalRows]);
  const applySort = (key, direction) => setSort({ key, direction });

  // Única función que realmente consulta el backend — usada al abrir el
  // modal, al pulsar BUSCAR y al cambiar de página. `selectionOverride`/
  // `filtersOverride` permiten pasar los valores recién resueltos sin
  // esperar al siguiente render (evita una carrera con setState asíncrono).
  async function fetchActivityReport({ selectionValue = selection, filtersValue = appliedFilters, page = 1 } = {}) {
    const params = selectionToQueryParams(selectionValue);
    if (params === null) {
      // "ocupacion": el mapa de calor no está vinculado a permanencias
      // individuales — no tiene sentido consultar el backend.
      setRows([]);
      setReportTotal(0);
      setReportPage(1);
      setReportError("");
      setReportLoading(false);
      return;
    }

    setReportLoading(true);
    setReportError("");
    try {
      const query = new URLSearchParams();
      if (params.activity) query.set("activity", params.activity);
      if (params.paymentMethod) query.set("paymentMethod", params.paymentMethod);
      if (params.cardType) query.set("cardType", params.cardType);
      if (filtersValue.parking && filtersValue.parking !== "todos") query.set("parkingId", filtersValue.parking);
      // El rango del indicador ya viene en los filtros (openDetail), y el usuario puede cambiarlo.
      if (filtersValue.from) query.set("dateFrom", filtersValue.from);
      if (filtersValue.to) query.set("dateTo", filtersValue.to);
      query.set("page", String(page));
      query.set("pageSize", String(REPORT_PAGE_SIZE));

      const response = await fetch(`/api/reportes/actividad?${query.toString()}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setRows([]);
        setReportTotal(0);
        setReportError(payload?.error || "No fue posible consultar la actividad solicitada.");
        return;
      }
      setRows(Array.isArray(payload?.data?.rows) ? payload.data.rows : []);
      setReportTotal(Number(payload?.data?.total) || 0);
      setReportPage(Number(payload?.data?.page) || page);
      if (Array.isArray(payload?.data?.parkings)) setAvailableParkings(payload.data.parkings);
    } catch {
      setRows([]);
      setReportTotal(0);
      setReportError("No fue posible conectar con el servidor. Intenta nuevamente.");
    } finally {
      setReportLoading(false);
    }
  }

  // BUSCAR: valida el rango de fechas y recién ahí "aplica" los filtros
  // draft — cambiar Estacionamiento/Periodo/Fechas sin pulsar BUSCAR no
  // consulta el backend todavía (Fase 2 / prueba 13).
  const runSearch = () => {
    const validation = validateDateRange(filterFromDraft, filterToDraft);
    if (!validation.ok) {
      setFilterError(validation.message);
      return;
    }
    setFilterError("");
    const nextFilters = { parking: filterParkingDraft, from: filterFromDraft, to: filterToDraft };
    setAppliedFilters(nextFilters);
    void fetchActivityReport({ filtersValue: nextFilters, page: 1 });
  };
  const goToReportPage = (nextPage) => {
    if (nextPage < 1 || reportLoading) return;
    void fetchActivityReport({ page: nextPage });
  };
  // El selector "Periodo" no filtra por sí mismo: recalcula el rango
  // desde/hasta draft de forma coherente (Fase 8). El usuario puede seguir
  // ajustando las fechas a mano después.
  const applyPeriodDraft = (nextPeriodLabel) => {
    setFilterPeriodDraft(nextPeriodLabel);
    const range = periodToRange(nextPeriodLabel, todayIso());
    setFilterFromDraft(range.from);
    setFilterToDraft(range.to);
  };
  const exportFinalRowsToCsv = () => {
    const csv = buildCsvFromRows(finalRows, orderedColumns);
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dashboard-general-${selection?.id || "detalle"}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  const orderedColumns = columnOrder.map((key) => transactionColumns.find((column) => column.key === key));
  const moveColumn = (targetKey) => {
    if (!draggedColumn || draggedColumn === targetKey) return;
    setColumnOrder((current) => {
      const next = current.filter((key) => key !== draggedColumn);
      next.splice(next.indexOf(targetKey), 0, draggedColumn);
      return next;
    });
    setDraggedColumn(null);
  };
  const renderTransactionCell = (item, key) => {
    if (key === "amount") return <span className="block text-right font-semibold tabular-nums">{money(item.amount)}</span>;
    if (key === "paymentMethod") return <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{paymentMethodLabel(item.paymentMethod)}</span>;
    if (key === "detail") return (
      <button type="button" onClick={(event) => { event.stopPropagation(); setSelectedTransaction(item); }} className="inline-flex items-center gap-1 rounded-lg bg-[#EEF4FF] px-2 py-1.5 text-xs font-semibold text-[#3150D8] transition hover:bg-[#DCE8FF]">
        Ver <ArrowUpRight className="h-3.5 w-3.5" />
      </button>
    );
    if (key === "exitDate" || key === "exitTime") return item[key] || "—"; // OPEN/CANCELLED no tienen salida real
    return item[key] ?? "—";
  };
  const openDetail = (nextSelection) => {
    setSelection(nextSelection);
    setQuery(""); // una búsqueda de la selección anterior no debe ocultar filas de la nueva
    // Los filtros del modal (Estacionamiento/Periodo/Fechas) también se
    // reinician a sus valores por defecto — un rango aplicado en una
    // selección previa no debe ocultar silenciosamente filas de esta nueva
    // selección.
    const params = selectionToQueryParams(nextSelection);
    const from = params?.allDates ? "" : params?.dateFrom || DEFAULT_MODAL_FILTERS.from;
    const to = params?.allDates ? "" : params?.dateTo || DEFAULT_MODAL_FILTERS.to;
    setFilterParkingDraft(DEFAULT_MODAL_FILTERS.parking);
    setFilterPeriodDraft(DEFAULT_MODAL_FILTERS.periodLabel);
    setFilterFromDraft(from);
    setFilterToDraft(to);
    setFilterError("");
    const defaultFilters = { parking: DEFAULT_MODAL_FILTERS.parking, from, to };
    setAppliedFilters(defaultFilters);
    setDetailOpen(true);
    void fetchActivityReport({ selectionValue: nextSelection, filtersValue: defaultFilters, page: 1 });
  };

  return (
    <AppShell title="Dashboard General" description="Indicadores reales de operación y recaudación">
      <div className="space-y-5">
        <header className="flex flex-col gap-4 rounded-3xl border border-[#5271E8] bg-[#3150D8] p-5 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Datos en vivo · Off Street</p>
            <h1 className="mt-2 text-2xl font-semibold">Resumen comercial y transaccional</h1>
            <p className="mt-1 text-sm text-slate-300">Selecciona un indicador o una barra para ver su detalle.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/simulador-tarifas" className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#041E42] transition hover:bg-cyan-50">
              <Banknote className="h-4 w-4 text-emerald-600" /> Simular tarifa
            </Link>
            <Link href="/" className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold transition hover:bg-white/20">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Link>
          </div>
        </header>

        {loadError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700"><span>{loadError}</span><button type="button" onClick={() => setReloadKey((value) => value + 1)} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-rose-700">Reintentar</button></div> : null}
        {overview && !overview.hasOffStreet ? <p className="rounded-2xl border border-[#BFD2FF] bg-[#EEF4FF] px-4 py-3 text-sm text-[#041E42]">Este dashboard muestra la operación Off Street, y no hay estacionamientos Off Street disponibles. La información de On Street está en su propio Dashboard.</p> : null}

        <section className="grid gap-3 md:grid-cols-3">
          {[
            { label: "Vehículos pendientes", value: ready ? count(overview.kpis.pending) : "…", icon: Clock3, accent: "text-amber-600" },
            { label: "Total mensual cobrado", value: ready ? money(overview.kpis.monthlyTotal) : "…", icon: Banknote, accent: "text-emerald-600" },
            { label: "Transacciones totales", value: ready ? count(overview.kpis.transactions) : "…", icon: ReceiptText, accent: "text-[#3150D8]" },
          ].map(({ label, value, icon: Icon, accent }) => (
            <button key={label} type="button" onClick={() => openDetail({ type: "general", id: label, label })} className="flex items-center justify-between rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#3150D8] hover:shadow-md">
              <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p><p className={`mt-3 text-3xl font-semibold ${accent}`}>{value}</p></div>
              <div className="rounded-2xl bg-slate-50 p-3"><Icon className={`h-6 w-6 ${accent}`} /></div>
            </button>
          ))}
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-4 rounded-2xl border border-[#5271E8] bg-[#3150D8] px-5 py-4 text-white">
            <div className="rounded-xl bg-white/15 p-2.5 text-white shadow-sm"><BarChart3 className="h-6 w-6" /></div>
            <div><h2 className="text-2xl font-bold tracking-tight text-white">Actividad del mes actual</h2><p className="mt-1 text-sm text-blue-100">Selecciona un módulo para analizar su detalle.</p></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[...activityCards.slice(1), ...paymentCards].map((item) => {
              const Icon = item.icon;
              const isPayment = Boolean(item.isPayment);
              const tone = isPayment ? (item.id === "efectivo" ? "positive" : "info") : item.tone;
              return (
                <button key={item.id} type="button" onClick={() => openDetail({ type: isPayment ? "pago" : "actividad", id: item.id, label: item.label })} className="group flex min-h-36 items-center gap-4 rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#3150D8] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3150D8] focus-visible:ring-offset-2">
                  <span className={`inline-flex shrink-0 rounded-2xl p-3 ${toneClasses[tone]}`}><Icon className="h-6 w-6" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{item.label}</span>
                    <span className="mt-2 block text-3xl font-semibold tracking-tight text-[#041E42]">{!ready ? "…" : isPayment ? money(item.month) : count(item.month)}</span>
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#3150D8]">Ver detalle <ArrowUpRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-4 rounded-2xl border border-[#5271E8] bg-[#3150D8] px-5 py-4 text-white">
            <div className="rounded-xl bg-white/15 p-2.5 text-white shadow-sm"><Clock3 className="h-6 w-6" /></div>
            <div><h2 className="text-2xl font-bold tracking-tight text-white">Actividad del día</h2><p className="mt-1 text-sm text-blue-100">Resumen de movimientos y recaudación de hoy.</p></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[...activityCards.slice(1), ...paymentCards].map((item) => {
              const Icon = item.icon;
              const isPayment = Boolean(item.isPayment);
              const tone = isPayment ? (item.id === "efectivo" ? "positive" : "info") : item.tone;
              return (
                <button key={`day-${item.id}`} type="button" onClick={() => openDetail({ type: isPayment ? "pago-dia" : "actividad-dia", id: `day-${item.id}`, label: `${item.label} del día` })} className="group flex min-h-36 items-center gap-4 rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#2EA8FF] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2EA8FF] focus-visible:ring-offset-2">
                  <span className={`inline-flex shrink-0 rounded-2xl p-3 ${toneClasses[tone]}`}><Icon className="h-6 w-6" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{item.label}</span>
                    <span className="mt-2 block text-3xl font-semibold tracking-tight text-[#041E42]">{!ready ? "…" : isPayment ? money(item.day) : count(item.day)}</span>
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#3150D8]">Ver detalle <ArrowUpRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-[#EEF4FF] p-2 text-[#3150D8]"><BarChart3 className="h-5 w-5" /></div>
              <div><h2 className="font-semibold text-[#041E42]">Flujo de vehículos por día</h2><p className="text-xs text-slate-500">{flowDescription}</p></div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
                {periods.map((item) => <button key={item} type="button" onClick={() => setFlowPeriod(item)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${flowPeriod === item ? "bg-white text-[#3150D8] shadow-sm" : "text-slate-500"}`}>{item}</button>)}
              </div>
              <button type="button" onClick={() => setHourlyOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#041E42] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#0B3D91]"><CalendarDays className="h-4 w-4" />Ver flujo por hora</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            {flowError ? <p role="alert" className="p-6 text-sm font-medium text-rose-700">{flowError}</p> : !flow ? <p className="p-6 text-sm text-slate-500">Cargando…</p> : (
            <div className="grid min-h-[245px] grid-cols-[48px_1fr] gap-3 p-4" style={{ minWidth: `${Math.max(820, flowSeries.length * 64)}px` }}>
              <div className="flex flex-col justify-between pb-8 text-right text-xs text-slate-400">{flowTicks.map((tick) => <span key={tick}>{count(tick)}</span>)}</div>
              <div className="relative flex items-end justify-around gap-3 border-b border-l border-slate-200 bg-[linear-gradient(to_bottom,transparent_19%,#e2e8f0_20%,transparent_21%,transparent_39%,#e2e8f0_40%,transparent_41%,transparent_59%,#e2e8f0_60%,transparent_61%,transparent_79%,#e2e8f0_80%,transparent_81%)] px-4 pb-8">
                {flowSeries.map((item) => (
                  <div key={item.label} className="relative flex h-[190px] flex-1 items-end justify-center gap-1.5">
                    <button type="button" onClick={() => openDetail({ type: "actividad-dia", id: `entries-${item.label}`, label: `Ingresos · ${item.label}`, dateFrom: item.from, dateTo: item.to })} className="group relative h-full w-[38%] max-w-12" aria-label={`Ver ${item.entries} ingresos de ${item.label}`}>
                      <span className="absolute bottom-0 left-0 w-full rounded-t-md bg-[#3150D8] transition group-hover:bg-[#1E5EFF]" style={{ height: `${(item.entries / flowTop) * 100}%` }}><span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-[#041E42]">{item.entries}</span></span>
                    </button>
                    <button type="button" onClick={() => openDetail({ type: "actividad-dia", id: `exits-${item.label}`, label: `Salidas · ${item.label}`, dateFrom: item.from, dateTo: item.to })} className="group relative h-full w-[38%] max-w-12" aria-label={`Ver ${item.exits} salidas de ${item.label}`}>
                      <span className="absolute bottom-0 left-0 w-full rounded-t-md bg-[#2EA8FF] transition group-hover:bg-[#0EA5E9]" style={{ height: `${(item.exits / flowTop) * 100}%` }}><span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-slate-600">{item.exits}</span></span>
                    </button>
                    <span className="absolute -bottom-6 whitespace-nowrap text-[11px] font-medium text-slate-600">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
            )}
          </div>
          <div className="grid gap-3 border-t border-slate-100 px-5 py-4 sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="flex gap-5 text-xs text-slate-500"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-[#3150D8]" />Ingresos</span><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-[#2EA8FF]" />Salidas</span></div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs sm:justify-end"><span className="text-slate-500">Mayor flujo: <b className="text-[#041E42]">{flow?.summary.busiestLabel || "Sin movimientos"}</b></span><span className="text-slate-500">Balance del período: <b className="text-emerald-700">{(flow?.summary.balance ?? 0) > 0 ? "+" : ""}{count(flow?.summary.balance ?? 0).replace("-", "−")} vehículos</b></span><span className="text-slate-500">Promedio: <b className="text-[#041E42]">{count(flow?.summary.averageEntries ?? 0)} ingresos</b></span></div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-emerald-50 p-2 text-emerald-700"><CircleDollarSign className="h-5 w-5" /></span>
              <div><h2 className="font-semibold text-[#041E42]">Distribución de ingresos</h2><p className="text-xs text-slate-500">{incomePeriod === "month" ? "Participación del mes y año seleccionados" : "Participación del día seleccionado"} por medio de pago</p></div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex rounded-xl bg-slate-100 p-1">
                <button type="button" onClick={() => setIncomePeriod("month")} className={`rounded-lg px-3 py-2 text-xs font-bold transition ${incomePeriod === "month" ? "bg-white text-[#3150D8] shadow-sm" : "text-slate-500"}`}>Mes</button>
                <button type="button" onClick={() => setIncomePeriod("day")} className={`rounded-lg px-3 py-2 text-xs font-bold transition ${incomePeriod === "day" ? "bg-white text-[#3150D8] shadow-sm" : "text-slate-500"}`}>Día</button>
              </div>
              <label className="flex items-center gap-2 rounded-xl border border-[#BFD2FF] bg-[#EEF4FF] px-3 text-[#3150D8]">
                <CalendarDays className="h-4 w-4 shrink-0" />
                {incomePeriod === "month"
                  ? <input type="month" value={incomeMonth} onChange={(event) => setIncomeMonth(event.target.value)} className="bg-transparent py-2 text-sm font-bold text-[#041E42] outline-none" aria-label="Seleccionar mes y año de ingresos" />
                  : <input type="date" value={incomeDate} onChange={(event) => setIncomeDate(event.target.value)} className="bg-transparent py-2 text-sm font-bold text-[#041E42] outline-none" aria-label="Seleccionar día de ingresos" />}
              </label>
            </div>
          </div>
          <div className="grid items-center gap-6 p-5 lg:grid-cols-[minmax(280px,0.8fr)_1.2fr]">
            <div className="flex justify-center">
              <button type="button" onClick={() => openDetail({ type: "pago", id: "ingresos-pie", label: `Distribución de ingresos · ${incomePeriod === "month" ? incomeMonth : incomeDate}`, ...incomeRange })} className="group relative grid h-44 w-44 place-items-center rounded-full transition hover:scale-[1.02] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#3150D8]/20" style={{ background: `conic-gradient(${incomeStops})` }} aria-label="Analizar distribución de ingresos por medio de pago">
                <span className="grid h-28 w-28 place-items-center rounded-full bg-white text-center shadow-inner">
                  <span><span className="block text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">Total {incomePeriod === "month" ? "mensual" : "diario"}</span><span className="mt-1 block text-base font-bold text-[#041E42]">{money(incomeTotal)}</span><span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-[#3150D8]">Ver detalle <ArrowUpRight className="h-3 w-3" /></span></span>
                </span>
              </button>
            </div>
            <div className="space-y-3">
              {incomePayments.map((item) => {
                const colors = { efectivo: "bg-emerald-500", debito: "bg-slate-400", credito: "bg-[#3150D8]", sinClasificar: "bg-amber-500" };
                return (
                  <button key={`pie-${item.id}`} type="button" onClick={() => openDetail({ type: "pago", id: item.id, label: item.label, ...incomeRange })} className="group grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-slate-200 p-4 text-left transition hover:border-[#3150D8] hover:bg-[#F8FAFF]">
                    <span className={`h-4 w-4 rounded-full ${colors[item.id]}`} />
                    <span><span className="block text-sm font-bold text-[#041E42]">{item.label}</span><span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${colors[item.id]}`} style={{ width: `${item.selectedShare}%` }} /></span></span>
                    <span className="text-right"><span className="block font-bold tabular-nums text-[#041E42]">{money(item.selectedAmount)}</span><span className="text-xs font-semibold text-slate-500">{item.selectedShare}%</span></span>
                  </button>
                );
              })}
              <div className="rounded-2xl bg-[#EEF4FF] p-4 text-sm text-slate-600">{incomeError ? <span className="font-medium text-rose-700">{incomeError}</span> : !income ? "Cargando…" : incomeTotal > 0 ? <><b className="text-[#041E42]">Lectura rápida:</b> el {creditShare}% de los ingresos corresponde a crédito, el {cashShare}% a efectivo y el {debitShare}% a débito{otherShare ? `; el ${otherShare}% es tarjeta sin clasificar` : ""}.</> : "No hay ingresos en el período seleccionado."}</div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-[#EEF4FF] p-2 text-[#3150D8]"><CalendarClock className="h-5 w-5" /></span>
              <div><h2 className="font-semibold text-[#041E42]">Días y horas de mayor ocupación</h2><p className="text-xs text-slate-500">Promedio de los últimos 28 días: vehículos presentes a mitad de cada franja horaria sobre la capacidad</p></div>
            </div>
            {occupancy?.peak ? <span className="w-fit rounded-full bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700">Hora punta: {occupancy.peak.day.toLowerCase()} {occupancy.peak.hours}</span> : null}
          </div>
          <div className="overflow-x-auto p-5">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[110px_repeat(6,1fr)] gap-2">
                {occupancy && !occupancy.capacity ? <p className="col-span-full rounded-xl bg-amber-50 p-3 text-sm text-amber-900">No hay capacidad configurada en zonas activas: el porcentaje de ocupación no se puede calcular.</p> : null}
                <div className="rounded-xl bg-[#041E42] px-3 py-3 text-left text-sm font-bold text-white">Horario</div>
                {occupancyHours.map((hour) => <div key={hour} className="rounded-xl border border-[#BFD2FF] bg-[#EEF4FF] px-3 py-3 text-center text-sm font-extrabold text-[#0B3D91] shadow-sm">{hour}</div>)}
                {occupancyRows.flatMap((row) => [
                  <div key={`${row.day}-label`} className="flex items-center pr-3 text-sm font-bold text-[#041E42]">{row.day}</div>,
                  ...row.values.map((value, index) => (
                    <div key={`${row.day}-${occupancyHours[index]}`} className={`min-h-12 rounded-xl px-2 py-1.5 text-center ${heatTone(value)}`} aria-label={value === null ? `${row.day} de ${occupancyHours[index]}: sin datos` : `${row.day} de ${occupancyHours[index]}: ${value}% de ocupación`}>
                      <span className="block text-base font-bold tabular-nums">{value === null ? "—" : `${value}%`}</span>
                      <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-wider opacity-75">{value === null ? "Sin datos" : value >= 90 ? "Crítica" : value >= 80 ? "Alta" : value >= 65 ? "Media alta" : value >= 45 ? "Media" : "Baja"}</span>
                    </div>
                  )),
                ])}
              </div>
            </div>
          </div>
          <div className="grid gap-4 border-t border-slate-100 bg-slate-50 px-5 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="flex flex-wrap gap-3 text-xs text-slate-600">
              {[["bg-slate-100", "Baja <45%"], ["bg-cyan-100", "Media 45–64%"], ["bg-[#2EA8FF]", "Media alta 65–79%"], ["bg-[#3150D8]", "Alta 80–89%"], ["bg-[#041E42]", "Crítica ≥90%"]].map(([color, label]) => <span key={label} className="inline-flex items-center gap-2"><i className={`h-3 w-3 rounded-sm ${color}`} />{label}</span>)}
            </div>
            <div className="flex flex-wrap gap-4 text-xs">{occupancy?.peak ? <><span className="text-slate-500">Mayor ocupación: <b className="text-[#041E42]">{occupancy.peak.value}%</b></span><span className="text-slate-500">Día más exigente: <b className="text-[#041E42]">{occupancy.peak.day}</b></span><span className="text-slate-500">Franja horaria más alta: <b className="text-[#041E42]">{occupancy.peak.hours}</b></span></> : <span className="text-slate-500">Sin ocupación registrada en el período.</span>}</div>
          </div>
        </section>

        <div className="grid min-w-0 gap-5 xl:grid-cols-2">
          <ExcelTable title="Actividad" description="Resumen del día y del mes" icon={CarFront} columns={["", "Indicador", "Día actual", "Mes actual", "Estado", "Detalle"]}>
            {activityCards.map(({ id, label, day, month, status, icon: Icon, tone }) => (
              <tr key={id} onClick={() => setSelection({ type: "actividad", id, label })} className={`cursor-pointer border-b border-slate-100 last:border-b-0 hover:bg-[#EEF4FF] ${selection.id === id ? "bg-[#EEF4FF]" : "even:bg-slate-50/60"}`}>
                <td className="px-2 py-2.5"><span className={`inline-flex rounded-lg p-1.5 ${toneClasses[tone]}`}><Icon className="h-3.5 w-3.5" /></span></td>
                <td className="break-words px-2 py-2.5 font-semibold leading-tight text-[#041E42]">{label}</td><td className="px-2 py-2.5 tabular-nums">{ready ? count(day) : "…"}</td><td className="px-2 py-2.5 tabular-nums">{ready ? count(month) : "…"}</td>
                <td className="px-2 py-2.5"><span className={`inline-flex max-w-full rounded-full px-2 py-1 text-[9px] font-semibold leading-tight ${toneClasses[tone]}`}>{status}</span></td>
                <td className="px-2 py-2.5"><ArrowUpRight className="h-3.5 w-3.5 text-[#3150D8]" /></td>
              </tr>
            ))}
          </ExcelTable>

          <ExcelTable title="Medios de pago" description="Distribución de la recaudación" icon={CreditCard} columns={["", "Medio", "Día actual", "Mes actual", "Participación", "Detalle"]}>
            {paymentCards.map(({ id, label, day, month, share, icon: Icon }) => (
              <tr key={id} onClick={() => setSelection({ type: "pago", id, label })} className={`cursor-pointer border-b border-slate-100 last:border-b-0 hover:bg-[#EEF4FF] ${selection.id === id ? "bg-[#EEF4FF]" : "even:bg-slate-50/60"}`}>
                <td className="px-2 py-2.5"><span className="inline-flex rounded-lg bg-emerald-50 p-1.5 text-emerald-700"><Icon className="h-3.5 w-3.5" /></span></td>
                <td className="break-words px-2 py-2.5 font-semibold leading-tight text-[#041E42]">{label}</td><td className="px-2 py-2.5 tabular-nums">{money(day)}</td><td className="px-2 py-2.5 tabular-nums">{money(month)}</td>
                <td className="px-2 py-2.5"><div className="flex min-w-0 items-center gap-1"><span className="h-1.5 min-w-5 flex-1 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-[#3150D8]" style={{ width: `${share}%` }} /></span><span>{share}%</span></div></td>
                <td className="px-2 py-2.5"><ArrowUpRight className="h-3.5 w-3.5 text-[#3150D8]" /></td>
              </tr>
            ))}
            <tr className="bg-[#041E42] font-semibold text-white"><td className="px-2 py-2.5" /><td className="px-2 py-2.5">Total cobrado</td><td className="px-2 py-2.5">{money(overview?.payments.day.total ?? 0)}</td><td className="px-2 py-2.5">{money(overview?.payments.month.total ?? 0)}</td><td className="px-2 py-2.5">100%</td><td className="px-2 py-2.5" /></tr>
          </ExcelTable>
        </div>

        <aside className="flex flex-col gap-3 rounded-2xl border border-[#BFD2FF] bg-[#EEF4FF] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#3150D8]">Selección actual</p><p className="mt-1 font-semibold text-[#041E42]">{selection.label}</p><p className="text-sm text-slate-600">Abre la tabla de transacciones correspondiente al indicador seleccionado.</p></div>
          <button type="button" onClick={() => openDetail(selection)} className="inline-flex w-fit items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white"><ArrowUpRight className="h-4 w-4" />Analizar detalle</button>
        </aside>

        {detailOpen ? <div className="fixed inset-0 z-40 overflow-y-auto bg-[#041E42]/70 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailOpen(false); }}>
        <section id="detalle-transacciones" tabIndex={-1} className="mx-auto my-3 w-full max-w-[1500px] overflow-hidden rounded-3xl border border-[#3150D8] bg-white shadow-2xl outline-none sm:my-6">
          <div className="flex flex-col gap-5 border-b border-slate-200 bg-[#041E42] px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">Detalle seleccionado</p>
              <h2 className="mt-1 text-xl font-semibold">{selection.label}</h2>
              <p className="mt-1 text-sm text-slate-300">Desglose de transacciones y medios de pago.</p>
            </div>
            <div className="flex shrink-0 items-start gap-4 sm:text-right">
              <div>
              <p className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{money(finalTotal)}</p>
              <span className="mt-2 inline-flex rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-cyan-100">Datos en vivo{reportTotal > finalRows.length ? " · total de la página actual" : ""}</span>
              </div>
              <button type="button" onClick={() => setDetailOpen(false)} className="rounded-full p-2 text-slate-300 transition hover:bg-white/10 hover:text-white" aria-label="Cerrar detalle"><X className="h-5 w-5" /></button>
            </div>
          </div>

          <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr_1fr_auto]">
            <label className="space-y-1 text-xs font-semibold text-slate-600">
              <span>Estacionamiento</span>
              <select value={filterParkingDraft} onChange={(event) => setFilterParkingDraft(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-[#041E42] outline-none focus:border-[#3150D8]">
                <option value="todos">Todos los estacionamientos</option>
                {availableParkings.map((parking) => <option key={parking.id} value={parking.id}>{parking.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-600">
              <span>Periodo</span>
              <select value={filterPeriodDraft} onChange={(event) => applyPeriodDraft(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-[#041E42] outline-none focus:border-[#3150D8]">
                {periods.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-600"><span>Fecha desde</span><input type="date" value={filterFromDraft} onChange={(event) => setFilterFromDraft(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-[#041E42] outline-none focus:border-[#3150D8]" /></label>
            <label className="space-y-1 text-xs font-semibold text-slate-600"><span>Fecha hasta</span><input type="date" value={filterToDraft} onChange={(event) => setFilterToDraft(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-[#041E42] outline-none focus:border-[#3150D8]" /></label>
            <button type="button" onClick={runSearch} className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#3150D8] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1E5EFF]"><Search className="h-4 w-4" />Buscar</button>
            {filterError ? <p className="text-xs font-semibold text-rose-600 sm:col-span-2 xl:col-span-5">{filterError}</p> : null}
          </div>

          <div className="flex flex-col gap-3 px-4 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-slate-500">
                <span className="font-semibold text-[#041E42]">{reportLoading ? "…" : reportTotal}</span> {reportTotal === 1 ? "transacción encontrada" : "transacciones encontradas"}
                {reportTotal > REPORT_PAGE_SIZE ? <span className="ml-1 text-xs text-slate-400">(página {reportPage} de {Math.max(1, Math.ceil(reportTotal / REPORT_PAGE_SIZE))})</span> : null}
              </p>
              <p className="mt-1 text-xs font-medium text-[#3150D8]">Ordenado por {transactionColumns.find((column) => column.key === sort.key)?.label}: {sort.direction === "asc" ? "menor a mayor" : "mayor a menor"}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={exportFinalRowsToCsv} disabled={finalRows.length === 0} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition disabled:cursor-not-allowed disabled:opacity-50"><FileSpreadsheet className="h-4 w-4" />Exportar Excel</button>
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-500"><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar en resultados" className="w-40 outline-none" /></label>
            </div>
          </div>

          {reportError ? <p className="mx-4 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{reportError}</p> : null}

          <p className="px-4 pt-3 text-xs font-medium text-slate-500">Desplaza horizontalmente la grilla para consultar todas las columnas →</p>
          <div className="m-3 max-w-full touch-pan-x overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-300 sm:m-4">
            <table className="w-full min-w-[1500px] table-fixed border-collapse text-left text-xs">
              <thead className="bg-[#3150D8] text-xs uppercase tracking-[0.08em] text-white">
                <tr>{orderedColumns.map((column) => (
                  <th
                    key={column.key}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => moveColumn(column.key)}
                    className={`${transactionColumnWidths[column.key]} select-none border-r border-white/15 px-1 py-2 font-semibold last:border-r-0`}
                  >
                    <div className="flex min-w-0 items-center gap-0.5">
                      <span
                        draggable
                        onDragStart={(event) => {
                          event.stopPropagation();
                          setDraggedColumn(column.key);
                        }}
                        className="inline-flex shrink-0 cursor-grab rounded p-0.5 text-white/60 hover:bg-white/10 hover:text-white active:cursor-grabbing"
                        title="Arrastra para mover la columna"
                        aria-label={`Mover columna ${column.label}`}
                      >
                        <GripVertical className="h-4 w-4 shrink-0" />
                      </span>
                      <span className="min-w-0 flex-1 leading-tight">{column.label}</span>
                      <span className="flex shrink-0 flex-col items-center">
                        <button
                          type="button"
                          draggable={false}
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            applySort(column.key, "asc");
                          }}
                          onClick={(event) => { event.preventDefault(); event.stopPropagation(); applySort(column.key, "asc"); }}
                          className={`rounded p-0.5 transition hover:bg-white/20 ${sort.key === column.key && sort.direction === "asc" ? "bg-white text-[#3150D8]" : "text-white/70"}`}
                          aria-label={`Ordenar ${column.label} de menor a mayor`}
                          title="Ordenar de menor a mayor"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          draggable={false}
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            applySort(column.key, "desc");
                          }}
                          onClick={(event) => { event.preventDefault(); event.stopPropagation(); applySort(column.key, "desc"); }}
                          className={`rounded p-0.5 transition hover:bg-white/20 ${sort.key === column.key && sort.direction === "desc" ? "bg-white text-[#3150D8]" : "text-white/70"}`}
                          aria-label={`Ordenar ${column.label} de mayor a menor`}
                          title="Ordenar de mayor a menor"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </div>
                  </th>
                ))}</tr>
              </thead>
              <tbody>{reportLoading ? (
                <tr><td colSpan={orderedColumns.length} className="px-4 py-8 text-center text-sm font-medium text-slate-500">Cargando resultados...</td></tr>
              ) : finalRows.length === 0 ? (
                <tr><td colSpan={orderedColumns.length} className="px-4 py-8 text-center text-sm font-medium text-slate-500">{reportError ? "No fue posible cargar los resultados." : `No existen registros para los criterios seleccionados (${selection.label}).`}</td></tr>
              ) : finalRows.map((item) => (
                <tr key={item.id} onClick={() => setSelectedTransaction(item)} className="cursor-pointer border-b border-slate-100 last:border-b-0 even:bg-slate-50 hover:bg-[#EEF4FF]">
                  {orderedColumns.map((column) => <td key={column.key} className={`border-r border-slate-100 px-2 py-2.5 align-middle last:border-r-0 ${column.key === "plate" ? "font-semibold text-[#3150D8]" : ""} ${["entryDate", "entryTime", "exitDate", "exitTime", "minutes"].includes(column.key) ? "whitespace-nowrap text-center tabular-nums" : ""}`}>{renderTransactionCell(item, column.key)}</td>)}
                </tr>
              ))}</tbody>
            </table>
          </div>
          {reportTotal > REPORT_PAGE_SIZE ? (
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-3">
              <button type="button" onClick={() => goToReportPage(reportPage - 1)} disabled={reportPage <= 1 || reportLoading} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Anterior</button>
              <button type="button" onClick={() => goToReportPage(reportPage + 1)} disabled={reportPage >= Math.ceil(reportTotal / REPORT_PAGE_SIZE) || reportLoading} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Siguiente</button>
            </div>
          ) : null}
        </section></div> : null}
      </div>

      {selectedTransaction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onClick={() => setSelectedTransaction(null)}>
          <section className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <header className="flex items-center justify-between gap-4 bg-[#041E42] px-5 py-4 text-white">
              <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">Detalle de transacción</p><h2 className="mt-1 text-xl font-semibold">{selectedTransaction.plate}</h2></div>
              <button type="button" onClick={() => setSelectedTransaction(null)} className="rounded-full p-2 text-slate-300 transition hover:bg-white/10 hover:text-white" aria-label="Cerrar detalle"><X className="h-5 w-5" /></button>
            </header>
            <div className="grid gap-px bg-slate-200 sm:grid-cols-2">
              {[
                ["Ticket", selectedTransaction.ticket || "—"],
                ["Fecha de entrada", selectedTransaction.entryDate],
                ["Hora de entrada", selectedTransaction.entryTime],
                ["Fecha de salida", selectedTransaction.exitDate || "—"],
                ["Hora de salida", selectedTransaction.exitTime || "—"],
                ["Minutos consumidos", selectedTransaction.minutes != null ? `${selectedTransaction.minutes} minutos` : "—"],
                ["Monto cobrado", money(selectedTransaction.amount)],
                ["Medio de pago", paymentMethodLabel(selectedTransaction.paymentMethod)],
                ["Operador", selectedTransaction.operator || "—"],
                ["Estacionamiento", selectedTransaction.parkingName || "—"],
                ["Estado", selectedTransaction.status || "—"],
                ["Identificador", selectedTransaction.id],
              ].map(([label, value]) => (
                <div key={label} className="bg-white px-5 py-4"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</p><p className="mt-1 font-semibold text-[#041E42]">{value}</p></div>
              ))}
            </div>
            <footer className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-4">
              <button type="button" onClick={() => setSelectedTransaction(null)} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white">Cerrar</button>
            </footer>
          </section>
        </div>
      ) : null}

      {hourlyOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={() => setHourlyOpen(false)}>
          <section className="w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <header className="flex flex-col gap-4 bg-[#041E42] px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3"><span className="rounded-xl bg-white/10 p-2"><LineChart className="h-5 w-5 text-cyan-200" /></span><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">Análisis horario</p><h2 className="mt-1 text-xl font-semibold">Flujo de ingresos y salidas</h2></div></div>
              <button type="button" onClick={() => setHourlyOpen(false)} className="rounded-full p-2 text-slate-300 transition hover:bg-white/10 hover:text-white" aria-label="Cerrar gráfico"><X className="h-5 w-5" /></button>
            </header>

            <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 sm:items-end">
              <label className="space-y-1 text-xs font-semibold text-slate-600"><span>Día a analizar</span><input type="date" value={flowDate} onChange={(event) => setFlowDate(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-[#041E42] outline-none focus:border-[#3150D8]" /></label>
              <label className="space-y-1 text-xs font-semibold text-slate-600"><span>Bloque destacado</span><select value={flowHour} onChange={(event) => setFlowHour(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-[#041E42] outline-none focus:border-[#3150D8]">{["00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00"].map((hour) => <option key={hour} value={hour}>{hour} a {String(Number(hour.slice(0, 2)) + 3).padStart(2, "0")}:00</option>)}</select></label>
            </div>

            <div className="p-4 sm:p-6">
              {hourlyError ? <p role="alert" className="mb-3 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700">{hourlyError}</p> : null}
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <svg viewBox="0 0 900 390" className="min-w-[760px]" role="img" aria-label="Gráfico de líneas de ingresos y salidas por hora">
                  {[60, 120, 180, 240, 300].map((y) => <line key={y} x1="65" y1={y} x2="865" y2={y} stroke="#E2E8F0" strokeWidth="1" />)}
                  <line x1="65" y1="320" x2="865" y2="320" stroke="#94A3B8" />
                  <line x1="65" y1="40" x2="65" y2="320" stroke="#94A3B8" />
                  {hourlyTicks.map((value, index) => <text key={value} x="52" y={45 + index * 46.7} textAnchor="end" fontSize="11" fill="#64748B">{count(value)}</text>)}
                  {hourlyFlow.map((item, index) => <text key={item.hour} x={hourlyX(index)} y="345" textAnchor="middle" fontSize="11" fill="#64748B">{item.hour}</text>)}
                  {hourlyFlow.map((item, index) => item.hour === flowHour ? <line key={`selected-${item.hour}`} x1={hourlyX(index)} y1="40" x2={hourlyX(index)} y2="320" stroke="#F59E0B" strokeWidth="2" strokeDasharray="5 5" /> : null)}
                  <polyline fill="none" stroke="#3150D8" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" points={hourlyFlow.map((item, index) => `${hourlyX(index)},${hourlyY(item.entries)}`).join(" ")} />
                  <polyline fill="none" stroke="#2EA8FF" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" points={hourlyFlow.map((item, index) => `${hourlyX(index)},${hourlyY(item.exits)}`).join(" ")} />
                  {hourlyFlow.map((item, index) => <g key={`points-${item.hour}`}><circle cx={hourlyX(index)} cy={hourlyY(item.entries)} r="5" fill="#3150D8" /><circle cx={hourlyX(index)} cy={hourlyY(item.exits)} r="5" fill="#2EA8FF" /></g>)}
                </svg>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-[#EEF4FF] p-4"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#3150D8]">Ingresos desde las {flowHour}</p><p className="mt-2 text-2xl font-bold text-[#041E42]">{hourlyFlow.find((item) => item.hour === flowHour)?.entries ?? "—"}</p></div>
                <div className="rounded-2xl bg-cyan-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#0369A1]">Salidas desde las {flowHour}</p><p className="mt-2 text-2xl font-bold text-[#041E42]">{hourlyFlow.find((item) => item.hour === flowHour)?.exits ?? "—"}</p></div>
                <div className="rounded-2xl bg-amber-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-amber-700">Lectura del flujo</p><p className="mt-2 text-sm font-semibold text-[#041E42]">Las líneas se cruzan cuando la demanda cambia de ingresos predominantes a salidas predominantes.</p></div>
              </div>
              <div className="mt-4 flex justify-center gap-5 text-xs text-slate-600"><span className="flex items-center gap-2"><i className="h-2.5 w-6 rounded-full bg-[#3150D8]" />Ingresos</span><span className="flex items-center gap-2"><i className="h-2.5 w-6 rounded-full bg-[#2EA8FF]" />Salidas</span><span className="flex items-center gap-2"><i className="h-0.5 w-6 bg-amber-500" />Bloque seleccionado</span></div>
            </div>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
