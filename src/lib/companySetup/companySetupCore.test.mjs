import test from "node:test";
import assert from "node:assert/strict";
import { buildConfigurator } from "../parkingConfigurator.mjs";
import { applySequentialLocks, buildCompanySetup, buildParkingSetup, companyStep, sortCompanySetups, usersStep } from "./companySetupCore.mjs";

const company = { id: "c1", business_name: "Comercial Los Andes SpA", rut_number: "76543210", rut_dv: "3", email: "contacto@andes.cl" };
const parking = { id: "p1", code: "PF-001", name: "Centro", companyId: "c1", companyName: "Comercial Los Andes SpA", type: "OFF_STREET", address: "Av. Libertad 1850", city: "Viña del Mar", status: "INACTIVE" };
const fullSummary = { levelCount: 1, zoneCount: 2, sectorCount: 0, streetCount: 0, segmentCount: 0, capacity: 60, occupied: 0, available: 60, assignmentCount: 0, shiftCount: 3, rateCount: 1 };
const emptySummary = { ...fullSummary, levelCount: 0, zoneCount: 0, capacity: 0, available: 0, shiftCount: 0, rateCount: 0 };
const availability = { rates: true, shifts: true, closures: true };
const members = [
  { user_id: "a1", company_id: "c1", role: "company_admin", status: "active" },
  { user_id: "o1", company_id: "c1", role: "operator", status: "active" },
  { user_id: "o2", company_id: "c1", role: "operator", status: "suspended" },
  { user_id: "x1", company_id: "c2", role: "operator", status: "active" },
];
const memberParkings = [{ user_id: "o1", parking_id: "p1" }, { user_id: "o2", parking_id: "p1" }, { user_id: "x1", parking_id: "p1" }];

const setupFor = (overrides = {}, summary = fullSummary, extra = {}) => {
  const current = { ...parking, ...overrides };
  return buildParkingSetup({ company, parking: current, configurator: buildConfigurator(current, summary, availability), members, memberParkings, ...extra });
};
const states = (setup) => setup.steps.map((step) => step.state).join(",");

test("empresa completa muestra RUT con puntos y correo", () => {
  assert.deepEqual(companyStep(company), { state: "ok", detail: "RUT 76.543.210-3 · contacto@andes.cl" });
  assert.equal(companyStep({ ...company, email: "" }).state, "warn");
  assert.match(companyStep({ business_name: "" }).detail, /razón social, RUT, correo de contacto/);
});

test("usuarios: cuenta solo administradores y operadores activos de la empresa con acceso al estacionamiento", () => {
  const result = usersStep({ companyId: "c1", parkingId: "p1", members, memberParkings });
  assert.equal(result.state, "ok");
  assert.equal(result.detail, "1 administrador · 1 operador");
  const withoutOperators = usersStep({ companyId: "c1", parkingId: "p1", members, memberParkings: [] });
  assert.equal(withoutOperators.state, "warn");
  assert.match(withoutOperators.detail, /Falta operadores con acceso/);
});

test("estacionamiento activo y completo: 7 pasos completos", () => {
  const setup = setupFor({ status: "ACTIVE" });
  assert.equal(states(setup), "ok,ok,ok,ok,ok,ok,ok");
  assert.equal(setup.doneCount, 7);
  assert.equal(setup.pendingCount, 0);
});

test("estacionamiento activo nunca bloquea: lo pendiente queda como aviso", () => {
  const setup = setupFor({ status: "ACTIVE" }, { ...fullSummary, rateCount: 0 }, { memberParkings: [] });
  assert.equal(states(setup), "ok,ok,warn,warn,ok,ok,ok");
  assert.ok(!setup.steps.some((step) => step.state === "lock"));
});

test("estacionamiento sin activar: candado después del primer paso pendiente", () => {
  const setup = setupFor({}, emptySummary, { memberParkings: [] });
  assert.equal(states(setup), "ok,ok,warn,lock,lock,lock,lock");
  assert.match(setup.steps[3].detail, /Se habilita al completar el paso 3 · ¿Quién trabaja\?/);
});

test("pasos hechos en otro orden se muestran completos aunque haya uno anterior pendiente", () => {
  const setup = setupFor({}, fullSummary, { memberParkings: [] });
  assert.equal(states(setup), "ok,ok,warn,ok,ok,lock,ok");
});

test("listo para activar: el paso 6 queda pendiente y el 7 bloqueado si no hay turnos", () => {
  const setup = setupFor({}, { ...fullSummary, shiftCount: 0 });
  assert.equal(states(setup), "ok,ok,ok,ok,ok,warn,lock");
  assert.match(setup.steps[5].detail, /falta activarlo/);
});

test("enlaces a las pantallas actuales de cada paso", () => {
  const hrefs = setupFor({ status: "ACTIVE" }).steps.map((step) => step.href);
  assert.deepEqual(hrefs, ["/empresas/c1", "/estacionamientos/PF-001/editar", "/usuarios/operadores", "/estacionamientos/PF-001/tarifas", "/estacionamientos/PF-001/niveles", "/estacionamientos/PF-001/configuracion/revision", "/estacionamientos/PF-001/turnos"]);
});

test("empresa sin estacionamiento: paso 2 pendiente y el resto bloqueado", () => {
  const result = buildCompanySetup({ company, parkings: [], members, memberParkings });
  assert.equal(result.parkings.length, 1);
  assert.equal(states(result.parkings[0]), "ok,warn,lock,lock,lock,lock,lock");
  assert.equal(result.parkings[0].steps[1].href, "/estacionamientos/nuevo");
  assert.equal(result.hasPending, true);
});

test("On Street queda fuera del asistente y se lista aparte", () => {
  const onStreet = { ...parking, id: "p9", code: "OS-001", type: "ON_STREET", status: "ACTIVE" };
  const result = buildCompanySetup({ company, parkings: [{ parking: onStreet, configurator: null }], members, memberParkings });
  assert.equal(result.otherParkings.length, 1);
  assert.equal(result.otherParkings[0].statusLabel, "Activo");
  assert.equal(result.parkings[0].name, "Sin estacionamiento");
});

test("candado no cambia pasos ya completos ni aplica sin pendientes", () => {
  const steps = [{ n: 1, question: "a", state: "ok" }, { n: 2, question: "b", state: "ok" }];
  assert.deepEqual(applySequentialLocks(steps, { active: false }), steps);
});

test("orden: cuentas con pendientes primero y luego por nombre", () => {
  const sorted = sortCompanySetups([
    { name: "Beta", hasPending: false }, { name: "Alfa", hasPending: false }, { name: "Zeta", hasPending: true },
  ]);
  assert.deepEqual(sorted.map((item) => item.name), ["Zeta", "Alfa", "Beta"]);
});
