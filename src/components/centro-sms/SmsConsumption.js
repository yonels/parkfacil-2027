"use client";
// Consumo y costos (SOL-2026-10-29-007). Consumo = SMS reales aceptados por
// Sentraland. Costos solo con tarifas INTERNAS cargadas por un administrador;
// Sentraland no informa costo por mensaje, así que nunca se inventa uno.
import { Suspense, useCallback, useEffect, useState } from "react";
import { Archive, Plus } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import EmptyState from "@/components/ui/EmptyState";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { SMS_MODULE_LABELS } from "@/lib/sms/smsCenterCore.mjs";
import SmsFilters, { useSmsQuery } from "./SmsFilters";
import { formatDateTime, formatNumber, SmsCenterTabs, SmsNotice } from "./smsUi";

const FIELD = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#3150D8] focus:outline-none";
const money = (value, currency) => (value == null ? "Sin tarifa" : `${currency === "CLP" ? "$" : `${currency} `}${Number(value).toLocaleString("es-CL", { maximumFractionDigits: currency === "CLP" ? 0 : 4 })}`);

function Breakdown({ title, rows, label }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-base font-semibold text-[#041E42]">{title}</h2>
      {rows.length ? (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-1.5">{label}</th><th className="py-1.5 text-right">SMS</th><th className="py-1.5 text-right">Costo interno</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.key} className="border-t border-slate-100"><td className="py-1.5 pr-2">{r.name}</td><td className="py-1.5 text-right font-semibold">{formatNumber(r.count)}</td><td className="py-1.5 text-right text-slate-600">{money(r.cost, r.currency)}</td></tr>)}</tbody>
        </table>
      ) : <p className="text-sm text-slate-500">Sin consumo en el período.</p>}
    </div>
  );
}

