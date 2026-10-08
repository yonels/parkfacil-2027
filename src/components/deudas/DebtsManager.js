"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ParkFacilDataGrid from "@/components/ui/ParkFacilDataGrid";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { DEBT_PAYMENT_METHOD_LABELS, DEBT_STATUS_LABELS } from "@/lib/parkingDebtsCore.mjs";

// Deudas por vehículos que se retiraron sin pagar (SOL-2026-10-08-003). Solo
// administradores: marcar pagada (medio y referencia) o condonar (motivo).
const money = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
// Nunca lanza: un valor ausente o inválido se muestra como "—".
const dateTime = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short", timeZone: "America/Santiago" }).format(date);
};
const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#3150D8]";

export default function DebtsManager() {
  const [status, setStatus] = useState("PENDING");
  const [plate, setPlate] = useState("");
  const [query, setQuery] = useState({ status: "PENDING", plate: "" });
  const [debts, setDebts] = useState([]);
  const [requiresReview, setRequiresReview] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [action, setAction] = useState(null);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (query.status) params.set("status", query.status);
    if (query.plate) params.set("plate", query.plate);
    authenticatedFetch(`/api/deudas?${params.toString()}`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No fue posible cargar las deudas.");
      if (!active) return;
      setDebts(body.data || []);
      setRequiresReview(body.requiresReview || []);
      setError("");
    }).catch((cause) => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query]);

  const search = useCallback((event) => {
    event.preventDefault();
    setLoading(true);
    setQuery({ status, plate: plate.trim() });
  }, [status, plate]);

  const totals = useMemo(() => debts.reduce((sum, debt) => ({ count: sum.count + 1, amount: sum.amount + debt.amount }), { count: 0, amount: 0 }), [debts]);

  const columns = useMemo(() => [
    { key: "licensePlate", label: "Patente", className: "font-semibold text-[#041E42]" },
    { key: "parkingName", label: "Estacionamiento" },
    { key: "entryAt", label: "Ingreso", render: (_, row) => dateTime(row.entryAt), exportValue: (row) => dateTime(row.entryAt) },
    { key: "exitAt", label: "Salida (cierre de turno)", render: (_, row) => dateTime(row.exitAt), exportValue: (row) => dateTime(row.exitAt) },
    { key: "elapsedMinutes", label: "Minutos" },
    { key: "amount", label: "Monto", render: (_, row) => money.format(row.amount), exportValue: (row) => row.amount },
    { key: "statusLabel", label: "Estado" },
    { key: "markedByName", label: "Registrada por" },
    { key: "notes", label: "Observación" },
    { key: "resolution", label: "Resolución", render: (_, row) => row.status === "PAID"
      ? `${row.paidMethodLabel || ""}${row.paidReference ? ` · ${row.paidReference}` : ""} · ${dateTime(row.paidAt)}`
      : row.status === "WAIVED" ? `${row.waivedReason} · ${dateTime(row.waivedAt)}` : "—",
    exportValue: (row) => row.status === "PAID" ? `${row.paidMethodLabel || ""} ${row.paidReference || ""}`.trim() : row.status === "WAIVED" ? row.waivedReason : "" },
    { key: "actions", label: "Acciones", render: (_, row) => row.status === "PENDING" ? <span className="flex gap-2">
      <button type="button" onClick={() => setAction({ type: "pay", debt: row })} className="rounded-full border border-[#3150D8] px-3 py-1 text-xs font-bold text-[#3150D8]">Marcar pagada</button>
      <button type="button" onClick={() => setAction({ type: "waive", debt: row })} className="rounded-full border border-rose-300 px-3 py-1 text-xs font-bold text-rose-700">Condonar</button>
    </span> : null, exportValue: () => "" },
  ], []);

  return <div className="space-y-5">
    <section className="rounded-3xl border border-slate-200 bg-white p-5">
      <form onSubmit={search} className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-slate-600">Estado
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={`mt-1 ${inputClass}`}>
            <option value="">Todas</option>
            {Object.entries(DEBT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
        <label className="text-xs font-semibold text-slate-600">Patente
          <input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="ABCD12" className={`mt-1 ${inputClass}`} /></label>
        <button className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white">Buscar</button>
      </form>
      <p className="mt-4 text-sm text-slate-600" data-testid="debts-total">{totals.count} {totals.count === 1 ? "deuda" : "deudas"} · {money.format(totals.amount)}</p>
    </section>
    {error ? <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    {requiresReview.length ? <section className="rounded-3xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900" data-testid="debts-requires-review">
      <p className="font-bold">Salidas sin pago sin monto calculado ({requiresReview.length})</p>
      <p className="mt-1">El turno ya cerró pero no había una tarifa vigente válida para calcular el monto. Revisa la tarifa del estacionamiento; la deuda se creará al volver a cargar esta página.</p>
      <ul className="mt-2 list-disc pl-5">{requiresReview.map((row) => <li key={row.stayId}>{row.plate} · {row.parkingName} · ingreso {dateTime(row.entryAt)} · marcada por {row.markedByName}</li>)}</ul>
    </section> : null}
    {loading ? <p className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-500">Cargando deudas...</p>
      : <ParkFacilDataGrid storageKey="deudas:lista" columns={columns} rows={debts} globalSearchPlaceholder="Buscar patente, estacionamiento..." emptyMessage="Sin deudas" exportFilename="deudas_pendientes" exportSheetName="Deudas" />}
    {action ? <DebtActionDialog action={action} onClose={() => setAction(null)} onDone={(updated) => { setAction(null); setDebts((current) => current.map((debt) => debt.id === updated.id ? updated : debt)); }} /> : null}
  </div>;
}

function DebtActionDialog({ action, onClose, onDone }) {
  const isPay = action.type === "pay";
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/deudas/${action.debt.id}/${isPay ? "pagar" : "condonar"}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isPay ? { method, reference } : { reason }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No fue posible actualizar la deuda.");
      onDone(body.data);
    } catch (cause) { setError(cause.message); } finally { setSaving(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" data-testid="debt-action-dialog">
    <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-6">
      <h2 className="text-lg font-semibold text-[#041E42]">{isPay ? "Marcar deuda como pagada" : "Condonar deuda"}</h2>
      <p className="mt-1 text-sm text-slate-600">{action.debt.licensePlate} · {money.format(action.debt.amount)} · {action.debt.parkingName}</p>
      {isPay ? <div className="mt-4 space-y-3">
        <label className="block text-xs font-semibold text-slate-600">Medio de pago
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={`mt-1 ${inputClass}`}>
            {Object.entries(DEBT_PAYMENT_METHOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
        <label className="block text-xs font-semibold text-slate-600">Referencia (opcional)
          <input value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} className={`mt-1 ${inputClass}`} /></label>
      </div> : <label className="mt-4 block text-xs font-semibold text-slate-600">Motivo (obligatorio)
        <textarea value={reason} maxLength={300} required onChange={(e) => setReason(e.target.value)} rows={3} className={`mt-1 ${inputClass}`} /></label>}
      <p className="mt-3 text-xs text-slate-500">Esta acción no se puede deshacer.</p>
      {error ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold">Cancelar</button>
        <button disabled={saving || (!isPay && !reason.trim())} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Guardando..." : isPay ? "Confirmar pago" : "Confirmar condonación"}</button>
      </div>
    </form>
  </div>;
}
