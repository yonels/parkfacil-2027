"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ParkFacilDataGrid from "@/components/ui/ParkFacilDataGrid";

const money = (value, currency) => new Intl.NumberFormat("es-CL", {
  style: "currency", currency: currency || "CLP", maximumFractionDigits: 0,
}).format(Number(value || 0));

export default function AccountWorkspace({ columns }) {
  const [data, setData] = useState({ rows: [], summary: [] });
  const [companies, setCompanies] = useState([]);
  const [message, setMessage] = useState("Consultando movimientos reales…");
  const [saving, setSaving] = useState(false);
  const [payment, setPayment] = useState({ companyId: "", amount: "", movementDate: new Date().toISOString().slice(0, 10), currency: "CLP", paymentMethod: "TRANSFER", reference: "", description: "" });

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/billing/accounts", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setData(payload.data);
      setMessage("");
    } catch (error) { setMessage(error.message || "No fue posible cargar Cuenta Corriente."); }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [accountsResponse, companiesResponse] = await Promise.all([fetch("/api/billing/accounts", { cache: "no-store" }), fetch("/api/empresas", { cache: "no-store" })]);
        const [accountsPayload, companiesPayload] = await Promise.all([accountsResponse.json(), companiesResponse.json()]);
        if (!accountsResponse.ok) throw new Error(accountsPayload.error);
        if (active) {
          setData(accountsPayload.data);
          setCompanies(companiesResponse.ok ? companiesPayload.data || companiesPayload || [] : []);
          setMessage("");
        }
      } catch (error) { if (active) setMessage(error.message || "No fue posible cargar Cuenta Corriente."); }
    })();
    return () => { active = false; };
  }, []);

  const registerPayment = async event => {
    event.preventDefault(); setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/billing/accounts/payments", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ ...payment, amount: Number(payment.amount) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No fue posible registrar el pago.");
      setPayment(current => ({ ...current, amount: "", reference: "", description: "" }));
      setMessage(payload.reused ? "El pago ya estaba registrado." : "Pago registrado correctamente.");
      await load();
    } catch (error) { setMessage(error.message); } finally { setSaving(false); }
  };

  const rows = useMemo(() => (data.rows || []).map(item => ({ id: item.id, fecha: item.movementDate, cliente: item.company?.business_name || item.companyId, documento: item.document?.folio || item.movementType, referencia: item.reference, vencimiento: item.dueDate, debe: item.debitAmount, haber: item.creditAmount, saldo: item.runningBalance, estado: item.accountStatus, moneda: item.currency })), [data]);
  const gridColumns = useMemo(() => columns.map(column => ["debe", "haber", "saldo"].includes(column.key) ? { ...column, render: (value, row) => money(value, row.moneda), exportValue: row => row[column.key] } : column), [columns]);

  return <div className="space-y-4">
    <form onSubmit={registerPayment} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-3 xl:grid-cols-4">
      <h3 className="font-bold text-[#041E42] md:col-span-3 xl:col-span-4">Registrar pago recibido</h3>
      <select required value={payment.companyId} onChange={event => setPayment(current => ({ ...current, companyId: event.target.value }))} className="rounded-xl border p-2"><option value="">Seleccionar empresa</option>{companies.map(company => <option key={company.id} value={company.id}>{company.business_name || company.name}</option>)}</select>
      <input required min="1" step="0.01" type="number" value={payment.amount} onChange={event => setPayment(current => ({ ...current, amount: event.target.value }))} placeholder="Monto" className="rounded-xl border p-2" />
      <input required type="date" value={payment.movementDate} onChange={event => setPayment(current => ({ ...current, movementDate: event.target.value }))} className="rounded-xl border p-2" />
      <select value={payment.currency} onChange={event => setPayment(current => ({ ...current, currency: event.target.value }))} className="rounded-xl border p-2"><option>CLP</option><option>USD</option></select>
      <select value={payment.paymentMethod} onChange={event => setPayment(current => ({ ...current, paymentMethod: event.target.value }))} className="rounded-xl border p-2"><option value="TRANSFER">Transferencia</option><option value="CARD">Tarjeta</option><option value="CASH">Efectivo</option><option value="CHECK">Cheque</option><option value="OTHER">Otro</option></select>
      <input value={payment.reference} onChange={event => setPayment(current => ({ ...current, reference: event.target.value }))} placeholder="Referencia" className="rounded-xl border p-2" />
      <input value={payment.description} onChange={event => setPayment(current => ({ ...current, description: event.target.value }))} placeholder="Descripción" className="rounded-xl border p-2" />
      <button disabled={saving} className="rounded-xl bg-[#3150D8] px-4 py-2 font-semibold text-white disabled:opacity-50">{saving ? "Registrando…" : "Registrar pago"}</button>
    </form>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{(data.summary || []).map(summary => <div key={summary.currency} className="rounded-2xl border bg-white p-4"><p className="text-xs font-bold uppercase text-slate-500">Cuenta {summary.currency}</p><p className="mt-2 text-xl font-bold">Saldo {money(summary.balance, summary.currency)}</p><p className="text-sm text-slate-600">Por vencer {money(summary.current, summary.currency)} · Vencido {money(summary.overdue, summary.currency)}</p><p className="text-sm text-slate-600">Créditos/Pagos {money(summary.totalCredits, summary.currency)}</p></div>)}</div>
    {message ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{message}</p> : null}
    <ParkFacilDataGrid storageKey="facturacion:cuenta-corriente" columns={gridColumns} rows={rows} globalSearchPlaceholder="Buscar movimientos..." emptyMessage="No existen movimientos financieros reales." exportFilename="cuenta_corriente" exportSheetName="Cuenta Corriente" />
  </div>;
}
