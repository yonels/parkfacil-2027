"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sanitizeParkingInput, STATE_LABELS, TYPE_LABELS, validateParkingInput } from "@/lib/estacionamientos.mjs";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

const empty = { code: "", name: "", companyId: "", companyName: "", type: "OFF_STREET", status: "DRAFT", address: "", city: "", country: "Chile", schedule: "", description: "", accessCount: 0, exitCount: 0 };

function toDateTimeLocalValue(raw) {
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseScheduleRange(scheduleText) {
  const text = String(scheduleText || "").trim();
  const match = text.match(/^Inicio:\s*([^|]+)\|\s*T[eé]rmino:\s*(.+)$/i);
  if (!match) return { scheduleStart: "", scheduleEnd: "" };
  return {
    scheduleStart: toDateTimeLocalValue(match[1].trim()),
    scheduleEnd: toDateTimeLocalValue(match[2].trim()),
  };
}

function formatScheduleDisplay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
    hour12: false,
  }).format(date);
}

function buildScheduleValue(start, end, legacy = "") {
  if (start && end) {
    return `Inicio: ${formatScheduleDisplay(start)} | Término: ${formatScheduleDisplay(end)}`;
  }
  return legacy;
}

export default function EstacionamientoForm({ parking = null, structure = null }) {
  const editing = Boolean(parking);
  const router = useRouter();
  const formRef = useRef(null);
  const [values, setValues] = useState(() => {
    const base = { ...empty, ...(parking || {}) };
    const parsed = parseScheduleRange(base.schedule);
    return {
      ...base,
      scheduleStart: parsed.scheduleStart,
      scheduleEnd: parsed.scheduleEnd,
      scheduleLegacy: base.schedule || "",
    };
  });
  const [companies, setCompanies] = useState([]);
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState("");
  const [typeWarning, setTypeWarning] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const metrics = structure?.metrics || parking?.metrics || { capacity: 0, occupied: 0, available: 0, occupancyPercentage: 0 };
  const structureCount = parking?.type === "ON_STREET" ? structure?.sectors?.length || 0 : structure?.levels?.length || 0;
  const typeLocked = editing && (structureCount > 0 || Number(metrics.capacity) > 0 || Number(metrics.occupied) > 0);
  const setValue = (field, value) => setValues((current) => ({ ...current, [field]: value }));

  useEffect(() => {
    let active = true;
    authenticatedFetch("/api/empresas", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => { if (active && Array.isArray(body?.data)) setCompanies(body.data); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  function changeType(nextType) {
    if (typeLocked) {
      setTypeWarning("Este estacionamiento ya posee información operacional. Para cambiar de modelo debes suspenderlo y crear un nuevo estacionamiento relacionado.");
      return;
    }
    setTypeWarning("");
    setValues((current) => ({ ...current, type: nextType, ...(nextType === "ON_STREET" ? { accessCount: 0, exitCount: 0 } : {}) }));
  }

  function changeCompany(companyId) {
    const selected = companies.find((company) => company.id === companyId);
    setValues((current) => ({ ...current, companyId, companyName: selected?.nombreFantasia || selected?.razonSocial || current.companyName }));
  }

  async function submit(event) {
    event.preventDefault();
    const scheduleValidation = {};
    if (values.scheduleStart && !values.scheduleEnd) scheduleValidation.scheduleEnd = "Debes indicar la fecha y hora de término.";
    if (!values.scheduleStart && values.scheduleEnd) scheduleValidation.scheduleStart = "Debes indicar la fecha y hora de inicio.";
    if (values.scheduleStart && values.scheduleEnd && values.scheduleEnd <= values.scheduleStart) {
      scheduleValidation.scheduleEnd = "La fecha y hora de término debe ser posterior al inicio.";
    }
    const payload = sanitizeParkingInput({
      ...values,
      schedule: buildScheduleValue(values.scheduleStart, values.scheduleEnd, values.scheduleLegacy),
    });
    const validation = validateParkingInput(payload, [], parking?.id);
    const mergedValidation = { ...validation, ...scheduleValidation };
    setErrors(mergedValidation);
    setRequestError("");
    if (Object.keys(mergedValidation).length) {
      const firstField = Object.keys(mergedValidation)[0];
      window.setTimeout(() => formRef.current?.querySelector(`[data-field="${firstField}"]`)?.focus(), 0);
      return;
    }
    setSubmitting(true);
    try {
      const url = editing ? `/api/estacionamientos/${parking.code}` : "/api/estacionamientos";
      const response = await authenticatedFetch(url, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (body?.details) setErrors(body.details);
        throw new Error(body?.error || "No fue posible guardar el estacionamiento.");
      }
      router.push(`/estacionamientos/${body.data.code}/configuracion`);
      router.refresh();
    } catch (error) {
      setRequestError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  const onStreet = values.type === "ON_STREET";
  const cancelHref = editing ? `/estacionamientos/${parking.code}` : "/estacionamientos";
  return <form ref={formRef} onSubmit={submit} noValidate className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    {requestError && <p role="alert" className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{requestError}</p>}
    {typeWarning && <p role="alert" className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{typeWarning}</p>}
    <section>
      <h2 className="mb-4 text-lg font-semibold text-[#041E42]">Datos generales</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Código" error={errors.code}><input data-field="code" value={values.code} readOnly={editing} onChange={(e) => setValue("code", e.target.value)} className={inputClass(editing)} />{editing && <small className="text-slate-500">El código permanece estable para conservar enlaces y relaciones.</small>}</Field>
        <Field label="Nombre" error={errors.name}><input data-field="name" value={values.name} onChange={(e) => setValue("name", e.target.value)} className={inputClass()} /></Field>
        <Field label="Empresa" error={errors.companyId}><select data-field="companyId" value={values.companyId} onChange={(e) => changeCompany(e.target.value)} className={inputClass()}><option value="">{values.companyName ? `Seleccionar (${values.companyName})` : "Seleccionar empresa"}</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.nombreFantasia || company.razonSocial}</option>)}</select></Field>
        <Field label="Modelo operacional" error={errors.type}><select data-field="type" value={values.type} disabled={typeLocked} onChange={(e) => changeType(e.target.value)} className={inputClass(typeLocked)}>{Object.entries(TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>{typeLocked && <small className="text-slate-500">El modelo queda bloqueado cuando existe información operacional.</small>}</Field>
        <Field label="Estado" error={errors.status}><select data-field="status" value={values.status} onChange={(e) => setValue("status", e.target.value)} className={inputClass()}>{Object.entries(STATE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
        <Field label="Dirección" error={errors.address}><input data-field="address" value={values.address} onChange={(e) => setValue("address", e.target.value)} className={inputClass()} /></Field>
        <Field label="Ciudad" error={errors.city}><input data-field="city" value={values.city} onChange={(e) => setValue("city", e.target.value)} className={inputClass()} /></Field>
        <Field label="País"><input value={values.country} onChange={(e) => setValue("country", e.target.value)} className={inputClass()} /></Field>
        <Field label="Inicio (fecha y hora)" error={errors.scheduleStart}><input data-field="scheduleStart" type="datetime-local" value={values.scheduleStart || ""} onChange={(e) => setValue("scheduleStart", e.target.value)} className={inputClass()} /></Field>
        <Field label="Término (fecha y hora)" error={errors.scheduleEnd}><input data-field="scheduleEnd" type="datetime-local" value={values.scheduleEnd || ""} onChange={(e) => setValue("scheduleEnd", e.target.value)} className={inputClass()} /></Field>
        {!onStreet && <><Field label="Accesos declarados" error={errors.accessCount}><input data-field="accessCount" type="number" min="0" step="1" value={values.accessCount} onChange={(e) => setValue("accessCount", e.target.value)} className={inputClass()} /></Field><Field label="Salidas declaradas" error={errors.exitCount}><input data-field="exitCount" type="number" min="0" step="1" value={values.exitCount} onChange={(e) => setValue("exitCount", e.target.value)} className={inputClass()} /></Field></>}
        <Field label="Descripción" wide><textarea rows="4" value={values.description} onChange={(e) => setValue("description", e.target.value)} placeholder="Describe la instalación y sus condiciones generales." className={inputClass()} /></Field>
      </div>
    </section>
    <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <h2 className="text-lg font-semibold text-[#041E42]">Estructura operacional</h2>
      <h3 className="mt-3 font-semibold text-[#3150D8]">{onStreet ? "Áreas, calles y tramos" : "Niveles y zonas"}</h3>
      <p className="mt-1 text-sm text-slate-600">{onStreet ? "Define áreas operacionales, sus calles y tramos por numeración. La capacidad se expresa en plazas configurables por tramo." : "Define niveles, zonas y sus cantidades de plazas. Los accesos y salidas pertenecen exclusivamente a este modelo."}</p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5"><Summary label={onStreet ? "Áreas" : "Niveles"} value={structureCount} /><Summary label="Plazas" value={metrics.capacity} /><Summary label="Ocupadas" value={metrics.occupied} /><Summary label="Disponibles" value={metrics.available} /><Summary label="Ocupación" value={`${metrics.occupancyPercentage}%`} /></div>
      {parking && <div className="mt-4 flex flex-wrap gap-2"><Link href={`/estacionamientos/${parking.code}/${onStreet ? "sectores" : "niveles"}`} className="rounded-full border border-[#3150D8] px-4 py-2 text-sm font-semibold text-[#3150D8]">Administrar estructura</Link><Link href={`/estacionamientos/${parking.code}/${onStreet ? "sectores" : "niveles"}/nuevo`} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white">{onStreet ? "Crear área" : "Crear nivel"}</Link></div>}
    </section>
    <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Link href={cancelHref} className="rounded-full border border-slate-200 px-4 py-2 text-center text-sm font-semibold">Cancelar</Link><button disabled={submitting} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{submitting ? (editing ? "Modificando estacionamiento…" : "Creando estacionamiento…") : editing ? "Modificar estacionamiento" : "Crear estacionamiento"}</button></div>
  </form>;
}

function Summary({ label, value }) { return <div className="rounded-xl bg-white p-3 text-center"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold tabular-nums text-[#041E42]">{value}</p></div>; }
function Field({ label, error, wide, children }) { return <label className={`space-y-1.5 text-sm font-medium text-slate-700 ${wide ? "md:col-span-2" : ""}`}><span>{label}</span>{children}{error && <small className="block text-rose-700">{error}</small>}</label>; }
function inputClass(readonly = false) { return `w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#3150D8] ${readonly ? "bg-slate-100 text-slate-500" : "bg-white"}`; }
