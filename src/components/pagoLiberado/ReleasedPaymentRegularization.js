"use client";

import { useState } from "react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { describeRegularization, REGULARIZATION_ACTIONS, regularizationOptions, validateRegularizationInput } from "@/lib/releasedPayment/regularizationCore.mjs";
import { formatClp } from "@/lib/releasedPayment/tariffCore.mjs";
import { formatLocalDateTime, toLocalInputValue } from "@/lib/releasedPayment/zonedTime.mjs";

// Etapa 3 (paso 3.2): regularización de estadías liberadas por el
// administrador, sin tocar dinero, con motivo y auditoría. Root ve las
// estadías y lo regularizado, sin acciones.

const input = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm";
const label = "block text-xs font-bold uppercase tracking-wide text-slate-600";
const card = "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm";
const button = "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-60";

const CONSEQUENCES = {
  CLOSE_OPEN: "La estadía queda cerrada con $0 y la hora de salida indicada, sin turno de pago: no cambia el cierre de caja ni los montos cobrados. Libera el cupo.",
  VOID_BENEFIT_OPEN: "La estadía deja de ser liberada y libera el cupo. Sigue abierta: a la salida el POS la cobra como estadía normal desde su ingreso.",
  VOID_BENEFIT_CLOSED: "La estadía ya salió: no se modifica su monto, medio de pago ni turno. Solo queda registrada la anulación del beneficio para reportes y auditoría.",
};

