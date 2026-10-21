"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { publicOriginFor } from "@/lib/onStreetPilot.mjs";
import OnStreetQrPreview from "./OnStreetQrPreview";

const dt = (v) => (v ? new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(v)) : "—");
const money = (v) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(v || 0);
const ESTADO_LABEL = { ACTIVE: "Activo", INACTIVE: "Inactivo" };

function subscribeOrigin() {
  return () => {};
}

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

// Ubicaciones QR del módulo On Street (definitivo, con Webpay). Root ve todas
// las empresas; company_admin solo la suya (aplicado en el servidor, ver
// onStreetAdminRepository.js -> scopedParkings).
export default function OnStreetLocationsWorkspace() {
  const origin = useSyncExternalStore(subscribeOrigin, () => (typeof window !== "undefined" ? window.location.origin : ""), () => "");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  // Corrección UX/funcional "Proyectos On Street" (2026-08-29): la ficha de
  // un Proyecto enlaza aquí con ?parkingId=... -- antes se ignoraba por
  // completo (mostraba TODAS las ubicaciones de todos los proyectos). Se lee
  // de window.location (mismo patrón que OnStreetWorkspace.js) y filtra por
  // coincidencia exacta de parking_id, nunca por texto/nombre.
  const [parkingIdFiltro, setParkingIdFiltro] = useState(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setParkingIdFiltro(new URLSearchParams(window.location.search).get("parkingId")), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const [preview, setPreview] = useState(null);
  const [editando, setEditando] = useState(null);
  const [editDraft, setEditDraft] = useState({ label: "", status: "ACTIVE" });
  const [editError, setEditError] = useState("");
  const [editEnviando, setEditEnviando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await authenticatedFetch("/api/on-street-qr/locations", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("SESSION_EXPIRED");
      if (!response.ok) throw new Error(body.error || "No fue posible cargar las ubicaciones QR.");
      setRows(body.data?.rows || []);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => cargar(), 0);
    return () => window.clearTimeout(timer);
  }, [cargar]);

  const resultados = useMemo(() => {
    const porProyecto = parkingIdFiltro ? rows.filter((row) => (row.parking_id || row.location?.parking?.id) === parkingIdFiltro) : rows;
    const normalized = normalize(busqueda);
    if (!normalized) return porProyecto;
    return porProyecto.filter((row) => [row.label, row.public_code, row.location?.parking?.company_name, row.location?.parking?.name, row.location?.area?.name, row.location?.street?.name, row.location?.segment?.name].some((value) => normalize(value).includes(normalized)));
  }, [busqueda, rows, parkingIdFiltro]);

  function abrirEdicion(row) {
    setEditDraft({ label: row.label || "", status: row.status });
    setEditError("");
    setEditando(row.id);
  }

  async function guardarEdicion(event, row) {
    event.preventDefault();
    if (!editDraft.label.trim()) {
      setEditError("El nombre o descripción no puede estar vacío.");
      return;
    }
    setEditError("");
    setEditEnviando(true);
    try {
      const response = await authenticatedFetch(`/api/on-street-qr/locations/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: editDraft.label.trim(), status: editDraft.status }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible guardar los cambios.");
      setEditando(null);
      await cargar();
    } catch (cause) {
      setEditError(cause.message);
    } finally {
      setEditEnviando(false);
    }
  }

  async function alternarEstado(row) {
    const nuevoEstado = row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const confirmado = window.confirm(
      nuevoEstado === "INACTIVE"
        ? `Al desactivar "${row.label || row.public_code}", el automovilista ya no podrá iniciar nuevas estadías con este QR. Las sesiones y pagos ya realizados no se ven afectados. ¿Continuar?`
        : `¿Reactivar "${row.label || row.public_code}"?`,
    );
    if (!confirmado) return;
    try {
      const response = await authenticatedFetch(`/api/on-street-qr/locations/${row.id}`, {
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

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
          <Search className="h-4 w-4 text-[var(--pf-color-onstreet-primary)]" />
          <input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar por nombre, código, empresa, estacionamiento, calle o tramo…" className="w-full bg-transparent outline-none" />
        </label>
        <Link href="/on-street-qr/crear" className="inline-flex items-center gap-2 rounded-full bg-[var(--pf-color-onstreet-primary)] px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Crear punto QR</Link>
      </div>

      {error ? (
        <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error === "SESSION_EXPIRED" ? "Tu sesión expiró. Vuelve a iniciar sesión." : error}
        </p>
      ) : null}

      {loading ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">Cargando…</div>
      ) : resultados.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
          {rows.length ? "No hay resultados para tu búsqueda." : "No hay ubicaciones QR registradas todavía."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-300 bg-white shadow-sm">
          <table className="w-full min-w-[1400px] border-collapse text-left text-sm">
            <thead className="bg-[#E2F0D9] text-[#041E42]">
              <tr>
                {["Nombre", "Código QR", "Estado", "Empresa", "Estacionamiento", "Área", "Calle", "Tramo", "Lado", "Tarifa", "Creación", "Acciones"].map((h) => (
                  <th key={h} className="whitespace-nowrap border border-slate-300 px-3 py-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resultados.map((row) => (
                <tr key={row.id} className="border-b border-slate-200">
                  <td className="border border-slate-200 px-3 py-2">
                    <Link href={`/on-street-qr/ubicaciones/${row.id}`} className="font-semibold text-[var(--pf-color-onstreet-primary)] hover:underline">{row.label || <span className="text-slate-400">Sin nombre</span>}</Link>
                  </td>
                  <td className="border border-slate-200 px-3 py-2 font-mono text-xs">{row.public_code}</td>
                  <td className={`border border-slate-200 px-3 py-2 font-semibold ${row.status === "ACTIVE" ? "text-emerald-700" : "text-slate-500"}`}>{ESTADO_LABEL[row.status] || row.status}</td>
                  <td className="border border-slate-200 px-3 py-2">{row.location?.parking?.company_name || "—"}</td>
                  <td className="border border-slate-200 px-3 py-2">{row.location?.parking?.name || "—"}</td>
                  <td className="border border-slate-200 px-3 py-2">{row.location?.area?.name || "—"}</td>
                  <td className="border border-slate-200 px-3 py-2">{row.location?.street?.name || "—"}</td>
                  <td className="border border-slate-200 px-3 py-2">{row.location?.segment?.name || "—"}</td>
                  <td className="border border-slate-200 px-3 py-2">{row.location?.side || "—"}</td>
                  <td className="border border-slate-200 px-3 py-2">{row.rate ? `${money(row.rate.minuteAmount)}/min` : <span className="text-rose-600">Sin tarifa</span>}</td>
                  <td className="border border-slate-200 px-3 py-2">{dt(row.created_at)}</td>
                  <td className="border border-slate-200 px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/on-street-qr/ubicaciones/${row.id}`} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[var(--pf-color-onstreet-primary)] hover:text-[var(--pf-color-onstreet-primary)]">Ficha</Link>
                      <button type="button" onClick={() => setPreview(row)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[var(--pf-color-onstreet-primary)] hover:border-[var(--pf-color-onstreet-primary)]">Ver QR</button>
                      <button type="button" onClick={() => abrirEdicion(row)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[var(--pf-color-onstreet-primary)] hover:text-[var(--pf-color-onstreet-primary)]">Editar</button>
                      <button type="button" onClick={() => alternarEstado(row)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${row.status === "ACTIVE" ? "border-rose-200 text-rose-700 hover:bg-rose-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}>
                        {row.status === "ACTIVE" ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {preview ? (
        <OnStreetQrPreview
          open
          onClose={() => setPreview(null)}
          publicCode={preview.public_code}
          url={`${publicOriginFor(origin)}/estacionar/${preview.public_code}`}
          title={preview.label || preview.public_code}
          parkingName={preview.location?.parking?.name}
          streetSegment={`${preview.location?.street?.name || ""} · ${preview.location?.segment?.name || ""}`}
          physicalReference={preview.location?.segment?.name}
        />
      ) : null}

      {editando ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[#041E42]">Editar ubicación QR</h3>
            <p className="mt-1 text-sm text-slate-500">El estacionamiento, área, calle y tramo no se pueden modificar aquí: crea una nueva ubicación si necesitas reasignarlos.</p>
            <form onSubmit={(event) => guardarEdicion(event, rows.find((row) => row.id === editando))} className="mt-4 space-y-4">
              {editError ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{editError}</p> : null}
              <label className="block space-y-1.5 text-sm text-slate-700">
                <span className="font-medium text-slate-500">Nombre o descripción</span>
                <input value={editDraft.label} onChange={(event) => setEditDraft((current) => ({ ...current, label: event.target.value }))} maxLength={120} className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[var(--pf-color-onstreet-primary)]" required />
              </label>
              <label className="block space-y-1.5 text-sm text-slate-700">
                <span className="font-medium text-slate-500">Estado</span>
                <select value={editDraft.status} onChange={(event) => setEditDraft((current) => ({ ...current, status: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[var(--pf-color-onstreet-primary)]">
                  <option value="ACTIVE">Activo</option>
                  <option value="INACTIVE">Inactivo</option>
                </select>
              </label>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setEditando(null)} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancelar</button>
                <button type="submit" disabled={editEnviando} className="rounded-full bg-[var(--pf-color-onstreet-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{editEnviando ? "Guardando…" : "Guardar cambios"}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
