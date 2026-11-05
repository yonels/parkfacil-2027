"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import ParkFacilDataGrid from "@/components/ui/ParkFacilDataGrid";
import { CATALOG_TAX_CATEGORIES } from "@/lib/billing/catalogCore.mjs";
import { monthlyNetEstimate } from "@/lib/billing/companyServicesCore.mjs";

// Servicios a facturar por empresa (SOL-2026-11-05-005, F1.2): se elige la empresa y se le agregan
// servicios del catálogo con cantidad y precio, como en EasyDoc.
const columns = [
  { key: "conceptCode", label: "Servicio", width: 160, pinned: true, required: true },
  { key: "description", label: "Descripción", width: 280 },
  { key: "cantidad", label: "Cantidad", width: 100 },
  { key: "precio", label: "Precio unitario", width: 150 },
  { key: "subtotal", label: "Subtotal", width: 140 },
  { key: "iva", label: "IVA", width: 120 },
  { key: "validFrom", label: "Desde", width: 120 },
  { key: "hasta", label: "Hasta", width: 120 },
  { key: "estado", label: "Estado", width: 120 },
  { key: "prefacturado", label: "Prefacturado", width: 120 },
];
const STATUS = { ACTIVE: "Activo", SUSPENDED: "Suspendido", ENDED: "Terminado" };

const firstDayOfMonth = () => `${new Date().toISOString().slice(0, 7)}-01`;
const formatAmount = (value, currency) => `${currency} ${new Intl.NumberFormat("es-CL", { maximumFractionDigits: currency === "UF" ? 4 : 0 }).format(Number(value) || 0)}`;
const decimalText = (value) => (value == null ? "" : String(value).replace(".", ","));

