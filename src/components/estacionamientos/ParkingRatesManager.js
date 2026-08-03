"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

const initial = {
  name: "", billingMode: "EFFECTIVE_MINUTE", minuteAmount: "", freePeriodMinutes: 0,
  multiplyBySpaces: false, legalComplianceAccepted: false, dailyFlatAmount: "", validFrom: new Date().toISOString().slice(0, 16),
  regularStartTime: "08:00", regularEndTime: "22:00", overnightEndTime: "08:00", overnightFlatAmount: "",
  validUntil: "", status: "DRAFT", notes: "", blocks: [{ durationMinutes: 30, amount: "", repeatAfter: false }],
};
const money = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

export default function ParkingRatesManager({ parking }) {
  const [rates, setRates] = useState([]);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState("");
  const endpoint = `/api/estacionamientos/${parking.code}/tarifas`;

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
  const setBlock = (index, key, value) => setForm((current) => ({ ...current, blocks: current.blocks.map((block, position) => position === index ? { ...block, [key]: value } : block) }));
  function addBlock() { setForm((current) => ({ ...current, blocks: [...current.blocks, { durationMinutes: 10, amount: "", repeatAfter: false }] })); }

  async function submit(event) {
    event.preventDefault(); setSaving(true); setErrors({}); setRequestError("");
    try {
      const response = await authenticatedFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const body = await response.json();
      if (!response.ok) { if (body.details) setErrors(body.details); throw new Error(body.error || "No fue posible guardar."); }
      setRates((current) => [body.data, ...current]); setForm(null);
    } catch (error) { setRequestError(error.message); } finally { setSaving(false); }
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-[#041E42]">Tarifas operacionales</h1><p className="mt-1 text-sm text-slate-600">{parking.name} · modalidades permitidas para el cobro de estacionamiento.</p></div><button onClick={() => { setErrors({}); setRequestError(""); setForm({ ...initial, blocks: initial.blocks.map((item) => ({ ...item })) }); }} className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Crear tarifa</button></div>
    {requestError && !form ? <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{requestError}</p> : null}
    {loading ? <p className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-500">Cargando tarifas...</p> : <div className="grid gap-4 lg:grid-cols-2">{rates.map((rate) => <RateCard key={rate.id} rate={rate} />)}{!rates.length ? <p className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">No hay tarifas operacionales configuradas.</p> : null}</div>}
    {form ? <form onSubmit={submit} className="rounded-3xl border border-[#BFD2FF] bg-[#F5F9FF] p-5 sm:p-6">
      <div className="flex items-center justify-between"><h2 className="text-xl font-semibold text-[#041E42]">Configurar tarifa</h2><button type="button" onClick={() => setForm(null)}><X className="h-5 w-5" /></button></div>
      {requestError ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{requestError}</p> : null}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label="Nombre" error={errors.name}><input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} /></Field>
        <Field label="Modalidad" error={errors.billingMode}><select value={form.billingMode} onChange={(e) => set("billingMode", e.target.value)} className={inputClass}><option value="EFFECTIVE_MINUTE">Minuto efectivo</option><option value="EXPIRED_BLOCKS">Tramos vencidos</option></select></Field>
        {form.billingMode === "EFFECTIVE_MINUTE" ? <Field label="Valor por minuto" error={errors.minuteAmount}><input type="number" min="0.0001" step="0.0001" value={form.minuteAmount} onChange={(e) => set("minuteAmount", e.target.value)} className={inputClass} /></Field> : null}
        <Field label="Minutos sin cobro" error={errors.freePeriodSeconds}><input type="number" min="0" step="1" value={form.freePeriodMinutes} onChange={(e) => set("freePeriodMinutes", e.target.value)} className={inputClass} /></Field>
        <Field label="Inicio horario regular" error={errors.regularStartTime}><input type="time" value={form.regularStartTime} onChange={(e) => set("regularStartTime", e.target.value)} className={inputClass} /></Field>
        <Field label="Término horario regular / inicio nocturno" error={errors.regularEndTime}><input type="time" value={form.regularEndTime} onChange={(e) => set("regularEndTime", e.target.value)} className={inputClass} /></Field>
        <Field label="Término estadía nocturna" error={errors.overnightEndTime}><input type="time" value={form.overnightEndTime} onChange={(e) => set("overnightEndTime", e.target.value)} className={inputClass} /></Field>
        <Field label="Valor único estadía nocturna (CLP)" error={errors.overnightFlatAmount}><input type="number" min="0" step="1" value={form.overnightFlatAmount} onChange={(e) => set("overnightFlatAmount", e.target.value)} className={inputClass} /></Field>
        <Field label="Vigente desde" error={errors.validFrom}><input type="datetime-local" value={form.validFrom} onChange={(e) => set("validFrom", e.target.value)} className={inputClass} /></Field>
        <Field label="Vigente hasta" error={errors.validUntil}><input type="datetime-local" value={form.validUntil} onChange={(e) => set("validUntil", e.target.value)} className={inputClass} /></Field>
        <Field label="Estado"><select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputClass}><option value="DRAFT">Borrador</option><option value="ACTIVE">Activa</option></select></Field>
      </div>
      {form.billingMode === "EXPIRED_BLOCKS" ? <div className="mt-5 space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold text-[#041E42]">Tramos de tiempo</h3><button type="button" onClick={addBlock} className="text-sm font-semibold text-[#3150D8]">+ Crear tramo</button></div>{form.blocks.map((block,index) => <div key={index} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-3"><Field label={index === 0 ? "Primer tramo (mín. 30 min)" : `Tramo ${index + 1} (mín. 10 min)`} error={errors[`block_${index + 1}`]}><input type="number" min={index === 0 ? 30 : 10} value={block.durationMinutes} onChange={(e) => setBlock(index,"durationMinutes",e.target.value)} className={inputClass} /></Field><Field label="Valor" error={errors[`block_amount_${index + 1}`]}><input type="number" min="0" value={block.amount} onChange={(e) => setBlock(index,"amount",e.target.value)} className={inputClass} /></Field><label className="flex items-center gap-2 pt-7 text-sm"><input type="checkbox" checked={block.repeatAfter} onChange={(e) => setBlock(index,"repeatAfter",e.target.checked)} /> Repetir este tramo</label></div>)}</div> : null}
      <section className="mt-5 rounded-2xl border border-[#BFD2FF] bg-white p-4 text-sm text-slate-700"><h3 className="font-bold text-[#041E42]">Cumplimiento Ley 20.967</h3><ul className="mt-2 list-disc space-y-1 pl-5"><li>Minuto efectivo, sin rangos ni tramos.</li><li>Tramo vencido: primero de al menos 30 minutos y siguientes de al menos 10.</li><li>Nunca se redondea ni aproxima el cobro al alza.</li><li>El período gratuito se descuenta antes de calcular.</li><li>La pérdida del comprobante no habilita multas, recargos ni tarifas prefijadas.</li></ul></section>
      <label className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><input type="checkbox" checked={form.legalComplianceAccepted} onChange={(e) => set("legalComplianceAccepted", e.target.checked)} className="mt-1" /><span><strong>Confirmo que la tarifa publicada cumple la Ley 20.967.</strong>{errors.legalComplianceAccepted ? <span className="mt-1 block font-semibold text-red-700">{errors.legalComplianceAccepted}</span> : null}</span></label>
      <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setForm(null)} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold">Cancelar</button><button disabled={saving} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Creando tarifa..." : "Crear tarifa"}</button></div>
    </form> : null}
  </div>;
}

