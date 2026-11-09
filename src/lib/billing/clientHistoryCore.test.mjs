import test from "node:test";
import assert from "node:assert/strict";
import { buildClientHistory, invoiceStatus } from "./clientHistoryCore.mjs";

const today = "2026-11-09";
const inv = (over = {}) => ({ id: "f1", document_type: "INVOICE", provider: "haulmer", folio: "204997", status: "ISSUED", total_amount: "73703", invoice_date: "2026-11-08", due_date: "2026-11-15", preinvoice_id: "p1", created_at: "2026-11-08T16:24:00Z", updated_at: "2026-11-08T16:30:00Z", provider_status: "SII: Aceptado", email_status: "SENT", email_to: "info@parkfacil.cl", email_sent_at: "2026-11-08T16:24:05Z", ...over });
const note = (over = {}) => ({ id: "n1", document_type: "CREDIT_NOTE", document_reference_id: "f1", provider: "haulmer", folio: "118169", status: "ISSUED", total_amount: "73703", correction_mode: "TOTAL", reason: "Error de facturacion", created_at: "2026-11-08T16:57:00Z", ...over });

test("estado de la factura: anulada, parcial, pagada, vencida, importada", () => {
  assert.equal(invoiceStatus({ total: 100, credited: 100, debited: 0, paid: 0, fullNoteFolio: "118169", today }).label, "Anulada con nota de crédito 118169");
  assert.equal(invoiceStatus({ total: 100, credited: 10, debited: 0, paid: 0, dueDate: "2026-12-01", today }).label, "Con nota de crédito parcial");
  assert.equal(invoiceStatus({ total: 100, credited: 0, debited: 0, paid: 100, today }).label, "Pagada");
  assert.equal(invoiceStatus({ total: 100, credited: 0, debited: 0, paid: 0, dueDate: "2026-11-01", today }).label, "Vencida");
  assert.equal(invoiceStatus({ imported: true, total: 100, credited: 0, debited: 0, paid: 0, today }).label, "Importada · pagos no registrados");
  assert.equal(invoiceStatus({ discarded: true, total: 100, credited: 0, debited: 0, paid: 0, today }).label, "Rechazada · descartada");
});

test("factura anulada por NC total: nada disponible para acreditar y eventos en orden", () => {
  const h = buildClientHistory({ documents: [inv(), note()], preinvoices: [{ id: "p1", internal_number: "PRE-1", period: "2026-11" }], audits: [{ preinvoice_id: "p1", action: "CALCULATE", created_at: "2026-11-08T16:20:00Z" }], today });
  const f = h.invoices[0];
  assert.equal(f.creditable, 0);
  assert.equal(f.balance, 0);
  assert.equal(f.status.label, "Anulada con nota de crédito 118169");
  assert.deepEqual(f.events.map((e) => e.type), ["pre", "fac", "mail", "sii", "nc"]);
  assert.equal(h.summary.invoiced, 73703);
  assert.equal(h.summary.credited, 73703);
  assert.equal(h.summary.balance, 0);
});

test("NC parcial, ND y pago: disponible y saldo como la base", () => {
  const h = buildClientHistory({ documents: [inv({ id: "f2", folio: "205010", due_date: "2026-12-01" }), note({ id: "n2", document_reference_id: "f2", folio: "118175", total_amount: "7370", correction_mode: "PARTIAL" }), note({ id: "n3", document_type: "DEBIT_NOTE", document_reference_id: "f2", folio: "100594", total_amount: "3000", correction_mode: null }), note({ id: "n4", document_reference_id: "f2", folio: null, status: "DISCARDED", total_amount: "5000" })], applications: [{ document_id: "f2", amount: "10000", status: "ACTIVE", created_at: "2026-11-10T10:00:00Z" }, { document_id: "f2", amount: "999", status: "REVERSED" }], today });
  const f = h.invoices[0];
  assert.equal(f.creditable, 73703 - 7370);
  assert.equal(f.balance, 73703 + 3000 - 7370 - 10000);
  assert.equal(f.status.label, "Con nota de crédito parcial");
  assert.equal(f.notes.length, 2);
  assert.equal(h.summary.paid, 10000);
});

