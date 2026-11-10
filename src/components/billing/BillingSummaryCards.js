"use client";

import { useEffect, useState } from "react";
import { CircleDollarSign, FilePlus2, HandCoins, ReceiptText } from "lucide-react";
import { summarizeBilling } from "@/lib/billing/billingSummaryCore.mjs";

// Indicadores reales de la portada de Facturación (SOL-2026-11-10-001, hallazgo H1).
const clp = (value) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Number(value) || 0);
const uf = (value) => `UF ${Number(value || 0).toLocaleString("es-CL", { maximumFractionDigits: 4 })}`;
const monthName = (month) => new Date(`${month}-15T12:00:00`).toLocaleDateString("es-CL", { month: "long", year: "numeric" });

const LOADING = [
  { key: "mes", title: "Facturación del mes", icon: ReceiptText, value: "…", detail: "Cargando…" },
  { key: "emitir", title: "Por emitir", icon: FilePlus2, value: "…", detail: "Cargando…" },
  { key: "pendiente", title: "Pendiente de pago", icon: HandCoins, value: "…", detail: "Cargando…" },
  { key: "vencido", title: "Vencido", icon: CircleDollarSign, value: "…", detail: "Cargando…" },
];

// Textos de las tarjetas a partir del resumen (fuera del componente: valores simples para la vista).
function describe(summary) {
  const { month, billedMonth, toIssue, pending, overdue } = summary;
  const toIssueAmounts = [toIssue.uf ? uf(toIssue.uf) : "", toIssue.clp ? clp(toIssue.clp) : ""].filter(Boolean).join(" + ");
  return [
    { key: "mes", title: "Facturación del mes", icon: ReceiptText, value: clp(billedMonth.amount), detail: `${monthName(month)} · ${billedMonth.invoices} factura(s)${billedMonth.creditNotes ? ` · notas de crédito −${clp(billedMonth.credits)}` : ""}` },
    { key: "emitir", title: "Por emitir", icon: FilePlus2, value: `${toIssue.count} prefactura(s)`, detail: toIssue.count ? `${toIssueAmounts} aprobadas, sin factura` : "Ninguna aprobada pendiente de emitir" },
    { key: "pendiente", title: "Pendiente de pago", icon: HandCoins, value: clp(pending.amount), detail: `${pending.count} factura(s) con saldo` },
    { key: "vencido", title: "Vencido", icon: CircleDollarSign, value: clp(overdue.amount), detail: `${overdue.count} factura(s) vencida(s)`, alert: overdue.amount > 0 },
  ];
}

export default function BillingSummaryCards() {
  const [cards, setCards] = useState(LOADING);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const today = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    Promise.all([fetch("/api/billing/documents", { cache: "no-store" }), fetch("/api/billing/preinvoices", { cache: "no-store" })])
      .then(async ([documents, preinvoices]) => {
        const [d, p] = await Promise.all([documents.json(), preinvoices.json()]);
        if (!documents.ok || !preinvoices.ok) throw new Error(d.error || p.error || "No fue posible cargar los indicadores.");
        const summary = summarizeBilling({ documents: Array.isArray(d.data) ? d.data : [], preinvoices: Array.isArray(p.data) ? p.data : [], today });
        if (active) setCards(describe(summary));
      })
      .catch((reason) => { if (active) setError(reason.message || "No fue posible cargar los indicadores."); });
    return () => { active = false; };
  }, []);

  if (error) return <p role="alert" className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen de facturación">
      {cards.map(({ key, title, icon: Icon, value, detail, alert }) => (
        <article key={key} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-slate-500">{title}</p><p className={`mt-3 text-xl font-bold ${alert ? "text-red-600" : "text-[#041E42]"}`}>{value}</p></div><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#EEF4FF] text-[#3150D8]"><Icon className="h-5 w-5" /></span></div>
          <p className="mt-3 text-xs text-slate-500">{detail}</p>
        </article>
      ))}
    </section>
  );
}
