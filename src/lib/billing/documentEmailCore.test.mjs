import test from "node:test";
import assert from "node:assert/strict";
import { buildDocumentEmail, documentEmailRecipients } from "./documentEmailCore.mjs";

const issuer = { businessName: "ParkFacil SpA", email: "info@parkfacil.cl", emailCc: "conta@parkfacil.cl" };
const customer = { businessName: "Inmobiliaria 5Q SpA", rut: "76540968-3", billingEmail: "pagos@5q.cl" };
const document = { document_type: "INVOICE", folio: "204621", invoice_date: "2026-11-06", due_date: "2026-11-12", net_amount: 64499, tax_amount: 12255, total_amount: 76754 };

test("destinatarios: en pruebas solo el emisor; en producción el cliente con copia y copia oculta", () => {
  assert.deepEqual(documentEmailRecipients({ issuer, customer, environment: "TEST" }), { para: "info@parkfacil.cl", cc: "", bcc: "" });
  assert.deepEqual(documentEmailRecipients({ issuer, customer, environment: "PRODUCTION" }), { para: "pagos@5q.cl", cc: "conta@parkfacil.cl", bcc: "info@parkfacil.cl" });
  assert.equal(documentEmailRecipients({ issuer: { ...issuer, email: "" }, customer, environment: "TEST" }), null);
});

test("asunto, cuerpo y nombre del PDF de la factura", () => {
  const email = buildDocumentEmail({ document, issuer, customer, environment: "PRODUCTION" });
  assert.equal(email.asunto, "Factura electrónica N° 204621 — ParkFacil SpA");
  assert.equal(email.fileName, "factura-204621.pdf");
  assert.match(email.html, /12-11-2026/);
  assert.match(email.html, /\$76\.754/);
  assert.doesNotMatch(email.html, /Documento de prueba/);
});

test("en pruebas el asunto y el cuerpo lo advierten; escapa HTML", () => {
  const email = buildDocumentEmail({ document: { ...document, document_type: "CREDIT_NOTE" }, issuer, customer: { ...customer, businessName: "<b>X</b>" }, environment: "TEST" });
  assert.match(email.asunto, /^\[PRUEBA\] Nota de crédito electrónica N° 204621/);
  assert.match(email.html, /Documento de prueba/);
  assert.match(email.html, /&lt;b&gt;X&lt;\/b&gt;/);
  assert.equal(email.fileName, "nota-credito-204621.pdf");
});