function RateCard({ rate }) {
  return <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-[#3150D8]">{rate.billingMode === "EFFECTIVE_MINUTE" ? "Minuto efectivo" : "Tramos vencidos"}</p><h2 className="mt-1 text-lg font-semibold text-[#041E42]">{rate.name}</h2></div><span className={`h-fit rounded-full px-3 py-1 text-xs font-bold ${rate.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{rate.status === "ACTIVE" ? "Activa" : "Borrador"}</span></div><div className="mt-4 space-y-2 text-sm text-slate-600">{rate.billingMode === "EFFECTIVE_MINUTE" ? <p><strong>{money.format(rate.minuteAmount)}</strong> por minuto efectivo</p> : rate.blocks.map((block) => <p key={block.id}>Tramo {block.sequence}: {block.durationSeconds / 60} min · <strong>{money.format(block.amount)}</strong>{block.repeatAfter ? " · repetible" : ""}</p>)}<p>Período gratuito: {rate.freePeriodSeconds / 60} minutos</p>{rate.dailyFlatAmount != null ? <p>24 horas: {money.format(rate.dailyFlatAmount)}</p> : null}<p>Factor por plazas: {rate.multiplyBySpaces ? "Sí" : "No"}</p></div></article>;
}
function Field({ label, error, children }) { return <label className="text-sm font-medium text-slate-700"><span>{label}</span><span className="mt-1.5 block">{children}</span>{error ? <small className="mt-1 block text-red-700">{error}</small> : null}</label>; }
const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-[#3150D8]";
