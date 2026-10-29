import test from "node:test";
import assert from "node:assert/strict";
import { offStreetShiftParkings, pickShiftParking, shiftEditStatusOptions, shiftEditViolation } from "./turnosParkingCore.mjs";

// Caso real ParkFacil Operaciones (2026-10-29): AAA es On Street y salía primero.
const parkings = [
  { id: "p-aaa", code: "AAA", name: "Parking 2", type: "ON_STREET", status: "ACTIVE" },
  { id: "p-pc", code: "PC-001", name: "Parking Centro", type: "OFF_STREET", status: "ACTIVE" },
  { id: "p-ps", code: "PS-003", name: "Parking Sur", type: "OFF_STREET", status: "INACTIVE" },
];

test("Turnos Off Street: solo estacionamientos Off Street, activos primero", () => {
  assert.deepEqual(offStreetShiftParkings(parkings).map((parking) => parking.code), ["PC-001", "PS-003"]);
});

test("sin estacionamiento elegido se carga el primer Off Street activo", () => {
  assert.equal(pickShiftParking(offStreetShiftParkings(parkings), "").code, "PC-001");
});

test("un estacionamiento On Street en la URL no se carga en Turnos Off Street", () => {
  assert.equal(pickShiftParking(offStreetShiftParkings(parkings), "AAA").code, "PC-001");
});

test("el elegido se respeta por código o id", () => {
  const list = offStreetShiftParkings(parkings);
  assert.equal(pickShiftParking(list, "ps-003").code, "PS-003");
  assert.equal(pickShiftParking(list, "p-ps").code, "PS-003");
  assert.equal(pickShiftParking([], "PC-001"), null);
});

test("Editar: estados permitidos según el estado actual del turno", () => {
  assert.deepEqual(shiftEditStatusOptions(null), ["PROGRAMMED", "OPEN"]);
  assert.deepEqual(shiftEditStatusOptions("OPEN"), ["OPEN"]);
  assert.deepEqual(shiftEditStatusOptions("PROGRAMMED"), ["PROGRAMMED", "OPEN", "CANCELLED"]);
  assert.deepEqual(shiftEditStatusOptions("CANCELLED"), ["CANCELLED", "PROGRAMMED"]);
  assert.deepEqual(shiftEditStatusOptions("CLOSED"), []);
});

test("Editar: un turno abierto no vuelve a programado ni cambia de operador o fecha", () => {
  const open = { status: "OPEN", operator_id: "op-1", shift_date: "2026-10-27" };
  assert.equal(shiftEditViolation(open, { status: "OPEN", operatorId: "op-1", date: "2026-10-27" }), null);
  assert.match(shiftEditViolation(open, { status: "PROGRAMMED", operatorId: "op-1", date: "2026-10-27" }), /Cerrar turno/);
  assert.match(shiftEditViolation(open, { status: "OPEN", operatorId: "op-2", date: "2026-10-27" }), /operador ni de fecha/);
  assert.match(shiftEditViolation(open, { status: "OPEN", operatorId: "op-1", date: "2026-10-28" }), /operador ni de fecha/);
});

test("Editar: un turno abierto no cambia de horario (regla 4)", () => {
  const open = { status: "OPEN", operator_id: "op-1", shift_date: "2026-10-27", scheduled_start: "00:00:00", scheduled_end: "23:59:00" };
  assert.equal(shiftEditViolation(open, { status: "OPEN", operatorId: "op-1", date: "2026-10-27", scheduledStart: "00:00", scheduledEnd: "23:59:00" }), null);
  assert.match(shiftEditViolation(open, { status: "OPEN", operatorId: "op-1", date: "2026-10-27", scheduledStart: "15:15", scheduledEnd: "15:30" }), /no cambia de horario/);
});

test("Editar: un programado puede abrirse o cancelarse; un cerrado no se edita", () => {
  const programmed = { status: "PROGRAMMED", operator_id: "op-1", shift_date: "2026-10-27" };
  assert.equal(shiftEditViolation(programmed, { status: "OPEN", operatorId: "op-2", date: "2026-10-28" }), null);
  assert.equal(shiftEditViolation(programmed, { status: "CANCELLED", operatorId: "op-1", date: "2026-10-27" }), null);
  assert.ok(shiftEditViolation({ status: "CLOSED" }, { status: "CLOSED" }));
});
