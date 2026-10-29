"use client";
// Diagnóstico y pruebas de Sentraland (SOL-2026-10-29-007, instrucciones §10).
// - Al abrir la pantalla solo se LEE el estado: nunca se envía nada.
// - El diagnóstico en modo real pide un token y consulta la bolsa; no envía SMS.
// - El envío de prueba exige elegir un número autorizado, marcar la
//   confirmación y confirmar otra vez; un solo SMS por operación (requestId).
// - Un envío simulado se rotula como «SIMULADO»: nunca se presenta como real.
import { useCallback, useEffect, useState } from "react";
import { Activity, CheckCircle2, CircleAlert, CircleDashed, Send, Search } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { SMS_STATUS_LABELS } from "@/lib/sms/smsCenterCore.mjs";
import { SMS_TEST_TEXT } from "@/lib/sms/smsAdminCore.mjs";
import { formatDateTime, SmsCenterTabs, SmsNotice } from "./smsUi";

function Check({ label, value, okText = "Correcto", failText = "Con problemas", unknownText = "No evaluado" }) {
  const Icon = value === true ? CheckCircle2 : value === false ? CircleAlert : CircleDashed;
  const color = value === true ? "text-emerald-600" : value === false ? "text-rose-600" : "text-slate-400";
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
      <span className="text-slate-700">{label}</span>
      <span className={`inline-flex items-center gap-1 font-medium ${color}`}><Icon className="h-4 w-4" aria-hidden />{value === true ? okText : value === false ? failText : unknownText}</span>
    </li>
  );
}

async function postJson(url, payload) {
  const response = await authenticatedFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload || {}) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "La operación no se pudo completar.");
  return body.data;
}

