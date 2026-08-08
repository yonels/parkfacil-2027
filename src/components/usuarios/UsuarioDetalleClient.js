"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Briefcase, Building2, KeyRound, History, Clock3 } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import EstadoUsuarioBadge from "@/components/usuarios/EstadoUsuarioBadge";
import PerfilUsuarioBadge from "@/components/usuarios/PerfilUsuarioBadge";
import { getPerfilLabel } from "@/data/usuarios.mjs";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

function DetailItem({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-base font-semibold text-[#041E42]">{value}</p>
    </div>
  );
}

const statusLabel = {
  PROGRAMMED: "Programado",
  OPEN: "Abierto",
  CLOSING: "En cierre",
  CLOSED: "Cerrado",
  CANCELLED: "Cancelado",
};

export default function UsuarioDetalleClient({ userId }) {
  const [data, setData] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [shiftsError, setShiftsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    authenticatedFetch("/api/usuarios", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No se pudo cargar el catálogo de usuarios.");
        if (!active) return;
        const user = (body.data || []).find((item) => item.id === userId) || null;
        const company = user ? (body.companies || []).find((item) => item.id === user.empresaId) || null : null;
        const parkings = user ? (body.parkings || []).filter((item) => (user.estacionamientos || []).includes(item.id)) : [];
        setData(user ? { user, company, parkings } : { user: null, company: null, parkings: [] });

        if (!user) {
          setShiftsError("");
          setShifts([]);
          return;
        }

        setShiftsError("");
        const shiftsResponse = await authenticatedFetch(`/api/usuarios/${userId}/turnos`, { cache: "no-store" });
        const shiftsBody = await shiftsResponse.json().catch(() => ({}));
        if (!active) return;
        if (!shiftsResponse.ok) {
          setShifts([]);
          setShiftsError(shiftsBody.error || "No se pudieron cargar los turnos del usuario.");
          return;
        }
        setShifts(shiftsBody.data || []);
        setShiftsError("");
      })
      .catch((cause) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId]);

  if (loading) {
    return <AppShell title="Detalle de usuario" description="Cargando usuario"><div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-600">Cargando detalle del usuario…</div></AppShell>;
  }

  const usuario = data?.user || null;
  const empresa = data?.company || null;
  const estacionamientos = data?.parkings || [];

  if (!usuario || error) {
    return (
      <AppShell title="Detalle de usuario" description="Usuario no encontrado">
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-lg font-semibold text-[#041E42]">No se encontró el usuario solicitado.</p>
          <Link href="/usuarios" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#3150D8]">
            <ArrowLeft className="h-4 w-4" /> Volver al catálogo
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={usuario.nombreCompleto} description="Detalle visual del usuario">
      <div className="space-y-6">
        <PageHeader
          title={usuario.nombreCompleto}
          description={`${usuario.correo} · ${getPerfilLabel(usuario.perfilPrincipal)}`}
          actions={[
            <Link key="volver" href="/usuarios" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#3150D8] hover:text-[#3150D8]">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Link>,
          ]}
        />

        <section className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <EstadoUsuarioBadge estado={usuario.estado} />
              <PerfilUsuarioBadge perfil={usuario.perfilPrincipal} />
            </div>
            <h3 className="mt-5 text-2xl font-semibold text-[#041E42]">Información personal</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">{usuario.observaciones}</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <DetailItem label="Nombre completo" value={usuario.nombreCompleto} />
              <DetailItem label="Correo" value={usuario.correo} />
              <DetailItem label="Teléfono" value={usuario.telefono} />
              <DetailItem label="Fecha de incorporación" value={usuario.fechaIncorporacion} />
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-[#F5F9FF] p-6 shadow-sm">
            <div className="flex items-center gap-2 text-[#3150D8]"><Briefcase className="h-5 w-5" /><h3 className="text-lg font-semibold">Empresa y organización</h3></div>
            <div className="mt-6 space-y-4 text-sm text-slate-600">
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>Empresa</span><strong>{empresa?.nombreFantasia ?? "Sin empresa"}</strong></div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>Organización</span><strong>{usuario.organizationId ?? "Sin organización"}</strong></div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>Último acceso</span><strong>{usuario.ultimoAcceso}</strong></div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>Perfiles secundarios</span><strong>{usuario.perfilesSecundarios.length > 0 ? usuario.perfilesSecundarios.join(", ") : "Sin secundarios"}</strong></div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-[#041E42]">Accesos y asignaciones</h3>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-[#3150D8]"><Building2 className="h-5 w-5" /><h4 className="font-semibold">Estacionamientos asignados</h4></div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {estacionamientos.length > 0 ? estacionamientos.map((item) => <li key={item.id}>• {item.nombre || item.name}</li>) : <li>• Sin estacionamientos asignados</li>}
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-[#3150D8]"><KeyRound className="h-5 w-5" /><h4 className="font-semibold">Permisos resumidos</h4></div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {usuario.permisos.map((permiso) => <li key={permiso}>• {permiso}</li>)}
              </ul>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-semibold text-[#041E42]">Turnos del operador</h4>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">{shifts.length} turnos</span>
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
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-[#041E42]">Historial y actividad</h3>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-[#3150D8]"><History className="h-5 w-5" /><h4 className="font-semibold">Historial</h4></div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {usuario.historial.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-[#3150D8]"><Clock3 className="h-5 w-5" /><h4 className="font-semibold">Actividad</h4></div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {usuario.actividad.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
          </div>
          <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
            <p className="font-semibold text-[#041E42]">Etapa futura</p>
            <p className="mt-2">Las funciones de invitación, cambio de contraseña, bloqueo y administración efectiva de permisos se habilitarán en futuras etapas sin afectar accesos reales.</p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}