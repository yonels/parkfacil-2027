"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, LoaderCircle, Save } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { DTE_ENVIRONMENT_LABELS, DTE_STATUS_LABELS } from "@/lib/boletaElectronica/dteSettingsConstants.mjs";

// Tarifas → Módulos adicionales → Boleta electrónica (SOL-2026-10-20-001).
// Decisión del usuario: la API Key de Haulmer la ingresa el administrador de la
// empresa; Root solo ve el estado. La API Key se envía una vez, se guarda
// cifrada y después solo se muestra enmascarada. La emisión de boletas aún no
// existe (falta la documentación de Haulmer).

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#3150D8]";
const dateTime = (value) => value ? new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(value)) : "—";
const STATUS_TONES = { NOT_CONFIGURED: "bg-slate-100 text-slate-700", CONFIGURED_INACTIVE: "bg-amber-50 text-amber-800", CONFIGURED: "bg-emerald-50 text-emerald-700" };

async function readJson(response) {
  return response.json().catch(() => ({}));
}

function StatusPill({ status }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_TONES[status] || STATUS_TONES.NOT_CONFIGURED}`}>{DTE_STATUS_LABELS[status] || status}</span>;
}

function RootStatus({ companies }) {
  return <section className="overflow-hidden rounded-3xl border bg-white shadow-sm">
    <div className="border-b px-5 py-4">
      <h2 className="text-lg font-bold text-[#041E42]">Estado por empresa cliente con Off Street</h2>
      <p className="text-sm text-slate-600">La API Key la ingresa el administrador de cada empresa. Root solo ve el estado; la clave nunca se muestra.</p>
    </div>
    <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr><th className="px-3 py-2">Empresa</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Proveedor</th><th className="px-3 py-2">Ambiente</th><th className="px-3 py-2">Estacionamientos activos</th><th className="px-3 py-2">Actualizado</th></tr></thead>
      <tbody>{companies.map((company) => <tr key={company.companyId} className="border-t border-slate-100"><td className="px-3 py-2 font-semibold">{company.companyName}</td><td className="px-3 py-2"><StatusPill status={company.status}/></td><td className="px-3 py-2">{company.provider === "HAULMER" ? "Haulmer" : "—"}</td><td className="px-3 py-2">{DTE_ENVIRONMENT_LABELS[company.environment] || "—"}</td><td className="px-3 py-2">{company.enabledParkings}</td><td className="px-3 py-2">{dateTime(company.updatedAt)}</td></tr>)}
        {!companies.length ? <tr><td colSpan="6" className="px-3 py-6 text-center text-slate-500">No hay empresas cliente con Off Street.</td></tr> : null}</tbody></table></div>
  </section>;
}

function CompanySettings({ settings, onSaved }) {
  const [environment, setEnvironment] = useState(settings.environment);
  const [apiKey, setApiKey] = useState("");
  const [replacing, setReplacing] = useState(!settings.hasApiKey);
  const [removeApiKey, setRemoveApiKey] = useState(false);
  const [parkingIds, setParkingIds] = useState(settings.parkings.filter((parking) => parking.enabled).map((parking) => parking.id));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const toggleParking = (id) => setParkingIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  async function save(event) {
    event.preventDefault();
    setBusy(true); setMessage(null);
    try {
      const response = await authenticatedFetch("/api/boleta-electronica", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environment, apiKey: replacing ? apiKey : "", removeApiKey, parkingIds: removeApiKey ? [] : parkingIds }),
      });
      const body = await readJson(response);
      if (!response.ok) { setMessage({ type: "error", text: body.error || "No fue posible guardar." }); return; }
      setApiKey(""); setRemoveApiKey(false);
      setMessage({ type: "success", text: "Configuración guardada." });
      onSaved(body.data.settings);
    } catch {
      setMessage({ type: "error", text: "No fue posible conectar con el servidor." });
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={save} className="space-y-5 rounded-3xl border bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-bold text-[#041E42]">Haulmer</h2>
      <StatusPill status={settings.status}/>
    </div>
    <p className="rounded-2xl bg-blue-50 p-3 text-sm text-[#041E42]">Por ahora solo se guarda la configuración. La emisión de boletas con timbre electrónico se habilitará cuando esté lista la integración con Haulmer; mientras tanto el POS sigue imprimiendo el comprobante de ParkFacil.</p>
    {!settings.encryptionReady ? <p className="rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">Este ambiente aún no tiene configurada la clave de cifrado: no se puede guardar la API Key.</p> : null}
    {message ? <p className={`rounded-2xl p-3 text-sm font-semibold ${message.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{message.text}</p> : null}

    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-600">API Key de Haulmer</p>
      {settings.hasApiKey && !replacing ? <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm"><KeyRound className="h-4 w-4 text-[#3150D8]"/>{settings.apiKeyMasked}</span>
        <button type="button" onClick={() => { setReplacing(true); setRemoveApiKey(false); }} className="rounded-full border border-[#BFD2FF] px-3 py-1 text-xs font-semibold text-[#3150D8]">Reemplazar</button>
        <label className="flex items-center gap-2 text-xs font-semibold text-red-700"><input type="checkbox" checked={removeApiKey} onChange={(event) => setRemoveApiKey(event.target.checked)}/>Quitar API Key (desactiva todos los estacionamientos)</label>
      </div> : <div className="flex flex-wrap items-center gap-2">
        <input type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Pega aquí la API Key entregada por Haulmer" className={`${inputClass} max-w-xl font-mono`}/>
        {settings.hasApiKey ? <button type="button" onClick={() => { setReplacing(false); setApiKey(""); }} className="rounded-full border px-3 py-1 text-xs font-semibold text-slate-600">Cancelar</button> : null}
      </div>}
      <p className="text-xs text-slate-500">Se guarda cifrada. Después solo se muestran sus últimos 4 caracteres.</p>
    </div>

    <label className="block max-w-xs text-xs font-semibold text-slate-600"><span className="mb-1 block">Ambiente</span>
      <select value={environment} onChange={(event) => setEnvironment(event.target.value)} className={inputClass}>
        <option value="TEST">{DTE_ENVIRONMENT_LABELS.TEST}</option>
        <option value="PRODUCTION">{DTE_ENVIRONMENT_LABELS.PRODUCTION}</option>
      </select>
    </label>

    <div>
      <p className="mb-2 text-xs font-semibold text-slate-600">Estacionamientos donde se emitirá la boleta</p>
      {settings.parkings.length ? <div className="grid gap-2 sm:grid-cols-2">{settings.parkings.map((parking) => <label key={parking.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
        <input type="checkbox" disabled={removeApiKey} checked={!removeApiKey && parkingIds.includes(parking.id)} onChange={() => toggleParking(parking.id)}/>
        <span className="font-semibold text-[#041E42]">{parking.name}</span>{parking.code ? <span className="text-xs text-slate-500">{parking.code}</span> : null}
      </label>)}</div> : <p className="text-sm text-slate-500">Tu empresa no tiene estacionamientos Off Street.</p>}
    </div>

    <div className="flex flex-wrap items-center gap-3">
      <button type="submit" disabled={busy || !settings.encryptionReady && replacing && apiKey.trim().length > 0} className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <Save className="h-4 w-4"/>}Guardar</button>
      {settings.updatedAt ? <p className="text-xs text-slate-500">Última actualización: {dateTime(settings.updatedAt)}{settings.updatedByEmail ? ` · ${settings.updatedByEmail}` : ""}</p> : null}
    </div>
  </form>;
}

