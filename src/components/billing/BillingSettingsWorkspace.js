"use client";

import { useEffect, useState } from "react";

// Configuración de facturación de ParkFacil (SOL-2026-11-05-005, F1.4): datos del emisor, vencimiento y
// proveedor de emisión. Va arriba del catálogo de servicios y productos en Facturación → Configuración.
const FIELDS = [
  ["issuerBusinessName", "Razón social", "ParkFacil SpA"],
  ["issuerRut", "RUT", "77.991.619-7"],
  ["issuerActivity", "Giro", "Otras actividades de tecnología…"],
  ["issuerActivityCode", "Código de actividad (opcional)", "620900"],
  ["issuerAddress", "Dirección", "Calle y número"],
  ["issuerDistrict", "Comuna", "Las Condes"],
  ["issuerCity", "Ciudad", "Santiago"],
  ["issuerSiiOffice", "Oficina del SII", "Santiago Oriente"],
  ["issuerEmail", "Correo de facturación", "facturacion@parkfacil.cl"],
  ["issuerPhone", "Teléfono (opcional)", "+56 9 …"],
];

function Field({ label, error, children }) {
  return (
    <label className="block text-sm">
      <span className="font-semibold text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  );
}

export default function BillingSettingsWorkspace() {
  const [form, setForm] = useState(null);
  const [providers, setProviders] = useState({});
  const [environments, setEnvironments] = useState({});
  const [keys, setKeys] = useState({});
  const [message, setMessage] = useState("");
  const [fieldError, setFieldError] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/billing/settings", { cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, payload: await response.json() }))
      .then(({ ok, payload }) => {
        if (!active) return;
        if (!ok) { setMessage(payload.error || "No fue posible cargar la configuración."); return; }
        setForm(payload.data); setProviders(payload.providers || {}); setEnvironments(payload.environments || {}); setKeys(payload.keys || {});
      })
      .catch(() => { if (active) setMessage("No fue posible cargar la configuración."); });
    return () => { active = false; };
  }, []);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const missing = form ? [["issuerAddress", "dirección"], ["issuerDistrict", "comuna"], ["issuerEmail", "correo"]].filter(([key]) => !String(form[key] || "").trim()).map(([, label]) => label) : [];

  async function save() {
    if (!form) return;
    setSaving(true); setMessage(""); setFieldError({});
    try {
      const response = await fetch("/api/billing/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const payload = await response.json();
      if (!response.ok) { if (payload.field) setFieldError({ [payload.field]: payload.error }); else setMessage(payload.error || "No fue posible guardar."); return; }
      setForm(payload.data); setMessage("Configuración guardada.");
    } finally {
      setSaving(false);
    }
  }

  if (!form) return message ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{message}</p> : <p className="text-sm text-slate-500">Cargando configuración…</p>;

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h3 className="text-lg font-semibold text-[#041E42]">Datos del emisor</h3>
        <p className="mt-1 text-sm text-slate-600">Aparecen en cada factura, nota de crédito y nota de débito que emite ParkFacil. Valores iniciales tomados de la factura N° 278 de EasyDoc.</p>
        {missing.length ? <p className="mt-2 text-sm font-semibold text-amber-700">Falta completar: {missing.join(", ")}. Sin dirección y comuna no se puede emitir.</p> : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {FIELDS.map(([key, label, placeholder]) => (
          <Field key={key} label={label} error={fieldError[key]}>
            <input value={form[key] || ""} onChange={set(key)} placeholder={placeholder} className="w-full rounded-lg border border-slate-300 p-2" />
          </Field>
        ))}
      </div>

      <div className="grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-3">
        <Field label="Días de pago por defecto" error={fieldError.defaultPaymentDueDays}>
          <input type="number" min="0" max="120" value={form.defaultPaymentDueDays} onChange={set("defaultPaymentDueDays")} className="w-full rounded-lg border border-slate-300 p-2" />
          <span className="mt-1 block text-xs text-slate-500">Vencimiento = fecha de emisión + días de pago del contrato (o estos, si el contrato no los define).</span>
        </Field>
        <Field label="Proveedor de emisión" error={fieldError.invoiceProvider}>
          <select value={form.invoiceProvider} onChange={set("invoiceProvider")} className="w-full rounded-lg border border-slate-300 p-2">
            {Object.entries(providers).map(([key, provider]) => <option key={key} value={key} disabled={!provider.available}>{provider.label}{provider.available ? "" : " — próximamente"}</option>)}
          </select>
          <span className="mt-1 block text-xs text-slate-500">{form.invoiceProvider === "HAULMER" ? (providers.HAULMER?.note || "") : "Simulado: ningún documento se envía al SII."}</span>
          <span className="mt-1 block text-xs text-slate-500">API Key de Haulmer en el servidor: pruebas {keys.TEST ? "configurada" : "no configurada"} · producción {keys.PRODUCTION ? "configurada" : "no configurada (se contrata OpenFactura al terminar las pruebas, D9)"}.</span>
        </Field>
        <Field label="Ambiente" error={fieldError.providerEnvironment}>
          <select value={form.providerEnvironment} onChange={set("providerEnvironment")} className="w-full rounded-lg border border-slate-300 p-2">
            {Object.entries(environments).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </Field>
      </div>

      {message ? <p role="status" className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">{message}</p> : null}
      <button type="button" disabled={saving} onClick={save} className="rounded-lg bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Guardar configuración</button>
    </section>
  );
}
