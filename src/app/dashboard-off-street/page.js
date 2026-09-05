"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  CarFront,
  CheckCircle2,
  CircleAlert,
  Clock3,
  CreditCard,
  Gauge,
  Landmark,
  LogOut,
  ParkingSquare,
  ReceiptText,
  TrendingUp,
  Wallet,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";

function money(value) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value || 0);
}
function number(value) {
  return new Intl.NumberFormat("es-CL").format(value || 0);
}

const PERIODS = [
  { id: "today", label: "Hoy" },
  { id: "7d", label: "7 días" },
  { id: "month", label: "Mes actual" },
];

const EMPTY_DATA = {
  operations: { ingresosDia: 0, salidasDia: 0, vehiculosDentro: 0, ticketsAbiertos: 0 },
  revenue: { summary: { totalAmount: 0, cashAmount: 0, cardAmount: 0, count: 0, averageTicket: 0 }, dailySeries: [], cashDifference: { totalDifference: 0, closuresWithDifference: 0 } },
  shifts: { openShiftsCount: 0, closuresInPeriod: 0 },
  dailyMovements: [],
  occupancy: { capacity: 0, insideCount: 0, available: null, occupancyPercentage: null, capacityKnown: false },
  dateFrom: "",
  dateTo: "",
  parkings: [],
  companies: [],
};

