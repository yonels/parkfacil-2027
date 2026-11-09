"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { forgetCycleReturn, readCycleReturn, rememberCycleReturn } from "./cycleReturnStore";
import FoliosPanel from "./FoliosPanel";
import { CYCLE_ROLES, CYCLE_RUNS, CYCLE_STEPS, CYCLE_USES, FIXED_REQUIRED, NOT_AVAILABLE } from "@/lib/billing/billingCycleCore.mjs";

// «Ciclo de facturación» por etapas (SOL-2026-11-05-005; prototipo aprobado por el usuario el 2026-11-08).
// Árbol del mes (empresas con sus etapas), etapa actual de cada una, avance en lote y configuración de etapas.
const COLORS = { datos: "#3150D8", servicios: "#0891B2", prefactura: "#7C3AED", revision: "#EA580C", aprobacion: "#DB2777", emision: "#0F766E", envio: "#0284C7", cobro: "#16A34A" };
const MNEMO = {
  datos: "RUT · Razón social · Giro · Dirección · Correo — «R-R-G-D-C». Un RUT con dígito verificador malo hace que el SII rechace la factura.",
  servicios: "Cada servicio necesita precio y IVA definido (afecto o exento) en el catálogo. Sin IVA definido, no avanza.",
  prefactura: "Se calcula con la UF del Banco Central del día. Neto + IVA 19 % = total en pesos.",
  revision: "Aquí se agregan servicios extra, descuentos y observaciones (en la prefactura). Si no hay cambios: «Sin cambios, continuar».",
  aprobacion: "Aprobar congela la prefactura: después ya no se edita. Revise total y cliente antes de aprobar.",
  emision: "El proveedor asigna el folio y entrega el PDF. Si rechaza: se descarta, se corrige el dato y se vuelve a emitir.",
  envio: "Correo con PDF al cliente · Estado SII · Respuesta del cliente (Otorga recibo, o Aceptado x omisión a los 8 días).",
  cobro: "Cuenta corriente, pago y conciliación. Etapa F3: aún no desarrollada.",
};
const LOGOS = ["#3150D8", "#0891B2", "#7C3AED", "#EA580C", "#DB2777", "#0F766E"];
const money = (value, currency = "CLP") => (currency === "UF" ? `UF ${Number(value || 0).toLocaleString("es-CL", { maximumFractionDigits: 4 })}` : new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Number(value) || 0));
const chileToday = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const monthLabel = (period) => { const [y, m] = period.split("-").map(Number); return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("es-CL", { month: "long", year: "numeric", timeZone: "UTC" }); };
const shiftPeriod = (period, delta) => { const [y, m] = period.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + delta, 1)); return d.toISOString().slice(0, 7); };
const inputClass = "w-full rounded-xl border border-slate-300 px-3 py-2 text-sm";

