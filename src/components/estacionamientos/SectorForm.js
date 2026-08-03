"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sanitizeSectorInput, STATE_LABELS, TYPE_LABELS, validateSectorInput } from "@/lib/estacionamientos.mjs";

const empty = { code: "", name: "", type: "OFF_STREET", status: "ACTIVE", capacity: 1, occupied: 0, notes: "", level: "", zone: "", locationDescription: "", accessCount: 0, exitCount: 0, street: "", from: "", to: "", district: "", segmentDescription: "" };

export default function SectorForm({ parking, sector = null, initialType = null }) {
  const editing = Boolean(sector);
  const router = useRouter();
  const [values, setValues] = useState(sector ? { ...empty, ...sector } : { ...empty, type: initialType || parking.type });
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const setValue = (field, value) => setValues((current) => ({ ...current, [field]: value }));

  async function submit(event) {
    event.preventDefault();
    const payload = sanitizeSectorInput(values);
    const validation = validateSectorInput(payload, parking.sectors, sector?.id);
    setErrors(validation);
    setRequestError("");
    if (Object.keys(validation).length) return;
    setSubmitting(true);
    try {
      const url = editing ? `/api/estacionamientos/${parking.code}/sectores/${sector.id}` : `/api/estacionamientos/${parking.code}/sectores`;
      const response = await fetch(url, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "No fue posible guardar el sector.");
      router.push(`/estacionamientos/${parking.code}#sectores`);
      router.refresh();
    } catch (error) {
      setRequestError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return <form onSubmit={submit} noValidate className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="mb-5 rounded-2xl border border-blue-200 bg-[#F5F9FF] px-4 py-3 text-sm text-slate-700">Cambiar el tipo no elimina silenciosamente los datos del otro tipo; solo se guardarán los campos compatibles con el tipo seleccionado.</div>
    {requestError && <p role="alert" className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{requestError}</p>}
    <div className="grid gap-4 md:grid-cols-2"><Input label="Código" field="code" values={values} setValue={setValue} error={errors.code} /><Input label="Nombre" field="name" values={values} setValue={setValue} error={errors.name} /><Select label="Tipo" field="type" values={values} setValue={setValue} options={TYPE_LABELS} error={errors.type} /><Select label="Estado" field="status" values={values} setValue={setValue} options={STATE_LABELS} error={errors.status} /><Input label="Capacidad total" field="capacity" type="number" min="1" values={values} setValue={setValue} error={errors.capacity} /><Input label="Unidades ocupadas" field="occupied" type="number" min="0" values={values} setValue={setValue} error={errors.occupied} />
      {values.type === "OFF_STREET" ? <><Input label="Nivel" field="level" values={values} setValue={setValue} error={errors.level} /><Input label="Zona" field="zone" values={values} setValue={setValue} error={errors.zone} /><Input label="Descripción de ubicación" field="locationDescription" values={values} setValue={setValue} /><Input label="Accesos asociados" field="accessCount" type="number" min="0" values={values} setValue={setValue} /><Input label="Salidas asociadas" field="exitCount" type="number" min="0" values={values} setValue={setValue} /></> : <><Input label="Calle" field="street" values={values} setValue={setValue} error={errors.street} /><Input label="Desde" field="from" values={values} setValue={setValue} error={errors.from} /><Input label="Hasta" field="to" values={values} setValue={setValue} error={errors.to} /><Input label="Comuna o zona" field="district" values={values} setValue={setValue} /><Input label="Descripción del tramo" field="segmentDescription" values={values} setValue={setValue} /></>}
      <label className="space-y-1.5 text-sm font-medium text-slate-700 md:col-span-2"><span>Observaciones</span><textarea rows="4" value={values.notes} onChange={(e) => setValue("notes", e.target.value)} className={fieldClass} /></label>
    </div>
    <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Link href={`/estacionamientos/${parking.code}#sectores`} className="rounded-full border border-slate-200 px-4 py-2 text-center text-sm font-semibold">Cancelar</Link><button disabled={submitting} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{submitting ? (editing ? "Modificando sector…" : "Creando sector…") : editing ? "Modificar sector" : "Crear sector"}</button></div>
  </form>;
}

const fieldClass = "w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]";
function Input({ label, field, values, setValue, error, ...props }) { return <label className="space-y-1.5 text-sm font-medium text-slate-700"><span>{label}</span><input {...props} value={values[field]} onChange={(e) => setValue(field, e.target.value)} className={fieldClass} />{error && <small className="block text-rose-700">{error}</small>}</label>; }
function Select({ label, field, values, setValue, options, error }) { return <label className="space-y-1.5 text-sm font-medium text-slate-700"><span>{label}</span><select value={values[field]} onChange={(e) => setValue(field, e.target.value)} className={fieldClass}>{Object.entries(options).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select>{error && <small className="block text-rose-700">{error}</small>}</label>; }
