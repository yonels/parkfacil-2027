"use client";
import { useEffect, useState } from "react";
import { RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import {
  maskInspectorPhone,
  inspectorSmsSendUiState,
  inspectorSmsDeliveryUiState,
  INSPECTOR_SMS_REPORT_PERIODS,
} from "@/lib/inspector/inspectorSmsReportCore.mjs";
import { inspectorCopySmsShortStatus } from "@/lib/inspector/inspectorSmsStatusMessage.mjs";

const PERIOD_LABEL = { today: "Hoy", "7d": "7 días", "30d": "30 días" };
const SEND_STATES = ["ENVIADO AL PROVEEDOR", "ERROR", "PENDIENTE", "NO REQUERIDO"];
const DELIVERY_STATES = ["ENTREGADO", "NO ENTREGADO", "EXPIRADO", "RECHAZADO", "PENDIENTE", "DESCONOCIDO", "NO APLICA"];
const TONE_CLASSES = { success: "text-emerald-700", error: "text-rose-700", neutral: "text-slate-500" };

function Chip({ label, tone }) {
  return <span className={`text-xs font-black ${TONE_CLASSES[tone] || TONE_CLASSES.neutral}`}>{label}</span>;
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" }); } catch { return iso; }
}

async function fetchReport(apiBase, portalHeaders, params) {
  const qs = new URLSearchParams(params);
  const response = await fetch(`${apiBase}?${qs.toString()}`, { headers: portalHeaders, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, payload };
}

// Reporte SMS Inspector (2026-09-03; alcance RBAC agregado el mismo día):
// pantalla de SOLO LECTURA salvo por la acción explícita "Actualizar
// estado"/"Actualizar pendientes" (TAREA 8), que consulta DLR -- nunca
// envía SMS, nunca registra otra fiscalización, nunca cambia sms_status.
// Teléfono SIEMPRE enmascarado en esta vista (TAREA 5) -- el backend ya lo
// entrega completo (RBAC decide filas, no campos), el enmascarado es una
// decisión de presentación de este componente.
//
// Props reutilizables (para una futura pantalla admin bajo /on-street-qr,
// NO construida todavía -- ver informe): apiBase/portalHeaders apuntan por
// defecto al portal Inspector (siempre alcance "own", ver
// /api/inspector/sms-report/route.js); canFilterByInspector controla el
// filtro "Inspector" -- oculto aquí a propósito (un Inspector solo ve sus
// propias filas, filtrar por sí mismo no aporta nada), pero listo para
// activarse cuando exista esa pantalla admin (donde SÍ puede haber más de
// un inspector visible).
export default function InspectorSmsReport({
  apiBase = "/api/inspector/sms-report",
  portalHeaders = { "x-parkfacil-portal": "inspector" },
  canFilterByInspector = false,
}) {
  const [period, setPeriod] = useState("7d");
  const [plate, setPlate] = useState("");
  const [phone, setPhone] = useState("");
  const [inspector, setInspector] = useState("");
  const [sendStatus, setSendStatus] = useState("");
  const [deliveryStatus, setDeliveryStatus] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [updatingPending, setUpdatingPending] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const params = { period, plate, phone, sendStatus, deliveryStatus };
    if (canFilterByInspector) params.inspector = inspector;
    const { ok, payload } = await fetchReport(apiBase, portalHeaders, params);
    if (!ok) { setError(payload?.error || "No fue posible cargar el reporte SMS."); setRows([]); }
    else setRows(payload?.data || []);
    setLoading(false);
  }

  useEffect(() => {
    // Mismo patrón que InspectorApp.js/InspectorFiscalizacion.js: un
    // setTimeout(...,0) evita un setState síncrono dentro del cuerpo del
    // efecto (regla react-hooks/set-state-in-effect).
    const timer = window.setTimeout(() => { load(); }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  function applyFilters(event) {
    event?.preventDefault?.();
    load();
  }

  async function updateOne(id) {
    setUpdatingId(id);
    setActionMessage("");
    const response = await fetch(`${apiBase}/${encodeURIComponent(id)}/dlr`, { method: "POST", headers: portalHeaders });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setActionMessage(payload?.error || "No fue posible actualizar el estado.");
    } else {
      setRows((current) => current.map((r) => (r.id === id ? {
        ...r,
        smsDeliveryStatus: payload.data?.sms_delivery_status ?? r.smsDeliveryStatus,
        smsDeliveryCheckedAt: payload.data?.sms_delivery_checked_at ?? r.smsDeliveryCheckedAt,
        smsDeliveryDescription: payload.data?.sms_delivery_description ?? r.smsDeliveryDescription,
      } : r)));
    }
    setUpdatingId(null);
  }

  async function updatePending() {
    setUpdatingPending(true);
    setActionMessage("");
    const response = await fetch(`${apiBase}/dlr-pending`, { method: "POST", headers: portalHeaders });
    const payload = await response.json().catch(() => ({}));
    setActionMessage(response.ok ? `Se actualizaron ${payload.data?.checked ?? 0} mensaje(s) pendiente(s).` : (payload?.error || "No fue posible actualizar los pendientes."));
    setUpdatingPending(false);
    if (response.ok) load();
  }

  return (
    <div className="mx-auto w-full max-w-2xl p-4 pb-8">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-black text-[#041E42]">Reporte SMS</h1>
        <button type="button" onClick={updatePending} disabled={updatingPending} className="flex items-center gap-1.5 rounded-full bg-[#3150D8] px-3 py-2 text-xs font-black text-white disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${updatingPending ? "animate-spin" : ""}`} aria-hidden="true" />
          ACTUALIZAR PENDIENTES
        </button>
      </div>

      <div role="tablist" aria-label="Período" className="mt-4 flex gap-2">
        {INSPECTOR_SMS_REPORT_PERIODS.map((p) => (
          <button key={p} role="tab" aria-selected={period === p} onClick={() => setPeriod(p)} className={`min-h-11 rounded-full px-4 text-sm font-bold ${period === p ? "bg-[#3150D8] text-white" : "bg-white text-slate-600"}`}>
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>

      <form onSubmit={applyFilters} className="mt-4 space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-3">
          <input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="Patente" className="min-h-11 rounded-xl border-2 px-3 text-sm uppercase" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Teléfono (últimos dígitos)" className="min-h-11 rounded-xl border-2 px-3 text-sm" />
        </div>
        {canFilterByInspector ? (
          <input value={inspector} onChange={(e) => setInspector(e.target.value)} placeholder="Inspector (email)" className="min-h-11 w-full rounded-xl border-2 px-3 text-sm" />
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <select value={sendStatus} onChange={(e) => setSendStatus(e.target.value)} className="min-h-11 rounded-xl border-2 px-2 text-sm">
            <option value="">Estado envío: todos</option>
            {SEND_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={deliveryStatus} onChange={(e) => setDeliveryStatus(e.target.value)} className="min-h-11 rounded-xl border-2 px-2 text-sm">
            <option value="">Estado DLR: todos</option>
            {DELIVERY_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button type="submit" className="min-h-11 w-full rounded-xl bg-slate-800 text-sm font-black text-white">FILTRAR</button>
      </form>

      {actionMessage ? <p className="mt-3 rounded-xl bg-slate-100 p-3 text-sm font-semibold text-slate-700">{actionMessage}</p> : null}
      {error ? <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p> : null}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-sm">Sin resultados para estos filtros.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((row) => {
            const send = inspectorSmsSendUiState(row);
            const delivery = inspectorSmsDeliveryUiState(row);
            const expanded = expandedId === row.id;
            const canUpdate = row.smsStatus === "SENT" && Boolean(row.smsProviderMessageId);
            return (
              <li key={row.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <button type="button" onClick={() => setExpandedId(expanded ? null : row.id)} className="flex w-full items-center justify-between gap-2 text-left">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-black tracking-wide text-[#041E42]">{row.plate} · {maskInspectorPhone(row.phone)}</p>
                    <p className="truncate text-xs text-slate-500">{fmtDateTime(row.inspectedAt)} · {row.inspectorEmail}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Chip label={send.label} tone={send.tone} />
                    <div><Chip label={delivery.label} tone={delivery.tone} /></div>
                  </div>
                  {expanded ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
                </button>

                {expanded ? (
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-sm">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
                      <span>Fiscalización</span><span className="text-right font-mono">{row.id}</span>
                      <span>Sesión</span><span className="text-right font-mono">{row.sessionId || "—"}</span>
                      <span>Motivo</span><span className="text-right">{row.motivo || "—"}</span>
                      <span>ID proveedor</span><span className="text-right font-mono">{row.smsProviderMessageId || "—"}</span>
                      <span>Enviado</span><span className="text-right">{fmtDateTime(row.smsSentAt)}</span>
                      <span>DLR consultado</span><span className="text-right">{fmtDateTime(row.smsDeliveryCheckedAt)}</span>
                      {row.smsDeliveryDescription ? (<><span>Descripción proveedor</span><span className="text-right">{row.smsDeliveryDescription}</span></>) : null}
                    </div>

                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-500">Copia inspector</p>
                      <div className="mt-1 flex items-center justify-between text-xs">
                        <span>Estado</span>
                        <Chip {...inspectorCopySmsShortStatus(row)} />
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                        <span>Enviada</span><span>{fmtDateTime(row.inspectorCopySmsSentAt)}</span>
                      </div>
                      {row.inspectorCopySmsProviderMessageId ? (
                        <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                          <span>ID proveedor</span><span className="font-mono">{row.inspectorCopySmsProviderMessageId}</span>
                        </div>
                      ) : null}
                    </div>

                    {canUpdate ? (
                      <button
                        type="button"
                        onClick={() => updateOne(row.id)}
                        disabled={updatingId === row.id}
                        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#3150D8] text-sm font-black text-white disabled:opacity-50"
                      >
                        <RefreshCw className={`h-4 w-4 ${updatingId === row.id ? "animate-spin" : ""}`} aria-hidden="true" />
                        ACTUALIZAR ESTADO
                      </button>
                    ) : (
                      <p className="text-xs text-slate-400">Sin ID de proveedor -- no hay nada que consultar todavía.</p>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

