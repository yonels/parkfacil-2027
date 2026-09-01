"use client";
// Gestor de Tramos para la ficha de Calle On Street (corrección UX
// "Proyectos On Street" 2026-08-29, punto 3). Reemplaza el uso de
// StreetSegmentsManager.js (compartido con Off Street vía StructureRoute.js
// -- NO se toca, sigue con "Orden"/Código manual para Off Street tal cual
// estaba) por el mismo modelo UX ya aprobado para el constructor de
// Proyecto: Tramo A/B/C, código automático, sin "Orden" visible. Reutiliza
// EXACTAMENTE el mismo formulario (OnStreetSegmentForm) que ya usa
// OnStreetProjectWizard.js -- una sola implementación, no un segundo modelo.
import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { sortOrderToLetter } from "@/lib/parkingSegments.mjs";
import { SEGMENT_SIDE_LABELS, SEGMENT_STATUS_LABELS } from "@/components/estacionamientos/SegmentForm";
import OnStreetSegmentForm from "./OnStreetSegmentForm";

export default function OnStreetTramosManager({ parking, area, street }) {
  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // null | {} (crear) | {id} (editar)
  const endpoint = `/api/estacionamientos/${parking.code}/sectores/${area.id}/calles/${street.id}/tramos`;

  const cargar = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await authenticatedFetch(endpoint, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible cargar los tramos de esta calle.");
      setSegments(body.data || []);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { const timer = window.setTimeout(() => void cargar(), 0); return () => window.clearTimeout(timer); }, [cargar]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[#041E42]">Tramos configurables</h2>
          <p className="mt-1 text-sm text-slate-600">Cada tramo se identifica por letra (Tramo A, B, C...) y su código se asigna automáticamente.</p>
        </div>
        <button onClick={() => setModal({})} className="inline-flex items-center gap-2 rounded-full bg-[var(--pf-color-onstreet-primary)] px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Crear tramo</button>
      </div>

      {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>{["Tramo", "Código", "Nombre", "Numeración", "Lado", "Capacidad", "Estado", ""].map((item) => <th key={item} className="px-3 py-3">{item}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {segments.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-3 font-black text-[var(--pf-color-onstreet-primary)]">{sortOrderToLetter(item.sort_order)}</td>
                <td className="px-3 py-3 font-mono text-xs text-slate-500">{item.code}</td>
                <td className="px-3 py-3 font-medium">{item.name}</td>
                <td className="px-3 py-3">{item.from_number}–{item.to_number}</td>
                <td className="px-3 py-3">{SEGMENT_SIDE_LABELS[item.street_side] || item.street_side}</td>
                <td className="px-3 py-3">{item.capacity}</td>
                <td className="px-3 py-3">{SEGMENT_STATUS_LABELS[item.status] || item.status}</td>
                <td className="px-3 py-3 text-right">
                  <button onClick={() => setModal({ id: item.id })} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-[var(--pf-color-onstreet-primary)]" aria-label={`Editar Tramo ${sortOrderToLetter(item.sort_order)}`}>
                    <Pencil className="h-4 w-4" />Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? <p className="p-8 text-center text-sm text-slate-500">Cargando…</p> : !segments.length ? <p className="p-8 text-center text-sm text-slate-500">No hay tramos configurados.</p> : null}
      </div>

      {modal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#041E42]">{modal.id ? "Editar tramo" : "Nuevo tramo"}</h3>
              <button type="button" onClick={() => setModal(null)} aria-label="Cerrar" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <OnStreetSegmentForm
              parking={parking} area={area} street={street} segmentId={modal.id || null}
              onSaved={async () => { setModal(null); await cargar(); }}
              onCancel={() => setModal(null)}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
