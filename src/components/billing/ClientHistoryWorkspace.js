"use client";
import { useEffect, useMemo, useState } from "react";
import { HISTORY_TYPES } from "@/lib/billing/clientHistoryCore.mjs";

// «Historial del cliente» (SOL-2026-11-05-005; prototipo aprobado por el usuario el 2026-11-09).
const ICONS = { pre: ["🧾", "#7C3AED"], fac: ["📄", "#3150D8"], nc: ["➖", "#DC2626"], nd: ["➕", "#EA580C"], pago: ["💵", "#16A34A"], mail: ["✉", "#0284C7"], sii: ["🏛", "#0F766E"], cambio: ["✎", "#64748B"] };
const TONES = { ok: "bg-emerald-100 text-emerald-800", warn: "bg-amber-100 text-amber-800", err: "bg-red-100 text-red-800", lock: "bg-slate-100 text-slate-600", info: "bg-blue-100 text-blue-800", violet: "bg-violet-100 text-violet-800" };
const money = (n) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));
const dmy = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("-") : "");
const hm = (iso) => (String(iso).length > 10 ? new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) : "");
const chileToday = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const inputClass = "rounded-xl border border-slate-300 px-3 py-2 text-sm";

function Chip({ tone, children }) { return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${TONES[tone] || TONES.lock}`}>{children}</span>; }
function Amount({ e }) {
  if (e.amount == null) return null;
  const cls = e.amount < 0 ? (e.type === "pago" ? "text-emerald-700" : "text-red-600") : "text-slate-900";
  return <span className={`whitespace-nowrap font-bold ${cls}`}>{e.amount < 0 ? "−" : "+"}{money(Math.abs(e.amount))}</span>;
}
function Icon({ type }) { const [ico, color] = ICONS[type] || ["•", "#64748B"]; return <span className="grid h-7 w-7 flex-none place-items-center rounded-lg text-sm text-white" style={{ background: color }}>{ico}</span>; }

export default function ClientHistoryWorkspace() {
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [view, setView] = useState("factura");
  const [period, setPeriod] = useState("all");
  const [types, setTypes] = useState(() => new Set(Object.keys(HISTORY_TYPES)));
  const [hideSimulated, setHideSimulated] = useState(true);
  const [open, setOpen] = useState(() => new Set());
  const [note, setNote] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetch("/api/billing/company-services", { cache: "no-store" }).then((r) => r.json()).then((b) => { if (active) setCompanies(b.data || []); }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!companyId) return undefined;
    let active = true;
    fetch(`/api/billing/history/${encodeURIComponent(companyId)}`, { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
      .then(({ ok, body }) => { if (!active) return; if (ok) { setData(body.data); setError(""); setOpen(new Set((body.data.invoices || []).slice(0, 2).map((i) => i.key))); } else setError(body.error || "No fue posible cargar el historial."); })
      .catch(() => { if (active) setError("No fue posible cargar el historial."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId, reloadKey]);

  const choose = (id) => { if (!id) return; setLoading(true); setData(null); setMessage(""); setPeriod("all"); setCompanyId(id); };
  const filteredCompanies = useMemo(() => { const q = search.trim().toLowerCase(); return companies.filter((c) => !q || c.name.toLowerCase().includes(q) || String(c.rut).includes(q)); }, [companies, search]);
  const periods = useMemo(() => [...new Set((data?.invoices || []).map((i) => i.date.slice(0, 7)).filter(Boolean))].sort().reverse(), [data]);
  const inPeriod = (value) => period === "all" || String(value).startsWith(period);
  const invoices = (data?.invoices || []).filter((i) => (!hideSimulated || !i.simulated) && inPeriod(i.date));
  const timeline = (data?.timeline || []).filter((e) => types.has(e.type) && inPeriod(e.at) && (!hideSimulated || !/MOCK-|simulada/i.test(`${e.invoiceFolio || ""} ${e.sub || ""}`)));
  const s = data?.summary;
  const toggleType = (t) => setTypes((cur) => { const n = new Set(cur); n.has(t) ? n.delete(t) : n.add(t); return n; });

  function exportCsv() {
    const rows = [["Fecha", "Tipo", "Detalle", "Factura", "Monto"], ...timeline.map((e) => [String(e.at).slice(0, 16).replace("T", " "), HISTORY_TYPES[e.type], `${e.title}${e.sub ? ` — ${e.sub}` : ""}`, e.invoiceFolio || "", e.amount ?? ""])];
    const csv = "﻿" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `cartola_${(data?.company.rut || "cliente").replace(/\W/g, "")}_${period}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {data ? <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#3150D8] text-lg font-extrabold text-white">{data.company.name[0]}</span><div><b className="block text-lg text-[#041E42]">{data.company.name}</b><small className="text-slate-500">{data.company.rut} · {s.invoices} factura(s){s.imported ? ` (${s.imported} importadas)` : ""}{data.company.email ? ` · ${data.company.email}` : ""}</small></div></div> : <p className="text-sm text-slate-600">Elija una empresa para ver todas sus transacciones.</p>}
        <div className="ml-auto flex flex-wrap gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar empresa o RUT…" className={inputClass} />
          <select value={companyId} onChange={(e) => choose(e.target.value)} className={`${inputClass} min-w-[260px]`}><option value="">Seleccione una empresa…</option>{filteredCompanies.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.rut}</option>)}</select>
        </div>
      </section>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Cargando historial…</p> : null}

      {data && !loading ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            {[["Facturado", money(s.invoiced), ""], ["Notas de crédito", `−${money(s.credited)}`, "text-red-600"], ["Notas de débito", `+${money(s.debited)}`, ""], ["Pagado", money(s.paid), "text-emerald-700"], ["Saldo pendiente", money(s.balance), s.balance ? "text-red-600" : "text-emerald-700"], ["Facturas vencidas", String(s.overdue), s.overdue ? "text-red-600" : ""]].map(([l, v, c]) => (
              <div key={l} className="rounded-2xl border border-slate-200 bg-white p-3"><p className="text-xs font-semibold text-slate-500">{l}</p><p className={`text-lg font-extrabold text-[#041E42] ${c}`}>{v}</p></div>
            ))}
          </div>
          <p className="-mt-2 text-xs text-slate-500">El resumen no incluye facturas simuladas{s.simulated ? ` (${s.simulated})` : ""}. Las importadas de EasyDoc o del SII suman a lo facturado, pero no al saldo: sus pagos no están registrados en ParkFacil.</p>

          <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
            <div className="flex rounded-full border border-slate-200 bg-slate-50 p-0.5">{[["factura", "Por factura"], ["tiempo", "Línea de tiempo"]].map(([k, l]) => <button key={k} type="button" onClick={() => setView(k)} className={`rounded-full px-3 py-1.5 text-sm font-bold ${view === k ? "bg-[#041E42] text-white" : "text-slate-500"}`}>{l}</button>)}</div>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-full border border-slate-300 px-3 py-1.5 text-sm"><option value="all">Todo el historial</option>{periods.map((p) => <option key={p} value={p}>{new Date(`${p}-15T12:00:00Z`).toLocaleDateString("es-CL", { month: "long", year: "numeric", timeZone: "UTC" })}</option>)}</select>
            {view === "tiempo" ? Object.entries(HISTORY_TYPES).map(([k, l]) => <button key={k} type="button" onClick={() => toggleType(k)} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${types.has(k) ? "text-white" : "bg-white text-slate-500"}`} style={types.has(k) ? { background: ICONS[k][1], borderColor: ICONS[k][1] } : undefined}>{ICONS[k][0]} {l}</button>) : null}
            <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" checked={hideSimulated} onChange={(e) => setHideSimulated(e.target.checked)} />Ocultar simuladas</label>
            <button type="button" onClick={exportCsv} className="ml-auto rounded-full border border-slate-300 px-3 py-1.5 text-sm font-semibold">⬇ Exportar cartola (CSV para Excel)</button>
          </section>

          {view === "factura" ? (
            <div className="space-y-3">
              {!invoices.length ? <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Sin facturas en el período.</p> : null}
              {invoices.map((inv) => {
                const isOpen = open.has(inv.key);
                const voided = inv.creditable === 0 && !inv.rejected;
                const ncBlocked = inv.rejected || inv.imported || inv.creditable === 0;
                const why = inv.rejected ? "No llegó al SII: no admite notas." : inv.imported ? "Emitida fuera de ParkFacil: la nota se emite en el sistema de origen." : inv.creditable === 0 ? "Ya fue acreditada por completo: no queda monto para otra nota de crédito." : "";
                const pct = inv.total ? Math.max(0, Math.min(100, Math.round((1 - inv.balance / Math.max(1, inv.total + inv.debited)) * 100))) : 0;
                return (
                  <article key={inv.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <button type="button" onClick={() => setOpen((cur) => { const n = new Set(cur); n.has(inv.key) ? n.delete(inv.key) : n.add(inv.key); return n; })} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left">
                      <div><span className={`text-base font-extrabold text-[#041E42] ${voided ? "line-through decoration-red-500" : ""}`}>{inv.folio ? `Factura ${inv.folio}` : "Factura sin folio"}</span> <Chip tone={inv.status.tone}>{inv.status.label}{inv.status.label === "Con nota de crédito parcial" ? ` · disponible ${money(inv.creditable)}` : inv.status.label === "Vencida" ? ` · saldo ${money(inv.balance)}` : ""}</Chip>
                        <p className="text-xs text-slate-500">{dmy(inv.date)} · {inv.origin}{inv.dueDate ? ` · vence ${dmy(inv.dueDate)}` : ""}{inv.sii ? ` · SII: ${inv.sii}` : ""}{inv.response ? ` · ${inv.response}` : ""}</p></div>
                      <div className="ml-auto text-right"><b className="block">{money(inv.total)}</b><small className="text-slate-500">{inv.imported ? "pagos no registrados" : `saldo ${money(inv.balance)}`}</small>
                        <div className="mt-1 h-1.5 w-44 overflow-hidden rounded-full bg-slate-200"><div className={inv.balance === 0 ? "h-full bg-emerald-600" : "h-full bg-[#3150D8]"} style={{ width: `${inv.rejected || inv.imported ? 0 : pct}%` }} /></div></div>
                    </button>
                    {isOpen ? (
                      <div className="border-t border-slate-200 bg-slate-50/60 px-4 pb-4 pt-1">
                        {inv.events.map((e, i) => (
                          <div key={i} className="grid grid-cols-[28px_110px_1fr_auto] items-start gap-3 border-b border-dashed border-slate-200 py-2 last:border-0">
                            <Icon type={e.type} /><span className="text-xs text-slate-500">{dmy(e.at)} {hm(e.at)}</span><span><b className="block text-sm">{e.title}</b>{e.sub ? <small className="text-slate-500">{e.sub}</small> : null}</span><Amount e={e} />
                          </div>
                        ))}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {inv.documentId && inv.provider === "haulmer" && !inv.rejected ? <a href={`/api/billing/documents/${inv.documentId}/provider?value=pdf`} target="_blank" rel="noopener" className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-bold">Ver PDF</a> : null}
                          {inv.registryId && inv.providerToken ? <a href={`/api/billing/dte-registry/${inv.registryId}/pdf`} target="_blank" rel="noopener" className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-bold">Ver PDF</a> : null}
                          <button type="button" disabled={ncBlocked} onClick={() => setNote({ inv, kind: "CREDIT_NOTE", mode: "PARTIAL", amount: "", reason: "", issueDate: chileToday() })} className="rounded-full bg-[#3150D8] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">➖ Nota de crédito</button>
                          <button type="button" disabled={inv.rejected || inv.imported} onClick={() => setNote({ inv, kind: "DEBIT_NOTE", amount: "", reason: "", issueDate: chileToday() })} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-bold disabled:opacity-40">➕ Nota de débito</button>
                          {why ? <span className="text-xs font-semibold text-red-600">{why}</span> : null}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              {!timeline.length ? <p className="text-sm text-slate-500">Sin transacciones en el período.</p> : null}
              {timeline.map((e, i) => {
                const month = String(e.at).slice(0, 7);
                const showMonth = i === 0 || String(timeline[i - 1].at).slice(0, 7) !== month;
                return (
                  <div key={i}>
                    {showMonth ? <p className="mb-1 mt-3 text-xs font-extrabold uppercase tracking-wider text-slate-500">{month ? new Date(`${month}-15T12:00:00Z`).toLocaleDateString("es-CL", { month: "long", year: "numeric", timeZone: "UTC" }) : "Sin fecha"}</p> : null}
                    <div className="mb-2 grid grid-cols-[28px_100px_1fr_auto] items-start gap-3 rounded-xl border border-slate-200 px-3 py-2">
                      <Icon type={e.type} /><span className="text-xs text-slate-500">{dmy(e.at)}<br />{hm(e.at)}</span>
                      <span><b className="text-sm">{e.title}</b>{e.sub ? <><br /><small className="text-slate-500">{e.sub}</small></> : null}{e.invoiceFolio ? <> <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">Factura {e.invoiceFolio}</span></> : null}</span><Amount e={e} />
                    </div>
                  </div>
                );
              })}
            </section>
          )}
        </>
      ) : null}

      {note ? <NoteModal note={note} setNote={setNote} onDone={(msg) => { setNote(null); setMessage(msg); setLoading(true); setReloadKey((k) => k + 1); }} /> : null}
    </div>
  );
}

function NoteModal({ note, setNote, onDone }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { inv, kind } = note;
  const credit = kind === "CREDIT_NOTE";
  const amount = Number(note.amount || 0);
  const over = credit && note.mode === "PARTIAL" && amount > inv.creditable;
  async function submit() {
    if (note.reason.trim().length < 5) { setError("Escriba el motivo (al menos 5 caracteres)."); return; }
    if ((!credit || note.mode === "PARTIAL") && !(amount > 0)) { setError("Indique un monto mayor que cero."); return; }
    if (over) return;
    setSaving(true); setError("");
    try {
      const body = credit ? { mode: note.mode, amount: note.mode === "TOTAL" ? undefined : amount, reason: note.reason.trim(), issueDate: note.issueDate } : { amount, reason: note.reason.trim(), issueDate: note.issueDate };
      const r = await fetch(`/api/billing/documents/${inv.documentId}/${credit ? "credit-notes" : "debit-notes"}`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": `${kind.toLowerCase()}-${crypto.randomUUID()}` }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "No fue posible emitir la nota.");
      onDone(`${credit ? "Nota de crédito" : "Nota de débito"} ${j.data?.status === "ISSUED" ? "emitida" : "registrada"} sobre la factura ${inv.folio}${j.data?.email?.status === "SENT" ? "; correo enviado" : ""}.`);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#041E42]/45 p-4">
      <div className="w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl">
        <h3 className="text-lg font-bold text-[#041E42]">{credit ? "Nueva nota de crédito" : "Nueva nota de débito"} · factura {inv.folio}</h3>
        <p className="text-sm text-slate-500">{money(inv.total)} · {dmy(inv.date)}</p>
        <div className="my-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm">
          {inv.notes.length ? <p><b>Ya tiene:</b> {inv.notes.map((n) => `${n.type === "CREDIT_NOTE" ? "NC" : "ND"} ${n.folio || ""} ${n.mode === "TOTAL" ? "(total) " : ""}${money(n.amount)}`).join(" · ")}</p> : <p><b>Sin notas previas.</b></p>}
          {credit ? <p><b>Disponible para acreditar: {money(inv.creditable)}</b></p> : <p>La nota de débito suma un cobro a esta factura.</p>}
        </div>
        {error ? <p className="mb-2 rounded-xl bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}
        <div className="grid gap-3 md:grid-cols-2">
          {credit ? <label className="text-sm"><span className="font-semibold text-slate-700">Tipo</span><select value={note.mode} onChange={(e) => setNote({ ...note, mode: e.target.value })} className={`${inputClass} mt-1 w-full`}><option value="PARTIAL">Parcial</option><option value="TOTAL">Total (acredita lo disponible: {money(inv.creditable)})</option></select></label> : null}
          {!credit || note.mode === "PARTIAL" ? <label className="text-sm"><span className="font-semibold text-slate-700">Monto con IVA (CLP)</span><input type="number" min="1" value={note.amount} onChange={(e) => setNote({ ...note, amount: e.target.value })} className={`${inputClass} mt-1 w-full ${over ? "border-red-500 bg-red-50" : ""}`} />{over ? <span className="text-xs font-semibold text-red-600">Supera lo disponible ({money(inv.creditable)}).</span> : null}</label> : null}
          <label className="text-sm"><span className="font-semibold text-slate-700">Fecha de emisión</span><input type="date" value={note.issueDate} onChange={(e) => setNote({ ...note, issueDate: e.target.value })} className={`${inputClass} mt-1 w-full`} /></label>
          <label className="text-sm md:col-span-2"><span className="font-semibold text-slate-700">Motivo (obligatorio)</span><input value={note.reason} onChange={(e) => setNote({ ...note, reason: e.target.value })} maxLength={300} className={`${inputClass} mt-1 w-full`} placeholder={credit ? "Ej.: Descuento por días sin servicio" : "Ej.: Cobro adicional"} /></label>
        </div>
        <div className="mt-4 flex gap-2"><button type="button" disabled={saving || over} onClick={submit} className="rounded-full bg-[#3150D8] px-5 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? "Emitiendo…" : credit ? "Emitir nota de crédito" : "Emitir nota de débito"}</button><button type="button" disabled={saving} onClick={() => setNote(null)} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold">Cancelar</button></div>
      </div>
    </div>
  );
}
