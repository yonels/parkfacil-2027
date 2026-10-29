import test from "node:test";
import assert from "node:assert/strict";
import { offStreetShiftParkings, pickShiftParking } from "./turnosParkingCore.mjs";

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
