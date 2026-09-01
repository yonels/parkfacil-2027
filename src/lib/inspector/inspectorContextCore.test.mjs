import test from "node:test";
import assert from "node:assert/strict";
import { areasForParking, streetsForArea, segmentsForStreet, contextToInspectionPayload, isContextUsable } from "./inspectorContextCore.mjs";

const areas = [{ id: "a1", parking_id: "p1", name: "Centro" }, { id: "a2", parking_id: "p2", name: "Norte" }];
const streets = [{ id: "s1", sector_id: "a1", name: "Prat" }, { id: "s2", sector_id: "a2", name: "Otra" }];
const segments = [{ id: "seg1", street_id: "s1", name: "100-200", qrLocationId: "qr1" }, { id: "seg2", street_id: "s2", name: "1-50", qrLocationId: null }];

test("areasForParking: cascada -- solo áreas del estacionamiento elegido, vacío sin parkingId", () => {
  assert.deepEqual(areasForParking(areas, "p1"), [areas[0]]);
  assert.deepEqual(areasForParking(areas, ""), []);
  assert.deepEqual(areasForParking(areas, null), []);
});

test("streetsForArea: cascada -- solo calles del área elegida", () => {
  assert.deepEqual(streetsForArea(streets, "a1"), [streets[0]]);
  assert.deepEqual(streetsForArea(streets, ""), []);
});

test("segmentsForStreet: cascada -- solo tramos de la calle elegida", () => {
  assert.deepEqual(segmentsForStreet(segments, "s1"), [segments[0]]);
  assert.deepEqual(segmentsForStreet(segments, ""), []);
});

test("contextToInspectionPayload: sin contexto (parkingId ausente) no envía nada", () => {
  assert.deepEqual(contextToInspectionPayload(null), { contextParkingId: null, contextQrLocationId: null });
  assert.deepEqual(contextToInspectionPayload({}), { contextParkingId: null, contextQrLocationId: null });
});

test("contextToInspectionPayload: con estacionamiento pero sin tramo con QR, igual atribuye el estacionamiento (soluciona 'Sin estacionamiento asignado')", () => {
  assert.deepEqual(contextToInspectionPayload({ parkingId: "p2", qrLocationId: null }), { contextParkingId: "p2", contextQrLocationId: null });
});

test("contextToInspectionPayload: con tramo que sí tiene QR, se envían ambos ids", () => {
  assert.deepEqual(contextToInspectionPayload({ parkingId: "p1", qrLocationId: "qr1" }), { contextParkingId: "p1", contextQrLocationId: "qr1" });
});

test("isContextUsable: solo requiere el estacionamiento -- Área/Calle/Tramo afinan pero no son obligatorios", () => {
  assert.equal(isContextUsable({ parkingId: "p1" }), true);
  assert.equal(isContextUsable({ parkingId: "p1", areaId: null }), true);
  assert.equal(isContextUsable(null), false);
  assert.equal(isContextUsable({}), false);
});
