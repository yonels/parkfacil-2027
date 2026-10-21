import test from "node:test";
import assert from "node:assert/strict";
import { maskAdminPhone, normalizeOnStreetFilters, paymentTypeFromTransaction, visibleOnStreetStatus } from "./onStreetAdminCore.mjs";
import { canAccessPath, hasPermission, PERMISSIONS } from "./auth/permissions.mjs";
import { webpayPaymentType } from "./payments/webpayCore.mjs";
test("On Street QR admin is available to company admin but not POS operator", () => { assert.equal(hasPermission("company_admin", PERMISSIONS.ON_STREET_QR_READ), true); assert.equal(hasPermission("operator", PERMISSIONS.ON_STREET_QR_READ), false); assert.equal(canAccessPath({ role:"operator", portal:"client" }, "/on-street-qr"), false); });
test("Transbank payment type is derived only from provider code", () => { assert.equal(webpayPaymentType("VD"), "DEBIT"); for (const code of ["VN","VC","SI","S2","NC"]) assert.equal(webpayPaymentType(code), "CREDIT"); assert.equal(webpayPaymentType("XX"), null); assert.equal(paymentTypeFromTransaction({payment_type:"DEBIT"}), "Débito"); });
test("administrative phone is masked", () => assert.equal(maskAdminPhone("56966514044"), "***4044"));
test("filters reject untrusted identifiers", () => assert.deepEqual(normalizeOnStreetFilters({date:"2026-08-15",parkingId:"not-a-uuid"}),{date:"2026-08-15",period:null,from:null,to:null,month:null,year:null,plate:null,status:null,parkingId:null,areaId:null,streetId:null,segmentId:null}));

test("normalizeOnStreetFilters: patente/estado -- solo valores reales, nunca se propaga texto arbitrario a la consulta", () => {
  assert.equal(normalizeOnStreetFilters({ plate: "abc123" }).plate, "ABC123");
  assert.equal(normalizeOnStreetFilters({ plate: "'; DROP TABLE" }).plate, null);
  assert.equal(normalizeOnStreetFilters({ plate: "" }).plate, null);
  for (const status of ["ACTIVE", "EXPIRED", "CLOSED", "CREATED", "REDIRECTED", "COMMITTING", "COMMITTED", "REJECTED", "ABORTED", "FAILED"]) assert.equal(normalizeOnStreetFilters({ status }).status, status);
  assert.equal(normalizeOnStreetFilters({ status: "no-es-un-estado" }).status, null);
});

// period/from/to/month/year (§ corrección "filtro de fechas" 2026-08-28):
// mismo criterio "nunca confía en el cliente" que el resto de este
// sanitizador -- cualquier valor no reconocido se descarta a null, nunca
// se propaga tal cual a la consulta.
test("normalizeOnStreetFilters: acepta exactamente los 5 períodos válidos, rechaza cualquier otro", () => {
  for (const period of ["today", "7d", "month", "year", "custom"]) {
    assert.equal(normalizeOnStreetFilters({ period }).period, period);
  }
  assert.equal(normalizeOnStreetFilters({ period: "semana-pasada" }).period, null);
  assert.equal(normalizeOnStreetFilters({}).period, null);
});

test("normalizeOnStreetFilters: from/to solo se aceptan con formato YYYY-MM-DD válido", () => {
  const ok = normalizeOnStreetFilters({ period: "custom", from: "2026-08-01", to: "2026-08-26" });
  assert.equal(ok.from, "2026-08-01");
  assert.equal(ok.to, "2026-08-26");
  const malo = normalizeOnStreetFilters({ period: "custom", from: "01-08-2026", to: "no-es-fecha" });
  assert.equal(malo.from, null);
  assert.equal(malo.to, null);
});

test("normalizeOnStreetFilters: month solo acepta 1-12, year solo acepta 4 dígitos", () => {
  assert.equal(normalizeOnStreetFilters({ month: 8 }).month, 8);
  assert.equal(normalizeOnStreetFilters({ month: "08" }).month, 8);
  assert.equal(normalizeOnStreetFilters({ month: 0 }).month, null);
  assert.equal(normalizeOnStreetFilters({ month: 13 }).month, null);
  assert.equal(normalizeOnStreetFilters({ year: 2026 }).year, 2026);
  assert.equal(normalizeOnStreetFilters({ year: "2026" }).year, 2026);
  assert.equal(normalizeOnStreetFilters({ year: 26 }).year, null);
  assert.equal(normalizeOnStreetFilters({ year: "abcd" }).year, null);
});
test("active expired session has an operational expired presentation", () => assert.equal(visibleOnStreetStatus({status:"ACTIVE",expires_at:"2026-08-14T00:00:00Z"},new Date("2026-08-15T00:00:00Z")),"EXPIRED"));