test("rechazada y descartada sin saldo; simuladas fuera del resumen", () => {
  const h = buildClientHistory({ documents: [inv({ id: "r1", folio: null, status: "DISCARDED", total_amount: "1190", provider_status: "OF-02" }), inv({ id: "m1", provider: "mock", folio: "MOCK-1", total_amount: "500" })], audits: [{ action: "DOCUMENT_DISCARDED", created_at: "2026-11-08T14:10:00Z", new_value: { documentId: "r1", reason: "RUT mal ingresado" } }], today });
  const rejected = h.invoices.find((i) => i.key === "r1");
  assert.equal(rejected.balance, 0);
  assert.equal(rejected.creditable, 0);
  assert.equal(rejected.status.label, "Rechazada · descartada");
  assert.ok(rejected.events.some((e) => /descartado/.test(e.title)));
  assert.equal(h.summary.invoices, 0);
  assert.equal(h.summary.simulated, 1);
});

test("facturas importadas con sus notas por folio de referencia; no se duplican las propias", () => {
  const h = buildClientHistory({
    documents: [inv()],
    registry: [
      { id: "g1", source: "EASYDOC", issuer_rut: "77991619-7", dte_type: 33, folio: 262, issue_date: "2026-10-01", total_amount: 190546, sii_status: "Aceptado", customer_response: "Aceptado x Omisión" },
      { id: "g2", source: "EASYDOC", issuer_rut: "77991619-7", dte_type: 61, folio: 27, issue_date: "2026-10-05", total_amount: 40000, reference_folio: 262 },
      { id: "g3", source: "HAULMER", issuer_rut: "76795561-8", dte_type: 33, folio: 204997, issue_date: "2026-11-08", total_amount: 73703, billing_document_id: "f1" },
    ],
    today,
  });
  assert.equal(h.invoices.length, 2);
  const imported = h.invoices.find((i) => i.imported);
  assert.equal(imported.credited, 40000);
  assert.equal(imported.status.label, "Importada · pagos no registrados");
  assert.ok(imported.events.some((e) => /Aceptado x Omisión/.test(e.title)));
  assert.equal(h.summary.balance, 73703, "solo la factura propia suma al saldo: lo importado no tiene pagos registrados");
});

test("línea de tiempo con cambios de servicios y datos, de lo más reciente a lo más antiguo", () => {
  const h = buildClientHistory({ documents: [inv()], items: [{ created_at: "2026-11-06T11:15:00Z", code: "SERV-01", description: "Cuota mensual ParkFacil", quantity: 1, unit_price: 1.5, currency: "UF", valid_from: "2026-11-01", status: "ACTIVE" }], confirmations: [{ step: "datos", period: "2026-11", confirmed_at: "2026-11-08T14:08:00Z" }], today });
  assert.equal(h.timeline[h.timeline.length - 1].title, "Servicio asignado: SERV-01 Cuota mensual ParkFacil");
  assert.ok(h.timeline.some((e) => /Datos tributarios confirmados/.test(e.title)));
  assert.ok(h.timeline[0].at >= h.timeline[1].at);
});

test("neto e IVA por factura y por nota (planilla: Monto neto, IVA, Total)", () => {
  const h = buildClientHistory({ documents: [inv({ net_amount: "61935", tax_amount: "11768" }), note({ net_amount: "61935", tax_amount: "11768" })], registry: [{ id: "g1", source: "EASYDOC", issuer_rut: "77991619-7", dte_type: 33, folio: 262, issue_date: "2026-10-01", net_amount: 160123, exempt_amount: 0, tax_amount: 30423, total_amount: 190546 }], today });
  const own = h.invoices.find((i) => i.folio === "204997");
  assert.deepEqual([own.net, own.tax, own.total], [61935, 11768, 73703]);
  const nc = own.events.find((e) => e.type === "nc");
  assert.deepEqual([nc.net, nc.tax], [61935, 11768]);
  const imported = h.invoices.find((i) => i.imported);
  assert.deepEqual([imported.net, imported.tax, imported.total], [160123, 30423, 190546]);
});
