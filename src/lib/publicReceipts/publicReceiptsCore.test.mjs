import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePublicReceiptsPlate,
  isValidPublicReceiptsPlate,
  isProductionEnvironment,
  buildPublicReceiptRow,
  buildPublicReceiptRows,
} from "./publicReceiptsCore.mjs";

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

test("débito/crédito siempre muestra el comprobante C, sin boleta ni marca/código de autorización", () => {
  const row = buildPublicReceiptRow({ stay: STAY_CARD, parking: PARKING, company: COMPANY, isProduction: true });
  assert.equal(row.kind, "CARD");
  assert.equal(row.medio, "DEBITO");
  assert.equal(row.document, "COMPROBANTE_C");
  assert.equal(row.cardLast4, "7710");
  assert.equal(row.cardOperationNumber, "120001984417");
  assert.equal("cardBrand" in row, false);
  assert.equal("authorizationCode" in row, false);
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
