import test from "node:test";
import assert from "node:assert/strict";
import { buildPublicReceiptCardPdf } from "./publicReceiptsPdfCore.mjs";

const ROW_CARD = {
  kind: "CARD", medio: "CREDITO", cardLast4: "3345", cardOperationNumber: "120001985102",
  parkingName: "Clínica Ramís Central", city: "Santiago", exitAt: "2026-11-12T14:45:00Z",
  netAmount: 1807, taxAmount: 343, totalAmount: 2150, paymentCode: "PAG-TEST-CXPY93-CREDIT-01",
  emisor: { businessName: "Sociedad Médica Integral Clínica Ramís Ltda.", rut: "76345890-2", address: "Av. Providencia 1840, Providencia, Santiago" },
};

test("genera un PDF válido (firma %PDF) para el comprobante C", async () => {
  const bytes = await buildPublicReceiptCardPdf(ROW_CARD);
  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.length > 500); // un PDF de una página real pesa más que eso
  const header = Buffer.from(bytes.slice(0, 5)).toString("ascii");
  assert.equal(header, "%PDF-");
});

test("no revienta con datos mínimos (sin emisor, sin N° de operación)", async () => {
  const bytes = await buildPublicReceiptCardPdf({ kind: "CARD", medio: "DEBITO", totalAmount: 100, exitAt: "2026-11-01T00:00:00Z" });
  assert.ok(bytes.length > 300);
});