export default function BoletaElectronicaPage() {
  const [state, setState] = useState({ loading: true, error: "", data: null });

  const load = useCallback(async () => {
    try {
      const response = await authenticatedFetch("/api/boleta-electronica", { cache: "no-store" });
      const body = await readJson(response);
      if (!response.ok) { setState({ loading: false, error: body.error || "No fue posible cargar la boleta electrónica.", data: null }); return; }
      setState({ loading: false, error: "", data: body.data });
    } catch {
      setState({ loading: false, error: "No fue posible conectar con el servidor.", data: null });
    }
  }, []);

  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  const isRoot = state.data?.mode === "ROOT";
  return <AppShell title="Boleta electrónica" description="Módulo adicional · Haulmer">
    <div className="space-y-6">
      <PageHeader title="Boleta electrónica" description={isRoot ? "Estado de la configuración de boleta electrónica (Haulmer) por empresa." : "Configura la API Key de Haulmer para emitir boletas con timbre electrónico en los pagos."} />
      {state.loading ? <p className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin"/>Cargando…</p> : null}
      {state.error ? <p className="rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">{state.error}</p> : null}
      {isRoot ? <RootStatus companies={state.data.companies || []}/> : null}
      {state.data?.mode === "COMPANY" ? <CompanySettings key={state.data.settings.updatedAt || "new"} settings={state.data.settings} onSaved={(settings) => setState((current) => ({ ...current, data: { mode: "COMPANY", settings } }))}/> : null}
    </div>
  </AppShell>;
}