async function api(url, options) {
  const response = await fetch(url, { cache: "no-store", ...options, headers: { "content-type": "application/json", ...(options?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "No fue posible completar la operación.");
  return body.data;
}

// Enlaces a la factura para emitir una nota de crédito o débito, con retorno al ciclo.
function NoteLinks({ row, period }) {
  if (row.invoice?.status !== "ISSUED") return null;
  const go = (noteKind) => rememberCycleReturn({ companyId: row.company.id, companyName: row.company.name, period, step: "emision", stepN: 6, stepShort: "Emisión", preinvoiceId: row.preinvoice?.id || null, documentId: row.invoice.id, noteKind });
  return (
    <span className="mt-3 block text-sm text-slate-600">¿Hay que corregir esta factura? <a href="/facturacion#facturas" onClick={() => go("CREDIT_NOTE")} className="font-semibold text-[#3150D8] underline">Emitir nota de crédito</a> · <a href="/facturacion#facturas" onClick={() => go("DEBIT_NOTE")} className="font-semibold text-[#3150D8] underline">Emitir nota de débito</a></span>
  );
}

function Chip({ tone, children }) {
  const tones = { ok: "bg-emerald-100 text-emerald-800", warn: "bg-amber-100 text-amber-800", err: "bg-red-100 text-red-800", lock: "bg-slate-100 text-slate-500", info: "bg-blue-100 text-blue-800" };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${tones[tone] || tones.lock}`}>{children}</span>;
}

function Dots({ steps }) {
  return (
    <span className="mt-1.5 flex gap-1" aria-hidden="true">
      {steps.map((s) => (
        <i key={s.key} title={`${s.n}. ${s.name}`} style={s.state === "cur" || s.state === "wait" ? { background: COLORS[s.key] } : undefined}
          className={`grid h-4 w-4 place-items-center rounded-[5px] text-[9px] font-extrabold not-italic text-white ${s.state === "ok" ? "bg-emerald-600" : s.state === "err" ? "bg-red-600" : s.state === "off" ? "bg-[repeating-linear-gradient(45deg,#E2E8F0_0_3px,#F8FAFC_3px_6px)]" : s.state === "cur" || s.state === "wait" ? "ring-2 ring-white ring-offset-1" : "bg-slate-200"}`}>
          {s.state === "ok" ? "✓" : s.state === "err" ? "!" : ""}
        </i>
      ))}
    </span>
  );
}

export default function BillingCycleWorkspace() {
  // Al volver desde una pantalla de detalle abierta desde una etapa, se retoma la misma empresa y período.
  const [initialReturn] = useState(() => (typeof window === "undefined" ? null : readCycleReturn()));
  const [period, setPeriod] = useState(() => initialReturn?.period || chileToday().slice(0, 7));
  const [tab, setTab] = useState("ciclo");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState(() => initialReturn?.companyId || null);
  useEffect(() => { if (initialReturn) forgetCycleReturn(); }, [initialReturn]);
  const [viewing, setViewing] = useState(null);
  const [filterStage, setFilterStage] = useState(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [lote, setLote] = useState(null);

  const load = useCallback(async (target) => {
    const result = await api(`/api/billing/cycle?period=${target}`);
    setData(result); setError("");
    setSelected((current) => (current && result.rows.some((r) => r.company.id === current) ? current : result.rows[0]?.company.id || null));
  }, []);

  useEffect(() => {
    let active = true;
    api(`/api/billing/cycle?period=${period}`)
      .then((result) => { if (!active) return; setData(result); setError(""); setSelected((current) => (current && result.rows.some((r) => r.company.id === current) ? current : result.rows[0]?.company.id || null)); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [period]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.rows || []).filter((r) => (!filterStage || r.stage === filterStage) && (!q || r.company.name.toLowerCase().includes(q) || r.company.rut.includes(q)));
  }, [data, filterStage, search]);
  const row = (data?.rows || []).find((r) => r.company.id === selected) || null;

  async function runStep(step, extra = {}) {
    setBusy(true); setMessage(""); setError("");
    try {
      const result = await api("/api/billing/cycle/step", { method: "POST", body: JSON.stringify({ companyId: row.company.id, period, step, ...extra }) });
      const next = result.row;
      setMessage(next.finished ? "Ciclo del mes terminado para esta empresa." : `Guardado. Etapa actual: ${next.steps.find((s) => s.n === next.stage)?.short}.${result.warnings?.length ? ` ${result.warnings.join(" ")}` : ""}`);
      setViewing(null);
      await load(period);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  const changePeriod = (delta) => { setLoading(true); setFilterStage(null); setViewing(null); setPeriod((p) => shiftPeriod(p, delta)); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1">
          <button type="button" onClick={() => changePeriod(-1)} className="rounded-full px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-100" aria-label="Mes anterior">‹</button>
          <span className="px-2 text-sm font-bold capitalize text-[#041E42]">{monthLabel(period)}</span>
          <button type="button" onClick={() => changePeriod(1)} className="rounded-full px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-100" aria-label="Mes siguiente">›</button>
        </div>
        <div className="ml-auto flex gap-2">
          <button type="button" disabled={!data || busy} onClick={() => setLote({ selected: new Set((data?.rows || []).filter((r) => r.stage <= 6 && !r.problem).map((r) => r.company.id)), invoiceDate: chileToday(), result: null })} className="rounded-full bg-[#0F766E] px-4 py-2 text-sm font-bold text-white shadow disabled:opacity-50">⚡ Facturar en lote</button>
          <div className="flex gap-1 rounded-full border border-slate-200 bg-white p-1">
            {[["ciclo", "Ciclo del mes"], ["config", "Configurar etapas"]].map(([key, label]) => <button key={key} type="button" onClick={() => setTab(key)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === key ? "bg-[#041E42] text-white" : "text-slate-600"}`}>{label}</button>)}
          </div>
        </div>
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
      <FoliosPanel variant="alert" />

      {tab === "config" ? <CycleConfig onSaved={() => load(period)} /> : loading && !data ? <p className="text-sm text-slate-500">Cargando…</p> : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[["Empresas en el ciclo", data.rows.length], ["Listas para emitir", data.rows.filter((r) => r.stage === 6 && !r.problem).length], ["Emitidas", data.rows.filter((r) => r.stage > 6).length], ["Terminadas", data.funnel[9]], ["Con problema", data.rows.filter((r) => r.problem).length]].map(([label, value], i) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-3"><p className="text-xs font-semibold text-slate-500">{label}</p><p className={`text-xl font-extrabold ${i === 4 && value ? "text-red-600" : "text-[#041E42]"}`}>{value}</p></div>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-3">
            {CYCLE_STEPS.map((s) => {
              const off = data.config[s.key]?.use === "off";
              return <button key={s.key} type="button" disabled={off} onClick={() => setFilterStage(filterStage === s.n ? null : s.n)} className={`min-w-[104px] flex-1 rounded-xl border p-2 text-center ${filterStage === s.n ? "bg-white shadow" : "bg-slate-50"} ${off ? "opacity-40" : ""}`} style={filterStage === s.n ? { outline: `3px solid ${COLORS[s.key]}` } : undefined}>
                <p className="text-xl font-extrabold" style={{ color: COLORS[s.key] }}>{off ? "–" : data.funnel[s.n]}</p><p className="text-xs font-semibold text-slate-700">{s.n}. {s.short}{off ? " (omitida)" : ""}</p></button>;
            })}
            <button type="button" onClick={() => setFilterStage(filterStage === 9 ? null : 9)} className={`min-w-[104px] flex-1 rounded-xl border p-2 text-center ${filterStage === 9 ? "bg-white shadow outline outline-[3px] outline-emerald-600" : "bg-slate-50"}`}><p className="text-xl font-extrabold text-emerald-600">{data.funnel[9]}</p><p className="text-xs font-semibold text-slate-700">✓ Terminadas</p></button>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-[340px_1fr]">
            <section className="rounded-2xl border border-slate-200 bg-white p-3">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar empresa o RUT…" className="mb-2 w-full rounded-full border border-slate-300 px-4 py-2 text-sm" />
              <p className="mx-1 mb-1 text-xs font-extrabold uppercase tracking-wider text-slate-500">{monthLabel(period)} · {filterStage ? (filterStage === 9 ? "terminadas" : `en ${CYCLE_STEPS[filterStage - 1].short.toLowerCase()}`) : "todas las etapas"}</p>
              <div className="max-h-[620px] space-y-1 overflow-y-auto">
                {rows.map((r, i) => (
                  <button key={r.company.id} type="button" onClick={() => { setSelected(r.company.id); setViewing(null); setMessage(""); }} className={`flex w-full items-start gap-3 rounded-xl border p-2.5 text-left ${selected === r.company.id ? "border-indigo-200 bg-indigo-50" : "border-transparent hover:bg-slate-50"}`}>
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-xl font-extrabold text-white" style={{ background: LOGOS[i % LOGOS.length] }}>{r.company.name[0]}</span>
                    <span className="min-w-0"><b className="block truncate text-sm">{r.company.name}</b>
                      <small className="text-slate-500">{r.company.rut} · {r.problem ? <span className="font-bold text-red-600">Problema en {CYCLE_STEPS[r.stage - 1]?.short}</span> : r.finished ? "Terminada" : `Etapa ${r.stage}: ${CYCLE_STEPS[r.stage - 1]?.short}`}</small>
                      <Dots steps={r.steps} /></span>
                  </button>
                ))}
                {!rows.length ? <p className="p-3 text-sm text-slate-500">Sin empresas en esta etapa.</p> : null}
              </div>
            </section>
            {row ? <CycleDetail row={row} period={period} viewing={viewing} setViewing={setViewing} busy={busy} runStep={runStep} reload={() => load(period)} setError={setError} setMessage={setMessage} /> : <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No hay empresas cliente.</section>}
          </div>
        </>
      ) : null}

      {lote ? <BatchModal lote={lote} setLote={setLote} data={data} period={period} onDone={() => load(period)} /> : null}
    </div>
  );
}

