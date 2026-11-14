import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePublicReceiptsPlate,
  isValidPublicReceiptsPlate,
  isProductionEnvironment,
  buildPublicReceiptRow,
  buildPublicReceiptRows,
  buildPublicReceiptOnStreetRow,
  normalizePublicReceiptsEmail,
  isValidPublicReceiptsEmail,
} from "./publicReceiptsCore.mjs";

test("normaliza y valida el correo del envío (etapa 6)", () => {
  assert.equal(normalizePublicReceiptsEmail(" Persona@Correo.CL "), "persona@correo.cl");
  assert.equal(isValidPublicReceiptsEmail("persona@correo.cl"), true);
  assert.equal(isValidPublicReceiptsEmail("no-es-correo"), false);
  assert.equal(isValidPublicReceiptsEmail(""), false);
  assert.equal(isValidPublicReceiptsEmail(`${"a".repeat(250)}@b.cl`), false);
});

test("normaliza y valida la patente (formato ABCD-12)", () => {
  assert.equal(normalizePublicReceiptsPlate("cxpy93"), "CXPY-93");
  assert.equal(normalizePublicReceiptsPlate("cxpy-93"), "CXPY-93");
  assert.equal(normalizePublicReceiptsPlate(" cx py 93 "), "CXPY-93");
  assert.equal(isValidPublicReceiptsPlate("CXPY-93"), true);
  assert.equal(isValidPublicReceiptsPlate("CXPY93"), false);
  assert.equal(isValidPublicReceiptsPlate(""), false);
});

test("isProductionEnvironment solo es true con VERCEL_ENV=production", () => {
  assert.equal(isProductionEnvironment({ VERCEL_ENV: "production" }), true);
  assert.equal(isProductionEnvironment({ VERCEL_ENV: "preview" }), false);
  assert.equal(isProductionEnvironment({}), false);
});

const STAY_CASH = {
  id: "s1", status: "PAID", exit_at: "2026-11-09T12:41:00Z", entry_at: "2026-11-09T12:00:00Z",
  parking_id: "p1", payment_method: "CASH", payment_code: "PAG-1",
  net_amount: 1008, tax_amount: 192, total_amount: 1200,
};
const STAY_CARD = {
  id: "s2", status: "PAID", exit_at: "2026-11-11T18:07:00Z", entry_at: "2026-11-11T17:40:00Z",
  parking_id: "p1", payment_method: "CARD", payment_card_type: "DEBIT", card_last4: "7710",
  card_payment_reference: "120001984417", card_payment_approved_at: "2026-11-11T18:07:00Z",
  payment_code: "PAG-2", net_amount: 748, tax_amount: 142, total_amount: 890,
};
const PARKING = { name: "Parking Centro", city: "Santiago", company_id: "emp-001" };
const COMPANY = { business_name: "ParkFacil Operaciones Spa", rut_number: "77991619", rut_dv: "7", address: "Raúl Labbé 12613 231", district: "Lo Barnechea", city: "Santiago" };

test("efectivo sin boleta ISSUED no se muestra (P6)", () => {
  assert.equal(buildPublicReceiptRow({ stay: STAY_CASH, boleta: null }), null);
  assert.equal(buildPublicReceiptRow({ stay: STAY_CASH, boleta: { status: "FAILED" } }), null);
});

test("efectivo con boleta ISSUED de prueba se oculta en producción, se muestra en QA (P5/§9.8)", () => {
  const boleta = { status: "ISSUED", environment: "TEST", folio: 9001 };
  assert.equal(buildPublicReceiptRow({ stay: STAY_CASH, boleta, isProduction: true }), null);
  const visible = buildPublicReceiptRow({ stay: STAY_CASH, boleta, isProduction: false });
  assert.equal(visible.isTestDocument, true);
  assert.equal(visible.folio, "9001");
  assert.equal(visible.document, "BOLETA");
});

test("efectivo con boleta ISSUED de producción se muestra siempre", () => {
  const boleta = { status: "ISSUED", environment: "PRODUCTION", folio: 711258, net_amount: 1008, tax_amount: 192, total_amount: 1200 };
  const row = buildPublicReceiptRow({ stay: STAY_CASH, boleta, parking: PARKING, company: COMPANY, isProduction: true });
  assert.equal(row.kind, "CASH");
  assert.equal(row.medio, "EFECTIVO");
  assert.equal(row.folio, "711258");
  assert.equal(row.parkingName, "Parking Centro");
  assert.equal(row.emisor.businessName, "ParkFacil Operaciones Spa");
});

test("débito/crédito del POS (TUU, sin boleta) muestra el comprobante C, sin marca ni código de autorización", () => {
  const row = buildPublicReceiptRow({ stay: STAY_CARD, parking: PARKING, company: COMPANY, isProduction: true });
  assert.equal(row.kind, "CARD");
  assert.equal(row.medio, "DEBITO");
  assert.equal(row.document, "COMPROBANTE_C");
  assert.equal(row.cardLast4, "7710");
  assert.equal(row.cardOperationNumber, "120001984417");
  assert.equal("cardBrand" in row, false);
  assert.equal("authorizationCode" in row, false);
});

