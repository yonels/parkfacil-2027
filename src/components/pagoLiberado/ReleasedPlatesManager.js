"use client";

// Off Street → Pago liberado gestionado por el cliente (SOL-2026-10-28-003,
// prototipo v5 aprobado el 2026-10-28). El administrador de la empresa activa
// el módulo por estacionamiento y gestiona las patentes liberadas (CRUD,
// importación desde Excel). ParkFacil Root no interviene: si la API responde
// 403 (Root u otro rol), la página muestra la vista anterior.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileUp, LoaderCircle, Plus, RefreshCw, X } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import {
  describeDuration,
  displayReleasedPlate,
  normalizeReleasedPlate,
  normalizeRut,
  PLATE_STATUS,
  PLATE_STATUS_LABELS,
  releasedPlateStatus,
  releasedTicketDetail,
  releasedTicketLabel,
  suggestedEndMs,
} from "@/lib/releasedPlates/releasedPlateCore.mjs";
import { formatLocalDateTime, parseLocalDateTime, toLocalInputValue } from "@/lib/releasedPayment/zonedTime.mjs";

const STATUS_TONE = {
  CURRENT: "bg-emerald-50 text-emerald-700",
  SCHEDULED: "bg-amber-50 text-amber-800",
  EXPIRED: "bg-slate-100 text-slate-600",
  FINISHED: "bg-slate-100 text-slate-600",
  EXHAUSTED: "bg-slate-100 text-slate-600",
  DELETED: "bg-red-50 text-red-700",
};
const USAGE_LABEL = { MULTIPLE: "Entradas múltiples", SINGLE: "Una sola entrada", MAX: "Máximo de usos" };
const EVENT_LABEL = { CREATED: "Creada", IMPORTED: "Importada desde Excel", UPDATED: "Editada", FINISHED: "Finalizada", DELETED: "Eliminada", RESTORED: "Restaurada", USED: "Entrada" };

const emptyForm = () => ({
  plate: "", durationQuantity: "1", durationUnit: "DAY", validFrom: toLocalInputValue(Date.now()), validTo: "",
  modality: "FREE", usageMode: "MULTIPLE", maxUses: "5",
  thirdPartyName: "", thirdPartyRut: "", thirdPartyEmail: "", thirdPartyAmount: "", thirdPartyCurrency: "UF",
  beneficiaryName: "", beneficiaryRut: "", beneficiaryPhone: "", beneficiaryEmail: "", reason: "",
});

const fmt = (value) => formatLocalDateTime(value);
const money = (tp) => (tp.currency === "CLP" ? `$${Number(tp.amount).toLocaleString("es-CL")}` : `UF ${Number(tp.amount).toLocaleString("es-CL")}`);
const usageText = (a) => (a.usageMode === "MULTIPLE" ? `${a.usesCount} ${a.usesCount === 1 ? "entrada" : "entradas"}` : `${a.usesCount} de ${a.maxUses} ${a.maxUses === 1 ? "entrada" : "usos"}`);

function suggestEnd(form) {
  const start = parseLocalDateTime(form.validFrom);
  const end = start === null ? null : suggestedEndMs(start, Number(form.durationQuantity), form.durationUnit);
  return end === null ? "" : toLocalInputValue(end);
}

