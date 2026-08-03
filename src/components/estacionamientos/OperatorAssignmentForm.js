"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getUsuariosDemo } from "@/data/usuarios.mjs";
import { validateOperatorAssignment } from "@/lib/parkingOperations.mjs";

const operators = getUsuariosDemo().filter((user) => user.perfilPrincipal === "operator" || user.perfilesSecundarios?.includes("operator"));
const empty = { operatorId: "", numberFrom: "", numberTo: "", maxVehicles: "", validFrom: "", validUntil: "", startTime: "", endTime: "", daysOfWeek: [1,2,3,4,5], status: "ACTIVE", supervisorId: "", notes: "" };

export default function OperatorAssignmentForm({ parking, sector, street, assignment = null }) {
  const router = useRouter();
  const [values, setValues] = useState({ ...empty, ...(assignment || {}) });
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const set = (field, value) => setValues((current) => ({ ...current, [field]: value }));
  const base = `/estacionamientos/${parking.code}/sectores/${sector.id}/calles/${street.id}/operadores`;
  async function submit(event) {
    event.preventDefault();
    const validation = validateOperatorAssignment(values, street);
    setErrors(validation);
    if (Object.keys(validation).length) return;
    setSubmitting(true);
    try {
      const endpoint = assignment ? `/api/estacionamientos/${parking.code}/asignaciones/${assignment.id}` : `/api/estacionamientos/${parking.code}/sectores/${sector.id}/calles/${street.id}/operadores`;
      const response = await fetch(endpoint, { method: assignment ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "No fue posible guardar la asignación.");
      router.push(base); router.refresh();
    } catch (error) { setRequestError(error.message); } finally { setSubmitting(false); }
  }
  return <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">{requestError && <p role="alert" className="mb-4 rounded-2xl bg-rose-50 p-3 text-sm text-rose-800">{requestError}</p>}<div className="grid gap-4 md:grid-cols-2">
    <Field label="Operador" error={errors.operatorId}><select value={values.operatorId ?? ""} onChange={(e) => set("operatorId", e.target.value)} className={inputClass}><option value="">Seleccionar</option>{operators.map((user) => <option key={user.id} value={user.id}>{user.nombreCompleto}</option>)}</select></Field>
    <Field label="Estado"><select value={values.status ?? "ACTIVE"} onChange={(e) => set("status", e.target.value)} className={inputClass}><option value="ACTIVE">Activa</option><option value="INACTIVE">Inactiva</option></select></Field>
    <Field label="Desde número" error={errors.numberFrom}><input type="number" value={values.numberFrom ?? ""} onChange={(e) => set("numberFrom", e.target.value)} className={inputClass} /></Field><Field label="Hasta número" error={errors.numberTo}><input type="number" value={values.numberTo ?? ""} onChange={(e) => set("numberTo", e.target.value)} className={inputClass} /></Field>
    <Field label="Máximo administrable" error={errors.maxVehicles}><input type="number" min="1" value={values.maxVehicles ?? ""} onChange={(e) => set("maxVehicles", e.target.value)} className={inputClass} /></Field>
    <Field label="Inicio de vigencia"><input type="date" value={values.validFrom ?? ""} onChange={(e) => set("validFrom", e.target.value)} className={inputClass} /></Field><Field label="Término de vigencia (opcional)"><input type="date" value={values.validUntil ?? ""} onChange={(e) => set("validUntil", e.target.value)} className={inputClass} /></Field>
    <Field label="Hora de inicio" error={errors.startTime}><input type="time" value={values.startTime ?? ""} onChange={(e) => set("startTime", e.target.value)} className={inputClass} /></Field><Field label="Hora de término" error={errors.endTime}><input type="time" value={values.endTime ?? ""} onChange={(e) => set("endTime", e.target.value)} className={inputClass} /></Field>
    <Field label="Supervisor (opcional)"><select value={values.supervisorId ?? ""} onChange={(e) => set("supervisorId", e.target.value)} className={inputClass}><option value="">Sin supervisor</option>{getUsuariosDemo().map((user) => <option key={user.id} value={user.id}>{user.nombreCompleto}</option>)}</select></Field>
    <Field label="Observaciones"><textarea value={values.notes ?? ""} onChange={(e) => set("notes", e.target.value)} className={inputClass} /></Field>
  </div><p className="mt-4 text-xs text-slate-500">El rango representa responsabilidad territorial; no corresponde a plazas físicas individuales.</p><div className="mt-6 flex justify-end gap-3"><Link href={base} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold">Cancelar</Link><button disabled={submitting} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white">{submitting ? "Creando asignación…" : "Crear asignación"}</button></div></form>;
}
function Field({ label, error, children }) { return <label className="space-y-1.5 text-sm font-medium text-slate-700"><span>{label}</span>{children}{error && <small className="block text-rose-700">{error}</small>}</label>; }
const inputClass = "w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]";
