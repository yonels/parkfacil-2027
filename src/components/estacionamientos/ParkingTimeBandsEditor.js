"use client";

// Tarifas por franja horaria (SOL-2026-10-08-003, etapa 1): editor de juegos y
// franjas, simulador de cobro, resumen para la tarjeta de la tarifa y feriados
// del cliente. Las reglas viven en src/lib/parkingTimeBands.mjs (las mismas que
// usa el cobro real en el servidor).

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import {
  TIME_BAND_LIMITS, WEEKDAY_NAMES, calculateTimeBandCharge, formatMinuteOfDay, parseMinuteOfDay, validateTimeBandSets,
} from "@/lib/parkingTimeBands.mjs";

const money = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const DAY_SHORT = { 1: "Lu", 2: "Ma", 3: "Mi", 4: "Ju", 5: "Vi", 6: "Sá", 7: "Do" };
const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#3150D8]";

export function defaultBandSets() {
  return [{
    label: "Todos los días", daysOfWeek: [1, 2, 3, 4, 5, 6, 7], appliesToHolidays: false,
    bands: [
      { label: "Día", start: "07:00", end: "17:00", minuteAmount: "", capAmount: "" },
      { label: "Noche", start: "17:00", end: "07:00", minuteAmount: "", capAmount: "" },
    ],
  }];
}

export function bandSetsFromRate(rate) {
  return (rate?.bandSets || []).map((set) => ({
    label: set.label || "", daysOfWeek: [...(set.daysOfWeek || [])], appliesToHolidays: set.appliesToHolidays === true,
    bands: (set.bands || []).map((band) => ({
      label: band.label || "", start: formatMinuteOfDay(band.startMinute), end: formatMinuteOfDay(band.endMinute),
      minuteAmount: band.minuteAmount ?? "", capAmount: band.capAmount ?? "",
    })),
  }));
}

// Misma conversión que sanitizeRateInput en el servidor, para validar y simular
// en el navegador sin esperar a guardar.
function toDomainSets(formSets) {
  return (formSets || []).map((set) => ({
    label: set.label, daysOfWeek: set.daysOfWeek, appliesToHolidays: set.appliesToHolidays,
    bands: (set.bands || []).map((band) => ({
      label: band.label, startMinute: parseMinuteOfDay(band.start) ?? Number.NaN, endMinute: parseMinuteOfDay(band.end) ?? Number.NaN,
      minuteAmount: Number(band.minuteAmount), capAmount: band.capAmount === "" || band.capAmount == null ? null : Number(band.capAmount),
    })),
  }));
}

