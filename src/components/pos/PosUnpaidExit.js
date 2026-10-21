"use client";

// POS (SOL-2026-10-08-003, etapa 1): "Se retiró sin pagar", aviso de deuda al
// ingresar, desglose por franja y salidas sin pago en el cierre de turno.
// Componentes pequeños y aislados para no tocar los flujos de cobro existentes.

import { useState } from "react";

const money = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const dateTime = (value) => {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(value));
  } catch {
    return String(value);
  }
};

async function postDataEntry(body) {
  const response = await fetch("/api/data-entry", {
    method: "POST",
    headers: { "content-type": "application/json", "x-parkfacil-portal": "terminal" },
    cache: "no-store",
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload: payload || {} };
}

export function DebtNoticeBanner({ notice }) {
  if (!notice?.count) return null;
  return (
    <div className="mb-4 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950" role="alert" data-testid="pos-debt-notice">
      <p className="text-sm font-black uppercase tracking-[0.08em]">Deuda pendiente</p>
      <p className="mt-1 text-lg font-black">{notice.plate} debe {money.format(notice.total)}</p>
      <ul className="mt-2 space-y-1 text-sm font-semibold">
        {notice.debts.map((debt) => (
          <li key={debt.id}>Se retiró sin pagar · {dateTime(debt.exitAt || debt.createdAt)} · {debt.parkingName || "-"} · {money.format(debt.amount)}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs font-semibold">Verifica la patente antes de informar al conductor. El ingreso quedó registrado.</p>
    </div>
  );
}

export function ChargeBreakdownList({ breakdown }) {
  if (!breakdown?.passes?.length) return null;
  return (
    <div data-testid="pos-charge-breakdown">
      <p className="text-xs font-black uppercase tracking-[0.08em] text-rose-700">Detalle por franja</p>
      <ul className="mt-1 space-y-1 text-sm font-semibold text-rose-900">
        {breakdown.passes.map((pass, index) => (
          <li key={index} className="flex items-start justify-between gap-3">
            <span>
              {pass.label} {pass.bandStart}–{pass.bandEnd} · {pass.minutes} min × {money.format(pass.minuteAmount)}
              {pass.capApplied ? ` (${money.format(pass.grossAmount)}, tope aplicado)` : ""}
            </span>
            <span className="font-black text-rose-950">{money.format(pass.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Botón y confirmación "SE RETIRÓ SIN PAGAR" (D8, D12, D15). onSessionExpired:
// el POS redirige al login ante un 401, igual que el resto de las acciones.
export function UnpaidExitAction({ stay, disabled, onDone, onSessionExpired }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    if (!stay?.id || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await postDataEntry({ action: "UNPAID_EXIT", stayId: stay.id, notes });
      if (!result.ok) {
        if (result.status === 401) { onSessionExpired?.(); return; }
        setError(result.payload?.error || "No fue posible registrar la salida sin pago.");
        return;
      }
      setOpen(false);
      setNotes("");
      onDone?.(result.payload?.data?.stay || null);
    } catch {
      setError("Error de red al registrar la salida sin pago.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); setError(""); }}
        disabled={disabled}
        className="rounded-xl border-2 border-amber-500 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.06em] text-amber-800 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="pos-unpaid-exit-button"
      >
        SE RETIRÓ SIN PAGAR
      </button>
    );
  }
  return (
    <div className="w-full rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950" data-testid="pos-unpaid-exit-confirm">
      <p className="text-base font-black">¿EL VEHÍCULO {stay?.license_plate || ""} SE RETIRÓ SIN PAGAR?</p>
      <p className="mt-1 text-xs font-semibold">Se libera el cupo. El cobro sigue corriendo hasta el cierre de tu turno y queda como deuda de la patente. Puedes revertirlo mientras el turno siga abierto.</p>
      <label className="mt-3 block text-xs font-black uppercase tracking-[0.06em]">
        Observación (opcional)
        <input value={notes} maxLength={300} onChange={(event) => setNotes(event.target.value)} className="mt-1 w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-semibold normal-case text-slate-900 outline-none" />
      </label>
      {error ? <p className="mt-2 rounded-xl bg-rose-50 p-2 text-sm font-semibold text-rose-700">{error}</p> : null}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={() => void confirm()} disabled={busy} className="rounded-xl bg-amber-600 px-4 py-3 text-sm font-black uppercase text-white disabled:opacity-60">
          {busy ? "Registrando..." : "SÍ, SE RETIRÓ SIN PAGAR"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className="rounded-xl border border-amber-300 bg-white px-4 py-3 text-sm font-black uppercase text-amber-900">
          CANCELAR
        </button>
      </div>
    </div>
  );
}

// Salidas sin pago del turno abierto, con monto en curso y opción de revertir.
export function UnpaidExitsReview({ rows, onChanged, onSessionExpired }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  if (!Array.isArray(rows) || !rows.length) return null;
  const totalSoFar = rows.reduce((sum, row) => sum + Number(row.amountSoFar || 0), 0);

  async function revert(row) {
    setBusyId(row.stayId);
    setError("");
    try {
      const result = await postDataEntry({ action: "UNPAID_REVERT", stayId: row.stayId });
      if (!result.ok) {
        if (result.status === 401) { onSessionExpired?.(); return; }
        setError(result.payload?.error || "No fue posible revertir la marca.");
        return;
      }
      onChanged?.();
    } catch {
      setError("Error de red al revertir la marca.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950" data-testid="pos-unpaid-exits-review">
      <p className="text-sm font-black uppercase tracking-[0.08em]">Se retiraron sin pagar ({rows.length})</p>
      <p className="mt-1 text-xs font-semibold">No son recaudación. Al cerrar el turno, el monto se calcula hasta la hora de cierre y queda como deuda. Monto en curso: {money.format(totalSoFar)}.</p>
      <ul className="mt-3 space-y-2">
        {rows.map((row) => (
          <li key={row.stayId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-white p-3 text-sm font-semibold">
            <span>{row.plate} · ingreso {dateTime(row.entryAt)} · {row.amountSoFar === null ? "sin tarifa vigente" : money.format(row.amountSoFar)}</span>
            <button type="button" onClick={() => void revert(row)} disabled={busyId === row.stayId} className="rounded-lg border border-amber-400 px-3 py-1.5 text-xs font-black uppercase text-amber-900 disabled:opacity-60">
              {busyId === row.stayId ? "Revirtiendo..." : "Revertir (sigue en el parking)"}
            </button>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-2 rounded-xl bg-rose-50 p-2 text-sm font-semibold text-rose-700">{error}</p> : null}
    </div>
  );
}

export function ClosedUnpaidExitsSummary({ summary }) {
  if (!summary?.count) return null;
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950" data-testid="pos-closed-unpaid-summary">
      <p className="text-sm font-black uppercase tracking-[0.08em]">Salidas sin pago: {summary.count}</p>
      <p className="mt-1 text-sm font-semibold">Deuda registrada: {money.format(summary.amount)}{summary.pendingCalculation ? ` · ${summary.pendingCalculation} sin tarifa vigente (requiere revisión del administrador)` : ""}</p>
    </div>
  );
}
