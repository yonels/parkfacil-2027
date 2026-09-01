"use client";
// Formulario de Tramo (crear/editar), extraído de StreetSegmentsManager para
// poder reutilizarse también desde el constructor "Nuevo proyecto" On Street
// (ver OnStreetProjectWizard.js) sin duplicar campos/validación/endpoint --
// ver "CORRECCIÓN UX/FUNCIONAL — ESTRUCTURA ON STREET Y EDICIÓN DE TRAMOS".
// StreetSegmentsManager sigue siendo dueño de la tabla/listado; este archivo
// es la ÚNICA implementación del formulario en sí, usada por ambos.
import { useState } from "react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

const emptySegment = { code: "", name: "", fromNumber: "", toNumber: "", streetSide: "BOTH", capacity: 1, occupiedSpaces: 0, status: "ACTIVE", sortOrder: 0, notes: "" };
export const SEGMENT_SIDE_LABELS = { BOTH: "Ambos lados", EVEN: "Lado par", ODD: "Lado impar" };
export const SEGMENT_STATUS_LABELS = { ACTIVE: "Activo", INACTIVE: "Inactivo", MAINTENANCE: "En mantenimiento" };

export function normalizeSegment(segment) {
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

// parking/area/street: mismas entidades ya seleccionadas en el flujo que
// contiene este formulario (ficha de Calle o constructor de Proyecto).
// segment: null para crear, o el tramo (ya normalizado o crudo) a editar.
// nextSortOrder: solo se usa para proponer un código/orden por defecto al crear.
export default function SegmentForm({ parking, area, street, segment = null, nextSortOrder = 1, onSaved, onCancel }) {
  const [form, setForm] = useState(() => segment
    ? normalizeSegment(segment)
    : { ...emptySegment, code: `TR-${String(nextSortOrder).padStart(3, "0")}`, sortOrder: nextSortOrder });
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const endpoint = `/api/estacionamientos/${parking.code}/sectores/${area.id}/calles/${street.id}/tramos`;

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
      onSaved(normalizeSegment(body.data));
    } catch (error) { setRequestError(error.message); } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {requestError ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{requestError}</p> : null}
      {errors.range ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{errors.range}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Código" error={errors.code}><input value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} className={inputClass} /></Field>
        <Field label="Nombre" error={errors.name}><input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} /></Field>
        <Field label="Numeración inicial" error={errors.fromNumber}><input type="number" min="0" value={form.fromNumber} onChange={(e) => set("fromNumber", e.target.value)} className={inputClass} /></Field>
        <Field label="Numeración final" error={errors.toNumber}><input type="number" min="0" value={form.toNumber} onChange={(e) => set("toNumber", e.target.value)} className={inputClass} /></Field>
        <Field label="Lado de la calle" error={errors.streetSide}><select value={form.streetSide} onChange={(e) => set("streetSide", e.target.value)} className={inputClass}>{Object.entries(SEGMENT_SIDE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
        <Field label="Capacidad en plazas" error={errors.capacity}><input type="number" min="1" value={form.capacity} onChange={(e) => set("capacity", e.target.value)} className={inputClass} /></Field>
        <Field label="Estado" error={errors.status}><select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputClass}>{Object.entries(SEGMENT_STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
        <Field label="Orden"><input type="number" min="0" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} className={inputClass} /></Field>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel ? <button type="button" onClick={onCancel} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold">Cancelar</button> : null}
        <button disabled={saving} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? (form.id ? "Modificando tramo..." : "Creando tramo...") : form.id ? "Modificar tramo" : "Crear tramo"}</button>
      </div>
    </form>
  );
}

function Field({ label, error, children }) { return <label className="text-sm font-medium text-slate-700"><span>{label}</span><span className="mt-1.5 block">{children}</span>{error ? <small className="mt-1 block text-red-700">{error}</small> : null}</label>; }
const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-[#3150D8]";