function Field({ label, error, children }) {
  return (
    <label className="block text-sm">
      <span className="font-semibold text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  );
}

async function requestJson(method, url, body) {
  const response = await fetch(url, { method, cache: "no-store", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, payload };
}

export default function CompanyServicesWorkspace() {
  const [companies, setCompanies] = useState([]);
  const [companyFilter, setCompanyFilter] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [contractForm, setContractForm] = useState({ startsOn: firstDayOfMonth(), durationMonths: "12", automaticRenewal: true, paymentDueDays: "6", currency: "UF" });
  const [form, setForm] = useState(null);
  const [fieldError, setFieldError] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    requestJson("GET", "/api/billing/company-services").then(({ ok, payload }) => {
      if (!active) return;
      if (ok) setCompanies(payload.data || []); else setMessage(payload.error || "No fue posible cargar las empresas.");
    });
    return () => { active = false; };
  }, []);

  async function loadCompany(id) {
    if (!id) { setData(null); return; }
    setLoading(true);
    const { ok, payload } = await requestJson("GET", `/api/billing/company-services/${id}`);
    setLoading(false);
    if (ok) setData(payload.data); else { setData(null); setMessage(payload.error || "No fue posible cargar la empresa."); }
  }

  async function refreshCompanies() {
    const { ok, payload } = await requestJson("GET", "/api/billing/company-services");
    if (ok) setCompanies(payload.data || []);
  }

  const visibleCompanies = useMemo(() => {
    const term = companyFilter.trim().toLowerCase();
    return term ? companies.filter((company) => `${company.name} ${company.rut}`.toLowerCase().includes(term)) : companies;
  }, [companies, companyFilter]);

  const contract = data?.contract || null;
  const currency = contract?.currency || "UF";
  const items = useMemo(() => data?.items || [], [data]);
  const rows = useMemo(() => items.map((item) => ({
    ...item,
    cantidad: new Intl.NumberFormat("es-CL", { maximumFractionDigits: 4 }).format(item.quantity),
    precio: formatAmount(item.unitPrice, item.currency),
    subtotal: formatAmount((item.itemType === "DISCOUNT" ? -1 : 1) * item.quantity * item.unitPrice, item.currency),
    iva: CATALOG_TAX_CATEGORIES[item.taxCategory] || item.taxCategory,
    hasta: item.validTo || "Sin término",
    estado: STATUS[item.status] || item.status,
    prefacturado: item.usageCount ? `${item.usageCount} vez/veces` : "No",
  })), [items]);
  const today = new Date().toISOString().slice(0, 10);
  const estimate = monthlyNetEstimate(items, today);
  const untaxed = items.filter((item) => item.status === "ACTIVE" && item.taxCategory === "UNDEFINED").length;

  function selectCompany(id) {
    setCompanyId(id); setMessage(""); setForm(null);
    loadCompany(id);
  }

  async function createContract() {
    const id = data?.company?.id;
    if (!id) return;
    setSaving(true); setFieldError({}); setMessage("");
    const { ok, payload } = await requestJson("POST", `/api/billing/company-services/${id}/contract`, contractForm);
    setSaving(false);
    if (!ok) { if (payload.field) setFieldError({ [payload.field]: payload.error }); else setMessage(payload.error || "No fue posible crear el contrato."); return; }
    setMessage(`Contrato ${payload.data?.number || ""} creado. Ahora agrega los servicios a facturar.`);
    await loadCompany(id);
  }

  function openNew() {
    setFieldError({}); setMessage("");
    setForm({ conceptId: "", description: "", quantity: "1", unitPrice: "", validFrom: firstDayOfMonth(), validTo: "" });
  }

  function chooseConcept(conceptId) {
    const concept = (data?.catalog || []).find((candidate) => candidate.id === conceptId);
    setForm((current) => ({ ...current, conceptId, description: concept?.name || current.description, unitPrice: concept?.suggestedPrice != null ? decimalText(concept.suggestedPrice) : current.unitPrice }));
  }

  function openEdit(row) {
    const item = items.find((candidate) => candidate.id === row.id);
    if (!item) return;
    setFieldError({}); setMessage("");
    setForm({ ...item, quantity: decimalText(item.quantity), unitPrice: decimalText(item.unitPrice), validTo: item.validTo || "" });
  }

  const setField = (key) => (event) => { const value = event.target.type === "checkbox" ? event.target.checked : event.target.value; setForm((current) => ({ ...current, [key]: value })); };
  const setContractField = (key) => (event) => { const value = event.target.type === "checkbox" ? event.target.checked : event.target.value; setContractForm((current) => ({ ...current, [key]: value })); };

  async function saveItem() {
    const id = data?.company?.id;
    if (!id || !form) return;
    setSaving(true); setFieldError({}); setMessage("");
    const body = { description: form.description, quantity: form.quantity, unitPrice: form.unitPrice, validFrom: form.validFrom, validTo: form.validTo };
    const result = form.id
      ? await requestJson("PATCH", `/api/billing/company-services/${id}/items/${form.id}`, { ...body, status: form.status })
      : await requestJson("POST", `/api/billing/company-services/${id}/items`, { ...body, conceptId: form.conceptId });
    setSaving(false);
    if (!result.ok) { if (result.payload.field) setFieldError({ [result.payload.field]: result.payload.error }); else setMessage(result.payload.error || "No fue posible guardar."); return; }
    setForm(null);
    setMessage(form.id ? "Servicio actualizado." : "Servicio agregado.");
    await loadCompany(id); await refreshCompanies();
  }

  async function removeItem() {
    const id = data?.company?.id;
    const itemId = form?.id;
    if (!id || !itemId || !window.confirm(`¿Eliminar «${form.description}» de esta empresa?`)) return;
    setSaving(true);
    const { ok, payload } = await requestJson("DELETE", `/api/billing/company-services/${id}/items/${itemId}`);
    setSaving(false);
    if (!ok) { setMessage(payload.error || "No fue posible eliminar."); return; }
    setForm(null); setMessage("Servicio eliminado.");
    await loadCompany(id); await refreshCompanies();
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-[#041E42]">Lista de servicios por empresa</h3>
        <p className="mt-1 text-sm text-slate-600">Elige la empresa y agrégale los servicios y productos del catálogo con su cantidad y precio. Por ahora todos se facturan mensualmente; la factura se emite en pesos con la UF del día de facturación más IVA.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr]">
          <input value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)} placeholder="Filtrar por nombre o RUT" className="rounded-lg border border-slate-300 p-2 text-sm" />
          <select value={companyId} onChange={(event) => selectCompany(event.target.value)} className="rounded-lg border border-slate-300 p-2 text-sm" aria-label="Empresa">
            <option value="">Seleccionar empresa…</option>
            {visibleCompanies.map((company) => <option key={company.id} value={company.id}>{company.name}{company.rut ? ` · ${company.rut}` : ""} · {company.activeServices} servicio(s){company.status !== "active" ? " · inactiva" : ""}</option>)}
          </select>
        </div>
      </section>

      {message ? <p role="status" className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">{message}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Cargando…</p> : null}

      {data && !loading ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#3150D8]">Empresa</p>
                <h3 className="text-xl font-bold text-[#041E42]">{data.company.name}</h3>
                <p className="text-sm text-slate-600">{data.company.rut || "Sin RUT"} · {data.company.status === "active" ? "Activa" : "Inactiva (se puede facturar igual)"}</p>
              </div>
              {contract ? (
                <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                  <p className="font-semibold text-[#041E42]">Contrato {contract.number}</p>
                  <p>Moneda {contract.currency} · desde {contract.startsOn} · hasta {contract.endsOn}{contract.automaticRenewal ? " (renovación automática)" : ""}</p>
                  <p>Pago a {contract.paymentDueDays} día(s)</p>
                </div>
              ) : null}
            </div>
          </section>

          {!contract ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
              <p className="font-semibold">Esta empresa no tiene un contrato vigente.</p>
              <p className="mt-1">Para agregarle servicios se crea un contrato mínimo. Después puedes completarlo al editar la empresa.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-5">
                <Field label="Inicio" error={fieldError.startsOn}><input type="date" value={contractForm.startsOn} onChange={setContractField("startsOn")} className="w-full rounded-lg border border-slate-300 bg-white p-2" /></Field>
                <Field label="Plazo (meses)" error={fieldError.durationMonths}><input type="number" min="1" max="120" value={contractForm.durationMonths} onChange={setContractField("durationMonths")} className="w-full rounded-lg border border-slate-300 bg-white p-2" /></Field>
                <Field label="Días de pago" error={fieldError.paymentDueDays}><input type="number" min="0" max="120" value={contractForm.paymentDueDays} onChange={setContractField("paymentDueDays")} className="w-full rounded-lg border border-slate-300 bg-white p-2" /></Field>
                <Field label="Moneda" error={fieldError.currency}><select value={contractForm.currency} onChange={setContractField("currency")} className="w-full rounded-lg border border-slate-300 bg-white p-2"><option value="UF">UF</option><option value="CLP">CLP</option></select></Field>
                <label className="mt-6 flex items-center gap-2"><input type="checkbox" checked={contractForm.automaticRenewal} onChange={setContractField("automaticRenewal")} /> Renovación automática</label>
              </div>
              <button type="button" disabled={saving} onClick={createContract} className="mt-4 rounded-lg bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Crear contrato</button>
            </section>
          ) : (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-700">
                  <p><span className="font-semibold">Neto mensual estimado hoy:</span> {formatAmount(estimate, currency)} + IVA</p>
                  {untaxed ? <p className="font-semibold text-amber-700">{untaxed} servicio(s) sin IVA definido en el catálogo: complétalo en Configuración antes de facturar.</p> : null}
                </div>
                <button type="button" onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white shadow-sm"><Plus className="h-4 w-4" /> Agregar servicio</button>
              </div>
              <ParkFacilDataGrid storageKey="facturacion:servicios-empresa" columns={columns} rows={rows} onRowDoubleClick={openEdit} globalSearchPlaceholder="Buscar servicios de la empresa..." emptyMessage="Sin servicios asignados" exportFilename={`servicios_${data.company.rut || data.company.id}`} exportSheetName="Servicios" />
              <p className="text-xs text-slate-500">Doble clic en una fila para editarla, terminarla o eliminarla.</p>
            </section>
          )}
        </>
      ) : null}

      {form ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4">
          <section className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-3xl bg-white p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#3150D8]">{form.id ? "Editar servicio" : "Agregar servicio"}</p>
                <h3 className="text-xl font-bold text-[#041E42]">{data?.company?.name}</h3>
                <p className="text-sm text-slate-600">Moneda del contrato: {currency}</p>
              </div>
              <button type="button" aria-label="Cerrar" onClick={() => setForm(null)} className="text-slate-500">✕</button>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {form.id ? (
                <Field label="Servicio o producto"><input value={`${form.conceptCode} · ${form.conceptName}`} disabled className="w-full rounded-lg border border-slate-300 bg-slate-100 p-2" /></Field>
              ) : (
                <Field label="Servicio o producto" error={fieldError.conceptId}>
                  <select value={form.conceptId} onChange={(event) => chooseConcept(event.target.value)} className="w-full rounded-lg border border-slate-300 p-2">
                    <option value="">Seleccionar del catálogo…</option>
                    {(data?.catalog || []).map((concept) => <option key={concept.id} value={concept.id}>{concept.name} · {concept.code}{concept.taxCategory === "UNDEFINED" ? " · IVA sin definir" : ""}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Descripción en la factura" error={fieldError.description}><input value={form.description} onChange={setField("description")} className="w-full rounded-lg border border-slate-300 p-2" /></Field>
              <Field label="Cantidad" error={fieldError.quantity}><input value={form.quantity} onChange={setField("quantity")} inputMode="decimal" className="w-full rounded-lg border border-slate-300 p-2" /></Field>
              <Field label={`Precio unitario neto (${currency})`} error={fieldError.unitPrice}><input value={form.unitPrice} onChange={setField("unitPrice")} inputMode="decimal" placeholder="Ej.: 1,5625" className="w-full rounded-lg border border-slate-300 p-2" /></Field>
              <Field label="Desde" error={fieldError.validFrom}><input type="date" value={form.validFrom} onChange={setField("validFrom")} className="w-full rounded-lg border border-slate-300 p-2" /></Field>
              <Field label="Hasta (opcional)" error={fieldError.validTo}><input type="date" value={form.validTo} onChange={setField("validTo")} className="w-full rounded-lg border border-slate-300 p-2" /></Field>
              {form.id ? (
                <Field label="Estado" error={fieldError.status}>
                  <select value={form.status} onChange={setField("status")} className="w-full rounded-lg border border-slate-300 p-2">
                    {Object.entries(STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </Field>
              ) : null}
            </div>
            {message ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{message}</p> : null}
            <div className="mt-6 flex flex-wrap gap-2">
              <button type="button" disabled={saving} onClick={saveItem} className="rounded-lg bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Guardar</button>
              {form.id && !form.usageCount ? <button type="button" disabled={saving} onClick={removeItem} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">Eliminar</button> : null}
              <button type="button" onClick={() => setForm(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancelar</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
