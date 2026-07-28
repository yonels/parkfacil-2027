"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpDown, Eye, Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import UsuarioResumen from "@/components/usuarios/UsuarioResumen";
import { getUsuariosDemo, getPerfilLabel } from "@/data/usuarios.mjs";
import { getEmpresasDemo } from "@/data/empresas.mjs";
import { getEstacionamientosDemo } from "@/data/estacionamientos.mjs";

const usuariosIniciales = getUsuariosDemo();
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
  const [usuarios, setUsuarios] = useState(() => usuariosIniciales.map((usuario) => ({ ...usuario, estacionamientos: [...usuario.estacionamientos] })));
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("Todos");
  const [perfil, setPerfil] = useState("Todos");
  const [empresaId, setEmpresaId] = useState("Todos");
  const [estacionamientoId, setEstacionamientoId] = useState("Todos");
  const [multiple, setMultiple] = useState("Todos");
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [sort, setSort] = useState({ key: "nombreCompleto", direction: "asc" });

  const resultados = useMemo(() => {
    const normalized = busqueda.toLowerCase();
    return usuarios.filter((usuario) => {
      const empresa = empresas.find((item) => item.id === usuario.empresaId);
      const bySearch = [usuario.nombreCompleto, usuario.correo, usuario.telefono, empresa?.nombreFantasia ?? "", getPerfilLabel(usuario.perfilPrincipal)]
        .some((value) => value.toLowerCase().includes(normalized));
      const byEstado = estado === "Todos" || usuario.estado === estado;
      const byPerfil = perfil === "Todos" || usuario.perfilPrincipal === perfil;
      const byEmpresa = empresaId === "Todos" || usuario.empresaId === empresaId;
      const byParking = estacionamientoId === "Todos" || usuario.estacionamientos.includes(estacionamientoId);
      const byMultiple = multiple === "Todos" || (multiple === "con" ? usuario.estacionamientos.length > 1 : usuario.estacionamientos.length <= 1);
      return bySearch && byEstado && byPerfil && byEmpresa && byParking && byMultiple;
    }).sort((left, right) => {
      const leftValue = sort.key === "estacionamientos" ? left.estacionamientos.length : left[sort.key] ?? "";
      const rightValue = sort.key === "estacionamientos" ? right.estacionamientos.length : right[sort.key] ?? "";
      const comparison = String(leftValue).localeCompare(String(rightValue), "es", { numeric: true });
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [busqueda, empresaId, estado, estacionamientoId, multiple, perfil, sort, usuarios]);

  const resumen = useMemo(() => ({
    total: usuarios.length,
    active: usuarios.filter((item) => item.estado === "active").length,
    inactive: usuarios.filter((item) => item.estado === "inactive").length,
    pending: usuarios.filter((item) => item.estado === "pending").length,
    multiplesEstacionamientos: usuarios.filter((item) => item.estacionamientos.length > 1).length,
  }), [usuarios]);

  const orderBy = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  const beginEdit = (usuario) => {
    setEditingId(usuario.id);
    setDraft({ ...usuario, estacionamientos: [...usuario.estacionamientos] });
  };
  const saveEdit = () => {
    setUsuarios((current) => current.map((usuario) => usuario.id === editingId ? draft : usuario));
    setEditingId(null);
    setDraft(null);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

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

          <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-300 bg-white shadow-sm">
            {resultados.length > 0 ? (
              <table className="w-full min-w-[1320px] border-collapse text-left text-sm">
                <thead className="bg-[#041E42] text-[11px] uppercase tracking-[0.08em] text-white">
                  <tr>
                    {[
                      ["nombreCompleto", "Nombre"], ["correo", "Correo"], ["telefono", "Teléfono"], ["empresaId", "Empresa"],
                      ["perfilPrincipal", "Perfil"], ["estado", "Estado"], ["estacionamientos", "Estacionamientos"], ["ultimoAcceso", "Último acceso"],
                    ].map(([key, label]) => <th key={key} className="border-r border-white/10 p-0"><button type="button" onClick={() => orderBy(key)} className="flex w-full items-center justify-between gap-2 px-4 py-3.5 text-left font-bold hover:bg-white/10">{label}<ArrowUpDown className={`h-3.5 w-3.5 ${sort.key === key ? "text-cyan-200" : "text-slate-500"}`} /></button></th>)}
                    <th className="px-4 py-3.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {resultados.map((usuario) => {
                    const isEditing = editingId === usuario.id;
                    const row = isEditing ? draft : usuario;
                    const empresa = empresas.find((item) => item.id === row.empresaId);
                    const parkingNames = row.estacionamientos.map((id) => estacionamientos.find((item) => item.id === id)?.nombre ?? id).join(", ");
                    const inputClass = "w-full min-w-32 rounded-lg border border-[#3150D8] bg-white px-2 py-2 text-sm text-[#041E42] outline-none ring-2 ring-blue-100";
                    return (
                      <tr key={usuario.id} className={`border-b border-slate-200 last:border-b-0 ${isEditing ? "bg-blue-50" : "even:bg-slate-50 hover:bg-[#FFF8E1]"}`}>
                        <td className="border-r border-slate-200 px-3 py-2.5">{isEditing ? <input value={row.nombreCompleto} onChange={(event) => setDraft((current) => ({ ...current, nombreCompleto: event.target.value }))} className={inputClass} /> : <span className="font-bold text-[#041E42]">{row.nombreCompleto}</span>}</td>
                        <td className="border-r border-slate-200 px-3 py-2.5">{isEditing ? <input type="email" value={row.correo} onChange={(event) => setDraft((current) => ({ ...current, correo: event.target.value }))} className={inputClass} /> : row.correo}</td>
                        <td className="border-r border-slate-200 px-3 py-2.5">{isEditing ? <input value={row.telefono} onChange={(event) => setDraft((current) => ({ ...current, telefono: event.target.value }))} className={inputClass} /> : row.telefono}</td>
                        <td className="border-r border-slate-200 px-3 py-2.5">{isEditing ? <select value={row.empresaId ?? ""} onChange={(event) => setDraft((current) => ({ ...current, empresaId: event.target.value || null }))} className={inputClass}><option value="">Sin empresa</option>{empresas.map((item) => <option key={item.id} value={item.id}>{item.nombreFantasia}</option>)}</select> : empresa?.nombreFantasia ?? "Sin empresa"}</td>
                        <td className="border-r border-slate-200 px-3 py-2.5">{isEditing ? <select value={row.perfilPrincipal} onChange={(event) => setDraft((current) => ({ ...current, perfilPrincipal: event.target.value }))} className={inputClass}>{perfiles.filter((item) => item !== "Todos").map((item) => <option key={item} value={item}>{getPerfilLabel(item)}</option>)}</select> : getPerfilLabel(row.perfilPrincipal)}</td>
                        <td className="border-r border-slate-200 px-3 py-2.5">{isEditing ? <select value={row.estado} onChange={(event) => setDraft((current) => ({ ...current, estado: event.target.value }))} className={inputClass}>{estados.filter((item) => item !== "Todos").map((item) => <option key={item} value={item}>{labelEstado(item)}</option>)}</select> : <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${row.estado === "active" ? "bg-emerald-50 text-emerald-700" : row.estado === "inactive" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{labelEstado(row.estado)}</span>}</td>
                        <td className="max-w-56 border-r border-slate-200 px-3 py-2.5">{isEditing ? <select multiple value={row.estacionamientos} onChange={(event) => setDraft((current) => ({ ...current, estacionamientos: Array.from(event.target.selectedOptions, (option) => option.value) }))} className={`${inputClass} min-h-20`}>{estacionamientos.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select> : <span className="line-clamp-2" title={parkingNames}>{parkingNames || "Sin asignación"}</span>}</td>
                        <td className="border-r border-slate-200 px-3 py-2.5">{row.ultimoAcceso}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end gap-1.5">
                            {isEditing ? <>
                              <button type="button" onClick={saveEdit} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-2 text-xs font-bold text-white"><Save className="h-3.5 w-3.5" />Guardar</button>
                              <button type="button" onClick={cancelEdit} className="grid h-8 w-8 place-items-center rounded-lg bg-slate-200 text-slate-600" aria-label="Cancelar edición"><X className="h-3.5 w-3.5" /></button>
                            </> : <>
                              <Link href={`/usuarios/${usuario.id}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-[#3150D8]"><Eye className="h-3.5 w-3.5" />Ver</Link>
                              <button type="button" onClick={() => beginEdit(usuario)} className="inline-flex items-center gap-1 rounded-lg bg-[#EEF4FF] px-2.5 py-2 text-xs font-bold text-[#3150D8]"><Pencil className="h-3.5 w-3.5" />Editar</button>
                              <button type="button" onClick={() => setUsuarios((current) => current.filter((item) => item.id !== usuario.id))} className="grid h-8 w-8 place-items-center rounded-lg bg-rose-50 text-rose-700" aria-label={`Eliminar ${usuario.nombreCompleto}`}><Trash2 className="h-3.5 w-3.5" /></button>
                            </>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
                No hay usuarios que coincidan con los filtros aplicados.
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
