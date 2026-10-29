"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { DEFAULT_SHIFT_RULES } from "@/lib/pos/shiftRulesCore.mjs";

// Reglas de turnos del estacionamiento (SOL-2026-10-29-006): cómo controla el
// POS el inicio y el término de los turnos. Todo parte en «como hoy».
const START_OPTIONS = [
  ["FREE", "Sin restricción (como hoy)"],
  ["60", "Desde 60 minutos antes del inicio"],
  ["30", "Desde 30 minutos antes del inicio"],
  ["15", "Desde 15 minutos antes del inicio"],
  ["0", "Solo desde la hora exacta de inicio"],
];
const EXPIRED_OPTIONS = [
  ["ALLOW", "Seguir operando (como hoy)"],
  ["WARN", "Avisar y permitir seguir"],
  ["BLOCK", "Exigir el cierre antes de seguir"],
];
const ON_DEMAND_OPTIONS = [
  ["ALWAYS", "Siempre permitido (como hoy)"],
  ["NO_PROGRAMMED", "Solo si el operador no tiene un turno programado ese día"],
  ["NEVER", "No permitido: solo turnos programados"],
];
const selectClass = "mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]";

function Rule({ id, label, value, options, onChange, children }) {
  return <div className="border-t border-slate-100 pt-4 first:border-t-0 first:pt-0">
    <label htmlFor={id} className="text-sm font-semibold text-[#041E42]">{label}</label>
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={selectClass}>
      {options.map(([optionValue, text]) => <option key={optionValue} value={optionValue}>{text}</option>)}
    </select>
    <p className="mt-2 text-sm text-slate-600">{children}</p>
  </div>;
}

export default function ShiftRulesSettings({ parkingId }) {
  const endpoint = `/api/estacionamientos/${parkingId}/configuracion/reglas-turnos`;
  const [rules, setRules] = useState({ ...DEFAULT_SHIFT_RULES });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let active = true;
    authenticatedFetch(endpoint).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No fue posible cargar las reglas.");
      if (active) setRules(body.data);
    }).catch((cause) => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [endpoint]);

  const set = (field) => (value) => { setRules((current) => ({ ...current, [field]: value })); setFeedback(""); };

  async function save(next = rules) {
    setSaving(true); setError(""); setFeedback("");
    try {
      const response = await authenticatedFetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No fue posible guardar.");
      setRules(body.data);
      setFeedback("Reglas guardadas. El POS las aplica desde la próxima operación.");
    } catch (cause) { setError(cause.message); } finally { setSaving(false); }
  }

  return <div className="space-y-5">
    <Link href={`/estacionamientos/${parkingId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-[#3150D8]"><ArrowLeft className="h-4 w-4" /> Volver al estacionamiento</Link>
    <section className="rounded-3xl border border-slate-200 bg-white p-6">
      <h2 className="text-xl font-semibold text-[#041E42]">Reglas de turnos</h2>
      <p className="mt-2 text-sm text-slate-600">Cómo controla el POS el inicio y el término de los turnos en este estacionamiento. Todo parte en «como hoy»: nada cambia hasta que elijas otra opción.</p>
      {loading ? <p className="mt-5 text-sm text-slate-500">Cargando...</p> : <div className="mt-5 space-y-4">
        <Rule id="shift-start-window" label="1. Inicio de turno programado" value={rules.startWindow} options={START_OPTIONS} onChange={set("startWindow")}>
          El POS no deja iniciar un turno programado antes de este margen ni después de su hora de término.
        </Rule>
        <Rule id="shift-expired-policy" label="2. Turno vencido" value={rules.expiredPolicy} options={EXPIRED_OPTIONS} onChange={set("expiredPolicy")}>
          Vencido = pasó su hora de término (incluye los de días anteriores). Con «Exigir el cierre» el operador ya no registra ingresos: si hay otro turno cuyo horario ya empezó, ese turno cobra los vehículos que quedan y el anterior solo puede cerrar; si no lo hay, el mismo operador cobra los vehículos que quedan y luego cierra.
        </Rule>
        <Rule id="shift-on-demand-policy" label="3. Turno a pedido (sin programar)" value={rules.onDemandPolicy} options={ON_DEMAND_OPTIONS} onChange={set("onDemandPolicy")}>
          Un turno a pedido dura hasta las 23:59 del mismo día; después se considera vencido (regla 2).
        </Rule>
        <div className="rounded-2xl bg-[#EEF4FF] p-4 text-sm text-[#041E42]">4. Siempre activa: en un turno abierto, «Editar» no cambia el estado, el operador, la fecha ni el horario.</div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={saving} onClick={() => { const next = { ...DEFAULT_SHIFT_RULES }; setRules(next); save(next); }} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60">Volver a «como hoy»</button>
          <button type="button" disabled={saving} onClick={() => save()} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" data-testid="shift-rules-save">{saving ? "Guardando..." : "Guardar reglas"}</button>
        </div>
      </div>}
      {feedback ? <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{feedback}</p> : null}
      {error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p> : null}
      <p className="mt-5 text-sm"><Link href={`/turnos?estacionamiento=${encodeURIComponent(parkingId)}`} className="font-semibold text-[#3150D8]">Ver turnos de este estacionamiento</Link></p>
    </section>
  </div>;
}
