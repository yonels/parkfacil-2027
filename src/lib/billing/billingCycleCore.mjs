// «Ciclo de facturación» por etapas (SOL-2026-11-05-005; prototipo aprobado 2026-11-08). Código puro: deduce en qué
// etapa está cada empresa en un período a partir de sus datos, servicios, prefactura, factura y confirmaciones.
// Orden fijo: cada etapa requiere la anterior. La configuración decide si una etapa es obligatoria, opcional u omitida.
import { isValidRut } from "./rutCore.mjs";

export const CYCLE_STEPS = Object.freeze([
  { key: "datos", n: 1, name: "Datos del cliente", short: "Datos", question: "¿El cliente está bien identificado ante el SII?" },
  { key: "servicios", n: 2, name: "Servicios a facturar", short: "Servicios", question: "¿Qué se le cobra este mes y a qué precio?" },
  { key: "prefactura", n: 3, name: "Prefactura", short: "Prefactura", question: "¿Cuánto suma el mes?" },
  { key: "revision", n: 4, name: "Revisión y ajustes", short: "Revisión", question: "¿Hay algo extra o algo que corregir?" },
  { key: "aprobacion", n: 5, name: "Aprobación", short: "Aprobación", question: "¿Está todo correcto para facturar?" },
  { key: "emision", n: 6, name: "Emisión DTE", short: "Emisión", question: "¿Se emitió la factura en el SII?" },
  { key: "envio", n: 7, name: "Envío y estado SII", short: "Envío", question: "¿El cliente la recibió y el SII la aceptó?" },
  { key: "cobro", n: 8, name: "Cobro", short: "Cobro", question: "¿Se pagó?" },
]);

// Datos, Aprobación y Emisión siempre obligatorias; Cobro queda omitida hasta desarrollar F3.
export const FIXED_REQUIRED = Object.freeze(["datos", "aprobacion", "emision"]);
export const NOT_AVAILABLE = Object.freeze(["cobro"]);
export const CYCLE_USES = Object.freeze({ req: "Obligatoria", opt: "Opcional", off: "Omitida" });
export const CYCLE_RUNS = Object.freeze({ manual: "A mano", auto: "Automática" });
export const CYCLE_ROLES = Object.freeze(["Root", "Finanzas", "Sistema"]);
export const DEFAULT_CYCLE_CONFIG = Object.freeze({
  datos: { use: "req", run: "manual", who: "Root" }, servicios: { use: "req", run: "manual", who: "Root" },
  prefactura: { use: "req", run: "auto", who: "Sistema" }, revision: { use: "opt", run: "manual", who: "Root" },
  aprobacion: { use: "req", run: "manual", who: "Root" }, emision: { use: "req", run: "manual", who: "Root" },
  envio: { use: "req", run: "auto", who: "Sistema" }, cobro: { use: "off", run: "manual", who: "Root" },
});
// Etapas que se confirman a mano (las demás se deducen de la prefactura, la factura y el correo).
export const CONFIRMABLE_STEPS = Object.freeze(["datos", "servicios", "revision", "envio"]);

export class CycleError extends Error {
  constructor(code, message, status = 422) { super(message); this.name = "CycleError"; this.code = code; this.status = status; }
}

export function normalizeCycleConfig(input = {}) {
  const out = {};
  for (const step of CYCLE_STEPS) {
    const base = DEFAULT_CYCLE_CONFIG[step.key];
    const value = input && typeof input[step.key] === "object" ? input[step.key] : {};
    let use = Object.hasOwn(CYCLE_USES, value.use) ? value.use : base.use;
    if (FIXED_REQUIRED.includes(step.key)) use = "req";
    if (NOT_AVAILABLE.includes(step.key)) use = "off";
    const run = Object.hasOwn(CYCLE_RUNS, value.run) ? value.run : base.run;
    const who = CYCLE_ROLES.includes(value.who) ? value.who : base.who;
    out[step.key] = { use, run, who };
  }
  return out;
}

