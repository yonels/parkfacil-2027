"use client";

import { useMemo, useState } from "react";
import { Search, Plus, Building2, CarFront } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import EstacionamientoResumen from "@/components/estacionamientos/EstacionamientoResumen";
import EstacionamientosGrid from "@/components/estacionamientos/EstacionamientosGrid";
import { getEstacionamientosDemo } from "@/data/estacionamientos.mjs";

const estacionamientos = getEstacionamientosDemo();

const estados = ["Todos", "Activo", "Inactivo", "Mantenimiento"];

export default function EstacionamientosPage() {
  const [filtro, setFiltro] = useState("Todos");
  const [busqueda, setBusqueda] = useState("");

  const resultados = useMemo(() => {
    const query = busqueda.toLowerCase();

    return estacionamientos.filter((item) => {
      const matchesState = filtro === "Todos" || item.estado === filtro;
      const matchesQuery =
        item.nombre.toLowerCase().includes(query) ||
        item.codigo.toLowerCase().includes(query) ||
        item.direccion.toLowerCase().includes(query) ||
        item.ciudad.toLowerCase().includes(query);

      return matchesState && matchesQuery;
    });
  }, [busqueda, filtro]);

  const totalCapacity = estacionamientos.reduce((sum, item) => sum + item.capacidad, 0);
  const activos = estacionamientos.filter((item) => item.estado === "Activo").length;
  const inactivos = estacionamientos.filter((item) => item.estado === "Inactivo").length;

  return (
    <AppShell title="Estacionamientos" description="Administración visual de instalaciones">
      <div className="space-y-6">
        <PageHeader
          title="Estacionamientos"
          description="Vista de referencia para la administración de instalaciones, con datos demostrativos y estructura visual preparada para evolución operativa."
          actions={[
            <button key="nuevo" className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1E5EFF]">
              <Plus className="h-4 w-4" />
              Nuevo estacionamiento
            </button>,
          ]}
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <EstacionamientoResumen title="Total de estacionamientos" value={estacionamientos.length} description="Datos de referencia demostrativos" tone="info" />
          <EstacionamientoResumen title="Activos" value={activos} description="Instalaciones operativas" tone="positive" />
          <EstacionamientoResumen title="Inactivos" value={inactivos} description="Instalaciones sin actividad" tone="warning" />
          <EstacionamientoResumen title="Capacidad total" value={totalCapacity} description="Unidades de plaza demostrativas" tone="neutral" />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-[#041E42]">Catálogo de estacionamientos</h3>
              <p className="mt-2 text-sm text-slate-600">Listado visual preparado para futuras operaciones reales.</p>
            </div>
            <StatusBadge variant="warning">Demostrativo</StatusBadge>
          </div>

          <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="flex flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              <Search className="h-4 w-4 text-[#3150D8]" />
              <input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar por nombre, código o ubicación" className="w-full bg-transparent outline-none" />
            </label>
            <div className="flex flex-wrap gap-2">
              {estados.map((estado) => (
                <button key={estado} onClick={() => setFiltro(estado)} className={`rounded-full px-3 py-2 text-sm font-medium transition ${filtro === estado ? "bg-[#3150D8] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {estado}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {resultados.length > 0 ? (
              <EstacionamientosGrid estacionamientos={resultados} />
            ) : (
              <div className="md:col-span-2 xl:col-span-3 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
                No hay estacionamientos que coincidan con los filtros aplicados.
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
