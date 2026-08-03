"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, X } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import EstacionamientoResumen from "./EstacionamientoResumen";
import EstacionamientosAdminTable from "./EstacionamientosAdminTable";
import { filterParkings, STATE_LABELS, TYPE_LABELS } from "@/lib/estacionamientos.mjs";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

export default function EstacionamientosAdminClient({ initialParkings = [], initialCompanies = [], initialType = "ALL" }) {
  const [parkings, setParkings] = useState(initialParkings);
  const [companyRecords, setCompanyRecords] = useState(initialCompanies);
  const [loading, setLoading] = useState(initialParkings.length === 0);
  const [loadError, setLoadError] = useState("");
  const [filters, setFilters] = useState({ busqueda: "", estado: "ALL", tipo: initialType, empresa: "ALL" });
  useEffect(() => {
    let active = true;
    authenticatedFetch("/api/estacionamientos", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "No fue posible obtener los estacionamientos.");
        if (active && Array.isArray(body.data)) {
          setParkings(body.data);
          setLoadError("");
        }
      })
      .catch((error) => { if (active) setLoadError(initialParkings.length ? `${error.message} Se conservan los últimos datos disponibles.` : error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [initialParkings.length]);
  useEffect(() => {
    let active = true;
    authenticatedFetch("/api/empresas", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => { if (active && Array.isArray(body?.data)) setCompanyRecords(body.data); })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  const companies = useMemo(() => [...new Map(parkings.map((item) => [item.companyId, item.companyName])).entries()], [parkings]);
  const results = useMemo(() => filterParkings(parkings, {
    search: filters.busqueda,
    status: filters.estado,
    type: filters.tipo,
    companyId: filters.empresa,
  }), [filters, parkings]);
  const totals = parkings.reduce((acc, item) => ({ capacity: acc.capacity + item.metrics.capacity, occupied: acc.occupied + item.metrics.occupied, available: acc.available + item.metrics.available }), { capacity: 0, occupied: 0, available: 0 });
  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const clearFilters = () => setFilters({ busqueda: "", estado: "ALL", tipo: "ALL", empresa: "ALL" });

  return <AppShell title="Estacionamientos" description="Administración de instalaciones, sectores y capacidad"><div className="space-y-6">
    <PageHeader title="Estacionamientos" description="Administra instalaciones, sectores y capacidad operacional." actions={[
      <Link key="nuevo" href="/estacionamientos/nuevo" className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1E5EFF]"><Plus className="h-4 w-4" /> Crear estacionamiento</Link>,
    ]} />
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <EstacionamientoResumen title="Estacionamientos" value={parkings.length} description="Instalaciones registradas" tone="info" />
      <EstacionamientoResumen title="Capacidad activa" value={totals.capacity} description="Unidades en sectores activos" tone="neutral" />
      <EstacionamientoResumen title="Ocupadas" value={totals.occupied} description="Unidades ocupadas" tone="warning" />
      <EstacionamientoResumen title="Disponibles" value={totals.available} description="Unidades disponibles" tone="positive" />
    </section>
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        <label className="flex flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"><Search className="h-4 w-4 text-[#3150D8]" /><input value={filters.busqueda} onChange={(e) => setFilter("busqueda", e.target.value)} placeholder="Buscar por código, nombre, empresa, dirección o ciudad" className="min-w-0 flex-1 bg-transparent outline-none" /></label>
        <Filter label="Estado" value={filters.estado} onChange={(value) => setFilter("estado", value)} entries={Object.entries(STATE_LABELS)} />
        <Filter label="Tipo" value={filters.tipo} onChange={(value) => setFilter("tipo", value)} entries={Object.entries(TYPE_LABELS)} />
        <Filter label="Empresa" value={filters.empresa} onChange={(value) => setFilter("empresa", value)} entries={companies} />
        <button onClick={clearFilters} className="inline-flex items-center justify-center gap-1 rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:text-[#3150D8]"><X className="h-4 w-4" /> Limpiar</button>
      </div>
      <EstacionamientosAdminTable results={results} companies={companyRecords} />
      {loading ? <p role="status" className="mt-3 text-xs text-slate-500">Sincronizando información en segundo plano...</p> : null}
      {loadError ? <p role="status" className="mt-3 text-xs text-amber-700">{loadError}</p> : null}
    </section>
  </div></AppShell>;
}

function Filter({ label, value, onChange, entries }) {
  return <label className="text-xs font-medium text-slate-500"><span className="mb-1 block">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="min-w-40 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"><option value="ALL">Todos</option>{entries.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
}
