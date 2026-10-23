"use client";

export { defaultStreetSegmentId } from "@/lib/offStreet/streetLocationCore.mjs";

// Ubicación en calle del ingreso Off Street (SOL-2026-10-23-001, etapa 3): el POS
// propone el tramo asignado al operador; puede elegir otro (queda marcado «fuera de
// asignación») o «Recinto» si el estacionamiento también tiene niveles. Un tramo sin
// cupo no se puede elegir; la base de datos igual rechaza el ingreso si se llena.
export default function PosStreetLocationPicker({ streetLocation, segmentId, streetNumber, onSegmentChange, onStreetNumberChange, disabled = false }) {
  if (!streetLocation?.enabled) return null;
  const segments = streetLocation.segments || [];
  const selected = segments.find((item) => item.id === segmentId) || null;
  const outOfAssignment = Boolean(selected && !selected.assigned);
  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-left">
      <label className="block text-sm font-bold text-slate-700" htmlFor="pos-street-segment">Ubicación (zona · calle · tramo)</label>
      <select
        id="pos-street-segment"
        value={segmentId || ""}
        onChange={(event) => onSegmentChange(event.target.value)}
        disabled={disabled}
        className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base font-semibold text-slate-900"
      >
        <option value="">Recinto (sin calle)</option>
        {segments.map((item) => (
          <option key={item.id} value={item.id} disabled={item.available <= 0}>
            {`${item.assigned ? "★ " : ""}${item.zoneName} · ${item.streetName} ${item.fromNumber}–${item.toNumber}${item.available <= 0 ? " · LLENO" : ` · ${item.available} libre${item.available === 1 ? "" : "s"}`}`}
          </option>
        ))}
      </select>
      {selected ? (
        <label className="mt-3 block text-sm font-bold text-slate-700">
          Número de calle (opcional, {selected.fromNumber}–{selected.toNumber})
          <input
            type="number"
            inputMode="numeric"
            min={selected.fromNumber}
            max={selected.toNumber}
            value={streetNumber}
            onChange={(event) => onStreetNumberChange(event.target.value)}
            disabled={disabled}
            className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 px-3 text-base font-semibold"
          />
        </label>
      ) : null}
      {outOfAssignment ? (
        <p role="status" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          Fuera de tu asignación: el ingreso se registra y queda marcado.
        </p>
      ) : null}
      {selected?.assigned ? <p className="mt-2 text-xs font-semibold text-emerald-700">★ Tramo asignado a tu turno.</p> : null}
    </div>
  );
}
