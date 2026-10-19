"use client";

import { useEffect, useMemo, useState } from "react";
import OffStreetSpreadsheet from "@/components/reports/OffStreetSpreadsheet";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { OPERATIONAL_TIME_ZONE } from "@/lib/dataEntry.mjs";

// Resumen de cupones por tienda o campaña (SOL-2026-10-19-002, etapa B). El
// cobro a las tiendas lo hace el cliente fuera del sistema: este resumen
// (exportable) le sirve de respaldo con canjes y monto descontado.
const money = (value) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value || 0);
const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: OPERATIONAL_TIME_ZONE }).format(new Date());

export default function CouponsSummary({ refreshKey = 0 }) {
  const [from, setFrom] = useState(() => `${todayIso().slice(0, 7)}-01`);
  const [to, setTo] = useState(todayIso);
  const [groupBy, setGroupBy] = useState("merchant");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError("");
      try {
        const params = new URLSearchParams({ dateFrom: from, dateTo: to, groupBy });
        const response = await authenticatedFetch(`/api/cupones/resumen?${params.toString()}`, { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) { setRows([]); setError(body.error || "No fue posible calcular el resumen."); return; }
        setRows(Array.isArray(body?.data?.rows) ? body.data.rows : []);
      } catch {
        if (!cancelled) { setRows([]); setError("No fue posible conectar con el servidor."); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [from, to, groupBy, refreshKey]);

  const totals = useMemo(() => rows.reduce((sum, row) => ({ issued: sum.issued + row.issued, redeemed: sum.redeemed + row.redeemed, discountAmount: sum.discountAmount + row.discountAmount }), { issued: 0, redeemed: 0, discountAmount: 0 }), [rows]);
  const columns = useMemo(() => [
    ...(groupBy === "campaign" ? [{ key: "campaign", label: "Campaña" }] : []),
    { key: "merchant", label: "Tienda" },
    { key: "issued", label: "Emitidos", total: true },
    { key: "delivered", label: "Entregados", total: true },
    { key: "redeemed", label: "Canjeados", total: true },
    { key: "expiredUnused", label: "Vencidos sin usar", total: true },
    { key: "redemptionRate", label: "% de canje", format: (value) => value == null ? "—" : `${String(value).replace(".", ",")}%` },
    { key: "discountAmount", label: "Monto descontado", total: true, format: (value) => money(value) },
  ].map((column) => ({ value: (row) => row[column.key], format: (value) => String(value ?? "—"), groupable: false, ...column })), [groupBy]);

  return <section className="space-y-3 rounded-3xl border bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-[#041E42]">Resumen por {groupBy === "campaign" ? "campaña" : "tienda"}</h2>
        <p className="mt-1 text-sm text-slate-500">Emitidos, entregados, canjeados y monto descontado del período. Sirve de respaldo si cobras a las tiendas.</p>
      </div>
      <div className="flex flex-wrap items-end gap-2 text-xs font-semibold text-slate-600">
        <label><span className="mb-1 block">Desde</span><input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2"/></label>
        <label><span className="mb-1 block">Hasta</span><input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2"/></label>
        <div className="flex rounded-xl border border-slate-200 p-1">
          {[["merchant", "Por tienda"], ["campaign", "Por campaña"]].map(([id, label]) => <button key={id} type="button" onClick={() => setGroupBy(id)} className={`rounded-lg px-3 py-1.5 ${groupBy === id ? "bg-[#3150D8] text-white" : "text-slate-600"}`}>{label}</button>)}
        </div>
      </div>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <p className="rounded-2xl bg-slate-50 p-3 text-sm"><span className="block text-xs font-bold uppercase text-slate-500">Emitidos</span><span className="text-xl font-black text-[#041E42]">{totals.issued}</span></p>
      <p className="rounded-2xl bg-slate-50 p-3 text-sm"><span className="block text-xs font-bold uppercase text-slate-500">Canjeados</span><span className="text-xl font-black text-[#041E42]">{totals.redeemed}</span></p>
      <p className="rounded-2xl bg-slate-50 p-3 text-sm"><span className="block text-xs font-bold uppercase text-slate-500">Monto descontado</span><span className="text-xl font-black text-[#3150D8]">{money(totals.discountAmount)}</span></p>
    </div>
    {error ? <p className="rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
    <OffStreetSpreadsheet key={groupBy} rows={rows} columns={columns} storageKey={`parkfacil:cupones:resumen:${groupBy}`} title={`Resumen de cupones por ${groupBy === "campaign" ? "campaña" : "tienda"}`} context={`${from} al ${to} · America/Santiago`} loading={loading} disabled={Boolean(error)} />
  </section>;
}