export default function SmsDiagnostics() {
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState(null);
  const [phone, setPhone] = useState("");
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [sending, setSending] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  const load = useCallback(async () => {
    try {
      const response = await authenticatedFetch("/api/centro-sms/diagnostico", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible obtener el diagnóstico.");
      setState(body.data);
      setPhone((current) => current || body.data.testAllowedPhones?.[0]?.value || "");
    } catch (cause) {
      setError(cause.message);
    }
  }, []);

  useEffect(() => { const t = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(t); }, [load]);

  async function runDiagnostic() {
    setRunning(true); setError("");
    try { setLastRun(await postJson("/api/centro-sms/diagnostico")); await load(); }
    catch (cause) { setError(cause.message); }
    finally { setRunning(false); }
  }

  async function sendTest() {
    const real = state?.config?.mode === "REAL";
    const label = state?.testAllowedPhones?.find((p) => p.value === phone)?.label || "el número elegido";
    if (!window.confirm(real
      ? `Se enviará UN SMS REAL por Sentraland a ${label} (consume saldo de la bolsa). ¿Confirmas el envío?`
      : `El proveedor está en modo SIMULADO: no saldrá ningún SMS real hacia ${label}. ¿Registrar la prueba simulada?`)) return;
    setSending(true); setError("");
    try {
      const data = await postJson("/api/centro-sms/diagnostico/prueba", { phone, requestId, confirmed: true });
      setTestResult(data);
      setConfirmChecked(false);
      setRequestId(crypto.randomUUID());
      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSending(false);
    }
  }

  async function checkStatus(id) {
    setError("");
    try {
      const data = await postJson(`/api/centro-sms/diagnostico/prueba/${id}/estado`);
      setTestResult((current) => (current?.message?.id === id ? { ...current, status: data } : current));
      await load();
    } catch (cause) {
      setError(cause.message);
    }
  }

  const config = state?.config;
  const lastCheck = lastRun || state?.checks?.[0];
  const bags = lastCheck?.balance?.bags;
  return (
    <AppShell title="Diagnóstico y pruebas" description="Estado de la integración con Sentraland y envío de prueba controlado.">
      <SmsCenterTabs />
      {error ? <div className="mb-4"><SmsNotice tone="error">{error}</SmsNotice></div> : null}
      {!state && !error ? <p className="py-10 text-center text-sm text-slate-500">Cargando…</p> : null}
      {config ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-[#041E42]">Integración</h2>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${config.mode === "REAL" ? "bg-[#3150D8] text-white" : "bg-amber-100 text-amber-800"}`}>{config.mode === "REAL" ? "MODO REAL" : "MODO SIMULADO"}</span>
            </div>
            <ul className="space-y-2">
              <li className="flex justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"><span className="text-slate-700">Proveedor configurado</span><span className="font-medium">{config.provider}{config.providerDefaulted ? " (por defecto)" : ""}</span></li>
              {config.vars.map((v) => <Check key={v.name} label={v.name} value={v.present && v.clean} okText="Presente" failText={v.present ? "Formato sospechoso" : "Falta"} />)}
              {config.urls.map((u) => <li key={u.name} className="flex justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs"><span className="text-slate-600">{u.name}</span><span className="font-mono">{u.host}</span></li>)}
            </ul>
            <p className="mt-3 text-xs text-slate-500">Nunca se muestran los valores de las credenciales: solo si están presentes.</p>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-[#041E42]">Último diagnóstico</h2>
              <button type="button" onClick={runDiagnostic} disabled={running} className="inline-flex items-center gap-2 rounded-xl bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Activity className="h-4 w-4" />{running ? "Ejecutando…" : "Ejecutar diagnóstico"}</button>
            </div>
            {lastCheck ? (
              <>
                <ul className="space-y-2">
                  <Check label="Configuración" value={lastCheck.config_ok} okText="Completa" failText="Incompleta" />
                  <Check label="Autenticación (token)" value={lastCheck.auth_ok} unknownText={lastCheck.mode === "SIMULATED" ? "No aplica (simulado)" : "No evaluada"} />
                  <Check label="Conectividad con Sentraland" value={lastCheck.connectivity_ok} unknownText={lastCheck.mode === "SIMULATED" ? "No aplica (simulado)" : "No evaluada"} />
                  <li className="flex justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"><span className="text-slate-700">Saldo disponible (bolsa)</span><span className="font-medium">{Array.isArray(bags) ? `${bags.reduce((s, b) => s + (Number(b.saldo) || 0), 0).toLocaleString("es-CL")} SMS` : "No disponible"}</span></li>
                </ul>
                <p className="mt-3 text-xs text-slate-500">{formatDateTime(lastCheck.created_at)} · modo {lastCheck.mode} · {lastCheck.duration_ms ?? "—"} ms{lastCheck.error_code ? ` · ${lastCheck.error_code}` : ""}{lastCheck.provider_description ? ` · ${lastCheck.provider_description}` : ""}</p>
              </>
            ) : <p className="text-sm text-slate-500">Aún no se ha ejecutado ningún diagnóstico. El diagnóstico no envía SMS.</p>}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
            <h2 className="text-base font-semibold text-[#041E42]">Enviar SMS de prueba</h2>
            <p className="mt-1 text-sm text-slate-600">Un solo SMS por operación, únicamente a números autorizados en Configuración, con espera mínima de {state.cooldownSeconds} s entre pruebas. Queda registrado en el historial (módulo Diagnóstico) y en la auditoría.</p>
            {config.mode === "REAL" ? <div className="mt-3"><SmsNotice tone="warning" title="Modo real">El envío saldrá por Sentraland y consumirá saldo. Ejecútalo solo con autorización para esa prueba.</SmsNotice></div>
              : <div className="mt-3"><SmsNotice title="Modo simulado">No saldrá ningún SMS real; el resultado se registrará como SIMULADO.</SmsNotice></div>}
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="text-xs font-medium text-slate-500">Número autorizado
                <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={phone} onChange={(e) => setPhone(e.target.value)}>
                  {state.testAllowedPhones.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </label>
              <div className="text-xs font-medium text-slate-500 md:col-span-2">Texto (fijo)
                <p className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{SMS_TEST_TEXT}</p>
              </div>
            </div>
            <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} />
              Confirmo que estoy autorizado para ejecutar este envío de prueba{config.mode === "REAL" ? " real" : ""}.
            </label>
            <button type="button" onClick={sendTest} disabled={!confirmChecked || !phone || sending} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#3150D8] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />{sending ? "Enviando…" : "Enviar SMS de prueba"}</button>

            {testResult ? (
              <div className="mt-4 rounded-2xl border border-slate-200 p-4 text-sm">
                <p className="font-semibold text-[#041E42]">{testResult.simulated ? "Resultado SIMULADO (no salió por Sentraland)" : "Respuesta real de Sentraland"}{testResult.reused ? " · solicitud repetida, no se envió otro SMS" : ""}</p>
                <dl className="mt-2 grid gap-1 sm:grid-cols-2">
                  <div><dt className="inline text-slate-500">Estado: </dt><dd className="inline font-medium">{SMS_STATUS_LABELS[testResult.message.status] || testResult.message.status}</dd></div>
                  <div><dt className="inline text-slate-500">Destino: </dt><dd className="inline font-mono">{testResult.message.phone}</dd></div>
                  <div><dt className="inline text-slate-500">Código / descripción: </dt><dd className="inline">{[testResult.message.providerCode, testResult.message.providerDescription].filter(Boolean).join(" · ") || "—"}</dd></div>
                  <div><dt className="inline text-slate-500">ID de operación (idmensaje): </dt><dd className="inline font-mono">{testResult.message.providerMessageId || "—"}</dd></div>
                  {testResult.message.errorCode ? <div><dt className="inline text-slate-500">Error: </dt><dd className="inline text-rose-700">{testResult.message.errorCode}</dd></div> : null}
                </dl>
                {testResult.status ? <p className="mt-2 text-slate-700">Consulta de entrega: {testResult.status.note || `${SMS_STATUS_LABELS[testResult.status.status] || testResult.status.status}${testResult.status.provider_description ? ` · ${testResult.status.provider_description}` : ""}`}</p> : null}
                {!testResult.simulated && testResult.message.providerMessageId ? (
                  <button type="button" onClick={() => checkStatus(testResult.message.id)} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#3150D8] hover:underline"><Search className="h-4 w-4" />Consultar estado de entrega</button>
                ) : null}
              </div>
            ) : null}

            <h3 className="mb-2 mt-5 text-sm font-semibold text-[#041E42]">Últimas pruebas</h3>
            {state.tests.length ? (
              <ul className="space-y-1 text-sm">
                {state.tests.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                    <span>{formatDateTime(t.created_at)} · +56 9 ****{t.phone_last4} · {SMS_STATUS_LABELS[t.status] || t.status}{t.is_simulated ? " · SIMULADO" : ""}</span>
                    <span className="font-mono text-xs text-slate-500">{t.provider_message_id || "—"}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">Sin pruebas registradas.</p>}
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
