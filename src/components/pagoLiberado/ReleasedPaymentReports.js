"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import OffStreetSpreadsheet from "@/components/reports/OffStreetSpreadsheet";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { REPORT_LABELS, REPORT_TYPES } from "@/lib/releasedPayment/reportCore.mjs";
import { formatClp } from "@/lib/releasedPayment/tariffCore.mjs";
import { addLocalDays, parseLocalDate, toLocalInputValue } from "@/lib/releasedPayment/zonedTime.mjs";

// Etapa 3 (paso 3.1): reportes de Pago liberado en pantalla, con
// exportación Excel, CSV y PDF de la planilla Off Street.

const input = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm";
const label = "block text-xs font-bold uppercase tracking-wide text-slate-600";
const card = "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm";
const button = "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-60";

const clp = (value) => (value === null || value === undefined ? "—" : formatClp(value));
const text = (key, labelText, extra = {}) => ({ key, label: labelText, value: (row) => row[key] || "", ...extra });
const number = (key, labelText, extra = {}) => ({ key, label: labelText, value: (row) => row[key] ?? null, format: (value) => (value === null || value === undefined ? "—" : String(value)), ...extra });
const money = (key, labelText) => ({ key, label: labelText, value: (row) => row[key] ?? null, format: clp, total: true });

const COLUMNS = {
  [REPORT_TYPES.ESTADIAS]: [
    text("code", "Ticket"),
    text("plate", "Patente", { groupable: true }),
    text("beneficiary", "Beneficiario", { groupable: true }),
    text("status", "Estado", { groupable: true }),
    text("entryAt", "Ingreso"),
    text("exitAt", "Salida"),
    number("coveredMinutes", "Min. cubiertos", { total: true }),
    number("chargedMinutes", "Min. cobrados", { total: true }),
    money("amount", "Excedente cobrado"),
    text("method", "Medio", { groupable: true }),
    text("paymentCode", "Código de pago"),
    text("entryOperator", "Operador ingreso", { groupable: true }),
    text("exitOperator", "Operador salida", { groupable: true }),
    text("regularization", "Regularización", { groupable: true }),
  ],
  [REPORT_TYPES.ACUERDOS]: [
    text("plate", "Patente", { groupable: true }),
    text("beneficiary", "Beneficiario", { groupable: true }),
    text("beneficiaryReference", "Referencia beneficiario"),
    text("validity", "Vigencia"),
    text("tariff", "Tarifa", { groupable: true }),
    text("quantity", "Cantidad"),
    money("agreedAmount", "Total acordado"),
    text("paymentStatus", "Estado de pago", { groupable: true }),
    money("paidAmount", "Pagado"),
    text("paymentMethod", "Medio de pago", { groupable: true }),
    text("paidAt", "Fecha de pago"),
    text("paymentReference", "Referencia de pago"),
    text("registeredBy", "Registrado por", { groupable: true }),
    number("voidedPayments", "Pagos anulados", { total: true }),
    text("lastVoidReason", "Motivo última anulación"),
    text("authorizationStatus", "Autorización", { groupable: true }),
  ],
  [REPORT_TYPES.HISTORIAL]: [
    text("createdAt", "Fecha"),
    text("event", "Cambio", { groupable: true }),
    text("scope", "Ámbito", { groupable: true }),
    text("plate", "Patente", { groupable: true }),
    text("actor", "Realizado por", { groupable: true }),
    text("before", "Antes"),
    text("after", "Después"),
    text("reason", "Motivo"),
  ],
};

function monthStart() {
  const today = parseLocalDate(toLocalInputValue(Date.now()).slice(0, 10));
  return `${today.year}-${String(today.month).padStart(2, "0")}-01`;
}
function todayLocal() {
  return toLocalInputValue(Date.now()).slice(0, 10);
}
function filenameDate(value) {
  const parsed = parseLocalDate(value);
  return parsed ? `${parsed.year}${String(parsed.month).padStart(2, "0")}${String(parsed.day).padStart(2, "0")}` : value;
}

export default function ReleasedPaymentReports({ parkingId, parkingLabel }) {
  const [form, setForm] = useState(() => ({ type: REPORT_TYPES.ESTADIAS, from: monthStart(), to: todayLocal() }));
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate(event) {
    event.preventDefault();
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ tipo: form.type, desde: form.from, hasta: form.to });
      const response = await authenticatedFetch(`/api/pago-liberado/estacionamientos/${parkingId}/reportes?${query}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "No fue posible generar el reporte.");
      setResult({ ...body.data, from: form.from, to: form.to });
    } catch (loadError) {
      setResult(null);
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  const change = (key) => (event) => { setForm({ ...form, [key]: event.target.value }); };
  const sameDayOrLater = parseLocalDate(form.from) && parseLocalDate(form.to) && form.to >= form.from;
  const maxTo = parseLocalDate(form.from) ? (() => { const d = addLocalDays(parseLocalDate(form.from), 366); return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`; })() : undefined;

  return (
    <section className={card}>
      <h3 className="text-lg font-bold text-[#041E42]">Reportes</h3>
      <p className="mt-1 text-xs text-slate-500">Estadías con beneficio, acuerdos y pagos de beneficiarios, e historial de cambios. Fechas en hora de Chile (America/Santiago); ambos días incluidos, hasta 366 días.</p>
      <form onSubmit={generate} className="mt-3 grid gap-3 md:grid-cols-4 md:items-end">
        <label className={label}>Reporte
          <select className={input} value={form.type} onChange={change("type")}>
            {Object.values(REPORT_TYPES).map((type) => <option key={type} value={type}>{REPORT_LABELS[type]}</option>)}
          </select>
        </label>
        <label className={label}>Desde<input type="date" className={input} required value={form.from} onChange={change("from")} /></label>
        <label className={label}>Hasta<input type="date" className={input} required min={form.from} max={maxTo} value={form.to} onChange={change("to")} /></label>
        <button type="submit" disabled={loading || !sameDayOrLater} className={`${button} justify-center bg-[#3150D8] text-white`}>{loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}Generar reporte</button>
      </form>
      {form.type === REPORT_TYPES.ACUERDOS ? <p className="mt-2 text-xs text-slate-500">Incluye las autorizaciones cuya vigencia toca el rango. «Pagado» es el pago vigente registrado por el administrador; los anulados se cuentan aparte.</p> : null}
      {error ? <p role="alert" className="mt-3 rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p> : null}
      {result?.truncated ? <p role="status" className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">El resultado supera el máximo de filas: se muestran las primeras. Acorta el rango de fechas.</p> : null}
      {result ? (
        <div className="mt-4">
          <OffStreetSpreadsheet
            key={`${result.type}-${result.from}-${result.to}`}
            rows={result.rows}
            columns={COLUMNS[result.type]}
            storageKey={`pago-liberado-reporte-${result.type}`}
            title={`Pago liberado - ${REPORT_LABELS[result.type]} - ${result.parking.code || parkingLabel} - ${filenameDate(result.from)}-${filenameDate(result.to)}`}
            context={`${result.parking.name}${result.parking.companyName ? ` · ${result.parking.companyName}` : ""} · ${result.from} a ${result.to}`}
            loading={loading}
          />
        </div>
      ) : null}
    </section>
  );
}
