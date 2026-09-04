"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Banknote,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Download,
  Eye,
  FileSpreadsheet,
  Landmark,
  ReceiptText,
  Search,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";

// "Hoy" en el día operacional real (America/Santiago) -- mismo patrón que
// /operacion (Fase 1). en-CA formatea directamente como AAAA-MM-DD.
function todayIsoSantiago() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}
function monthStartIsoSantiago() {
  return `${todayIsoSantiago().slice(0, 7)}-01`;
}

function money(value) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value || 0);
}

// parking_stays.payment_method solo distingue CASH/CARD (mismo modelo real
// que /operacion, Fase 1) -- nunca se inventa débito/crédito.
function paymentMethodLabel(method) {
  if (method === "CASH") return "Efectivo";
  if (method === "CARD") return "Tarjeta";
  return "—";
}

const transactionColumns = [
  ["date", "Fecha"], ["time", "Hora"], ["paymentCode", "Código de pago"], ["ticket", "Ticket"], ["plate", "Patente"],
  ["companyName", "Empresa"], ["parkingName", "Estacionamiento"], ["operator", "Operador"], ["shiftLabel", "Turno"],
  ["paymentMethodLabel", "Medio de pago"], ["amount", "Monto"], ["status", "Estado"],
];

const PAGE_SIZE = 25;