function localDateTimeValue(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function TimeBandsEditor({ value, onChange, serverErrors = {}, freePeriodMinutes = 0 }) {
  const sets = useMemo(() => value || [], [value]);
  const localErrors = useMemo(() => validateTimeBandSets(toDomainSets(sets)), [sets]);
  const serverMessages = Object.entries(serverErrors).filter(([key]) => /^(set_|day_|timeBands|holidays)/.test(key)).map(([, message]) => message);
  const messages = [...new Set([...Object.values(localErrors), ...serverMessages])];

  const updateSet = (setIndex, patch) => onChange(sets.map((set, index) => (index === setIndex ? { ...set, ...patch } : set)));
  const updateBand = (setIndex, bandIndex, patch) => updateSet(setIndex, {
    bands: sets[setIndex].bands.map((band, index) => (index === bandIndex ? { ...band, ...patch } : band)),
  });
  const toggleDay = (setIndex, day) => {
    const days = new Set(sets[setIndex].daysOfWeek);
    if (days.has(day)) days.delete(day); else days.add(day);
    updateSet(setIndex, { daysOfWeek: [...days].sort((a, b) => a - b) });
  };
  const addSet = () => onChange([...sets, { label: `Juego ${sets.length + 1}`, daysOfWeek: [], appliesToHolidays: false, bands: [{ label: "Todo el día", start: "00:00", end: "00:00", minuteAmount: "", capAmount: "" }] }]);
  const removeSet = (setIndex) => onChange(sets.filter((_, index) => index !== setIndex));
  const addBand = (setIndex) => {
    const bands = sets[setIndex].bands;
    const last = bands[bands.length - 1];
    updateSet(setIndex, { bands: [...bands, { label: `Franja ${bands.length + 1}`, start: last?.end || "00:00", end: bands[0]?.start || "00:00", minuteAmount: "", capAmount: "" }] });
  };
  const removeBand = (setIndex, bandIndex) => updateSet(setIndex, { bands: sets[setIndex].bands.filter((_, index) => index !== bandIndex) });
  const setHolidaySet = (setIndex, checked) => onChange(sets.map((set, index) => ({ ...set, appliesToHolidays: index === setIndex ? checked : (checked ? false : set.appliesToHolidays) })));

  return <div className="mt-5 space-y-4" data-testid="time-bands-editor">
    <div className="rounded-2xl border border-[#BFD2FF] bg-white p-4 text-sm text-slate-700">
      <p className="font-bold text-[#041E42]">Cómo funciona</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Cada minuto se cobra al precio de la franja en que comienza, según la hora de Chile.</li>
        <li>Las franjas de cada juego deben cubrir las 24 horas sin huecos. Una franja puede cruzar la medianoche (por ejemplo, 17:00 a 07:00).</li>
        <li>La franja que cruza la medianoche pertenece al día en que comienza.</li>
        <li>El tope es opcional y limita lo cobrado cada vez que la estadía pasa por esa franja (por ejemplo, máximo por noche).</li>
        <li>Cada día de la semana debe estar en un solo juego. Los feriados de la empresa usan el juego marcado como &ldquo;Feriados&rdquo;.</li>
      </ul>
    </div>

    {sets.map((set, setIndex) => <section key={setIndex} className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="time-band-set">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[180px] flex-1 text-sm font-medium text-slate-700"><span>Nombre del juego</span>
          <input value={set.label} onChange={(e) => updateSet(setIndex, { label: e.target.value })} maxLength={60} className={`mt-1 ${inputClass}`} /></label>
        {sets.length > 1 ? <button type="button" onClick={() => removeSet(setIndex)} className="inline-flex items-center gap-1 rounded-full border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700"><Trash2 className="h-3.5 w-3.5" /> Quitar juego</button> : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-500">Días:</span>
        {[1, 2, 3, 4, 5, 6, 7].map((day) => <button key={day} type="button" aria-pressed={set.daysOfWeek.includes(day)} title={WEEKDAY_NAMES[day]} onClick={() => toggleDay(setIndex, day)}
          className={`h-8 w-10 rounded-lg border text-xs font-bold ${set.daysOfWeek.includes(day) ? "border-[#3150D8] bg-[#3150D8] text-white" : "border-slate-200 bg-white text-slate-600"}`}>{DAY_SHORT[day]}</button>)}
        <label className="ml-2 inline-flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={set.appliesToHolidays} onChange={(e) => setHolidaySet(setIndex, e.target.checked)} /> Feriados</label>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-xs text-slate-500"><th className="py-1 pr-2">Franja</th><th className="py-1 pr-2">Desde</th><th className="py-1 pr-2">Hasta</th><th className="py-1 pr-2">$ por minuto</th><th className="py-1 pr-2">Tope (opcional)</th><th /></tr></thead>
          <tbody>{set.bands.map((band, bandIndex) => <tr key={bandIndex}>
            <td className="py-1 pr-2"><input value={band.label} onChange={(e) => updateBand(setIndex, bandIndex, { label: e.target.value })} maxLength={40} className={inputClass} aria-label="Nombre de la franja" /></td>
            <td className="py-1 pr-2"><input type="time" value={band.start} onChange={(e) => updateBand(setIndex, bandIndex, { start: e.target.value })} className={inputClass} aria-label="Desde" /></td>
            <td className="py-1 pr-2"><input type="time" value={band.end} onChange={(e) => updateBand(setIndex, bandIndex, { end: e.target.value })} className={inputClass} aria-label="Hasta" /></td>
            <td className="py-1 pr-2"><input type="number" min="0.0001" step="0.0001" value={band.minuteAmount} onChange={(e) => updateBand(setIndex, bandIndex, { minuteAmount: e.target.value })} className={inputClass} aria-label="Valor por minuto" /></td>
            <td className="py-1 pr-2"><input type="number" min="1" step="1" value={band.capAmount} onChange={(e) => updateBand(setIndex, bandIndex, { capAmount: e.target.value })} placeholder="Sin tope" className={inputClass} aria-label="Tope" /></td>
            <td className="py-1">{set.bands.length > 1 ? <button type="button" onClick={() => removeBand(setIndex, bandIndex)} aria-label="Quitar franja" className="rounded-full p-2 text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button> : null}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="mt-1 text-xs text-slate-500">&ldquo;Hasta&rdquo; no se incluye: 12:00 a 15:00 cobra de 12:00 a 14:59. Para una sola franja de 24 horas usa la misma hora en &ldquo;Desde&rdquo; y &ldquo;Hasta&rdquo; (por ejemplo, 00:00 a 00:00).</p>
      {set.bands.length < TIME_BAND_LIMITS.maxBandsPerSet ? <button type="button" onClick={() => addBand(setIndex)} className="mt-2 inline-flex items-center gap-1 rounded-full border border-[#3150D8] px-3 py-1.5 text-xs font-bold text-[#3150D8]"><Plus className="h-3.5 w-3.5" /> Agregar franja</button> : null}
    </section>)}
    {sets.length < TIME_BAND_LIMITS.maxSets ? <button type="button" onClick={addSet} className="inline-flex items-center gap-1 rounded-full border border-[#3150D8] bg-white px-3 py-1.5 text-xs font-bold text-[#3150D8]"><Plus className="h-3.5 w-3.5" /> Agregar juego de días</button> : null}

    {messages.length ? <ul className="space-y-1 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900" data-testid="time-bands-errors">{messages.map((message) => <li key={message}>{message}</li>)}</ul>
      : <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">Las franjas cubren las 24 horas de todos los días.</p>}

    <TimeBandsSimulator sets={sets} valid={!Object.keys(localErrors).length} freePeriodMinutes={freePeriodMinutes} />
  </div>;
}

function TimeBandsSimulator({ sets, valid, freePeriodMinutes }) {
  const [entry, setEntry] = useState(() => { const date = new Date(); date.setHours(16, 0, 0, 0); return localDateTimeValue(date); });
  const [exit, setExit] = useState(() => { const date = new Date(); date.setDate(date.getDate() + 1); date.setHours(8, 0, 0, 0); return localDateTimeValue(date); });
  const result = useMemo(() => {
    if (!valid || !entry || !exit) return null;
    return calculateTimeBandCharge({ sets: toDomainSets(sets), freePeriodSeconds: Math.max(0, Number(freePeriodMinutes || 0)) * 60, entryAt: new Date(entry), exitAt: new Date(exit) });
  }, [sets, valid, entry, exit, freePeriodMinutes]);
  return <section className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="time-bands-simulator">
    <p className="text-sm font-bold text-[#041E42]">Simular un cobro</p>
    <p className="mt-1 text-xs text-slate-500">Prueba la configuración antes de guardar. No considera feriados ni cupones.</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-semibold text-slate-600">Ingreso<input type="datetime-local" value={entry} onChange={(e) => setEntry(e.target.value)} className={`mt-1 ${inputClass}`} /></label>
      <label className="text-xs font-semibold text-slate-600">Salida<input type="datetime-local" value={exit} onChange={(e) => setExit(e.target.value)} className={`mt-1 ${inputClass}`} /></label>
    </div>
    {!valid ? <p className="mt-3 text-xs text-slate-500">Corrige las franjas para simular.</p> : null}
    {valid && result && !result.valid ? <p className="mt-3 text-xs font-semibold text-rose-700">{Object.values(result.errors || {}).join(" ")}</p> : null}
    {valid && result?.valid && result.requiresDailyPolicy ? <p className="mt-3 text-xs font-semibold text-amber-800">Estadía demasiado larga: quedaría para revisión administrativa.</p> : null}
    {valid && result?.valid && !result.requiresDailyPolicy ? <div className="mt-3 text-sm">
      <ul className="space-y-1">{result.passes.map((pass, index) => <li key={index} className="flex justify-between gap-3">
        <span>{pass.setLabel} · {pass.label} ({pass.bandDate}) · {pass.minutes} min × {money.format(pass.minuteAmount)}{pass.capApplied ? ` = ${money.format(pass.grossAmount)} → tope` : ""}</span>
        <strong>{money.format(pass.amount)}</strong></li>)}</ul>
      <p className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-bold text-[#041E42]"><span>Total ({result.chargedMinutes} min cobrables)</span><span data-testid="time-bands-simulated-total">{money.format(result.amount)}</span></p>
    </div> : null}
  </section>;
}

// Resumen en la tarjeta de la tarifa.
export function TimeBandsSummary({ rate }) {
  return <div className="space-y-2" data-testid="time-bands-summary">
    {(rate.bandSets || []).map((set) => <div key={set.id || set.sequence}>
      <p className="font-semibold text-[#041E42]">{set.label || "Juego"} · {set.daysOfWeek.map((day) => DAY_SHORT[day]).join(" ")}{set.appliesToHolidays ? " · Feriados" : ""}</p>
      <ul className="mt-1 space-y-0.5">{set.bands.map((band) => <li key={band.id || band.sequence}>
        {formatMinuteOfDay(band.startMinute)}–{formatMinuteOfDay(band.endMinute)} {band.label ? `(${band.label}) ` : ""}· <strong>{money.format(band.minuteAmount)}</strong>/min{band.capAmount != null ? ` · tope ${money.format(band.capAmount)}` : ""}
      </li>)}</ul>
    </div>)}
  </div>;
}

// Feriados propios de la empresa (D14): aplican a todas sus tarifas por franja.
export function CompanyHolidaysManager({ parking }) {
  const endpoint = `/api/estacionamientos/${parking.code}/feriados`;
  const [holidays, setHolidays] = useState([]);
  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    authenticatedFetch(endpoint).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No fue posible cargar los feriados.");
      if (active) setHolidays(body.data || []);
    }).catch((cause) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [endpoint]);
  async function add(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await authenticatedFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, label }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No fue posible guardar el feriado.");
      setHolidays((current) => [...current, body.data].sort((a, b) => a.date.localeCompare(b.date)));
      setDate(""); setLabel("");
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  async function remove(holiday) {
    setBusy(true); setError("");
    try {
      const response = await authenticatedFetch(`${endpoint}/${holiday.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No fue posible quitar el feriado.");
      setHolidays((current) => current.filter((item) => item.id !== holiday.id));
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  return <section className="rounded-3xl border border-slate-200 bg-white p-5" data-testid="company-holidays">
    <h2 className="text-lg font-semibold text-[#041E42]">Feriados de la empresa</h2>
    <p className="mt-1 text-sm text-slate-600">Se cobran con el juego de franjas marcado como &ldquo;Feriados&rdquo; en todos los estacionamientos de la empresa. Sin juego de feriados, se cobran como su día de la semana.</p>
    <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-3">
      <label className="text-xs font-semibold text-slate-600">Fecha<input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={`mt-1 ${inputClass}`} /></label>
      <label className="min-w-[200px] flex-1 text-xs font-semibold text-slate-600">Descripción<input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="Fiestas Patrias" className={`mt-1 ${inputClass}`} /></label>
      <button disabled={busy || !date} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Agregar feriado</button>
    </form>
    {error ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    {holidays.length ? <ul className="mt-4 divide-y divide-slate-100 text-sm">{holidays.map((holiday) => <li key={holiday.id} className="flex items-center justify-between py-2">
      <span><strong>{holiday.date}</strong>{holiday.label ? ` · ${holiday.label}` : ""}</span>
      <button type="button" disabled={busy} onClick={() => remove(holiday)} className="text-xs font-bold text-rose-700">Quitar</button>
    </li>)}</ul> : <p className="mt-4 text-sm text-slate-500">Sin feriados registrados.</p>}
  </section>;
}