function missingFields(form) {
  const list = [["plate", "Patente"], ["validFrom", "Inicio"], ["validTo", "Término"], ["beneficiaryName", "Nombre"], ["beneficiaryRut", "RUT"], ["beneficiaryPhone", "Teléfono"], ["beneficiaryEmail", "Correo"], ["reason", "Motivo / referencia"]];
  if (form.modality === "THIRD_PARTY") list.push(["thirdPartyName", "Razón social del tercero"], ["thirdPartyRut", "RUT del tercero"], ["thirdPartyEmail", "Correo de facturación"], ["thirdPartyAmount", "Valor a facturar"]);
  if (form.usageMode === "MAX") list.push(["maxUses", "Máximo de usos"]);
  return list.filter(([key]) => !String(form[key] ?? "").trim());
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

function Field({ label, required = false, className = "", children, hint }) {
  return (
    <label className={`block text-sm font-semibold text-slate-600 ${className}`}>
      {label}{required ? <span className="text-red-600"> *</span> : null}
      <div className="mt-1">{children}</div>
      {hint ? <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span> : null}
    </label>
  );
}

export default function ReleasedPlatesManager({ onForbidden }) {
  const [state, setState] = useState({ loading: true, error: "", parkings: [], authorizations: [], storageReady: true });
  const [form, setForm] = useState(null);
  const [editing, setEditing] = useState(null);
  const [termManual, setTermManual] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState([]);
  const [notice, setNotice] = useState({ tone: "", text: "" });
  const [filters, setFilters] = useState({ text: "", status: "all", deleted: false });
  const [detail, setDetail] = useState(null);
  const [importState, setImportState] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const response = await authenticatedFetch("/api/pago-liberado/patentes", { cache: "no-store" });
      const body = await readJson(response);
      if (response.status === 403) { onForbidden?.(); return; }
      if (!response.ok) throw new Error(body.error || "No fue posible cargar Pago liberado.");
      setState({ loading: false, error: "", ...body.data });
      setNow(Date.now());
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "No fue posible cargar Pago liberado." }));
    }
  }, [onForbidden]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const anyEnabled = state.parkings.some((p) => p.enabled);
  const statusOf = useCallback((a) => releasedPlateStatus(a, now), [now]);

  const counts = useMemo(() => {
    const result = { CURRENT: 0, SCHEDULED: 0, closed: 0, total: 0 };
    for (const a of state.authorizations) {
      const s = statusOf(a);
      if (s === PLATE_STATUS.DELETED) continue;
      result.total += 1;
      if (s === PLATE_STATUS.CURRENT) result.CURRENT += 1;
      else if (s === PLATE_STATUS.SCHEDULED) result.SCHEDULED += 1;
      else result.closed += 1;
    }
    return result;
  }, [state.authorizations, statusOf]);

  const rows = useMemo(() => {
    const q = filters.text.trim().toUpperCase().replace(/[^A-Z0-9@.]/g, "");
    return state.authorizations.filter((a) => {
      const s = statusOf(a);
      if (s === PLATE_STATUS.DELETED && !filters.deleted) return false;
      if (filters.status === "current" && s !== PLATE_STATUS.CURRENT) return false;
      if (filters.status === "scheduled" && s !== PLATE_STATUS.SCHEDULED) return false;
      if (filters.status === "closed" && ![PLATE_STATUS.EXPIRED, PLATE_STATUS.FINISHED, PLATE_STATUS.EXHAUSTED].includes(s)) return false;
      if (q && ![a.licensePlate, a.displayPlate, a.beneficiaryRut, a.beneficiaryEmail, a.beneficiaryName].some((v) => String(v || "").toUpperCase().replace(/[^A-Z0-9@.]/g, "").includes(q))) return false;
      return true;
    });
  }, [state.authorizations, filters, statusOf]);

  function openForm(authorization = null) {
    setEditing(authorization);
    setFormErrors([]);
    setNotice({ tone: "", text: "" });
    if (!authorization) {
      const initial = emptyForm();
      setForm({ ...initial, validTo: suggestEnd(initial) });
      setTermManual(false);
      return;
    }
    setTermManual(!authorization.durationUnit);
    setForm({
      plate: authorization.displayPlate,
      durationQuantity: String(authorization.durationQuantity || 1), durationUnit: authorization.durationUnit || "DAY",
      validFrom: toLocalInputValue(authorization.validFrom), validTo: toLocalInputValue(authorization.validTo),
      modality: authorization.modality, usageMode: authorization.usageMode, maxUses: String(authorization.maxUses || 5),
      thirdPartyName: authorization.thirdParty?.name || "", thirdPartyRut: authorization.thirdParty?.rut || "", thirdPartyEmail: authorization.thirdParty?.email || "",
      thirdPartyAmount: authorization.thirdParty ? String(authorization.thirdParty.amount) : "", thirdPartyCurrency: authorization.thirdParty?.currency || "UF",
      beneficiaryName: authorization.beneficiaryName, beneficiaryRut: authorization.beneficiaryRut, beneficiaryPhone: authorization.beneficiaryPhone,
      beneficiaryEmail: authorization.beneficiaryEmail, reason: authorization.reason,
    });
  }

  // Cambiar cantidad o unidad vuelve a sugerir el término; cambiar el inicio
  // lo sugiere solo si el término no se escribió a mano.
  function change(key, value) {
    const manual = ["durationQuantity", "durationUnit"].includes(key) ? false : termManual;
    if (manual !== termManual) setTermManual(manual);
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (["durationQuantity", "durationUnit", "validFrom"].includes(key) && !manual) next.validTo = suggestEnd(next) || next.validTo;
      return next;
    });
  }

  const missing = form ? missingFields(form) : [];

  async function save(event) {
    event.preventDefault();
    if (missing.length || saving) return;
    setSaving(true);
    setFormErrors([]);
    const payload = {
      ...form,
      durationQuantity: termManual ? null : Number(form.durationQuantity),
      durationUnit: termManual ? null : form.durationUnit,
      thirdPartyAmount: form.thirdPartyAmount,
    };
    try {
      const response = editing
        ? await authenticatedFetch(`/api/pago-liberado/patentes/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, accion: "editar", expectedUpdatedAt: editing.updatedAt }) })
        : await authenticatedFetch("/api/pago-liberado/patentes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await readJson(response);
      if (!response.ok) { setFormErrors(body.details?.length ? body.details : [body.error || "No fue posible guardar."]); return; }
      const saved = body.data;
      setNotice({ tone: "ok", text: editing ? `Patente ${saved.displayPlate} actualizada.` : `Patente ${saved.displayPlate} liberada ${saved.modality === "THIRD_PARTY" ? `con cargo a ${saved.thirdParty.name}` : "sin costo"} hasta el ${fmt(saved.validTo)}.` });
      setForm(null);
      setEditing(null);
      await load();
    } catch (error) {
      setFormErrors([error instanceof Error ? error.message : "No fue posible guardar."]);
    } finally {
      setSaving(false);
    }
  }

  async function action(authorization, accion) {
    const plate = authorization.displayPlate;
    const questions = {
      finalizar: `¿Finalizar ahora el beneficio de ${plate}? Desde este momento se cobrará normalmente.`,
      eliminar: `¿Eliminar la patente ${plate}? Quedará en el historial y podrá restaurarse.`,
    };
    if (questions[accion] && !window.confirm(questions[accion])) return;
    const response = await authenticatedFetch(`/api/pago-liberado/patentes/${authorization.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion, expectedUpdatedAt: authorization.updatedAt }) });
    const body = await readJson(response);
    setNotice(response.ok ? { tone: "ok", text: `Patente ${plate}: ${accion === "finalizar" ? "finalizada" : accion === "eliminar" ? "eliminada" : "restaurada"}.` } : { tone: "error", text: body.error || "No fue posible actualizar la patente." });
    await load();
  }

  async function toggleParking(parking) {
    const enabling = !parking.enabled;
    const question = enabling
      ? `¿Activar Pago liberado en ${parking.name}? El POS no cobrará a las patentes vigentes.`
      : `¿Desactivar Pago liberado en ${parking.name}? El POS cobrará a todas las patentes; los registros se conservan.`;
    if (!window.confirm(question)) return;
    const response = await authenticatedFetch("/api/pago-liberado/patentes/estacionamientos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parkingId: parking.id, enabled: enabling }) });
    const body = await readJson(response);
    setNotice(response.ok ? { tone: "ok", text: `Pago liberado ${enabling ? "activado" : "desactivado"} en ${parking.name}.` } : { tone: "error", text: body.error || "No fue posible cambiar la activación." });
    await load();
  }

  async function openDetail(authorization) {
    setDetail({ authorization, events: null });
    const response = await authenticatedFetch(`/api/pago-liberado/patentes/${authorization.id}`, { cache: "no-store" });
    const body = await readJson(response);
    setDetail({ authorization: body.data?.authorization || authorization, events: response.ok ? body.data.events : [] });
  }

  // --- Importación ---
  async function downloadTemplate() {
    const response = await authenticatedFetch("/api/pago-liberado/patentes/importar");
    if (!response.ok) { setImportState((s) => ({ ...s, error: "No fue posible descargar la plantilla." })); return; }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = "plantilla-patentes-liberadas.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function readFile(file) {
    if (!file) return;
    setImportState({ busy: true, error: "", source: null, preview: null });
    let source;
    if (/\.csv$/i.test(file.name)) {
      const rows = (await file.text()).split(/\r?\n/).slice(1).map((line) => line.split(/[;,](?=(?:[^"]*"[^"]*")*[^"]*$)/).map((cell) => cell.replace(/^"|"$/g, "").trim()));
      source = { rows };
    } else {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      source = { fileBase64: btoa(binary) };
    }
    const response = await authenticatedFetch("/api/pago-liberado/patentes/importar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...source, dryRun: true }) });
    const body = await readJson(response);
    setImportState({ busy: false, error: response.ok ? "" : body.error || "No fue posible leer el archivo.", source, preview: response.ok ? body.data.results : null });
  }

  async function confirmImport() {
    setImportState((s) => ({ ...s, busy: true }));
    const response = await authenticatedFetch("/api/pago-liberado/patentes/importar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(importState.source) });
    const body = await readJson(response);
    if (!response.ok) { setImportState((s) => ({ ...s, busy: false, error: body.error || "No fue posible importar." })); return; }
    setImportState(null);
    setNotice({ tone: "ok", text: `${body.data.created} patente(s) importadas. ${body.data.rejected.length} fila(s) con error no se importaron.` });
    await load();
  }

  if (state.loading) return <p className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">Cargando Pago liberado…</p>;
  if (state.error) return <p role="alert" className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-sm font-semibold text-red-700">{state.error}</p>;
  if (!state.storageReady) return <p className="rounded-3xl border border-amber-300 bg-amber-50 p-6 text-sm font-semibold text-amber-900">Pago liberado aún no está habilitado en la base de datos (migración pendiente).</p>;

  const previewOk = importState?.preview?.filter((r) => !r.error).length || 0;
  const input = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-[#041E42] focus:border-[#3150D8] focus:outline-none";
  const missingKeys = new Set(missing.map(([key]) => key));
  const inputFor = (key) => `${input} ${missingKeys.has(key) ? "border-red-400 bg-red-50/40" : ""}`;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-[#041E42]">Activación del módulo</h2>
        <p className="mt-1 text-sm text-slate-600">Lo activas tú en cada estacionamiento; no requiere gestión de ParkFacil y no tiene costo. Las patentes liberadas rigen en todos los estacionamientos activados.</p>
        {state.parkings.length === 0 ? <p className="mt-4 text-sm text-slate-500">Tu empresa no tiene estacionamientos Off Street activos.</p> : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {state.parkings.map((parking) => (
              <div key={parking.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
                <div>
                  <p className="font-semibold text-[#041E42]">{parking.name}</p>
                  <p className="text-xs font-semibold text-slate-500">{parking.code} · {parking.enabled ? "Activado" : "Desactivado"}</p>
                </div>
                <button type="button" role="switch" aria-checked={parking.enabled} aria-label={`Pago liberado en ${parking.name}`} onClick={() => void toggleParking(parking)}
                  className={`relative h-7 w-12 flex-none rounded-full transition ${parking.enabled ? "bg-emerald-600" : "bg-slate-300"}`}>
                  <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${parking.enabled ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {notice.text ? <p role={notice.tone === "error" ? "alert" : "status"} className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${notice.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{notice.text}</p> : null}

      <section className={`rounded-3xl border border-slate-200 bg-white p-6 shadow-sm ${anyEnabled ? "" : "opacity-60"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-[#041E42]">Patentes liberadas</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:text-[#3150D8]" aria-label="Actualizar"><RefreshCw className="h-4 w-4" /></button>
            <button type="button" disabled={!anyEnabled} onClick={() => setImportState({ busy: false, error: "", source: null, preview: null })} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-[#3150D8] hover:text-[#3150D8] disabled:cursor-not-allowed"><FileUp className="h-4 w-4" /> Importar desde Excel</button>
            <button type="button" disabled={!anyEnabled} onClick={() => openForm()} className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1E5EFF] disabled:cursor-not-allowed"><Plus className="h-4 w-4" /> Nueva patente liberada</button>
          </div>
        </div>
        {!anyEnabled ? <p className="mt-2 text-sm font-semibold text-amber-800">Activa el módulo en al menos un estacionamiento para registrar patentes.</p> : null}

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[["Vigentes", counts.CURRENT], ["Programadas", counts.SCHEDULED], ["Vencidas / finalizadas", counts.closed], ["Total registradas", counts.total]].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-[#F5F9FF] px-4 py-3"><p className="text-2xl font-bold text-[#041E42]">{value}</p><p className="text-xs font-semibold text-slate-500">{label}</p></div>
          ))}
        </div>

        {form ? (
          <form onSubmit={save} noValidate className="mt-5 grid gap-4 rounded-2xl border border-blue-200 bg-blue-50/60 p-5 sm:grid-cols-6">
            <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-6">
              <h3 className="text-base font-bold text-[#041E42]">{editing ? `Editar patente ${editing.displayPlate}` : "Nueva patente liberada"}</h3>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{form.modality === "THIRD_PARTY" ? "✓ Sin cobro al conductor · paga un tercero" : "✓ Sin costo para el beneficiario"}</span>
            </div>
            <p className="text-xs text-slate-500 sm:col-span-6">Todos los campos marcados con <span className="text-red-600">*</span> son obligatorios; sin ellos no se puede guardar.</p>

            <p className="text-sm font-bold text-[#041E42] sm:col-span-6">Vehículo y período</p>
            <Field label="Patente" required className="sm:col-span-2" hint="Formatos AAAA-11 o AA-1111.">
              <input className={inputFor("plate")} value={form.plate} readOnly={Boolean(editing)} maxLength={8} autoComplete="off" placeholder="ABCD-12 o AB-1234" onChange={(e) => change("plate", e.target.value.toUpperCase())} onBlur={(e) => { const n = normalizeReleasedPlate(e.target.value); if (n) change("plate", displayReleasedPlate(n)); }} />
            </Field>
            <Field label="Cantidad" className="sm:col-span-2" hint="Sugiere la fecha de término.">
              <input className={input} type="number" min={1} step={1} value={form.durationQuantity} onChange={(e) => change("durationQuantity", e.target.value)} />
            </Field>
            <Field label="Unidad" className="sm:col-span-2">
              <select className={input} value={form.durationUnit} onChange={(e) => change("durationUnit", e.target.value)}>
                <option value="HOUR">Horas</option><option value="DAY">Días</option><option value="WEEK_WEEKDAYS">Semanas (lunes a viernes)</option><option value="MONTH">Meses</option><option value="YEAR">Años</option>
              </select>
            </Field>
            <Field label="Fecha y hora de inicio" required className="sm:col-span-3">
              <input className={inputFor("validFrom")} type="datetime-local" value={form.validFrom} onChange={(e) => change("validFrom", e.target.value)} />
            </Field>
            <Field label="Fecha y hora de término" required className="sm:col-span-3" hint={termManual ? "Escrita a mano: el ticket dirá «PAGO LIBERADO» con las fechas." : "Se completa con la cantidad y unidad; puedes escribirla a mano."}>
              <input className={inputFor("validTo")} type="datetime-local" value={form.validTo} onChange={(e) => { setTermManual(true); setForm((c) => ({ ...c, validTo: e.target.value })); }} />
            </Field>

            <p className="text-sm font-bold text-[#041E42] sm:col-span-6">Condiciones de la autorización</p>
            <Field label="Modalidad de autorización" required className="sm:col-span-3" hint={form.modality === "THIRD_PARTY" ? "El conductor no paga: se envía una factura al tercero por el valor indicado + IVA." : "El POS no cobra la estadía."}>
              <select className={input} value={form.modality} onChange={(e) => change("modality", e.target.value)}>
                <option value="FREE">Sin costo para el beneficiario</option><option value="THIRD_PARTY">Cobrar a un tercero</option>
              </select>
            </Field>
            <Field label="Uso de la autorización" className={form.usageMode === "MAX" ? "sm:col-span-2" : "sm:col-span-3"}>
              <select className={input} value={form.usageMode} onChange={(e) => change("usageMode", e.target.value)}>
                <option value="MULTIPLE">Entradas múltiples durante vigencia</option><option value="SINGLE">Una sola entrada</option><option value="MAX">Máximo de usos configurable</option>
              </select>
            </Field>
            {form.usageMode === "MAX" ? (
              <Field label="Máximo de usos" required className="sm:col-span-1"><input className={inputFor("maxUses")} type="number" min={2} step={1} value={form.maxUses} onChange={(e) => change("maxUses", e.target.value)} /></Field>
            ) : null}
            {form.modality === "THIRD_PARTY" ? (
              <>
                <Field label="Razón social del tercero" required className="sm:col-span-2"><input className={inputFor("thirdPartyName")} maxLength={120} value={form.thirdPartyName} onChange={(e) => change("thirdPartyName", e.target.value)} /></Field>
                <Field label="RUT del tercero" required className="sm:col-span-2"><input className={inputFor("thirdPartyRut")} maxLength={12} value={form.thirdPartyRut} placeholder="76.123.456-0" onChange={(e) => change("thirdPartyRut", e.target.value)} onBlur={(e) => { const r = normalizeRut(e.target.value); if (r) change("thirdPartyRut", r); }} /></Field>
                <Field label="Correo de facturación" required className="sm:col-span-2"><input className={inputFor("thirdPartyEmail")} type="email" maxLength={160} value={form.thirdPartyEmail} onChange={(e) => change("thirdPartyEmail", e.target.value)} /></Field>
                <Field label="Valor a facturar (neto)" required className="sm:col-span-3"><input className={inputFor("thirdPartyAmount")} inputMode="decimal" value={form.thirdPartyAmount} placeholder="Ej.: 3,5" onChange={(e) => change("thirdPartyAmount", e.target.value)} /></Field>
                <Field label="Moneda" required className="sm:col-span-3"><select className={input} value={form.thirdPartyCurrency} onChange={(e) => change("thirdPartyCurrency", e.target.value)}><option value="UF">UF</option><option value="CLP">$ Pesos</option></select></Field>
              </>
            ) : null}

            <p className="text-sm font-bold text-[#041E42] sm:col-span-6">Beneficiario</p>
            <Field label="Nombre" required className="sm:col-span-2"><input className={inputFor("beneficiaryName")} maxLength={120} autoComplete="off" placeholder="Nombre y apellido" value={form.beneficiaryName} onChange={(e) => change("beneficiaryName", e.target.value)} /></Field>
            <Field label="RUT" required className="sm:col-span-2"><input className={inputFor("beneficiaryRut")} maxLength={12} autoComplete="off" placeholder="12.345.678-5" value={form.beneficiaryRut} onChange={(e) => change("beneficiaryRut", e.target.value)} onBlur={(e) => { const r = normalizeRut(e.target.value); if (r) change("beneficiaryRut", r); }} /></Field>
            <Field label="Teléfono" required className="sm:col-span-2"><input className={inputFor("beneficiaryPhone")} maxLength={16} inputMode="tel" autoComplete="off" placeholder="+56 9 1234 5678" value={form.beneficiaryPhone} onChange={(e) => change("beneficiaryPhone", e.target.value)} /></Field>
            <Field label="Correo" required className="sm:col-span-3"><input className={inputFor("beneficiaryEmail")} type="email" maxLength={160} autoComplete="off" placeholder="nombre@correo.cl" value={form.beneficiaryEmail} onChange={(e) => change("beneficiaryEmail", e.target.value)} /></Field>
            <Field label="Motivo / referencia" required className="sm:col-span-3"><input className={inputFor("reason")} maxLength={200} placeholder="Ej. Convenio empresa / cortesía" value={form.reason} onChange={(e) => change("reason", e.target.value)} /></Field>

            {formErrors.length ? <ul role="alert" className="list-disc rounded-xl bg-red-50 px-8 py-3 text-sm font-semibold text-red-700 sm:col-span-6">{formErrors.map((item) => <li key={item}>{item}</li>)}</ul> : null}
            <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
              <button type="submit" disabled={saving || missing.length > 0} className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-5 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}Guardar</button>
              <button type="button" onClick={() => { setForm(null); setEditing(null); }} className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold">Cancelar</button>
              {missing.length ? <span className="text-xs font-semibold text-slate-500">Falta completar: {missing.map(([, label]) => label).join(", ")}.</span> : null}
            </div>
          </form>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
          <Field label="Buscar patente, nombre, RUT o correo"><input className={input} value={filters.text} placeholder="Ej.: BCDF o 12.345.678" onChange={(e) => setFilters({ ...filters, text: e.target.value })} /></Field>
          <Field label="Estado">
            <select className={input} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="all">Todas</option><option value="current">Vigentes</option><option value="scheduled">Programadas</option><option value="closed">Vencidas / finalizadas / agotadas</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 pb-2 text-sm font-semibold text-slate-600"><input type="checkbox" checked={filters.deleted} onChange={(e) => setFilters({ ...filters, deleted: e.target.checked })} /> Mostrar eliminadas</label>
        </div>

        {rows.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm font-semibold text-slate-500">No hay patentes liberadas con estos filtros.</p> : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead><tr className="bg-[#3150D8] text-xs uppercase tracking-wide text-white"><th className="p-3">Patente</th><th className="p-3">Beneficiario</th><th className="p-3">Modalidad y uso</th><th className="p-3">Inicio</th><th className="p-3">Término</th><th className="p-3">Estado</th><th className="p-3">Acciones</th></tr></thead>
              <tbody>{rows.map((a) => {
                const s = statusOf(a);
                const editable = s === PLATE_STATUS.CURRENT || s === PLATE_STATUS.SCHEDULED;
                return (
                  <tr key={a.id} className={`border-b align-middle ${s === PLATE_STATUS.DELETED ? "opacity-60" : ""}`}>
                    <td className="p-3"><span className="whitespace-nowrap rounded-md border-2 border-[#041E42] px-2 py-0.5 font-mono font-bold tracking-wider text-[#041E42]">{a.displayPlate}</span></td>
                    <td className="p-3 text-xs"><p className="font-semibold text-[#041E42]">{a.beneficiaryName}</p><p className="text-slate-500">{a.beneficiaryRut} · {a.beneficiaryPhone}</p><p className="text-slate-500">{a.beneficiaryEmail}</p></td>
                    <td className="p-3 text-xs">
                      {a.thirdParty ? <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-800">Factura a {a.thirdParty.name} · {money(a.thirdParty)} + IVA</span> : <span className="rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">Sin costo</span>}
                      <p className="mt-1 text-slate-500">{USAGE_LABEL[a.usageMode]} · {usageText(a)}</p>
                    </td>
                    <td className="whitespace-nowrap p-3">{fmt(a.validFrom)}</td>
                    <td className="whitespace-nowrap p-3">{fmt(a.validTo)}{a.finishedAt ? <span className="block text-xs text-slate-500">finalizada antes</span> : null}</td>
                    <td className="p-3"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_TONE[s]}`}>{PLATE_STATUS_LABELS[s]}</span></td>
                    <td className="p-3"><div className="flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => void openDetail(a)} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold hover:text-[#3150D8]">Ver</button>
                      {editable ? <button type="button" onClick={() => openForm(a)} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold hover:text-[#3150D8]">Editar</button> : null}
                      {s === PLATE_STATUS.CURRENT ? <button type="button" onClick={() => void action(a, "finalizar")} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold hover:text-[#3150D8]">Finalizar ahora</button> : null}
                      {s !== PLATE_STATUS.DELETED
                        ? <button type="button" onClick={() => void action(a, "eliminar")} className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">Eliminar</button>
                        : <button type="button" onClick={() => void action(a, "restaurar")} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold hover:text-[#3150D8]">Restaurar</button>}
                    </div></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        <h2 className="text-base font-bold text-[#041E42]">Cómo funciona</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Todo lo realiza el administrador de la empresa: activar el módulo, crear, editar, finalizar, eliminar e importar. ParkFacil no interviene y el módulo no tiene costo.</li>
          <li><strong>Ticket del POS:</strong> al ingresar una patente autorizada se imprime «LIBERADO POR [1 día / 3 horas / 1 semana (lunes a viernes) / 1 mes / 1 año]». Cada entrada cuenta como un uso.</li>
          <li><strong>Vigente:</strong> el POS no cobra. <strong>Programada:</strong> aún no comienza. <strong>Vencida, finalizada o con usos agotados:</strong> se cobra normalmente.</li>
          <li>Si el vehículo sale después del término, el POS cobra solo el tiempo excedente. «Semanas (lunes a viernes)»: sábado y domingo se cobra normalmente.</li>
          <li>Un vehículo dentro del estacionamiento no puede volver a ingresar hasta registrar su salida. Una patente no puede tener dos autorizaciones vigentes o programadas a la vez.</li>
          <li><strong>Cobrar a un tercero:</strong> se le envía una factura por el valor indicado + IVA.</li>
          <li><strong>Eliminar</strong> es lógico: queda en el historial y puede restaurarse.</li>
        </ul>
      </section>

      {detail ? (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-[#041E42]/50 p-4" onClick={() => setDetail(null)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold text-[#041E42]">Patente {detail.authorization.displayPlate} <span className={`ml-2 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_TONE[statusOf(detail.authorization)]}`}>{PLATE_STATUS_LABELS[statusOf(detail.authorization)]}</span></h3>
              <button type="button" onClick={() => setDetail(null)} aria-label="Cerrar" className="rounded-full p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <dl className="mt-4 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[180px_1fr]">
              <dt className="font-semibold text-slate-500">Estacionamientos</dt><dd className="font-semibold text-[#041E42]">{state.parkings.filter((p) => p.enabled).map((p) => p.name).join(", ") || "Ninguno activo"}</dd>
              <dt className="font-semibold text-slate-500">Período</dt><dd className="font-semibold text-[#041E42]">{fmt(detail.authorization.validFrom)} → {fmt(detail.authorization.validTo)}{detail.authorization.durationUnit ? ` (${describeDuration(detail.authorization.durationQuantity, detail.authorization.durationUnit)})` : ""}</dd>
              <dt className="font-semibold text-slate-500">Ticket del POS</dt><dd className="font-semibold text-[#041E42]">«{releasedTicketLabel(detail.authorization)}» · {releasedTicketDetail(detail.authorization)}</dd>
              <dt className="font-semibold text-slate-500">Modalidad</dt><dd className="font-semibold text-[#041E42]">{detail.authorization.thirdParty ? `Cobrar a un tercero: ${detail.authorization.thirdParty.name} (${detail.authorization.thirdParty.rut}, ${detail.authorization.thirdParty.email}) · factura por ${money(detail.authorization.thirdParty)} + IVA` : "Sin costo para el beneficiario"}</dd>
              <dt className="font-semibold text-slate-500">Uso</dt><dd className="font-semibold text-[#041E42]">{USAGE_LABEL[detail.authorization.usageMode]} · {usageText(detail.authorization)}</dd>
              <dt className="font-semibold text-slate-500">Beneficiario</dt><dd className="font-semibold text-[#041E42]">{detail.authorization.beneficiaryName} · {detail.authorization.beneficiaryRut} · {detail.authorization.beneficiaryPhone} · {detail.authorization.beneficiaryEmail}</dd>
              <dt className="font-semibold text-slate-500">Motivo / referencia</dt><dd className="font-semibold text-[#041E42]">{detail.authorization.reason}</dd>
            </dl>
            <h4 className="mt-5 text-sm font-bold text-[#041E42]">Historial</h4>
            {detail.events === null ? <p className="mt-2 text-sm text-slate-500">Cargando…</p> : (
              <ul className="mt-2 space-y-1.5 text-sm">{detail.events.map((ev, i) => (
                <li key={`${ev.at}-${i}`} className="rounded-r-lg border-l-4 border-[#3150D8] bg-[#F5F9FF] px-3 py-1.5">{fmt(ev.at)} · {EVENT_LABEL[ev.type] || ev.type}{ev.type === "USED" ? ` en ${ev.parkingName || "estacionamiento"} (uso ${ev.useNumber}${detail.authorization.maxUses ? ` de ${detail.authorization.maxUses}` : ""})` : ""}{ev.actorEmail ? ` · ${ev.actorEmail}` : ""}</li>
              ))}</ul>
            )}
          </div>
        </div>
      ) : null}

      {importState ? (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-[#041E42]/50 p-4">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold text-[#041E42]">Importar patentes desde Excel</h3>
              <button type="button" onClick={() => setImportState(null)} aria-label="Cerrar" className="rounded-full p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-600">
              <li>Descarga la plantilla y completa una fila por patente (máximo 1.000). Todas las columnas son obligatorias, salvo «Maximo de usos» cuando el uso no es «maximo».</li>
              <li>Sube el archivo (.xlsx o .csv) y revisa la validación fila por fila.</li>
              <li>Confirma: se crean solo las filas válidas, «Sin costo». El cobro a un tercero se configura en cada registro.</li>
            </ol>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => void downloadTemplate()} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold hover:text-[#3150D8]"><Download className="h-4 w-4" /> Descargar plantilla</button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white"><FileUp className="h-4 w-4" /> Subir archivo<input type="file" accept=".xlsx,.csv" hidden onChange={(e) => void readFile(e.target.files?.[0])} /></label>
            </div>
            {importState.busy ? <p className="mt-4 flex items-center gap-2 text-sm text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin" /> Procesando…</p> : null}
            {importState.error ? <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{importState.error}</p> : null}
            {importState.preview ? (
              <>
                <p className="mt-4 text-sm text-slate-600"><b>{previewOk}</b> válidas · <b>{importState.preview.length - previewOk}</b> con error</p>
                <div className="mt-2 overflow-x-auto"><table className="min-w-full text-left text-xs">
                  <thead><tr className="bg-[#3150D8] uppercase text-white"><th className="p-2">Fila</th><th className="p-2">Patente</th><th className="p-2">Período</th><th className="p-2">RUT</th><th className="p-2">Resultado</th></tr></thead>
                  <tbody>{importState.preview.map((r) => (
                    <tr key={r.line} className="border-b"><td className="p-2">{r.line}</td><td className="p-2 font-mono font-bold">{displayReleasedPlate(r.plate) || "—"}</td><td className="p-2">{r.validFrom ? `${fmt(r.validFrom)} → ${fmt(r.validTo)}` : "—"}</td><td className="p-2">{r.rut || "—"}</td>
                      <td className="p-2">{r.error ? <span className="rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-700">{r.error}</span> : <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">Válida</span>}</td></tr>
                  ))}</tbody>
                </table></div>
              </>
            ) : null}
            <div className="mt-5 flex gap-2">
              <button type="button" disabled={!previewOk || importState.busy} onClick={() => void confirmImport()} className="rounded-full bg-[#3150D8] px-5 py-2 text-sm font-bold text-white disabled:opacity-50">Importar filas válidas</button>
              <button type="button" onClick={() => setImportState(null)} className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold">Cancelar</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
