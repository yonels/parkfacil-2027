"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { rateStatusBadge } from "@/lib/rateStatusBadge.mjs";

// Modelo legal: minuto efectivo (sin tramos) o tramo vencido con exactamente un tramo
// inicial (mín. 30 min) y un tramo siguiente repetible (mín. 10 min). No existe un tercer
// modo ni un valor nocturno fijo — ver docs/MOTOR-TARIFARIO-LEGAL.md.
const initial = {
  mode: "create", sourceId: null,
  name: "", billingMode: "EFFECTIVE_MINUTE", minuteAmount: "", freePeriodMinutes: 0,
  multiplyBySpaces: false, legalComplianceAccepted: false,
  validFrom: new Date().toISOString().slice(0, 16), validUntil: "",
  status: "DRAFT", notes: "",
  initialBlockMinutes: 30, initialBlockAmount: "",
  nextBlockMinutes: 10, nextBlockAmount: "",
};
const money = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const billingModeLabel = (mode) => mode === "EFFECTIVE_MINUTE" ? "Minuto efectivo" : mode === "EXPIRED_BLOCKS" ? "Tramo vencido" : "Modalidad no reconocida";

// Reconstruye el formulario a partir de una tarifa existente, para "Editar" (mismo
// registro, solo si rate.editable) y "Nueva versión" (reemplazo, ver replaceParkingRate).
// legalComplianceAccepted nunca se precompleta: no se persiste en la tarifa original, así
// que siempre debe reconfirmarse antes de guardar.
function formFromRate(rate, mode) {
  return {
    mode, sourceId: rate.id,
    name: rate.name, billingMode: rate.billingMode,
    minuteAmount: rate.minuteAmount ?? "",
    freePeriodMinutes: Math.round((rate.freePeriodSeconds || 0) / 60),
    multiplyBySpaces: rate.multiplyBySpaces,
    legalComplianceAccepted: false,
    validFrom: mode === "replace" ? new Date().toISOString().slice(0, 16) : String(rate.validFrom || "").slice(0, 16),
    validUntil: String(rate.validUntil || "").slice(0, 16),
    status: rate.status === "ACTIVE" ? "ACTIVE" : "DRAFT",
    notes: rate.notes || "",
    initialBlockMinutes: rate.blocks?.[0] ? rate.blocks[0].durationSeconds / 60 : 30,
    initialBlockAmount: rate.blocks?.[0]?.amount ?? "",
    nextBlockMinutes: rate.blocks?.[1] ? rate.blocks[1].durationSeconds / 60 : 10,
    nextBlockAmount: rate.blocks?.[1]?.amount ?? "",
  };
}

