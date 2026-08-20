"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Check,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Pencil,
  Save,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import EstadoUsuarioBadge from "@/components/usuarios/EstadoUsuarioBadge";
import PerfilUsuarioBadge from "@/components/usuarios/PerfilUsuarioBadge";
import { getPerfilLabel } from "@/data/usuarios.mjs";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { generateSecurePassword } from "@/lib/generateSecurePassword";
import { permissionsForRole } from "@/lib/auth/permissions.mjs";

const ROL_LISTADO = {
  company_admin: { label: "Administradores", href: "/usuarios/administradores" },
  operator: { label: "Operadores", href: "/usuarios/operadores" },
};

const PERMISO_LABELS = {
  "platform:global": "Administración global de la plataforma",
  "company:read": "Ver datos de la empresa",
  "company:manage": "Administrar la empresa",
  "users:manage": "Administrar usuarios",
  "users:credentials:manage": "Administrar accesos y contraseñas",
  "parkings:read": "Ver estacionamientos",
  "parkings:manage": "Administrar estacionamientos",
  "subscribers:read": "Ver abonados",
  "subscribers:manage": "Administrar abonados",
  "notifications:read": "Ver notificaciones",
  "coupons:read": "Ver cupones",
  "coupons:manage": "Administrar cupones",
  "operations:use": "Operar el Terminal / Data Entry",
  "reports:read": "Ver reportes",
  "billing:read": "Ver facturación",
  "billing:manage": "Administrar facturación",
  "billing:review": "Revisar facturación",
  "billing:approve": "Aprobar facturación",
  "billing:issue": "Emitir documentos de facturación",
};

const statusLabel = {
  PROGRAMMED: "Programado",
  OPEN: "Abierto",
  CLOSING: "En cierre",
  CLOSED: "Cerrado",
  CANCELLED: "Cancelado",
};

