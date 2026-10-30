import test from "node:test";
import assert from "node:assert/strict";
import { buildCompanyCreatePayload, canOpenWizardStep, currentWizardStep, defaultParkingCode, emptyWizardDraft, formatRut, parseRut, validateCompanyStep, validateParkingStep, validateUsersStep } from "./companySetupWizardCore.mjs";

const filledDraft = () => {
  const draft = emptyWizardDraft();
  draft.company = { rut: "76.543.210-3", businessName: "Comercial Los Andes SpA", tradeName: "", businessActivity: "Estacionamientos", contactEmail: "Contacto@Andes.cl", mobilePhone: "912345678", address: "Av. Libertad 1850", district: "Viña del Mar", city: "Viña del Mar" };
  draft.parking = { name: "Estacionamiento Centro", address: "Av. Libertad 1850", district: "Viña del Mar", city: "Viña del Mar" };
  draft.users = { administrator: "Carlos Rojas", operator1: "Juan Pérez", operator2: "Ana Soto" };
  return draft;
};
const setup = (states, active = false) => ({ active, steps: states.map((state, index) => ({ n: index + 1, state })) });

test("RUT: acepta con o sin puntos y guion, rechaza dígito verificador incorrecto", () => {
  assert.deepEqual(parseRut("76.543.210-3"), { number: "76543210", dv: "3" });
  assert.deepEqual(parseRut("765432103"), { number: "76543210", dv: "3" });
  assert.equal(parseRut("76.543.210-4"), null);
  assert.equal(formatRut({ number: "76543210", dv: "3" }), "76.543.210-3");
  assert.equal(defaultParkingCode("76.543.210-3"), "EMP-76543210-01");
  assert.equal(defaultParkingCode("malo"), "");
});

test("paso 1: datos obligatorios, correo, móvil y RUT repetido", () => {
  assert.deepEqual(Object.keys(validateCompanyStep(emptyWizardDraft().company)).sort(), ["businessActivity", "businessName", "contactEmail", "rut"]);
  assert.deepEqual(validateCompanyStep(filledDraft().company), {});
  assert.match(validateCompanyStep({ ...filledDraft().company, mobilePhone: "123" }).mobilePhone, /\+56 9/);
  assert.match(validateCompanyStep(filledDraft().company, ["76.543.210-3"]).rut, /Ya existe/);
});

test("pasos 2 y 3: campos obligatorios", () => {
  assert.deepEqual(Object.keys(validateParkingStep({})).sort(), ["address", "city", "name"]);
  assert.deepEqual(validateParkingStep(filledDraft().parking), {});
  assert.deepEqual(Object.keys(validateUsersStep({ administrator: "Carlos" })).sort(), ["operator1", "operator2"]);
});

test("cuerpo para POST /api/empresas con el contrato actual", () => {
  const payload = buildCompanyCreatePayload(filledDraft());
  assert.equal(payload.rutNumber, "76543210");
  assert.equal(payload.rutDv, "3");
  assert.equal(payload.tradeName, "Comercial Los Andes SpA");
  assert.equal(payload.contactEmail, "contacto@andes.cl");
  assert.equal(payload.mobilePhone, "+56 9 1234 5678");
  assert.deepEqual(payload.products, ["OFF_STREET"]);
  assert.deepEqual(payload.operators, [{ fullName: "Juan Pérez" }, { fullName: "Ana Soto" }]);
  assert.equal(payload.defaultParking.type, "OFF_STREET");
  assert.equal(payload.defaultParking.name, "Estacionamiento Centro");
  assert.equal("code" in payload.defaultParking, false);
});

test("avance correlativo antes de crear la empresa", () => {
  const draft = emptyWizardDraft();
  assert.equal(currentWizardStep(draft), 1);
  assert.equal(canOpenWizardStep(2, draft), false);
  draft.done[1] = true;
  assert.equal(currentWizardStep(draft), 2);
  assert.equal(canOpenWizardStep(1, draft), true);
  assert.equal(canOpenWizardStep(2, draft), true);
  assert.equal(canOpenWizardStep(3, draft), false);
  assert.equal(canOpenWizardStep(4, draft), false);
});

test("después de crear la empresa el avance sale del estado real del estacionamiento", () => {
  const draft = { ...emptyWizardDraft(), createdCompanyId: "emp-1", done: { 1: true, 2: true, 3: true } };
  const borrador = setup(["ok", "ok", "ok", "warn", "lock", "lock", "lock"]);
  assert.equal(currentWizardStep(draft, borrador), 4);
  assert.equal(canOpenWizardStep(4, draft, borrador), true);
  assert.equal(canOpenWizardStep(5, draft, borrador), false);
  assert.equal(canOpenWizardStep(1, draft, borrador), true);
  assert.equal(currentWizardStep(draft, setup(["ok", "ok", "ok", "ok", "ok", "ok", "ok"], true)), 8);
  const activoConPendiente = setup(["ok", "ok", "warn", "ok", "ok", "ok", "warn"], true);
  assert.equal(canOpenWizardStep(7, draft, activoConPendiente), true);
});
