"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { contractPeriodText, describeContract } from "@/lib/releasedPayment/contractCore.mjs";
import { COUPON_MODULE_STATUS_LABELS } from "@/lib/cupones/couponModuleCore.mjs";

// Root → Planes → Módulos adicionales → Cupones y descuentos
// (SOL-2026-10-19-002, etapa C). SOLO Root (la API lo exige):
// - liberación del módulo en propuestas del CRM (catálogo);
// - contratación por empresa: importe mensual final en UF + IVA, plazo
//   12/24/36, versiones inmutables (D1/D2);
// - activación y desactivación con motivo. Contratar NO activa. Inactivo: el
//   cliente queda en solo lectura (D3); el vencimiento apaga solo (D4).

const emptyContract = { monthlyFeeUf: "", baseMonthlyFeeUf: "", discountNotes: "", termMonths: "12", startsAt: "", contractReference: "", crmProposalNumber: "", notes: "", reason: "" };
const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#3150D8]";
const EVENT_LABELS = { CONTRACT_CREATED: "Contratación registrada", CONTRACT_VERSIONED: "Nueva versión de contratación", ACTIVATED: "Módulo activado", DEACTIVATED: "Módulo desactivado" };
const dateTime = (value) => value ? new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(value)) : "—";

async function readJson(response) {
  return response.json().catch(() => ({}));
}