export default function DashboardOffStreetPage() {
  const [company, setCompany] = useState("");
  const [parking, setParking] = useState("");
  const [period, setPeriod] = useState("today");

  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (company) params.set("companyId", company);
        if (parking) params.set("parkingId", parking);
        params.set("period", period);

        const response = await fetch(`/api/dashboard-off-street?${params.toString()}`);
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok) {
          setError(payload?.error || "No fue posible consultar el dashboard.");
          setData(EMPTY_DATA);
          return;
        }
        setData({ ...EMPTY_DATA, ...payload?.data });
      } catch {
        if (!cancelled) { setError("No fue posible conectar con el servidor. Intenta nuevamente."); setData(EMPTY_DATA); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [company, parking, period]);

  const parkingOptions = useMemo(
    () => (company ? data.parkings.filter((item) => item.companyId === company) : data.parkings),
    [company, data.parkings],
  );

  const { operations, revenue, shifts, dailyMovements, occupancy } = data;
  const maxRevenue = Math.max(1, ...revenue.dailySeries.map((item) => item.amount));
  const maxMovements = Math.max(1, ...dailyMovements.map((item) => Math.max(item.entries, item.exits)));

  return (
    <AppShell title="Dashboard Off Street" description="Vista ejecutiva real de operación, recaudación y caja">
      <div className="space-y-5">
        <header className="flex flex-col gap-4 rounded-3xl border border-[#5271E8] bg-[#3150D8] p-6 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-cyan-200">Off Street</p>
            <h1 className="mt-2 text-3xl font-semibold">Dashboard</h1>
            <p className="mt-2 text-sm text-slate-300">Datos reales de parking_stays, shift_closures y estructura de niveles/zonas -- exclusivamente estacionamientos Off Street.</p>
          </div>
          <Link href="/" className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20"><ArrowLeft className="h-4 w-4" />Volver</Link>
        </header>

        <section className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-[1fr_1fr_auto_auto] xl:items-end">
          {data.companies.length > 1 && (
            <label className="text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Empresa</span><select value={company} onChange={(event) => { setCompany(event.target.value); setParking(""); }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]"><option value="">Todas</option>{data.companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          )}
          <label className="text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Estacionamiento</span><select value={parking} onChange={(event) => setParking(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]"><option value="">Todos</option>{parkingOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {PERIODS.map((item) => <button key={item.id} type="button" onClick={() => setPeriod(item.id)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${period === item.id ? "bg-white text-[#3150D8] shadow-sm" : "text-slate-500"}`}>{item.label}</button>)}
          </div>
          <span className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-500"><CalendarDays className="h-4 w-4" />{loading ? "Actualizando…" : `${data.dateFrom} — ${data.dateTo}`}</span>
        </section>

        {error ? <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

        {/* A. OCUPACIÓN -- no depende del período (siempre "ahora") */}
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Ocupación actual · no depende del período seleccionado</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTile icon={ParkingSquare} color="text-[#3150D8]" label="Capacidad" value={occupancy.capacityKnown ? number(occupancy.capacity) : "No informada"} description="Niveles y zonas activas" />
            <KpiTile icon={CarFront} color="text-amber-700" label="Vehículos dentro" value={number(occupancy.insideCount)} description="parking_stays abiertas" />
            <KpiTile icon={CheckCircle2} color="text-emerald-700" label="Disponibles" value={occupancy.capacityKnown ? number(occupancy.available) : "—"} description={occupancy.capacityKnown ? "Capacidad - dentro" : "Sin capacidad declarada"} />
            <KpiTile icon={Gauge} color="text-sky-700" label="% Ocupación" value={occupancy.capacityKnown ? `${occupancy.occupancyPercentage}%` : "—"} description={occupancy.capacityKnown ? "Dentro / capacidad" : "No disponible"} />
          </div>
        </section>

        {/* B. OPERACIÓN DE HOY -- siempre "hoy", independiente del período */}
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Operación de hoy · independiente del período seleccionado</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTile icon={CarFront} color="text-[#3150D8]" label="Ingresos del día" value={number(operations.ingresosDia)} description="Estadías con ingreso hoy" />
            <KpiTile icon={LogOut} color="text-emerald-700" label="Salidas del día" value={number(operations.salidasDia)} description="Estadías pagadas hoy" />
            <KpiTile icon={ParkingSquare} color="text-amber-700" label="Vehículos dentro" value={number(operations.vehiculosDentro)} description="Estado Abierto" />
            <KpiTile icon={ReceiptText} color="text-sky-700" label="Tickets abiertos" value={number(operations.ticketsAbiertos)} description="Mismo dato que vehículos dentro" />
          </div>
        </section>

        {/* C. RECAUDACIÓN -- responde al período seleccionado */}
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recaudación · período seleccionado ({data.dateFrom} — {data.dateTo})</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <KpiTile icon={Landmark} color="text-[#3150D8]" label="Total recaudado" value={money(revenue.summary.totalAmount)} description="Pagos confirmados" />
            <KpiTile icon={Banknote} color="text-emerald-700" label="Efectivo" value={money(revenue.summary.cashAmount)} description={`${revenue.summary.totalAmount ? Math.round((revenue.summary.cashAmount / revenue.summary.totalAmount) * 100) : 0}%`} />
            <KpiTile icon={CreditCard} color="text-sky-700" label="Tarjeta" value={money(revenue.summary.cardAmount)} description={`${revenue.summary.totalAmount ? Math.round((revenue.summary.cardAmount / revenue.summary.totalAmount) * 100) : 0}%`} />
            <KpiTile icon={ReceiptText} color="text-amber-700" label="Transacciones" value={number(revenue.summary.count)} description="Pagos confirmados" />
            <KpiTile icon={TrendingUp} color="text-[#041E42]" label="Ticket promedio" value={money(revenue.summary.averageTicket)} description="Total / transacciones" />
          </div>
        </section>

        {/* D. TURNOS Y CAJA -- turnos abiertos es "ahora"; cierres/diferencias responden al período */}
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Turnos y caja · turnos abiertos es “ahora”, cierres y diferencias son del período</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTile icon={Clock3} color="text-[#3150D8]" label="Turnos abiertos" value={number(shifts.openShiftsCount)} description="operator_shifts OPEN/CLOSING" />
            <KpiTile icon={Wallet} color="text-emerald-700" label="Cierres del período" value={number(shifts.closuresInPeriod)} description="shift_closures reales" />
            <KpiTile icon={CircleAlert} color={revenue.cashDifference.totalDifference < 0 ? "text-rose-700" : "text-emerald-700"} label="Diferencias de caja" value={money(revenue.cashDifference.totalDifference)} description="Acumulado del período" />
            <KpiTile icon={CircleAlert} color="text-amber-700" label="Cierres con diferencia" value={number(revenue.cashDifference.closuresWithDifference)} description="cash_difference ≠ 0" />
          </div>
        </section>

        {/* E. ACTIVIDAD / GRÁFICOS */}
        <div className="grid gap-5 xl:grid-cols-2">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4"><TrendingUp className="h-5 w-5 text-[#3150D8]" /><div><h2 className="font-bold text-[#041E42]">Recaudación diaria</h2><p className="text-xs text-slate-500">Misma fuente que el KPI de recaudación</p></div></div>
            {revenue.dailySeries.length ? (
              <div className="flex h-52 items-end gap-2 overflow-x-auto p-5">
                {revenue.dailySeries.map((item) => (
                  <div key={item.date} className="group flex h-full min-w-[24px] flex-1 flex-col justify-end gap-2">
                    <span className="text-center text-[9px] font-bold text-slate-500 opacity-0 transition group-hover:opacity-100">{money(item.amount)}</span>
                    <span className="block w-full rounded-t-lg bg-[#3150D8] transition group-hover:bg-[#2EA8FF]" style={{ height: `${(item.amount / maxRevenue) * 82}%` }} />
                    <span className="text-center text-[9px] font-semibold text-slate-500">{item.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="p-5 text-sm text-slate-500">{loading ? "Cargando…" : "Sin datos para el periodo seleccionado."}</p>}
          </section>

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4"><CarFront className="h-5 w-5 text-[#3150D8]" /><div><h2 className="font-bold text-[#041E42]">Ingresos y salidas por día</h2><p className="text-xs text-slate-500">Misma fuente que operación (parking_stays)</p></div></div>
            {dailyMovements.length ? (
              <div className="flex h-52 items-end gap-2 overflow-x-auto p-5">
                {dailyMovements.map((item) => (
                  <div key={item.date} className="flex h-full min-w-[36px] flex-1 flex-col justify-end gap-1">
                    <div className="flex h-full items-end justify-center gap-1">
                      <span className="block w-1/2 max-w-4 rounded-t-md bg-[#3150D8]" style={{ height: `${(item.entries / maxMovements) * 82}%` }} title={`${item.entries} ingresos`} />
                      <span className="block w-1/2 max-w-4 rounded-t-md bg-[#2EA8FF]" style={{ height: `${(item.exits / maxMovements) * 82}%` }} title={`${item.exits} salidas`} />
                    </div>
                    <span className="text-center text-[9px] font-semibold text-slate-500">{item.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="p-5 text-sm text-slate-500">{loading ? "Cargando…" : "Sin datos para el periodo seleccionado."}</p>}
            <div className="flex gap-4 border-t border-slate-100 px-5 py-3 text-xs text-slate-500"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-[#3150D8]" />Ingresos</span><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-[#2EA8FF]" />Salidas</span></div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function KpiTile({ icon: Icon, color, label, value, description }) {
  return (
    <div className="flex items-center gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-50"><Icon className={`h-5 w-5 ${color}`} /></span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-slate-500">{label}</span>
        <span className="mt-1 block truncate text-xl font-bold text-[#041E42]">{value}</span>
        <span className="mt-1 block text-xs text-slate-500">{description}</span>
      </span>
    </div>
  );
}
