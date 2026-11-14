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

// Regresión 2026-11-14: con Courier y una página de 80 mm, un
// estacionamiento con nombre y ciudad largos (o un código de pago largo)
// hacía que el texto se saliera de la página o que la etiqueta y el valor
// de una fila quedaran pegados. Ahora se ajusta (word-wrap) o el valor
// pasa a la línea siguiente -- esto solo confirma que no revienta con ese
// mismo caso real; la verificación visual la hizo el usuario.
test("con datos largos (caso real: Clínica Ramis Norte, Huechuraba) no revienta y genera más líneas", async () => {
  const bytesCorto = await buildPublicReceiptCardPdf({
    kind: "CARD", medio: "DEBITO", cardLast4: "9981", cardOperationNumber: "120001986233",
    parkingName: "P1", city: "S", exitAt: "2026-11-08T13:00:00Z",
    netAmount: 538, taxAmount: 102, totalAmount: 640, paymentCode: "X",
  });
  const bytesLargo = await buildPublicReceiptCardPdf({
    kind: "CARD", medio: "DEBITO", cardLast4: "9981", cardOperationNumber: "120001986233",
    parkingName: "Clínica Ramis Norte", city: "Huechuraba", exitAt: "2026-11-08T13:00:00Z",
    netAmount: 538, taxAmount: 102, totalAmount: 640, paymentCode: "PAG-TEST-CXPY93-DEBIT-02-NORTE",
    emisor: { businessName: "Sociedad Médica Integral Clínica Ramis Ltda.", rut: "76345890-2", address: "Av. Providencia 1840, Providencia, Santiago" },
  });
  assert.ok(bytesLargo.length > 300);
  const headerLargo = Buffer.from(bytesLargo.slice(0, 5)).toString("ascii");
  assert.equal(headerLargo, "%PDF-");
  assert.ok(bytesLargo.length > bytesCorto.length); // la versión larga tuvo que ajustar más contenido
});
