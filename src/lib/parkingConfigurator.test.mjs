import test from "node:test";
import assert from "node:assert/strict";
import { activationRequirements, buildConfigurator, incompatibleRoute, sanitizeTypeChange } from "./parkingConfigurator.mjs";

const parking = { id: "p1", code: "PC-001", name: "Centro", companyId: "c1", companyName: "Empresa", type: "OFF_STREET", address: "Calle 1", city: "Santiago", status: "CONFIGURING" };
const emptySummary = { levelCount: 0, zoneCount: 0, sectorCount: 0, streetCount: 0, segmentCount: 0, capacity: 0, occupied: 0, available: 0, assignmentCount: 0, shiftCount: 0, rateCount: 0 };

test("Off Street solo construye pasos de niveles y zonas", () => {
  const result = buildConfigurator(parking, emptySummary, {});
  assert.ok(result.steps.some((step) => step.key === "levels"));
  assert.ok(result.steps.some((step) => step.key === "zones"));
  assert.ok(!result.steps.some((step) => step.key === "sectors"));
  assert.ok(!result.steps.some((step) => step.key === "streets"));
});
test("On Street solo construye pasos de sectores y calles", () => {
  const result = buildConfigurator({ ...parking, type: "ON_STREET" }, emptySummary, {});
  assert.ok(result.steps.some((step) => step.key === "sectors"));
  assert.ok(result.steps.some((step) => step.key === "streets"));
  assert.ok(!result.steps.some((step) => step.key === "levels"));
  assert.ok(!result.steps.some((step) => step.key === "zones"));
});
test("capacidad y resumen se reciben del servidor", () => {
  const result = buildConfigurator(parking, { ...emptySummary, levelCount: 1, zoneCount: 2, capacity: 45 }, {});
  assert.equal(result.summary.capacity, 45);
  assert.equal(result.steps.find((step) => step.key === "capacity").status, "COMPLETADO");
});
test("tarifas sin persistencia bloquean activación", () => {
  const requirements = activationRequirements(parking, { ...emptySummary, levelCount: 1, zoneCount: 1, capacity: 10 }, { rates: false });
  assert.ok(requirements.some((item) => item.includes("tarifas")));
});
test("paso de tarifas usa el estado real de la persistencia y de la tarifa activa", () => {
  const blockedResult = buildConfigurator(parking, { ...emptySummary, levelCount: 1, zoneCount: 1, capacity: 10 }, { rates: false });
  assert.equal(blockedResult.steps.find((step) => step.key === "rates").status, "BLOQUEADO");

  const pendingResult = buildConfigurator(parking, { ...emptySummary, levelCount: 1, zoneCount: 1, capacity: 10, rateCount: 0 }, { rates: true });
  assert.equal(pendingResult.steps.find((step) => step.key === "rates").status, "EN_PROCESO");

  const completedResult = buildConfigurator(parking, { ...emptySummary, levelCount: 1, zoneCount: 1, capacity: 10, rateCount: 1 }, { rates: true });
  assert.equal(completedResult.steps.find((step) => step.key === "rates").status, "COMPLETADO");
});
test("activación Off Street exige nivel zona y capacidad", () => {
  const requirements = activationRequirements(parking, emptySummary, { rates: true });
  assert.ok(requirements.some((item) => item.includes("nivel")));
  assert.ok(requirements.some((item) => item.includes("zona")));
  assert.ok(requirements.some((item) => item.includes("capacidad")));
});
test("activación On Street exige área calle tramo y capacidad", () => {
  const requirements = activationRequirements({ ...parking, type: "ON_STREET" }, emptySummary, { rates: true });
  assert.ok(requirements.some((item) => item.includes("área")));
  assert.ok(requirements.some((item) => item.includes("calle")));
  assert.ok(requirements.some((item) => item.includes("tramo")));
});
test("cliente no impone resumen de configuración", () => {
  assert.deepEqual(sanitizeTypeChange({ type: "ON_STREET", confirmed: true, summary: { capacity: 999 } }), { type: "ON_STREET", confirmed: true, reason: "" });
});
test("confirmación debe ser booleana explícita", () => assert.equal(sanitizeTypeChange({ type: "ON_STREET", confirmed: "true" }).confirmed, false));
test("rutas incompatibles se detectan para ambos tipos", () => {
  assert.equal(incompatibleRoute("OFF_STREET", "sectores"), true);
  assert.equal(incompatibleRoute("ON_STREET", "niveles"), true);
  assert.equal(incompatibleRoute("OFF_STREET", "niveles"), false);
});
test("progreso deriva de pasos completados", () => {
  const result = buildConfigurator(parking, { ...emptySummary, levelCount: 1, zoneCount: 1, capacity: 20 }, {});
  assert.ok(result.progress > 0 && result.progress < 100);
});
test("buildConfigurator expone checklist de activacion consistente", () => {
  const result = buildConfigurator(parking, { ...emptySummary, levelCount: 1, zoneCount: 1, capacity: 20, rateCount: 0 }, { rates: true });
  assert.ok(Array.isArray(result.activation.checklist));
  assert.ok(result.activation.checklist.some((item) => item.key === "general"));
  assert.ok(result.activation.checklist.some((item) => item.key === "company"));
  assert.ok(result.activation.checklist.some((item) => item.key === "rates"));
  assert.equal(result.reviewRoute, "/estacionamientos/PC-001/configuracion/revision");
});
test("requisitos pendientes surgen del checklist central", () => {
  const result = buildConfigurator(parking, emptySummary, { rates: false });
  assert.ok(result.activation.requirements.every((item) => typeof item === "string"));
  assert.ok(result.activation.requirements.length >= 1);
});
test("estado ya activo se expone sin alterar el checklist", () => {
  const result = buildConfigurator({ ...parking, status: "ACTIVE" }, { ...emptySummary, levelCount: 1, zoneCount: 1, capacity: 20, rateCount: 1 }, { rates: true });
  assert.equal(result.isActive, true);
  assert.ok(result.activation.checklist.some((item) => item.status === "NO_APLICABLE" || item.status === "NO_APLICA"));
});
