"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import EmpresaResumen from "@/components/empresas/EmpresaResumen";
import EmpresasGrid from "@/components/empresas/EmpresasGrid";
import { getEmpresasDemo, searchEmpresas, getResumenEmpresas, formatearRut } from "@/data/empresas.mjs";

const empresas = getEmpresasDemo();
const estados = ["Todos", "active", "inactive", "onboarding"];
const tipos = ["Todos", "client", "operator", "administrator", "partner", "supplier"];
const ciudades = ["Todos", ...new Set(empresas.map((empresa) => empresa.ciudad))];
const estacionamientos = ["Todos", "con", "sin"];

function labelEstado(estado) {
  const labels = {
    active: "Activa",
    inactive: "Inactiva",
    onboarding: "En implementación",
  };

  return labels[estado] ?? estado;
}

function labelTipo(tipo) {
  const labels = {
    client: "Cliente",
    operator: "Operador",
    administrator: "Administrador",
    partner: "Aliado",
    supplier: "Proveedor",
  };

  return labels[tipo] ?? tipo;
}

export default function EmpresasPage() {
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("Todos");
  const [tipo, setTipo] = useState("Todos");
  const [ciudad, setCiudad] = useState("Todos");
  const [conEstacionamientos, setConEstacionamientos] = useState("Todos");

  const resultados = useMemo(() => {
    const base = searchEmpresas(busqueda);

    return base.filter((empresa) => {
      const byEstado = estado === "Todos" || empresa.estado === estado;
      const byTipo = tipo === "Todos" || empresa.tipoRelacion === tipo;
      const byCiudad = ciudad === "Todos" || empresa.ciudad === ciudad;
      const byParking = conEstacionamientos === "Todos" || (conEstacionamientos === "con" ? empresa.estacionamientos.length > 0 : empresa.estacionamientos.length === 0);
      return byEstado && byTipo && byCiudad && byParking;
    });
  }, [busqueda, estado, tipo, ciudad, conEstacionamientos]);

  const resumen = getResumenEmpresas();

  return (
    <AppShell title="Empresas" description="Administración de organizaciones vinculadas a ParkFacil">
      <div className="space-y-6">
        <PageHeader
          title="Empresas"
          description="Vista de referencia para la administración de organizaciones vinculadas a ParkFacil, con datos demostrativos y estructura preparada para evolución comercial."
          actions={[
            <button key="nueva" className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1E5EFF]">
              <Plus className="h-4 w-4" />
              Nueva empresa
            </button>,
          ]}
        />

        <section className="grid gap-4 md:grid-cols-2 min-[1366px]:grid-cols-3 min-[1600px]:grid-cols-5">
          <EmpresaResumen title="Total de empresas" value={resumen.total} description="Datos de referencia" tone="info" />
          <EmpresaResumen title="Activas" value={resumen.active} description="Operan actualmente" tone="positive" />
          <EmpresaResumen title="Inactivas" value={resumen.inactive} description="Sin actividad actual" tone="warning" />
          <EmpresaResumen title="En implementación" value={resumen.onboarding} description="En proceso de incorporación" tone="neutral" />
          <EmpresaResumen title="Con estacionamientos" value={resumen.conEstacionamientos} description="Asociaciones de referencia" tone="warning" />
        </section>

        <section className="w-full rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-[#041E42]">Catálogo empresarial</h3>
              <p className="mt-2 text-sm text-slate-600">Listado visual preparado para la gestión de organizaciones y su relación con estacionamientos.</p>
            </div>
            <StatusBadge variant="warning">Demostrativo</StatusBadge>
          </div>

          <div className="mt-6 space-y-4 overflow-hidden">
            <label className="flex min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              <Search className="h-4 w-4 text-[#3150D8]" />
              <input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar por razón social, fantasía, RUT, contacto, correo o ciudad" className="min-w-0 w-full bg-transparent outline-none" />
            </label>

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 min-[1366px]:grid-cols-4">
              <label className="min-w-0 space-y-2 text-sm text-slate-600">
                <span>Estado</span>
                <select value={estado} onChange={(event) => setEstado(event.target.value)} className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  {estados.map((item) => <option key={item} value={item}>{item === "Todos" ? item : labelEstado(item)}</option>)}
                </select>
              </label>
              <label className="min-w-0 space-y-2 text-sm text-slate-600">
                <span>Relación</span>
                <select value={tipo} onChange={(event) => setTipo(event.target.value)} className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  {tipos.map((item) => <option key={item} value={item}>{item === "Todos" ? item : labelTipo(item)}</option>)}
                </select>
              </label>
              <label className="min-w-0 space-y-2 text-sm text-slate-600">
                <span>Ciudad</span>
                <select value={ciudad} onChange={(event) => setCiudad(event.target.value)} className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  {ciudades.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="min-w-0 space-y-2 text-sm text-slate-600">
                <span>Estacionamientos</span>
                <select value={conEstacionamientos} onChange={(event) => setConEstacionamientos(event.target.value)} className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  {estacionamientos.map((item) => <option key={item} value={item}>{item === "Todos" ? item : item === "con" ? "Con asociados" : "Sin asociados"}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-6 w-full">
            {resultados.length > 0 ? (
              <EmpresasGrid empresas={resultados} />
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
                No hay empresas que coincidan con los filtros aplicados.
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
