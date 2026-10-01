"use client";

import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { RELEASED_PAYMENT_MODALITIES, quoteReleasedPayment } from "@/lib/releasedPayment/catalogCore.mjs";

// Root → Planes → Módulos adicionales → Pago liberado (Fase A).
// Catálogo comercial del módulo: SOLO Root lo ve y lo edita (la API lo
// exige). Cambiar estos valores no altera propuestas ni contratos ya
// emitidos: cada uno guarda su snapshot de precios.

const formatUf = (value) => (value === null || value === undefined || !Number.isFinite(Number(value)) ? "—" : `${Number(value).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} UF`);

function toForm(rows) {
  return rows.map((row) => ({
    modality: row.modality,
    packagePriceUf: String(row.packagePriceUf ?? ""),
    includedSpots: String(row.includedSpots ?? ""),
    additionalSpotPriceUf: row.additionalSpotPriceUf === null || row.additionalSpotPriceUf === undefined ? "" : String(row.additionalSpotPriceUf),
    availableInQuotes: Boolean(row.availableInQuotes),
    notes: row.notes || "",
  }));
}

function fromForm(form) {
  return form.map((row) => ({
    modality: row.modality,
    periodMonths: RELEASED_PAYMENT_MODALITIES[row.modality].periodMonths,
    packagePriceUf: Number(String(row.packagePriceUf).replace(",", ".")),
    includedSpots: Number(row.includedSpots),
    additionalSpotPriceUf: String(row.additionalSpotPriceUf).trim() === "" ? null : Number(String(row.additionalSpotPriceUf).replace(",", ".")),
    availableInQuotes: row.availableInQuotes,
  }));
}

