"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, BadgeDollarSign, Building2, CalendarDays, CheckCircle2, Clock3, Info, Save, TrendingUp } from "lucide-react";
import AppShell from "@/components/layout/AppShell";

const current = {
  parking: "Parking Centro",
  days: "Lunes a viernes",
  schedule: "17:00 a 20:00",
  tariff: 1500,
  revenue: 2478180,
  ticket: 1786,
  transactions: 1388,
  occupancy: 88,
};

const dailyBase = [82000, 94000, 101000, 118000, 126000, 109000, 97000];
const dayLabels = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function money(value) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Math.round(value));
}

function Metric({ label, currentValue, projectedValue, difference, favorable = true }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <div className="text-right"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Actual</p><p className="mt-0.5 font-semibold text-[#041E42]">{currentValue}</p></div>
      <div className="min-w-28 text-right"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#3150D8]">Simulación</p><p className="mt-0.5 font-semibold text-[#3150D8]">{projectedValue}</p><p className={`text-xs font-semibold ${favorable ? "text-emerald-700" : "text-amber-700"}`}>{difference}</p></div>
    </div>
  );
}

export default function SimuladorTarifasPage() {
  const [newTariff, setNewTariff] = useState(1700);
  const [saved, setSaved] = useState(false);

  const simulation = useMemo(() => {
    const priceChange = newTariff / current.tariff;
    const demandFactor = Math.max(0.72, 1 - Math.max(0, priceChange - 1) * 0.22);
    const transactions = Math.round(current.transactions * demandFactor);
    const occupancy = Math.round(current.occupancy * demandFactor);
    const revenue = Math.round(current.revenue * priceChange * demandFactor);
    const ticket = Math.round(revenue / transactions);
    return { transactions, occupancy, revenue, ticket, difference: revenue - current.revenue, change: ((revenue / current.revenue) - 1) * 100 };
  }, [newTariff]);

  const projectedDaily = dailyBase.map((value) => Math.round(value * (simulation.revenue / current.revenue)));
  const chartMax = Math.max(...projectedDaily, ...dailyBase) * 1.12;
  const points = (values) => values.map((value, index) => `${65 + index * 108},${285 - (value / chartMax) * 225}`).join(" ");

  return (
    <AppShell title="Simulador de tarifas" description="Análisis consultivo de escenarios tarifarios">
      <div className="space-y-5">
        <header className="flex flex-col gap-4 rounded-3xl border border-[#5271E8] bg-[#3150D8] p-5 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Asistente consultivo</p><h1 className="mt-2 text-2xl font-semibold">Simulación de nueva tarifa</h1><p className="mt-1 text-sm text-slate-300">Compara los ingresos actuales con un escenario estimado sin modificar la tarifa vigente.</p></div>
          <Link href="/modelo-dashboard" className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold transition hover:bg-white/20"><ArrowLeft className="h-4 w-4" />Volver al modelo</Link>
        </header>

        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-[#041E42]">Condiciones vigentes</h2><p className="mt-1 text-sm text-slate-500">Información recuperada automáticamente.</p></div>
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              {[
                { label: "Estacionamiento", value: current.parking, icon: Building2 },
                { label: "Días de aplicación", value: current.days, icon: CalendarDays },
                { label: "Horario", value: current.schedule, icon: Clock3 },
                { label: "Tarifa actual", value: `${money(current.tariff)} / hora`, icon: BadgeDollarSign },
              ].map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-2 text-slate-500"><Icon className="h-4 w-4 text-[#3150D8]" /><p className="text-xs font-semibold uppercase tracking-[0.1em]">{label}</p></div><p className="mt-2 font-semibold text-[#041E42]">{value}</p><p className="mt-1 text-[11px] text-slate-400">Solo lectura</p></div>)}
            </div>
            <div className="border-t border-slate-200 bg-[#EEF4FF] p-5">
              <label className="block text-sm font-semibold text-[#041E42]">Nueva tarifa a simular</label>
              <div className="mt-2 flex items-center overflow-hidden rounded-2xl border-2 border-[#3150D8] bg-white focus-within:ring-4 focus-within:ring-[#3150D8]/10"><span className="px-4 text-2xl font-semibold text-[#3150D8]">$</span><input type="number" min="500" step="50" value={newTariff} onChange={(event) => { setSaved(false); setNewTariff(Math.max(0, Number(event.target.value))); }} className="min-w-0 flex-1 py-4 pr-4 text-3xl font-bold text-[#041E42] outline-none" /><span className="pr-4 text-sm font-semibold text-slate-500">por hora</span></div>
              <input type="range" min="1000" max="2500" step="50" value={newTariff} onChange={(event) => { setSaved(false); setNewTariff(Number(event.target.value)); }} className="mt-4 w-full accent-[#3150D8]" />
              <div className="mt-1 flex justify-between text-xs text-slate-500"><span>$1.000</span><span>$2.500</span></div>
            </div>
          </section>

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold text-[#041E42]">Resultado estimado</h2><p className="mt-1 text-sm text-slate-500">Comparación mensual del escenario.</p></div><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">Confianza alta</span></div>
            <div className="grid gap-3 bg-slate-50 p-5 sm:grid-cols-3">
              <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Ingreso actual</p><p className="mt-2 text-xl font-bold text-[#041E42]">{money(current.revenue)}</p></div>
              <div className="rounded-2xl border border-[#BFD2FF] bg-[#EEF4FF] p-4"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#3150D8]">Ingreso estimado</p><p className="mt-2 text-xl font-bold text-[#3150D8]">{money(simulation.revenue)}</p></div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-emerald-700">Diferencia potencial</p><p className="mt-2 text-xl font-bold text-emerald-700">+{money(simulation.difference)}</p><p className="mt-1 text-xs font-semibold text-emerald-700">+{simulation.change.toFixed(1)}%</p></div>
            </div>
            <div>
              <Metric label="Tarifa por hora" currentValue={money(current.tariff)} projectedValue={money(newTariff)} difference={`${newTariff >= current.tariff ? "+" : ""}${(((newTariff / current.tariff) - 1) * 100).toFixed(1)}%`} />
              <Metric label="Ticket promedio" currentValue={money(current.ticket)} projectedValue={money(simulation.ticket)} difference={`${simulation.ticket >= current.ticket ? "+" : ""}${money(simulation.ticket - current.ticket)}`} />
              <Metric label="Transacciones" currentValue={current.transactions.toLocaleString("es-CL")} projectedValue={simulation.transactions.toLocaleString("es-CL")} difference={`${simulation.transactions - current.transactions}`} favorable={simulation.transactions >= current.transactions} />
              <Metric label="Ocupación promedio" currentValue={`${current.occupancy}%`} projectedValue={`${simulation.occupancy}%`} difference={`${simulation.occupancy - current.occupancy} puntos`} favorable={simulation.occupancy >= current.occupancy} />
            </div>
          </section>
        </div>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4"><span className="rounded-xl bg-[#EEF4FF] p-2 text-[#3150D8]"><TrendingUp className="h-5 w-5" /></span><div><h2 className="font-semibold text-[#041E42]">Ingresos actuales vs estimados</h2><p className="text-sm text-slate-500">Proyección semanal con la nueva tarifa.</p></div></div>
          <div className="overflow-x-auto p-4">
            <svg viewBox="0 0 760 340" className="min-w-[700px] w-full" role="img" aria-label="Comparación de ingresos actuales y estimados">
              {[60, 110, 160, 210, 260].map((y) => <line key={y} x1="60" y1={y} x2="730" y2={y} stroke="#E2E8F0" />)}
              <line x1="60" y1="285" x2="730" y2="285" stroke="#94A3B8" />
              <polyline points={points(dailyBase)} fill="none" stroke="#94A3B8" strokeWidth="4" strokeDasharray="7 7" strokeLinejoin="round" />
              <polyline points={points(projectedDaily)} fill="none" stroke="#3150D8" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
              {projectedDaily.map((value, index) => <g key={dayLabels[index]}><circle cx={65 + index * 108} cy={285 - (value / chartMax) * 225} r="5" fill="#3150D8" /><text x={65 + index * 108} y="312" textAnchor="middle" fontSize="12" fill="#64748B">{dayLabels[index]}</text></g>)}
            </svg>
          </div>
          <div className="flex justify-center gap-5 border-t border-slate-100 px-5 py-3 text-xs text-slate-600"><span className="flex items-center gap-2"><i className="h-0.5 w-6 border-t-2 border-dashed border-slate-400" />Ingreso actual</span><span className="flex items-center gap-2"><i className="h-1 w-6 rounded-full bg-[#3150D8]" />Ingreso estimado</span></div>
        </section>

        <aside className="flex flex-col gap-4 rounded-3xl border border-amber-200 bg-amber-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3"><Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><p className="font-semibold text-amber-900">Simulación consultiva</p><p className="mt-1 max-w-3xl text-sm text-amber-800">La estimación se basa en el comportamiento histórico y no garantiza ingresos futuros. Guardar esta propuesta no modifica la tarifa vigente.</p></div></div>
          <button type="button" onClick={() => setSaved(true)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#3150D8] px-5 py-2.5 text-sm font-semibold text-white">{saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}{saved ? "Propuesta creada" : "Crear propuesta"}</button>
        </aside>
      </div>
    </AppShell>
  );
}
