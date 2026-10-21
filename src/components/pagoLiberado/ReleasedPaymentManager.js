"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Plus, RefreshCw, Trash2 } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { describeAuthorization, describeAuthorizationTerms, validateAuthorizationInput, WEEKDAY_LABELS } from "@/lib/releasedPayment/authorizationCore.mjs";
import { CONTRACT_TERMS_MONTHS, contractPeriodText, describeContract, formatUf, validateMonthlyFeeInput } from "@/lib/releasedPayment/contractCore.mjs";
import { authorizationPaymentStatus, currentPayment, describePayment, PAYMENT_METHOD_CODES, PAYMENT_METHODS, PAYMENT_STATUS, PAYMENT_STATUS_LABELS, validatePaymentInput } from "@/lib/releasedPayment/paymentCore.mjs";
import { describeTerms, formatClp, quantityText, TARIFF_UNIT_CODES, TARIFF_UNITS, VAT_TREATMENT_LABELS } from "@/lib/releasedPayment/tariffCore.mjs";
import { formatLocalDateTime, toLocalInputValue } from "@/lib/releasedPayment/zonedTime.mjs";
import { summarizeEventValues as summarizeValues, tariffText } from "@/lib/releasedPayment/reportCore.mjs";
import ReleasedPaymentRegularization from "./ReleasedPaymentRegularization";
import ReleasedPaymentReports from "./ReleasedPaymentReports";

// Off Street — Pago liberado, Etapa 1 (SOL-2026-10-16-003; modelo de
// SOL-2026-10-05-002).
// - Root: registra el IMPORTE MENSUAL final del módulo que ParkFacil cobra
//   al cliente (UF + IVA mensual, plazo de 12, 24 o 36 meses con inicio y
//   término; independiente de cupos, patentes, beneficiarios y tarifas del
//   cliente), activa, desactiva y reactiva por estacionamiento;
//   supervisa cupos, tarifas, autorizaciones, pagos e historial.
// - Administrador del estacionamiento (módulo activo): define los CUPOS
//   simultáneos, las TARIFAS que cobra a sus beneficiarios (hora, día, mes,
//   año; CLP con IVA incluido) y las autorizaciones por patente, que guardan
//   una copia de lo acordado (tarifa × cantidad = total, inicio y término),
//   y registra el PAGO RECIBIDO del total acordado (sin parciales).
//   Ve la contratación, no la cambia.
// - El POS aplica el beneficio desde la Etapa 2; los reportes (Etapa 3) se
//   generan por estacionamiento en ReleasedPaymentReports.
// Toda regla se valida además en el servidor (rutas + RPC).

const STATUS_STYLES = {
  ACTIVE: "border-emerald-300 bg-emerald-50 text-emerald-800",
  DISABLED: "border-rose-300 bg-rose-50 text-rose-800",
  EXPIRED: "border-amber-300 bg-amber-50 text-amber-900",
  NOT_STARTED: "border-sky-300 bg-sky-50 text-sky-800",
  NOT_CONTRACTED: "border-slate-300 bg-slate-50 text-slate-600",
};
const EVENT_LABELS = {
  CONTRACT_CREATED: "Contratación registrada",
  CONTRACT_VERSIONED: "Nueva versión de la contratación",
  SPOTS_CHANGED: "Cupos simultáneos modificados",
  ACTIVATED: "Módulo activado",
  DEACTIVATED: "Módulo desactivado",
  TARIFF_CREATED: "Tarifa creada",
  TARIFF_VERSIONED: "Tarifa modificada",
  TARIFF_RETIRED: "Tarifa retirada",
  CREATED: "Autorización creada",
  UPDATED: "Autorización modificada",
  REVOKED: "Autorización revocada",
  PAYMENT_REGISTERED: "Pago del beneficiario registrado",
  PAYMENT_VOIDED: "Pago del beneficiario anulado",
};
const input = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm";
const label = "block text-xs font-bold uppercase tracking-wide text-slate-600";
const card = "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm";
const button = "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-60";

function todayLocal() {
  return toLocalInputValue(Date.now()).slice(0, 10);
}

