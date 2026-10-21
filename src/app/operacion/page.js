"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import OperacionResumen from "@/components/operacion/OperacionResumen";
import EstadoTicketBadge from "@/components/operacion/EstadoTicketBadge";
import SpreadsheetTable from "@/components/ui/SpreadsheetTable";
import { OPERATIONAL_TIME_ZONE } from "@/lib/dataEntry.mjs";

// "Hoy" en el día operacional real (America/Santiago) -- nunca una fecha
// demostrativa fija. en-CA formatea directamente como AAAA-MM-DD. Reutiliza
// la constante central (dataEntry.mjs) en vez de repetir el literal --
// defecto real detectado en la validación Fase 5 (§18).
function todayIsoSantiago() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: OPERATIONAL_TIME_ZONE }).format(new Date());
}

function money(value) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value || 0);
}

// parking_stays.payment_method solo distingue CASH/CARD (ver
// src/lib/offStreetOperationsCore.mjs) -- misma correspondencia real que
// usa el resto de la app (modelo-dashboard, POS).
function paymentMethodLabel(method) {
  if (method === "CASH") return "Efectivo";
  if (method === "CARD") return "Tarjeta";
  return "—";
}

const ORIGIN_LABELS = { WEB: "Web", POS: "POS", MOBILE: "Móvil", TABLET: "Tablet", OTHER: "Otro" };
function originLabel(source) {
  return ORIGIN_LABELS[source] || source || "—";
}

const PAGE_SIZE = 25;

