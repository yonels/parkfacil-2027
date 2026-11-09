"use client";
import { useEffect, useMemo, useState } from "react";
import { FileMinus2, FilePlus2, Search } from "lucide-react";

// «Notas de crédito y débito» (SOL-2026-11-05-005; pedido del usuario 2026-11-09: «acceso directo… que permita buscar
// una factura por cualquier concepto y generarla»). Busca entre las facturas emitidas por folio, RUT, razón social,
// monto, fecha, período o contrato, y emite la nota sobre la factura elegida con la API existente (mismo proveedor que la
// factura, validación de montos en el servidor).
const money = (value) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0));
const dmy = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("-") : "");
const chileToday = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const inputClass = "w-full rounded-xl border border-slate-300 px-3 py-2 text-sm";
const PROVIDER = { haulmer: "Haulmer", mock: "Simulada" };
// Disponible para acreditar, como la base: total − notas de crédito emitidas o en emisión.
const creditable = (doc) => Math.max(0, Math.round(Number(doc.total_amount) || 0) - (doc.related || []).filter((x) => x.document_type === "CREDIT_NOTE" && ["ISSUING", "ISSUED", "PROVIDER_PENDING"].includes(x.status)).reduce((s, x) => s + Math.round(Number(x.total_amount) || 0), 0));
const strip = (text) => String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function rut(doc) {
  const c = Array.isArray(doc.companies) ? doc.companies[0] : doc.companies;
  return c?.rut_number ? `${c.rut_number}-${c.rut_dv}` : doc.customer_snapshot?.rut || "";
}
function client(doc) {
  const c = Array.isArray(doc.companies) ? doc.companies[0] : doc.companies;
  return c?.business_name || doc.customer_snapshot?.businessName || "";
}
// Texto donde se busca: folio, RUT (con y sin puntos), razón social, montos, fechas, período y contrato.
function haystack(doc) {
  const r = rut(doc);
  const total = Math.round(Number(doc.total_amount) || 0);
  const contract = (Array.isArray(doc.company_contracts) ? doc.company_contracts[0] : doc.company_contracts)?.contract_number || "";
  const period = (Array.isArray(doc.billing_preinvoices) ? doc.billing_preinvoices[0] : doc.billing_preinvoices)?.period || "";
  return strip([doc.folio, r, r.replace(/-/g, ""), Number(r.split("-")[0] || 0).toLocaleString("es-CL"), client(doc), total, total.toLocaleString("es-CL"), money(total), doc.invoice_date, dmy(doc.invoice_date), period, contract, PROVIDER[doc.provider] || doc.provider].join(" "));
}

