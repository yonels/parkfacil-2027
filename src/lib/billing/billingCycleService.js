import "server-only";
import { batchPlan, computeCycle, CycleError, CYCLE_STEPS, normalizeCycleConfig, validatePeriod } from "./billingCycleCore.mjs";
import { isValidRut } from "./rutCore.mjs";
import { normalizeRut } from "./dteRegistryCore.mjs";
import { calculatePeriodPreinvoices } from "./preinvoiceRepository";
import { transitionPreinvoice } from "./billingWorkflowRepository";
import { emailIssuedDocument, enqueueAndProcessInvoice } from "./documentIssuanceService";
import { activeProviderName, providerFor } from "./providers/providerResolver";
import { readSettingsRow } from "./settingsRepository";
import { UfRateService } from "./ufRateService";

// «Ciclo de facturación» por etapas (SOL-2026-11-05-005; prototipo aprobado 2026-11-08). Reutiliza el flujo existente:
// cálculo de prefacturas, transiciones (revisión, aprobación, lista para emitir), emisión con el proveedor configurado y
// envío del correo. Solo agrega confirmaciones manuales por empresa y período y la configuración de etapas.
const COMPANY_COLUMNS = "id,business_name,rut_number,rut_dv,business_activity,address,district,city,email,status";
const ACTIVE_PREINVOICE = ["CALCULATED", "UNDER_REVIEW", "APPROVED", "READY_TO_ISSUE", "ISSUING", "ISSUED", "PROVIDER_PENDING", "PROVIDER_REJECTED", "ISSUE_ERROR"];
const PAUSE_MS = 700;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(error, message) {
  if (!error) return;
  const wrapped = new Error(`${message}: ${error.message}`);
  wrapped.code = error.code;
  throw wrapped;
}
const one = (value) => (Array.isArray(value) ? value[0] : value);

export async function getCycleConfig(db) {
  const settings = await readSettingsRow(db);
  const result = await db.from("billing_settings").select("cycle_config").eq("id", 1).maybeSingle();
  fail(result.error, "No fue posible leer la configuración del ciclo");
  return { config: normalizeCycleConfig(result.data?.cycle_config || {}), provider: settings.invoice_provider || "SIMULATED", environment: settings.provider_environment || "TEST" };
}

export async function saveCycleConfig(db, input, actorId) {
  const config = normalizeCycleConfig(input);
  const previous = await db.from("billing_settings").select("cycle_config").eq("id", 1).maybeSingle();
  fail(previous.error, "No fue posible leer la configuración del ciclo");
  const result = await db.from("billing_settings").upsert({ id: 1, cycle_config: config, updated_by: actorId || null, updated_at: new Date().toISOString() });
  fail(result.error, "No fue posible guardar la configuración del ciclo");
  const audit = await db.from("billing_settings_audit").insert({ actor_id: actorId || null, previous_value: { cycle_config: previous.data?.cycle_config || {} }, new_value: { cycle_config: config } });
  fail(audit.error, "No fue posible registrar la auditoría");
  return config;
}

// Todo lo que el ciclo necesita de un período, en pocas consultas.
async function loadPeriodData(db, period, companyIds = null) {
  let companiesQuery = db.from("companies").select(COMPANY_COLUMNS).eq("relationship_type", "client").order("business_name");
  if (companyIds) companiesQuery = companiesQuery.in("id", companyIds);
  const companies = await companiesQuery;
  fail(companies.error, "No fue posible leer las empresas");
  const ids = (companies.data || []).map((company) => company.id);
  if (!ids.length) return { companies: [], items: [], preinvoices: [], invoices: [], confirmations: [] };
  const [items, preinvoices, confirmations] = await Promise.all([
    db.from("contract_billable_items").select("id,company_id,status,valid_from,valid_to,description,quantity,unit,unit_price,currency,billable_concepts(code,tax_category)").in("company_id", ids),
    db.from("billing_preinvoices").select("id,company_id,internal_number,status,version,currency,net_amount,tax_amount,total_amount,created_at").eq("period", period).in("company_id", ids).in("status", ACTIVE_PREINVOICE).order("created_at", { ascending: false }),
    db.from("billing_cycle_confirmations").select("company_id,step").eq("period", period).in("company_id", ids),
  ]);
  fail(items.error, "No fue posible leer los servicios");
  fail(preinvoices.error, "No fue posible leer las prefacturas");
  fail(confirmations.error, "No fue posible leer las confirmaciones del ciclo");
  const preinvoiceIds = (preinvoices.data || []).map((p) => p.id);
  const invoices = preinvoiceIds.length
    ? await db.from("billing_documents").select("id,preinvoice_id,status,folio,provider,provider_status,total_amount,email_status,email_error,email_to,created_at").eq("document_type", "INVOICE").neq("status", "DISCARDED").in("preinvoice_id", preinvoiceIds).order("created_at", { ascending: false })
    : { data: [] };
  fail(invoices.error, "No fue posible leer las facturas");
  return { companies: companies.data || [], items: (items.data || []).map((x) => ({ ...x, tax_category: one(x.billable_concepts)?.tax_category || "UNDEFINED", concept_code: one(x.billable_concepts)?.code || "" })), preinvoices: preinvoices.data || [], invoices: invoices.data || [], confirmations: confirmations.data || [] };
}