export default function CouponModulePage() {
  const [state, setState] = useState({ loading: true, error: "", storageReady: true });
  const [catalog, setCatalog] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState(null);
  const [contractForm, setContractForm] = useState(emptyContract);
  const [stateReason, setStateReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    const response = await authenticatedFetch("/api/cupones/modulo", { cache: "no-store" });
    const body = await readJson(response);
    if (!response.ok) { setState({ loading: false, error: body.error || "No fue posible cargar el módulo.", storageReady: true }); return; }
    setCatalog(body.data.catalog);
    setCompanies(body.data.companies || []);
    setState({ loading: false, error: "", storageReady: body.data.storageReady !== false });
  }, []);

  const loadDetail = useCallback(async (companyId) => {
    if (!companyId) { setDetail(null); return; }
    const response = await authenticatedFetch(`/api/cupones/modulo/${encodeURIComponent(companyId)}`, { cache: "no-store" });
    const body = await readJson(response);
    setDetail(response.ok ? body.data : null);
    if (!response.ok) setMessage({ type: "error", text: body.error || "No fue posible cargar la empresa." });
  }, []);

  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  useEffect(() => { const timer = setTimeout(() => void loadDetail(selectedId), 0); return () => clearTimeout(timer); }, [selectedId, loadDetail]);

  async function run(action, success) {
    setBusy(true); setMessage(null);
    try {
      const response = await action();
      const body = await readJson(response);
      if (!response.ok) { setMessage({ type: "error", text: [body.error, ...(Array.isArray(body.details) ? body.details : [])].filter(Boolean).join(" ") || "No fue posible guardar." }); return false; }
      setMessage({ type: "success", text: success });
      await load(); if (selectedId) await loadDetail(selectedId);
      return true;
    } catch {
      setMessage({ type: "error", text: "No fue posible conectar con el servidor." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const saveCatalog = () => run(() => authenticatedFetch("/api/cupones/modulo", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ availableInQuotes: catalog.availableInQuotes, notes: catalog.notes }) }), "Catálogo guardado.");
  const saveContract = async (event) => {
    event.preventDefault();
    const ok = await run(() => authenticatedFetch(`/api/cupones/modulo/${encodeURIComponent(selectedId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(contractForm) }), "Contratación registrada. Recuerda activar el módulo.");
    if (ok) setContractForm(emptyContract);
  };
  const setModuleState = async (enabled) => {
    const ok = await run(() => authenticatedFetch(`/api/cupones/modulo/${encodeURIComponent(selectedId)}/estado`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled, reason: stateReason }) }), enabled ? "Módulo activado." : "Módulo desactivado.");
    if (ok) setStateReason("");
  };

  return <AppShell title="Cupones y descuentos" description="Módulo adicional Off Street">
    <div className="space-y-6">
      <PageHeader title="Cupones y descuentos — módulo adicional" description="Catálogo, contratación por empresa y activación. Solo ParkFacil Root." />
      {state.loading ? <p className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin"/>Cargando…</p> : null}
      {state.error ? <p className="rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">{state.error}</p> : null}
      {!state.loading && !state.storageReady ? <p className="rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">El módulo aún no está instalado en la base de datos (migraciones de la etapa C pendientes).</p> : null}
      {message ? <p className={`rounded-2xl p-3 text-sm font-semibold ${message.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{message.text}</p> : null}

      {catalog ? <section className="space-y-3 rounded-3xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-[#041E42]">Catálogo comercial</h2>
        <p className="text-sm text-slate-600">ParkFacil cobra un importe mensual en UF + IVA que se define en cada propuesta. Si está liberado, el CRM puede ofrecer el módulo.</p>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={catalog.availableInQuotes} onChange={(event) => setCatalog({ ...catalog, availableInQuotes: event.target.checked })}/>Ofrecer en propuestas</label>
        <textarea value={catalog.notes} onChange={(event) => setCatalog({ ...catalog, notes: event.target.value })} maxLength={500} rows={2} className={inputClass} placeholder="Notas internas (opcional)"/>
        <button type="button" disabled={busy} onClick={() => void saveCatalog()} className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4"/>Guardar catálogo</button>
      </section> : null}

      {state.storageReady && !state.loading ? <section className="overflow-hidden rounded-3xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4"><h2 className="text-lg font-bold text-[#041E42]">Empresas cliente con Off Street</h2></div>
        <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr><th className="px-3 py-2">Empresa</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Contratación vigente</th><th className="px-3 py-2">Período</th><th className="px-3 py-2"></th></tr></thead>
          <tbody>{companies.map((company) => <tr key={company.id} className={selectedId === company.id ? "bg-blue-50" : ""}><td className="px-3 py-2 font-semibold">{company.name}</td><td className="px-3 py-2">{COUPON_MODULE_STATUS_LABELS[company.status] || company.status}</td><td className="px-3 py-2">{company.contract ? describeContract(company.contract) : "—"}</td><td className="px-3 py-2">{company.contract ? contractPeriodText(company.contract) : "—"}</td><td className="px-3 py-2"><button type="button" onClick={() => setSelectedId(company.id)} className="rounded-full border border-[#BFD2FF] px-3 py-1 text-xs font-semibold text-[#3150D8]">Administrar</button></td></tr>)}
            {!companies.length ? <tr><td colSpan="5" className="px-3 py-6 text-center text-slate-500">No hay empresas cliente con Off Street.</td></tr> : null}</tbody></table></div>
      </section> : null}

      {detail ? <section className="space-y-5 rounded-3xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold text-[#041E42]">{companies.find((company) => company.id === selectedId)?.name || selectedId}</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{COUPON_MODULE_STATUS_LABELS[detail.status] || detail.status}</span></div>
        {detail.contract ? <p className="text-sm text-slate-700">{describeContract(detail.contract)} · {contractPeriodText(detail.contract)}{detail.contract.crmProposalNumber ? ` · Propuesta CRM ${detail.contract.crmProposalNumber}` : ""}</p> : <p className="text-sm text-slate-500">Sin contratación registrada.</p>}

        {detail.contract ? <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-64 flex-1 text-xs font-semibold text-slate-600"><span className="mb-1 block">Motivo del cambio de estado</span><input value={stateReason} onChange={(event) => setStateReason(event.target.value)} className={inputClass}/></label>
          {detail.module?.enabled
            ? <button type="button" disabled={busy || stateReason.trim().length < 3} onClick={() => void setModuleState(false)} className="rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">Desactivar módulo</button>
            : <button type="button" disabled={busy || stateReason.trim().length < 3} onClick={() => void setModuleState(true)} className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Activar módulo</button>}
        </div> : null}

        <form onSubmit={saveContract} className="space-y-3 rounded-2xl border border-slate-200 p-4">
          <h3 className="font-bold text-[#041E42]">{detail.contract ? "Nueva versión de la contratación" : "Registrar contratación"}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs font-semibold text-slate-600"><span className="mb-1 block">Importe mensual final (UF + IVA)</span><input required inputMode="decimal" value={contractForm.monthlyFeeUf} onChange={(event) => setContractForm({ ...contractForm, monthlyFeeUf: event.target.value })} className={inputClass}/></label>
            <label className="text-xs font-semibold text-slate-600"><span className="mb-1 block">Importe base antes de descuentos (opcional)</span><input inputMode="decimal" value={contractForm.baseMonthlyFeeUf} onChange={(event) => setContractForm({ ...contractForm, baseMonthlyFeeUf: event.target.value })} className={inputClass}/></label>
            <label className="text-xs font-semibold text-slate-600"><span className="mb-1 block">Plazo</span><select value={contractForm.termMonths} onChange={(event) => setContractForm({ ...contractForm, termMonths: event.target.value })} className={inputClass}><option value="12">12 meses</option><option value="24">24 meses</option><option value="36">36 meses</option></select></label>
            <label className="text-xs font-semibold text-slate-600"><span className="mb-1 block">Fecha de inicio</span><input required type="date" value={contractForm.startsAt} onChange={(event) => setContractForm({ ...contractForm, startsAt: event.target.value })} className={inputClass}/></label>
            <label className="text-xs font-semibold text-slate-600"><span className="mb-1 block">N.º de propuesta CRM</span><input value={contractForm.crmProposalNumber} onChange={(event) => setContractForm({ ...contractForm, crmProposalNumber: event.target.value })} className={inputClass}/></label>
            <label className="text-xs font-semibold text-slate-600"><span className="mb-1 block">Referencia del contrato</span><input value={contractForm.contractReference} onChange={(event) => setContractForm({ ...contractForm, contractReference: event.target.value })} className={inputClass}/></label>
          </div>
          <input value={contractForm.discountNotes} onChange={(event) => setContractForm({ ...contractForm, discountNotes: event.target.value })} maxLength={300} className={inputClass} placeholder="Detalle de descuentos (opcional)"/>
          <input value={contractForm.notes} onChange={(event) => setContractForm({ ...contractForm, notes: event.target.value })} maxLength={500} className={inputClass} placeholder="Notas (opcional)"/>
          <input required value={contractForm.reason} onChange={(event) => setContractForm({ ...contractForm, reason: event.target.value })} maxLength={500} className={inputClass} placeholder="Motivo (obligatorio)"/>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4"/>Guardar contratación</button>
          <p className="text-xs text-slate-500">Contratar no activa el módulo. Cada versión queda registrada y no se puede modificar.</p>
        </form>

        {detail.versions?.length ? <div><h3 className="mb-2 font-bold text-[#041E42]">Versiones</h3><ul className="space-y-1 text-sm text-slate-700">{detail.versions.map((version) => <li key={version.id}>v{version.version} · {describeContract(version)} · {contractPeriodText(version)} · {version.createdByEmail} · {dateTime(version.createdAt)}{version.supersededAt ? " · reemplazada" : " · vigente"}</li>)}</ul></div> : null}
        {detail.events?.length ? <div><h3 className="mb-2 font-bold text-[#041E42]">Historial</h3><ul className="space-y-1 text-sm text-slate-700">{detail.events.map((item, index) => <li key={`${item.created_at}-${index}`}>{dateTime(item.created_at)} · {EVENT_LABELS[item.event_type] || item.event_type} · {item.actor_email} · {item.reason}</li>)}</ul></div> : null}
      </section> : null}
    </div>
  </AppShell>;
}
