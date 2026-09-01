"use client";
import { useEffect, useState } from "react";
import { relativeTimeFromNow } from "@/lib/inspector/inspectorTime.mjs";
import { inspectionMotivoLabel } from "@/lib/inspector/inspectorPlateStateCore.mjs";

// Listado real de patentes observadas (Etapa 2, §14/§16): GET
// /api/inspector/observed -- visible para cualquier Inspector, global (sin
// restricción de sector, §3.1). La ficha reutiliza la misma consulta de
// patente (onOpenPlate), que para una patente con antecedente ya devuelve
// motivo/último evento/historial -- no hace falta un segundo endpoint.
export default function InspectorMorosos({ onOpenPlate }) {
  const [plates, setPlates] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/inspector/observed", { headers: { "x-parkfacil-portal": "inspector" }, cache: "no-store" })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => { if (!cancelled) { if (ok) setPlates(body.data || []); else setError(body.error || "No fue posible cargar la lista."); } })
      .catch(() => { if (!cancelled) setError("No fue posible cargar la lista."); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="mx-auto w-full max-w-2xl p-4 pb-8">
      <h1 className="text-2xl font-black text-[#041E42]">Morosos / Observados</h1>
      {error ? <p role="alert" className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
      {plates === null && !error ? <p className="mt-3 text-sm text-slate-500">Cargando…</p> : null}
      {plates && plates.length === 0 ? <p className="mt-3 rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-sm">No hay patentes observadas registradas.</p> : null}
      <ul className="mt-4 space-y-2">
        {(plates || []).map((row) => (
          <li key={row.license_plate_normalized}>
            <button onClick={() => onOpenPlate(row.license_plate_normalized)} className="flex min-h-16 w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-left shadow-sm">
              <span className="font-black tracking-wide text-[#041E42]">{row.license_plate_normalized}</span>
              <span className="max-w-[45%] truncate text-sm text-slate-500">{inspectionMotivoLabel(row)}</span>
              <span className="text-xs font-semibold text-slate-400">{relativeTimeFromNow(row.inspected_at)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
