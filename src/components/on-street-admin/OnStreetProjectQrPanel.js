"use client";
// Pestaña QR de la ficha de Proyecto (corrección UX/funcional "Proyectos On
// Street" 2026-08-29, punto 1): "+ Nueva ubicación QR" SIN salir del
// Proyecto. Reutiliza el generador único (OnStreetQrCreateWorkspace, en
// modo compact/parkingId fijo) -- no existe un segundo generador ni una
// segunda API de creación. La lista de abajo reutiliza el mismo endpoint
// GET /api/on-street-qr/locations ya existente (OnStreetLocationsWorkspace),
// filtrado del lado del cliente por parking_id.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import OnStreetQrCreateWorkspace from "./OnStreetQrCreateWorkspace";

const ESTADO_LABEL = { ACTIVE: "Activo", INACTIVE: "Inactivo" };

// initialSectorId/initialStreetId/initialSegmentId/initialRateId (corrección
// UX 2026-08-30): cuando llega desde el nivel 5 (Tarifa) del constructor de
// Proyecto con la jerarquía + tarifa ya resueltas, se abre el panel de
// creación automáticamente y precargado -- ver OnStreetQrCreateWorkspace.js.
// onCountChange (corrección "flujo QR dentro de Nuevo Proyecto" 2026-08-30):
// reporta al padre cuántas ubicaciones QR reales tiene el Proyecto -- el
// wizard lo usa para habilitar "CONTINUAR A REVISIÓN" solo cuando existe al
// menos una. Opcional, no afecta al uso desde la ficha (tab QR).
export default function OnStreetProjectQrPanel({ parkingId, initialSectorId = null, initialStreetId = null, initialSegmentId = null, initialRateId = null, initialRateLabel = null, onCountChange }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(Boolean(initialSegmentId && initialRateId));

  const cargar = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await authenticatedFetch("/api/on-street-qr/locations", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible cargar las ubicaciones QR.");
      setRows((body.data?.rows || []).filter((row) => (row.parking_id || row.location?.parking?.id) === parkingId));
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, [parkingId]);

  useEffect(() => { const timer = window.setTimeout(() => void cargar(), 0); return () => window.clearTimeout(timer); }, [cargar]);

  useEffect(() => {
    if (!onCountChange) return undefined;
    const timer = window.setTimeout(() => onCountChange(rows.length), 0);
    return () => window.clearTimeout(timer);
  }, [rows, onCountChange]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-[#041E42]">Ubicaciones QR de este proyecto</h2>
        {!creando ? (
          <button type="button" onClick={() => setCreando(true)} className="inline-flex items-center gap-2 rounded-full bg-[var(--pf-color-onstreet-primary)] px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Nueva ubicación QR</button>
        ) : (
          <button type="button" onClick={() => setCreando(false)} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"><X className="h-4 w-4" /> Cerrar</button>
        )}
      </div>

      {creando ? (
        <OnStreetQrCreateWorkspace
          parkingId={parkingId} compact onCreated={() => { void cargar(); }}
          initialSectorId={initialSectorId} initialStreetId={initialStreetId} initialSegmentId={initialSegmentId} initialRateId={initialRateId} initialRateLabel={initialRateLabel}
        />
      ) : null}

      {error ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>{["Nombre", "Área", "Calle", "Tramo", "Estado", ""].map((h) => <th key={h} className="px-3 py-3">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-3 font-medium">{row.label}</td>
                <td className="px-3 py-3">{row.location?.area?.name || "—"}</td>
                <td className="px-3 py-3">{row.location?.street?.name || "—"}</td>
                <td className="px-3 py-3">{row.location?.segment?.name || "—"}</td>
                <td className="px-3 py-3">{ESTADO_LABEL[row.status] || row.status}</td>
                <td className="px-3 py-3 text-right"><Link href={`/on-street-qr/ubicaciones/${row.id}`} className="text-xs font-semibold text-[var(--pf-color-onstreet-primary)] hover:underline">Ver ficha</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? <p className="p-8 text-center text-sm text-slate-500">Cargando…</p> : !rows.length ? <p className="p-8 text-center text-sm text-slate-500">Este proyecto todavía no tiene ubicaciones QR.</p> : null}
      </div>
    </section>
  );
}
