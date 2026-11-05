import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyLiveOccupancy, liveOffStreetMetrics } from "./parkingLiveOccupancy.mjs";

test("Off Street usa los autos reales, no el valor manual de los sectores", () => {
  const manual = { capacity: 101, occupied: 83, available: 18, occupancyPercentage: 82, sectorCount: 4, activeSectorCount: 4 };
  assert.deepEqual(liveOffStreetMetrics(manual, { capacity: 100, insideCount: 1 }), { capacity: 100, occupied: 1, available: 99, occupancyPercentage: 1, sectorCount: 4, activeSectorCount: 4 });
});

test("sin capacidad no divide por cero y mantiene el auto a la vista", () => {
  assert.deepEqual(liveOffStreetMetrics({}, { capacity: 0, insideCount: 1 }), { capacity: 0, occupied: 1, available: 0, occupancyPercentage: 0 });
});

test("cada estacionamiento toma sus datos y On Street no cambia", () => {
  const onStreetMetrics = { capacity: 40, occupied: 5, available: 35, occupancyPercentage: 13 };
  const result = applyLiveOccupancy(
    [{ id: "a", type: "OFF_STREET", metrics: {} }, { id: "b", type: "OFF_STREET", metrics: {} }, { id: "c", type: "ON_STREET", metrics: onStreetMetrics }],
    [{ parkingId: "a", capacity: 100 }, { parkingId: "b", capacity: 10 }],
    new Map([["a", 1]]),
  );
  assert.equal(result[0].metrics.occupied, 1);
  assert.equal(result[0].metrics.available, 99);
  assert.equal(result[1].metrics.occupied, 0);
  assert.equal(result[1].metrics.available, 10);
  assert.equal(result[2].metrics, onStreetMetrics);
});

test("listado, API, ficha, edición y configurador usan la ocupación real", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  assert.match(read("../app/estacionamientos/page.js"), /withLiveOccupancy\(db,/);
  assert.match(read("../app/api/estacionamientos/route.js"), /withLiveOccupancy\(db,/);
  assert.match(read("../app/estacionamientos/[id]/page.js"), /getParkingWithLiveOccupancy\(/);
  assert.match(read("../app/estacionamientos/[id]/editar/page.js"), /getParkingWithLiveOccupancy\(/);
  assert.match(read("./parkingConfiguratorRepository.js"), /getOpenCountsByParking\(db, \[parking\.id\]\)/);
  assert.match(read("../components/estacionamientos/EstacionamientoDetalleAdmin.js"), /parking\.type === "ON_STREET" \? structure\?\.metrics \|\| parking\.metrics : parking\.metrics/);
});
