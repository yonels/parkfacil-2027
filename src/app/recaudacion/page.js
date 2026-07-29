"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Banknote,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  CreditCard,
  Download,
  Eye,
  FileSpreadsheet,
  Landmark,
  Search,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";

const transactions = [
  { id: "TRX-1008", date: "28/07/2026", time: "18:42", ticket: "TK-2208", plate: "PRVH63", parking: "Parking Centro", operator: "Carolina Muñoz", method: "Crédito", amount: 1680, status: "Conciliado" },
  { id: "TRX-1007", date: "28/07/2026", time: "18:16", ticket: "TK-2207", plate: "BHPR54", parking: "Parking Centro", operator: "Carolina Muñoz", method: "Crédito", amount: 1440, status: "Conciliado" },
  { id: "TRX-1006", date: "28/07/2026", time: "17:54", ticket: "TK-2206", plate: "DHGL81", parking: "Parking Norte", operator: "Felipe Soto", method: "Efectivo", amount: 1590, status: "Por conciliar" },
  { id: "TRX-1005", date: "28/07/2026", time: "16:31", ticket: "TK-2205", plate: "JRDR29", parking: "Parking Centro", operator: "Carolina Muñoz", method: "Crédito", amount: 2550, status: "Conciliado" },
  { id: "TRX-1004", date: "28/07/2026", time: "15:27", ticket: "TK-2204", plate: "LXPB20", parking: "Parking Sur", operator: "Andrea Pérez", method: "Efectivo", amount: 480, status: "Observado" },
  { id: "TRX-1003", date: "28/07/2026", time: "13:08", ticket: "TK-2203", plate: "LPKB69", parking: "Parking Norte", operator: "Felipe Soto", method: "Crédito", amount: 1560, status: "Conciliado" },
  { id: "TRX-1002", date: "28/07/2026", time: "11:45", ticket: "TK-2202", plate: "SXLZ28", parking: "Parking Centro", operator: "Carolina Muñoz", method: "Efectivo", amount: 2910, status: "Por conciliar" },
  { id: "TRX-1001", date: "28/07/2026", time: "09:12", ticket: "TK-2201", plate: "HJCD22", parking: "Parking Centro", operator: "Carolina Muñoz", method: "Crédito", amount: 1740, status: "Conciliado" },
];

const closures = [
  { id: "CIE-041", parking: "Parking Centro", shift: "Turno mañana", operator: "Carolina Muñoz", expected: 842300, declared: 842300, difference: 0, status: "Cerrado" },
  { id: "CIE-042", parking: "Parking Norte", shift: "Turno mañana", operator: "Felipe Soto", expected: 426700, declared: 425200, difference: -1500, status: "Observado" },
  { id: "CIE-043", parking: "Parking Sur", shift: "Turno tarde", operator: "Andrea Pérez", expected: 318400, declared: 0, difference: 0, status: "Pendiente" },
];

const dailyRevenue = [
  { day: "22 Jul", value: 1985000 }, { day: "23 Jul", value: 2118000 }, { day: "24 Jul", value: 2246000 },
  { day: "25 Jul", value: 2054000 }, { day: "26 Jul", value: 2197000 }, { day: "27 Jul", value: 2318000 }, { day: "28 Jul", value: 2478180 },
];

const columns = [
  ["date", "Fecha"], ["time", "Hora"], ["id", "Transacción"], ["ticket", "Ticket"], ["plate", "Patente"],
  ["parking", "Estacionamiento"], ["operator", "Operador"], ["method", "Medio de pago"], ["amount", "Monto"], ["status", "Estado"],
];

function money(value) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
}

function statusClass(status) {
  if (["Conciliado", "Cerrado"].includes(status)) return "bg-emerald-50 text-emerald-700";
  if (["Observado"].includes(status)) return "bg-rose-50 text-rose-700";
  return "bg-amber-50 text-amber-700";
}