export function periodOf(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

export function validatePeriod(period) {
  const text = String(period || "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(text)) throw new CycleError("CYCLE_PERIOD_INVALID", "El período debe tener el formato AAAA-MM.");
  return text;
}

// Datos tributarios mínimos para emitir (los mismos que pide Haulmer más el correo de envío).
export function customerIssues(company = {}) {
  const issues = [];
  const rut = company.rut_number ? `${company.rut_number}-${company.rut_dv || ""}` : "";
  if (!rut) issues.push("Falta el RUT.");
  else if (!isValidRut(rut)) issues.push(`RUT ${rut} con dígito verificador inválido.`);
  if (!String(company.business_name || "").trim()) issues.push("Falta la razón social.");
  if (!String(company.business_activity || "").trim()) issues.push("Falta el giro.");
  if (!String(company.address || "").trim()) issues.push("Falta la dirección.");
  if (!String(company.district || "").trim()) issues.push("Falta la comuna.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(company.email || "").trim())) issues.push("Falta un correo de facturación válido.");
  return issues;
}

// Servicios activos del período (vigentes en algún día del mes) y cuántos no tienen IVA definido.
export function servicesInPeriod(items = [], period) {
  const from = `${period}-01`;
  const [y, m] = period.split("-").map(Number);
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const active = items.filter((item) => item.status === "ACTIVE" && item.valid_from <= to && (!item.valid_to || item.valid_to >= from));
  const untaxed = active.filter((item) => !item.tax_category || item.tax_category === "UNDEFINED");
  return { active, untaxed };
}

// Detalle de un servicio para mostrarlo antes de confirmar la etapa «Servicios» (descripción, cantidad, precio).
export function serviceSummary(item = {}) {
  return {
    id: item.id || null, code: item.concept_code || "", description: item.description || "",
    quantity: Number(item.quantity ?? 1), unit: item.unit || "", unitPrice: Number(item.unit_price ?? 0), currency: item.currency || "UF",
    taxCategory: item.tax_category || "UNDEFINED",
  };
}

const APPROVED_OR_LATER = ["APPROVED", "READY_TO_ISSUE", "ISSUING", "ISSUED", "PROVIDER_PENDING", "PROVIDER_REJECTED", "ISSUE_ERROR"];

// Estado del ciclo de una empresa. Devuelve cada etapa con state: ok | cur | err | wait | lock | off, la etapa actual
// (número; 9 = terminado) y el problema que la detiene, si lo hay.
export function computeCycle({ company, items = [], preinvoice = null, invoice = null, confirmations = [], config = DEFAULT_CYCLE_CONFIG, period }) {
  const cfg = normalizeCycleConfig(config);
  const confirmed = new Set(confirmations);
  const issues = customerIssues(company);
  const { active, untaxed } = servicesInPeriod(items, period);
  const hasPreinvoice = Boolean(preinvoice && preinvoice.status !== "CANCELLED");
  const status = hasPreinvoice ? preinvoice.status : null;
  const auto = (key) => cfg[key].run === "auto";

  // done: la etapa está completa; problem: no puede completarse sin corregir algo; waiting: en curso (sin acción).
  // Lo ya aprobado o emitido no retrocede: datos y servicios posteriores no cambian esa prefactura ni esa factura.
  const frozen = APPROVED_OR_LATER.includes(status);
  const evaluation = {
    datos: invoice?.status === "ISSUED" ? { done: true } : issues.length ? { done: false, problem: issues.join(" ") } : { done: auto("datos") || confirmed.has("datos") || hasPreinvoice },
    servicios: frozen ? { done: true } : !active.length ? { done: hasPreinvoice, problem: hasPreinvoice ? null : "No tiene servicios activos en el período." }
      : untaxed.length ? { done: false, problem: `${untaxed.length} servicio(s) sin IVA definido en el catálogo.` }
      : { done: auto("servicios") || confirmed.has("servicios") || hasPreinvoice },
    prefactura: { done: hasPreinvoice },
    revision: { done: confirmed.has("revision") || APPROVED_OR_LATER.includes(status) || (auto("revision") && hasPreinvoice) },
    aprobacion: { done: APPROVED_OR_LATER.includes(status) },
    emision: invoice?.status === "ISSUED" ? { done: true }
      : invoice && ["PROVIDER_REJECTED", "ISSUE_ERROR"].includes(invoice.status) ? { done: false, problem: invoice.status === "PROVIDER_REJECTED" ? `Rechazada por el proveedor${invoice.provider_status ? ` (${invoice.provider_status})` : ""}: descártela, corrija y vuelva a emitir.` : "Error de emisión: reintente o descarte." }
      : invoice && ["ISSUING", "PROVIDER_PENDING"].includes(invoice.status) ? { done: false, waiting: "Emisión en curso." }
      : { done: false },
    envio: invoice?.email_status === "FAILED" && !confirmed.has("envio") ? { done: false, problem: `No se pudo enviar el correo${invoice.email_error ? `: ${invoice.email_error}` : ""}.` }
      : { done: ["SENT", "SKIPPED"].includes(invoice?.email_status) || confirmed.has("envio") },
    cobro: { done: false },
  };

  let current = null;
  const steps = CYCLE_STEPS.map((step) => {
    const use = cfg[step.key].use;
    const result = evaluation[step.key];
    if (use === "off") return { ...step, use, run: cfg[step.key].run, who: cfg[step.key].who, state: "off" };
    if (current === null && !result.done) {
      current = step.n;
      return { ...step, use, run: cfg[step.key].run, who: cfg[step.key].who, state: result.problem ? "err" : result.waiting ? "wait" : "cur", problem: result.problem || null, waiting: result.waiting || null };
    }
    return { ...step, use, run: cfg[step.key].run, who: cfg[step.key].who, state: current === null ? "ok" : "lock", problem: current === null ? null : result.problem || null };
  });
  const currentStep = steps.find((step) => step.n === current) || null;
  const enabled = steps.filter((step) => step.state !== "off");
  return {
    steps,
    stage: current ?? 9,
    finished: current === null,
    problem: currentStep?.problem || null,
    progress: enabled.length ? Math.round((enabled.filter((step) => step.state === "ok").length / enabled.length) * 100) : 100,
    services: { active: active.length, untaxed: untaxed.length, list: active.map(serviceSummary) },
    customerIssues: issues,
  };
}

// Pasos que ejecuta «Facturar en lote» desde la etapa actual hasta la emisión. Las etapas con problema detienen el lote
// para esa empresa (sin afectar a las demás).
export function batchPlan(cycle) {
  if (cycle.finished || cycle.stage > 6) return { skip: "Ya está emitida.", steps: [] };
  const current = cycle.steps.find((step) => step.n === cycle.stage);
  if (current?.state === "err") return { stop: current.problem, stopAt: current.short, steps: [] };
  if (current?.state === "wait") return { skip: current.waiting, steps: [] };
  return { steps: cycle.steps.filter((step) => step.n >= cycle.stage && step.n <= 6 && step.state !== "off").map((step) => step.key) };
}
