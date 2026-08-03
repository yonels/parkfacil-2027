"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
  { id: "pendientes", label: "Vehículos pendientes", day: 1, month: 6, status: "Pendiente", icon: Clock3, tone: "warning" },
  { id: "ingresos", label: "Ingresos", day: 41, month: 1388, status: "Registrados", icon: CarFront, tone: "info" },
  { id: "salidas", label: "Salidas", day: 39, month: 1348, status: "Registradas", icon: LogOut, tone: "positive" },
  { id: "anulados", label: "Anulados", day: 2, month: 37, status: "Anulados", icon: Ban, tone: "danger" },
];

const payments = [
  { id: "efectivo", label: "Efectivo", day: 18450, month: 545670, share: 22, icon: Banknote },
  { id: "debito", label: "Débito", day: 0, month: 0, share: 0, icon: CreditCard },
  { id: "credito", label: "Crédito", day: 64780, month: 1932510, share: 78, icon: CreditCard },
];

const flowData = [
  { label: "22 Jul", entries: 164, exits: 151 },
  { label: "23 Jul", entries: 183, exits: 176 },
  { label: "24 Jul", entries: 197, exits: 188 },
  { label: "25 Jul", entries: 221, exits: 213 },
  { label: "26 Jul", entries: 208, exits: 205 },
  { label: "27 Jul", entries: 247, exits: 239 },
  { label: "28 Jul", entries: 168, exits: 176 },
];

const hourlyFlow = [
  { hour: "00:00", entries: 8, exits: 14 },
  { hour: "03:00", entries: 5, exits: 9 },
  { hour: "06:00", entries: 18, exits: 11 },
  { hour: "09:00", entries: 46, exits: 28 },
  { hour: "12:00", entries: 37, exits: 42 },
  { hour: "15:00", entries: 51, exits: 45 },
  { hour: "18:00", entries: 34, exits: 53 },
  { hour: "21:00", entries: 19, exits: 31 },
  { hour: "23:00", entries: 10, exits: 16 },
];

const occupancyHeatmap = [
  { day: "Lunes", values: [28, 52, 76, 84, 71, 42] },
  { day: "Martes", values: [31, 58, 81, 88, 75, 45] },
  { day: "Miércoles", values: [34, 61, 85, 92, 79, 48] },
  { day: "Jueves", values: [36, 64, 87, 94, 82, 51] },
  { day: "Viernes", values: [39, 69, 91, 97, 89, 63] },
  { day: "Sábado", values: [22, 46, 68, 79, 73, 55] },
  { day: "Domingo", values: [17, 35, 51, 64, 58, 38] },
];

const occupancyHours = ["06–09", "09–12", "12–15", "15–18", "18–21", "21–00"];

function heatTone(value) {
  if (value >= 90) return "bg-[#041E42] text-white";
  if (value >= 80) return "bg-[#3150D8] text-white";
  if (value >= 65) return "bg-[#2EA8FF] text-white";
  if (value >= 45) return "bg-cyan-100 text-cyan-900";
  return "bg-slate-100 text-slate-600";
}

const transactions = [
  { id: "t-001", plate: "LXPB20", entryDate: "28/07/2026", entryTime: "08:46", exitDate: "28/07/2026", exitTime: "09:02", minutes: 16, user: "Operador 2", plan: "Plan Básico 30 plazas", amount: 480, payment: "Efectivo" },
  { id: "t-002", plate: "JRDR29", entryDate: "27/07/2026", entryTime: "18:24", exitDate: "27/07/2026", exitTime: "19:49", minutes: 85, user: "Operador 2", plan: "Plan Básico 30 plazas", amount: 2550, payment: "Crédito" },
  { id: "t-003", plate: "DHGL81", entryDate: "27/07/2026", entryTime: "18:23", exitDate: "27/07/2026", exitTime: "19:16", minutes: 53, user: "Operador 2", plan: "Plan Básico 30 plazas", amount: 1590, payment: "Efectivo" },
  { id: "t-004", plate: "BHPR54", entryDate: "27/07/2026", entryTime: "18:16", exitDate: "27/07/2026", exitTime: "19:04", minutes: 48, user: "Operador 2", plan: "Plan Básico 30 plazas", amount: 1440, payment: "Crédito" },
  { id: "t-005", plate: "LPKB69", entryDate: "27/07/2026", entryTime: "18:09", exitDate: "27/07/2026", exitTime: "19:01", minutes: 52, user: "Operador 2", plan: "Plan Básico 30 plazas", amount: 1560, payment: "Crédito" },
  { id: "t-006", plate: "PRVH63", entryDate: "27/07/2026", entryTime: "18:04", exitDate: "27/07/2026", exitTime: "19:00", minutes: 56, user: "Operador 2", plan: "Plan Básico 30 plazas", amount: 1680, payment: "Crédito" },
];

