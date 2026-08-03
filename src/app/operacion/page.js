"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import OperacionResumen from "@/components/operacion/OperacionResumen";
import SpreadsheetTable from "@/components/ui/SpreadsheetTable";
import {
  formatFechaHora,
  getEstadoTicketLabel,
  getOperacionesDemo,
  getResumenOperativo,
  getTipoMovimientoLabel,
  resolveEmpresa,
  resolveEstacionamiento,
} from "@/data/operacion.mjs";

export default function OperacionPage() {
  const operaciones = getOperacionesDemo();
  const resumen = getResumenOperativo();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("Todas");
  const columns = [
    { key: "ticket", label: "Ticket" },
    { key: "fecha", label: "Fecha y hora" },
    { key: "patente", label: "Patente" },
    { key: "empresa", label: "Empresa" },
    { key: "estacionamiento", label: "Estacionamiento" },
    { key: "acceso", label: "Acceso" },
    { key: "movimiento", label: "Movimiento" },
    { key: "estado", label: "Estado" },
    { key: "origen", label: "Origen" },
  ];
  const companies = useMemo(() => ["Todas", ...new Set(operaciones.map(resolveEmpresa))], [operaciones]);
  const filteredOperations = useMemo(() => operaciones.filter((operacion) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "entries" && ["entry", "manual_entry"].includes(operacion.tipoMovimiento)) ||
      (filter === "exits" && ["exit", "manual_exit"].includes(operacion.tipoMovimiento)) ||
      (filter === "open" && operacion.estadoTicket === "open") ||
      (filter === "incidents" && operacion.incidencias.length > 0);
    const normalized = query.trim().toLocaleLowerCase("es");
    const operationCompany = resolveEmpresa(operacion);
    const matchesCompany = company === "Todas" || operationCompany === company;
    const matchesQuery = [operacion.ticketNumero, operacion.patente, operationCompany, resolveEstacionamiento(operacion), operacion.acceso]
      .some((value) => value.toLowerCase().includes(normalized));
    return matchesFilter && matchesCompany && matchesQuery;
  }), [company, filter, operaciones, query]);
  const rows = filteredOperations.map((operacion) => ({
    id: operacion.id,
    ticket: operacion.ticketNumero,
    fecha: formatFechaHora(operacion.fechaHora),
    patente: operacion.patente,
    empresa: resolveEmpresa(operacion),
    estacionamiento: resolveEstacionamiento(operacion),
    acceso: operacion.acceso,
    movimiento: getTipoMovimientoLabel(operacion.tipoMovimiento),
    estado: getEstadoTicketLabel(operacion.estadoTicket),
    origen: operacion.origen,
  }));

  return (
    <AppShell title="Operación diaria" description="Vista base de operación diaria para tickets y movimientos">
      <div className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#5271E8] bg-[#3150D8] p-6 text-white shadow-sm">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100">Operación diaria</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Seguimiento de tickets y movimientos</h1>
            <p className="mt-2 max-w-2xl text-sm text-blue-100">Vista base visual para operaciones de ingreso, salida y control de incidencias.</p>
          </div>
          <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:flex-col sm:items-end">
            <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white px-4 py-3 text-sm font-semibold text-[#3150D8] transition hover:bg-blue-50">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Link>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-4">
          <OperacionResumen title="Ingresos del día" value={resumen.ingresosDia} description="Movimientos de ingreso" tone="info" selected={filter === "entries"} onClick={() => { setFilter("entries"); window.setTimeout(() => document.getElementById("movimientos-operacion")?.scrollIntoView({ behavior: "smooth" }), 50); }} />
          <OperacionResumen title="Salidas del día" value={resumen.salidasDia} description="Movimientos de salida" tone="positive" selected={filter === "exits"} onClick={() => { setFilter("exits"); window.setTimeout(() => document.getElementById("movimientos-operacion")?.scrollIntoView({ behavior: "smooth" }), 50); }} />
          <OperacionResumen title="Tickets abiertos" value={resumen.ticketsAbiertos} description="En seguimiento" tone="warning" selected={filter === "open"} onClick={() => { setFilter("open"); window.setTimeout(() => document.getElementById("movimientos-operacion")?.scrollIntoView({ behavior: "smooth" }), 50); }} />
          <OperacionResumen title="Incidencias" value={resumen.ticketsObservados} description="Requieren revisión" tone="neutral" selected={filter === "incidents"} onClick={() => { setFilter("incidents"); window.setTimeout(() => document.getElementById("movimientos-operacion")?.scrollIntoView({ behavior: "smooth" }), 50); }} />
        </div>

        <div id="movimientos-operacion" className="scroll-mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-[#041E42]">Movimientos recientes</h2>
              <p className="mt-1 text-sm text-slate-600">Vista de referencia para monitoreo y auditoría.</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs font-semibold text-slate-600">
                <span className="mb-1.5 block">Empresa</span>
                <select value={company} onChange={(event) => setCompany(event.target.value)} className="min-w-56 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]">
                  {companies.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                <span className="mb-1.5 block">Buscar tickets</span>
                <span className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600 focus-within:border-[#3150D8]">
                  <Search className="h-4 w-4 text-[#3150D8]" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Empresa, ticket, patente o parking" className="w-72 max-w-full bg-transparent outline-none" />
                </span>
              </label>
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm"><p className="text-slate-500"><b className="text-[#041E42]">{rows.length}</b> resultados</p>{filter !== "all" ? <button type="button" onClick={() => setFilter("all")} className="rounded-full bg-[#EEF4FF] px-3 py-1.5 text-xs font-semibold text-[#3150D8]">Mostrar todos</button> : null}</div>
            <SpreadsheetTable columns={columns} rows={rows} rowHref={(row) => `/operacion/${row.id}`} storageKey="operacion-tickets" />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
          <p className="font-semibold text-[#041E42]">Nota de alcance</p>
          <p className="mt-2">Esta vista es exclusivamente visual y demo-data-driven, con contenido local para proyectar la estructura del módulo sin integrar procesos operativos reales.</p>
        </div>
      </div>
    </AppShell>
  );
}
