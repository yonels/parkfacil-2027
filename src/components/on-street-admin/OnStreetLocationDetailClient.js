"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ArrowLeft, ExternalLink, ListChecks, Printer, QrCode } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { publicOriginFor } from "@/lib/onStreetPilot.mjs";

const dt = (v) => (v ? new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeStyle: "short" }).format(new Date(v)) : "—");
const money = (v) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(v || 0);
const ESTADO_LABEL = { ACTIVE: "Activo", INACTIVE: "Inactivo" };

function subscribeOrigin() {
  return () => {};
}

function DetailItem({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-base font-semibold text-[#041E42]">{value}</p>
    </div>
  );
}

// Ficha administrativa completa de un punto QR On Street: datos reales
// resueltos por el servidor (nunca inventados/mock) y accesos directos a las
// herramientas de prueba/vista previa (punto 9 del requerimiento), para
// revisar el ciclo completo sin tener que buscar rutas manualmente.
export default function OnStreetLocationDetailClient({ id }) {
  const origin = useSyncExternalStore(subscribeOrigin, () => (typeof window !== "undefined" ? window.location.origin : ""), () => "");

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editando, setEditando] = useState(false);
  const [editDraft, setEditDraft] = useState({ label: "", status: "ACTIVE" });
  const [editError, setEditError] = useState("");
  const [editEnviando, setEditEnviando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await authenticatedFetch(`/api/on-street-qr/locations/${id}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("SESSION_EXPIRED");
      if (response.status === 404) {
        setData(null);
        return;
      }
      if (!response.ok) throw new Error(body.error || "No fue posible cargar la ubicación QR.");
      setData(body.data);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(() => cargar(), 0);
    return () => window.clearTimeout(timer);
  }, [cargar]);

  function abrirEdicion() {
    setEditDraft({ label: data.label || "", status: data.status });
    setEditError("");
    setEditando(true);
  }

  async function guardarEdicion(event) {
    event.preventDefault();
    if (!editDraft.label.trim()) {
      setEditError("El nombre o descripción no puede estar vacío.");
      return;
    }
    setEditError("");
    setEditEnviando(true);
    try {
      const response = await authenticatedFetch(`/api/on-street-qr/locations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: editDraft.label.trim(), status: editDraft.status }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible guardar los cambios.");
      setEditando(false);
      await cargar();
    } catch (cause) {
      setEditError(cause.message);
    } finally {
      setEditEnviando(false);
    }
  }

  async function alternarEstado() {
    const nuevoEstado = data.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const confirmado = window.confirm(
      nuevoEstado === "INACTIVE"
        ? `Al desactivar "${data.label || data.publicCode}", el automovilista ya no podrá iniciar nuevas estadías con este QR. Las sesiones y pagos ya realizados no se ven afectados. ¿Continuar?`
        : `¿Reactivar "${data.label || data.publicCode}"?`,
    );
    if (!confirmado) return;
    try {
      const response = await authenticatedFetch(`/api/on-street-qr/locations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nuevoEstado }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible actualizar el estado.");
      await cargar();
    } catch (cause) {
      setError(cause.message);
    }
  }

  if (loading) {
    return <AppShell title="Punto QR" description="Cargando"><div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-600">Cargando…</div></AppShell>;
  }

  if (!data || error) {
    const sessionExpired = error === "SESSION_EXPIRED";
    return (
      <AppShell title="Punto QR" description="No encontrado">
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-lg font-semibold text-[#041E42]">{sessionExpired ? "Tu sesión expiró." : "No se encontró el punto QR solicitado."}</p>
          <div className="mt-4"><Link href={sessionExpired ? "/login" : "/on-street-qr/ubicaciones"} className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--pf-color-onstreet-primary)]"><ArrowLeft className="h-4 w-4" /> Volver</Link></div>
        </div>
      </AppShell>
    );
  }

  const publicUrl = `${publicOriginFor(origin)}/estacionar/${data.publicCode}`;
  const sessionsHref = `/on-street-qr/sesiones?segmentId=${data.segment?.id || ""}`;

  return (
    <AppShell title={data.label || data.publicCode} description="Punto QR On Street">
      <div className="space-y-6">
        <PageHeader
          title={data.label || "Punto QR sin nombre"}
          description={`${data.parking.name} · ${data.segment?.name || "Tramo no disponible"}`}
          backHref="/on-street-qr/ubicaciones"
          backLabel="Volver a Ubicaciones QR"
        />

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold ${data.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
              {ESTADO_LABEL[data.status] || data.status}
            </span>
            {!editando ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={abrirEdicion} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-[var(--pf-color-onstreet-primary)] hover:text-[var(--pf-color-onstreet-primary)]">Editar</button>
                <button type="button" onClick={alternarEstado} className={`rounded-full border px-4 py-2 text-sm font-semibold ${data.status === "ACTIVE" ? "border-rose-200 text-rose-700 hover:bg-rose-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}>
                  {data.status === "ACTIVE" ? "Desactivar" : "Activar"}
                </button>
              </div>
            ) : null}
          </div>

          {editando ? (
            <form onSubmit={guardarEdicion} className="mt-5 space-y-4">
              {editError ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{editError}</p> : null}
              <label className="block space-y-1.5 text-sm text-slate-700">
                <span className="font-medium text-slate-500">Nombre o descripción</span>
                <input value={editDraft.label} onChange={(event) => setEditDraft((current) => ({ ...current, label: event.target.value }))} maxLength={120} required className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[var(--pf-color-onstreet-primary)]" />
              </label>
              <label className="block space-y-1.5 text-sm text-slate-700">
                <span className="font-medium text-slate-500">Estado</span>
                <select value={editDraft.status} onChange={(event) => setEditDraft((current) => ({ ...current, status: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[var(--pf-color-onstreet-primary)]">
                  <option value="ACTIVE">Activo</option>
                  <option value="INACTIVE">Inactivo</option>
                </select>
              </label>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setEditando(false)} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancelar</button>
                <button type="submit" disabled={editEnviando} className="rounded-full bg-[var(--pf-color-onstreet-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{editEnviando ? "Guardando…" : "Guardar cambios"}</button>
              </div>
            </form>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <DetailItem label="Código QR" value={<span className="font-mono text-sm">{data.publicCode}</span>} />
              <DetailItem label="Empresa" value={data.operator.companyName || "—"} />
              <DetailItem label="Estacionamiento" value={data.parking.name} />
              <DetailItem label="Área" value={data.area ? `${data.area.code} · ${data.area.name}` : "—"} />
              <DetailItem label="Calle" value={data.street?.name || "—"} />
              <DetailItem label="Tramo" value={data.segment ? `${data.segment.code} · ${data.segment.name}` : "—"} />
              <DetailItem label="Lado" value={data.segment?.side || "—"} />
              <DetailItem label="Tarifa vigente" value={data.rate ? `${money(data.rate.minuteAmount)}/min` : <span className="text-rose-600">Sin tarifa configurada</span>} />
              <DetailItem label="Fecha de creación" value={dt(data.createdAt)} />
            </div>
          )}
        </section>

        <section className="rounded-3xl border-2 border-[var(--pf-color-onstreet-primary)]/30 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-[var(--pf-color-onstreet-primary)]"><ListChecks className="h-5 w-5" /><h3 className="text-lg font-semibold text-[#041E42]">Herramientas de prueba / vista previa</h3></div>
          <p className="mt-1 text-sm text-slate-500">Todo se genera a partir de los datos reales de este punto — nada aquí es una imagen estática ni un mock.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link href={`/on-street-qr/ubicaciones/${id}/qr`} className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm font-semibold text-[#041E42] transition hover:border-[var(--pf-color-onstreet-primary)] hover:text-[var(--pf-color-onstreet-primary)]">
              <QrCode className="h-6 w-6" /> Ver QR
            </Link>
            <Link href={`/on-street-qr/ubicaciones/${id}/letrero`} className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm font-semibold text-[#041E42] transition hover:border-[var(--pf-color-onstreet-primary)] hover:text-[var(--pf-color-onstreet-primary)]">
              <Printer className="h-6 w-6" /> Ver letrero
            </Link>
            <a href={publicUrl} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm font-semibold text-[#041E42] transition hover:border-[var(--pf-color-onstreet-primary)] hover:text-[var(--pf-color-onstreet-primary)]">
              <ExternalLink className="h-6 w-6" /> Abrir experiencia automovilista
            </a>
            <Link href={sessionsHref} className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm font-semibold text-[#041E42] transition hover:border-[var(--pf-color-onstreet-primary)] hover:text-[var(--pf-color-onstreet-primary)]">
              <ListChecks className="h-6 w-6" /> Ver sesiones de este punto
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
