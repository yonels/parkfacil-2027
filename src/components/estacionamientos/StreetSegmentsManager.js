"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import SegmentForm, { normalizeSegment, SEGMENT_SIDE_LABELS, SEGMENT_STATUS_LABELS } from "./SegmentForm";

export default function StreetSegmentsManager({ parking, area, street }) {
  const [segments, setSegments] = useState((street.segments || []).map(normalizeSegment));
  // null = cerrado; {} = creando; segmento = editando. El formulario en sí
  // (campos/validación/endpoint) vive únicamente en SegmentForm -- ver
  // "CORRECCIÓN UX/FUNCIONAL — ESTRUCTURA ON STREET Y EDICIÓN DE TRAMOS".
  const [editing, setEditing] = useState(null);
  const totals = useMemo(() => segments.filter((item) => item.status === "ACTIVE").reduce((sum, item) => ({ capacity: sum.capacity + Number(item.capacity), occupied: sum.occupied + Number(item.occupiedSpaces) }), { capacity: 0, occupied: 0 }), [segments]);

  function alGuardar(saved) {
    setSegments((current) => current.some((item) => item.id === saved.id) ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]);
    setEditing(null);
  }

  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-semibold text-[#041E42]">Tramos configurables</h2><p className="mt-1 text-sm text-slate-600">La numeración identifica el tramo; la capacidad se declara según las plazas físicas disponibles.</p></div>
      <button onClick={() => setEditing({})} className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Crear tramo</button>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <Metric label="Tramos activos" value={segments.filter((item) => item.status === "ACTIVE").length} />
      <Metric label="Plazas ocupadas" value={totals.occupied} />
      <Metric label="Plazas disponibles" value={Math.max(totals.capacity - totals.occupied, 0)} />
    </div>
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr>{["Código","Tramo","Numeración","Lado","Capacidad","Ocupadas","Estado",""].map((item) => <th key={item} className="px-3 py-3">{item}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{segments.map((item) => <tr key={item.id}><td className="px-3 py-3 font-semibold text-[#3150D8]">{item.code}</td><td className="px-3 py-3 font-medium">{item.name}</td><td className="px-3 py-3">{item.fromNumber}–{item.toNumber}</td><td className="px-3 py-3">{SEGMENT_SIDE_LABELS[item.streetSide]}</td><td className="px-3 py-3">{item.capacity}</td><td className="px-3 py-3">{item.occupiedSpaces}</td><td className="px-3 py-3">{SEGMENT_STATUS_LABELS[item.status]}</td><td className="px-3 py-3 text-right"><button onClick={() => setEditing(item)} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-[#3150D8]" aria-label={`Modificar ${item.name}`}><Pencil className="h-4 w-4" />Modificar tramo</button></td></tr>)}</tbody>
      </table>
      {!segments.length ? <p className="p-8 text-center text-sm text-slate-500">No hay tramos configurados.</p> : null}
    </div>
    {editing ? <div className="rounded-3xl border border-[#BFD2FF] bg-[#F5F9FF] p-5">
      <div className="mb-4 flex items-center justify-between"><h3 className="font-semibold text-[#041E42]">{editing.id ? "Editar tramo" : "Crear tramo"}</h3><button type="button" onClick={() => setEditing(null)}><X className="h-5 w-5" /></button></div>
      <SegmentForm parking={parking} area={area} street={street} segment={editing.id ? editing : null} nextSortOrder={segments.length + 1} onSaved={alGuardar} onCancel={() => setEditing(null)} />
    </div> : null}
  </section>;
}

function Metric({ label, value }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-[#041E42]">{value}</p></div>; }
