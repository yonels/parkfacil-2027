"use client";
// Fallos y reintentos (SOL-2026-10-29-007): fallos por categoría, listado y
// reenvío manual con confirmación (y aceptación explícita del riesgo de
// duplicado cuando el estado es desconocido). Cada reenvío queda auditado.
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, RotateCw, XCircle } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import EmptyState from "@/components/ui/EmptyState";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { ERROR_CATEGORIES } from "@/lib/sms/smsCenterCore.mjs";
import SmsFilters, { useSmsQuery } from "./SmsFilters";
import { formatDateTime, formatNumber, SimulatedBadge, SmsCenterTabs, SmsNotice, SmsStatusBadge } from "./smsUi";

const CATEGORY_ORDER = ["AUTH", "CONNECTIVITY", "INVALID_PHONE", "PROVIDER_REJECTED", "NO_BALANCE", "TEMPORARY", "UNCONFIRMED", "CONFIG", "VALIDATION", "UNKNOWN"];

function ResendDialog({ row, onClose, onDone }) {
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const unknown = row.status === "UNKNOWN";

  async function submit() {
    setBusy(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/centro-sms/fallos/${encodeURIComponent(row.source)}/${encodeURIComponent(row.sourceId)}/reenviar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, confirmed: true, acknowledgeDuplicateRisk: ack }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible reenviar el SMS.");
      onDone(body.data);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="Confirmar reenvío">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-[#041E42]">Confirmar reenvío</h2>
        <p className="mt-2 text-sm text-slate-600">Se enviará <strong>un nuevo SMS</strong> a {row.phone} con el mismo contenido. El registro original no se modifica y la acción queda en la auditoría.</p>
        {unknown ? (
          <label className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            El estado es desconocido: el SMS original pudo haber llegado. Acepto el riesgo de que el destinatario reciba un duplicado.
          </label>
        ) : null}
        {error ? <div className="mt-3"><SmsNotice tone="error">{error}</SmsNotice></div> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600">Cancelar</button>
          <button type="button" onClick={submit} disabled={busy || (unknown && !ack)} className="rounded-xl bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Reenviando…" : "Reenviar"}</button>
        </div>
      </div>
    </div>
  );
}

function FailuresContent() {
  const query = useSmsQuery();
  const queryString = query.toString();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(null);
  const [notice, setNotice] = useState("");
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/centro-sms/fallos${queryString ? `?${queryString}` : ""}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible obtener los fallos.");
      setData(body.data);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => { const t = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(t); }, [load]);

  async function processQueue() {
    if (!window.confirm("Se procesarán los reintentos vencidos y se consultará el estado de entrega de los mensajes del registro central. ¿Continuar?")) return;
    setProcessing(true); setNotice("");
    try {
      const response = await authenticatedFetch("/api/centro-sms/procesar", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible procesar la cola.");
      setNotice(`Procesados: ${body.data.processed} · estados consultados: ${body.data.checked} · proveedor ${body.data.provider}.`);
      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setProcessing(false);
    }
  }

  const s = data?.summary || {};
  const categories = s.by_category || {};
  return (
    <>
      <SmsFilters />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">Reintentos automáticos en espera: <strong>{formatNumber(s.retries_pending)}</strong>. Solo se reintentan solos los errores en que es seguro que el SMS no salió.</p>
        <button type="button" onClick={processQueue} disabled={processing} className="inline-flex items-center gap-2 rounded-xl border border-[#3150D8] px-4 py-2 text-sm font-semibold text-[#3150D8] hover:bg-[#EEF4FF] disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${processing ? "animate-spin" : ""}`} /> Procesar cola y estados
        </button>
      </div>
      {notice ? <div className="mb-4"><SmsNotice>{notice}</SmsNotice></div> : null}
      {error ? <div className="mb-4"><SmsNotice tone="error">{error}</SmsNotice></div> : null}
      {data ? (
        <div className={loading ? "opacity-60" : ""}>
          <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {CATEGORY_ORDER.map((key) => (
              <div key={key} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-medium text-slate-500">{ERROR_CATEGORIES[key]}</p>
                <p className="mt-2 text-2xl font-semibold text-[#041E42]">{formatNumber(categories[key])}</p>
              </div>
            ))}
          </section>
          <p className="mb-3 text-xs text-slate-500">«Sin confirmación» = aceptados por el proveedor hace más de {s.unconfirmed_after_hours} h sin confirmación de entrega. Para verlos, filtra el <Link className="text-[#3150D8] hover:underline" href="/centro-sms/historial?estado=ACCEPTED">historial por «Aceptado por proveedor»</Link>.</p>
          {!data.rows.length ? (
            <EmptyState title="Sin fallos en el período" description="No hay mensajes fallidos, rechazados, expirados o desconocidos con los filtros seleccionados." />
          ) : (
            <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[960px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-3">Fecha</th><th className="px-3 py-3">Teléfono</th><th className="px-3 py-3">Cliente / módulo</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Error</th><th className="px-3 py-3">Intentos</th><th className="px-3 py-3">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.key} className="border-b border-slate-100">
                      <td className="whitespace-nowrap px-3 py-2.5">{formatDateTime(row.createdAt)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">{row.phone}</td>
                      <td className="px-3 py-2.5"><p>{row.companyName}</p><p className="text-xs text-slate-500">{row.moduleLabel} · {row.messageTypeLabel}</p></td>
                      <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1"><SmsStatusBadge label={row.statusLabel} variant={row.statusVariant} />{row.isSimulated ? <SimulatedBadge /> : null}</div></td>
                      <td className="px-3 py-2.5 text-xs"><p className="text-rose-700">{row.errorCode || "—"}</p><p className="text-slate-500">{row.errorCategoryLabel || row.providerDescription || ""}</p></td>
                      <td className="px-3 py-2.5 text-center">{row.attempts}</td>
                      <td className="px-3 py-2.5">
                        {row.source === "ON_STREET_INSPECTOR_COPY" ? <span className="text-xs text-slate-500">Sin teléfono guardado</span> : (
                          <button type="button" onClick={() => setResending(row)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-[#3150D8] hover:border-[#3150D8]"><RotateCw className="h-3.5 w-3.5" />Reenviar</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-4 py-3 text-xs text-slate-500">{formatNumber(data.total)} mensaje(s); se muestran los {data.rows.length} más recientes de la página {data.page}.</p>
            </div>
          )}
        </div>
      ) : loading ? <p className="py-10 text-center text-sm text-slate-500">Cargando fallos…</p> : null}
      {resending ? (
        <ResendDialog row={resending} onClose={() => setResending(null)} onDone={(result) => {
          setResending(null);
          setNotice(result.reused ? "Ese reenvío ya se había solicitado; no se envió otro SMS." : `Reenvío registrado: estado ${result.status}${result.simulated ? " (simulado)" : ""}.`);
          void load();
        }} />
      ) : null}
      <p className="mt-4 flex items-center gap-1 text-xs text-slate-500"><XCircle className="h-3.5 w-3.5" />Los registros On Street originales nunca se modifican: un reenvío crea un mensaje nuevo en el registro central, enlazado al original.</p>
    </>
  );
}

export default function SmsFailures() {
  return (
    <AppShell title="Fallos y reintentos" description="Errores de envío por categoría, reintentos controlados y reenvíos manuales auditados.">
      <SmsCenterTabs />
      <Suspense fallback={<p className="py-10 text-center text-sm text-slate-500">Cargando…</p>}><FailuresContent /></Suspense>
    </AppShell>
  );
}