function cycleRow(company, data, config, period) {
  const preinvoice = data.preinvoices.find((p) => p.company_id === company.id) || null;
  const invoice = preinvoice ? data.invoices.find((d) => d.preinvoice_id === preinvoice.id) || null : null;
  const cycle = computeCycle({
    company, period, config, preinvoice, invoice,
    items: data.items.filter((x) => x.company_id === company.id),
    confirmations: data.confirmations.filter((c) => c.company_id === company.id).map((c) => c.step),
  });
  return {
    company: { id: company.id, name: company.business_name, rut: company.rut_number ? `${company.rut_number}-${company.rut_dv}` : "", status: company.status, businessActivity: company.business_activity || "", address: company.address || "", district: company.district || "", city: company.city || "", email: company.email || "" },
    preinvoice: preinvoice ? { id: preinvoice.id, number: preinvoice.internal_number, status: preinvoice.status, version: preinvoice.version, currency: preinvoice.currency, net: Number(preinvoice.net_amount), tax: Number(preinvoice.tax_amount), total: Number(preinvoice.total_amount) } : null,
    invoice: invoice ? { id: invoice.id, status: invoice.status, folio: invoice.folio, provider: invoice.provider, providerStatus: invoice.provider_status, total: Number(invoice.total_amount), emailStatus: invoice.email_status, emailTo: invoice.email_to, emailError: invoice.email_error } : null,
    ...cycle,
  };
}

export async function getCycle(db, period) {
  validatePeriod(period);
  const { config, provider, environment } = await getCycleConfig(db);
  const data = await loadPeriodData(db, period);
  const rows = data.companies.map((company) => cycleRow(company, data, config, period));
  const funnel = Object.fromEntries([...CYCLE_STEPS.map((s) => [s.n, 0]), [9, 0]]);
  for (const row of rows) funnel[row.stage] += 1;
  return { period, config, provider, environment, rows, funnel };
}

async function getCompanyCycle(db, period, companyId) {
  const { config } = await getCycleConfig(db);
  const data = await loadPeriodData(db, period, [companyId]);
  const company = data.companies[0];
  if (!company) throw new CycleError("CYCLE_COMPANY_NOT_FOUND", "La empresa no existe o no es cliente.", 404);
  return { row: cycleRow(company, data, config, period), config };
}

async function confirm(db, companyId, period, step, actorId) {
  const result = await db.from("billing_cycle_confirmations").upsert({ company_id: companyId, period, step, confirmed_by: actorId || null, confirmed_at: new Date().toISOString() });
  fail(result.error, "No fue posible guardar la confirmación");
}

// Corrige los datos tributarios desde la etapa «Datos del cliente».
async function saveCustomer(db, companyId, input = {}) {
  const rut = normalizeRut(input.rut);
  if (!rut || !isValidRut(rut)) throw new CycleError("CYCLE_RUT_INVALID", "El RUT no es válido: revise el dígito verificador.");
  const [number, dv] = rut.split("-");
  const text = (value, max) => String(value ?? "").trim().slice(0, max);
  const changes = { rut_number: Number(number), rut_dv: dv, business_name: text(input.businessName, 200), business_activity: text(input.businessActivity, 200), address: text(input.address, 200), district: text(input.district, 100), city: text(input.city, 100), email: text(input.email, 200), updated_at: new Date().toISOString() };
  if (!changes.business_name) throw new CycleError("CYCLE_NAME_REQUIRED", "La razón social es obligatoria.");
  const result = await db.from("companies").update(changes).eq("id", companyId);
  if (result.error?.code === "23505") throw new CycleError("CYCLE_RUT_DUPLICATE", "Ya existe otra empresa con ese RUT.");
  fail(result.error, "No fue posible guardar los datos de la empresa");
}