export default function ParkingRatesManager({ parking, showCreateButton = true, openSignal }) {
  const [rates, setRates] = useState([]);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState("");
  const endpoint = `/api/estacionamientos/${parking.code}/tarifas`;
  const lastOpenSignal = useRef(openSignal);

  // Permite que una acción externa (el encabezado contextual de la pestaña Tarifas)
  // abra este mismo formulario sin duplicar un segundo botón "Nueva tarifa".
  useEffect(() => {
    if (openSignal === undefined || openSignal === lastOpenSignal.current) return;
    lastOpenSignal.current = openSignal;
    setErrors({}); setRequestError(""); setForm({ ...initial });
  }, [openSignal]);

  useEffect(() => {
    let active = true;
    authenticatedFetch(endpoint).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (active) setRates(body.data || []);
    }).catch((error) => { if (active) setRequestError(error.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [endpoint]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const openCreate = () => { setErrors({}); setRequestError(""); setForm({ ...initial }); };
  const openEdit = (rate) => { setErrors({}); setRequestError(""); setForm(formFromRate(rate, "edit")); };
  const openReplace = (rate) => { setErrors({}); setRequestError(""); setForm(formFromRate(rate, "replace")); };

  async function submit(event) {
    event.preventDefault(); setSaving(true); setErrors({}); setRequestError("");
    const payload = {
      ...form,
      blocks: form.billingMode === "EXPIRED_BLOCKS" ? [
        { durationMinutes: form.initialBlockMinutes, amount: form.initialBlockAmount, repeatAfter: false },
        { durationMinutes: form.nextBlockMinutes, amount: form.nextBlockAmount, repeatAfter: true },
      ] : [],
    };
    const url = form.mode === "edit" ? `${endpoint}/${form.sourceId}` : form.mode === "replace" ? `${endpoint}/${form.sourceId}/reemplazar` : endpoint;
    const method = form.mode === "edit" ? "PATCH" : "POST";
    try {
      const response = await authenticatedFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) { if (body.details) setErrors(body.details); throw new Error(body.error || "No fue posible guardar."); }
      if (form.mode === "replace") {
        // La tarifa anterior queda cerrada (ENDED) y se conserva íntegra; la nueva versión
        // se agrega como fila independiente.
        setRates((current) => [body.data.next, body.data.previous, ...current.filter((rate) => rate.id !== body.data.previous.id)]);
      } else if (form.mode === "edit") {
        setRates((current) => current.map((rate) => (rate.id === body.data.id ? body.data : rate)));
      } else {
        setRates((current) => [body.data, ...current]);
      }
      setForm(null);
    } catch (error) { setRequestError(error.message); } finally { setSaving(false); }
  }

  const formTitle = form?.mode === "edit" ? "Editar tarifa" : form?.mode === "replace" ? "Nueva versión de la tarifa" : "Configurar tarifa";
  const submitLabel = saving
    ? (form?.mode === "edit" ? "Guardando..." : "Creando tarifa...")
    : (form?.mode === "edit" ? "Guardar cambios" : form?.mode === "replace" ? "Crear nueva versión" : "Crear tarifa");

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-[#041E42]">Tarifas operacionales</h1><p className="mt-1 text-sm text-slate-600">{parking.name} · minuto efectivo o tramo vencido, sin redondeo al alza.</p></div>{showCreateButton ? <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Nueva tarifa</button> : null}</div>
    {requestError && !form ? <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{requestError}</p> : null}
    {loading ? <p className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-500">Cargando tarifas...</p> : <div className="grid gap-4 lg:grid-cols-2">{rates.map((rate) => <RateCard key={rate.id} rate={rate} onEdit={() => openEdit(rate)} onReplace={() => openReplace(rate)} />)}{!rates.length ? <p className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">No hay tarifas operacionales configuradas.</p> : null}</div>}
    {form ? <form onSubmit={submit} className="rounded-3xl border border-[#BFD2FF] bg-[#F5F9FF] p-5 sm:p-6">
      <div className="flex items-center justify-between"><h2 className="text-xl font-semibold text-[#041E42]">{formTitle}</h2><button type="button" onClick={() => setForm(null)}><X className="h-5 w-5" /></button></div>
      {form.mode === "replace" ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-900">Esta tarifa ya estuvo activa o participó en cobros: no puede modificarse retroactivamente. Al guardar, la tarifa actual se cerrará hoy (queda &ldquo;Finalizada&rdquo;, íntegra) y esta será una tarifa nueva e independiente.</p> : null}
      {requestError ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{requestError}</p> : null}

      <fieldset className="mt-5">
        <legend className="text-sm font-black text-[#041E42]">Modalidad de cobro</legend>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => set("billingMode", "EFFECTIVE_MINUTE")} className={`rounded-2xl border-2 p-4 text-left transition ${form.billingMode === "EFFECTIVE_MINUTE" ? "border-[#3150D8] bg-white" : "border-slate-200 bg-white/60 hover:border-slate-300"}`}>
            <p className="font-bold text-[#041E42]">Minuto efectivo</p>
            <p className="mt-1 text-xs text-slate-500">Cobra exactamente el tiempo usado, sin tramos ni bloques.</p>
          </button>
          <button type="button" onClick={() => set("billingMode", "EXPIRED_BLOCKS")} className={`rounded-2xl border-2 p-4 text-left transition ${form.billingMode === "EXPIRED_BLOCKS" ? "border-[#3150D8] bg-white" : "border-slate-200 bg-white/60 hover:border-slate-300"}`}>
            <p className="font-bold text-[#041E42]">Tramo vencido</p>
            <p className="mt-1 text-xs text-slate-500">Cobra por tramos de tiempo completamente cumplidos.</p>
          </button>
        </div>
        {errors.billingMode ? <p className="mt-1 text-xs font-semibold text-red-700">{errors.billingMode}</p> : null}
      </fieldset>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label="Nombre" error={errors.name}><input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} /></Field>
        {form.billingMode === "EFFECTIVE_MINUTE" ? <Field label="Valor por minuto" error={errors.minuteAmount}><input type="number" min="0.0001" step="0.0001" value={form.minuteAmount} onChange={(e) => set("minuteAmount", e.target.value)} className={inputClass} /></Field> : null}
        <Field label="Período gratuito (minutos)" error={errors.freePeriodSeconds}><input type="number" min="0" step="1" value={form.freePeriodMinutes} onChange={(e) => set("freePeriodMinutes", e.target.value)} className={inputClass} /></Field>
        <Field label="Vigente desde" error={errors.validFrom}><input type="datetime-local" value={form.validFrom} onChange={(e) => set("validFrom", e.target.value)} className={inputClass} /></Field>
        <Field label="Vigente hasta" error={errors.validUntil}><input type="datetime-local" value={form.validUntil} onChange={(e) => set("validUntil", e.target.value)} className={inputClass} /></Field>
        <Field label="Estado"><select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputClass}><option value="DRAFT">Borrador</option><option value="ACTIVE">Activa</option></select></Field>
      </div>

      {form.billingMode === "EXPIRED_BLOCKS" ? <div className="mt-5 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-bold text-[#041E42]">Tramo inicial</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Duración (mín. 30 min)" error={errors.block_1}><input type="number" min="30" step="1" value={form.initialBlockMinutes} onChange={(e) => set("initialBlockMinutes", e.target.value)} className={inputClass} /></Field>
              <Field label="Valor" error={errors.block_amount_1}><input type="number" min="0" value={form.initialBlockAmount} onChange={(e) => set("initialBlockAmount", e.target.value)} className={inputClass} /></Field>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-bold text-[#041E42]">Tramo siguiente</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Duración (mín. 10 min)" error={errors.block_2}><input type="number" min="10" step="1" value={form.nextBlockMinutes} onChange={(e) => set("nextBlockMinutes", e.target.value)} className={inputClass} /></Field>
              <Field label="Valor" error={errors.block_amount_2}><input type="number" min="0" value={form.nextBlockAmount} onChange={(e) => set("nextBlockAmount", e.target.value)} className={inputClass} /></Field>
            </div>
          </div>
        </div>
        {errors.blocks ? <p className="text-xs font-semibold text-red-700">{errors.blocks}</p> : null}
        <p className="rounded-xl bg-white p-3 text-xs font-semibold text-[#3150D8]">Solo se cobran tramos completamente vencidos. El sistema no redondea períodos hacia arriba.</p>
      </div> : null}

      <section className="mt-5 rounded-2xl border border-[#BFD2FF] bg-white p-4 text-sm text-slate-700"><h3 className="font-bold text-[#041E42]">Cumplimiento Ley 20.967</h3><ul className="mt-2 list-disc space-y-1 pl-5"><li>Minuto efectivo, sin rangos ni tramos.</li><li>Tramo vencido: primero de al menos 30 minutos y siguientes de al menos 10.</li><li>Nunca se redondea ni aproxima el cobro al alza.</li><li>El período gratuito se descuenta antes de calcular.</li><li>La pérdida del comprobante no habilita multas, recargos ni tarifas prefijadas.</li></ul></section>
      <label className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><input type="checkbox" checked={form.legalComplianceAccepted} onChange={(e) => set("legalComplianceAccepted", e.target.checked)} className="mt-1" /><span><strong>Confirmo que la tarifa publicada cumple la Ley 20.967.</strong>{errors.legalComplianceAccepted ? <span className="mt-1 block font-semibold text-red-700">{errors.legalComplianceAccepted}</span> : null}</span></label>
      <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setForm(null)} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold">Cancelar</button><button disabled={saving} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{submitLabel}</button></div>
    </form> : null}
  </div>;
}

