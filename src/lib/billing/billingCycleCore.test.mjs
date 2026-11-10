import test from "node:test";
import assert from "node:assert/strict";
import { batchPlan, computeCycle, customerIssues, normalizeCycleConfig, serviceSummary, servicesInPeriod, validatePeriod } from "./billingCycleCore.mjs";

const company = { rut_number: 77991619, rut_dv: "7", business_name: "ParkFacil Operaciones Spa", business_activity: "Estacionamientos", address: "Av. Raúl Labbé 12613", district: "Lo Barnechea", email: "info@parkfacil.cl" };
const item = { status: "ACTIVE", valid_from: "2026-11-01", valid_to: null, tax_category: "TAXABLE" };
const period = "2026-11";
const stateOf = (cycle) => cycle.steps.map((s) => s.state).join(",");

test("configuración: fijas siempre obligatorias y cobro omitido", () => {
  const cfg = normalizeCycleConfig({ datos: { use: "off" }, revision: { use: "off", run: "auto", who: "Finanzas" }, cobro: { use: "req" }, envio: { who: "Otro" } });
  assert.equal(cfg.datos.use, "req");
  assert.deepEqual(cfg.revision, { use: "off", run: "auto", who: "Finanzas" });
  assert.equal(cfg.cobro.use, "off");
  assert.equal(cfg.envio.who, "Sistema");
  assert.throws(() => validatePeriod("2026-13"), (e) => e.code === "CYCLE_PERIOD_INVALID");
});

test("datos del cliente: RUT con dígito malo y campos faltantes", () => {
  assert.deepEqual(customerIssues(company), []);
  const issues = customerIssues({ ...company, rut_number: 13744807, rut_dv: "9", email: "" });
  assert.match(issues[0], /dígito verificador/);
  assert.match(issues[1], /correo/);
});

test("servicios del período: vigencia y sin IVA", () => {
  const r = servicesInPeriod([item, { ...item, valid_to: "2026-10-31" }, { ...item, tax_category: "UNDEFINED" }, { ...item, status: "INACTIVE" }], period);
  assert.equal(r.active.length, 2);
  assert.equal(r.untaxed.length, 1);
});

test("detalle de servicios: descripción, cantidad y precio para la etapa Servicios", () => {
  const s = serviceSummary({ id: "i1", concept_code: "SERV-01", description: "Cuota mensual ParkFacil", quantity: "2", unit: "mes", unit_price: "1.5", currency: "UF", tax_category: "TAXABLE" });
  assert.deepEqual(s, { id: "i1", code: "SERV-01", description: "Cuota mensual ParkFacil", quantity: 2, unit: "mes", unitPrice: 1.5, currency: "UF", taxCategory: "TAXABLE" });
  const c = computeCycle({ company, items: [{ ...item, description: "Cuota", quantity: 1, unit_price: 1.5, currency: "UF" }], period });
  assert.equal(c.services.list.length, 1);
  assert.equal(c.services.list[0].unitPrice, 1.5);
});

test("empresa nueva en el mes: etapa 1 a mano; con datos confirmados avanza a servicios", () => {
  let c = computeCycle({ company, items: [item], period });
  assert.equal(c.stage, 1);
  assert.equal(stateOf(c), "cur,lock,lock,lock,lock,lock,lock,off");
  c = computeCycle({ company, items: [item], period, confirmations: ["datos"] });
  assert.equal(c.stage, 2);
  c = computeCycle({ company, items: [item], period, confirmations: ["datos", "servicios"] });
  assert.equal(c.stage, 3);
});

test("RUT inválido detiene en Datos aunque ya exista prefactura", () => {
  const c = computeCycle({ company: { ...company, rut_number: 13744807, rut_dv: "9" }, items: [item], period, preinvoice: { status: "READY_TO_ISSUE" } });
  assert.equal(c.stage, 1);
  assert.equal(c.steps[0].state, "err");
  assert.match(c.problem, /dígito verificador/);
});

test("prefactura calculada → revisión; revisión opcional se confirma; aprobada → emisión", () => {
  let c = computeCycle({ company, items: [item], period, preinvoice: { status: "CALCULATED" } });
  assert.equal(c.stage, 4);
  c = computeCycle({ company, items: [item], period, preinvoice: { status: "UNDER_REVIEW" }, confirmations: ["revision"] });
  assert.equal(c.stage, 5);
  c = computeCycle({ company, items: [item], period, preinvoice: { status: "APPROVED" } });
  assert.equal(c.stage, 6);
  c = computeCycle({ company, items: [item], period, preinvoice: { status: "CALCULATED" }, config: { revision: { use: "off" } } });
  assert.equal(c.stage, 5);
  assert.equal(c.steps[3].state, "off");
});

test("emisión rechazada es problema; emitida y correo enviado termina el ciclo", () => {
  let c = computeCycle({ company, items: [item], period, preinvoice: { status: "PROVIDER_REJECTED" }, invoice: { status: "PROVIDER_REJECTED", provider_status: "OF-02" } });
  assert.equal(c.stage, 6);
  assert.match(c.problem, /OF-02/);
  c = computeCycle({ company, items: [item], period, preinvoice: { status: "ISSUED" }, invoice: { status: "ISSUED", email_status: null } });
  assert.equal(c.stage, 7);
  c = computeCycle({ company, items: [item], period, preinvoice: { status: "ISSUED" }, invoice: { status: "ISSUED", email_status: "SENT" } });
  assert.equal(c.finished, true);
  assert.equal(c.stage, 9);
  assert.equal(c.progress, 100);
  c = computeCycle({ company, items: [item], period, preinvoice: { status: "ISSUED" }, invoice: { status: "ISSUED", email_status: "FAILED", email_error: "buzón lleno" } });
  assert.match(c.problem, /buzón lleno/);
});

test("sin servicios ni prefactura: problema en Servicios", () => {
  const c = computeCycle({ company, items: [], period, confirmations: ["datos"] });
  assert.equal(c.stage, 2);
  assert.match(c.problem, /servicios activos/);
});

test("plan del lote: de la etapa actual a la emisión, se detiene ante problemas", () => {
  assert.deepEqual(batchPlan(computeCycle({ company, items: [item], period })).steps, ["datos", "servicios", "prefactura", "revision", "aprobacion", "emision"]);
  assert.deepEqual(batchPlan(computeCycle({ company, items: [item], period, preinvoice: { status: "APPROVED" } })).steps, ["emision"]);
  assert.match(batchPlan(computeCycle({ company: { ...company, email: "" }, items: [item], period })).stop, /correo/);
  assert.ok(batchPlan(computeCycle({ company, items: [item], period, preinvoice: { status: "ISSUED" }, invoice: { status: "ISSUED" } })).skip);
});

test("lo aprobado o emitido no retrocede por cambios posteriores en servicios o datos", () => {
  const untaxed = { ...item, tax_category: "UNDEFINED" };
  let c = computeCycle({ company, items: [item, untaxed], period, preinvoice: { status: "APPROVED" } });
  assert.equal(c.stage, 6);
  c = computeCycle({ company, items: [item, untaxed], period, preinvoice: { status: "CALCULATED" }, confirmations: ["datos"] });
  assert.equal(c.stage, 2);
  c = computeCycle({ company: { ...company, email: "" }, items: [item], period, preinvoice: { status: "ISSUED" }, invoice: { status: "ISSUED", email_status: "SENT" } });
  assert.equal(c.finished, true);
});