const TRANSITIONS = { REVIEW: { target: "UNDER_REVIEW", action: "REVIEW_STARTED" }, APPROVE: { target: "APPROVED", action: "APPROVED" }, READY: { target: "READY_TO_ISSUE", action: "MARKED_READY_TO_ISSUE" } };
async function move(db, row, key, actorId, warnings) {
  const result = await transitionPreinvoice(db, row.preinvoice.id, { ...TRANSITIONS[key], actorId, expectedVersion: row.preinvoice.version, requestId: `ciclo-${row.preinvoice.id}-${key}-${row.preinvoice.version}` });
  for (const warning of result.warnings || []) warnings.push(warning.message);
  row.preinvoice = { ...row.preinvoice, status: result.status, version: result.version };
}

// Ejecuta la etapa actual de una empresa. Las etapas siguientes configuradas como «automáticas» se ejecutan a
// continuación, hasta llegar a una manual, a un problema o al final.
export async function runCycleStep(db, { companyId, period, step, actorId, payload = {}, invoiceDate, ufRateService = new UfRateService() }) {
  validatePeriod(period);
  const warnings = [];
  let { row } = await getCompanyCycle(db, period, companyId);
  if (step !== CYCLE_STEPS.find((s) => s.n === row.stage)?.key && !(step === "datos" && payload.customer)) {
    throw new CycleError("CYCLE_STEP_NOT_CURRENT", `La etapa actual de la empresa es «${CYCLE_STEPS.find((s) => s.n === row.stage)?.short || "terminada"}»: no se pueden saltar etapas.`, 409);
  }
  let next = step;
  for (let guard = 0; next && guard < 8; guard += 1) {
    await executeStep(db, { row, step: next, companyId, period, actorId, payload: next === step ? payload : {}, invoiceDate, ufRateService, warnings });
    ({ row } = await getCompanyCycle(db, period, companyId));
    const current = row.steps.find((s) => s.n === row.stage);
    next = current && current.state === "cur" && current.run === "auto" ? current.key : null;
  }
  return { row, warnings };
}

async function executeStep(db, { row, step, companyId, period, actorId, payload, invoiceDate, ufRateService, warnings }) {
  const current = row.steps.find((s) => s.key === step);
  switch (step) {
    case "datos": {
      if (payload.customer) await saveCustomer(db, companyId, payload.customer);
      const refreshed = (await getCompanyCycle(db, period, companyId)).row;
      if (refreshed.customerIssues.length) throw new CycleError("CYCLE_CUSTOMER_INVALID", refreshed.customerIssues.join(" "));
      await confirm(db, companyId, period, "datos", actorId);
      return;
    }
    case "servicios":
      if (current?.state === "err") throw new CycleError("CYCLE_SERVICES_INVALID", current.problem);
      await confirm(db, companyId, period, "servicios", actorId);
      return;
    case "prefactura": {
      const result = await calculatePeriodPreinvoices(db, { period, actorId, companyId, idempotencyKey: `ciclo-${companyId}-${period}-${Date.now()}`, ufRateService });
      // Respuesta: { period, results: [{ id } | { status: "BLOCKED", code, message }] }.
      const results = result?.results || [];
      const blocked = results.find((r) => r.status === "BLOCKED");
      if (!results.some((r) => r.id)) throw new CycleError(blocked?.code || "CYCLE_PREINVOICE_FAILED", blocked?.message || "No se generó la prefactura: revise los servicios y el contrato de la empresa.");
      return;
    }
    case "revision":
      if (row.preinvoice?.status === "CALCULATED") await move(db, row, "REVIEW", actorId, warnings);
      await confirm(db, companyId, period, "revision", actorId);
      return;
    case "aprobacion":
      if (!row.preinvoice) throw new CycleError("CYCLE_PREINVOICE_MISSING", "No hay prefactura del período.");
      if (row.preinvoice.status === "CALCULATED") await move(db, row, "REVIEW", actorId, warnings);
      if (row.preinvoice.status === "UNDER_REVIEW") await move(db, row, "APPROVE", actorId, warnings);
      return;
    case "emision": {
      if (current?.state === "err") throw new CycleError("CYCLE_EMISSION_BLOCKED", current.problem);
      if (row.preinvoice.status === "APPROVED") await move(db, row, "READY", actorId, warnings);
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(invoiceDate || "")) ? invoiceDate : new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
      const provider = await providerFor(db, await activeProviderName(db));
      const issued = await enqueueAndProcessInvoice({ db, provider, ufRateService, preinvoiceId: row.preinvoice.id, invoiceDate: date, idempotencyKey: `ciclo-${row.preinvoice.id}-v${row.preinvoice.version}`, actorId });
      const status = issued.processed?.documentStatus || issued.status;
      if (["PROVIDER_REJECTED", "ISSUE_ERROR", "FAILED"].includes(status)) warnings.push("El proveedor no emitió la factura: revise el detalle en la etapa Emisión.");
      return;
    }
    case "envio": {
      if (payload.confirmOnly) { await confirm(db, companyId, period, "envio", actorId); return; }
      if (!row.invoice) throw new CycleError("CYCLE_INVOICE_MISSING", "No hay factura emitida.");
      const email = await emailIssuedDocument(db, row.invoice.id);
      if (email?.status === "FAILED") warnings.push(`Correo no enviado: ${email.reason || "error"}`);
      return;
    }
    default:
      throw new CycleError("CYCLE_STEP_UNAVAILABLE", "Esta etapa aún no está disponible.");
  }
}

