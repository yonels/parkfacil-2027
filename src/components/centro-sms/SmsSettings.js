"use client";
// Configuración y permisos del Centro de Control SMS (SOL-2026-10-29-007):
// límites de frecuencia, reintentos, números autorizados para pruebas,
// retención y matriz de permisos. Cada cambio queda auditado.
import { useEffect, useState } from "react";
import { Save, ShieldCheck, Trash2 } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { formatDateTime, SmsCenterTabs, SmsNotice } from "./smsUi";

const FIELD = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#3150D8] focus:outline-none";
const NUMBER_FIELDS = [
  ["rateLimitUserPerHour", "Máximo de SMS por usuario y hora"],
  ["rateLimitCompanyPerHour", "Máximo de SMS por cliente y hora"],
  ["rateLimitPhonePerHour", "Máximo de SMS por teléfono y hora"],
  ["autoRetryMax", "Intentos automáticos máximos (0 a 5)"],
  ["testSendCooldownSeconds", "Espera mínima entre pruebas (segundos)"],
  ["unconfirmedAfterHours", "Horas para considerar «sin confirmación»"],
  ["retentionDays", "Retención de teléfono y texto (días)"],
];

export default function SmsSettings() {
  const [form, setForm] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    authenticatedFetch("/api/centro-sms/configuracion", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No fue posible obtener la configuración.");
        if (!active) return;
        const s = body.data.settings;
        setForm({ ...s, testAllowedPhones: s.testAllowedPhones.join("\n"), autoRetryDelaysSeconds: s.autoRetryDelaysSeconds.join(", ") });
        setPermissions(body.data.permissions);
      })
      .catch((cause) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, []);

  async function save(event) {
    event.preventDefault();
    setBusy(true); setError(""); setFieldErrors({}); setNotice("");
    try {
      const response = await authenticatedFetch("/api/centro-sms/configuracion", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setFieldErrors(body.details || {}); throw new Error(body.error || "No fue posible guardar la configuración."); }
      const s = body.data;
      setForm({ ...s, testAllowedPhones: s.testAllowedPhones.join("\n"), autoRetryDelaysSeconds: s.autoRetryDelaysSeconds.join(", ") });
      setNotice("Configuración guardada y registrada en la auditoría.");
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function retention() {
    if (!window.confirm(`Se anonimizarán el teléfono y el texto de los SMS con más de ${form.retentionDays} días. Los conteos y estados se conservan. Esta acción no se puede deshacer. ¿Continuar?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await authenticatedFetch("/api/centro-sms/configuracion/retencion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmed: true }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible aplicar la retención.");
      setNotice(`Retención aplicada: ${body.data.messages_redacted} mensaje(s) anonimizado(s).`);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  return (
    <AppShell title="Configuración y permisos" description="Límites, reintentos, números de prueba, retención y permisos del módulo.">
      <SmsCenterTabs />
      {error ? <div className="mb-4"><SmsNotice tone="error">{error}</SmsNotice></div> : null}
      {notice ? <div className="mb-4"><SmsNotice>{notice}</SmsNotice></div> : null}
      {!form && !error ? <p className="py-10 text-center text-sm text-slate-500">Cargando…</p> : null}
      {form ? (
        <div className="grid gap-5 xl:grid-cols-3">
          <form onSubmit={save} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
            <h2 className="mb-4 text-base font-semibold text-[#041E42]">Parámetros</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {NUMBER_FIELDS.map(([key, label]) => (
                <label key={key} className="text-xs font-medium text-slate-500">{label}
                  <input type="number" className={`${FIELD} mt-1`} value={form[key] ?? ""} onChange={set(key)} />
                  {fieldErrors[key] ? <span className="mt-1 block text-rose-700">{fieldErrors[key]}</span> : null}
                </label>
              ))}
              <label className="text-xs font-medium text-slate-500">Esperas entre reintentos (segundos, progresivas)
                <input className={`${FIELD} mt-1`} value={form.autoRetryDelaysSeconds} onChange={set("autoRetryDelaysSeconds")} placeholder="60, 300, 900" />
                {fieldErrors.autoRetryDelaysSeconds ? <span className="mt-1 block text-rose-700">{fieldErrors.autoRetryDelaysSeconds}</span> : null}
              </label>
              <label className="text-xs font-medium text-slate-500 sm:col-span-2">Números autorizados para el envío de prueba (uno por línea)
                <textarea rows={3} className={`${FIELD} mt-1 font-mono`} value={form.testAllowedPhones} onChange={set("testAllowedPhones")} />
                {fieldErrors.testAllowedPhones ? <span className="mt-1 block text-rose-700">{fieldErrors.testAllowedPhones}</span> : null}
              </label>
            </div>
            <p className="mt-3 text-xs text-slate-500">Recepción de SMS: {form.inboundEnabled ? "habilitada" : "no habilitada por el proveedor"} (no editable hasta que exista integración). Última modificación: {formatDateTime(form.updatedAt)}.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />Guardar</button>
              <button type="button" onClick={retention} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50"><Trash2 className="h-4 w-4" />Aplicar retención ahora</button>
            </div>
          </form>
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-[#041E42]"><ShieldCheck className="h-4 w-4 text-[#3150D8]" />Permisos</h2>
            <p className="mb-3 text-xs text-slate-500">En esta versión el módulo es exclusivo de Root (administrador de plataforma), que tiene todos los permisos. Los administradores de empresa, operadores e inspectores no acceden.</p>
            <ul className="space-y-2 text-sm">
              {permissions.map((p) => (
                <li key={p.permission} className="rounded-xl bg-slate-50 px-3 py-2"><p className="font-mono text-xs text-[#3150D8]">{p.permission}</p><p className="text-slate-700">{p.label}</p></li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
