"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpDown, Check, Copy, Eye, GripVertical, KeyRound, Pencil, Plus, Save, Search, ShieldCheck, Trash2, UserRound, X } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import useReorderableColumns from "@/components/ui/useReorderableColumns";
import UsuarioResumen from "@/components/usuarios/UsuarioResumen";
import { getUsuariosDemo, getPerfilLabel, getUsuarioSearchValues, normalizeUserSearch } from "@/data/usuarios.mjs";
import { getEmpresasDemo } from "@/data/empresas.mjs";
import { getEstacionamientosDemo } from "@/data/estacionamientos.mjs";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { generateSecurePassword } from "@/lib/generateSecurePassword";

const usuariosIniciales = getUsuariosDemo();
const empresasIniciales = getEmpresasDemo();
const estacionamientosIniciales = getEstacionamientosDemo();
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
  const [empresas, setEmpresas] = useState(empresasIniciales);
  const [estacionamientos, setEstacionamientos] = useState(estacionamientosIniciales);
  const [dataSource, setDataSource] = useState("Cargando");
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("Todos");
  const [perfil, setPerfil] = useState("Todos");
  const [empresaId, setEmpresaId] = useState("Todos");
  const [estacionamientoId, setEstacionamientoId] = useState("Todos");
  const [multiple, setMultiple] = useState("Todos");
  const [canManageCredentials, setCanManageCredentials] = useState(false);
  const [canSetDirectPassword, setCanSetDirectPassword] = useState(false);
  const [temporaryCredentials, setTemporaryCredentials] = useState({});
  const [credentialLoadingId, setCredentialLoadingId] = useState(null);
  const [credentialError, setCredentialError] = useState("");
  const [copiedCredentialId, setCopiedCredentialId] = useState(null);
  const [passwordUser, setPasswordUser] = useState(null);
  const [passwordDraft, setPasswordDraft] = useState({ password: "", confirmation: "", mustChangePassword: true });
  const [passwordError, setPasswordError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [sort, setSort] = useState({ key: "nombreCompleto", direction: "asc" });
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createDraft, setCreateDraft] = useState({
    fullName: "",
    email: "",
    phone: "",
    role: "operator",
    companyId: "",
    parkingIds: [],
  });
  const tableColumns = useMemo(() => [
    { key: "nombreCompleto", label: "Nombre", sortable: true },
    { key: "correo", label: "Usuario", sortable: true },
    { key: "telefono", label: "Teléfono", sortable: true },
    { key: "empresaId", label: "Empresa", sortable: true },
    { key: "perfilPrincipal", label: "Perfil", sortable: true },
    { key: "estado", label: "Estado", sortable: true },
    { key: "estacionamientos", label: "Estacionamientos", sortable: true },
    { key: "ultimoAcceso", label: "Último acceso", sortable: true },
    ...(canManageCredentials ? [{ key: "credential", label: "Clave de acceso", sortable: false }] : []),
  ], [canManageCredentials]);
  const { orderedColumns: orderedTableColumns, getHeaderProps } = useReorderableColumns(tableColumns, "usuarios-catalogo");

  const loadUsers = useCallback(async () => {
    const response = await authenticatedFetch("/api/usuarios", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "No fue posible cargar los usuarios.");
    setUsuarios((body.data || []).map((usuario) => ({ ...usuario, estacionamientos: usuario.estacionamientos || [] })));
    setEmpresas(body.companies || []);
    setEstacionamientos(body.parkings || []);
    setCanManageCredentials(Boolean(body.canManageCredentials));
    setCanSetDirectPassword(Boolean(body.canSetDirectPassword));
    setDataSource("Datos persistentes");
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      loadUsers().catch(() => { if (active) setDataSource("Demostrativo"); });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [loadUsers]);

  const openCreateModal = () => {
    setCreateError("");
    setCreateDraft((current) => ({
      ...current,
      fullName: "",
      email: "",
      phone: "",
      role: "operator",
      companyId: current.companyId || empresas[0]?.id || "",
      parkingIds: [],
    }));
    setCreateOpen(true);
  };

  const createCompanyParkings = useMemo(() => {
    return estacionamientos.filter((item) => !createDraft.companyId || item.empresaId === createDraft.companyId);
  }, [createDraft.companyId, estacionamientos]);

  const submitCreateUser = async (event) => {
    event.preventDefault();
    setCreateError("");
    setCreateLoading(true);
    try {
      const response = await authenticatedFetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createDraft),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible crear el usuario.");

      if (body.data?.id) {
        setUsuarios((current) => [
          { ...body.data, estacionamientos: body.data.estacionamientos || [] },
          ...current.filter((item) => item.id !== body.data.id),
        ]);
      } else {
        await loadUsers();
      }

      if (body.credential?.userId) {
        setTemporaryCredentials((current) => ({ ...current, [body.credential.userId]: body.credential }));
        window.alert(`Usuario creado: ${body.credential.username}\nClave temporal: ${body.credential.temporaryPassword}`);
      }
      setCreateOpen(false);
    } catch (error) {
      setCreateError(error.message);
    } finally {
      setCreateLoading(false);
    }
  };

  const resultados = useMemo(() => {
    const normalized = normalizeUserSearch(busqueda);
    return usuarios.filter((usuario) => {
      const bySearch = [...getUsuarioSearchValues(usuario), ...(usuario.searchValues || [])]
        .some((value) => normalizeUserSearch(value).includes(normalized));
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
  const updateSearch = (value) => {
    setBusqueda(value);
    if (value.trim()) {
      setEstado("Todos");
      setPerfil("Todos");
      setEmpresaId("Todos");
      setEstacionamientoId("Todos");
      setMultiple("Todos");
    }
  };

  const generateTemporaryCredential = async (usuario) => {
    const accepted = window.confirm(
      `Se reemplazará la clave actual de ${usuario.nombreCompleto}. ¿Deseas generar una nueva clave temporal?`,
    );
    if (!accepted) return;
    setCredentialError("");
    setCredentialLoadingId(usuario.id);
    try {
      const response = await authenticatedFetch(`/api/usuarios/${usuario.id}/credencial`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No fue posible generar la clave temporal.");
      setTemporaryCredentials((current) => ({ ...current, [usuario.id]: body.data }));
      setUsuarios((current) => current.map((item) => (
        item.id === usuario.id ? { ...item, debeCambiarClave: true } : item
      )));
    } catch (error) {
      setCredentialError(error.message);
    } finally {
      setCredentialLoadingId(null);
    }
  };

  const copyCredential = async (usuario) => {
    const credential = temporaryCredentials[usuario.id];
    if (!credential || !navigator.clipboard) return;
    await navigator.clipboard.writeText(`Usuario: ${credential.username}\n${credential.mustChangePassword ? "Clave temporal" : "Clave"}: ${credential.temporaryPassword}`);
    setCopiedCredentialId(usuario.id);
    window.setTimeout(() => setCopiedCredentialId(null), 2000);
  };

  const openPasswordModal = (usuario) => {
    setPasswordUser(usuario);
    setPasswordDraft({ password: "", confirmation: "", mustChangePassword: true });
    setPasswordError("");
  };

  const closePasswordModal = () => {
    if (credentialLoadingId) return;
    setPasswordUser(null);
    setPasswordError("");
  };

  const fillSecurePassword = () => {
    const password = generateSecurePassword();
    setPasswordDraft((current) => ({ ...current, password, confirmation: password }));
    setPasswordError("");
  };

  const submitDirectPassword = async (event) => {
    event.preventDefault();
    if (!passwordUser) return;
    if (passwordDraft.password !== passwordDraft.confirmation) {
      setPasswordError("Las claves no coinciden.");
      return;
    }
    setPasswordError("");
    setCredentialError("");
    setCredentialLoadingId(passwordUser.id);
    try {
      const response = await authenticatedFetch(`/api/usuarios/${passwordUser.id}/credencial`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordDraft.password, mustChangePassword: passwordDraft.mustChangePassword }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible cambiar la clave.");
      setTemporaryCredentials((current) => ({ ...current, [passwordUser.id]: body.data }));
      setUsuarios((current) => current.map((item) => (
        item.id === passwordUser.id ? { ...item, debeCambiarClave: body.data.mustChangePassword } : item
      )));
      setPasswordUser(null);
    } catch (error) {
      setPasswordError(error.message);
    } finally {
      setCredentialLoadingId(null);
    }
  };

  return (
    <AppShell title="Usuarios" description="Administración visual de personas con acceso a ParkFacil">
      <div className="space-y-6">
        <PageHeader
          title="Usuarios"
          description="Vista de referencia para la administración de personas con acceso a ParkFacil 2027, con datos demostrativos y estructura preparada para evolución de permisos."
          actions={[
            <button key="nuevo" type="button" onClick={openCreateModal} className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1E5EFF]">
              <Plus className="h-4 w-4" />
              Crear usuario
            </button>,
          ]}
        />

        <section className="grid gap-4 sm:grid-cols-2">
          <Link href="/usuarios/administradores" className="group flex items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#3150D8] hover:shadow-md">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#EEF4FF] text-[#3150D8]"><ShieldCheck className="h-5 w-5" /></span>
              <div>
                <h3 className="text-lg font-semibold text-[#041E42]">Administradores</h3>
                <p className="text-sm text-slate-600">Buscar y administrar acceso de administradores de empresa.</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-[#3150D8] transition group-hover:translate-x-0.5" />
          </Link>
          <Link href="/usuarios/operadores" className="group flex items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#3150D8] hover:shadow-md">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#EEF4FF] text-[#3150D8]"><UserRound className="h-5 w-5" /></span>
              <div>
                <h3 className="text-lg font-semibold text-[#041E42]">Operadores</h3>
                <p className="text-sm text-slate-600">Buscar y administrar acceso de operadores.</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-[#3150D8] transition group-hover:translate-x-0.5" />
          </Link>
        </section>

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
            <StatusBadge variant={dataSource === "Datos persistentes" ? "positive" : "warning"}>{dataSource}</StatusBadge>
          </div>

          <div className="mt-6 space-y-4">
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              <Search className="h-4 w-4 text-[#3150D8]" />
              <input value={busqueda} onChange={(event) => updateSearch(event.target.value)} placeholder="Buscar por persona, cargo, empresa, razón social, RUT, correo, perfil o estacionamiento" className="w-full bg-transparent outline-none" />
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

          {credentialError ? (
            <p role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {credentialError}
            </p>
          ) : null}

          <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-300 bg-white shadow-sm">
            {resultados.length > 0 ? (
              <table className={`w-full border-collapse text-left text-sm ${canManageCredentials ? "min-w-[1580px]" : "min-w-[1320px]"}`}>
                <thead className="bg-[#041E42] text-[11px] uppercase tracking-[0.08em] text-white">
                  <tr>
                    {orderedTableColumns.map((column) => {
                      const dragProps = getHeaderProps(column.key);
                      return (
                        <th
                          {...dragProps}
                          key={column.key}
                          className={`cursor-grab border-r border-white/10 p-0 active:cursor-grabbing ${dragProps.className}`}
                        >
                          {column.sortable ? (
                            <button type="button" onClick={() => orderBy(column.key)} className="flex w-full items-center justify-between gap-2 px-4 py-3.5 text-left font-bold hover:bg-white/10">
                              <span className="flex items-center gap-2">{column.label}<GripVertical className="h-3.5 w-3.5 text-slate-400" /></span>
                              <ArrowUpDown className={`h-3.5 w-3.5 ${sort.key === column.key ? "text-cyan-200" : "text-slate-500"}`} />
                            </button>
                          ) : (
                            <span className={`flex items-center gap-2 px-4 py-3.5 font-bold ${column.key === "actions" ? "justify-end" : ""}`}>
                              {column.label}<GripVertical className="h-3.5 w-3.5 text-slate-400" />
                            </span>
                          )}
                        </th>
                      );
                    })}
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
                    const dataCells = {
                      nombreCompleto: <td key="nombreCompleto" className="border-r border-slate-200 px-3 py-2.5">{isEditing ? <input value={row.nombreCompleto} onChange={(event) => setDraft((current) => ({ ...current, nombreCompleto: event.target.value }))} className={inputClass} /> : <span className="font-bold text-[#041E42]">{row.nombreCompleto}</span>}</td>,
                      correo: <td key="correo" className="border-r border-slate-200 px-3 py-2.5">{isEditing ? <input type="email" value={row.correo} onChange={(event) => setDraft((current) => ({ ...current, correo: event.target.value }))} className={inputClass} /> : row.correo}</td>,
                      telefono: <td key="telefono" className="border-r border-slate-200 px-3 py-2.5">{isEditing ? <input value={row.telefono} onChange={(event) => setDraft((current) => ({ ...current, telefono: event.target.value }))} className={inputClass} /> : row.telefono}</td>,
                      empresaId: <td key="empresaId" className="border-r border-slate-200 px-3 py-2.5">{isEditing ? <select value={row.empresaId ?? ""} onChange={(event) => setDraft((current) => ({ ...current, empresaId: event.target.value || null }))} className={inputClass}><option value="">Sin empresa</option>{empresas.map((item) => <option key={item.id} value={item.id}>{item.nombreFantasia}</option>)}</select> : empresa?.nombreFantasia ?? "Sin empresa"}</td>,
                      perfilPrincipal: <td key="perfilPrincipal" className="border-r border-slate-200 px-3 py-2.5">{isEditing ? <select value={row.perfilPrincipal} onChange={(event) => setDraft((current) => ({ ...current, perfilPrincipal: event.target.value }))} className={inputClass}>{perfiles.filter((item) => item !== "Todos").map((item) => <option key={item} value={item}>{getPerfilLabel(item)}</option>)}</select> : getPerfilLabel(row.perfilPrincipal)}</td>,
                      estado: <td key="estado" className="border-r border-slate-200 px-3 py-2.5">{isEditing ? <select value={row.estado} onChange={(event) => setDraft((current) => ({ ...current, estado: event.target.value }))} className={inputClass}>{estados.filter((item) => item !== "Todos").map((item) => <option key={item} value={item}>{labelEstado(item)}</option>)}</select> : <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${row.estado === "active" ? "bg-emerald-50 text-emerald-700" : row.estado === "inactive" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{labelEstado(row.estado)}</span>}</td>,
                      estacionamientos: <td key="estacionamientos" className="max-w-56 border-r border-slate-200 px-3 py-2.5">{isEditing ? <select multiple value={row.estacionamientos} onChange={(event) => setDraft((current) => ({ ...current, estacionamientos: Array.from(event.target.selectedOptions, (option) => option.value) }))} className={`${inputClass} min-h-20`}>{estacionamientos.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select> : <span className="line-clamp-2" title={parkingNames}>{parkingNames || "Sin asignación"}</span>}</td>,
                      ultimoAcceso: <td key="ultimoAcceso" className="border-r border-slate-200 px-3 py-2.5">{row.ultimoAcceso}</td>,
                      credential: (
                        <td key="credential" className="min-w-64 border-r border-slate-200 px-3 py-2.5">
                          {temporaryCredentials[usuario.id] ? (
                            <div className="space-y-2">
                              <code className="block rounded-lg bg-amber-50 px-2 py-1.5 text-xs font-bold text-amber-900">{temporaryCredentials[usuario.id].temporaryPassword}</code>
                              <button type="button" onClick={() => copyCredential(usuario)} className="inline-flex items-center gap-1 text-xs font-bold text-[#3150D8]">
                                {copiedCredentialId === usuario.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                {copiedCredentialId === usuario.id ? "Copiado" : "Copiar usuario y clave"}
                              </button>
                              {canSetDirectPassword ? <button type="button" onClick={() => openPasswordModal(usuario)} className="ml-3 inline-flex items-center gap-1 text-xs font-bold text-amber-800"><KeyRound className="h-3.5 w-3.5" />Cambiar clave</button> : null}
                              <p className="text-[10px] text-amber-700">Visible solamente durante esta sesión.</p>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              <p className="text-xs text-slate-500">{row.debeCambiarClave ? "Clave temporal pendiente de cambio" : "Clave protegida"}</p>
                              <button type="button" onClick={() => generateTemporaryCredential(usuario)} disabled={credentialLoadingId === usuario.id} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs font-bold text-amber-800 disabled:opacity-60">
                                <KeyRound className="h-3.5 w-3.5" />{credentialLoadingId === usuario.id ? "Generando..." : "Generar clave temporal"}
                              </button>
                              {canSetDirectPassword ? <button type="button" onClick={() => openPasswordModal(usuario)} className="ml-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-2.5 py-2 text-xs font-bold text-amber-800"><Pencil className="h-3.5 w-3.5" />Cambiar clave</button> : null}
                            </div>
                          )}
                        </td>
                      ),
                    };
                    return (
                      <tr key={usuario.id} className={`border-b border-slate-200 last:border-b-0 ${isEditing ? "bg-blue-50" : "even:bg-slate-50 hover:bg-[#FFF8E1]"}`}>
                        {orderedTableColumns.map((column) => dataCells[column.key])}
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end gap-1.5">
                            {isEditing ? <>
                              <button type="button" onClick={saveEdit} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-2 text-xs font-bold text-white"><Save className="h-3.5 w-3.5" />Modificar usuario</button>
                              <button type="button" onClick={cancelEdit} className="grid h-8 w-8 place-items-center rounded-lg bg-slate-200 text-slate-600" aria-label="Cancelar edición"><X className="h-3.5 w-3.5" /></button>
                            </> : <>
                              <Link href={`/usuarios/${usuario.id}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-[#3150D8]"><Eye className="h-3.5 w-3.5" />Ver</Link>
                              <button type="button" onClick={() => beginEdit(usuario)} className="inline-flex items-center gap-1 rounded-lg bg-[#EEF4FF] px-2.5 py-2 text-xs font-bold text-[#3150D8]"><Pencil className="h-3.5 w-3.5" />Modificar usuario</button>
                              <button type="button" onClick={() => setUsuarios((current) => current.filter((item) => item.id !== usuario.id))} className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-2 text-xs font-semibold text-rose-700" aria-label={`Eliminar ${usuario.nombreCompleto}`}><Trash2 className="h-3.5 w-3.5" /> Eliminar</button>
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

        {createOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#041E42]/50 p-4">
            <section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-semibold text-[#041E42]">Crear usuario</h3>
                <button type="button" onClick={() => setCreateOpen(false)} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cerrar</button>
              </div>
              <form onSubmit={submitCreateUser} className="mt-4 space-y-4">
                {createError ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{createError}</p> : null}
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-1.5 text-sm text-slate-700">
                    <span>Nombre completo</span>
                    <input value={createDraft.fullName} onChange={(event) => setCreateDraft((current) => ({ ...current, fullName: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[#3150D8]" required />
                  </label>
                  <label className="space-y-1.5 text-sm text-slate-700">
                    <span>Correo</span>
                    <input type="email" value={createDraft.email} onChange={(event) => setCreateDraft((current) => ({ ...current, email: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[#3150D8]" required />
                  </label>
                  <label className="space-y-1.5 text-sm text-slate-700">
                    <span>Telefono</span>
                    <input value={createDraft.phone} onChange={(event) => setCreateDraft((current) => ({ ...current, phone: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[#3150D8]" />
                  </label>
                  <label className="space-y-1.5 text-sm text-slate-700">
                    <span>Perfil principal</span>
                    <select value={createDraft.role} onChange={(event) => setCreateDraft((current) => ({ ...current, role: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[#3150D8]">
                      <option value="operator">Operador</option>
                      <option value="company_admin">Administrador de empresa</option>
                    </select>
                  </label>
                  <label className="space-y-1.5 text-sm text-slate-700 md:col-span-2">
                    <span>Empresa</span>
                    <select value={createDraft.companyId} onChange={(event) => setCreateDraft((current) => ({ ...current, companyId: event.target.value, parkingIds: [] }))} className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[#3150D8]" required>
                      <option value="">Seleccionar empresa</option>
                      {empresas.map((item) => <option key={item.id} value={item.id}>{item.nombreFantasia}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1.5 text-sm text-slate-700 md:col-span-2">
                    <span>Estacionamientos asignados</span>
                    <select multiple value={createDraft.parkingIds} onChange={(event) => setCreateDraft((current) => ({ ...current, parkingIds: Array.from(event.target.selectedOptions, (option) => option.value) }))} className="min-h-28 w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[#3150D8]">
                      {createCompanyParkings.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                    </select>
                    <p className="text-xs text-slate-500">Puedes seleccionar uno o varios estacionamientos para acceso inicial.</p>
                  </label>
                </div>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setCreateOpen(false)} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancelar</button>
                  <button type="submit" disabled={createLoading} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{createLoading ? "Creando..." : "Crear usuario"}</button>
                </div>
              </form>
            </section>
          </div>
        ) : null}

        {passwordUser ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#041E42]/55 p-4">
            <section role="dialog" aria-modal="true" aria-labelledby="change-password-title" className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 id="change-password-title" className="text-xl font-semibold text-[#041E42]">Cambiar clave de acceso</h3>
                  <p className="mt-1 text-sm text-slate-600">{passwordUser.nombreCompleto} · {passwordUser.correo}</p>
                </div>
                <button type="button" onClick={closePasswordModal} className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-600" aria-label="Cerrar"><X className="h-4 w-4" /></button>
              </div>
              <form onSubmit={submitDirectPassword} className="mt-5 space-y-4">
                {passwordError ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{passwordError}</p> : null}
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-xs text-slate-600">La clave se actualizará directamente en Supabase Auth y no quedará almacenada en texto visible.</div>
                <label className="block space-y-1.5 text-sm text-slate-700">
                  <span>Nueva clave</span>
                  <input type="password" autoComplete="new-password" value={passwordDraft.password} onChange={(event) => setPasswordDraft((current) => ({ ...current, password: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[#3150D8]" required minLength={12} />
                </label>
                <label className="block space-y-1.5 text-sm text-slate-700">
                  <span>Confirmar nueva clave</span>
                  <input type="password" autoComplete="new-password" value={passwordDraft.confirmation} onChange={(event) => setPasswordDraft((current) => ({ ...current, confirmation: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[#3150D8]" required minLength={12} />
                </label>
                <button type="button" onClick={fillSecurePassword} className="inline-flex items-center gap-2 rounded-xl border border-[#3150D8] px-3 py-2 text-sm font-semibold text-[#3150D8]"><KeyRound className="h-4 w-4" />Generar clave segura</button>
                <p className="text-xs text-slate-500">Mínimo 12 caracteres, con mayúscula, minúscula, número y símbolo.</p>
                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-3 text-sm text-slate-700">
                  <input type="checkbox" checked={passwordDraft.mustChangePassword} onChange={(event) => setPasswordDraft((current) => ({ ...current, mustChangePassword: event.target.checked }))} className="mt-0.5" />
                  <span><strong>Solicitar cambio posterior</strong><span className="mt-1 block text-xs text-slate-500">Mantiene la nueva clave como temporal hasta que el usuario la reemplace.</span></span>
                </label>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={closePasswordModal} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancelar</button>
                  <button type="submit" disabled={credentialLoadingId === passwordUser.id} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{credentialLoadingId === passwordUser.id ? "Actualizando..." : "Actualizar clave"}</button>
                </div>
              </form>
            </section>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
