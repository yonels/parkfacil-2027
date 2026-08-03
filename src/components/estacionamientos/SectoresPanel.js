"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Search } from "lucide-react";
import { filterSectores } from "@/data/estacionamientos.mjs";
import { getSectorLocation, STATE_LABELS, TYPE_LABELS } from "@/lib/estacionamientos.mjs";
import EstadoEstacionamientoBadge from "./EstadoEstacionamientoBadge";
import TipoEstacionamientoBadge from "./TipoEstacionamientoBadge";
import SectorCapacity from "./SectorCapacity";

export default function SectoresPanel({ parking }) {
  const [filters, setFilters] = useState({ busqueda: "", estado: "ALL", tipo: "ALL" });
  const [message, setMessage] = useState("");
  const sectors = useMemo(() => filterSectores(parking.sectors, filters), [parking.sectors, filters]);
  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  async function toggleSector(sector) {
    setMessage("");
    try {
      const response = await fetch(`/api/estacionamientos/${parking.code}/sectores/${sector.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...sector, status: sector.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "No fue posible cambiar el estado.");
      window.location.reload();
    } catch (error) {
      setMessage(error.message);
    }
  }

  return <section id="sectores" className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-semibold text-[#041E42]">Sectores</h2><p className="mt-1 text-sm text-slate-600">Capacidad y ubicación operacional por sector.</p></div><Link href={`/estacionamientos/${parking.code}/sectores/nuevo`} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Crear sector</Link></div>
    <div className="mt-5 grid gap-3 md:grid-cols-[1fr_180px_180px]"><label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"><Search className="h-4 w-4 text-[#3150D8]" /><input value={filters.busqueda} onChange={(e) => setFilter("busqueda", e.target.value)} placeholder="Buscar sector o ubicación" className="w-full bg-transparent text-sm outline-none" /></label><Select value={filters.tipo} onChange={(value) => setFilter("tipo", value)} options={TYPE_LABELS} /><Select value={filters.estado} onChange={(value) => setFilter("estado", value)} options={STATE_LABELS} /></div>
    {message && <p role="alert" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{message}</p>}
    <div className="mt-5 space-y-4">{sectors.map((sector) => <article key={sector.id} className="rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-[#3150D8]">{sector.code}</span><EstadoEstacionamientoBadge status={sector.status} /><TipoEstacionamientoBadge type={sector.type} /></div><h3 className="mt-2 text-lg font-semibold text-[#041E42]">{sector.name}</h3><p className="mt-1 text-sm text-slate-600">{getSectorLocation(sector) || "Ubicación no informada"}</p>{sector.type === "ON_STREET" && <p className="mt-1 text-xs text-slate-500">Sin geometría georreferenciada; se muestra el tramo declarado.</p>}{sector.type === "OFF_STREET" && <p className="mt-1 text-xs text-slate-500">{sector.locationDescription}</p>}</div><div className="flex gap-2"><Link href={`/estacionamientos/${parking.code}/sectores/${sector.id}/editar`} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold"><Pencil className="h-3.5 w-3.5" /> Modificar sector</Link><button onClick={() => toggleSector(sector)} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">{sector.status === "ACTIVE" ? "Modificar: desactivar" : "Modificar: activar"}</button></div></div>
      <div className="mt-4"><SectorCapacity sector={sector} /></div>
    </article>)}</div>
    {sectors.length === 0 && <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">{parking.sectors.length === 0 ? <>Sin sectores configurados. <Link href={`/estacionamientos/${parking.code}/sectores/nuevo`} className="font-semibold text-[#3150D8]">Crear primer sector</Link></> : "No se encontraron sectores con los filtros seleccionados."}</div>}
  </section>;
}

function Select({ value, onChange, options }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="ALL">Todos</option>{Object.entries(options).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>;
}
