"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import UsuarioResumen from "@/components/usuarios/UsuarioResumen";
import UsuariosGrid from "@/components/usuarios/UsuariosGrid";
import { getUsuariosDemo, getResumenUsuarios, searchUsuarios, getPerfilLabel } from "@/data/usuarios.mjs";
import { getEmpresasDemo } from "@/data/empresas.mjs";
import { getEstacionamientosDemo } from "@/data/estacionamientos.mjs";

const usuarios = getUsuariosDemo();
const empresas = getEmpresasDemo();
const estacionamientos = getEstacionamientosDemo();
const estados = ["Todos", "active", "inactive", "pending"];
const perfiles = ["Todos", "platform_admin", "organization_admin", "company_admin", "parking_manager", "operator", "cashier", "auditor", "support", "viewer"];
const multiples = ["Todos", "con", "sin"];

function labelEstado(estado) {
  const labels = {
    active: "Activo",
    inactive: "Inactivo",
    pending: "Pendiente",
  };

  return labels[estado] ?? estado;
}

export default function UsuariosPage() {
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("Todos");
  const [perfil, setPerfil] = useState("Todos");
  const [empresaId, setEmpresaId] = useState("Todos");
  const [estacionamientoId, setEstacionamientoId] = useState("Todos");
  const [multiple, setMultiple] = useState("Todos");

  const resultados = useMemo(() => {
    const base = searchUsuarios(busqueda);

    return base.filter((usuario) => {
      const byEstado = estado === "Todos" || usuario.estado === estado;
      const byPerfil = perfil === "Todos" || usuario.perfilPrincipal === perfil;
      const byEmpresa = empresaId === "Todos" || usuario.empresaId === empresaId;
      const byParking = estacionamientoId === "Todos" || usuario.estacionamientos.includes(estacionamientoId);
      const byMultiple = multiple === "Todos" || (multiple === "con" ? usuario.estacionamientos.length > 1 : usuario.estacionamientos.length <= 1);
      return byEstado && byPerfil && byEmpresa && byParking && byMultiple;
    });
  }, [busqueda, estado, perfil, empresaId, estacionamientoId, multiple]);

  const resumen = getResumenUsuarios();

  return (
    <AppShell title="Usuarios" description="Administración visual de personas con acceso a ParkFacil">
      <div className="space-y-6">
        <PageHeader
          title="Usuarios"
          description="Vista de referencia para la administración de personas con acceso a ParkFacil 2027, con datos demostrativos y estructura preparada para evolución de permisos."
          actions={[
            <button key="nuevo" className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1E5EFF]">
              <Plus className="h-4 w-4" />
              Nuevo usuario
            </button>,
          ]}
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <UsuarioResumen title="Total de usuarios" value={resumen.total} description="Datos de referencia" tone="info" />
          <UsuarioResumen title="Activos" value={resumen.active} description="Usuarios habilitados" tone="positive" />
          <UsuarioResumen title="Inactivos" value={resumen.inactive} description="Sin acceso actual" tone="warning" />
          <UsuarioResumen title="Pendientes" value={resumen.pending} description="Por activar" tone="neutral" />
          <UsuarioResumen title="Múltiples estacionamientos" value={resumen.multiplesEstacionamientos} description="Con más de un acceso" tone="warning" />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-[#041E42]">Catálogo de usuarios</h3>
              <p className="mt-2 text-sm text-slate-600">Listado visual preparado para la administración de accesos y perfiles.</p>
            </div>
            <StatusBadge variant="warning">Demostrativo</StatusBadge>
          </div>

          <div className="mt-6 space-y-4">
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              <Search className="h-4 w-4 text-[#3150D8]" />
              <input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar por nombre, correo, teléfono, empresa o perfil" className="w-full bg-transparent outline-none" />
            </label>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <label className="space-y-2 text-sm text-slate-600">
                <span>Estado</span>
                <select value={estado} onChange={(event) => setEstado(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  {estados.map((item) => <option key={item} value={item}>{item === "Todos" ? item : labelEstado(item)}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span>Perfil</span>
                <select value={perfil} onChange={(event) => setPerfil(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  {perfiles.map((item) => <option key={item} value={item}>{item === "Todos" ? item : getPerfilLabel(item)}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span>Empresa</span>
                <select value={empresaId} onChange={(event) => setEmpresaId(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  <option value="Todos">Todos</option>
                  {empresas.map((item) => <option key={item.id} value={item.id}>{item.nombreFantasia}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span>Estacionamiento</span>
                <select value={estacionamientoId} onChange={(event) => setEstacionamientoId(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  <option value="Todos">Todos</option>
                  {estacionamientos.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span>Múltiples</span>
                <select value={multiple} onChange={(event) => setMultiple(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  {multiples.map((item) => <option key={item} value={item}>{item === "Todos" ? item : item === "con" ? "Con múltiples" : "Sin múltiples"}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {resultados.length > 0 ? (
              <UsuariosGrid usuarios={resultados} />
            ) : (
              <div className="md:col-span-2 xl:col-span-3 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
                No hay usuarios que coincidan con los filtros aplicados.
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
