"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Download, FileSpreadsheet } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { OPERATIONAL_TIME_ZONE } from "@/lib/dataEntry.mjs";

function money(value) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value || 0);
}
function number(value) {
  return new Intl.NumberFormat("es-CL").format(value || 0);
}
function paymentMethodLabel(method) {
  if (method === "CASH") return "Efectivo";
  if (method === "CARD") return "Tarjeta";
  return "—";
}
function statusLabel(status) {
  const labels = { OPEN: "Abierto", PAID: "Pagado", CANCELLED: "Anulado", PROGRAMMED: "Programado", CLOSING: "En cierre", CLOSED: "Cerrado" };
  return labels[status] || status || "—";
}

// CSV real (§8): protección contra CSV injection (=,+,-,@) y BOM UTF-8 --
// misma lógica que el backend (offStreetReportsCore.mjs), reimplementada
// mínimamente en cliente porque el CSV se arma en el navegador a partir de
// la respuesta JSON ya completa (all=true), sin una segunda ruta de
// formateo server-side.
function sanitizeCsvCell(value) {
  const text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) return `'${text}`;
  return text;
}
function downloadCsv(headers, rows, filename) {
  const escape = (value) => `"${sanitizeCsvCell(value).replaceAll('"', '""')}"`;
  const lines = [headers.map(escape).join(";"), ...rows.map((row) => row.map(escape).join(";"))];
  const csv = `﻿${lines.join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const TABS = [
  { id: "recaudacion", label: "Recaudación" },
  { id: "movimientos", label: "Entradas y salidas" },
  { id: "estacionados", label: "Vehículos estacionados" },
  { id: "cierres", label: "Cierres de caja" },
  { id: "turnos", label: "Operadores y turnos" },
  { id: "ocupacion", label: "Ocupación" },
];
const TAB_IDS = new Set(TABS.map((t) => t.id));

// Reutiliza la constante central en vez de repetir el literal (defecto real
// detectado en la validación Fase 5, §18).
function todayIsoSantiago() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: OPERATIONAL_TIME_ZONE }).format(new Date());
}
function monthStartIsoSantiago() {
  return `${todayIsoSantiago().slice(0, 7)}-01`;
}

export default function ReportesOffStreetPage() {
  return (
    <Suspense fallback={<div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-500">Cargando reportes…</div>}>
      <ReportesOffStreetContent />
    </Suspense>
  );
}

function ReportesOffStreetContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab = TAB_IDS.has(rawTab) ? rawTab : "recaudacion";

  const [company, setCompany] = useState("");
  const [parking, setParking] = useState("");
  const [from, setFrom] = useState(monthStartIsoSantiago());
  const [to, setTo] = useState(todayIsoSantiago());
  const [operatorId, setOperatorId] = useState("");
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [query, setQuery] = useState("");

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [resumen, setResumen] = useState(null);
  const [parkings, setParkings] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  function setTab(nextTab) {
    setStatus(""); // el filtro "Estado" no es comparable entre pestañas (movimientos vs turnos)
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    router.push(`/reportes-off-street?${params.toString()}`);
  }

  // Opciones de Empresa/Estacionamiento/Operador reales: reutiliza
  // /api/recaudacion (Fase 2, ya scoped Off Street) y /api/usuarios (mismo
  // mecanismo reutilizado por /recaudacion, Fase 2) -- nunca hardcodeadas.
  useEffect(() => {
    let cancelled = false;
    async function loadOptions() {
      try {
        const [recaudacionRes, usuariosRes] = await Promise.all([
          fetch("/api/recaudacion?pageSize=1"),
          fetch("/api/usuarios"),
        ]);
        const recaudacionPayload = await recaudacionRes.json().catch(() => null);
        const usuariosPayload = await usuariosRes.json().catch(() => null);
        if (cancelled) return;
        if (recaudacionRes.ok) {
          setParkings(Array.isArray(recaudacionPayload?.data?.parkings) ? recaudacionPayload.data.parkings : []);
          setCompanies(Array.isArray(recaudacionPayload?.data?.companies) ? recaudacionPayload.data.companies : []);
        }
        if (usuariosRes.ok) {
          const list = Array.isArray(usuariosPayload?.data) ? usuariosPayload.data : [];
          setOperators(list.filter((user) => user.perfilPrincipal === "operator"));
        }
      } catch {
        // Opciones de filtro: si fallan, no bloquean el resto de la pantalla.
      }
    }
    void loadOptions();
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
        if (tab !== "ocupacion") { params.set("dateFrom", from); params.set("dateTo", to); }
        params.set("pageSize", "50");

        let url;
        if (tab === "recaudacion") { if (method) params.set("paymentMethod", method); if (operatorId) params.set("operatorId", operatorId); if (query) params.set("query", query); url = `/api/recaudacion?${params.toString()}`; }
        else if (tab === "cierres") { if (operatorId) params.set("operatorId", operatorId); url = `/api/recaudacion/cierres?${params.toString()}`; }
        else if (tab === "movimientos") { params.set("type", "movements"); if (status) params.set("status", status); if (operatorId) params.set("operatorId", operatorId); if (query) params.set("query", query); url = `/api/reportes-off-street?${params.toString()}`; }
        else if (tab === "estacionados") { params.set("type", "parked"); if (query) params.set("query", query); url = `/api/reportes-off-street?${params.toString()}`; }
        else if (tab === "turnos") { params.set("type", "shifts"); if (status) params.set("status", status); if (operatorId) params.set("operatorId", operatorId); url = `/api/reportes-off-street?${params.toString()}`; }
        else { params.set("type", "occupancy"); url = `/api/reportes-off-street?${params.toString()}`; }

        const response = await fetch(url);
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok) {
          setRows([]); setTotal(0); setResumen(null);
          setError(payload?.error || "No fue posible consultar el reporte.");
          return;
        }
        setRows(Array.isArray(payload?.data?.rows) ? payload.data.rows : []);
        setTotal(Number(payload?.data?.total) || 0);
        setResumen(payload?.data?.resumen || null);
        if (Array.isArray(payload?.data?.parkings)) setParkings(payload.data.parkings);
        if (Array.isArray(payload?.data?.companies)) setCompanies(payload.data.companies);
      } catch {
        if (!cancelled) { setRows([]); setTotal(0); setResumen(null); setError("No fue posible conectar con el servidor."); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [tab, company, parking, from, to, operatorId, status, method, query]);

  const parkingOptions = useMemo(() => (company ? parkings.filter((p) => p.companyId === company) : parkings), [company, parkings]);
  const operatorOptions = useMemo(() => operators.filter((user) => {
    if (company && user.empresaId !== company) return false;
    if (parking && !(user.estacionamientos || []).includes(parking)) return false;
    return true;
  }), [operators, company, parking]);

  const columns = useMemo(() => {
    if (tab === "recaudacion") return [["date", "Fecha"], ["time", "Hora"], ["ticket", "Ticket"], ["plate", "Patente"], ["companyName", "Empresa"], ["parkingName", "Estacionamiento"], ["operator", "Operador"], ["shiftLabel", "Turno"], ["paymentMethod", "Medio de pago"], ["amount", "Monto"]];
    if (tab === "movimientos") return [["ticket", "Ticket"], ["plate", "Patente"], ["companyName", "Empresa"], ["parkingName", "Estacionamiento"], ["entryDate", "Fecha ingreso"], ["entryTime", "Hora ingreso"], ["exitDate", "Fecha salida"], ["exitTime", "Hora salida"], ["entryOperator", "Operador ingreso"], ["exitOperator", "Operador salida"], ["status", "Estado"], ["minutes", "Permanencia (min)"]];
    if (tab === "estacionados") return [["ticket", "Ticket"], ["plate", "Patente"], ["companyName", "Empresa"], ["parkingName", "Estacionamiento"], ["entryDate", "Fecha ingreso"], ["entryTime", "Hora ingreso"], ["elapsedMinutes", "Tiempo transcurrido (min)"], ["entryOperator", "Operador de ingreso"], ["origin", "Origen"]];
    if (tab === "cierres") return [["folio", "Folio"], ["companyName", "Empresa"], ["parkingName", "Estacionamiento"], ["operator", "Operador"], ["shiftDate", "Turno"], ["openedAt", "Inicio"], ["closedAt", "Cierre"], ["confirmedPaymentsCount", "Pagos confirmados"], ["cashAmount", "Efectivo"], ["cardAmount", "Tarjeta"], ["grossAmount", "Total"], ["declaredCashAmount", "Efectivo declarado"], ["cashDifference", "Diferencia"], ["differenceObservation", "Observación"], ["pendingVehiclesCount", "Vehículos pendientes"]];
    if (tab === "turnos") return [["operator", "Operador"], ["companyName", "Empresa"], ["parkingName", "Estacionamiento"], ["shiftDate", "Turno"], ["openedDate", "Inicio"], ["closedDate", "Cierre"], ["status", "Estado"], ["entryCount", "Operaciones"], ["revenueAmount", "Recaudación del turno"]];
    return [["parkingName", "Estacionamiento"], ["companyName", "Empresa"], ["capacity", "Capacidad"], ["insideCount", "Vehículos dentro"], ["available", "Disponibles"], ["occupancyPercentage", "% Ocupación"]];
  }, [tab]);

  function cellValue(row, key) {
    if (key === "amount" || key === "cashAmount" || key === "cardAmount" || key === "grossAmount" || key === "declaredCashAmount" || key === "cashDifference" || key === "revenueAmount") return money(row[key]);
    if (key === "paymentMethod") return paymentMethodLabel(row.paymentMethod);
    if (key === "status") return statusLabel(row.status);
    if (key === "capacity" || key === "insideCount" || key === "available") return row[key] == null ? "No informada" : number(row[key]);
    if (key === "occupancyPercentage") return row[key] == null ? "—" : `${row[key]}%`;
    if (key === "openedAt") return row.openedDate ? `${row.openedDate} ${row.openedTime}` : "—";
    if (key === "closedAt") return row.closedDate ? `${row.closedDate} ${row.closedTime}` : "Sin cierre";
    return row[key] ?? "—";
  }

  const exportCsv = async () => {
    setExporting(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (company) params.set("companyId", company);
      if (parking) params.set("parkingId", parking);
      if (tab !== "ocupacion") { params.set("dateFrom", from); params.set("dateTo", to); }
      params.set("all", "true");

      let url;
      if (tab === "recaudacion") { if (method) params.set("paymentMethod", method); if (operatorId) params.set("operatorId", operatorId); if (query) params.set("query", query); url = `/api/recaudacion?${params.toString()}`; }
      else if (tab === "cierres") { if (operatorId) params.set("operatorId", operatorId); url = `/api/recaudacion/cierres?${params.toString()}`; }
      else if (tab === "movimientos") { params.set("type", "movements"); if (status) params.set("status", status); if (operatorId) params.set("operatorId", operatorId); if (query) params.set("query", query); url = `/api/reportes-off-street?${params.toString()}`; }
      else if (tab === "estacionados") { params.set("type", "parked"); url = `/api/reportes-off-street?${params.toString()}`; }
      else if (tab === "turnos") { params.set("type", "shifts"); if (status) params.set("status", status); if (operatorId) params.set("operatorId", operatorId); url = `/api/reportes-off-street?${params.toString()}`; }
      else { params.set("type", "occupancy"); url = `/api/reportes-off-street?${params.toString()}`; }

      const response = await fetch(url);
      const payload = await response.json().catch(() => null);
      if (!response.ok) { setError(payload?.error || "No fue posible exportar el reporte."); return; }
      const exportRows = Array.isArray(payload?.data?.rows) ? payload.data.rows : [];
      downloadCsv(columns.map(([, label]) => label), exportRows.map((row) => columns.map(([key]) => cellValue(row, key))), `reporte-${tab}-${from}-${to}.csv`);
    } catch {
      setError("No fue posible conectar con el servidor para exportar.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppShell title="Reportes Off Street" description="Reportes reales de operación, recaudación, cierres y ocupación">
      <div className="space-y-5">
        <header className="flex flex-col gap-4 rounded-3xl border border-[#5271E8] bg-[#3150D8] p-6 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-cyan-200">Off Street</p>
            <h1 className="mt-2 text-3xl font-semibold">Reportes</h1>
            <p className="mt-2 text-sm text-slate-300">Datos reales, exclusivamente estacionamientos Off Street.</p>
          </div>
          <Link href="/" className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20"><ArrowLeft className="h-4 w-4" />Volver</Link>
        </header>

        <div className="flex flex-wrap gap-2 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
          {TABS.map((item) => (
            <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${tab === item.id ? "bg-[#3150D8] text-white" : "text-slate-600 hover:bg-slate-100"}`}>{item.label}</button>
          ))}
        </div>

        <section className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-4">
          {companies.length > 1 && (
            <label className="text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Empresa</span><select value={company} onChange={(e) => { setCompany(e.target.value); setParking(""); setOperatorId(""); }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]"><option value="">Todas</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          )}
          <label className="text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Estacionamiento</span><select value={parking} onChange={(e) => { setParking(e.target.value); setOperatorId(""); }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]"><option value="">Todos</option>{parkingOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          {tab !== "ocupacion" && (<>
            <label className="text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Fecha desde</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]" /></label>
            <label className="text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Fecha hasta</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]" /></label>
          </>)}
          {(tab === "recaudacion" || tab === "cierres" || tab === "turnos") && operatorOptions.length > 0 && (
            <label className="text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Operador</span><select value={operatorId} onChange={(e) => setOperatorId(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]"><option value="">Todos</option>{operatorOptions.map((u) => <option key={u.id} value={u.id}>{u.nombreCompleto}</option>)}</select></label>
          )}
          {tab === "recaudacion" && (
            <label className="text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Medio de pago</span><select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]"><option value="">Todos</option><option value="CASH">Efectivo</option><option value="CARD">Tarjeta</option></select></label>
          )}
          {(tab === "movimientos") && (
            <label className="text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Estado</span><select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]"><option value="">Todos</option><option value="OPEN">Abierto</option><option value="PAID">Pagado</option><option value="CANCELLED">Anulado</option></select></label>
          )}
          {tab === "turnos" && (
            <label className="text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Estado del turno</span><select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]"><option value="">Todos</option><option value="PROGRAMMED">Programado</option><option value="OPEN">Abierto</option><option value="CLOSING">En cierre</option><option value="CLOSED">Cerrado</option><option value="CANCELLED">Anulado</option></select></label>
          )}
          {(tab === "recaudacion" || tab === "movimientos" || tab === "estacionados") && (
            <label className="text-xs font-semibold text-slate-600 sm:col-span-2"><span className="mb-1.5 block">Buscar (patente, ticket{tab === "recaudacion" ? " o código de pago" : ""})</span><input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]" /></label>
          )}
        </section>

        {error ? <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

        {resumen ? (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {"totalAmount" in resumen ? <>
              <KpiTile label="Total recaudado" value={money(resumen.totalAmount)} />
              <KpiTile label="Efectivo" value={money(resumen.cashAmount)} />
              <KpiTile label="Tarjeta" value={money(resumen.cardAmount)} />
              <KpiTile label="Ticket promedio" value={money(resumen.averageTicket)} />
            </> : <>
              <KpiTile label="Ingresos" value={number(resumen.ingresosDia)} />
              <KpiTile label="Salidas" value={number(resumen.salidasDia)} />
              <KpiTile label="Vehículos dentro" value={number(resumen.vehiculosDentro)} />
              <KpiTile label="Tickets abiertos" value={number(resumen.ticketsAbiertos)} />
            </>}
          </section>
        ) : null}

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div className="flex items-center gap-3"><FileSpreadsheet className="h-5 w-5 text-[#3150D8]" /><p className="text-sm text-slate-500">{total} resultados</p></div>
            <button type="button" onClick={exportCsv} disabled={exporting} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Download className="h-4 w-4" />{exporting ? "Exportando…" : "Exportar CSV (resultado filtrado completo)"}</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-[#041E42] text-white"><tr>{columns.map(([key, label]) => <th key={key} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id || index} className="border-b border-slate-100 last:border-b-0 even:bg-slate-50">
                    {columns.map(([key]) => <td key={key} className="px-4 py-3">{cellValue(row, key)}</td>)}
                  </tr>
                ))}
                {!rows.length ? <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-slate-500">{loading ? "Cargando…" : "Sin resultados"}</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function KpiTile({ label, value }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-[#041E42]">{value}</p>
    </div>
  );
}