// Etapa 3 (2026-11-14): un pago con tarjeta en línea (Webpay) sí puede
// tener una boleta SII real -- `document` se decide por si hay boleta
// ISSUED, no por el medio de pago.
test("tarjeta con boleta real (Webpay, etapa 3) se muestra como BOLETA, no comprobante C", () => {
  const boleta = { status: "ISSUED", environment: "PRODUCTION", folio: 900050, net_amount: 840, tax_amount: 160, total_amount: 1000 };
  const row = buildPublicReceiptRow({ stay: STAY_CARD, boleta, parking: PARKING, company: COMPANY, isProduction: true });
  assert.equal(row.kind, "CARD");
  assert.equal(row.medio, "DEBITO"); // el medio de pago se sigue informando
  assert.equal(row.document, "BOLETA");
  assert.equal(row.folio, "900050");
  assert.equal(row.totalAmount, 1000);
  assert.equal(row.cardLast4, "7710"); // y los datos de la tarjeta también, para quien la pagó
});

test("efectivo nunca muestra comprobante C (solo boleta o nada)", () => {
  assert.equal(buildPublicReceiptRow({ stay: STAY_CASH, boleta: null })?.document, undefined);
});

test("estadías OPEN o sin salida nunca se muestran", () => {
  assert.equal(buildPublicReceiptRow({ stay: { ...STAY_CASH, status: "OPEN", exit_at: null } }), null);
});

test("buildPublicReceiptRows arma y ordena por fecha de salida descendente, filtrando lo que no corresponde", () => {
  const boletasByStayId = new Map([["s1", { status: "ISSUED", environment: "PRODUCTION", folio: 711258 }]]);
  const parkingsById = new Map([["p1", PARKING]]);
  const companiesById = new Map([["emp-001", COMPANY]]);
  const rows = buildPublicReceiptRows({
    stays: [STAY_CASH, STAY_CARD],
    boletasByStayId, parkingsById, companiesById, isProduction: true,
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].stayId, "s2"); // más reciente primero
  assert.equal(rows[1].stayId, "s1");
});

// On Street (Webpay, etapa 3, 2026-11-14): esquema aparte
// (on_street_payment_intents), sin stay_id -- nunca tuvo voucher TUU, así
// que sin boleta ISSUED no hay nada que mostrar (no existe comprobante C
// para este canal).
const INTENT_ON_STREET = { id: "i1", status: "PAID", paid_at: "2026-11-14T10:00:00Z", parking_id: "p1", amount: 1200 };

test("On Street sin boleta ISSUED no se muestra (nunca hay comprobante C para este canal)", () => {
  assert.equal(buildPublicReceiptOnStreetRow({ intent: INTENT_ON_STREET, boleta: null }), null);
  assert.equal(buildPublicReceiptOnStreetRow({ intent: INTENT_ON_STREET, boleta: { status: "FAILED" } }), null);
});

test("On Street con boleta ISSUED se muestra como BOLETA, con el emisor y el estacionamiento de la calle", () => {
  const boleta = { status: "ISSUED", environment: "PRODUCTION", folio: 900070, payment_code: "PFabc123", net_amount: 1008, tax_amount: 192, total_amount: 1200 };
  const row = buildPublicReceiptOnStreetRow({ intent: INTENT_ON_STREET, boleta, parking: PARKING, company: COMPANY, isProduction: true });
  assert.equal(row.stayId, "i1");
  assert.equal(row.kind, "CARD");
  assert.equal(row.document, "BOLETA");
  assert.equal(row.folio, "900070");
  assert.equal(row.paymentCode, "PFabc123");
  assert.equal(row.totalAmount, 1200);
  assert.equal(row.parkingName, "Parking Centro");
});

test("buildPublicReceiptRows mezcla Off Street y On Street en una sola lista ordenada", () => {
  const boletasByStayId = new Map([["s1", { status: "ISSUED", environment: "PRODUCTION", folio: 711258 }]]);
  const onStreetBoletasByIntentId = new Map([["i1", { status: "ISSUED", environment: "PRODUCTION", folio: 900070, payment_code: "PFabc123" }]]);
  const parkingsById = new Map([["p1", PARKING]]);
  const companiesById = new Map([["emp-001", COMPANY]]);
  const rows = buildPublicReceiptRows({
    stays: [STAY_CASH], boletasByStayId,
    onStreetIntents: [{ ...INTENT_ON_STREET, paid_at: "2026-11-14T10:00:00Z" }], onStreetBoletasByIntentId,
    parkingsById, companiesById, isProduction: true,
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].stayId, "i1"); // On Street es más reciente, va primero
  assert.equal(rows[1].stayId, "s1");
});