function TariffForm({ companies, onSaved }) {
  const [form, setForm] = useState({ unitPrice: "", currency: "CLP", validFrom: "", validTo: "", companyId: "", notes: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await authenticatedFetch("/api/centro-sms/tarifas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Object.values(body.details || {})[0] || body.error || "No fue posible guardar la tarifa.");
      setForm({ unitPrice: "", currency: "CLP", validFrom: "", validTo: "", companyId: "", notes: "" });
      onSaved();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <label className="text-xs font-medium text-slate-500">Valor por SMS<input required inputMode="decimal" className={`${FIELD} mt-1`} value={form.unitPrice} onChange={set("unitPrice")} placeholder="Ej: 12" /></label>
      <label className="text-xs font-medium text-slate-500">Moneda<select className={`${FIELD} mt-1`} value={form.currency} onChange={set("currency")}><option value="CLP">CLP</option><option value="UF">UF</option><option value="USD">USD</option></select></label>
      <label className="text-xs font-medium text-slate-500">Vigente desde<input required type="date" className={`${FIELD} mt-1`} value={form.validFrom} onChange={set("validFrom")} /></label>
      <label className="text-xs font-medium text-slate-500">Vigente hasta<input type="date" className={`${FIELD} mt-1`} value={form.validTo} onChange={set("validTo")} /></label>
      <label className="text-xs font-medium text-slate-500">Cliente<select className={`${FIELD} mt-1`} value={form.companyId} onChange={set("companyId")}><option value="">Todos (general)</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <div className="flex items-end"><button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-1 rounded-xl bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" />Agregar tarifa</button></div>
      <label className="text-xs font-medium text-slate-500 sm:col-span-2 lg:col-span-6">Nota (opcional)<input className={`${FIELD} mt-1`} maxLength={300} value={form.notes} onChange={set("notes")} placeholder="Ej: valor según cotización interna" /></label>
      {error ? <div className="sm:col-span-2 lg:col-span-6"><SmsNotice tone="error">{error}</SmsNotice></div> : null}
    </form>
  );
}

function ConsumptionContent() {
  const query = useSmsQuery();
  const queryString = query.toString();
  const [data, setData] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/centro-sms/consumo${queryString ? `?${queryString}` : ""}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible obtener el consumo.");
      setData(body.data);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => { const t = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(t); }, [load]);
  useEffect(() => {
    authenticatedFetch("/api/centro-sms/opciones", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((b) => setCompanies(b?.data?.companies || [])).catch(() => {});
  }, []);

  async function archive(id) {
    if (!window.confirm("¿Archivar esta tarifa interna? Dejará de aplicarse a los cálculos (queda en la auditoría).")) return;
    const response = await authenticatedFetch(`/api/centro-sms/tarifas/${id}`, { method: "DELETE" });
    if (!response.ok) { const body = await response.json().catch(() => ({})); setError(body.error || "No fue posible archivar la tarifa."); return; }
    await load();
  }

  const costs = Object.entries(data?.cost_by_currency || {});
  const bags = data?.lastBalance?.balance?.bags;
  return (
    <>
      <SmsFilters showBucket defaultBucket="month" />
      {error ? <div className="mb-4"><SmsNotice tone="error">{error}</SmsNotice></div> : null}
      {data ? (
        <div className={`space-y-5 ${loading ? "opacity-60" : ""}`}>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">Consumo acumulado del período</p><p className="mt-2 text-2xl font-semibold text-[#041E42]">{formatNumber(data.total)}</p><p className="mt-1 text-xs text-slate-500">SMS reales aceptados por Sentraland</p></div>
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">Costo total (tarifa interna)</p><p className="mt-2 text-2xl font-semibold text-[#041E42]">{costs.length ? costs.map(([cur, v]) => money(v, cur)).join(" + ") : "Sin tarifa"}</p><p className="mt-1 text-xs text-slate-500">{formatNumber(data.priced)} de {formatNumber(data.total)} SMS con tarifa vigente</p></div>
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">Costo unitario informado por Sentraland</p><p className="mt-2 text-2xl font-semibold text-[#041E42]">No informado</p><p className="mt-1 text-xs text-slate-500">La API de Sentraland no entrega costo por mensaje</p></div>
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">Saldo disponible (bolsa)</p><p className="mt-2 text-2xl font-semibold text-[#041E42]">{Array.isArray(bags) ? formatNumber(bags.reduce((s, b) => s + (Number(b.saldo) || 0), 0)) : "Sin consulta"}</p><p className="mt-1 text-xs text-slate-500">{data.lastBalance ? `Consultado ${formatDateTime(data.lastBalance.created_at)}` : "Ejecuta el diagnóstico en modo real para obtenerlo"}</p></div>
          </section>
          {data.mixed_currency ? <SmsNotice tone="warning">Hay tarifas en más de una moneda; los costos se muestran separados por moneda.</SmsNotice> : null}
          {!data.total ? <EmptyState title="Sin consumo en el período" description="No hay SMS reales aceptados por el proveedor con los filtros seleccionados." /> : null}
          <section className="grid gap-4 lg:grid-cols-2">
            <Breakdown title="Por cliente" label="Cliente" rows={data.by_company.map((r) => ({ ...r, key: r.company_id || "none" }))} />
            <Breakdown title="Por módulo" label="Módulo" rows={data.by_module.map((r) => ({ ...r, key: r.module, name: SMS_MODULE_LABELS[r.module] || r.module }))} />
            <Breakdown title="Por establecimiento" label="Establecimiento" rows={data.by_parking.map((r) => ({ ...r, key: r.parking_id || "none", name: `${r.name} · ${r.companyName}` }))} />
            <Breakdown title="Por período" label="Período" rows={data.by_period.map((r) => ({ ...r, key: r.bucket, name: r.bucket, currency: costs[0]?.[0] || "CLP" }))} />
          </section>
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-[#041E42]">Tarifas internas</h2>
            <p className="mb-4 mt-1 text-sm text-slate-600">Valores definidos por ParkFacil para estimar costos. <strong>No son valores informados por Sentraland.</strong> Se aplica la tarifa del cliente si existe; si no, la general vigente a la fecha de cada SMS.</p>
            <TariffForm companies={companies} onSaved={load} />
            <div className="mt-4 overflow-x-auto">
              {data.tariffs.length ? (
                <table className="w-full min-w-[640px] text-sm">
                  <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2">Cliente</th><th className="py-2">Valor</th><th className="py-2">Vigencia</th><th className="py-2">Nota</th><th className="py-2" /></tr></thead>
                  <tbody>{data.tariffs.map((t) => (
                    <tr key={t.id} className="border-t border-slate-100">
                      <td className="py-2">{t.company_id ? companies.find((c) => c.id === t.company_id)?.name || t.company_id : "General"}</td>
                      <td className="py-2 font-semibold">{money(t.unit_price, t.currency)} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">Tarifa interna</span></td>
                      <td className="py-2">{t.valid_from} → {t.valid_to || "sin término"}</td>
                      <td className="py-2 text-slate-600">{t.notes || "—"}</td>
                      <td className="py-2 text-right"><button type="button" onClick={() => archive(t.id)} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-rose-700"><Archive className="h-3.5 w-3.5" />Archivar</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              ) : <p className="text-sm text-slate-500">No hay tarifas internas cargadas: los costos se muestran como «Sin tarifa».</p>}
            </div>
          </section>
        </div>
      ) : loading ? <p className="py-10 text-center text-sm text-slate-500">Cargando consumo…</p> : null}
    </>
  );
}

export default function SmsConsumption() {
  return (
    <AppShell title="Consumo y costos" description="SMS reales consumidos por cliente, establecimiento, módulo y período, con costos según tarifas internas.">
      <SmsCenterTabs />
      <Suspense fallback={<p className="py-10 text-center text-sm text-slate-500">Cargando…</p>}><ConsumptionContent /></Suspense>
    </AppShell>
  );
}