export default function PagoLiberadoCatalogPage() {
  // null hasta que la API confirme Root: nunca se muestran precios antes.
  const [form, setForm] = useState(null);
  const [audit, setAudit] = useState([]);
  const [state, setState] = useState({ loading: true, storageReady: true, canEdit: false, error: "", saved: "" });
  const [saving, setSaving] = useState(false);
  const [previewModality, setPreviewModality] = useState("MONTHLY");
  const [previewSpots, setPreviewSpots] = useState("5");

  useEffect(() => {
    let active = true;
    authenticatedFetch("/api/planes/modulos/pago-liberado", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!active) return;
        if (!response.ok) {
          setState({ loading: false, storageReady: true, canEdit: false, error: body.error || "No fue posible cargar el catálogo.", saved: "" });
          return;
        }
        setForm(toForm(Array.isArray(body.data) ? body.data : []));
        setAudit(Array.isArray(body.audit) ? body.audit : []);
        setState({ loading: false, storageReady: body.storageReady !== false, canEdit: Boolean(body.permissions?.canEdit), error: "", saved: "" });
      })
      .catch(() => active && setState({ loading: false, storageReady: true, canEdit: false, error: "Error de red al cargar el catálogo.", saved: "" }));
    return () => { active = false; };
  }, []);

  const preview = useMemo(() => {
    if (!form) return null;
    const row = fromForm(form).find((item) => item.modality === previewModality);
    return quoteReleasedPayment(row, { contractedSpots: Number(previewSpots) });
  }, [form, previewModality, previewSpots]);

  function change(index, key, value) {
    setForm((current) => current.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
    setState((current) => ({ ...current, saved: "", error: "" }));
  }

  async function save(event) {
    event.preventDefault();
    if (saving || !state.canEdit) return;
    setSaving(true);
    setState((current) => ({ ...current, error: "", saved: "" }));
    try {
      const response = await authenticatedFetch("/api/planes/modulos/pago-liberado", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: form }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const details = Array.isArray(body.details) ? ` ${body.details.join(" ")}` : "";
        setState((current) => ({ ...current, error: `${body.error || "No fue posible guardar."}${details}` }));
        return;
      }
      setForm(toForm(body.data || []));
      setState((current) => ({ ...current, saved: "Catálogo guardado. Las propuestas y contratos existentes no cambian." }));
    } catch {
      setState((current) => ({ ...current, error: "Error de red al guardar el catálogo." }));
    } finally {
      setSaving(false);
    }
  }

  const editable = state.canEdit && state.storageReady && !state.loading;

  return (
    <AppShell title="Pago liberado" description="Módulo adicional Off Street">
      <div className="space-y-6">
        <PageHeader
          title="Pago liberado"
          description="Planes → Módulos adicionales. Módulo Off Street que ParkFacil cobra al dueño u operador, por estacionamiento, además del servicio base."
          backHref="/tarifas"
          backLabel="Planes"
        />

        {state.loading ? (
          <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-600"><LoaderCircle className="h-5 w-5 animate-spin" /> Cargando catálogo…</div>
        ) : null}
        {!state.storageReady ? (
          <div className="rounded-3xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            Migración pendiente: el catálogo aún no existe en la base, por lo que no hay precios configurados. Aplica la migración 20261001090000 para cargar los valores iniciales editables.
          </div>
        ) : null}
        {state.error ? <div className="rounded-3xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{state.error}</div> : null}
        {state.saved ? <div className="rounded-3xl border border-emerald-300 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{state.saved}</div> : null}

        {form?.length ? (
        <>
        <form onSubmit={save} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[#041E42]">Modalidades y precios</h2>
          <p className="mt-1 text-sm text-slate-600">
            Valores en UF netos (+ IVA) por estacionamiento. El precio de cada modalidad es el total del período; no hay renovación automática ni facturación automática. Un precio de plaza adicional vacío queda <strong>pendiente de definición</strong> y bloquea cotizar plazas adicionales en esa modalidad.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left">Modalidad</th>
                  <th className="px-3 py-2 text-left">Precio del período</th>
                  <th className="px-3 py-2 text-left">Plazas simultáneas incluidas</th>
                  <th className="px-3 py-2 text-left">Plaza adicional (por período)</th>
                  <th className="px-3 py-2 text-left">Disponible en propuestas</th>
                </tr>
              </thead>
              <tbody>
                {form.map((row, index) => {
                  const modality = RELEASED_PAYMENT_MODALITIES[row.modality];
                  const pending = String(row.additionalSpotPriceUf).trim() === "";
                  return (
                    <tr key={row.modality}>
                      <td className="px-3 py-2 font-bold text-[#041E42]">{modality.label}<span className="block text-xs font-semibold text-slate-500">{modality.periodMonths === 1 ? "1 mes" : `${modality.periodMonths} meses`}</span></td>
                      <td className="px-3 py-2"><input aria-label={`Precio ${modality.label}`} type="number" min="0" step="0.01" value={row.packagePriceUf} onChange={(e) => change(index, "packagePriceUf", e.target.value)} disabled={!editable} className="input" /></td>
                      <td className="px-3 py-2"><input aria-label={`Plazas incluidas ${modality.label}`} type="number" min="1" step="1" value={row.includedSpots} onChange={(e) => change(index, "includedSpots", e.target.value)} disabled={!editable} className="input" /></td>
                      <td className="px-3 py-2">
                        <input aria-label={`Plaza adicional ${modality.label}`} type="number" min="0" step="0.01" placeholder="Pendiente" value={row.additionalSpotPriceUf} onChange={(e) => change(index, "additionalSpotPriceUf", e.target.value)} disabled={!editable} className="input" />
                        {pending ? <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">Pendiente de definición</span> : null}
                      </td>
                      <td className="px-3 py-2">
                        <label className="inline-flex items-center gap-2 font-semibold text-slate-700">
                          <input type="checkbox" checked={row.availableInQuotes} onChange={(e) => change(index, "availableInQuotes", e.target.checked)} disabled={!editable} />
                          {row.availableInQuotes ? "Sí" : "No (no liberado)"}
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {state.canEdit ? (
            <div className="mt-4 flex justify-end">
              <button type="submit" disabled={!editable || saving} className="inline-flex items-center gap-2 rounded-xl bg-[#3150D8] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Guardando…" : "Guardar catálogo"}
              </button>
            </div>
          ) : null}
        </form>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[#041E42]">Simulación de cotización</h2>
          <p className="mt-1 text-sm text-slate-600">Misma regla que usarán las propuestas: precio del paquete sin prorrateo y plazas adicionales solo si su precio está definido.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-semibold text-slate-600">Modalidad
              <select value={previewModality} onChange={(e) => setPreviewModality(e.target.value)} className="input mt-1">
                {Object.values(RELEASED_PAYMENT_MODALITIES).map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-600">Plazas contratadas
              <input type="number" min="1" step="1" value={previewSpots} onChange={(e) => setPreviewSpots(e.target.value)} className="input mt-1" />
            </label>
          </div>
          {preview?.ok ? (
            <dl className="mt-4 grid gap-2 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
              <div><dt className="font-semibold text-slate-500">Paquete ({preview.quote.includedSpots} plazas incluidas)</dt><dd className="font-bold">{formatUf(preview.quote.packagePriceUf)} + IVA</dd></div>
              <div><dt className="font-semibold text-slate-500">Plazas adicionales</dt><dd className="font-bold">{preview.quote.additionalSpots} × {formatUf(preview.quote.additionalSpotPriceUf)} = {formatUf(preview.quote.additionalTotalUf)}</dd></div>
              <div><dt className="font-semibold text-slate-500">Total del período ({preview.quote.modalityLabel.toLowerCase()})</dt><dd className="text-lg font-black text-[#041E42]">{formatUf(preview.quote.totalPeriodUf)} + IVA</dd></div>
              <div><dt className="font-semibold text-slate-500">Equivalente mensual (solo referencia)</dt><dd className="font-bold">{formatUf(preview.quote.monthlyEquivalentUf)}</dd></div>
            </dl>
          ) : (
            <p className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">{preview?.message}</p>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[#041E42]">Historial de cambios</h2>
          {audit.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Sin cambios registrados.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {audit.map((entry, index) => (
                <li key={`${entry.changed_at}-${index}`} className="rounded-xl border border-slate-200 p-3">
                  <span className="font-bold">{RELEASED_PAYMENT_MODALITIES[entry.modality]?.label || entry.modality}</span> · {entry.changed_by_email} · {new Date(entry.changed_at).toLocaleString("es-CL")}
                </li>
              ))}
            </ul>
          )}
        </section>
        </>
        ) : null}
      </div>
    </AppShell>
  );
}
