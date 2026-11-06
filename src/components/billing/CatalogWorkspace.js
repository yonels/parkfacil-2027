"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import ParkFacilDataGrid from "@/components/ui/ParkFacilDataGrid";
import { CATALOG_CATEGORIES, CATALOG_CURRENCIES, CATALOG_ITEM_KINDS, CATALOG_PERIODICITIES, CATALOG_STATUSES, CATALOG_TAX_CATEGORIES } from "@/lib/billing/catalogCore.mjs";

// Catálogo de servicios y productos de ParkFacil (SOL-2026-11-05-005, F1.1).
const columns = [
  { key: "code", label: "Código", width: 170, pinned: true, required: true },
  { key: "name", label: "Nombre", width: 260 },
  { key: "tipo", label: "Tipo", width: 110 },
  { key: "categoria", label: "Categoría", width: 140 },
  { key: "unit", label: "Unidad", width: 100 },
  { key: "precio", label: "Precio referencia", width: 150 },
  { key: "iva", label: "IVA", width: 130 },
  { key: "periodicidad", label: "Periodicidad", width: 130 },
  { key: "estado", label: "Estado", width: 110 },
  { key: "usos", label: "Usos", width: 90 },
];

const EMPTY = { code: "", name: "", description: "", itemKind: "SERVICE", category: "SERVICE", unit: "mes", taxCategory: "TAXABLE", periodicity: "MONTHLY", referenceCurrency: "UF", referencePrice: "", status: "ACTIVE" };

function formatPrice(item) {
  if (item.referencePrice == null) return "Sin precio";
  const decimals = item.referenceCurrency === "UF" ? 4 : 0;
  return `${item.referenceCurrency} ${new Intl.NumberFormat("es-CL", { maximumFractionDigits: decimals }).format(item.referencePrice)}`;
}

function Field({ label, error, children }) {
  return (
    <label className="block text-sm">
      <span className="font-semibold text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  );
}

function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-300 p-2">
      {Object.entries(options).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
  );
}