function RegularizationForm({ parkingId, target, onDone, onCancel }) {
  const { stay, action } = target;
  const [openedAt] = useState(() => toLocalInputValue(Date.now()));
  const [exitAt, setExitAt] = useState(openedAt);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const consequence = action === REGULARIZATION_ACTIONS.CLOSE_OPEN ? CONSEQUENCES.CLOSE_OPEN : stay.status === "OPEN" ? CONSEQUENCES.VOID_BENEFIT_OPEN : CONSEQUENCES.VOID_BENEFIT_CLOSED;

  async function submit(event) {
    event.preventDefault();
    const payload = { action, exitAt, reason };
    const checked = validateRegularizationInput(payload, { stay });
    if (checked.errors) { setError(checked.errors.join(" ")); return; }
    setSaving(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/pago-liberado/estacionamientos/${parkingId}/estadias/${stay.id}/regularizacion`, {
        method: "POST", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error([body?.error || "No fue posible regularizar la estadía.", ...(body?.details || [])].join(" "));
      onDone();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-black text-amber-950">{action === REGULARIZATION_ACTIONS.CLOSE_OPEN ? "Cerrar estadía abierta" : "Anular beneficio"} · {stay.license_plate} · ticket {stay.code}</p>
      <p className="text-sm text-amber-950">{consequence}</p>
      <div className="grid gap-3 md:grid-cols-3">
        {action === REGULARIZATION_ACTIONS.CLOSE_OPEN ? (
          <label className={label}>Salida (hora de Chile)<input type="datetime-local" className={input} required value={exitAt} min={toLocalInputValue(stay.entry_at)} max={openedAt} onChange={(event) => setExitAt(event.target.value)} /></label>
        ) : null}
        <label className={`${label} md:col-span-2`}>Motivo<input className={input} required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ej.: el vehículo salió sin registrar la salida en el POS" /></label>
      </div>
      {error ? <p role="alert" className="text-sm font-semibold text-rose-800">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className={`${button} bg-amber-700 text-white`}>{saving ? "Guardando…" : "Confirmar regularización"}</button>
        <button type="button" onClick={onCancel} className={`${button} border border-slate-300 bg-white text-slate-700`}>Cancelar</button>
      </div>
    </form>
  );
}

export default function ReleasedPaymentRegularization({ parkingId, canEdit, openStays, closedStays, regularizations, authorizations, onSaved }) {
  const [target, setTarget] = useState(null);
  const beneficiary = (stay) => authorizations.find((item) => item.id === stay.released_payment_authorization_id)?.beneficiaryName || "";
  const voided = new Set(regularizations.filter((item) => item.action === REGULARIZATION_ACTIONS.VOID_BENEFIT).map((item) => item.stayId));

  const actions = (stay) => {
    if (!canEdit) return null;
    const options = regularizationOptions(stay, regularizations);
    return (
      <td className="p-2 whitespace-nowrap">
        {options.canClose ? <button type="button" onClick={() => setTarget({ stay, action: REGULARIZATION_ACTIONS.CLOSE_OPEN })} className="mr-2 font-bold text-[#3150D8]">Cerrar</button> : null}
        {options.canVoid ? <button type="button" onClick={() => setTarget({ stay, action: REGULARIZATION_ACTIONS.VOID_BENEFIT })} className="font-bold text-amber-800">Anular beneficio</button> : null}
      </td>
    );
  };

  return (
    <section className={card}>
      <h3 className="text-lg font-bold text-[#041E42]">Regularización de estadías liberadas</h3>
      <p className="mt-1 text-xs text-slate-500">Sin tocar dinero: cerrar una estadía liberada que quedó abierta o anular un beneficio mal aplicado, siempre con motivo. No cambia montos cobrados ni el cierre de turno, y queda en la auditoría.{canEdit ? "" : " Supervisión: lo regulariza el administrador del estacionamiento."}</p>

      <h4 className="mt-4 text-sm font-black text-[#041E42]">Abiertas ({openStays.length})</h4>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="p-2">Patente</th><th className="p-2">Ticket</th><th className="p-2">Beneficiario</th><th className="p-2">Ingreso</th>{canEdit ? <th className="p-2" /> : null}</tr></thead>
          <tbody>
            {openStays.map((stay) => (
              <tr key={stay.id} className="border-t border-slate-100">
                <td className="p-2 font-black">{stay.license_plate}</td>
                <td className="p-2">{stay.code}</td>
                <td className="p-2">{beneficiary(stay) || "—"}</td>
                <td className="p-2">{formatLocalDateTime(stay.entry_at)}</td>
                {actions({ ...stay, status: stay.status || "OPEN" })}
              </tr>
            ))}
            {!openStays.length ? <tr><td colSpan={5} className="p-2 text-slate-500">No hay estadías liberadas abiertas.</td></tr> : null}
          </tbody>
        </table>
      </div>

      <h4 className="mt-4 text-sm font-black text-[#041E42]">Cerradas en los últimos 30 días ({closedStays.length})</h4>
      <div className="mt-2 max-h-80 overflow-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="p-2">Patente</th><th className="p-2">Ticket</th><th className="p-2">Ingreso</th><th className="p-2">Salida</th><th className="p-2">Cobrado</th><th className="p-2">Estado</th>{canEdit ? <th className="p-2" /> : null}</tr></thead>
          <tbody>
            {closedStays.map((stay) => (
              <tr key={stay.id} className="border-t border-slate-100">
                <td className="p-2 font-black">{stay.license_plate}</td>
                <td className="p-2">{stay.code}<span className="block text-xs text-slate-500">{stay.payment_code}</span></td>
                <td className="p-2">{formatLocalDateTime(stay.entry_at)}</td>
                <td className="p-2">{formatLocalDateTime(stay.exit_at)}</td>
                <td className="p-2">{formatClp(stay.total_amount)}</td>
                <td className="p-2">{voided.has(stay.id) ? <span className="font-bold text-amber-800">Beneficio anulado</span> : String(stay.payment_code || "").startsWith("REG-") ? "Cerrada por regularización" : "Salida registrada"}</td>
                {actions(stay)}
              </tr>
            ))}
            {!closedStays.length ? <tr><td colSpan={7} className="p-2 text-slate-500">Sin estadías liberadas cerradas en los últimos 30 días.</td></tr> : null}
          </tbody>
        </table>
      </div>

      {target ? <RegularizationForm key={`${target.stay.id}-${target.action}`} parkingId={parkingId} target={target} onDone={() => { setTarget(null); onSaved(); }} onCancel={() => setTarget(null)} /> : null}

      <h4 className="mt-4 text-sm font-black text-[#041E42]">Regularizaciones registradas ({regularizations.length})</h4>
      <ul className="mt-2 space-y-2 text-sm">
        {regularizations.map((item) => (
          <li key={item.id} className="rounded-xl border border-slate-200 p-3">
            <p className="font-bold text-[#041E42]">{item.licensePlate} · {describeRegularization(item)}</p>
            <p className="text-xs text-slate-600">{formatLocalDateTime(item.createdAt)} · {item.actorEmail} · Motivo: {item.reason}</p>
          </li>
        ))}
        {!regularizations.length ? <li className="text-slate-500">Sin regularizaciones.</li> : null}
      </ul>
    </section>
  );
}
