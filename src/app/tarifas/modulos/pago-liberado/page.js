"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { EDITABLE_MODALITY_CODES, RELEASED_PAYMENT_MODALITIES } from "@/lib/releasedPayment/catalogCore.mjs";

// Root → Planes → Módulos adicionales → Pago liberado.
// SOLO Root lo ve y lo edita (la API lo exige). Definición comercial vigente
// (SOL-2026-10-05-002): ParkFacil cobra un importe MENSUAL + IVA por el módulo,
// que se indica en cada propuesta; aquí solo se libera comercialmente.
// Las modalidades periódicas anteriores se muestran como historial y no se
// pueden habilitar. Cambiar estos valores no altera propuestas ni contratos
// ya emitidos (cada uno guarda su snapshot).

function toForm(rows) {
  return rows
    .filter((row) => EDITABLE_MODALITY_CODES.includes(row.modality))
    .map((row) => ({ modality: row.modality, availableInQuotes: Boolean(row.availableInQuotes), notes: row.notes || "" }));
}

function legacyRows(rows) {
  return rows.filter((row) => !EDITABLE_MODALITY_CODES.includes(row.modality));
}

export default function PagoLiberadoCatalogPage() {
  // null hasta que la API confirme Root.
  const [form, setForm] = useState(null);
  const [audit, setAudit] = useState([]);
  const [legacy, setLegacy] = useState([]);
  const [state, setState] = useState({ loading: true, storageReady: true, canEdit: false, error: "", saved: "" });
  const [saving, setSaving] = useState(false);

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
        setLegacy(legacyRows(Array.isArray(body.data) ? body.data : []));
        setAudit(Array.isArray(body.audit) ? body.audit : []);
        setState({ loading: false, storageReady: body.storageReady !== false, canEdit: Boolean(body.permissions?.canEdit), error: "", saved: "" });
      })
      .catch(() => active && setState({ loading: false, storageReady: true, canEdit: false, error: "Error de red al cargar el catálogo.", saved: "" }));
    return () => { active = false; };
  }, []);

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
      setLegacy(legacyRows(body.data || []));
      setState((current) => ({ ...current, saved: "Cambios guardados. Las propuestas y contratos existentes no cambian." }));
    } catch {
      setState((current) => ({ ...current, error: "Error de red al guardar." }));
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
          description="Planes → Módulos adicionales. Módulo Off Street por el que ParkFacil cobra un importe mensual + IVA; en la propuesta aparece dentro de Módulos opcionales. Aquí solo se libera comercialmente para propuestas."
          backHref="/tarifas"
          backLabel="Planes"
        />

        {state.loading ? (
          <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-600"><LoaderCircle className="h-5 w-5 animate-spin" /> Cargando…</div>
        ) : null}
        {!state.storageReady ? (
          <div className="rounded-3xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            Migración pendiente: el catálogo de Pago liberado aún no existe en la base.
          </div>
        ) : null}
        {state.error ? <div className="rounded-3xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{state.error}</div> : null}
        {state.saved ? <div className="rounded-3xl border border-emerald-300 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{state.saved}</div> : null}

        {form?.length ? (
        <>
        <form onSubmit={save} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[#041E42]">Liberación comercial del importe mensual</h2>
          <p className="mt-1 text-sm text-slate-600">
            ParkFacil cobra un <strong>importe mensual configurable + IVA</strong> por el módulo, que se indica en cada propuesta. Su vigencia coincide con el plazo del contrato (12, 24 o 36 meses). Es independiente de la cantidad de cupos, patentes y beneficiarios, y de las tarifas que cada estacionamiento cobra a sus beneficiarios (no forman parte del precio ParkFacil). Los cupos los define el cliente.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left">Modalidad</th>
                  <th className="px-3 py-2 text-left">Disponible en propuestas</th>
                </tr>
              </thead>
              <tbody>
                {form.map((row, index) => {
                  const modality = RELEASED_PAYMENT_MODALITIES[row.modality];
                  return (
                    <tr key={row.modality}>
                      <td className="px-3 py-2 font-bold text-[#041E42]">{modality.label}<span className="block text-xs font-semibold text-slate-500">UF + IVA mensual</span></td>
                      <td className="px-3 py-2">
                        <label className="inline-flex items-center gap-2 font-semibold text-slate-700">
                          <input type="checkbox" aria-label={`Disponible ${modality.label}`} checked={row.availableInQuotes} onChange={(e) => change(index, "availableInQuotes", e.target.checked)} disabled={!editable} />
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
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          ) : null}
        </form>

        {legacy.length ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-[#041E42]">Modalidades periódicas anteriores (historial)</h2>
            <p className="mt-1 text-sm text-slate-600">Ya no se ofrecen ni se pueden habilitar. Se conservan para leer propuestas y contrataciones emitidas con el modelo anterior.</p>
            <ul className="mt-3 space-y-1 text-sm text-slate-700">
              {legacy.map((row) => (
                <li key={row.modality}>{RELEASED_PAYMENT_MODALITIES[row.modality]?.label || row.modality} · último estado: {row.availableInQuotes ? "liberada" : "no liberada"}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[#041E42]">Historial de cambios</h2>
          {audit.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Sin cambios registrados.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {audit.map((entry, index) => (
                <li key={`${entry.changed_at}-${index}`} className="rounded-xl border border-slate-200 p-3">
                  <span className="font-bold">{RELEASED_PAYMENT_MODALITIES[entry.modality]?.label || entry.modality}</span> · {entry.changed_by_email} · {new Date(entry.changed_at).toLocaleString("es-CL")}
                  <span className="block text-xs text-slate-600">Disponible en propuestas: {entry.previous_values?.available_in_quotes === undefined ? "—" : entry.previous_values.available_in_quotes ? "Sí" : "No"} → {entry.new_values?.available_in_quotes ? "Sí" : "No"}</span>
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
