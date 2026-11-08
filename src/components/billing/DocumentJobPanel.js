"use client";
import { useCallback, useEffect, useState } from "react";

// Procesamiento documental: intentos de emisión pendientes o fallidos. SOL-2026-11-05-005 (2026-11-08): un documento
// rechazado por el proveedor no se reintenta (volvería a fallar con los mismos datos): se descarta y la prefactura vuelve
// a revisión para corregir y emitir de nuevo.
const labels = { PENDING: "Pendiente de emisión", PROCESSING: "Procesando", RETRY: "Pendiente de reintento", FAILED: "Error de emisión", COMPLETED: "Emitido", CANCELLED: "Descartado" };
const typeLabels = { INVOICE: "Factura", CREDIT_NOTE: "Nota de crédito", DEBIT_NOTE: "Nota de débito", RECEIPT: "Boleta" };

async function fetchJobs() {
  const response = await fetch("/api/billing/document-jobs", { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error);
  return payload.data || [];
}

const documentOf = (job) => (Array.isArray(job.billing_documents) ? job.billing_documents[0] : job.billing_documents) || {};
const rejected = (job) => documentOf(job).status === "PROVIDER_REJECTED";
const discardable = (job) => {
  const document = documentOf(job);
  return job.status === "FAILED" && ["PROVIDER_REJECTED", "ISSUE_ERROR"].includes(document.status) && !document.folio && !document.provider_document_id;
};

export default function DocumentJobPanel({ onChanged }) {
  const [jobs, setJobs] = useState([]);
  const [message, setMessage] = useState("");
  const [discarding, setDiscarding] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { setJobs(await fetchJobs()); }, []);
  useEffect(() => {
    let active = true;
    fetchJobs().then((data) => { if (active) setJobs(data); }).catch((error) => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, []);

  const retry = async (job) => {
    setMessage(""); setBusy(true);
    try {
      const response = await fetch(`/api/billing/documents/${job.document_id}/retry`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ providerScenario: "success" }) });
      const payload = await response.json();
      if (!response.ok) { setMessage(payload.error); return; }
      setMessage("Reintento procesado."); await load(); onChanged?.();
    } finally { setBusy(false); }
  };

  const discard = async (job) => {
    setMessage(""); setBusy(true);
    try {
      const response = await fetch(`/api/billing/documents/${job.document_id}/discard`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }) });
      const payload = await response.json();
      if (!response.ok) { setMessage(payload.error); return; }
      setDiscarding(null); setReason("");
      setMessage(payload.data?.preinvoiceStatus ? "Documento descartado. La prefactura volvió a «En revisión»: corrija los datos (por ejemplo, el RUT en la ficha de la empresa) y vuelva a emitir." : "Documento descartado.");
      await load(); onChanged?.();
    } finally { setBusy(false); }
  };

  const visible = jobs.filter((job) => !["COMPLETED", "CANCELLED"].includes(job.status));
  if (!visible.length && !message) return null;
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <h3 className="font-bold text-amber-950">Procesamiento documental</h3>
      {message ? <p className="mt-2 text-sm text-amber-900">{message}</p> : null}
      <div className="mt-2 space-y-2">
        {visible.map((job) => {
          const document = documentOf(job);
          return (
            <div key={job.id} className="rounded-xl bg-white p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <strong>{rejected(job) ? "Rechazado por el proveedor" : labels[job.status] || job.status}</strong>
                  <span className="ml-2 text-slate-500">{typeLabels[document.document_type] || "Documento"}{document.customer_snapshot?.businessName ? ` · ${document.customer_snapshot.businessName}` : ""} · Intento {job.attempts}/{job.max_attempts}</span>
                  {job.error_message ? <p className="mt-1 text-red-700">{job.error_message}</p> : null}
                  {rejected(job) ? <p className="mt-1 text-slate-600">No se puede reintentar con los mismos datos: descártelo, corrija los datos y vuelva a emitir.</p> : null}
                </div>
                <div className="flex gap-2">
                  {["FAILED", "RETRY"].includes(job.status) && job.attempts < job.max_attempts && !rejected(job) ? <button type="button" disabled={busy} onClick={() => retry(job)} className="rounded-lg bg-[#3150D8] px-3 py-2 font-semibold text-white disabled:opacity-50">Reintentar emisión</button> : null}
                  {discardable(job) ? <button type="button" disabled={busy} onClick={() => { setDiscarding(job.id); setReason(""); }} className="rounded-lg border border-red-300 px-3 py-2 font-semibold text-red-700 disabled:opacity-50">Descartar documento</button> : null}
                </div>
              </div>
              {discarding === job.id ? (
                <div className="mt-3 rounded-lg bg-red-50 p-3">
                  <label className="block font-semibold text-slate-700">Motivo del descarte
                    <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder="Ej.: RUT del cliente con dígito verificador incorrecto" className="mt-1 w-full rounded-lg border border-slate-300 p-2 font-normal" />
                  </label>
                  <p className="mt-1 text-xs text-slate-600">El documento no llegó al SII (no tiene folio). Queda en el historial como descartado y la prefactura vuelve a «En revisión».</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" disabled={busy || reason.trim().length < 5} onClick={() => discard(job)} className="rounded-lg bg-red-600 px-3 py-2 font-semibold text-white disabled:opacity-50">Confirmar descarte</button>
                    <button type="button" disabled={busy} onClick={() => setDiscarding(null)} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold">Cancelar</button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