export default function CatalogWorkspace() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(null);
  const [fieldError, setFieldError] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/billing/catalog", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No fue posible cargar el catálogo.");
      setItems(payload.data || []);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/billing/catalog", { cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, payload: await response.json() }))
      .then(({ ok, payload }) => { if (!active) return; if (ok) setItems(payload.data || []); else setMessage(payload.error || "No fue posible cargar el catálogo."); })
      .catch(() => { if (active) setMessage("No fue posible cargar el catálogo."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const rows = useMemo(() => items.map((item) => ({
    ...item,
    tipo: CATALOG_ITEM_KINDS[item.itemKind] || item.itemKind,
    categoria: CATALOG_CATEGORIES[item.category] || item.category,
    precio: formatPrice(item),
    iva: CATALOG_TAX_CATEGORIES[item.taxCategory] || item.taxCategory,
    periodicidad: CATALOG_PERIODICITIES[item.periodicity] || item.periodicity,
    estado: CATALOG_STATUSES[item.status] || item.status,
    usos: item.usageCount,
  })), [items]);

  const pendingTax = items.filter((item) => item.status === "ACTIVE" && item.taxCategory === "UNDEFINED").length;

  const openNew = () => { setFieldError({}); setMessage(""); setForm({ ...EMPTY }); };
  const openEdit = (row) => {
    const item = items.find((candidate) => candidate.id === row.id);
    if (!item) return;
    setFieldError({}); setMessage("");
    setForm({ ...item, referencePrice: item.referencePrice == null ? "" : String(item.referencePrice).replace(".", ",") });
  };
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));

  async function send(method, url, body) {
    setSaving(true); setFieldError({}); setMessage("");
    try {
      const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const payload = await response.json();
      if (!response.ok) {
        if (payload.field) setFieldError({ [payload.field]: payload.error });
        else setMessage(payload.error || "No fue posible completar la acción.");
        return false;
      }
      await load();
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    const { id, usageCount: _usage, updatedAt: _updated, ...values } = form || {};
    if (!values.name?.trim()) { setFieldError({ name: "El nombre es obligatorio." }); return; }
    if (!values.code?.trim()) { setFieldError({ code: "El código es obligatorio." }); return; }
    const ok = id ? await send("PATCH", `/api/billing/catalog/${id}`, values) : await send("POST", "/api/billing/catalog", values);
    if (ok) { setForm(null); setMessage(id ? "Servicio o producto actualizado." : "Servicio o producto creado."); }
  }

  async function toggleStatus() {
    const id = form?.id;
    if (!id) return;
    const next = form.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    if (await send("PATCH", `/api/billing/catalog/${id}`, { status: next })) { setForm(null); setMessage(next === "ACTIVE" ? "Activado." : "Desactivado: ya no se ofrece para nuevos servicios a facturar."); }
  }

  async function remove() {
    const id = form?.id;
    if (!id || !window.confirm(`¿Eliminar «${form.name}»? Esta acción no se puede deshacer.`)) return;
    if (await send("DELETE", `/api/billing/catalog/${id}`)) { setForm(null); setMessage("Servicio o producto eliminado."); }
  }

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h3 className="text-lg font-semibold text-[#041E42]">Servicios y productos</h3>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">Catálogo de lo que ParkFacil factura a sus clientes. El precio de referencia (UF neto por defecto) solo se propone al asignar el servicio a una empresa; la factura se emite en pesos con la UF del día de facturación más IVA.</p>
          {pendingTax ? <p className="mt-2 text-sm font-semibold text-amber-700">{pendingTax} servicio(s) activo(s) sin definir si son afectos o exentos de IVA: no se podrán facturar hasta completarlo.</p> : null}
        </div>
        <button type="button" onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#2741b5]"><Plus className="h-4 w-4" /> Nuevo servicio o producto</button>
      </section>

      {message ? <p role="status" className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">{message}</p> : null}

      <ParkFacilDataGrid storageKey="facturacion:catalogo" columns={columns} rows={rows} onRowDoubleClick={openEdit} globalSearchPlaceholder="Buscar servicios o productos..." emptyMessage={loading ? "Cargando..." : "Sin servicios ni productos"} exportFilename="facturacion_servicios_productos" exportSheetName="Servicios y productos" />
      <p className="text-xs text-slate-500">Doble clic en una fila para editarla, activarla o desactivarla.</p>

      {form ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4">
          <section className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-3xl bg-white p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#3150D8]">{form.id ? "Editar" : "Nuevo"}</p>
                <h3 className="text-xl font-bold text-[#041E42]">{form.id ? form.name : "Servicio o producto"}</h3>
                {form.id ? <p className="text-sm text-slate-600">{CATALOG_STATUSES[form.status]} · usado {form.usageCount || 0} vez/veces en contratos o prefacturas</p> : null}
              </div>
              <button type="button" aria-label="Cerrar" onClick={() => setForm(null)} className="text-slate-500">✕</button>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Nombre" error={fieldError.name}><input value={form.name} onChange={(event) => set("name")(event.target.value)} className="w-full rounded-lg border border-slate-300 p-2" placeholder="Parkfacil servicios de software" /></Field>
              <Field label="Código" error={fieldError.code}><input value={form.code} onChange={(event) => set("code")(event.target.value)} disabled={Boolean(form.id && form.usageCount)} className="w-full rounded-lg border border-slate-300 p-2 uppercase disabled:bg-slate-100" placeholder="SOFTWARE" /></Field>
              <Field label="Tipo" error={fieldError.itemKind}><Select value={form.itemKind} onChange={set("itemKind")} options={CATALOG_ITEM_KINDS} /></Field>
              <Field label="Categoría" error={fieldError.category}><Select value={form.category} onChange={set("category")} options={CATALOG_CATEGORIES} /></Field>
              <Field label="Precio de referencia (neto)" error={fieldError.referencePrice}><input value={form.referencePrice} onChange={(event) => set("referencePrice")(event.target.value)} inputMode="decimal" className="w-full rounded-lg border border-slate-300 p-2" placeholder="Ej.: 1,5" /></Field>
              <Field label="Moneda" error={fieldError.referenceCurrency}><Select value={form.referenceCurrency} onChange={set("referenceCurrency")} options={CATALOG_CURRENCIES} /></Field>
              <Field label="IVA" error={fieldError.taxCategory}><Select value={form.taxCategory} onChange={set("taxCategory")} options={CATALOG_TAX_CATEGORIES} /></Field>
              <Field label="Periodicidad" error={fieldError.periodicity}><Select value={form.periodicity} onChange={set("periodicity")} options={CATALOG_PERIODICITIES} /></Field>
              <Field label="Unidad" error={fieldError.unit}><input value={form.unit} onChange={(event) => set("unit")(event.target.value)} className="w-full rounded-lg border border-slate-300 p-2" placeholder="mes, unidad, estacionamiento" /></Field>
              <div className="md:col-span-2"><Field label="Descripción" error={fieldError.description}><textarea value={form.description} onChange={(event) => set("description")(event.target.value)} rows={3} className="w-full rounded-lg border border-slate-300 p-2" /></Field></div>
            </div>
            {message ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{message}</p> : null}
            <div className="mt-6 flex flex-wrap gap-2">
              <button type="button" disabled={saving} onClick={save} className="rounded-lg bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Guardar</button>
              {form.id ? <button type="button" disabled={saving} onClick={toggleStatus} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">{form.status === "ACTIVE" ? "Desactivar" : "Activar"}</button> : null}
              {form.id && !form.usageCount ? <button type="button" disabled={saving} onClick={remove} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">Eliminar</button> : null}
              <button type="button" onClick={() => setForm(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancelar</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