const transactionColumns = [
  { key: "plate", label: "Patente" },
  { key: "entryDate", label: "Fecha entrada" },
  { key: "entryTime", label: "Hora entrada" },
  { key: "exitDate", label: "Fecha salida" },
  { key: "exitTime", label: "Hora salida" },
  { key: "minutes", label: "Minutos consumidos" },
  { key: "user", label: "Usuario" },
  { key: "plan", label: "Plan" },
  { key: "amount", label: "Monto" },
  { key: "payment", label: "Medio de pago" },
  { key: "detail", label: "Detalle" },
];

const transactionColumnWidths = {
  plate: "w-[8%]",
  entryDate: "w-[10%]",
  entryTime: "w-[8%]",
  exitDate: "w-[10%]",
  exitTime: "w-[8%]",
  minutes: "w-[10%]",
  user: "w-[10%]",
  plan: "w-[12%]",
  amount: "w-[9%]",
  payment: "w-[9%]",
  detail: "w-[6%]",
};

const toneClasses = {
  warning: "bg-amber-50 text-amber-700",
  info: "bg-blue-50 text-[#3150D8]",
  positive: "bg-emerald-50 text-emerald-700",
  danger: "bg-rose-50 text-rose-700",
};

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
  const [period, setPeriod] = useState("Mes");
  const [selection, setSelection] = useState({ type: "actividad", id: "ingresos", label: "Ingresos" });
  const [query, setQuery] = useState("");
  const [columnOrder, setColumnOrder] = useState(transactionColumns.map((column) => column.key));
  const [sort, setSort] = useState({ key: "entryDate", direction: "desc" });
  const [sortedTransactions, setSortedTransactions] = useState(() => [...transactions]);
  const [draggedColumn, setDraggedColumn] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [hourlyOpen, setHourlyOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [flowDate, setFlowDate] = useState("2026-07-28");
  const [flowHour, setFlowHour] = useState("15:00");
  const [incomePeriod, setIncomePeriod] = useState("month");
  const [incomeMonth, setIncomeMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [incomeDate, setIncomeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const totalMonth = useMemo(() => payments.reduce((sum, item) => sum + item.month, 0), []);
  const incomePayments = useMemo(() => {
    const selectedDay = Number(incomeDate.slice(-2)) || 28;
    const dayFactor = incomeDate === "2026-07-28" ? 1 : 0.78 + (selectedDay % 7) * 0.055;
    const selectedMonth = Number(incomeMonth.slice(-2)) || 7;
    const monthFactor = incomeMonth === "2026-07" ? 1 : 0.86 + (selectedMonth % 5) * 0.045;
    const periodValues = payments.map((item) => Math.round((incomePeriod === "day" ? item.day * dayFactor : item.month * monthFactor)));
    const periodTotal = periodValues.reduce((sum, value) => sum + value, 0);
    return payments.map((item, index) => ({
      ...item,
      selectedAmount: periodValues[index],
      selectedShare: periodTotal > 0 ? Math.round((periodValues[index] / periodTotal) * 100) : 0,
    }));
  }, [incomeDate, incomeMonth, incomePeriod]);
  const incomeTotal = incomePayments.reduce((sum, item) => sum + item.selectedAmount, 0);
  const cashShare = incomePayments.find((item) => item.id === "efectivo")?.selectedShare ?? 0;
  const debitShare = incomePayments.find((item) => item.id === "debito")?.selectedShare ?? 0;
  const creditShare = 100 - cashShare - debitShare;
  const filteredTransactions = useMemo(() => sortedTransactions.filter((item) => Object.values(item).some((value) => String(value).toLowerCase().includes(query.toLowerCase()))), [query, sortedTransactions]);
  const applySort = (key, direction) => {
    const nextRows = [...transactions].sort((a, b) => {
      const left = key === "detail" ? a.id : a[key];
      const right = key === "detail" ? b.id : b[key];
      const comparison = typeof left === "number" ? left - right : String(left).localeCompare(String(right), "es", { numeric: true });
      return direction === "asc" ? comparison : -comparison;
    });
    setSort({ key, direction });
    setSortedTransactions(nextRows);
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
    if (key === "payment") return <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{item.payment}</span>;
    if (key === "detail") return (
      <button type="button" onClick={(event) => { event.stopPropagation(); setSelectedTransaction(item); }} className="inline-flex items-center gap-1 rounded-lg bg-[#EEF4FF] px-2 py-1.5 text-xs font-semibold text-[#3150D8] transition hover:bg-[#DCE8FF]">
        Ver <ArrowUpRight className="h-3.5 w-3.5" />
      </button>
    );
    return item[key];
  };
  const openDetail = (nextSelection) => {
    setSelection(nextSelection);
    setDetailOpen(true);
  };

  return (
    <AppShell title="Modelo Dashboard" description="Prototipo para visualización y análisis">
      <div className="space-y-5">
        <header className="flex flex-col gap-4 rounded-3xl border border-[#5271E8] bg-[#3150D8] p-5 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Modelo de prueba</p>
            <h1 className="mt-2 text-2xl font-semibold">Resumen comercial y transaccional</h1>
            <p className="mt-1 text-sm text-slate-300">Todos los indicadores, barras y filas son interactivos.</p>
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

        <section className="grid gap-3 md:grid-cols-3">
          {[
            { label: "Vehículos pendientes", value: "6", icon: Clock3, accent: "text-amber-600" },
            { label: "Total mensual cobrado", value: money(totalMonth), icon: Banknote, accent: "text-emerald-600" },
            { label: "Transacciones totales", value: "1.388", icon: ReceiptText, accent: "text-[#3150D8]" },
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
            {[...activity.slice(1), ...payments].map((item) => {
              const Icon = item.icon;
              const isPayment = Object.hasOwn(item, "share");
              const tone = isPayment ? (item.id === "efectivo" ? "positive" : "info") : item.tone;
              return (
                <button key={item.id} type="button" onClick={() => openDetail({ type: isPayment ? "pago" : "actividad", id: item.id, label: item.label })} className="group flex min-h-36 items-center gap-4 rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#3150D8] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3150D8] focus-visible:ring-offset-2">
                  <span className={`inline-flex shrink-0 rounded-2xl p-3 ${toneClasses[tone]}`}><Icon className="h-6 w-6" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{item.label}</span>
                    <span className="mt-2 block text-3xl font-semibold tracking-tight text-[#041E42]">{isPayment ? money(item.month) : new Intl.NumberFormat("es-CL").format(item.month)}</span>
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
            {[...activity.slice(1), ...payments].map((item) => {
              const Icon = item.icon;
              const isPayment = Object.hasOwn(item, "share");
              const tone = isPayment ? (item.id === "efectivo" ? "positive" : "info") : item.tone;
              return (
                <button key={`day-${item.id}`} type="button" onClick={() => openDetail({ type: isPayment ? "pago-dia" : "actividad-dia", id: `day-${item.id}`, label: `${item.label} del día` })} className="group flex min-h-36 items-center gap-4 rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#2EA8FF] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2EA8FF] focus-visible:ring-offset-2">
                  <span className={`inline-flex shrink-0 rounded-2xl p-3 ${toneClasses[tone]}`}><Icon className="h-6 w-6" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{item.label}</span>
                    <span className="mt-2 block text-3xl font-semibold tracking-tight text-[#041E42]">{isPayment ? money(item.day) : new Intl.NumberFormat("es-CL").format(item.day)}</span>
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
              <div><h2 className="font-semibold text-[#041E42]">Flujo de vehículos por día</h2><p className="text-xs text-slate-500">Ingresos y salidas registrados durante los últimos siete días</p></div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
                {periods.map((item) => <button key={item} type="button" onClick={() => setPeriod(item)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${period === item ? "bg-white text-[#3150D8] shadow-sm" : "text-slate-500"}`}>{item}</button>)}
              </div>
              <button type="button" onClick={() => setHourlyOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#041E42] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#0B3D91]"><CalendarDays className="h-4 w-4" />Ver flujo por hora</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="grid min-h-[245px] min-w-[820px] grid-cols-[48px_1fr] gap-3 p-4">
              <div className="flex flex-col justify-between pb-8 text-right text-xs text-slate-400"><span>250</span><span>200</span><span>150</span><span>100</span><span>50</span><span>0</span></div>
              <div className="relative flex items-end justify-around gap-3 border-b border-l border-slate-200 bg-[linear-gradient(to_bottom,transparent_19%,#e2e8f0_20%,transparent_21%,transparent_39%,#e2e8f0_40%,transparent_41%,transparent_59%,#e2e8f0_60%,transparent_61%,transparent_79%,#e2e8f0_80%,transparent_81%)] px-4 pb-8">
                {flowData.map((item) => (
                  <div key={item.label} className="relative flex h-[190px] flex-1 items-end justify-center gap-1.5">
                    <button type="button" onClick={() => openDetail({ type: "actividad-dia", id: `entries-${item.label}`, label: `Ingresos · ${item.label}` })} className="group relative h-full w-[38%] max-w-12" aria-label={`Ver ${item.entries} ingresos del ${item.label}`}>
                      <span className="absolute bottom-0 left-0 w-full rounded-t-md bg-[#3150D8] transition group-hover:bg-[#1E5EFF]" style={{ height: `${(item.entries / 250) * 100}%` }}><span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-[#041E42]">{item.entries}</span></span>
                    </button>
                    <button type="button" onClick={() => openDetail({ type: "actividad-dia", id: `exits-${item.label}`, label: `Salidas · ${item.label}` })} className="group relative h-full w-[38%] max-w-12" aria-label={`Ver ${item.exits} salidas del ${item.label}`}>
                      <span className="absolute bottom-0 left-0 w-full rounded-t-md bg-[#2EA8FF] transition group-hover:bg-[#0EA5E9]" style={{ height: `${(item.exits / 250) * 100}%` }}><span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-slate-600">{item.exits}</span></span>
                    </button>
                    <span className="absolute -bottom-6 whitespace-nowrap text-[11px] font-medium text-slate-600">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-3 border-t border-slate-100 px-5 py-4 sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="flex gap-5 text-xs text-slate-500"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-[#3150D8]" />Ingresos</span><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-[#2EA8FF]" />Salidas</span></div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs sm:justify-end"><span className="text-slate-500">Día con mayor flujo: <b className="text-[#041E42]">27 Jul</b></span><span className="text-slate-500">Balance semanal: <b className="text-emerald-700">+40 vehículos</b></span><span className="text-slate-500">Promedio diario: <b className="text-[#041E42]">198 ingresos</b></span></div>
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
              <button type="button" onClick={() => openDetail({ type: "pago", id: "ingresos-pie", label: `Distribución de ingresos · ${incomePeriod === "month" ? incomeMonth : incomeDate}` })} className="group relative grid h-44 w-44 place-items-center rounded-full transition hover:scale-[1.02] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#3150D8]/20" style={{ background: `conic-gradient(#3150D8 0% ${creditShare}%, #10B981 ${creditShare}% ${creditShare + cashShare}%, #CBD5E1 ${creditShare + cashShare}% 100%)` }} aria-label="Analizar distribución de ingresos por medio de pago">
                <span className="grid h-28 w-28 place-items-center rounded-full bg-white text-center shadow-inner">
                  <span><span className="block text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">Total {incomePeriod === "month" ? "mensual" : "diario"}</span><span className="mt-1 block text-base font-bold text-[#041E42]">{money(incomeTotal)}</span><span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-[#3150D8]">Ver detalle <ArrowUpRight className="h-3 w-3" /></span></span>
                </span>
              </button>
            </div>
            <div className="space-y-3">
              {incomePayments.map((item) => {
                const colors = { efectivo: "bg-emerald-500", debito: "bg-slate-300", credito: "bg-[#3150D8]" };
                return (
                  <button key={`pie-${item.id}`} type="button" onClick={() => openDetail({ type: "pago", id: item.id, label: item.label })} className="group grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-slate-200 p-4 text-left transition hover:border-[#3150D8] hover:bg-[#F8FAFF]">
                    <span className={`h-4 w-4 rounded-full ${colors[item.id]}`} />
                    <span><span className="block text-sm font-bold text-[#041E42]">{item.label}</span><span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${colors[item.id]}`} style={{ width: `${item.selectedShare}%` }} /></span></span>
                    <span className="text-right"><span className="block font-bold tabular-nums text-[#041E42]">{money(item.selectedAmount)}</span><span className="text-xs font-semibold text-slate-500">{item.selectedShare}%</span></span>
                  </button>
                );
              })}
              <div className="rounded-2xl bg-[#EEF4FF] p-4 text-sm text-slate-600"><b className="text-[#041E42]">Lectura rápida:</b> el {creditShare}% de los ingresos corresponde a crédito, el {cashShare}% a efectivo y el {debitShare}% a débito.</div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-[#EEF4FF] p-2 text-[#3150D8]"><CalendarClock className="h-5 w-5" /></span>
              <div><h2 className="font-semibold text-[#041E42]">Días y horas de mayor ocupación</h2><p className="text-xs text-slate-500">Mapa de calor semanal por porcentaje de capacidad utilizada</p></div>
            </div>
            <span className="w-fit rounded-full bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700">Hora punta: viernes 15:00–18:00</span>
          </div>
          <div className="overflow-x-auto p-5">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[110px_repeat(6,1fr)] gap-2">
                <div className="rounded-xl bg-[#041E42] px-3 py-3 text-left text-sm font-bold text-white">Horario</div>
                {occupancyHours.map((hour) => <div key={hour} className="rounded-xl border border-[#BFD2FF] bg-[#EEF4FF] px-3 py-3 text-center text-sm font-extrabold text-[#0B3D91] shadow-sm">{hour}</div>)}
                {occupancyHeatmap.flatMap((row) => [
                  <div key={`${row.day}-label`} className="flex items-center pr-3 text-sm font-bold text-[#041E42]">{row.day}</div>,
                  ...row.values.map((value, index) => (
                    <button key={`${row.day}-${occupancyHours[index]}`} type="button" onClick={() => openDetail({ type: "ocupacion", id: `${row.day}-${occupancyHours[index]}`, label: `Ocupación · ${row.day} ${occupancyHours[index]}` })} className={`group relative min-h-12 rounded-xl px-2 py-1.5 text-center transition hover:-translate-y-0.5 hover:ring-2 hover:ring-[#3150D8] hover:ring-offset-2 ${heatTone(value)}`} aria-label={`${row.day} de ${occupancyHours[index]}: ${value}% de ocupación`}>
                      <span className="block text-base font-bold tabular-nums">{value}%</span>
                      <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-wider opacity-75">{value >= 90 ? "Crítica" : value >= 80 ? "Alta" : value >= 65 ? "Media alta" : value >= 45 ? "Media" : "Baja"}</span>
                    </button>
                  )),
                ])}
              </div>
            </div>
          </div>
          <div className="grid gap-4 border-t border-slate-100 bg-slate-50 px-5 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="flex flex-wrap gap-3 text-xs text-slate-600">
              {[["bg-slate-100", "Baja <45%"], ["bg-cyan-100", "Media 45–64%"], ["bg-[#2EA8FF]", "Media alta 65–79%"], ["bg-[#3150D8]", "Alta 80–89%"], ["bg-[#041E42]", "Crítica ≥90%"]].map(([color, label]) => <span key={label} className="inline-flex items-center gap-2"><i className={`h-3 w-3 rounded-sm ${color}`} />{label}</span>)}
            </div>
            <div className="flex flex-wrap gap-4 text-xs"><span className="text-slate-500">Mayor ocupación: <b className="text-[#041E42]">97%</b></span><span className="text-slate-500">Día más exigente: <b className="text-[#041E42]">Viernes</b></span><span className="text-slate-500">Franja crítica: <b className="text-[#041E42]">15:00–18:00</b></span></div>
          </div>
        </section>

        <div className="grid min-w-0 gap-5 xl:grid-cols-2">
          <ExcelTable title="Actividad" description="Resumen del día y del mes" icon={CarFront} columns={["", "Indicador", "Día actual", "Mes actual", "Estado", "Detalle"]}>
            {activity.map(({ id, label, day, month, status, icon: Icon, tone }) => (
              <tr key={id} onClick={() => setSelection({ type: "actividad", id, label })} className={`cursor-pointer border-b border-slate-100 last:border-b-0 hover:bg-[#EEF4FF] ${selection.id === id ? "bg-[#EEF4FF]" : "even:bg-slate-50/60"}`}>
                <td className="px-2 py-2.5"><span className={`inline-flex rounded-lg p-1.5 ${toneClasses[tone]}`}><Icon className="h-3.5 w-3.5" /></span></td>
                <td className="break-words px-2 py-2.5 font-semibold leading-tight text-[#041E42]">{label}</td><td className="px-2 py-2.5 tabular-nums">{day}</td><td className="px-2 py-2.5 tabular-nums">{month}</td>
                <td className="px-2 py-2.5"><span className={`inline-flex max-w-full rounded-full px-2 py-1 text-[9px] font-semibold leading-tight ${toneClasses[tone]}`}>{status}</span></td>
                <td className="px-2 py-2.5"><ArrowUpRight className="h-3.5 w-3.5 text-[#3150D8]" /></td>
              </tr>
            ))}
          </ExcelTable>

          <ExcelTable title="Medios de pago" description="Distribución de la recaudación" icon={CreditCard} columns={["", "Medio", "Día actual", "Mes actual", "Participación", "Detalle"]}>
            {payments.map(({ id, label, day, month, share, icon: Icon }) => (
              <tr key={id} onClick={() => setSelection({ type: "pago", id, label })} className={`cursor-pointer border-b border-slate-100 last:border-b-0 hover:bg-[#EEF4FF] ${selection.id === id ? "bg-[#EEF4FF]" : "even:bg-slate-50/60"}`}>
                <td className="px-2 py-2.5"><span className="inline-flex rounded-lg bg-emerald-50 p-1.5 text-emerald-700"><Icon className="h-3.5 w-3.5" /></span></td>
                <td className="break-words px-2 py-2.5 font-semibold leading-tight text-[#041E42]">{label}</td><td className="px-2 py-2.5 tabular-nums">{money(day)}</td><td className="px-2 py-2.5 tabular-nums">{money(month)}</td>
                <td className="px-2 py-2.5"><div className="flex min-w-0 items-center gap-1"><span className="h-1.5 min-w-5 flex-1 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-[#3150D8]" style={{ width: `${share}%` }} /></span><span>{share}%</span></div></td>
                <td className="px-2 py-2.5"><ArrowUpRight className="h-3.5 w-3.5 text-[#3150D8]" /></td>
              </tr>
            ))}
            <tr className="bg-[#041E42] font-semibold text-white"><td className="px-2 py-2.5" /><td className="px-2 py-2.5">Total cobrado</td><td className="px-2 py-2.5">{money(0)}</td><td className="px-2 py-2.5">{money(totalMonth)}</td><td className="px-2 py-2.5">100%</td><td className="px-2 py-2.5" /></tr>
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
              <p className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{money(totalMonth)}</p>
              <span className="mt-2 inline-flex rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-cyan-100">Datos demostrativos</span>
              </div>
              <button type="button" onClick={() => setDetailOpen(false)} className="rounded-full p-2 text-slate-300 transition hover:bg-white/10 hover:text-white" aria-label="Cerrar detalle"><X className="h-5 w-5" /></button>
            </div>
          </div>

          <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr_1fr_auto]">
            <label className="space-y-1 text-xs font-semibold text-slate-600"><span>Estacionamiento</span><select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-[#041E42] outline-none focus:border-[#3150D8]"><option>Parking Centro</option><option>Parking Norte</option><option>Parking Sur</option></select></label>
            <label className="space-y-1 text-xs font-semibold text-slate-600"><span>Periodo</span><select value={period} onChange={(event) => setPeriod(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-[#041E42] outline-none focus:border-[#3150D8]">{periods.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="space-y-1 text-xs font-semibold text-slate-600"><span>Fecha desde</span><input type="date" defaultValue="2026-07-01" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-[#041E42] outline-none focus:border-[#3150D8]" /></label>
            <label className="space-y-1 text-xs font-semibold text-slate-600"><span>Fecha hasta</span><input type="date" defaultValue="2026-07-28" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-[#041E42] outline-none focus:border-[#3150D8]" /></label>
            <button type="button" className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#3150D8] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1E5EFF]"><Search className="h-4 w-4" />Buscar</button>
          </div>

          <div className="flex flex-col gap-3 px-4 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-slate-500"><span className="font-semibold text-[#041E42]">{filteredTransactions.length}</span> transacciones encontradas</p>
              <p className="mt-1 text-xs font-medium text-[#3150D8]">Ordenado por {transactionColumns.find((column) => column.key === sort.key)?.label}: {sort.direction === "asc" ? "menor a mayor" : "mayor a menor"}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700"><FileSpreadsheet className="h-4 w-4" />Exportar Excel</button>
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-500"><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar en resultados" className="w-40 outline-none" /></label>
            </div>
          </div>

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
              <tbody>{filteredTransactions.map((item) => (
                <tr key={item.id} onClick={() => setSelectedTransaction(item)} className="cursor-pointer border-b border-slate-100 last:border-b-0 even:bg-slate-50 hover:bg-[#EEF4FF]">
                  {orderedColumns.map((column) => <td key={column.key} className={`border-r border-slate-100 px-2 py-2.5 align-middle last:border-r-0 ${column.key === "plate" ? "font-semibold text-[#3150D8]" : ""} ${["entryDate", "entryTime", "exitDate", "exitTime", "minutes"].includes(column.key) ? "whitespace-nowrap text-center tabular-nums" : ""}`}>{renderTransactionCell(item, column.key)}</td>)}
                </tr>
              ))}</tbody>
            </table>
          </div>
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
                ["Fecha de entrada", selectedTransaction.entryDate],
                ["Hora de entrada", selectedTransaction.entryTime],
                ["Fecha de salida", selectedTransaction.exitDate],
                ["Hora de salida", selectedTransaction.exitTime],
                ["Minutos consumidos", `${selectedTransaction.minutes} minutos`],
                ["Monto cobrado", money(selectedTransaction.amount)],
                ["Medio de pago", selectedTransaction.payment],
                ["Usuario", selectedTransaction.user],
                ["Plan", selectedTransaction.plan],
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

            <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="space-y-1 text-xs font-semibold text-slate-600"><span>Día a analizar</span><input type="date" value={flowDate} onChange={(event) => setFlowDate(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-[#041E42] outline-none focus:border-[#3150D8]" /></label>
              <label className="space-y-1 text-xs font-semibold text-slate-600"><span>Hora destacada</span><input type="time" step="3600" value={flowHour} onChange={(event) => setFlowHour(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-[#041E42] outline-none focus:border-[#3150D8]" /></label>
              <button type="button" className="rounded-xl bg-[#3150D8] px-4 py-2.5 text-sm font-semibold text-white">Modificar análisis</button>
            </div>

            <div className="p-4 sm:p-6">
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <svg viewBox="0 0 900 390" className="min-w-[760px]" role="img" aria-label="Gráfico de líneas de ingresos y salidas por hora">
                  {[60, 120, 180, 240, 300].map((y) => <line key={y} x1="65" y1={y} x2="865" y2={y} stroke="#E2E8F0" strokeWidth="1" />)}
                  <line x1="65" y1="320" x2="865" y2="320" stroke="#94A3B8" />
                  <line x1="65" y1="40" x2="65" y2="320" stroke="#94A3B8" />
                  {[60, 50, 40, 30, 20, 10, 0].map((value, index) => <text key={value} x="52" y={45 + index * 46} textAnchor="end" fontSize="11" fill="#64748B">{60 - index * 10}</text>)}
                  {hourlyFlow.map((item, index) => <text key={item.hour} x={75 + index * 96} y="345" textAnchor="middle" fontSize="11" fill="#64748B">{item.hour}</text>)}
                  {hourlyFlow.map((item, index) => item.hour === flowHour ? <line key={`selected-${item.hour}`} x1={75 + index * 96} y1="40" x2={75 + index * 96} y2="320" stroke="#F59E0B" strokeWidth="2" strokeDasharray="5 5" /> : null)}
                  <polyline fill="none" stroke="#3150D8" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" points={hourlyFlow.map((item, index) => `${75 + index * 96},${320 - item.entries * 4.5}`).join(" ")} />
                  <polyline fill="none" stroke="#2EA8FF" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" points={hourlyFlow.map((item, index) => `${75 + index * 96},${320 - item.exits * 4.5}`).join(" ")} />
                  {hourlyFlow.map((item, index) => <g key={`points-${item.hour}`}><circle cx={75 + index * 96} cy={320 - item.entries * 4.5} r="5" fill="#3150D8" /><circle cx={75 + index * 96} cy={320 - item.exits * 4.5} r="5" fill="#2EA8FF" /></g>)}
                </svg>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-[#EEF4FF] p-4"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#3150D8]">Ingresos a las {flowHour}</p><p className="mt-2 text-2xl font-bold text-[#041E42]">{hourlyFlow.find((item) => item.hour === flowHour)?.entries ?? "—"}</p></div>
                <div className="rounded-2xl bg-cyan-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#0369A1]">Salidas a las {flowHour}</p><p className="mt-2 text-2xl font-bold text-[#041E42]">{hourlyFlow.find((item) => item.hour === flowHour)?.exits ?? "—"}</p></div>
                <div className="rounded-2xl bg-amber-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-amber-700">Lectura del flujo</p><p className="mt-2 text-sm font-semibold text-[#041E42]">Las líneas se cruzan cuando la demanda cambia de ingresos predominantes a salidas predominantes.</p></div>
              </div>
              <div className="mt-4 flex justify-center gap-5 text-xs text-slate-600"><span className="flex items-center gap-2"><i className="h-2.5 w-6 rounded-full bg-[#3150D8]" />Ingresos</span><span className="flex items-center gap-2"><i className="h-2.5 w-6 rounded-full bg-[#2EA8FF]" />Salidas</span><span className="flex items-center gap-2"><i className="h-0.5 w-6 bg-amber-500" />Hora seleccionada</span></div>
            </div>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
