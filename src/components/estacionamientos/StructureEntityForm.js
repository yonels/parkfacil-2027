"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { OPERATIONAL_STATES, sanitizeCapacityEntity, sanitizeLevelCreateInput, sanitizeOnStreetSector, validateLevel, validateLevelCreateInput, validateOnStreetSector, validateStreet, validateZone } from "@/lib/parkingOperations.mjs";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

const labels = { ACTIVE: "Activo", INACTIVE: "Inactivo", MAINTENANCE: "En mantenimiento" };
const bases = {
  sector: { code: "", name: "", status: "ACTIVE", description: "", notes: "" },
  level: { code: "", name: "", status: "ACTIVE", description: "", capacity: 0 },
  street: { name: "", status: "ACTIVE", capacity: 1, occupied: 0, district: "", notes: "" },
  zone: { code: "", name: "", status: "ACTIVE", capacity: 1, occupied: 0, description: "", notes: "" },
};

function initialValues(kind, entity) {
  const values = { ...bases[kind], ...(entity || {}) };
  for (const field of ["fromNumber", "toNumber", "capacity", "occupied"]) {
    if (field in values && typeof values[field] === "number" && !Number.isFinite(values[field])) values[field] = "";
  }
  return values;
}

export default function StructureEntityForm({ kind, parking, parent = null, entity = null }) {
  const router = useRouter();
  const editing = Boolean(entity);
  const [values, setValues] = useState(() => initialValues(kind, entity));
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const set = (field, value) => setValues((current) => ({ ...current, [field]: value }));
  const parentPath = kind === "street" ? `sectores/${parent.id}/calles` : kind === "zone" ? `niveles/${parent.id}/zonas` : `${kind === "sector" ? "sectores" : "niveles"}`;
  const endpoint = `/api/estacionamientos/${parking.code}/${parentPath}${editing ? `/${entity.id}` : ""}`;
  const cancelHref = `/estacionamientos/${parking.code}${parent ? `/${kind === "street" ? `sectores/${parent.id}` : `niveles/${parent.id}`}` : ""}`;

  async function submit(event) {
    event.preventDefault();
    const creatingLevel = kind === "level" && !editing;
    const payload = kind === "sector" ? sanitizeOnStreetSector(values) : kind === "level" ? { ...sanitizeLevelCreateInput(values), ...(editing ? { code: String(values.code || "").trim().toUpperCase() } : {}) } : sanitizeCapacityEntity(values);
    const validation = kind === "sector" ? validateOnStreetSector(payload) : creatingLevel ? validateLevelCreateInput(payload) : kind === "level" ? { ...validateLevel(payload), ...validateLevelCreateInput(payload) } : kind === "street" ? validateStreet(payload) : validateZone(payload);
    setErrors(validation);
    setRequestError("");
    if (Object.keys(validation).length) return;
    setSubmitting(true);
    try {
      const request = { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) };
      const response = await authenticatedFetch(endpoint, request);
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "No fue posible guardar.");
      router.push(creatingLevel ? `/estacionamientos/${parking.code}/niveles/${body.data.id}?created=${encodeURIComponent(body.data.code)}` : cancelHref);
      router.refresh();
    } catch (error) {
      setRequestError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (kind === "level") {
    return <form onSubmit={submit} noValidate className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      {requestError && <p role="alert" className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{requestError}</p>}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="font-semibold text-[#041E42]">Datos del nivel</h2><p className="text-xs text-slate-500">Edita los valores directamente en la tabla.</p></div>
        <p className="text-xs text-slate-400">Desplaza horizontalmente para ver todas las columnas</p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-300">
        <table className="w-full min-w-[1050px] border-collapse bg-white text-left text-sm">
          <thead className="bg-[#E2F0D9] text-[#041E42]">
            <tr>
              {["Código", "Nombre *", "Estado", "Cantidad de Plazas", "Descripción"].map((label) => <th key={label} className="border-b border-r border-slate-300 px-3 py-3 font-semibold last:border-r-0">{label}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr className="align-top">
              <SpreadsheetCell error={errors.code}>
                <input value={editing ? values.code ?? "" : "Automático"} readOnly className={spreadsheetReadOnlyClass} />
              </SpreadsheetCell>
              <SpreadsheetCell error={errors.name}>
                <input maxLength="120" value={values.name ?? ""} onChange={(e) => set("name", e.target.value)} className={spreadsheetInputClass} />
              </SpreadsheetCell>
              <SpreadsheetCell error={errors.status}>
                <select value={values.status ?? "ACTIVE"} onChange={(e) => set("status", e.target.value)} className={spreadsheetInputClass}>{OPERATIONAL_STATES.map((status) => <option key={status} value={status}>{labels[status]}</option>)}</select>
              </SpreadsheetCell>
              <SpreadsheetCell error={errors.capacity}>
                <input type="number" min="0" step="1" value={values.capacity ?? ""} onChange={(e) => set("capacity", e.target.value)} className={`${spreadsheetInputClass} tabular-nums`} />
              </SpreadsheetCell>
              <SpreadsheetCell error={errors.description}>
                <textarea maxLength="500" rows="2" value={values.description ?? ""} onChange={(e) => set("description", e.target.value)} className={`${spreadsheetInputClass} min-w-72 resize-y`} />
              </SpreadsheetCell>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-6 flex justify-end gap-3"><Link href={cancelHref} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold">Cancelar</Link><button disabled={submitting} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{submitting ? (editing ? "Modificando nivel…" : "Creando nivel…") : editing ? "Modificar nivel" : "Crear nivel"}</button></div>
    </form>;
  }

  return <form onSubmit={submit} noValidate className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    {requestError && <p role="alert" className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{requestError}</p>}
    <div className="grid gap-4 md:grid-cols-2">
      {kind !== "street" && !(kind === "level" && !editing) && <Field label="Código" error={errors.code}><input value={values.code ?? ""} readOnly={kind === "level"} onChange={(e) => set("code", kind === "sector" ? e.target.value.toUpperCase() : e.target.value)} maxLength={kind === "sector" ? 10 : undefined} className={`${inputClass} ${kind === "level" ? "bg-slate-100 text-slate-500" : ""}`} /></Field>}
      <Field label={kind === "street" ? "Nombre de la calle" : "Nombre *"} error={errors.name}><input maxLength={kind === "level" ? 120 : undefined} value={values.name ?? ""} onChange={(e) => set("name", e.target.value)} className={inputClass} /></Field>
      <Field label="Estado" error={errors.status}><select value={values.status ?? "ACTIVE"} onChange={(e) => set("status", e.target.value)} className={inputClass}>{OPERATIONAL_STATES.map((status) => <option key={status} value={status}>{labels[status]}</option>)}</select></Field>
      {(kind === "street" || kind === "zone") && <><Field label="Capacidad" error={errors.capacity}><input type="number" min="1" step="1" value={values.capacity ?? ""} onChange={(e) => set("capacity", e.target.value)} className={inputClass} /></Field><Field label="Unidades ocupadas" error={errors.occupied}><input type="number" min="0" step="1" value={values.occupied ?? ""} onChange={(e) => set("occupied", e.target.value)} className={inputClass} /></Field></>}
      {kind === "level" && <Field label="Cantidad de Plazas" error={errors.capacity}><input type="number" min="0" step="1" value={values.capacity ?? ""} onChange={(e) => set("capacity", e.target.value)} className={inputClass} /></Field>}
      {kind === "street" && <Field label="Comuna o zona (opcional)"><input value={values.district ?? ""} onChange={(e) => set("district", e.target.value)} className={inputClass} /></Field>}
      {(kind === "sector" || kind === "level" || kind === "zone") && <Field label="Descripción"><textarea maxLength={kind === "level" ? 500 : undefined} rows="3" value={values.description ?? ""} onChange={(e) => set("description", e.target.value)} className={inputClass} /></Field>}
      {kind !== "level" && <Field label="Observaciones"><textarea rows="3" value={values.notes ?? ""} onChange={(e) => set("notes", e.target.value)} className={inputClass} /></Field>}
    </div>
    <div className="mt-6 flex justify-end gap-3"><Link href={cancelHref} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold">Cancelar</Link><button disabled={submitting} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{submitting ? (editing ? "Modificando…" : "Creando…") : editing ? "Modificar" : "Crear"}</button></div>
  </form>;
}

function Field({ label, error, children }) {
  return <label className="space-y-1.5 text-sm font-medium text-slate-700"><span>{label}</span>{children}{error && <small className="block text-rose-700">{error}</small>}</label>;
}
function SpreadsheetCell({ error, children }) {
  return <td className={`border-r border-slate-200 p-0 last:border-r-0 ${error ? "bg-rose-50" : ""}`}>{children}{error && <small className="block border-t border-rose-200 px-3 py-1.5 text-rose-700">{error}</small>}</td>;
}
const inputClass = "w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]";
const spreadsheetInputClass = "min-h-12 w-full border-0 bg-transparent px-3 py-3 text-sm text-slate-800 outline-none focus:bg-[#FFF2CC] focus:ring-2 focus:ring-inset focus:ring-[#3150D8]";
const spreadsheetReadOnlyClass = "min-h-12 w-full border-0 bg-slate-100 px-3 py-3 text-sm font-semibold text-slate-500 outline-none";