function CycleDetail({ row, period, viewing, setViewing, busy, runStep, reload, setError, setMessage }) {
  const current = row.steps.find((s) => s.n === row.stage) || null;
  const shown = viewing ? row.steps.find((s) => s.n === viewing) : current;
  const enabled = row.steps.filter((s) => s.state !== "off").length;
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-gradient-to-r from-indigo-50/60 to-white px-5 py-4">
        <div><h3 className="text-lg font-bold text-[#041E42]">{row.company.name}</h3><p className="text-xs text-slate-500">{row.company.rut} · <span className="capitalize">{monthLabel(period)}</span> · {row.finished ? "Ciclo terminado" : `Etapa ${row.stage} de ${enabled}`}</p>
          <div className="mt-1.5 h-2 w-56 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-gradient-to-r from-[#3150D8] to-[#7C3AED]" style={{ width: `${row.progress}%` }} /></div></div>
        <span className="ml-auto">{row.problem ? <Chip tone="err">! Requiere corrección</Chip> : row.finished ? <Chip tone="ok">✓ Terminado</Chip> : <Chip tone="warn">En {current?.short.toLowerCase()}</Chip>}</span>
      </div>
      <div className="flex overflow-x-auto border-b border-slate-200 px-3 py-3">
        {row.steps.map((s) => {
          const clickable = s.state === "ok" || s.n === row.stage;
          return (
            <button key={s.key} type="button" disabled={!clickable} onClick={() => setViewing(s.n === row.stage ? null : s.n)} title={s.state === "lock" ? `Bloqueada: complete primero «${current?.short}»` : s.name} className="relative flex min-w-[84px] flex-1 flex-col items-center disabled:cursor-not-allowed">
              <span className={`z-10 grid h-9 w-9 place-items-center rounded-full border-[3px] border-white text-sm font-extrabold shadow-[0_0_0_1px_#E2E8F0] ${s.state === "ok" ? "bg-emerald-600 text-white" : s.state === "err" ? "bg-red-600 text-white" : s.state === "cur" || s.state === "wait" ? "text-white" : "bg-slate-100 text-slate-400"}`} style={s.state === "cur" || s.state === "wait" ? { background: COLORS[s.key] } : undefined}>
                {s.state === "ok" ? "✓" : s.state === "err" ? "!" : s.state === "lock" ? "🔒" : s.state === "off" ? "–" : s.n}</span>
              <span className={`mt-1 text-[11.5px] font-bold ${viewing === s.n ? "text-[#3150D8] underline" : "text-slate-700"}`}>{s.short}</span>
            </button>
          );
        })}
      </div>
      {row.finished && !viewing ? <div className="p-5"><p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">✓ Ciclo del mes terminado. Factura folio {row.invoice?.folio || "—"} · {money(row.invoice?.total)}.</p><NoteLinks row={row} period={period} /></div>
        : shown ? <StepPanel key={`${row.company.id}-${shown.key}`} row={row} period={period} step={shown} readOnly={Boolean(viewing) && viewing !== row.stage} busy={busy} runStep={runStep} backToCurrent={() => setViewing(null)} reload={reload} setError={setError} setMessage={setMessage} /> : null}
    </section>
  );
}

