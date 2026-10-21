import test from "node:test";
import assert from "node:assert/strict";
import { sortHomeVehicles, homeVehicleMinutes, homeVehiclePagination, configuredParkingCapacity } from "./homeVehicles.mjs";

test("orders across dates by entry time without modifying the source; invalid dates last", () => {
  const input = [{ id: "b", entry_at: "2026-10-06T14:00:00Z" }, { id: "x", entry_at: "invalid" }, { id: "a", entry_at: "2026-10-05T20:00:00Z" }];
  assert.deepEqual(sortHomeVehicles(input).map((row) => row.id), ["a", "b", "x"]);
  assert.equal(input[0].id, "b");
});
test("minutes use the reference clock, handle leading days, future and invalid entries", () => {
  const now = Date.parse("2026-10-06T17:36:00Z");
  assert.equal(homeVehicleMinutes("2026-10-06T14:05:00Z", now), 211);
  assert.equal(homeVehicleMinutes("2026-10-07T14:05:00Z", now), 0);
  assert.equal(homeVehicleMinutes("invalid", now), null);
});
test("pages fit available row height and clamp after resize or vehicle exits", () => {
  assert.deepEqual(homeVehiclePagination(24, 264, 1), { pageSize: 6, pageCount: 4, page: 1, start: 0 });
  assert.deepEqual(homeVehiclePagination(7, 264, 4), { pageSize: 6, pageCount: 2, page: 2, start: 6 });
  assert.equal(homeVehiclePagination(0, 0, 99).page, 1);
  assert.equal(homeVehiclePagination(24, 176, 2).pageSize, 4);
});
test("capacity remains unknown without positive configured zones", () => {
  assert.equal(configuredParkingCapacity([]), null);
  assert.equal(configuredParkingCapacity([{ capacity: null }, { capacity: 0 }]), null);
  assert.equal(configuredParkingCapacity([{ capacity: 25 }, { capacity: "15" }, { capacity: -1 }]), 40);
});

// QA PRO2 2026-10-19: al volver al inicio con datos de una carga anterior, los minutos no deben
// retroceder: el reloj se ancla al momento en que llegó la respuesta, no al montar la lista.
test("reloj del inicio: se ancla a la llegada de los datos y no retrocede al volver a la pantalla", async () => {
  const { homeVehicleClockAnchor, stampStaysReceivedAt } = await import("./homeVehicles.mjs");
  const serverNow = "2026-10-19T13:36:00Z";
  const receivedAt = Date.parse("2026-10-19T13:36:00Z");
  const stays = stampStaysReceivedAt([{ id: "a", entry_at: "2026-10-19T13:34:37Z", serverNow }, { id: "b", entry_at: "2026-10-19T13:35:21Z", serverNow }], receivedAt);
  // La lista se vuelve a montar a las 10:45 (13:45 UTC) con esos mismos datos.
  const remountAt = Date.parse("2026-10-19T13:45:19Z");
  const anchor = homeVehicleClockAnchor(stays, remountAt);
  const clock = anchor.server + remountAt - anchor.local;
  assert.equal(homeVehicleMinutes(stays[0].entry_at, clock), 10);
  assert.equal(homeVehicleMinutes(stays[1].entry_at, clock), 9);
  // Sin marca de llegada (datos antiguos) se mantiene el comportamiento anterior.
  assert.deepEqual(homeVehicleClockAnchor([{ serverNow }], remountAt), { server: Date.parse(serverNow), local: remountAt });
  assert.deepEqual(homeVehicleClockAnchor([], remountAt), { server: remountAt, local: remountAt });
});