const dateLabel = (value) => value ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(new Date(value)) : null;
const badgeToneClass = { review: "bg-amber-100 text-amber-800", active: "bg-emerald-50 text-emerald-700", suspended: "bg-rose-50 text-rose-700", ended: "bg-slate-200 text-slate-600", draft: "bg-slate-100 text-slate-600" };

function RateCard({ rate, onEdit, onReplace }) {
  const vigenciaDesde = dateLabel(rate.validFrom);
  const vigenciaHasta = dateLabel(rate.validUntil);
  const needsReview = rate.compliance?.status === "REQUIRES_REVIEW";
  const badge = rateStatusBadge(rate);
  const badgeClass = badgeToneClass[badge.tone] || badgeToneClass.draft;
  return <article className={`rounded-3xl border p-5 shadow-sm ${needsReview ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
    <div className="flex justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-wider text-[#3150D8]">{billingModeLabel(rate.billingMode)}</p><h2 className="mt-1 text-lg font-semibold text-[#041E42]">{rate.name}</h2></div>
      <span className={`h-fit rounded-full px-3 py-1 text-xs font-bold ${badgeClass}`}>{badge.label}</span>
    </div>
    {needsReview ? <p className="mt-3 rounded-xl bg-amber-100 p-2.5 text-xs font-semibold text-amber-900">Requiere revisión administrativa: {rate.compliance.reasons.join(" ")}</p> : null}
    <div className="mt-4 space-y-2 text-sm text-slate-600">
      {rate.billingMode === "EFFECTIVE_MINUTE" ? <p><strong>{money.format(rate.minuteAmount)}</strong> por minuto efectivo</p> : (rate.blocks || []).map((block) => <p key={block.id}>Tramo {block.sequence}: {block.durationSeconds / 60} min · <strong>{money.format(block.amount)}</strong>{block.repeatAfter ? " · repetible" : ""}</p>)}
      <p>Período gratuito: {rate.freePeriodSeconds / 60} minutos</p>
      <p>Factor por plazas: {rate.multiplyBySpaces ? "Sí" : "No"}</p>
      {vigenciaDesde ? <p>Vigente desde {vigenciaDesde}{vigenciaHasta ? ` hasta ${vigenciaHasta}` : " · sin fecha de término"}</p> : null}
      {rate.hasCharges ? <p className="text-xs text-slate-400">Ya participó en cobros: no se puede modificar retroactivamente.</p> : null}
    </div>
    <div className="mt-4 flex justify-end">
      {rate.editable
        ? <button type="button" onClick={onEdit} className="rounded-full border border-[#3150D8] px-3 py-1.5 text-xs font-bold text-[#3150D8] transition hover:bg-[#F5F9FF]">Editar</button>
        : <button type="button" onClick={onReplace} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:border-[#3150D8] hover:text-[#3150D8]">Nueva versión</button>}
    </div>
  </article>;
}
function Field({ label, error, children }) { return <label className="text-sm font-medium text-slate-700"><span>{label}</span><span className="mt-1.5 block">{children}</span>{error ? <small className="mt-1 block text-red-700">{error}</small> : null}</label>; }
const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-[#3150D8]";