function StepPanel({ row, period, step, readOnly, busy, runStep, backToCurrent, reload, setError, setMessage }) {
  const color = COLORS[step.key];
  const [customer, setCustomer] = useState(() => ({ rut: row.company.rut, businessName: row.company.name, businessActivity: row.company.businessActivity, address: row.company.address, district: row.company.district, city: row.company.city, email: row.company.email }));
  const [invoiceDate, setInvoiceDate] = useState(chileToday());
  const [discardReason, setDiscardReason] = useState("");
  const pre = row.preinvoice;
  const inv = row.invoice;
  // Recuerda empresa, período y etapa antes de abrir una pantalla de detalle (barra «Volver al ciclo»).
  const goDetail = () => rememberCycleReturn({ companyId: row.company.id, companyName: row.company.name, period, step: step.key, stepN: step.n, stepShort: step.short, preinvoiceId: pre?.id || null });
  const issued = inv?.status === "ISSUED";
  const field = (key, label) => <label className="block text-sm"><span className="font-semibold text-slate-700">{label}</span><input value={customer[key] || ""} onChange={(e) => setCustomer((c) => ({ ...c, [key]: e.target.value }))} disabled={readOnly && issued} className={`${inputClass} mt-1`} /></label>;

  async function discard() {
    setError(""); setMessage("");
    try {
      await api(`/api/billing/documents/${inv.id}/discard`, { method: "POST", body: JSON.stringify({ reason: discardReason }) });
      setMessage("Documento descartado: la prefactura volvió a revisión. Corrija el dato y continúe."); setDiscardReason(""); await reload();
    } catch (err) { setError(err.message); }
  }

  let body = null;
  let action = null;
  switch (step.key) {
    case "datos":
      body = <div className="grid gap-3 md:grid-cols-2">{field("rut", "RUT")}{field("businessName", "Razón social")}{field("businessActivity", "Giro")}{field("email", "Correo de facturación")}{field("address", "Dirección")}{field("district", "Comuna")}{field("city", "Ciudad")}</div>;
      action = { label: readOnly ? "Guardar cambios" : "Guardar y continuar", run: () => runStep("datos", { payload: { customer } }), hide: readOnly && issued };
      break;
    case "servicios":
      body = <div className="space-y-2 text-sm"><p><b>{row.services.active}</b> servicio(s) activo(s) en el período{row.services.untaxed ? <> · <b className="text-red-600">{row.services.untaxed} sin IVA definido</b></> : null}.</p><a onClick={goDetail} href="/facturacion#servicios" className="font-semibold text-[#3150D8] underline">Editar servicios de la empresa</a>{row.services.untaxed ? <> · <a onClick={goDetail} href="/facturacion#catalogo" className="font-semibold text-[#3150D8] underline">Definir IVA en el catálogo</a></> : null}</div>;
      action = { label: "Confirmar servicios", run: () => runStep("servicios") };
      break;
    case "prefactura":
      body = pre ? <p className="text-sm">Prefactura <b>{pre.number}</b> · total {money(pre.total, pre.currency)} + conversión a pesos con la UF del día de emisión.</p> : <p className="text-sm text-slate-600">Aún no se calcula la prefactura del mes.</p>;
      action = { label: "Calcular prefactura", run: () => runStep("prefactura") };
      break;
    case "revision":
      body = <div className="space-y-2 text-sm">{pre ? <p>Prefactura <b>{pre.number}</b>: neto {money(pre.net, pre.currency)} · IVA {money(pre.tax, pre.currency)} · total <b>{money(pre.total, pre.currency)}</b>.</p> : null}<a onClick={goDetail} href="/facturacion#prefacturacion" className="font-semibold text-[#3150D8] underline">Abrir la prefactura para agregar servicios extra, descuentos u observaciones</a></div>;
      action = { label: "Revisada, continuar", run: () => runStep("revision") };
      break;
    case "aprobacion":
      body = <div className="space-y-1 text-sm">{pre ? <p className="text-base">Total: <b>{money(pre.total, pre.currency)}</b> <span className="text-slate-500">(neto {money(pre.net, pre.currency)} + IVA {money(pre.tax, pre.currency)})</span></p> : null}<p>☑ Cliente con datos tributarios completos</p><p>☑ Servicios con IVA definido</p><p className="text-slate-500">Al aprobar, la prefactura ya no se puede editar.</p></div>;
      action = { label: "Aprobar", run: () => runStep("aprobacion") };
      break;
    case "emision":
      body = issued ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">✓ Factura emitida · folio <b>{inv.folio}</b> · {money(inv.total)}{inv.provider === "haulmer" ? <> · <a href={`/api/billing/documents/${inv.id}/provider?value=pdf`} target="_blank" rel="noopener" className="underline">Ver PDF</a></> : null}<NoteLinks row={row} period={period} /></p>
        : inv && ["PROVIDER_REJECTED", "ISSUE_ERROR"].includes(inv.status) && !inv.folio ? (
          <div className="space-y-2 text-sm"><p className="rounded-xl bg-red-50 p-3 text-red-800">{step.problem || "La factura no se emitió."}</p>
            <label className="block"><span className="font-semibold text-slate-700">Motivo del descarte</span><input value={discardReason} onChange={(e) => setDiscardReason(e.target.value)} placeholder="Ej.: RUT del cliente con dígito verificador incorrecto" className={`${inputClass} mt-1`} /></label>
            <button type="button" disabled={discardReason.trim().length < 5} onClick={discard} className="rounded-full bg-red-600 px-4 py-2 font-bold text-white disabled:opacity-50">Descartar documento rechazado</button></div>)
        : <label className="block max-w-xs text-sm"><span className="font-semibold text-slate-700">Fecha de emisión</span><input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={`${inputClass} mt-1`} /></label>;
      action = { label: "Emitir factura", run: () => runStep("emision", { invoiceDate }), hide: issued || Boolean(inv && ["PROVIDER_REJECTED", "ISSUE_ERROR"].includes(inv.status)) || step.state === "wait" };
      break;
    case "envio":
      body = <div className="space-y-1 text-sm"><p>{inv?.emailStatus === "SENT" ? `✓ Correo con PDF enviado a ${inv.emailTo}` : inv?.emailStatus === "FAILED" ? `✗ Correo no enviado: ${inv.emailError || "error"}` : inv?.emailStatus === "SKIPPED" ? "Correo omitido." : "Correo pendiente."}</p><p className="text-slate-500">El estado SII y la respuesta del cliente se ven en «Documentos SII».</p></div>;
      action = { label: inv?.emailStatus === "FAILED" ? "Reintentar envío" : "Enviar correo", run: () => runStep("envio"), secondary: { label: "Marcar como enviada", run: () => runStep("envio", { payload: { confirmOnly: true } }) } };
      break;
    default:
      body = <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-600">Etapa F3 (Pagos y Cobranza): aún no desarrollada.</p>;
  }

  return (
    <div className="p-5">
      <h4 className="flex items-center gap-2 text-lg font-bold text-[#041E42]"><span className="grid h-7 w-7 place-items-center rounded-full text-sm text-white" style={{ background: color }}>{step.n}</span>{step.name}{step.use === "opt" ? <Chip tone="lock">Opcional</Chip> : null}{step.run === "auto" ? <Chip tone="ok">Automática</Chip> : null}</h4>
      <p className="mb-3 text-sm text-slate-500">{step.question}</p>
      <div className="mb-4 flex gap-3 rounded-xl border border-dashed p-3 text-sm" style={{ borderColor: color, background: `${color}0D` }}><span className="text-lg">💡</span><span>{MNEMO[step.key]}</span></div>
      {step.problem && !readOnly && step.key !== "emision" ? <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">⚠ {step.problem}</p> : null}
      {step.waiting ? <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{step.waiting}</p> : null}
      {readOnly ? <p className="mb-3 rounded-xl bg-slate-100 p-3 text-sm text-slate-600">{issued && step.n < 6 ? `🔒 La factura ya se emitió (folio ${inv.folio}): esta etapa queda solo de consulta. Para corregir montos se usa una nota de crédito.` : "Etapa completada. Puede revisarla; la etapa actual sigue siendo la misma."}</p> : null}
      {body}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
        <div>{readOnly ? <button type="button" onClick={backToCurrent} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold">Volver a la etapa actual</button> : null}</div>
        <div className="flex gap-2">
          {!readOnly && action?.secondary ? <button type="button" disabled={busy} onClick={action.secondary.run} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">{action.secondary.label}</button> : null}
          {action && !action.hide && (!readOnly || step.key === "datos") && step.key !== "cobro" ? <button type="button" disabled={busy || (step.state === "err" && step.key !== "datos")} onClick={action.run} className="rounded-full px-5 py-2 text-sm font-bold text-white shadow disabled:opacity-50" style={{ background: color }}>{busy ? "Procesando…" : `${action.label} →`}</button> : null}
        </div>
      </div>
    </div>
  );
}

function BatchModal({ lote, setLote, data, period, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const elegibles = (data?.rows || []).filter((r) => r.stage <= 6);
  const toggle = (id) => setLote((l) => { const s = new Set(l.selected); s.has(id) ? s.delete(id) : s.add(id); return { ...l, selected: s }; });
  async function run() {
    setBusy(true); setError("");
    try { const result = await api("/api/billing/cycle/batch", { method: "POST", body: JSON.stringify({ companyIds: [...lote.selected], period, invoiceDate: lote.invoiceDate }) }); setLote((l) => ({ ...l, result })); await onDone(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#041E42]/45 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start gap-3 border-b border-slate-200 p-5"><div><h3 className="text-xl font-bold text-[#041E42]">⚡ Facturar en lote · <span className="capitalize">{monthLabel(period)}</span></h3><p className="text-sm text-slate-500">Lleva cada empresa marcada desde su etapa actual hasta la emisión, en orden y sin saltarse etapas. Las que tengan un problema se detienen y se informan.</p></div><button type="button" disabled={busy} onClick={() => setLote(null)} className="ml-auto rounded-full border border-slate-300 px-3 py-1 text-sm">✕</button></div>
        <div className="p-5">
          {error ? <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          {!lote.result ? <div className="mb-3"><FoliosPanel variant="alert" /></div> : null}
          {lote.result ? (
            <>
              <p className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">✓ {lote.result.issued} factura(s) emitida(s). {lote.result.stopped ? `${lote.result.stopped} detenida(s) por un problema.` : ""}</p>
              <table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-slate-500"><th className="p-2">Empresa</th><th className="p-2">Resultado</th><th className="p-2 text-right">Folio</th><th className="p-2 text-right">Total</th></tr></thead><tbody>
                {lote.result.results.map((r) => <tr key={r.companyId} className="border-t"><td className="p-2">{r.name}</td><td className="p-2">{r.ok ? (r.skipped ? <Chip tone="lock">{r.skipped}</Chip> : <Chip tone="ok">Emitida{r.emailStatus === "SENT" ? " y enviada" : ""}</Chip>) : <><Chip tone="err">Detenida en {r.stoppedAt || "—"}</Chip><p className="mt-1 text-xs text-red-700">{r.error}</p></>}</td><td className="p-2 text-right">{r.folio || "—"}</td><td className="p-2 text-right">{r.total != null && r.folio ? money(r.total) : "—"}</td></tr>)}
              </tbody></table>
              <div className="mt-4 text-right"><button type="button" onClick={() => setLote(null)} className="rounded-full bg-[#3150D8] px-5 py-2 font-bold text-white">Listo</button></div>
            </>
          ) : (
            <>
              <label className="block max-w-xs text-sm"><span className="font-semibold text-slate-700">Fecha de emisión</span><input type="date" value={lote.invoiceDate} onChange={(e) => setLote((l) => ({ ...l, invoiceDate: e.target.value }))} className={`${inputClass} mt-1`} /></label>
              <table className="mt-4 w-full text-sm"><thead><tr className="text-left text-xs uppercase text-slate-500"><th className="p-2" /><th className="p-2">Empresa</th><th className="p-2">Etapa actual</th><th className="p-2">Etapas que se ejecutarán</th></tr></thead><tbody>
                {elegibles.map((r) => <tr key={r.company.id} className="border-t"><td className="p-2"><input type="checkbox" checked={lote.selected.has(r.company.id)} onChange={() => toggle(r.company.id)} /></td><td className="p-2"><b>{r.company.name}</b><p className="text-xs text-slate-500">{r.company.rut}</p></td>
                  <td className="p-2">{r.problem ? <Chip tone="err">! {CYCLE_STEPS[r.stage - 1].short}</Chip> : <Chip tone="warn">{CYCLE_STEPS[r.stage - 1].short}</Chip>}{r.problem ? <p className="mt-1 max-w-[220px] text-xs text-red-700">{r.problem}</p> : null}</td>
                  <td className="p-2 text-xs">{r.steps.filter((s) => s.n >= r.stage && s.n <= 6 && s.state !== "off").map((s) => s.short).join(" → ")}</td></tr>)}
                {!elegibles.length ? <tr><td colSpan={4} className="p-3 text-slate-500">Todas las empresas del mes ya están emitidas.</td></tr> : null}
              </tbody></table>
              <p className="mt-2 text-xs text-slate-500">Las empresas con problema se pueden marcar: el lote las lleva hasta la etapa con problema y ahí se detienen, sin afectar a las demás. Hasta 50 por lote.</p>
              <div className="mt-4 flex items-center justify-between"><span className="text-sm"><b>{lote.selected.size}</b> empresa(s)</span><button type="button" disabled={busy || !lote.selected.size} onClick={run} className="rounded-full bg-[#0F766E] px-5 py-2 font-bold text-white shadow disabled:opacity-50">{busy ? "Facturando… (puede tardar unos minutos)" : `⚡ Facturar ${lote.selected.size} en lote`}</button></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CycleConfig({ onSaved }) {
  const [config, setConfig] = useState(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { let active = true; api("/api/billing/cycle/config").then((c) => { if (active) setConfig(c); }).catch((e) => { if (active) setMessage(e.message); }); return () => { active = false; }; }, []);
  if (!config) return <p className="text-sm text-slate-500">{message || "Cargando…"}</p>;
  const set = (key, field, value) => setConfig((c) => ({ ...c, [key]: { ...c[key], [field]: value } }));
  async function save() {
    setSaving(true); setMessage("");
    try { setConfig(await api("/api/billing/cycle/config", { method: "PUT", body: JSON.stringify(config) })); setMessage("Configuración guardada."); await onSaved(); }
    catch (e) { setMessage(e.message); } finally { setSaving(false); }
  }
  const Seg = ({ k, f, options, disabled }) => (
    <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5">{Object.entries(options).map(([value, label]) => <button key={value} type="button" disabled={disabled} onClick={() => set(k, f, value)} className={`rounded-full px-3 py-1 text-xs font-bold disabled:cursor-not-allowed ${config[k][f] === value ? "bg-white text-[#041E42] shadow" : "text-slate-500"}`}>{label}</button>)}</div>
  );
  return (
    <div className="space-y-3">
      <p className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">El <b>orden</b> de las etapas es fijo (cada una necesita la anterior). Aquí se define si cada etapa es <b>obligatoria</b>, <b>opcional</b> u <b>omitida</b>, si se ejecuta <b>a mano</b> o <b>automática</b> (se hace sola al terminar la anterior) y quién la hace.</p>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        {CYCLE_STEPS.map((s) => {
          const fixed = FIXED_REQUIRED.includes(s.key) || NOT_AVAILABLE.includes(s.key);
          return (
            <div key={s.key} className="grid grid-cols-[40px_1.4fr_auto_auto_140px] items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
              <span className="grid h-9 w-9 place-items-center rounded-xl font-extrabold text-white" style={{ background: COLORS[s.key] }}>{s.n}</span>
              <div><b className="block text-sm">{s.name}</b><small className="text-slate-500">{s.question}{FIXED_REQUIRED.includes(s.key) ? " · siempre obligatoria" : ""}{NOT_AVAILABLE.includes(s.key) ? " · F3, aún no desarrollada" : ""}</small></div>
              <Seg k={s.key} f="use" options={CYCLE_USES} disabled={fixed} />
              <Seg k={s.key} f="run" options={CYCLE_RUNS} disabled={config[s.key].use === "off"} />
              <select value={config[s.key].who} disabled={config[s.key].use === "off"} onChange={(e) => set(s.key, "who", e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">{CYCLE_ROLES.map((r) => <option key={r}>{r}</option>)}</select>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-end gap-3">{message ? <span className="text-sm text-slate-600">{message}</span> : null}<button type="button" disabled={saving} onClick={save} className="rounded-full bg-[#3150D8] px-5 py-2 text-sm font-bold text-white disabled:opacity-50">Guardar configuración</button></div>
    </div>
  );
}