// «Facturar en lote»: cada empresa avanza desde su etapa actual hasta la emisión (y el envío, si es automático).
// Las que tienen un problema se detienen ahí, sin afectar a las demás.
export async function runCycleBatch(db, { companyIds, period, invoiceDate, actorId, ufRateService = new UfRateService() }) {
  validatePeriod(period);
  const results = [];
  for (const [index, companyId] of companyIds.entries()) {
    if (index) await sleep(PAUSE_MS);
    let row;
    try {
      ({ row } = await getCompanyCycle(db, period, companyId));
      const plan = batchPlan(row);
      if (plan.stop) { results.push({ companyId, name: row.company.name, ok: false, stoppedAt: plan.stopAt, error: plan.stop }); continue; }
      if (plan.skip) { results.push({ companyId, name: row.company.name, ok: true, skipped: plan.skip, folio: row.invoice?.folio || null }); continue; }
      const warnings = [];
      for (let guard = 0; guard < 8; guard += 1) {
        const current = row.steps.find((s) => s.n === row.stage);
        if (!current || row.stage > 6 || current.state !== "cur") break;
        await executeStep(db, { row, step: current.key, companyId, period, actorId, payload: {}, invoiceDate, ufRateService, warnings });
        ({ row } = await getCompanyCycle(db, period, companyId));
      }
      // Envío automático después de emitir.
      const envio = row.steps.find((s) => s.key === "envio");
      if (row.stage === 7 && envio?.run === "auto" && envio.state === "cur") {
        await executeStep(db, { row, step: "envio", companyId, period, actorId, payload: {}, invoiceDate, ufRateService, warnings });
        ({ row } = await getCompanyCycle(db, period, companyId));
      }
      const stopped = row.stage <= 6 ? row.steps.find((s) => s.n === row.stage) : null;
      results.push({ companyId, name: row.company.name, ok: !stopped, stoppedAt: stopped?.short || null, error: stopped?.problem || stopped?.waiting || null, folio: row.invoice?.folio || null, total: row.invoice?.total ?? row.preinvoice?.total ?? null, emailStatus: row.invoice?.emailStatus || null, warnings });
    } catch (error) {
      results.push({ companyId, name: row?.company?.name || companyId, ok: false, stoppedAt: row ? CYCLE_STEPS.find((s) => s.n === row.stage)?.short : null, error: error.message || "No fue posible avanzar." });
    }
  }
  return { period, results, issued: results.filter((r) => r.ok && r.folio && !r.skipped).length, stopped: results.filter((r) => !r.ok).length };
}