export default function OperacionPage() {
  const [resumen, setResumen] = useState({ ingresosDia: 0, salidasDia: 0, vehiculosDentro: 0, ticketsAbiertos: 0 });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [parkings, setParkings] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // "quickFilter" son las tarjetas de resumen (Ingresos/Salidas/Vehículos
  // dentro); "status" es el filtro manual de Estado. Ambos son mutuamente
  // excluyentes (elegir uno limpia el otro) para que el resultado en
  // pantalla siempre corresponda a un único criterio explícito.
  const [quickFilter, setQuickFilter] = useState("all"); // all | entries | exits | open
  const [status, setStatus] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [parkingId, setParkingId] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (companyId) params.set("companyId", companyId);
        if (parkingId) params.set("parkingId", parkingId);
        if (debouncedQuery) params.set("query", debouncedQuery);
        params.set("page", String(page));
        params.set("pageSize", String(PAGE_SIZE));

        const today = todayIsoSantiago();
        if (quickFilter === "entries") { params.set("movement", "entries"); params.set("dateFrom", today); params.set("dateTo", today); }
        else if (quickFilter === "exits") { params.set("movement", "exits"); params.set("dateFrom", today); params.set("dateTo", today); params.set("status", "PAID"); }
        else if (quickFilter === "open") { params.set("status", "OPEN"); }
        else if (status) { params.set("status", status); }

        const response = await fetch(`/api/operacion?${params.toString()}`);
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok) {
          setRows([]);
          setTotal(0);
          setError(payload?.error || "No fue posible consultar la operación.");
          return;
        }
        setRows(Array.isArray(payload?.data?.rows) ? payload.data.rows : []);
        setTotal(Number(payload?.data?.total) || 0);
        setResumen(payload?.data?.resumen || { ingresosDia: 0, salidasDia: 0, vehiculosDentro: 0, ticketsAbiertos: 0 });
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
  }, [quickFilter, status, companyId, parkingId, debouncedQuery, page]);

  const parkingOptions = useMemo(
    () => (companyId ? parkings.filter((parking) => parking.companyId === companyId) : parkings),
    [companyId, parkings],
  );

  const columns = [
    { key: "ticket", label: "Ticket" },
    { key: "patente", label: "Patente" },
    { key: "empresa", label: "Empresa" },
    { key: "estacionamiento", label: "Estacionamiento" },
    { key: "ingreso", label: "Ingreso" },
    { key: "salida", label: "Salida" },
    { key: "estado", label: "Estado", render: (row) => <EstadoTicketBadge estado={row.estadoRaw} /> },
    { key: "operador", label: "Operador" },
    { key: "monto", label: "Monto", render: (row) => money(row.montoRaw) },
    { key: "medioPago", label: "Medio de pago" },
    { key: "origen", label: "Origen" },
  ];

  const tableRows = rows.map((row) => ({
    id: row.id,
    ticket: row.ticket,
    patente: row.plate,
    empresa: row.companyName || "—",
    estacionamiento: row.parkingName || "—",
    ingreso: row.entryDate !== "-" ? `${row.entryDate} ${row.entryTime}` : "—",
    salida: row.exitDate ? `${row.exitDate} ${row.exitTime}` : "—",
    estadoRaw: row.status,
    operador: row.exitOperator || row.entryOperator || "—",
    montoRaw: row.amount,
    medioPago: paymentMethodLabel(row.paymentMethod),
    origen: originLabel(row.origin),
  }));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const setQuick = (next) => {
    setQuickFilter(next);
    setStatus("");
    setPage(1);
    window.setTimeout(() => document.getElementById("movimientos-operacion")?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  return (
    <AppShell title="Operación diaria" description="Operación real Off Street: tickets, ingresos y salidas">
      <div className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#5271E8] bg-[#3150D8] p-6 text-white shadow-sm">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100">Operación diaria</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Seguimiento de tickets y movimientos</h1>
            <p className="mt-2 max-w-2xl text-sm text-blue-100">Datos reales de estadías (parking_stays) para los estacionamientos autorizados.</p>
          </div>
          <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:flex-col sm:items-end">
            <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white px-4 py-3 text-sm font-semibold text-[#3150D8] transition hover:bg-blue-50">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Link>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-3">
          <OperacionResumen title="Ingresos del día" value={resumen.ingresosDia} description="Estadías con ingreso hoy" tone="info" selected={quickFilter === "entries"} onClick={() => setQuick("entries")} />
          <OperacionResumen title="Salidas del día" value={resumen.salidasDia} description="Estadías pagadas hoy" tone="positive" selected={quickFilter === "exits"} onClick={() => setQuick("exits")} />
          <OperacionResumen title="Vehículos dentro / Tickets abiertos" value={resumen.vehiculosDentro} description="Estadías con estado Abierto" tone="warning" selected={quickFilter === "open"} onClick={() => setQuick("open")} />
        </div>

        <div id="movimientos-operacion" className="scroll-mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-[#041E42]">Movimientos</h2>
              <p className="mt-1 text-sm text-slate-600">Listado real, ordenado por fecha de ingreso descendente.</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              {companies.length > 1 && (
                <label className="text-xs font-semibold text-slate-600">
                  <span className="mb-1.5 block">Empresa</span>
                  <select value={companyId} onChange={(event) => { setCompanyId(event.target.value); setParkingId(""); setPage(1); }} className="min-w-48 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]">
                    <option value="">Todas</option>
                    {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                  </select>
                </label>
              )}
              <label className="text-xs font-semibold text-slate-600">
                <span className="mb-1.5 block">Estacionamiento</span>
                <select value={parkingId} onChange={(event) => { setParkingId(event.target.value); setPage(1); }} className="min-w-48 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]">
                  <option value="">Todos</option>
                  {parkingOptions.map((parking) => <option key={parking.id} value={parking.id}>{parking.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                <span className="mb-1.5 block">Estado</span>
                <select value={status} onChange={(event) => { setStatus(event.target.value); setQuickFilter("all"); setPage(1); }} className="min-w-40 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]">
                  <option value="">Todos</option>
                  <option value="OPEN">Abierto</option>
                  <option value="PAID">Pagado</option>
                  <option value="CANCELLED">Anulado</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                <span className="mb-1.5 block">Buscar patente o ticket</span>
                <span className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600 focus-within:border-[#3150D8]">
                  <Search className="h-4 w-4 text-[#3150D8]" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Patente o N.º de ticket" className="w-56 max-w-full bg-transparent outline-none" />
                </span>
              </label>
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="text-slate-500"><b className="text-[#041E42]">{total}</b> resultados{loading ? " · cargando…" : ""}</p>
              {quickFilter !== "all" || status ? (
                <button type="button" onClick={() => { setQuickFilter("all"); setStatus(""); setPage(1); }} className="rounded-full bg-[#EEF4FF] px-3 py-1.5 text-xs font-semibold text-[#3150D8]">Mostrar todos</button>
              ) : null}
            </div>
            {error ? <p className="mb-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
            <SpreadsheetTable columns={columns} rows={tableRows} rowHref={(row) => `/operacion/${row.id}`} storageKey="operacion-tickets" emptyMessage={loading ? "Cargando…" : "No hay estadías que coincidan con estos filtros."} />
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
                <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-full border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40">Anterior</button>
                <span>Página {page} de {totalPages}</span>
                <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="rounded-full border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40">Siguiente</button>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
          <p className="font-semibold text-[#041E42]">Nota de alcance</p>
          <p className="mt-2">Datos reales de estadías (tabla parking_stays), acotados a las empresas y estacionamientos autorizados para tu sesión. No existe todavía un modelo real de incidencias en parking_stays, por eso ese indicador no se muestra (no se fabrica un dato ficticio).</p>
        </div>
      </div>
    </AppShell>
  );
}
