"use client";
// Formulario de Tramo para Proyectos On Street (corrección UX 2026-08-29).
// EXCLUSIVO de pantallas On Street (OnStreetProjectWizard) -- NO reemplaza
// ni modifica SegmentForm.js/StreetSegmentsManager.js, que siguen sirviendo
// tal cual a Off Street (StructureRoute.js) sin ningún cambio de
// comportamiento. Reutiliza el MISMO endpoint/validación/persistencia (solo
// UX distinta): Tramo se elige como letra (A, B, C...) en vez del número
// técnico "Orden", y el Código se asigna solo, nunca lo escribe el usuario.
//
// Al editar, primero pide el registro COMPLETO del tramo (GET .../tramos,
// que ya devuelve todas las columnas) -- nunca hidrata el formulario con el
// objeto resumido de /locations/options (sin numeración/capacidad/estado),
// que era la causa real de que Editar perdiera datos y de "Selecciona un
// estado válido" (el resumen no traía `status`, sanitizeStreetSegment lo
// convertía en null).
import { useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { sortOrderToLetter, letterToSortOrder, nextAvailableSortOrder } from "@/lib/parkingSegments.mjs";
import { SEGMENT_SIDE_LABELS, SEGMENT_STATUS_LABELS } from "@/components/estacionamientos/SegmentForm";

const emptyValues = { name: "", fromNumber: "", toNumber: "", streetSide: "BOTH", capacity: 1, occupiedSpaces: 0, status: "ACTIVE", notes: "" };

// parking/area/street: entidades ya elegidas en el Proyecto. segmentId: null
// para crear, o el id del tramo a editar (se resuelve el registro completo
// acá mismo, el llamador no necesita tenerlo).
export default function OnStreetSegmentForm({ parking, area, street, segmentId = null, onSaved, onCancel }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [existing, setExisting] = useState([]); // otros tramos de esta calle (letras ya usadas)
  const [current, setCurrent] = useState(null); // registro completo del tramo en edición
  const [values, setValues] = useState(emptyValues);
  const [sortOrder, setSortOrder] = useState(1);
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState("");
  const [saving, setSaving] = useState(false);
  const endpoint = `/api/estacionamientos/${parking.code}/sectores/${area.id}/calles/${street.id}/tramos`;
  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }));

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await authenticatedFetch(endpoint, { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No fue posible cargar los tramos de esta calle.");
        if (!active) return;
        const rows = body.data || [];
        setExisting(rows);
        if (segmentId) {
          const match = rows.find((row) => row.id === segmentId);
          if (!match) throw new Error("El tramo seleccionado ya no existe. Vuelve a elegirlo.");
          setCurrent(match);
          setValues({ name: match.name, fromNumber: match.from_number, toNumber: match.to_number, streetSide: match.street_side, capacity: match.capacity, occupiedSpaces: match.occupied_spaces, status: match.status, notes: match.notes || "" });
          setSortOrder(match.sort_order);
        } else {
          setSortOrder(nextAvailableSortOrder(rows.map((row) => row.sort_order)));
        }
      } catch (cause) {
        if (active) setLoadError(cause.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [endpoint, segmentId]);

  // Letras disponibles: A...Z como mínimo, o hasta 5 más allá de la más alta
  // ya usada -- no una lista infinita, pero sin limitar artificialmente a 26
  // si la calle realmente tiene más tramos. La letra del propio tramo (al
  // editar) siempre se incluye, aunque ya esté "usada" por él mismo.
  const letterOptions = useMemo(() => {
    const usedByOthers = new Set(existing.filter((row) => row.id !== segmentId).map((row) => row.sort_order));
    const highest = existing.reduce((max, row) => Math.max(max, row.sort_order), 0);
    const upTo = Math.max(26, highest + 5);
    const options = [];
    for (let n = 1; n <= upTo; n += 1) options.push({ value: n, letter: sortOrderToLetter(n), taken: usedByOthers.has(n) });
    return options;
  }, [existing, segmentId]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true); setErrors({}); setRequestError("");
    try {
      const payload = {
        // El código nunca lo decide este formulario: en creación se omite
        // (el backend lo asigna, ver route.js de tramos); al editar se
        // reenvía el existente sin cambios -- "el código no cambia".
        code: current?.code || "",
        name: values.name, fromNumber: Number(values.fromNumber), toNumber: Number(values.toNumber),
        streetSide: values.streetSide, capacity: Number(values.capacity), occupiedSpaces: Number(values.occupiedSpaces),
        status: values.status, sortOrder, notes: values.notes,
      };
      const response = await authenticatedFetch(current ? `${endpoint}/${current.id}` : endpoint, {
        method: current ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        if (body.details) setErrors(body.details);
        throw new Error(body.error || "No fue posible guardar el tramo.");
      }
      onSaved(body.data);
    } catch (cause) {
      setRequestError(cause.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Cargando datos del tramo…</p>;
  if (loadError) return <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{loadError}</p>;

  return (
    <form onSubmit={submit} className="space-y-4">
      {requestError ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{requestError}</p> : null}
      {errors.range ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{errors.range}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Cierre integral del flujo (2026-08-30, §9/§10/§13): la Calle
            SIEMPRE llega resuelta por el contexto (Proyecto o ficha de
            Calle) -- nunca hay un dropdown de Calle aquí, se muestra fija
            de solo lectura, con su street_id real ya usado por el endpoint. */}
        <Field label="Calle"><input value={street.name} readOnly disabled className={`${inputClass} bg-slate-100 text-slate-500`} /></Field>
        <Field label="Tramo" error={errors.sortOrder}>
          <select value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} className={inputClass}>
            {letterOptions.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.taken}>{opt.letter}{opt.taken ? " (ya en uso)" : ""}</option>
            ))}
          </select>
        </Field>
        {current ? <Field label="Código"><input value={current.code} readOnly disabled className={`${inputClass} bg-slate-100 text-slate-500`} /></Field> : null}
        <Field label="Nombre" error={errors.name}><input value={values.name} onChange={(e) => set("name", e.target.value)} className={inputClass} /></Field>
        <Field label="Numeración inicial" error={errors.fromNumber}><input type="number" min="0" value={values.fromNumber} onChange={(e) => set("fromNumber", e.target.value)} className={inputClass} /></Field>
        <Field label="Numeración final" error={errors.toNumber}><input type="number" min="0" value={values.toNumber} onChange={(e) => set("toNumber", e.target.value)} className={inputClass} /></Field>
        <Field label="Lado de la calle" error={errors.streetSide}><select value={values.streetSide} onChange={(e) => set("streetSide", e.target.value)} className={inputClass}>{Object.entries(SEGMENT_SIDE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
        <Field label="Capacidad en plazas" error={errors.capacity}><input type="number" min="1" value={values.capacity} onChange={(e) => set("capacity", e.target.value)} className={inputClass} /></Field>
        <Field label="Estado" error={errors.status}><select value={values.status} onChange={(e) => set("status", e.target.value)} className={inputClass}>{Object.entries(SEGMENT_STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel ? <button type="button" onClick={onCancel} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold">Cancelar</button> : null}
        <button disabled={saving} className="rounded-full bg-[var(--pf-color-onstreet-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? (current ? "Modificando tramo..." : "Creando tramo...") : current ? "Modificar tramo" : "Crear tramo"}</button>
      </div>
    </form>
  );
}

function Field({ label, error, children }) { return <label className="text-sm font-medium text-slate-700"><span>{label}</span><span className="mt-1.5 block">{children}</span>{error ? <small className="mt-1 block text-red-700">{error}</small> : null}</label>; }
const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-[var(--pf-color-onstreet-primary)]";
