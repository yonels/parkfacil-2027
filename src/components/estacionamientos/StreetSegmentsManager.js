"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

const empty = { code: "", name: "", fromNumber: "", toNumber: "", streetSide: "BOTH", capacity: 1, occupiedSpaces: 0, status: "ACTIVE", sortOrder: 0, notes: "" };
const sideLabels = { BOTH: "Ambos lados", EVEN: "Lado par", ODD: "Lado impar" };
const statusLabels = { ACTIVE: "Activo", INACTIVE: "Inactivo", MAINTENANCE: "En mantenimiento" };

function normalize(segment) {
  return {
    id: segment.id,
    code: segment.code,
    name: segment.name,
    fromNumber: segment.fromNumber ?? segment.from_number,
    toNumber: segment.toNumber ?? segment.to_number,
    streetSide: segment.streetSide ?? segment.street_side,
    capacity: segment.capacity,
    occupiedSpaces: segment.occupiedSpaces ?? segment.occupied_spaces ?? 0,
    status: segment.status,
    sortOrder: segment.sortOrder ?? segment.sort_order ?? 0,
    notes: segment.notes || "",
  };
}

export default function StreetSegmentsManager({ parking, area, street }) {
  const [segments, setSegments] = useState((street.segments || []).map(normalize));
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState("");
  const [saving, setSaving] = useState(false);
  const totals = useMemo(() => segments.filter((item) => item.status === "ACTIVE").reduce((sum, item) => ({ capacity: sum.capacity + Number(item.capacity), occupied: sum.occupied + Number(item.occupiedSpaces) }), { capacity: 0, occupied: 0 }), [segments]);
  const endpoint = `/api/estacionamientos/${parking.code}/sectores/${area.id}/calles/${street.id}/tramos`;
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  function startCreate() {
    setErrors({}); setRequestError("");
    const next = segments.length + 1;
    setForm({ ...empty, code: `TR-${String(next).padStart(3, "0")}`, sortOrder: next });
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true); setErrors({}); setRequestError("");
    try {
      const response = await authenticatedFetch(form.id ? `${endpoint}/${form.id}` : endpoint, {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await response.json();
      if (!response.ok) {
        if (body.details) setErrors(body.details);
        throw new Error(body.error || "No fue posible guardar el tramo.");
      }
      const saved = normalize(body.data);
      setSegments((current) => form.id ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]);
      setForm(null);
    } catch (error) { setRequestError(error.message); } finally { setSaving(false); }
  }

  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-semibold text-[#041E42]">Tramos configurables</h2><p className="mt-1 text-sm text-slate-600">La numeración identifica el tramo; la capacidad se declara según las plazas físicas disponibles.</p></div>
      <button onClick={startCreate} className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Crear tramo</button>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <Metric label="Tramos activos" value={segments.filter((item) => item.status === "ACTIVE").length} />
      <Metric label="Plazas ocupadas" value={totals.occupied} />
      <Metric label="Plazas disponibles" value={Math.max(totals.capacity - totals.occupied, 0)} />
    </div>
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr>{["Código","Tramo","Numeración","Lado","Capacidad","Ocupadas","Estado",""].map((item) => <th key={item} className="px-3 py-3">{item}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{segments.map((item) => <tr key={item.id}><td className="px-3 py-3 font-semibold text-[#3150D8]">{item.code}</td><td className="px-3 py-3 font-medium">{item.name}</td><td className="px-3 py-3">{item.fromNumber}–{item.toNumber}</td><td className="px-3 py-3">{sideLabels[item.streetSide]}</td><td className="px-3 py-3">{item.capacity}</td><td className="px-3 py-3">{item.occupiedSpaces}</td><td className="px-3 py-3">{statusLabels[item.status]}</td><td className="px-3 py-3 text-right"><button onClick={() => { setErrors({}); setRequestError(""); setForm(item); }} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-[#3150D8]" aria-label={`Modificar ${item.name}`}><Pencil className="h-4 w-4" />Modificar tramo</button></td></tr>)}</tbody>
      </table>
      {!segments.length ? <p className="p-8 text-center text-sm text-slate-500">No hay tramos configurados.</p> : null}
    </div>
    {form ? <form onSubmit={submit} className="rounded-3xl border border-[#BFD2FF] bg-[#F5F9FF] p-5">
      <div className="flex items-center justify-between"><h3 className="font-semibold text-[#041E42]">{form.id ? "Editar tramo" : "Crear tramo"}</h3><button type="button" onClick={() => setForm(null)}><X className="h-5 w-5" /></button></div>
      {requestError ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{requestError}</p> : null}
      {errors.range ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{errors.range}</p> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Código" error={errors.code}><input value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} className={inputClass} /></Field>
        <Field label="Nombre" error={errors.name}><input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} /></Field>
        <Field label="Numeración inicial" error={errors.fromNumber}><input type="number" min="0" value={form.fromNumber} onChange={(e) => set("fromNumber", e.target.value)} className={inputClass} /></Field>
        <Field label="Numeración final" error={errors.toNumber}><input type="number" min="0" value={form.toNumber} onChange={(e) => set("toNumber", e.target.value)} className={inputClass} /></Field>
        <Field label="Lado de la calle" error={errors.streetSide}><select value={form.streetSide} onChange={(e) => set("streetSide", e.target.value)} className={inputClass}>{Object.entries(sideLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
        <Field label="Capacidad en plazas" error={errors.capacity}><input type="number" min="1" value={form.capacity} onChange={(e) => set("capacity", e.target.value)} className={inputClass} /></Field>
        <Field label="Estado" error={errors.status}><select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputClass}>{Object.entries(statusLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
        <Field label="Orden"><input type="number" min="0" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} className={inputClass} /></Field>
      </div>
      <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setForm(null)} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold">Cancelar</button><button disabled={saving} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? (form.id ? "Modificando tramo..." : "Creando tramo...") : form.id ? "Modificar tramo" : "Crear tramo"}</button></div>
    </form> : null}
  </section>;
}

function Field({ label, error, children }) { return <label className="text-sm font-medium text-slate-700"><span>{label}</span><span className="mt-1.5 block">{children}</span>{error ? <small className="mt-1 block text-red-700">{error}</small> : null}</label>; }
function Metric({ label, value }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-[#041E42]">{value}</p></div>; }
const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-[#3150D8]";