export default function RecaudacionPage() {
  const [company, setCompany] = useState("");
  const [parking, setParking] = useState("");
  const [operatorId, setOperatorId] = useState("");
  const [from, setFrom] = useState(monthStartIsoSantiago());
  const [to, setTo] = useState(todayIsoSantiago());
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [method, setMethod] = useState("");
  const [sort, setSort] = useState({ key: "date", direction: "desc" });
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(1);
  const [operators, setOperators] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const [resumen, setResumen] = useState({ totalAmount: 0, cashAmount: 0, cardAmount: 0, count: 0, averageTicket: 0 });
  const [dailySeries, setDailySeries] = useState([]);
  const [cashDifference, setCashDifference] = useState({ totalDifference: 0, closuresWithDifference: 0 });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [parkings, setParkings] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [closures, setClosures] = useState([]);
  const [closuresLoading, setClosuresLoading] = useState(true);
  const [closuresError, setClosuresError] = useState("");

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  // Filtro de Operador (§3 del alcance): reutiliza GET /api/usuarios
  // (listAuthorizedUsers), el mismo endpoint real de la pantalla Usuarios --
  // ya viene scoped server-side por empresa (companyScope: root ve todas,
  // company_admin solo la propia), así que nunca expone operadores de otra
  // empresa. Ningún endpoint nuevo, ningún nombre hardcodeado.
  useEffect(() => {
    let cancelled = false;
    async function loadOperators() {
      try {
        const response = await fetch("/api/usuarios");
        const payload = await response.json().catch(() => null);
        if (cancelled || !response.ok) return;
        const list = Array.isArray(payload?.data) ? payload.data : [];
        setOperators(list.filter((user) => user.perfilPrincipal === "operator"));
      } catch {
        // Filtro opcional: si falla, simplemente no se ofrece -- no bloquea el resto de la pantalla.
      }
    }
    void loadOperators();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (company) params.set("companyId", company);
        if (parking) params.set("parkingId", parking);
        if (from) params.set("dateFrom", from);
        if (to) params.set("dateTo", to);
        if (method) params.set("paymentMethod", method);
        if (operatorId) params.set("operatorId", operatorId);
        if (debouncedQuery) params.set("query", debouncedQuery);
        params.set("page", String(page));
        params.set("pageSize", String(PAGE_SIZE));

        const response = await fetch(`/api/recaudacion?${params.toString()}`);
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok) {
          setRows([]);
          setTotal(0);
          setError(payload?.error || "No fue posible consultar la recaudación.");
          return;
        }
        setRows(Array.isArray(payload?.data?.rows) ? payload.data.rows : []);
        setTotal(Number(payload?.data?.total) || 0);
        setResumen(payload?.data?.resumen || { totalAmount: 0, cashAmount: 0, cardAmount: 0, count: 0, averageTicket: 0 });
        setDailySeries(Array.isArray(payload?.data?.serieDiaria) ? payload.data.serieDiaria : []);
        setCashDifference(payload?.data?.diferenciasCaja || { totalDifference: 0, closuresWithDifference: 0 });
        if (Array.isArray(payload?.data?.parkings)) setParkings(payload.data.parkings);
        if (Array.isArray(payload?.data?.companies)) setCompanies(payload.data.companies);
      } catch {
        if (!cancelled) {
          setRows([]);
          setTotal(0);
          setError("No fue posible conectar con el servidor. Intenta nuevamente.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [company, parking, from, to, method, operatorId, debouncedQuery, page]);

  useEffect(() => {
    let cancelled = false;
    async function loadClosures() {
      setClosuresLoading(true);
      setClosuresError("");
      try {
        const params = new URLSearchParams();
        if (company) params.set("companyId", company);
        if (parking) params.set("parkingId", parking);
        if (from) params.set("dateFrom", from);
        if (to) params.set("dateTo", to);
        if (operatorId) params.set("operatorId", operatorId);
        params.set("pageSize", "50");

        const response = await fetch(`/api/recaudacion/cierres?${params.toString()}`);
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok) {
          setClosures([]);
          setClosuresError(payload?.error || "No fue posible consultar los cierres de caja.");
          return;
        }
        setClosures(Array.isArray(payload?.data?.rows) ? payload.data.rows : []);
      } catch {
        if (!cancelled) { setClosures([]); setClosuresError("No fue posible conectar con el servidor."); }
      } finally {
        if (!cancelled) setClosuresLoading(false);
      }
    }
    void loadClosures();
    return () => { cancelled = true; };
  }, [company, parking, from, to, operatorId]);

  const parkingOptions = useMemo(
    () => (company ? parkings.filter((item) => item.companyId === company) : parkings),
    [company, parkings],
  );

  // Operadores relevantes al filtro de empresa/estacionamiento vigente --
  // los datos ya vienen scoped server-side (§3); esto solo evita ofrecer
  // operadores de otras empresas/estacionamientos en el selector.
  const operatorOptions = useMemo(() => operators.filter((user) => {
    if (company && user.empresaId !== company) return false;
    if (parking && !(user.estacionamientos || []).includes(parking)) return false;
    return true;
  }), [operators, company, parking]);

  const tableRows = useMemo(() => rows.map((row) => ({
    id: row.id,
    date: row.date,
    time: row.time,
    paymentCode: row.paymentCode,
    ticket: row.ticket,
    plate: row.plate,
    companyName: row.companyName || "—",
    parkingName: row.parkingName || "—",
    operator: row.operator,
    shiftLabel: row.shiftLabel || "—",
    paymentMethodRaw: row.paymentMethod,
    paymentMethodLabel: paymentMethodLabel(row.paymentMethod),
    amount: row.amount,
    status: row.status,
  })), [rows]);

  const sortedRows = useMemo(() => {
    const list = [...tableRows];
    list.sort((left, right) => {
      const a = left[sort.key];
      const b = right[sort.key];
      const comparison = typeof a === "number" ? a - b : String(a ?? "").localeCompare(String(b ?? ""), "es", { numeric: true });
      return sort.direction === "asc" ? comparison : -comparison;
    });
    return list;
  }, [sort, tableRows]);

  const maxRevenue = Math.max(1, ...dailySeries.map((item) => item.amount));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const orderBy = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));

  function rowsToCsv(list) {
    const mapped = list.map((row) => ({
      date: row.date, time: row.time, paymentCode: row.paymentCode, ticket: row.ticket, plate: row.plate,
      companyName: row.companyName || "—", parkingName: row.parkingName || "—", operator: row.operator,
      shiftLabel: row.shiftLabel || "—", paymentMethodLabel: paymentMethodLabel(row.paymentMethod), amount: row.amount, status: "Pagado",
    }));
    const headers = transactionColumns.map(([, label]) => label);
    const csvRows = mapped.map((item) => transactionColumns.map(([key]) => item[key]));
    return [headers, ...csvRows].map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(";")).join("\n");
  }

  function downloadCsv(csv, filename) {
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  // Exportación real (§4, Opción A): trae el resultado COMPLETO que
  // corresponde a los filtros vigentes (mismo scope server-side, mismo tope
  // no-silencioso), no solo la página visible en pantalla.
  const exportCsv = async () => {
    setExportError("");
    if (!from || !to) {
      setExportError("Selecciona un rango de fechas antes de exportar.");
      return;
    }
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (company) params.set("companyId", company);
      if (parking) params.set("parkingId", parking);
      params.set("dateFrom", from);
      params.set("dateTo", to);
      if (method) params.set("paymentMethod", method);
      if (operatorId) params.set("operatorId", operatorId);
      if (debouncedQuery) params.set("query", debouncedQuery);
      params.set("all", "true");

      const response = await fetch(`/api/recaudacion?${params.toString()}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setExportError(payload?.error || "No fue posible exportar la recaudación.");
        return;
      }
      const exportRows = Array.isArray(payload?.data?.rows) ? payload.data.rows : [];
      downloadCsv(rowsToCsv(exportRows), `recaudacion-${from}-${to}.csv`);
    } catch {
      setExportError("No fue posible conectar con el servidor para exportar.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppShell title="Recaudación" description="Control financiero, cierres y conciliación">
      <div className="space-y-5">
        <header className="flex flex-col gap-4 rounded-3xl border border-[#5271E8] bg-[#3150D8] p-6 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-semibold text-cyan-200">Control financiero</p><h1 className="mt-2 text-3xl font-semibold">Recaudación y conciliación</h1><p className="mt-2 text-sm text-slate-300">Datos reales de pagos (parking_stays) y cierres de caja (shift_closures) Off Street.</p></div>
          <Link href="/" className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20"><ArrowLeft className="h-4 w-4" />Volver</Link>
        </header>

        <section className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto] xl:items-end">
          {companies.length > 1 && (
            <label className="text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Empresa</span><select value={company} onChange={(event) => { setCompany(event.target.value); setParking(""); setOperatorId(""); setPage(1); }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]"><option value="">Todas</option>{companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          )}
          <label className="text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Estacionamiento</span><select value={parking} onChange={(event) => { setParking(event.target.value); setOperatorId(""); setPage(1); }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]"><option value="">Todos</option>{parkingOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Fecha desde</span><input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]" /></label>
          <label className="text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Fecha hasta</span><input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]" /></label>
          <span className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-500"><CalendarDays className="h-4 w-4" />{loading ? "Actualizando…" : "Periodo aplicado"}</span>
        </section>

        {error ? <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { id: "total", label: "Total recaudado", value: money(resumen.totalAmount), description: "Periodo seleccionado", icon: Landmark, color: "text-[#3150D8]", onClick: () => { setMethod(""); setPage(1); } },
            { id: "cash", label: "Efectivo", value: money(resumen.cashAmount), description: `${resumen.totalAmount ? Math.round((resumen.cashAmount / resumen.totalAmount) * 100) : 0}% de la recaudación`, icon: Banknote, color: "text-emerald-700", onClick: () => { setMethod("CASH"); setPage(1); } },
            { id: "cards", label: "Tarjeta", value: money(resumen.cardAmount), description: `${resumen.totalAmount ? Math.round((resumen.cardAmount / resumen.totalAmount) * 100) : 0}% de la recaudación`, icon: CreditCard, color: "text-sky-700", onClick: () => { setMethod("CARD"); setPage(1); } },
            { id: "count", label: "Transacciones", value: String(resumen.count), description: `Ticket promedio: ${money(resumen.averageTicket)}`, icon: ReceiptText, color: "text-amber-700", onClick: () => { setMethod(""); setPage(1); } },
          ].map(({ id, label, value, description, icon: Icon, color, onClick }) => (
            <button key={id} type="button" onClick={onClick} className={`flex items-center gap-4 rounded-3xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#3150D8] hover:shadow-md ${(id === "cash" && method === "CASH") || (id === "cards" && method === "CARD") ? "border-[#3150D8] ring-2 ring-[#3150D8]/15" : "border-slate-200"}`}>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-50"><Icon className={`h-5 w-5 ${color}`} /></span><span><span className="block text-xs font-semibold text-slate-500">{label}</span><span className="mt-1 block text-xl font-bold text-[#041E42]">{value}</span><span className="mt-1 block text-xs text-slate-500">{description}</span></span>
            </button>
          ))}
        </section>

        <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4"><TrendingUp className="h-5 w-5 text-[#3150D8]" /><div><h2 className="font-bold text-[#041E42]">Evolución de la recaudación</h2><p className="text-xs text-slate-500">Días con pagos confirmados en el periodo seleccionado</p></div></div>
            {dailySeries.length ? (
              <div className="flex h-60 items-end gap-3 overflow-x-auto p-5">
                {dailySeries.map((item) => (
                  <div key={item.date} className="group flex h-full min-w-[28px] flex-1 flex-col justify-end gap-2">
                    <span className="text-center text-[10px] font-bold text-slate-500 opacity-0 transition group-hover:opacity-100">{money(item.amount)}</span>
                    <span className="block w-full rounded-t-lg bg-[#3150D8] transition group-hover:bg-[#2EA8FF]" style={{ height: `${(item.amount / maxRevenue) * 82}%` }} />
                    <span className="text-center text-[10px] font-semibold text-slate-500">{item.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="p-5 text-sm text-slate-500">{loading ? "Cargando…" : "Sin datos para el periodo seleccionado."}</p>}
          </section>

          <section id="medios-de-pago" className="scroll-mt-24 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4"><WalletCards className="h-5 w-5 text-[#3150D8]" /><div><h2 className="font-bold text-[#041E42]">Medios de pago</h2><p className="text-xs text-slate-500">Distribución real del periodo</p></div></div>
            <div className="space-y-3 p-4">
              {[
                { key: "CASH", label: "Efectivo", amount: resumen.cashAmount, icon: Banknote, color: "bg-emerald-500" },
                { key: "CARD", label: "Tarjeta", amount: resumen.cardAmount, icon: CreditCard, color: "bg-[#3150D8]" },
              ].map((item) => (
                <div key={item.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2"><item.icon className="h-4 w-4 text-[#3150D8]" /><span className="font-bold text-[#041E42]">{item.label}</span></div>
                    <span className="font-bold tabular-nums text-[#041E42]">{money(item.amount)}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white"><span className={`block h-full rounded-full ${item.color}`} style={{ width: `${resumen.totalAmount ? Math.round((item.amount / resumen.totalAmount) * 100) : 0}%` }} /></div>
                </div>
              ))}
              <div className="rounded-2xl bg-[#EEF4FF] p-3 text-xs text-slate-600">
                <b className="text-[#041E42]">Diferencias de caja del período:</b> {money(cashDifference.totalDifference)} en {cashDifference.closuresWithDifference} cierre(s) con diferencia.
              </div>
              <p className="px-1 text-[11px] leading-5 text-slate-500">parking_stays.payment_method solo distingue Efectivo/Tarjeta hoy -- no existe una distinción real entre débito y crédito en el esquema actual.</p>
            </div>
          </section>
        </div>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><h2 className="font-bold text-[#041E42]">Cierres de turno</h2><p className="text-xs text-slate-500">Monto esperado, declarado y diferencias -- misma fuente que usa el POS para cerrar caja (shift_closures)</p></div><CheckCircle2 className="h-5 w-5 text-emerald-700" /></div>
          {closuresError ? <p className="mx-5 mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{closuresError}</p> : null}
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#041E42] text-white"><tr><th className="px-4 py-3">Folio</th><th className="px-4 py-3">Estacionamiento</th><th className="px-4 py-3">Turno</th><th className="px-4 py-3">Operador</th><th className="px-4 py-3 text-right">Esperado</th><th className="px-4 py-3 text-right">Declarado</th><th className="px-4 py-3 text-right">Diferencia</th><th className="px-4 py-3">Estado</th></tr></thead><tbody>{closures.map((closure) => <tr key={closure.id} className="border-b border-slate-100 last:border-b-0 even:bg-slate-50 hover:bg-[#EEF4FF]"><td className="px-4 py-3 font-bold text-[#3150D8]">{closure.folio}</td><td className="px-4 py-3">{closure.parkingName || "—"}</td><td className="px-4 py-3">{closure.shiftDate || "—"}</td><td className="px-4 py-3">{closure.operator}</td><td className="px-4 py-3 text-right">{money(closure.grossAmount)}</td><td className="px-4 py-3 text-right">{closure.declaredCashAmount != null ? money(closure.declaredCashAmount) : "—"}</td><td className={`px-4 py-3 text-right font-bold ${(closure.cashDifference || 0) < 0 ? "text-rose-700" : "text-emerald-700"}`}>{closure.cashDifference != null ? money(closure.cashDifference) : "—"}</td><td className="px-4 py-3"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{closure.status === "CONFIRMED" ? "Confirmado" : closure.status}</span></td></tr>)}{!closures.length ? <tr><td colSpan="8" className="px-4 py-8 text-center text-slate-500">{closuresLoading ? "Cargando…" : "No existen cierres para los filtros seleccionados."}</td></tr> : null}</tbody></table></div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 xl:flex-row xl:items-center xl:justify-between"><div className="flex items-center gap-3"><FileSpreadsheet className="h-5 w-5 text-[#3150D8]" /><div><h2 className="font-bold text-[#041E42]">Transacciones</h2><p className="text-xs text-slate-500">{total} resultados · pagos confirmados (parking_stays) · los KPIs superiores reflejan estos mismos filtros, salvo la búsqueda de texto</p></div></div><div className="flex flex-wrap gap-2"><label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3"><Search className="h-4 w-4 text-[#3150D8]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Patente, ticket o código de pago" className="w-56 py-2.5 text-sm outline-none" /></label><select value={method} onChange={(event) => { setMethod(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">Todos los medios</option><option value="CASH">Efectivo</option><option value="CARD">Tarjeta</option></select>{operatorOptions.length > 0 && (<select value={operatorId} onChange={(event) => { setOperatorId(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">Todos los operadores</option>{operatorOptions.map((user) => <option key={user.id} value={user.id}>{user.nombreCompleto}</option>)}</select>)}<button type="button" onClick={exportCsv} disabled={exporting} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Download className="h-4 w-4" />{exporting ? "Exportando…" : "Exportar CSV (resultado filtrado completo)"}</button></div></div>
          {exportError ? <p className="mx-5 mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{exportError}</p> : null}
          <div className="overflow-x-auto"><table className="w-full min-w-[1350px] text-left text-sm"><thead className="bg-[#041E42] text-white"><tr>{transactionColumns.map(([key, label]) => <th key={key} className="p-0"><button type="button" onClick={() => orderBy(key)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left font-semibold hover:bg-white/10">{label}{sort.key === key ? (sort.direction === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />) : null}</button></th>)}<th className="px-4 py-3">Detalle</th></tr></thead><tbody>{sortedRows.map((item) => <tr key={item.id} className="border-b border-slate-100 last:border-b-0 even:bg-slate-50 hover:bg-[#EEF4FF]" onClick={() => setSelected(item)}>{transactionColumns.map(([key]) => <td key={key} className={`cursor-pointer px-4 py-3 ${key === "amount" ? "text-right font-bold" : ""}`}>{key === "amount" ? money(item[key]) : key === "status" ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Pagado</span> : item[key]}</td>)}<td className="px-4 py-3"><button type="button" className="inline-flex items-center gap-1 text-xs font-bold text-[#3150D8]"><Eye className="h-4 w-4" />Ver</button></td></tr>)}{!sortedRows.length ? <tr><td colSpan={transactionColumns.length + 1} className="px-4 py-8 text-center text-slate-500">{loading ? "Cargando…" : "No hay transacciones para estos filtros."}</td></tr> : null}</tbody></table></div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 text-sm text-slate-600">
              <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-full border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40">Anterior</button>
              <span>Página {page} de {totalPages}</span>
              <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="rounded-full border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40">Siguiente</button>
            </div>
          )}
        </section>
      </div>

      {selected ? <div className="fixed inset-0 z-50 grid place-items-center bg-[#041E42]/65 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl"><header className="flex items-center justify-between bg-[#041E42] px-5 py-4 text-white"><div><p className="text-xs font-semibold text-cyan-200">Detalle financiero</p><h2 className="mt-1 text-xl font-bold">{selected.ticket}</h2></div><button type="button" onClick={() => setSelected(null)} className="rounded-full p-2 hover:bg-white/10"><X className="h-5 w-5" /></button></header><div className="grid gap-3 p-5 sm:grid-cols-2">{Object.entries(selected).filter(([key]) => !["id", "paymentMethodRaw"].includes(key)).map(([key, value]) => <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-semibold text-slate-400">{key.replaceAll(/([A-Z])/g, " $1")}</p><p className="mt-1 text-sm font-bold text-[#041E42]">{key === "amount" ? money(value) : String(value ?? "—")}</p></div>)}</div></section></div> : null}
    </AppShell>
  );
}
