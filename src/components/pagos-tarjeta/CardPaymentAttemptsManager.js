"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ParkFacilDataGrid from "@/components/ui/ParkFacilDataGrid";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { CARD_ATTEMPT_STATUS, CARD_ATTEMPT_STATUS_LABELS } from "@/lib/pos/cardPaymentAttempts.mjs";

// Pagos con tarjeta del POS (SOL-2026-10-11-001): intentos pendientes,
// inciertos y resueltos. Solo administradores. Cada fila abre su detalle; un
// intento incierto puede regularizarse dejando motivo y evidencia. El detalle
// impreso de un intento que no está pagado NO es un comprobante de pago.
const money = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const dateTime = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Santiago" }).format(date);
};
const cardTypeLabel = (value) => (value === "DEBIT" ? "Débito" : value === "CREDIT" ? "Crédito" : "—");
const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#3150D8]";
const REGULARIZABLE = [CARD_ATTEMPT_STATUS.UNCERTAIN, CARD_ATTEMPT_STATUS.SENT_TO_TUU];

export default function CardPaymentAttemptsManager() {
  const [status, setStatus] = useState("UNRESOLVED");
  const [plate, setPlate] = useState("");
  const [query, setQuery] = useState({ status: "UNRESOLVED", plate: "" });
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    params.set("status", query.status || "ALL");
    if (query.plate) params.set("plate", query.plate);
    authenticatedFetch(`/api/pagos-tarjeta?${params.toString()}`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No fue posible cargar los pagos con tarjeta.");
      if (!active) return;
      setAttempts(body.data || []);
      setError("");
    }).catch((cause) => { if (active) { setAttempts([]); setError(cause.message); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query]);

  const search = useCallback((event) => {
    event.preventDefault();
    setLoading(true);
    setQuery({ status, plate: plate.trim() });
  }, [status, plate]);

  const columns = useMemo(() => [
    { key: "plate", label: "Patente", className: "font-semibold text-[#041E42]" },
    { key: "ticketCode", label: "Ticket" },
    { key: "parkingName", label: "Estacionamiento" },
    { key: "reservedAt", label: "Fecha y hora", render: (_, row) => dateTime(row.reservedAt), exportValue: (row) => dateTime(row.reservedAt) },
    { key: "amount", label: "Monto", render: (_, row) => money.format(row.amount), exportValue: (row) => row.amount },
    { key: "cardType", label: "Medio", render: (_, row) => cardTypeLabel(row.cardType), exportValue: (row) => cardTypeLabel(row.cardType) },
    { key: "statusLabel", label: "Estado" },
    { key: "operatorName", label: "Operador" },
    { key: "deviceId", label: "Equipo" },
    { key: "reference", label: "Referencia TUU", render: (_, row) => row.reference || "—", exportValue: (row) => row.reference || "" },
    { key: "id", label: "Intento", render: (_, row) => <span className="font-mono text-xs">{String(row.id).slice(0, 8).toUpperCase()}</span>, exportValue: (row) => row.id },
    { key: "regularization", label: "Regularización", render: (_, row) => row.regularization ? `${row.regularization.byName || "Administrador"} · ${dateTime(row.regularization.at)}` : "—", exportValue: (row) => row.regularization ? `${row.regularization.byName} ${row.regularization.reason}` : "" },
    { key: "actions", label: "Detalle", render: (_, row) => <button type="button" onClick={() => setSelected(row)} className="rounded-full border border-[#3150D8] px-3 py-1 text-xs font-bold text-[#3150D8]">Ver detalle</button>, exportValue: () => "" },
  ], []);

  const unresolved = attempts.filter((item) => REGULARIZABLE.includes(item.status) || item.status === CARD_ATTEMPT_STATUS.APPROVED_PENDING_REGISTRATION).length;

  return <div className="space-y-5">
    <section className="rounded-3xl border border-slate-200 bg-white p-5 print:hidden">
      <form onSubmit={search} className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-slate-600">Estado
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={`mt-1 ${inputClass}`}>
            <option value="UNRESOLVED">Pendientes e inciertos</option>
            <option value="ALL">Todos</option>
            {Object.entries(CARD_ATTEMPT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
        <label className="text-xs font-semibold text-slate-600">Patente
          <input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="ABCD12" className={`mt-1 ${inputClass}`} /></label>
        <button className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white">Buscar</button>
      </form>
      <p className="mt-4 text-sm text-slate-600" data-testid="card-attempts-total">{attempts.length} {attempts.length === 1 ? "intento" : "intentos"} · {unresolved} por resolver</p>
    </section>
    {error ? <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 print:hidden">{error}</p> : null}
    <div className="print:hidden">
      {loading ? <p className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-500">Cargando pagos con tarjeta...</p>
        : <ParkFacilDataGrid storageKey="pagos-tarjeta:lista" columns={columns} rows={attempts} globalSearchPlaceholder="Buscar patente, ticket, operador..." emptyMessage="Sin intentos de pago" exportFilename="pagos_con_tarjeta" exportSheetName="Pagos con tarjeta" />}
    </div>
    {selected ? <AttemptDetailDialog attempt={selected} onClose={() => setSelected(null)} onUpdated={(updated) => { setAttempts((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item)); setSelected((current) => (current ? { ...current, ...updated } : current)); }} /> : null}
  </div>;
}

function Row({ label, value }) {
  return <div className="flex justify-between gap-4 border-b border-slate-100 py-1.5 text-sm"><dt className="text-slate-500">{label}</dt><dd className="text-right font-semibold text-[#041E42]">{value || "—"}</dd></div>;
}

function AttemptDetailDialog({ attempt, onClose, onUpdated }) {
  const [detail, setDetail] = useState(attempt);
  const [canRegularize, setCanRegularize] = useState(false);
  const [resolution, setResolution] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    authenticatedFetch(`/api/pagos-tarjeta/${attempt.id}`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!active || !response.ok) return;
      setDetail(body.data);
      setCanRegularize(Boolean(body.data?.canRegularize));
    }).catch(() => null);
    return () => { active = false; };
  }, [attempt.id]);

  const paid = detail.status === CARD_ATTEMPT_STATUS.PAID;
  const regularizable = canRegularize && REGULARIZABLE.includes(detail.status);

  async function submit(event) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/pagos-tarjeta/${detail.id}/regularizar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution, reference, reason, evidence }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No fue posible regularizar el intento de pago.");
      setDetail((current) => ({ ...current, ...body.data }));
      onUpdated(body.data);
      setResolution("");
    } catch (cause) { setError(cause.message); } finally { setSaving(false); }
  }

  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 print:static print:bg-white print:p-0" role="dialog" aria-modal="true" data-testid="card-attempt-detail">
    <div className="w-full max-w-xl rounded-3xl bg-white p-6 print:max-w-none print:rounded-none print:p-0">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">ParkFacil · Pago con tarjeta (POS)</p>
      <h2 className="mt-1 text-lg font-semibold text-[#041E42]">{paid ? "Detalle del pago con tarjeta" : "Detalle del intento de pago"}</h2>
      <p className={`mt-3 rounded-2xl border p-3 text-sm font-bold ${paid ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-400 bg-amber-50 text-amber-950"}`} data-testid="card-attempt-status">
        {String(detail.statusLabel || CARD_ATTEMPT_STATUS_LABELS[detail.status] || detail.status).toUpperCase()}
        {paid ? "" : " — ESTE DOCUMENTO NO ES UN COMPROBANTE DE PAGO"}
      </p>
      <dl className="mt-4">
        <Row label="Patente" value={detail.plate} />
        <Row label="Ticket" value={detail.ticketCode} />
        <Row label="Empresa" value={detail.companyName} />
        <Row label="Estacionamiento" value={detail.parkingName ? `${detail.parkingName}${detail.parkingCode ? ` · ${detail.parkingCode}` : ""}` : ""} />
        <Row label="Operador" value={detail.operatorName} />
        <Row label="Equipo" value={detail.deviceId} />
        <Row label="Fecha y hora del intento" value={dateTime(detail.reservedAt)} />
        <Row label="Monto" value={money.format(detail.amount || 0)} />
        <Row label="Medio de pago" value={cardTypeLabel(detail.cardType)} />
        <Row label="Identificador del intento" value={detail.id} />
        <Row label="Referencia TUU" value={detail.reference} />
        <Row label="Ambiente TUU" value={detail.environment} />
        <Row label="Enviado a TUU" value={dateTime(detail.sentAt)} />
        <Row label="Pago aprobado" value={dateTime(detail.approvedAt)} />
        <Row label="Pago registrado" value={paid ? `${dateTime(detail.paidAt)}${detail.paymentCode ? ` · ${detail.paymentCode}` : ""}` : "—"} />
        {detail.errorCode || detail.errorMessage ? <Row label="Informado por TUU" value={[detail.errorCode, detail.errorMessage].filter(Boolean).join(" · ")} /> : null}
      </dl>
      {detail.regularization ? <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm" data-testid="card-attempt-regularization">
        <p className="font-bold text-[#041E42]">Regularización manual (no verificada contra TUU)</p>
        <p className="mt-1 text-slate-700">{detail.regularization.byName || "Administrador"} · {dateTime(detail.regularization.at)} · estado anterior: {CARD_ATTEMPT_STATUS_LABELS[detail.regularization.previousStatus] || detail.regularization.previousStatus}</p>
        <p className="mt-1 text-slate-700">Motivo: {detail.regularization.reason}</p>
        {detail.regularization.evidence ? <p className="mt-1 text-slate-700">Evidencia: {detail.regularization.evidence}</p> : null}
      </div> : null}

      {regularizable ? <form onSubmit={submit} className="mt-5 space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 print:hidden" data-testid="card-attempt-regularize">
        <p className="text-sm font-bold text-amber-950">Regularizar resultado incierto</p>
        <p className="text-xs text-amber-900">Revisa el estado real en la app o el portal de TUU antes de continuar. Esta declaración es manual y queda registrada con tu usuario; no reemplaza una verificación contra TUU.</p>
        <label className="block text-xs font-semibold text-slate-700">Resultado comprobado
          <select value={resolution} onChange={(e) => setResolution(e.target.value)} required className={`mt-1 ${inputClass}`}>
            <option value="">Selecciona…</option>
            <option value="APPROVED">TUU muestra el pago aprobado (queda pendiente de registro)</option>
            <option value="NOT_CHARGED">TUU muestra que el pago no se realizó (libera el ticket)</option>
          </select></label>
        {resolution === "APPROVED" ? <label className="block text-xs font-semibold text-slate-700">Número de operación TUU (12 dígitos, si está disponible)
          <input value={reference} inputMode="numeric" maxLength={12} onChange={(e) => setReference(e.target.value.replace(/\D/g, "").slice(0, 12))} className={`mt-1 ${inputClass}`} /></label> : null}
        <label className="block text-xs font-semibold text-slate-700">Motivo (obligatorio)
          <textarea value={reason} maxLength={500} required minLength={10} onChange={(e) => setReason(e.target.value)} rows={2} className={`mt-1 ${inputClass}`} /></label>
        <label className="block text-xs font-semibold text-slate-700">Evidencia revisada{resolution === "APPROVED" ? " (obligatoria)" : ""}
          <textarea value={evidence} maxLength={500} required={resolution === "APPROVED"} onChange={(e) => setEvidence(e.target.value)} rows={2} placeholder="Comprobante TUU, reporte de ventas, n.º de caso…" className={`mt-1 ${inputClass}`} /></label>
        {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <button disabled={saving || !resolution} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Guardando..." : "Registrar regularización"}</button>
      </form> : null}

      <div className="mt-5 flex justify-end gap-2 print:hidden">
        <button type="button" onClick={() => window.print()} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold">Imprimir</button>
        <button type="button" onClick={onClose} className="rounded-full bg-[#041E42] px-4 py-2 text-sm font-semibold text-white">Cerrar</button>
      </div>
    </div>
  </div>;
}