function DetailItem({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-base font-semibold text-[#041E42]">{value}</p>
    </div>
  );
}

export default function UsuarioDetalleClient({ userId }) {
  const [data, setData] = useState(null);
  const [permisosFlags, setPermisosFlags] = useState({ canManageCredentials: false, canSetDirectPassword: false });
  const [shifts, setShifts] = useState([]);
  const [shiftsError, setShiftsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Acceso y contraseña
  const [accionError, setAccionError] = useState("");
  const [accionMensaje, setAccionMensaje] = useState("");
  const [recuperacionEnviando, setRecuperacionEnviando] = useState(false);
  const [claveTemporalGenerando, setClaveTemporalGenerando] = useState(false);
  const [credencialResultado, setCredencialResultado] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [claveDirectaAbierta, setClaveDirectaAbierta] = useState(false);
  const [claveDirectaDraft, setClaveDirectaDraft] = useState({ password: "", confirmacion: "", mustChangePassword: true });
  const [claveDirectaVisible, setClaveDirectaVisible] = useState(false);
  const [claveDirectaError, setClaveDirectaError] = useState("");
  const [claveDirectaEnviando, setClaveDirectaEnviando] = useState(false);

  // Edición de datos básicos (nombre, teléfono, estado). No incluye
  // empresa/estacionamientos (aislamiento por tenant) ni contraseña
  // (ver sección "Acceso y contraseña").
  const [editando, setEditando] = useState(false);
  const [editDraft, setEditDraft] = useState({ nombreCompleto: "", correo: "", telefono: "", estado: "active" });
  const [editError, setEditError] = useState("");
  const [editEnviando, setEditEnviando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await authenticatedFetch(`/api/usuarios/${userId}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("SESSION_EXPIRED");
      if (response.status === 404) {
        setData({ user: null, company: null, parkings: [] });
        return;
      }
      if (!response.ok) throw new Error(body.error || "No se pudo cargar el usuario.");
      setData(body.data);
      setPermisosFlags({
        canManageCredentials: Boolean(body.data?.canManageCredentials),
        canSetDirectPassword: Boolean(body.data?.canSetDirectPassword),
      });

      if (body.data?.user?.perfilPrincipal === "operator") {
        const shiftsResponse = await authenticatedFetch(`/api/usuarios/${userId}/turnos`, { cache: "no-store" });
        const shiftsBody = await shiftsResponse.json().catch(() => ({}));
        if (shiftsResponse.status === 401) {
          setShifts([]);
          setShiftsError("Tu sesión expiró. Vuelve a iniciar sesión para cargar turnos.");
        } else if (!shiftsResponse.ok) {
          setShifts([]);
          setShiftsError(shiftsBody.error || "No se pudieron cargar los turnos del usuario.");
        } else {
          setShifts(shiftsBody.data || []);
          setShiftsError("");
        }
      }
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => cargar(), 0);
    return () => window.clearTimeout(timer);
  }, [cargar]);

  if (loading) {
    return <AppShell title="Administración de usuario" description="Cargando usuario"><div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-600">Cargando usuario…</div></AppShell>;
  }

  const usuario = data?.user || null;
  const empresa = data?.company || null;
  const estacionamientos = data?.parkings || [];

  if (!usuario || error) {
    const sessionExpired = error === "SESSION_EXPIRED";
    return (
      <AppShell title="Administración de usuario" description="Usuario no encontrado">
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-lg font-semibold text-[#041E42]">{sessionExpired ? "Tu sesión expiró." : "No se encontró el usuario solicitado."}</p>
          <p className="mt-2 text-sm text-slate-600">{sessionExpired ? "Inicia sesión nuevamente para continuar." : "Verifica el enlace o vuelve al catálogo de usuarios."}</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Link href={sessionExpired ? "/login" : "/usuarios"} className="inline-flex items-center gap-2 text-sm font-semibold text-[#3150D8]">
              <ArrowLeft className="h-4 w-4" /> {sessionExpired ? "Ir a iniciar sesión" : "Volver al catálogo"}
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const listado = ROL_LISTADO[usuario.perfilPrincipal] || { label: "Usuarios", href: "/usuarios" };
  const permisos = permissionsForRole(usuario.perfilPrincipal).map((permiso) => PERMISO_LABELS[permiso] || permiso);

  async function confirmarYEjecutar(mensajeConfirmacion, accion) {
    if (!window.confirm(mensajeConfirmacion)) return;
    setAccionError("");
    setAccionMensaje("");
    await accion();
  }

  async function enviarRecuperacion() {
    await confirmarYEjecutar(
      `Enviar correo de recuperación de contraseña a ${usuario.correo}`,
      async () => {
        setRecuperacionEnviando(true);
        try {
          const response = await authenticatedFetch(`/api/usuarios/${userId}/recuperacion`, { method: "POST" });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error || "No fue posible enviar el correo de recuperación.");
          setAccionMensaje(`Correo de recuperación enviado a ${usuario.correo}.`);
        } catch (cause) {
          setAccionError(cause.message);
        } finally {
          setRecuperacionEnviando(false);
        }
      },
    );
  }

  async function generarClaveTemporal() {
    await confirmarYEjecutar(
      `Se reemplazará la clave actual de ${usuario.nombreCompleto}. ¿Deseas generar una nueva clave temporal?`,
      async () => {
        setClaveTemporalGenerando(true);
        try {
          const response = await authenticatedFetch(`/api/usuarios/${userId}/credencial`, { method: "POST" });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error || "No fue posible generar la clave temporal.");
          setCredencialResultado(body.data);
          setAccionMensaje("Clave temporal generada.");
        } catch (cause) {
          setAccionError(cause.message);
        } finally {
          setClaveTemporalGenerando(false);
        }
      },
    );
  }

  async function copiarCredencial() {
    if (!credencialResultado || !navigator.clipboard) return;
    await navigator.clipboard.writeText(`Usuario: ${credencialResultado.username}\n${credencialResultado.mustChangePassword ? "Clave temporal" : "Clave"}: ${credencialResultado.temporaryPassword}`);
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 2000);
  }

  function abrirClaveDirecta() {
    setClaveDirectaDraft({ password: "", confirmacion: "", mustChangePassword: true });
    setClaveDirectaError("");
    setClaveDirectaAbierta(true);
  }

  function llenarClaveSegura() {
    const password = generateSecurePassword();
    setClaveDirectaDraft((current) => ({ ...current, password, confirmacion: password }));
    setClaveDirectaError("");
  }

  async function establecerClaveDirecta(event) {
    event.preventDefault();
    if (claveDirectaDraft.password !== claveDirectaDraft.confirmacion) {
      setClaveDirectaError("Las claves no coinciden.");
      return;
    }
    const confirmado = window.confirm(`Se establecerá una nueva clave directamente para ${usuario.correo}. ¿Continuar?`);
    if (!confirmado) return;
    setClaveDirectaError("");
    setClaveDirectaEnviando(true);
    try {
      const response = await authenticatedFetch(`/api/usuarios/${userId}/credencial`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: claveDirectaDraft.password, mustChangePassword: claveDirectaDraft.mustChangePassword }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible establecer la clave.");
      setCredencialResultado(body.data);
      setAccionMensaje("Clave establecida directamente.");
      setClaveDirectaAbierta(false);
    } catch (cause) {
      setClaveDirectaError(cause.message);
    } finally {
      setClaveDirectaEnviando(false);
    }
  }

  function abrirEdicion() {
    setEditDraft({
      nombreCompleto: usuario.nombreCompleto || "",
      correo: usuario.correo || "",
      telefono: usuario.telefono && usuario.telefono !== "Sin teléfono informado" ? usuario.telefono : "",
      estado: usuario.estado === "pending" || usuario.estado === "inactive" ? usuario.estado : "active",
    });
    setEditError("");
    setEditando(true);
  }

  async function guardarEdicion(event) {
    event.preventDefault();
    if (!editDraft.nombreCompleto.trim()) {
      setEditError("El nombre completo no puede estar vacío.");
      return;
    }
    if (!editDraft.correo.trim()) {
      setEditError("El correo electrónico no puede estar vacío.");
      return;
    }
    const correoNuevo = editDraft.correo.trim().toLowerCase();
    const cambiaCorreo = correoNuevo !== (usuario.correo || "").toLowerCase();
    if (cambiaCorreo && !window.confirm(`Se cambiará el correo de acceso de ${usuario.correo} a ${correoNuevo}. El usuario deberá iniciar sesión con el nuevo correo. ¿Continuar?`)) {
      return;
    }
    setEditError("");
    setEditEnviando(true);
    try {
      const response = await authenticatedFetch(`/api/usuarios/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombreCompleto: editDraft.nombreCompleto.trim(),
          correo: correoNuevo,
          telefono: editDraft.telefono.trim(),
          estado: editDraft.estado,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible guardar los cambios.");
      setData(body.data);
      setEditando(false);
    } catch (cause) {
      setEditError(cause.message);
    } finally {
      setEditEnviando(false);
    }
  }

  return (
    <AppShell title={usuario.nombreCompleto} description="Administración del usuario">
      <div className="space-y-6">
        <p className="text-sm font-medium text-slate-500">
          <Link href="/usuarios" className="hover:text-[#3150D8] hover:underline">Usuarios</Link>
          {" / "}
          <Link href={listado.href} className="hover:text-[#3150D8] hover:underline">{listado.label}</Link>
          {" / "}
          <span className="text-[#041E42]">{usuario.nombreCompleto}</span>
        </p>

        <PageHeader
          title={usuario.nombreCompleto}
          description={`${usuario.correo} · ${getPerfilLabel(usuario.perfilPrincipal)}`}
          backHref={listado.href}
          backLabel={`Volver a ${listado.label}`}
        />

        <section className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <EstadoUsuarioBadge estado={usuario.estado} />
                <PerfilUsuarioBadge perfil={usuario.perfilPrincipal} />
              </div>
              {!editando ? (
                <button type="button" onClick={abrirEdicion} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#3150D8] hover:text-[#3150D8]">
                  <Pencil className="h-4 w-4" /> Editar
                </button>
              ) : null}
            </div>
            <h3 className="mt-5 text-2xl font-semibold text-[#041E42]">Datos del usuario</h3>

            {editando ? (
              <form onSubmit={guardarEdicion} className="mt-6 space-y-4">
                {editError ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{editError}</p> : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-1.5 text-sm text-slate-700">
                    <span className="font-medium text-slate-500">Nombre completo</span>
                    <input
                      value={editDraft.nombreCompleto}
                      onChange={(event) => setEditDraft((current) => ({ ...current, nombreCompleto: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[#3150D8]"
                      required
                    />
                  </label>
                  <label className="block space-y-1.5 text-sm text-slate-700">
                    <span className="font-medium text-slate-500">Correo</span>
                    <input
                      type="email"
                      value={editDraft.correo}
                      onChange={(event) => setEditDraft((current) => ({ ...current, correo: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[#3150D8]"
                      required
                    />
                  </label>
                  <label className="block space-y-1.5 text-sm text-slate-700">
                    <span className="font-medium text-slate-500">Teléfono</span>
                    <input
                      value={editDraft.telefono}
                      onChange={(event) => setEditDraft((current) => ({ ...current, telefono: event.target.value }))}
                      placeholder="+56 9 0000 0000"
                      className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[#3150D8]"
                    />
                  </label>
                  <label className="block space-y-1.5 text-sm text-slate-700">
                    <span className="font-medium text-slate-500">Estado</span>
                    <select
                      value={editDraft.estado}
                      onChange={(event) => setEditDraft((current) => ({ ...current, estado: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[#3150D8]"
                    >
                      <option value="active">Activo</option>
                      <option value="inactive">Inactivo</option>
                      <option value="pending">Pendiente</option>
                    </select>
                  </label>
                </div>
                <p className="text-xs text-slate-500">Empresa y estacionamientos asignados no se editan desde aquí. La contraseña se administra en &quot;Acceso y contraseña&quot;.</p>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setEditando(false)} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"><X className="h-4 w-4" /> Cancelar</button>
                  <button type="submit" disabled={editEnviando} className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                    {editEnviando ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {editEnviando ? "Guardando..." : "Guardar cambios"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <DetailItem label="Nombre completo" value={usuario.nombreCompleto} />
                <DetailItem label="Correo" value={usuario.correo} />
                <DetailItem label="Teléfono" value={usuario.telefono} />
                <DetailItem label="Fecha de creación" value={usuario.fechaCreacion || "Sin fecha informada"} />
                <DetailItem label="Último acceso" value={usuario.ultimoAcceso} />
                <DetailItem label="Estado" value={<EstadoUsuarioBadge estado={usuario.estado} />} />
              </div>
            )}
          </div>
          <div className="rounded-3xl border border-slate-200 bg-[#F5F9FF] p-6 shadow-sm">
            <div className="flex items-center gap-2 text-[#3150D8]"><Building2 className="h-5 w-5" /><h3 className="text-lg font-semibold">Empresa</h3></div>
            <div className="mt-6 space-y-4 text-sm text-slate-600">
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>Empresa</span><strong>{empresa?.nombreFantasia ?? "Sin empresa"}</strong></div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>Razón social</span><strong>{empresa?.razonSocial ?? "Sin datos"}</strong></div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>RUT de la empresa</span><strong>{empresa?.rut ?? "Sin datos"}</strong></div>
            </div>
            <div className="mt-6">
              <div className="flex items-center gap-2 text-[#3150D8]"><ShieldCheck className="h-5 w-5" /><h4 className="font-semibold">Estacionamientos asignados</h4></div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {estacionamientos.length > 0 ? estacionamientos.map((item) => <li key={item.id}>• {item.nombre || item.name}</li>) : <li>• Sin estacionamientos asignados</li>}
              </ul>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-[#3150D8]"><KeyRound className="h-5 w-5" /><h3 className="text-xl font-semibold text-[#041E42]">Permisos actuales</h3></div>
          <ul className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            {permisos.map((permiso) => <li key={permiso}>• {permiso}</li>)}
          </ul>
        </section>

        {permisosFlags.canManageCredentials ? (
          <section className="rounded-3xl border-2 border-[#3150D8]/30 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 text-[#3150D8]"><KeyRound className="h-5 w-5" /><h3 className="text-xl font-semibold text-[#041E42]">Acceso y contraseña</h3></div>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <span>Estado:</span>
              <EstadoUsuarioBadge estado={usuario.estado} />
              {usuario.debeCambiarClave ? <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">Clave temporal pendiente de cambio</span> : null}
            </div>

            {accionError ? <p role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{accionError}</p> : null}
            {accionMensaje ? <p role="status" className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{accionMensaje}</p> : null}

            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={enviarRecuperacion} disabled={recuperacionEnviando} className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1E5EFF] disabled:opacity-60">
                {recuperacionEnviando ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {recuperacionEnviando ? "Enviando..." : "Enviar recuperación de contraseña"}
              </button>
              <button type="button" onClick={generarClaveTemporal} disabled={claveTemporalGenerando} className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-60">
                {claveTemporalGenerando ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                {claveTemporalGenerando ? "Generando..." : "Generar clave temporal"}
              </button>
              {permisosFlags.canSetDirectPassword ? (
                <button type="button" onClick={abrirClaveDirecta} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-[#3150D8] hover:text-[#3150D8]">
                  <KeyRound className="h-4 w-4" /> Establecer nueva clave
                </button>
              ) : null}
            </div>

            {credencialResultado ? (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-900">{credencialResultado.mustChangePassword ? "Clave temporal generada" : "Clave establecida"}</p>
                <code className="mt-2 block rounded-lg bg-white px-3 py-2 text-sm font-bold text-amber-900">{credencialResultado.temporaryPassword}</code>
                <button type="button" onClick={copiarCredencial} className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#3150D8]">
                  {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiado ? "Copiado" : "Copiar usuario y clave"}
                </button>
                <p className="mt-2 text-xs text-amber-700">Visible solamente durante esta sesión. Root nunca puede ver la clave original del usuario.</p>
              </div>
            ) : null}

            {claveDirectaAbierta ? (
              <form onSubmit={establecerClaveDirecta} className="mt-5 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <h4 className="text-base font-semibold text-[#041E42]">Establecer nueva clave</h4>
                {claveDirectaError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{claveDirectaError}</p> : null}
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-slate-600">La clave se actualizará directamente en Supabase Auth. Root nunca ve ni puede recuperar la clave anterior.</div>
                <label className="block space-y-1.5 text-sm text-slate-700">
                  <span>Nueva clave</span>
                  <span className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                    <input
                      type={claveDirectaVisible ? "text" : "password"}
                      autoComplete="new-password"
                      value={claveDirectaDraft.password}
                      onChange={(event) => setClaveDirectaDraft((current) => ({ ...current, password: event.target.value }))}
                      className="w-full min-w-0 flex-1 bg-transparent outline-none"
                      required
                      minLength={12}
                    />
                    <button type="button" onClick={() => setClaveDirectaVisible((value) => !value)} aria-label={claveDirectaVisible ? "Ocultar contraseña" : "Mostrar contraseña"} className="text-slate-500 hover:text-[#3150D8]">
                      {claveDirectaVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </span>
                </label>
                <label className="block space-y-1.5 text-sm text-slate-700">
                  <span>Confirmar nueva clave</span>
                  <input
                    type={claveDirectaVisible ? "text" : "password"}
                    autoComplete="new-password"
                    value={claveDirectaDraft.confirmacion}
                    onChange={(event) => setClaveDirectaDraft((current) => ({ ...current, confirmacion: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[#3150D8]"
                    required
                    minLength={12}
                  />
                </label>
                <button type="button" onClick={llenarClaveSegura} className="inline-flex items-center gap-2 rounded-xl border border-[#3150D8] px-3 py-2 text-sm font-semibold text-[#3150D8]"><KeyRound className="h-4 w-4" />Generar clave segura</button>
                <p className="text-xs text-slate-500">Mínimo 12 caracteres, con mayúscula, minúscula, número y símbolo.</p>
                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                  <input type="checkbox" checked={claveDirectaDraft.mustChangePassword} onChange={(event) => setClaveDirectaDraft((current) => ({ ...current, mustChangePassword: event.target.checked }))} className="mt-0.5" />
                  <span><strong>Solicitar cambio posterior</strong><span className="mt-1 block text-xs text-slate-500">Mantiene la nueva clave como temporal hasta que el usuario la reemplace.</span></span>
                </label>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setClaveDirectaAbierta(false)} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancelar</button>
                  <button type="submit" disabled={claveDirectaEnviando} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{claveDirectaEnviando ? "Actualizando..." : "Establecer clave"}</button>
                </div>
              </form>
            ) : null}
          </section>
        ) : null}

        {usuario.perfilPrincipal === "operator" ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[#3150D8]"><Clock3 className="h-5 w-5" /><h3 className="text-xl font-semibold text-[#041E42]">Turnos del operador</h3></div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{shifts.length} turnos</span>
            </div>
            {shiftsError ? <p className="mt-3 text-sm text-rose-700">{shiftsError}</p> : null}
            {shifts.length ? <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {shifts.map((shift) => (
                <li key={shift.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-[#041E42]">{shift.date || "Sin fecha"}</strong>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{statusLabel[shift.status] || shift.status}</span>
                  </div>
                  <p className="mt-1">{shift.parkingName} ({shift.parkingCode})</p>
                  <p className="text-xs text-slate-500">Horario: {[shift.scheduledStart, shift.scheduledEnd].filter(Boolean).join(" - ") || "Sin horario programado"}</p>
                  <Link href={`/estacionamientos/${shift.parkingCode}/turnos`} className="mt-2 inline-flex text-xs font-semibold text-[#3150D8] hover:underline">Ver turnos del estacionamiento</Link>
                </li>
              ))}
            </ul> : <p className="mt-3 text-sm text-slate-600">No hay turnos registrados para este operador.</p>}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