async function api(path, options = {}) {
  const response = await authenticatedFetch(path, {
    cache: "no-store",
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = Array.isArray(body?.details) ? ` ${body.details.join(" ")}` : "";
    throw new Error(`${body?.error || "No fue posible completar la acción."}${details}`);
  }
  return body;
}

function StatusBadge({ status, label: text }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-black ${STATUS_STYLES[status] || STATUS_STYLES.NOT_CONTRACTED}`}>{text}</span>;
}

function Message({ state }) {
  if (!state) return null;
  return (
    <div className={`rounded-2xl border p-3 text-sm font-semibold ${state.type === "error" ? "border-rose-300 bg-rose-50 text-rose-800" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`} role={state.type === "error" ? "alert" : "status"}>
      {state.text}
    </div>
  );
}

// ------------------------------------------------------------------
// Root: contratación con importe mensual y plazo contractual
// ------------------------------------------------------------------
function MonthlyFeeForm({ parkingId, current, onSaved }) {
  const monthly = Boolean(current);
  const [form, setForm] = useState(() => ({
    monthlyFeeUf: monthly ? String(current.monthlyFeeUf) : "",
    baseMonthlyFeeUf: monthly && current.baseMonthlyFeeUf !== null && current.baseMonthlyFeeUf !== undefined ? String(current.baseMonthlyFeeUf) : "",
    discountNotes: monthly ? current.discountNotes || "" : "",
    termMonths: monthly && current.termMonths ? String(current.termMonths) : "",
    startsAt: monthly && current.termMonths ? toLocalInputValue(current.startsAt).slice(0, 10) : todayLocal(),
    contractReference: current?.contractReference || "",
    crmProposalNumber: current?.crmProposalNumber || "",
    notes: "",
    reason: "",
  }));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const preview = useMemo(() => validateMonthlyFeeInput({ ...form, reason: form.reason || "vista previa" }), [form]);
  const set = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await api(`/api/pago-liberado/estacionamientos/${parkingId}/contratacion`, { method: "POST", body: JSON.stringify(form) });
      setMessage({ type: "ok", text: "Contratación registrada. Registrarla no activa el módulo." });
      setForm((previous) => ({ ...previous, reason: "", notes: "" }));
      onSaved();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <h4 className="font-black text-[#041E42]">{current ? "Nueva versión de la contratación" : "Registrar contratación"}</h4>
      <p className="text-xs text-slate-600">ParkFacil cobra un <strong>importe mensual + IVA</strong> por el módulo durante el plazo del contrato (12, 24 o 36 meses), independiente de los cupos, patentes, beneficiarios y de las tarifas que el estacionamiento cobra a sus beneficiarios. Registra el <strong>importe mensual final</strong> acordado en la propuesta (después de descuentos). Sin prorrateos ni renovaciones automáticas: para extender, registra una nueva versión. Cada cambio queda en el historial con motivo.</p>
      <div className="grid gap-3 md:grid-cols-3">
        <label className={label}>Importe mensual final (UF)
          <input type="text" inputMode="decimal" className={input} placeholder="Ej: 1,80" value={form.monthlyFeeUf} onChange={(event) => set("monthlyFeeUf", event.target.value)} />
        </label>
        <label className={label}>Importe mensual base (UF, opcional)
          <input type="text" inputMode="decimal" className={input} placeholder="Antes de descuentos" value={form.baseMonthlyFeeUf} onChange={(event) => set("baseMonthlyFeeUf", event.target.value)} />
        </label>
        <label className={label}>Descuentos aplicados (opcional)
          <input type="text" className={input} placeholder="Según la propuesta" value={form.discountNotes} onChange={(event) => set("discountNotes", event.target.value)} />
        </label>
        <label className={label}>Plazo contractual
          <select className={input} value={form.termMonths} onChange={(event) => set("termMonths", event.target.value)}>
            <option value="">Selecciona…</option>
            {CONTRACT_TERMS_MONTHS.map((months) => <option key={months} value={months}>{months} meses</option>)}
          </select>
        </label>
        <label className={label}>Inicio del contrato
          <input type="date" className={input} value={form.startsAt} onChange={(event) => set("startsAt", event.target.value)} />
        </label>
        <label className={label}>N.º de propuesta CRM (opcional)
          <input type="text" className={input} value={form.crmProposalNumber} onChange={(event) => set("crmProposalNumber", event.target.value)} />
        </label>
        <label className={label}>Referencia contractual (opcional)
          <input type="text" className={input} value={form.contractReference} onChange={(event) => set("contractReference", event.target.value)} />
        </label>
        <label className={`${label} md:col-span-2`}>Notas (opcional)
          <input type="text" className={input} value={form.notes} onChange={(event) => set("notes", event.target.value)} />
        </label>
      </div>
      <label className={label}>Motivo del cambio (obligatorio)
        <input type="text" className={input} required minLength={3} value={form.reason} onChange={(event) => set("reason", event.target.value)} />
      </label>
      <div className="rounded-xl bg-white p-3 text-sm">
        {preview.ok ? (
          <p><strong>Importe mensual final:</strong> {formatUf(preview.value.monthlyFeeUf)} + IVA mensual{preview.value.baseMonthlyFeeUf !== null && preview.value.baseMonthlyFeeUf > preview.value.monthlyFeeUf ? ` (base ${formatUf(preview.value.baseMonthlyFeeUf)}, descuento ${formatUf(preview.value.baseMonthlyFeeUf - preview.value.monthlyFeeUf)})` : ""} · <strong>Vigencia:</strong> {formatLocalDateTime(preview.value.startsAt).slice(0, 10)} a {formatLocalDateTime(preview.value.endsAt).slice(0, 10)} ({preview.value.termMonths} meses). Debe coincidir con el importe final de la propuesta en el CRM.</p>
        ) : (
          <p className="text-amber-800">{preview.errors.filter((error) => !/motivo/.test(error)).join(" ")}</p>
        )}
      </div>
      <Message state={message} />
      <button type="submit" disabled={saving} className={`${button} bg-[#3150D8] text-white`}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}Guardar contratación</button>
    </form>
  );
}

// ------------------------------------------------------------------
// Administrador: cupos simultáneos destinados a Pago liberado
// ------------------------------------------------------------------
function SpotsSection({ parkingId, module, canEdit, active, onSaved }) {
  const current = module?.operationalSpots ?? null;
  const [form, setForm] = useState({ operationalSpots: current ?? "", reason: "" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await api(`/api/pago-liberado/estacionamientos/${parkingId}/cupos`, { method: "POST", body: JSON.stringify({ operationalSpots: Number(form.operationalSpots), reason: form.reason }) });
      setMessage({ type: "ok", text: "Cupos actualizados." });
      onSaved();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className={card}>
      <h3 className="text-lg font-bold text-[#041E42]">Cupos simultáneos</h3>
      <p className="mt-1 text-sm text-slate-600">Cantidad de patentes liberadas que pueden estar a la vez en este estacionamiento. La define el cliente; no forma parte del importe mensual de ParkFacil. El terminal POS aplicará este límite en cada ingreso con beneficio (próxima etapa).</p>
      <p className="mt-2 text-sm"><strong>Configurados:</strong> {current === null ? "sin configurar (no se admiten ingresos con beneficio)" : current}</p>
      {canEdit ? (
        active ? (
          <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-3">
            <label className={label}>Cupos
              <input type="number" min={0} max={1000} step={1} className={input} value={form.operationalSpots} onChange={(event) => setForm((previous) => ({ ...previous, operationalSpots: event.target.value }))} />
            </label>
            <label className={`${label} min-w-[220px] flex-1`}>Motivo (obligatorio)
              <input type="text" className={input} required minLength={3} value={form.reason} onChange={(event) => setForm((previous) => ({ ...previous, reason: event.target.value }))} />
            </label>
            <button type="submit" disabled={saving} className={`${button} bg-[#3150D8] text-white`}>Guardar cupos</button>
            <div className="w-full"><Message state={message} /></div>
          </form>
        ) : <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">Los cupos se configuran con el módulo activo.</p>
      ) : <p className="mt-2 text-xs text-slate-500">Supervisión: los cupos los define el administrador del estacionamiento.</p>}
    </section>
  );
}

function ModuleStateForm({ parkingId, enabled, onSaved }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await api(`/api/pago-liberado/estacionamientos/${parkingId}/estado`, { method: "POST", body: JSON.stringify({ enabled: !enabled, reason }) });
      setReason("");
      setMessage({ type: "ok", text: enabled ? "Módulo desactivado." : "Módulo activado." });
      onSaved();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <h4 className="font-black text-[#041E42]">{enabled ? "Desactivar módulo" : "Activar módulo"}</h4>
      <p className="text-xs text-slate-600">
        {enabled
          ? "Desactivar bloquea nuevos ingresos con beneficio y nuevas autorizaciones. Se conservan tarifas, autorizaciones, documentos e historial; las estadías abiertas salen con las condiciones guardadas al ingreso, sin cobros retroactivos."
          : "Solo ParkFacil Root activa o reactiva. Exige una contratación registrada; cada ingreso vuelve a revisar vigencias y cupos."}
      </p>
      <label className={label}>Motivo (obligatorio)
        <input type="text" className={input} required minLength={3} value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
      <Message state={message} />
      <button type="submit" disabled={saving} className={`${button} ${enabled ? "bg-rose-700" : "bg-emerald-700"} text-white`}>{enabled ? "Desactivar" : "Activar"}</button>
    </form>
  );
}

// ------------------------------------------------------------------
// Administrador: tarifas que el estacionamiento cobra a sus beneficiarios
// ------------------------------------------------------------------
function TariffRow({ parkingId, unitCode, tariff, canEdit, onSaved }) {
  const unit = TARIFF_UNITS[unitCode];
  const [form, setForm] = useState({ unitPrice: tariff ? String(tariff.unitPrice) : "", label: tariff?.label || "", reason: "" });
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));

  async function send(method, body) {
    setSaving(true);
    setMessage(null);
    try {
      await api(`/api/pago-liberado/estacionamientos/${parkingId}/tarifas`, { method, body: JSON.stringify(body) });
      setMessage({ type: "ok", text: method === "POST" ? "Tarifa guardada. Las autorizaciones ya acordadas no cambian." : "Tarifa retirada. Las autorizaciones existentes conservan su copia." });
      onSaved();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-black text-[#041E42]">Por {unit.singular}</p>
        <p className="text-sm text-slate-700">{tariff ? `${formatClp(tariff.unitPrice)} por ${unit.singular} · ${VAT_TREATMENT_LABELS[tariff.vatTreatment]} · v${tariff.version}` : "Sin tarifa vigente"}</p>
      </div>
      {canEdit ? (
        <form onSubmit={(event) => { event.preventDefault(); void send("POST", { billingUnit: unitCode, ...form }); }} className="mt-2 grid gap-2 md:grid-cols-4">
          <label className={label}>Precio por {unit.singular} (CLP, IVA incluido)
            <input type="text" inputMode="numeric" className={input} placeholder="Ej: 25000" value={form.unitPrice} onChange={(event) => set("unitPrice", event.target.value)} />
          </label>
          <label className={label}>Nombre (opcional)
            <input type="text" className={input} value={form.label} onChange={(event) => set("label", event.target.value)} />
          </label>
          <label className={label}>Motivo (obligatorio)
            <input type="text" className={input} required minLength={3} value={form.reason} onChange={(event) => set("reason", event.target.value)} />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" disabled={saving} className={`${button} bg-[#3150D8] text-white`}>{tariff ? "Nueva versión" : "Crear"}</button>
            {tariff ? <button type="button" disabled={saving || form.reason.trim().length < 3} onClick={() => void send("PATCH", { action: "RETIRE", billingUnit: unitCode, reason: form.reason })} className={`${button} border border-rose-300 bg-white text-rose-700`}>Retirar</button> : null}
          </div>
          <div className="md:col-span-4"><Message state={message} /></div>
        </form>
      ) : null}
    </div>
  );
}

function TariffsSection({ parkingId, tariffs, history, canEdit, onSaved }) {
  const byUnit = new Map(tariffs.map((item) => [item.billingUnit, item]));
  const previous = history.filter((item) => item.supersededAt);
  return (
    <section className={card}>
      <h3 className="text-lg font-bold text-[#041E42]">Tarifas a beneficiarios</h3>
      <p className="mt-1 text-sm text-slate-600">
        Precios que este estacionamiento cobra a sus beneficiarios, independientes del importe mensual que ParkFacil cobra por el módulo. Moneda y tributación vigentes del estacionamiento: <strong>CLP, IVA incluido (19 %)</strong>. Cada autorización guarda una copia de lo acordado, así que cambiar o retirar una tarifa no altera acuerdos anteriores. Una tarifa configurada no es un pago recibido.
      </p>
      <div className="mt-3 space-y-2">
        {TARIFF_UNIT_CODES.map((code) => (
          <TariffRow key={`${code}-${byUnit.get(code)?.id || "sin"}`} parkingId={parkingId} unitCode={code} tariff={byUnit.get(code) || null} canEdit={canEdit} onSaved={onSaved} />
        ))}
      </div>
      {!canEdit ? <p className="mt-2 text-xs text-slate-500">Supervisión: las tarifas las define el administrador del estacionamiento.</p> : null}
      {previous.length ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-bold text-slate-700">Versiones anteriores ({previous.length})</summary>
          <ul className="mt-2 space-y-1">
            {previous.map((item) => (
              <li key={item.id} className="rounded-xl border border-slate-200 p-2">v{item.version} · {tariffText(item)} · {item.retired ? "retirada" : "reemplazada"} {formatLocalDateTime(item.supersededAt)} · motivo: {item.reason}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

// ------------------------------------------------------------------
// Administrador: autorizaciones por patente con condiciones acordadas
// ------------------------------------------------------------------
const emptyWindow = () => ({ days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" });

function authorizationToForm(authorization, tariffs) {
  if (!authorization) {
    return {
      plates: "", beneficiaryName: "", beneficiaryReference: "", kind: "CONTINUOUS",
      startsAt: toLocalInputValue(Date.now()), tariffId: tariffs[0]?.id || "", quantity: 1,
      schedule: [emptyWindow()], reason: "",
    };
  }
  return {
    plates: authorization.licensePlate, beneficiaryName: authorization.beneficiaryName, beneficiaryReference: authorization.beneficiaryReference,
    kind: authorization.kind, startsAt: toLocalInputValue(authorization.validFrom),
    tariffId: authorization.terms?.tariffId || tariffs[0]?.id || "", quantity: authorization.terms?.quantity || 1,
    schedule: authorization.schedule?.length ? authorization.schedule : [emptyWindow()], reason: "",
  };
}

function AuthorizationForm({ parkingId, editing, tariffs, contract, disabled, onSaved, onCancel }) {
  const [form, setForm] = useState(() => authorizationToForm(editing, tariffs));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const set = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));
  const setWindow = (index, field, value) => setForm((previous) => ({ ...previous, schedule: previous.schedule.map((window, i) => (i === index ? { ...window, [field]: value } : window)) }));
  const toggleDay = (index, day) => setWindow(index, "days", form.schedule[index].days.includes(day) ? form.schedule[index].days.filter((item) => item !== day) : [...form.schedule[index].days, day].sort());
  const agreedTariffReplaced = Boolean(editing?.terms && !tariffs.some((item) => item.id === editing.terms.tariffId));
  const selectedTariff = tariffs.find((item) => item.id === form.tariffId) || null;
  const preview = useMemo(
    () => validateAuthorizationInput({ ...form, plates: undefined }, { contract, tariffs, current: editing }),
    [form, contract, tariffs, editing]
  );

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      if (editing) {
        await api(`/api/pago-liberado/estacionamientos/${parkingId}/autorizaciones/${editing.id}`, { method: "PATCH", body: JSON.stringify(form) });
        setMessage({ type: "ok", text: "Autorización modificada (nueva versión registrada)." });
      } else {
        const result = await api(`/api/pago-liberado/estacionamientos/${parkingId}/autorizaciones`, { method: "POST", body: JSON.stringify(form) });
        const created = result.data?.created?.length || 0;
        const rejected = result.data?.rejected || [];
        setMessage({ type: rejected.length ? "error" : "ok", text: `${created} autorización(es) creada(s).${rejected.length ? ` No creadas: ${rejected.map((item) => item.plate).join(", ")}.` : ""}` });
        setForm(authorizationToForm(null, tariffs));
      }
      onSaved();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  }

  const unit = TARIFF_UNITS[selectedTariff?.billingUnit || editing?.terms?.billingUnit];
  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <h4 className="font-black text-[#041E42]">{editing ? `Modificar autorización ${editing.licensePlate}` : "Nueva autorización"}</h4>
      <p className="text-xs text-slate-600">Cada patente tiene su propia autorización en este estacionamiento (la carga de varias patentes crea autorizaciones individuales). Lo acordado con el beneficiario sale de la tarifa elegida × cantidad; el término se calcula desde el inicio. Fuera del horario autorizado se cobra la tarifa normal del estacionamiento.</p>
      {!tariffs.length && !editing?.terms ? <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">Define al menos una tarifa a beneficiarios antes de autorizar patentes.</p> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <label className={`${label} md:col-span-3`}>{editing ? "Patente" : "Patente(s) — una por línea o separadas por coma"}
          {editing ? <input className={input} value={form.plates} disabled /> : <textarea className={input} rows={2} required value={form.plates} onChange={(event) => set("plates", event.target.value)} placeholder="ABCD12" />}
        </label>
        <label className={label}>Beneficiario
          <input className={input} value={form.beneficiaryName} onChange={(event) => set("beneficiaryName", event.target.value)} />
        </label>
        <label className={`${label} md:col-span-2`}>Referencia (empresa, RUT u otro)
          <input className={input} value={form.beneficiaryReference} onChange={(event) => set("beneficiaryReference", event.target.value)} />
        </label>
        <label className={label}>Tarifa acordada
          <select className={input} value={form.tariffId} onChange={(event) => set("tariffId", event.target.value)}>
            {agreedTariffReplaced ? <option value={editing.terms.tariffId}>Acordada: {formatClp(editing.terms.unitPrice)} por {TARIFF_UNITS[editing.terms.billingUnit]?.singular} (tarifa ya reemplazada)</option> : null}
            {!tariffs.length && !agreedTariffReplaced ? <option value="">Sin tarifas vigentes</option> : null}
            {tariffs.map((item) => <option key={item.id} value={item.id}>{tariffText(item)}</option>)}
          </select>
        </label>
        <label className={label}>Cantidad ({unit?.plural || "unidades"})
          <input type="number" className={input} min={1} max={unit?.maxQuantity} step={1} value={form.quantity} onChange={(event) => set("quantity", event.target.value === "" ? "" : Number(event.target.value))} />
        </label>
        <label className={label}>Inicio (fecha y hora)
          <input type="datetime-local" className={input} value={form.startsAt} onChange={(event) => set("startsAt", event.target.value)} />
        </label>
      </div>
      <div className="rounded-xl bg-white p-3 text-sm">
        {preview.ok ? (
          <>
            <p><strong>Vigencia:</strong> {formatLocalDateTime(preview.value.validFrom)} a {formatLocalDateTime(preview.value.validTo)} ({quantityText(preview.value.terms.quantity, preview.value.terms.billingUnit)})</p>
            <p><strong>Acordado:</strong> {describeTerms(preview.value.terms)}</p>
            <p className="text-xs text-slate-500">El total acordado no es un pago registrado. Meses y años son calendario: un mes sin el día de inicio termina en su último día; 29-02 + 1 año termina el 28-02.</p>
          </>
        ) : (
          <p className="text-amber-800">{preview.errors.filter((error) => !/patente/i.test(error)).join(" ")}</p>
        )}
      </div>
      <fieldset className="flex flex-wrap gap-4 text-sm font-semibold text-slate-700">
        <legend className={label}>Uso dentro de la vigencia</legend>
        <label className="inline-flex items-center gap-2"><input type="radio" name="kind" checked={form.kind === "CONTINUOUS"} onChange={() => set("kind", "CONTINUOUS")} />Todo el período</label>
        <label className="inline-flex items-center gap-2"><input type="radio" name="kind" checked={form.kind === "RECURRING"} onChange={() => set("kind", "RECURRING")} />Horario recurrente (días y franjas)</label>
      </fieldset>
      {form.kind === "RECURRING" ? (
        <div className="space-y-3">
          {form.schedule.map((window, index) => (
            <div key={index} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <div>
                <span className={label}>Días</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                    <button key={day} type="button" onClick={() => toggleDay(index, day)} className={`rounded-lg border px-2 py-1 text-xs font-bold ${window.days.includes(day) ? "border-[#3150D8] bg-[#3150D8] text-white" : "border-slate-300 bg-white text-slate-600"}`} aria-pressed={window.days.includes(day)}>{WEEKDAY_LABELS[day]}</button>
                  ))}
                </div>
              </div>
              <label className={label}>Desde<input type="time" className={input} value={window.start} onChange={(event) => setWindow(index, "start", event.target.value)} /></label>
              <label className={label}>Hasta<input type="time" className={input} value={window.end} onChange={(event) => setWindow(index, "end", event.target.value)} /></label>
              {window.end && window.start && window.end <= window.start ? <span className="text-xs font-bold text-sky-700">Cruza medianoche</span> : null}
              {form.schedule.length > 1 ? <button type="button" onClick={() => set("schedule", form.schedule.filter((_, i) => i !== index))} className="rounded-lg p-2 text-rose-700 hover:bg-rose-50" aria-label="Quitar franja"><Trash2 className="h-4 w-4" /></button> : null}
            </div>
          ))}
          <button type="button" onClick={() => set("schedule", [...form.schedule, emptyWindow()])} className={`${button} border border-slate-300 bg-white text-slate-700`}><Plus className="h-4 w-4" />Agregar franja</button>
        </div>
      ) : null}
      <label className={label}>Motivo (obligatorio)<input className={input} required minLength={3} value={form.reason} onChange={(event) => set("reason", event.target.value)} /></label>
      <Message state={message} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving || disabled} className={`${button} bg-[#3150D8] text-white`}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}{editing ? "Guardar cambios" : "Crear autorización"}</button>
        {editing ? <button type="button" onClick={onCancel} className={`${button} border border-slate-300 bg-white text-slate-700`}>Cancelar</button> : null}
      </div>
    </form>
  );
}

// ------------------------------------------------------------------
// Administrador: pago recibido del beneficiario (total acordado, sin parciales)
// ------------------------------------------------------------------
function PaymentCell({ authorization, payments }) {
  const payment = currentPayment(payments, authorization.id);
  if (authorization.status !== "ACTIVE" && !payment) return <span className="text-slate-400">—</span>;
  const status = authorizationPaymentStatus(authorization, payments);
  return (
    <div>
      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-black ${status === PAYMENT_STATUS.PAID ? STATUS_STYLES.ACTIVE : STATUS_STYLES.EXPIRED}`}>{PAYMENT_STATUS_LABELS[status]}</span>
      {payment ? <span className="mt-1 block text-xs text-slate-600">{describePayment(payment)}</span> : null}
    </div>
  );
}

function PaymentForm({ parkingId, authorization, onDone, onCancel }) {
  const [form, setForm] = useState(() => ({ method: "TRANSFER", paidAt: toLocalInputValue(Date.now()), reference: "", notes: "" }));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const set = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));
  const preview = useMemo(() => validatePaymentInput(form, { authorization }), [form, authorization]);
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await api(`/api/pago-liberado/estacionamientos/${parkingId}/autorizaciones/${authorization.id}/pagos`, { method: "POST", body: JSON.stringify(form) });
      onDone();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <h4 className="font-black text-[#041E42]">Registrar pago recibido · {authorization.licensePlate}</h4>
      <p className="text-sm"><strong>Monto:</strong> {formatClp(authorization.terms?.totalAmount ?? 0)} (total acordado, IVA incluido). No se aceptan pagos parciales.</p>
      <div className="grid gap-3 md:grid-cols-4">
        <label className={label}>Medio de pago
          <select className={input} value={form.method} onChange={(event) => set("method", event.target.value)}>
            {PAYMENT_METHOD_CODES.map((code) => <option key={code} value={code}>{PAYMENT_METHODS[code]}</option>)}
          </select>
        </label>
        <label className={label}>Recibido (fecha y hora)
          <input type="datetime-local" className={input} value={form.paidAt} onChange={(event) => set("paidAt", event.target.value)} />
        </label>
        <label className={label}>Referencia (comprobante, n.º de transferencia)
          <input className={input} value={form.reference} onChange={(event) => set("reference", event.target.value)} />
        </label>
        <label className={label}>Nota (opcional)
          <input className={input} value={form.notes} onChange={(event) => set("notes", event.target.value)} />
        </label>
      </div>
      {!preview.ok ? <p className="text-sm text-amber-800">{preview.errors.join(" ")}</p> : null}
      <Message state={message} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving || !preview.ok} className={`${button} bg-emerald-700 text-white`}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}Registrar pago</button>
        <button type="button" onClick={onCancel} className={`${button} border border-slate-300 bg-white text-slate-700`}>Cancelar</button>
      </div>
    </form>
  );
}

function VoidPaymentForm({ parkingId, authorization, payment, onDone, onCancel }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  if (!payment) return null;
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await api(`/api/pago-liberado/estacionamientos/${parkingId}/autorizaciones/${authorization.id}/pagos/${payment.id}`, { method: "PATCH", body: JSON.stringify({ action: "VOID", reason }) });
      onDone();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
      <p className="w-full text-sm font-bold text-amber-900">Anular el pago de {authorization.licensePlate} ({describePayment(payment)}): queda en el historial y la autorización vuelve a &quot;Pago pendiente&quot;.</p>
      <label className={`${label} flex-1`}>Motivo<input className={input} required minLength={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <button type="submit" disabled={saving} className={`${button} bg-amber-700 text-white`}>Anular pago</button>
      <button type="button" onClick={onCancel} className={`${button} border border-slate-300 bg-white text-slate-700`}>Cancelar</button>
      <div className="w-full"><Message state={message} /></div>
    </form>
  );
}

// ------------------------------------------------------------------
// Detalle por estacionamiento
// ------------------------------------------------------------------
function ParkingDetail({ parkingId, permissions, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [revoking, setRevoking] = useState(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [showRevoked, setShowRevoked] = useState(false);
  const [paying, setPaying] = useState(null);

  const load = useCallback(async () => {
    try {
      const body = await api(`/api/pago-liberado/estacionamientos/${parkingId}`);
      setError("");
      setDetail(body.data);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [parkingId]);
  // El padre monta un detalle nuevo por estacionamiento (key), así que no
  // hay estado previo que limpiar aquí.
  useEffect(() => {
    let active = true;
    api(`/api/pago-liberado/estacionamientos/${parkingId}`)
      .then((body) => { if (active) setDetail(body.data); })
      .catch((loadError) => { if (active) setError(loadError.message); });
    return () => { active = false; };
  }, [parkingId]);

  const refresh = () => { void load(); onChanged(); };

  async function revoke(event) {
    event.preventDefault();
    try {
      await api(`/api/pago-liberado/estacionamientos/${parkingId}/autorizaciones/${revoking.id}`, { method: "PATCH", body: JSON.stringify({ action: "REVOKE", reason: revokeReason }) });
      setRevoking(null);
      setRevokeReason("");
      refresh();
    } catch (revokeError) {
      setError(revokeError.message);
    }
  }

  if (error && !detail) return <div className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</div>;
  if (!detail) return <div className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Cargando…</div>;

  const { contract, module, status, statusLabel } = detail;
  const payments = detail.payments || [];
  const tariffs = detail.tariffs || [];
  const disabledForAdmin = status !== "ACTIVE" && status !== "NOT_STARTED";
  const authorizations = detail.authorizations.filter((item) => showRevoked || item.status === "ACTIVE");
  const history = [...detail.moduleEvents, ...detail.authorizationEvents].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const spotsTotal = module?.operationalSpots ?? null;

  return (
    <div className="space-y-5">
      {error ? <div className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</div> : null}
      {status === "NOT_STARTED" ? <div className="rounded-3xl border-2 border-sky-300 bg-sky-50 p-4 text-sm font-semibold text-sky-900">La contratación aún no comienza ({contractPeriodText(contract)}): no se aceptan ingresos con beneficio hasta su inicio.</div> : null}
      {status === "DISABLED" ? (
        <div className="rounded-3xl border-2 border-rose-300 bg-rose-50 p-4 text-rose-900" role="status">
          <p className="text-lg font-black">Módulo desactivado</p>
          <p className="text-sm">No se aceptan nuevos ingresos con beneficio ni nuevas autorizaciones. La información y el historial se conservan; las estadías abiertas salen con las condiciones guardadas al ingreso.{module?.statusReason ? ` Motivo: ${module.statusReason}.` : ""}</p>
        </div>
      ) : null}
      {status === "EXPIRED" ? <div className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">La contratación venció: no se aceptan nuevos ingresos con beneficio ni nuevas autorizaciones hasta que Root registre una extensión contractual (nueva versión). Las estadías abiertas salen con las condiciones de su ingreso.</div> : null}

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-[#041E42]">Contratación ParkFacil</h3>
          <StatusBadge status={status} label={statusLabel} />
        </div>
        {contract ? (
          <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
            <p><strong>Versión {contract.version}:</strong> {describeContract(contract)}</p>
            <p><strong>Vigencia contractual:</strong> {contractPeriodText(contract)} ({contract.termMonths} meses)</p>
            {contract.discountNotes ? <p><strong>Descuentos:</strong> {contract.discountNotes}</p> : null}
            {contract.contractReference ? <p><strong>Referencia contractual:</strong> {contract.contractReference}</p> : null}
            <p><strong>Cupos simultáneos:</strong> {spotsTotal === null ? "sin configurar" : spotsTotal} (definidos por el cliente)</p>
            {contract.crmProposalNumber ? <p><strong>Propuesta CRM:</strong> {contract.crmProposalNumber}</p> : null}
          </div>
        ) : <p className="mt-2 text-sm text-slate-500">Sin contratación registrada. Solo ParkFacil Root puede registrarla.</p>}
        {permissions.isRoot ? (
          <>
            <MonthlyFeeForm key={contract?.id || "nuevo"} parkingId={parkingId} current={contract} onSaved={refresh} />
            {contract ? <ModuleStateForm parkingId={parkingId} enabled={Boolean(module?.enabled)} onSaved={refresh} /> : null}
          </>
        ) : null}
        {detail.contracts.length > 1 ? (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-bold text-slate-700">Versiones anteriores ({detail.contracts.length - 1})</summary>
            <ul className="mt-2 space-y-1">
              {detail.contracts.filter((item) => item.supersededAt).map((item) => (
                <li key={item.id} className="rounded-xl border border-slate-200 p-2">v{item.version}: {describeContract(item)}{item.endsAt ? ` · ${formatLocalDateTime(item.startsAt)} a ${formatLocalDateTime(item.endsAt)}` : ""} · reemplazada {formatLocalDateTime(item.supersededAt)} · motivo: {item.reason}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      {contract ? <SpotsSection key={`cupos-${module?.operationalSpots ?? "sin"}`} parkingId={parkingId} module={module} canEdit={permissions.isAdmin} active={status === "ACTIVE"} onSaved={refresh} /> : null}

      {contract ? <TariffsSection parkingId={parkingId} tariffs={tariffs} history={detail.tariffHistory || []} canEdit={permissions.isAdmin} onSaved={refresh} /> : null}

      {contract ? (
        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-[#041E42]">Autorizaciones por patente</h3>
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600"><input type="checkbox" checked={showRevoked} onChange={(event) => setShowRevoked(event.target.checked)} />Mostrar revocadas</label>
          </div>
          {permissions.isAdmin ? (
            <div className="mt-3 space-y-4">
              {disabledForAdmin ? <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">{statusLabel}: no se pueden crear ni modificar autorizaciones.</p> : null}
              <AuthorizationForm key={`${editing?.id || "nueva"}-${tariffs.map((item) => item.id).join(",")}`} parkingId={parkingId} editing={editing} tariffs={tariffs} contract={contract} disabled={disabledForAdmin} onSaved={() => { setEditing(null); refresh(); }} onCancel={() => setEditing(null)} />
            </div>
          ) : <p className="mt-2 text-xs text-slate-500">Supervisión: las autorizaciones las gestiona el administrador del estacionamiento.</p>}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="p-2">Patente</th><th className="p-2">Beneficiario</th><th className="p-2">Vigencia</th><th className="p-2">Acordado con el beneficiario</th><th className="p-2">Pago</th><th className="p-2">Estado</th>{permissions.isAdmin ? <th className="p-2" /> : null}</tr></thead>
              <tbody>
                {authorizations.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 align-top">
                    <td className="p-2 font-black">{item.licensePlate}</td>
                    <td className="p-2">{item.beneficiaryName || "—"}{item.beneficiaryReference ? <span className="block text-xs text-slate-500">{item.beneficiaryReference}</span> : null}</td>
                    <td className="p-2">{describeAuthorization(item)}</td>
                    <td className={`p-2 ${item.terms ? "" : "text-amber-800"}`}>{describeAuthorizationTerms(item)}</td>
                    <td className="p-2"><PaymentCell authorization={item} payments={payments} /></td>
                    <td className="p-2">{item.status === "ACTIVE" ? `Activa (v${item.version})` : `Revocada: ${item.revokedReason || ""}`}</td>
                    {permissions.isAdmin ? (
                      <td className="p-2 whitespace-nowrap">
                        {item.status === "ACTIVE" ? (
                          <>
                            <button type="button" disabled={disabledForAdmin} onClick={() => setEditing(item)} className="mr-2 font-bold text-[#3150D8] disabled:opacity-50">Modificar</button>
                            {currentPayment(payments, item.id)
                              ? <button type="button" onClick={() => setPaying({ mode: "void", authorization: item })} className="mr-2 font-bold text-amber-800">Anular pago</button>
                              : <button type="button" onClick={() => setPaying({ mode: "register", authorization: item })} className="mr-2 font-bold text-emerald-700">Registrar pago</button>}
                            <button type="button" onClick={() => setRevoking(item)} className="font-bold text-rose-700">Revocar</button>
                          </>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
                {!authorizations.length ? <tr><td colSpan={7} className="p-3 text-slate-500">Sin autorizaciones.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">El monto acordado es lo que el estacionamiento cobra al beneficiario. El beneficio exige la autorización <strong>pagada</strong>: el administrador registra aquí el pago recibido por el total acordado (no se aceptan pagos parciales; ParkFacil no cobra en línea). Con un pago registrado, para cambiar tarifa, cantidad o inicio primero se anula el pago, con motivo.</p>
          {paying?.mode === "register" ? <PaymentForm key={`pago-${paying.authorization.id}`} parkingId={parkingId} authorization={paying.authorization} onDone={() => { setPaying(null); refresh(); }} onCancel={() => setPaying(null)} /> : null}
          {paying?.mode === "void" ? <VoidPaymentForm key={`anular-${paying.authorization.id}`} parkingId={parkingId} authorization={paying.authorization} payment={currentPayment(payments, paying.authorization.id)} onDone={() => { setPaying(null); refresh(); }} onCancel={() => setPaying(null)} /> : null}
          {revoking ? (
            <form onSubmit={revoke} className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-3">
              <p className="w-full text-sm font-bold text-rose-900">Revocar {revoking.licensePlate}: se conserva el historial; una estadía abierta mantiene sus condiciones de ingreso.</p>
              <label className={`${label} flex-1`}>Motivo<input className={input} required minLength={3} value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} /></label>
              <button type="submit" className={`${button} bg-rose-700 text-white`}>Revocar</button>
              <button type="button" onClick={() => setRevoking(null)} className={`${button} border border-slate-300 bg-white text-slate-700`}>Cancelar</button>
            </form>
          ) : null}
        </section>
      ) : null}

      {contract ? (
        <ReleasedPaymentRegularization
          parkingId={parkingId}
          canEdit={permissions.isAdmin}
          openStays={detail.openReleasedStays || []}
          closedStays={detail.recentClosedReleasedStays || []}
          regularizations={detail.regularizations || []}
          authorizations={detail.authorizations}
          onSaved={refresh}
        />
      ) : null}

      {contract ? <ReleasedPaymentReports parkingId={parkingId} parkingLabel={detail.parking?.code || ""} /> : null}

      <section className={card}>
        <h3 className="text-lg font-bold text-[#041E42]">Historial</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {history.map((event) => (
            <li key={event.id} className="rounded-xl border border-slate-200 p-3">
              <p className="font-bold text-[#041E42]">{EVENT_LABELS[event.event_type] || event.event_type} · {formatLocalDateTime(event.created_at)} · {event.actor_role === "system" ? "Sistema (migración)" : `${event.actor_email} (${event.actor_role === "platform_admin" ? "Root" : "Administrador"})`}</p>
              <p><strong>Antes:</strong> {summarizeValues(event.previous_values)}</p>
              <p><strong>Después:</strong> {summarizeValues(event.new_values)}</p>
              <p><strong>Motivo:</strong> {event.reason}</p>
            </li>
          ))}
          {!history.length ? <li className="text-slate-500">Sin cambios registrados.</li> : null}
        </ul>
      </section>
    </div>
  );
}

export default function ReleasedPaymentManager() {
  const [state, setState] = useState({ loading: true, rows: [], permissions: { isRoot: false, isAdmin: false }, error: "", storageReady: true });
  const [selected, setSelected] = useState("");

  const load = useCallback(async () => {
    try {
      const body = await api("/api/pago-liberado/estacionamientos");
      setState({ loading: false, rows: body.data || [], permissions: body.permissions || {}, error: "", storageReady: body.storageReady !== false });
      setSelected((current) => current || body.data?.[0]?.parking?.id || "");
    } catch (error) {
      setState((previous) => ({ ...previous, loading: false, error: error.message }));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (state.loading) return <div className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Cargando…</div>;
  if (state.error) return <div className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{state.error}</div>;
  if (!state.storageReady) return <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Migración pendiente: Pago liberado aún no existe en la base.</div>;

  return (
    <div className="space-y-5">
      <section className={card}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-[#041E42]">Estacionamientos Off Street</h2>
          <button type="button" onClick={() => void load()} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Actualizar"><RefreshCw className="h-4 w-4" /></button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="p-2">Estacionamiento</th>{state.permissions.isRoot ? <th className="p-2">Empresa</th> : null}<th className="p-2">Estado</th><th className="p-2">Contratación</th><th className="p-2">Cupos</th></tr></thead>
            <tbody>
              {state.rows.map((row) => (
                <tr key={row.parking.id} onClick={() => setSelected(row.parking.id)} className={`cursor-pointer border-t border-slate-100 ${selected === row.parking.id ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                  <td className="p-2 font-bold text-[#041E42]">{row.parking.name}<span className="block text-xs font-semibold text-slate-500">{row.parking.code}</span></td>
                  {state.permissions.isRoot ? <td className="p-2">{row.parking.company_name}</td> : null}
                  <td className="p-2"><StatusBadge status={row.status} label={row.statusLabel} /></td>
                  <td className="p-2">{row.contract ? describeContract(row.contract) : "—"}</td>
                  <td className="p-2">{row.contract ? row.module?.operationalSpots ?? "sin configurar" : "—"}</td>
                </tr>
              ))}
              {!state.rows.length ? <tr><td colSpan={5} className="p-3 text-slate-500">No hay estacionamientos Off Street.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
      {selected ? <ParkingDetail key={selected} parkingId={selected} permissions={state.permissions} onChanged={() => void load()} /> : null}
    </div>
  );
}
