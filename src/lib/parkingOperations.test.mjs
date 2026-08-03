import test from "node:test";
import assert from "node:assert/strict";
import {
  assignmentsOverlap, buildCapacityVisualization, calculateCollectedAmount, canCloseShift, canOpenShift,
  capacityMetrics, normalizeSectorCode, sectorDisplayName, validateOnStreetSector,
  validateOperatorAssignment, validateStreet,
} from "./parkingOperations.mjs";

test("capacidad deriva solo de entidades activas", () => {
  assert.deepEqual(capacityMetrics([{ status: "ACTIVE", capacity: 25, occupied: 13 }, { status: "INACTIVE", capacity: 99, occupied: 99 }, { status: "ACTIVE", capacity: 10, occupied: 5 }]), { capacity: 35, occupied: 18, available: 17, occupancyPercentage: 51 });
});
test("área normaliza código y deriva nombre visible", () => {
  assert.equal(normalizeSectorCode(" a "), "A");
  assert.equal(sectorDisplayName({ code: "a", name: "Norte" }), "Área A - Norte");
});
test("área acepta un código alfabético y no contiene datos de tramo", () => {
  assert.equal(Object.keys(validateOnStreetSector({ code: "NOR", name: "Norte", status: "ACTIVE" })).length, 0);
  assert.ok(validateOnStreetSector({ code: "NOR-80", name: "Norte", status: "ACTIVE" }).code);
  assert.ok(validateOnStreetSector({ code: "NOR", name: "Sur", status: "ACTIVE" }, [{ id: "1", code: "NOR" }]).code);
});
test("calle valida capacidad y ocupación", () => {
  assert.ok(validateStreet({ name: "Bandera", capacity: 0, occupied: 0, status: "ACTIVE" }).capacity);
  assert.ok(validateStreet({ name: "Bandera", capacity: 10, occupied: 11, status: "ACTIVE" }).occupied);
});
test("asignaciones validan rango y máximo", () => {
  const errors = validateOperatorAssignment({ operatorId: "u-1", numberFrom: 300, numberTo: 100, maxVehicles: 26, startTime: "08:00", endTime: "16:00", daysOfWeek: [1], status: "ACTIVE" }, { capacity: 25 });
  assert.ok(errors.numberTo);
  assert.ok(errors.maxVehicles);
});
test("asignaciones simultáneas respetan operador y capacidad", () => {
  const current = { id: "a1", operatorId: "u-1", maxVehicles: 15, startTime: "08:00", endTime: "16:00", daysOfWeek: [1], status: "ACTIVE" };
  const next = { operatorId: "u-1", numberFrom: 301, numberTo: 500, maxVehicles: 11, startTime: "09:00", endTime: "12:00", daysOfWeek: [1], status: "ACTIVE" };
  assert.equal(assignmentsOverlap(current, next), true);
  const errors = validateOperatorAssignment(next, { capacity: 25 }, [current]);
  assert.ok(errors.operatorId);
  assert.ok(errors.maxVehicles);
});
test("horarios distintos reutilizan capacidad", () => {
  const current = { id: "a1", operatorId: "u-1", maxVehicles: 25, startTime: "08:00", endTime: "12:00", daysOfWeek: [1], status: "ACTIVE" };
  const next = { operatorId: "u-2", numberFrom: 1, numberTo: 2, maxVehicles: 25, startTime: "12:00", endTime: "18:00", daysOfWeek: [1], status: "ACTIVE" };
  assert.deepEqual(validateOperatorAssignment(next, { capacity: 25 }, [current]), {});
});
test("turno impide concurrencia y doble cierre", () => {
  assert.equal(canOpenShift([{ operatorId: "u-1", status: "OPEN" }], "u-1"), false);
  assert.equal(canCloseShift({ status: "CLOSED" }), false);
});
test("recaudación suma cobros propios y recibidos, no pendientes", () => {
  assert.equal(calculateCollectedAmount({ collectedOwnVehicles: 1000, collectedReceivedVehicles: 500, estimatedPendingAmount: 9000 }), 1500);
});
test("visualización pequeña y resumida no representa patentes", () => {
  const small = buildCapacityVisualization(20, 11);
  assert.equal(small.indicators.filter((item) => item.state === "occupied").length, 11);
  assert.equal(small.indicators.filter((item) => item.state === "available").length, 9);
  assert.equal(buildCapacityVisualization(80, 55).mode, "summary");
  assert.equal(small.representsPhysicalPositions, false);
  assert.equal(small.plateAssociation, null);
});