export default function RecaudacionPage() {
  const [from, setFrom] = useState("2026-07-01");
  const [to, setTo] = useState("2026-07-28");
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState("Todos");
  const [status, setStatus] = useState("Todos");
  const [sort, setSort] = useState({ key: "date", direction: "desc" });
  const [selected, setSelected] = useState(null);
  const [activeMetric, setActiveMetric] = useState("total");

  const filtered = useMemo(() => transactions.filter((item) => {
    const searchable = Object.values(item).join(" ").toLowerCase();
    const matchesQuery = searchable.includes(query.toLowerCase());
    const matchesMethod = method === "Todos" || item.method === method;
    const matchesStatus = status === "Todos" || item.status === status;
    const matchesMetric =
      activeMetric === "total" ||
      (activeMetric === "cash" && item.method === "Efectivo") ||
      (activeMetric === "cards" && ["Crédito", "Débito"].includes(item.method)) ||
      (activeMetric === "pending" && item.status !== "Conciliado");
    return matchesQuery && matchesMethod && matchesStatus && matchesMetric;
  }).sort((left, right) => {
    const a = left[sort.key];
    const b = right[sort.key];
    const comparison = typeof a === "number" ? a - b : String(a).localeCompare(String(b), "es", { numeric: true });
    return sort.direction === "asc" ? comparison : -comparison;
  }), [activeMetric, method, query, sort, status]);

  const sampleTotal = 2478180;
  const cash = 545670;
  const cards = 1932510;
  const pending = transactions.filter((item) => item.status !== "Conciliado").reduce((sum, item) => sum + item.amount, 0);
  const maxRevenue = Math.max(...dailyRevenue.map((item) => item.value));

  const orderBy = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  const exportCsv = () => {
    const headers = columns.map(([, label]) => label);
    const rows = filtered.map((item) => columns.map(([key]) => item[key]));
    const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `recaudacion-${from}-${to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell title="Recaudación" description="Control financiero, cierres y conciliación">
      <div className="space-y-5">
        <header className="flex flex-col gap-4 rounded-3xl bg-[#041E42] p-6 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-semibold text-cyan-200">Control financiero</p><h1 className="mt-2 text-3xl font-semibold">Recaudación y conciliación</h1><p className="mt-2 text-sm text-slate-300">Supervisa ingresos, medios de pago, cierres y diferencias de caja.</p></div>
          <Link href="/" className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20"><ArrowLeft className="h-4 w-4" />Volver</Link>
        </header>

        <section className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Fecha desde</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]" /></label>
          <label className="text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Fecha hasta</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]" /></label>
          <button type="button" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#3150D8] px-4 py-2.5 text-sm font-semibold text-white"><CalendarDays className="h-4 w-4" />Aplicar periodo</button>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { id: "total", label: "Total recaudado", value: money(sampleTotal), description: "Periodo seleccionado", icon: Landmark, color: "text-[#3150D8]" },
            { id: "cash", label: "Efectivo", value: money(cash), description: "22% de la recaudación", icon: Banknote, color: "text-emerald-700" },
            { id: "cards", label: "Tarjetas", value: money(cards), description: "78% de la recaudación", icon: CreditCard, color: "text-sky-700" },
            { id: "pending", label: "Por revisar", value: money(pending), description: "3 movimientos", icon: CircleAlert, color: "text-amber-700" },
          ].map(({ id, label, value, description, icon: Icon, color }) => (
            <button key={id} type="button" onClick={() => setActiveMetric(id)} className={`flex items-center gap-4 rounded-3xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#3150D8] hover:shadow-md ${activeMetric === id ? "border-[#3150D8] ring-2 ring-[#3150D8]/15" : "border-slate-200"}`}>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-50"><Icon className={`h-5 w-5 ${color}`} /></span><span><span className="block text-xs font-semibold text-slate-500">{label}</span><span className="mt-1 block text-xl font-bold text-[#041E42]">{value}</span><span className="mt-1 block text-xs text-slate-500">{description}</span></span>
            </button>
          ))}
        </section>

        <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4"><TrendingUp className="h-5 w-5 text-[#3150D8]" /><div><h2 className="font-bold text-[#041E42]">Evolución de la recaudación</h2><p className="text-xs text-slate-500">Últimos siete días</p></div></div>
            <div className="flex h-60 items-end gap-3 p-5">
              {dailyRevenue.map((item) => <button key={item.day} type="button" onClick={() => { setFrom(`2026-07-${item.day.slice(0, 2)}`); setTo(`2026-07-${item.day.slice(0, 2)}`); }} className="group flex h-full flex-1 flex-col justify-end gap-2"><span className="text-center text-[10px] font-bold text-slate-500 opacity-0 transition group-hover:opacity-100">{money(item.value)}</span><span className="block w-full rounded-t-lg bg-[#3150D8] transition group-hover:bg-[#2EA8FF]" style={{ height: `${(item.value / maxRevenue) * 82}%` }} /><span className="text-center text-[10px] font-semibold text-slate-500">{item.day}</span></button>)}
            </div>
          </section>

          <section id="medios-de-pago" className="scroll-mt-24 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4"><WalletCards className="h-5 w-5 text-emerald-700" /><div><h2 className="font-bold text-[#041E42]">Medios de pago</h2><p className="text-xs text-slate-500">Distribución del periodo</p></div></div>
            <div className="grid place-items-center p-5">
              <button type="button" onClick={() => setMethod("Crédito")} className="grid h-40 w-40 place-items-center rounded-full" style={{ background: "conic-gradient(#3150D8 0 78%, #10B981 78% 100%)" }}><span className="grid h-24 w-24 place-items-center rounded-full bg-white text-center"><span><b className="block text-lg text-[#041E42]">{money(sampleTotal)}</b><span className="text-[10px] text-slate-500">Total</span></span></span></button>
              <div className="mt-5 flex gap-4 text-xs"><button type="button" onClick={() => setMethod("Crédito")} className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-[#3150D8]" />Tarjetas 78%</button><button type="button" onClick={() => setMethod("Efectivo")} className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-emerald-500" />Efectivo 22%</button></div>
            </div>
          </section>
        </div>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><h2 className="font-bold text-[#041E42]">Cierres de turno</h2><p className="text-xs text-slate-500">Monto esperado, declarado y diferencias</p></div><CheckCircle2 className="h-5 w-5 text-emerald-700" /></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-[#041E42] text-white"><tr><th className="px-4 py-3">Cierre</th><th className="px-4 py-3">Estacionamiento</th><th className="px-4 py-3">Turno</th><th className="px-4 py-3">Operador</th><th className="px-4 py-3 text-right">Esperado</th><th className="px-4 py-3 text-right">Declarado</th><th className="px-4 py-3 text-right">Diferencia</th><th className="px-4 py-3">Estado</th></tr></thead><tbody>{closures.map((closure) => <tr key={closure.id} onClick={() => setSelected(closure)} className="cursor-pointer border-b border-slate-100 last:border-b-0 even:bg-slate-50 hover:bg-[#EEF4FF]"><td className="px-4 py-3 font-bold text-[#3150D8]">{closure.id}</td><td className="px-4 py-3">{closure.parking}</td><td className="px-4 py-3">{closure.shift}</td><td className="px-4 py-3">{closure.operator}</td><td className="px-4 py-3 text-right">{money(closure.expected)}</td><td className="px-4 py-3 text-right">{closure.declared ? money(closure.declared) : "—"}</td><td className={`px-4 py-3 text-right font-bold ${closure.difference < 0 ? "text-rose-700" : "text-emerald-700"}`}>{money(closure.difference)}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(closure.status)}`}>{closure.status}</span></td></tr>)}</tbody></table></div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 xl:flex-row xl:items-center xl:justify-between"><div className="flex items-center gap-3"><FileSpreadsheet className="h-5 w-5 text-[#3150D8]" /><div><h2 className="font-bold text-[#041E42]">Transacciones</h2><p className="text-xs text-slate-500">{filtered.length} resultados · tabla financiera exportable</p></div></div><div className="flex flex-wrap gap-2"><label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3"><Search className="h-4 w-4 text-[#3150D8]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar" className="w-36 py-2.5 text-sm outline-none" /></label><select value={method} onChange={(event) => setMethod(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option>Todos</option><option>Efectivo</option><option>Crédito</option><option>Débito</option></select><select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option>Todos</option><option>Conciliado</option><option>Por conciliar</option><option>Observado</option></select><button type="button" onClick={exportCsv} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"><Download className="h-4 w-4" />Exportar</button></div></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-left text-sm"><thead className="bg-[#041E42] text-white"><tr>{columns.map(([key, label]) => <th key={key} className="p-0"><button type="button" onClick={() => orderBy(key)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left font-semibold hover:bg-white/10">{label}{sort.key === key ? (sort.direction === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />) : null}</button></th>)}<th className="px-4 py-3">Detalle</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id} className="border-b border-slate-100 last:border-b-0 even:bg-slate-50 hover:bg-[#EEF4FF]" onClick={() => setSelected(item)}>{columns.map(([key]) => <td key={key} className={`cursor-pointer px-4 py-3 ${key === "amount" ? "text-right font-bold" : ""}`}>{key === "amount" ? money(item[key]) : key === "status" ? <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(item.status)}`}>{item.status}</span> : item[key]}</td>)}<td className="px-4 py-3"><button type="button" className="inline-flex items-center gap-1 text-xs font-bold text-[#3150D8]"><Eye className="h-4 w-4" />Ver</button></td></tr>)}</tbody></table></div>
        </section>
      </div>

      {selected ? <div className="fixed inset-0 z-50 grid place-items-center bg-[#041E42]/65 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl"><header className="flex items-center justify-between bg-[#041E42] px-5 py-4 text-white"><div><p className="text-xs font-semibold text-cyan-200">Detalle financiero</p><h2 className="mt-1 text-xl font-bold">{selected.id}</h2></div><button type="button" onClick={() => setSelected(null)} className="rounded-full p-2 hover:bg-white/10"><X className="h-5 w-5" /></button></header><div className="grid gap-3 p-5 sm:grid-cols-2">{Object.entries(selected).filter(([key]) => key !== "id").map(([key, value]) => <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-semibold text-slate-400">{key.replaceAll(/([A-Z])/g, " $1")}</p><p className="mt-1 text-sm font-bold text-[#041E42]">{typeof value === "number" ? money(value) : value}</p></div>)}</div></section></div> : null}
    </AppShell>
  );
}
