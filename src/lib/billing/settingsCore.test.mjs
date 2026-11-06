import test from "node:test";
import assert from "node:assert/strict";
import { fromSettingsRow, issuerForDocument, validateBillingSettings } from "./settingsCore.mjs";

const base = { issuerBusinessName: "ParkFacil SpA", issuerRut: "77.991.619-7", issuerActivity: "Otras actividades de tecnología de la información y de servicios informáticos", issuerAddress: "Calle 1", issuerDistrict: "Las Condes", issuerCity: "Santiago", issuerSiiOffice: "Santiago Oriente", issuerEmail: "info@parkfacil.cl", defaultPaymentDueDays: 6, invoiceProvider: "SIMULATED", providerEnvironment: "TEST" };

test("valida y normaliza los datos del emisor", () => {
  const row = validateBillingSettings(base);
  assert.equal(row.issuer_rut_number, "77991619");
  assert.equal(row.issuer_rut_dv, "7");
  assert.equal(row.default_payment_due_days, 6);
  assert.equal(row.invoice_provider, "SIMULATED");
});

test("rechaza RUT con dígito verificador incorrecto, correo inválido y días fuera de rango", () => {
  assert.throws(() => validateBillingSettings({ ...base, issuerRut: "77.991.619-8" }), (e) => e.field === "issuerRut");
  assert.throws(() => validateBillingSettings({ ...base, issuerEmail: "info@" }), (e) => e.field === "issuerEmail");
  assert.throws(() => validateBillingSettings({ ...base, defaultPaymentDueDays: 200 }), (e) => e.field === "defaultPaymentDueDays");
  assert.throws(() => validateBillingSettings({ ...base, issuerBusinessName: "" }), (e) => e.field === "issuerBusinessName");
});

test("F2: Haulmer se puede elegir en pruebas; en producción exige Acteco", () => {
  assert.equal(validateBillingSettings({ ...base, invoiceProvider: "HAULMER", providerEnvironment: "TEST" }).invoice_provider, "HAULMER");
  assert.throws(() => validateBillingSettings({ ...base, invoiceProvider: "HAULMER", providerEnvironment: "PRODUCTION" }), (e) => e.code === "SETTINGS_ACTECO_REQUIRED");
  assert.equal(validateBillingSettings({ ...base, issuerActivityCode: "620900", invoiceProvider: "HAULMER", providerEnvironment: "PRODUCTION" }).provider_environment, "PRODUCTION");
});

test("datos del emisor para el documento e indicación de lo que falta", () => {
  const complete = issuerForDocument(validateBillingSettings(base));
  assert.deepEqual(complete.missing, []);
  assert.equal(complete.issuer.rut, "77991619-7");
  assert.equal(complete.issuer.provider, "mock");
  const partial = issuerForDocument({ issuer_business_name: "ParkFacil SpA", issuer_rut_number: "77991619", issuer_rut_dv: "7", issuer_activity: "Giro" });
  assert.deepEqual(partial.missing, ["dirección", "comuna"]);
  assert.equal(fromSettingsRow({ issuer_rut_number: "77991619", issuer_rut_dv: "7" }).issuerRut, "77.991.619-7");
});
