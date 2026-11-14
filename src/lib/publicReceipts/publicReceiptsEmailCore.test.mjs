import test from "node:test";
import assert from "node:assert/strict";
import { publicReceiptEmailSubject, buildPublicReceiptEmailHtml, buildPublicReceiptEmail, buildPublicReceiptsBatchEmail } from "./publicReceiptsEmailCore.mjs";

const ROW_CASH = {
  kind: "CASH", document: "BOLETA", folio: "900001", parkingName: "Clínica Ramís Central", city: "Santiago",
  exitAt: "2026-11-10T14:45:00Z", netAmount: 1008, taxAmount: 192, totalAmount: 1200,
  paymentCode: "PAG-TEST-CXPY93-CASH-01",
  emisor: { businessName: "Sociedad Médica Integral Clínica Ramís Ltda.", rut: "76345890-2", address: "Av. Providencia 1840, Providencia, Santiago" },
};
const ROW_CARD = {
  kind: "CARD", document: "COMPROBANTE_C", medio: "CREDITO", cardLast4: "3345", cardOperationNumber: "120001985102",
  parkingName: "Clínica Ramís Central", city: "Santiago", exitAt: "2026-11-12T14:45:00Z",
  netAmount: 1807, taxAmount: 343, totalAmount: 2150, paymentCode: "PAG-TEST-CXPY93-CREDIT-01",
  emisor: { businessName: "Sociedad Médica Integral Clínica Ramís Ltda.", rut: "76345890-2", address: "Av. Providencia 1840, Providencia, Santiago" },
};
// Pago con tarjeta en línea (Webpay, etapa 3): SÍ tiene boleta real --
// document independiente de kind.
const ROW_CARD_WEBPAY_BOLETA = {
  kind: "CARD", document: "BOLETA", medio: "DEBITO", cardLast4: "7710", folio: "900050",
  parkingName: "Parking Centro", city: "Santiago", exitAt: "2026-11-14T10:00:00Z",
  netAmount: 840, taxAmount: 160, totalAmount: 1000, paymentCode: "OS-TEST-1",
  emisor: { businessName: "ParkFacil Operaciones Spa", rut: "77991619-7", address: "Raúl Labbé 12613 231" },
};

test("asunto: boleta con folio para efectivo, comprobante para tarjeta", () => {
  assert.equal(publicReceiptEmailSubject(ROW_CASH), "Boleta electrónica N° 900001 — ParkFacil");
  assert.equal(publicReceiptEmailSubject(ROW_CARD), "Comprobante de pago con tarjeta — ParkFacil");
});

test("el HTML de efectivo no menciona tarjeta ni comprobante", () => {
  const html = buildPublicReceiptEmailHtml(ROW_CASH);
  assert.match(html, /Boleta electrónica N° 900001/);
  assert.match(html, /Timbre Electrónico SII/);
  assert.doesNotMatch(html, /voucher del terminal/);
});

test("el HTML de tarjeta incluye últimos 4 dígitos y N° de operación, nunca marca ni código de autorización", () => {
  const html = buildPublicReceiptEmailHtml(ROW_CARD);
  assert.match(html, /\*\*\*\*3345/);
  assert.match(html, /120001985102/);
  assert.match(html, /voucher del terminal, válido como boleta/);
  assert.doesNotMatch(html, /[Mm]arca/);
  assert.doesNotMatch(html, /[Cc]ódigo de autorización/);
});

test("escapa HTML en los datos del emisor (sin inyección)", () => {
  const row = { ...ROW_CASH, emisor: { ...ROW_CASH.emisor, businessName: '<script>alert(1)</script>' } };
  const html = buildPublicReceiptEmailHtml(row);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("buildPublicReceiptEmail combina asunto y html", () => {
  const email = buildPublicReceiptEmail(ROW_CASH);
  assert.equal(email.subject, "Boleta electrónica N° 900001 — ParkFacil");
  assert.match(email.html, /Clínica Ramís Central/);
});

test("etapa 3: un pago con tarjeta en línea (Webpay) con boleta real se trata como boleta, no comprobante C", () => {
  assert.equal(publicReceiptEmailSubject(ROW_CARD_WEBPAY_BOLETA), "Boleta electrónica N° 900050 — ParkFacil");
  const html = buildPublicReceiptEmailHtml(ROW_CARD_WEBPAY_BOLETA);
  assert.match(html, /Boleta electrónica N° 900050/);
  assert.match(html, /Timbre Electrónico SII/);
  assert.doesNotMatch(html, /voucher del terminal/);
  assert.match(html, /Débito \*\*\*\*7710/); // el medio de pago igual se informa
});

test("el correo de lote resume los N documentos y menciona el PDF adjunto", () => {
  const email = buildPublicReceiptsBatchEmail([ROW_CASH, ROW_CARD]);
  assert.equal(email.subject, "2 documentos — ParkFacil");
  assert.match(email.html, /Sus 2 documentos/);
  assert.match(email.html, /Boleta N° 900001/);
  assert.match(email.html, /Comprobante de pago con tarjeta \(crédito \*\*\*\*3345\)/);
});