export default function NotesWorkspace() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [onlyReal, setOnlyReal] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetch("/api/billing/documents?type=INVOICE", { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
      .then(({ ok, body }) => { if (!active) return; if (ok) { setDocs(body.data || []); setError(""); } else setError(body.error || "No fue posible cargar las facturas."); })
      .catch(() => { if (active) setError("No fue posible cargar las facturas."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  const issued = useMemo(() => docs.filter((d) => d.status === "ISSUED" && (!onlyReal || d.provider !== "mock")), [docs, onlyReal]);
  const results = useMemo(() => {
    const terms = strip(applied).split(/\s+/).filter(Boolean);
    if (!terms.length) return issued.slice(0, 50);
    return issued.filter((d) => { const text = haystack(d); return terms.every((t) => text.includes(t)); }).slice(0, 100);
  }, [issued, applied]);

  const open = (doc, kind) => { setMessage(""); setError(""); setForm({ doc, kind, mode: "PARTIAL", amount: "", reason: "", issueDate: chileToday() }); };

  async function submit() {
    const { doc, kind } = form;
    if (form.reason.trim().length < 5) { setError("Escriba el motivo (al menos 5 caracteres)."); return; }
    if ((kind === "DEBIT_NOTE" || form.mode === "PARTIAL") && !(Number(form.amount) > 0)) { setError("Indique un monto mayor que cero."); return; }
    if (kind === "CREDIT_NOTE" && form.mode === "PARTIAL" && Number(form.amount) > creditable(doc)) { setError(`El monto supera lo disponible para acreditar (${money(creditable(doc))}).`); return; }
    setSaving(true); setError("");
    try {
      const path = kind === "CREDIT_NOTE" ? "credit-notes" : "debit-notes";
      const body = kind === "CREDIT_NOTE" ? { mode: form.mode, amount: form.mode === "TOTAL" ? undefined : Number(form.amount), reason: form.reason.trim(), issueDate: form.issueDate } : { amount: Number(form.amount), reason: form.reason.trim(), issueDate: form.issueDate };
      const r = await fetch(`/api/billing/documents/${doc.id}/${path}`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": `${kind.toLowerCase()}-${crypto.randomUUID()}` }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "No fue posible emitir la nota.");
      const label = kind === "CREDIT_NOTE" ? "Nota de crédito" : "Nota de débito";
      // La respuesta trae el id de la nota, no su folio: se consulta para mostrarlo.
      let folio = j.data?.folio || null;
      if (!folio && j.data?.documentId) { const d = await fetch(`/api/billing/documents/${j.data.documentId}`, { cache: "no-store" }).then((x) => x.json()).catch(() => ({})); folio = d.data?.folio || null; }
      setMessage(j.data?.status === "ISSUED" ? `✓ ${label} emitida${folio ? ` · folio ${folio}` : ""} sobre la factura ${doc.folio}.${j.data?.email?.status === "SENT" ? " Correo enviado." : ""}` : `${label} registrada sobre la factura ${doc.folio}: ${j.data?.status || "en proceso"}.`);
      setForm(null); setLoading(true); setReloadKey((k) => k + 1);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-[#041E42]">Buscar la factura</h3>
        <p className="mt-1 text-sm text-slate-600">Escriba cualquier dato: folio, RUT, razón social, monto, fecha (dd-mm-aaaa), período o contrato. Puede combinar varios, por ejemplo «5Q 122.712».</p>
        <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(query); }}>
          <div className="relative min-w-[260px] flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ej.: 204989 · 76540968-3 · Inmobiliaria · 73.626 · 08-11-2026" className={`${inputClass} pl-9`} autoFocus /></div>
          <button type="submit" className="rounded-xl bg-[#3150D8] px-5 py-2 text-sm font-bold text-white shadow-sm transition active:scale-95">Buscar</button>
          {applied ? <button type="button" onClick={() => { setQuery(""); setApplied(""); }} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">Limpiar</button> : null}
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={onlyReal} onChange={(e) => setOnlyReal(e.target.checked)} />Ocultar facturas simuladas</label>
        </form>
        {!loading ? <p role="status" className="mt-2 text-sm text-slate-500">{applied ? `${results.length} factura(s) encontrada(s) para «${applied}».` : `Últimas ${results.length} factura(s) emitidas.`} Solo se pueden corregir facturas emitidas.</p> : null}
      </section>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}

      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-[#3150D8] text-left text-white"><tr>{["Folio", "Fecha", "Cliente", "RUT", "Total", "Notas previas", "Saldo", "Proveedor", ""].map((h) => <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={9} className="p-4 text-slate-500">Cargando facturas…</td></tr> : null}
            {!loading && !results.length ? <tr><td colSpan={9} className="p-4 text-slate-500">No hay facturas emitidas que coincidan.</td></tr> : null}
            {!loading && results.map((d) => {
              const notes = (d.related || d.relatedDocuments || []).filter?.((x) => x.status === "ISSUED") || [];
              return [
                <tr key={d.id} className={`border-t ${form?.doc.id === d.id ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
                  <td className="px-3 py-2 font-bold">{d.folio}</td>
                  <td className="px-3 py-2">{dmy(d.invoice_date)}</td>
                  <td className="px-3 py-2">{client(d)}</td>
                  <td className="px-3 py-2">{rut(d)}</td>
                  <td className="px-3 py-2 text-right">{money(d.total_amount)}</td>
                  <td className="px-3 py-2 text-xs">{notes.length ? notes.map((n) => `${n.document_type === "CREDIT_NOTE" ? "NC" : "ND"} ${n.folio || ""} ${money(n.total_amount)}`).join(" · ") : "—"}</td>
                  <td className="px-3 py-2 text-right">{d.balance != null ? money(d.balance) : "—"}</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${d.provider === "haulmer" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"}`}>{PROVIDER[d.provider] || d.provider}</span></td>
                  <td className="whitespace-nowrap px-3 py-2">{creditable(d) <= 0 ? <span className="mr-2 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800" title="Ya fue acreditada por completo: no queda monto para otra nota de crédito">Anulada</span> : null}<button type="button" disabled={creditable(d) <= 0} title={creditable(d) <= 0 ? "Ya fue acreditada por completo" : ""} onClick={() => open(d, "CREDIT_NOTE")} className="mr-2 inline-flex items-center gap-1 rounded-lg bg-[#3150D8] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"><FileMinus2 className="h-3.5 w-3.5" />Nota de crédito</button><button type="button" onClick={() => open(d, "DEBIT_NOTE")} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold"><FilePlus2 className="h-3.5 w-3.5" />Nota de débito</button></td>
                </tr>,
                form?.doc.id === d.id ? (
                  <tr key={`${d.id}-form`} className="bg-indigo-50"><td colSpan={9} className="px-4 pb-4">
                    <div className="rounded-xl border border-indigo-200 bg-white p-4">
                      <h4 className="font-bold text-[#041E42]">{form.kind === "CREDIT_NOTE" ? "Nueva nota de crédito" : "Nueva nota de débito"} · factura {d.folio} · {client(d)} · {money(d.total_amount)}</h4>
                      <p className="mt-1 text-xs text-slate-500">{form.kind === "CREDIT_NOTE" ? "Total anula la factura completa; Parcial descuenta solo el monto indicado (con IVA incluido)." : "Cobra un monto adicional sobre esta factura (con IVA incluido)."} Se emite con el mismo proveedor de la factura.</p>
                      <p className="mt-2 rounded-lg bg-indigo-50 p-2 text-sm">{(d.related || []).filter((x) => x.status === "ISSUED").length ? <><b>Ya tiene:</b> {(d.related || []).filter((x) => x.status === "ISSUED").map((n) => `${n.document_type === "CREDIT_NOTE" ? "NC" : "ND"} ${n.folio || ""} ${n.correction_mode === "TOTAL" ? "(total) " : ""}${money(n.total_amount)}`).join(" · ")}<br /></> : <b>Sin notas previas. </b>}{form.kind === "CREDIT_NOTE" ? <b>Disponible para acreditar: {money(creditable(d))}</b> : "La nota de débito suma un cobro a esta factura."}</p>
                      <div className="mt-3 grid gap-3 md:grid-cols-4">
                        {form.kind === "CREDIT_NOTE" ? <label className="text-sm"><span className="font-semibold text-slate-700">Tipo</span><select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} className={`${inputClass} mt-1`}><option value="PARTIAL">Parcial</option><option value="TOTAL">Total (anula la factura)</option></select></label> : null}
                        {form.kind === "DEBIT_NOTE" || form.mode === "PARTIAL" ? <label className="text-sm"><span className="font-semibold text-slate-700">Monto total (CLP)</span><input type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={`${inputClass} mt-1`} /></label> : null}
                        <label className="text-sm"><span className="font-semibold text-slate-700">Fecha de emisión</span><input type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} className={`${inputClass} mt-1`} /></label>
                        <label className="text-sm md:col-span-4"><span className="font-semibold text-slate-700">Motivo (obligatorio)</span><input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} maxLength={300} placeholder={form.kind === "CREDIT_NOTE" ? "Ej.: Descuento por días sin servicio" : "Ej.: Cobro de servicio adicional no incluido"} className={`${inputClass} mt-1`} /></label>
                      </div>
                      <div className="mt-3 flex gap-2"><button type="button" disabled={saving} onClick={submit} className="rounded-xl bg-[#3150D8] px-5 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? "Emitiendo…" : form.kind === "CREDIT_NOTE" ? "Emitir nota de crédito" : "Emitir nota de débito"}</button><button type="button" disabled={saving} onClick={() => setForm(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">Cancelar</button></div>
                    </div>
                  </td></tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
