import assert from "node:assert/strict";
import test from "node:test";

import { buildOnStreetQrLocationCreate, buildOnStreetQrLocationUpdate, ON_STREET_QR_STATUS_VALUES } from "./onStreetQrLocationFormCore.mjs";

const validPayload = {
  parkingId: "11111111-1111-1111-1111-111111111111",
  sectorId: "22222222-2222-2222-2222-222222222222",
  streetId: "33333333-3333-3333-3333-333333333333",
  segmentId: "44444444-4444-4444-4444-444444444444",
  rateId: "55555555-5555-5555-5555-555555555555",
  label: "  QR entrada norte  ",
  status: "ACTIVE",
};

test("acepta un payload de creación válido y recorta el label", () => {
  const { errors, data } = buildOnStreetQrLocationCreate(validPayload);
  assert.deepEqual(errors, []);
  assert.equal(data.label, "QR entrada norte");
  assert.equal(data.status, "ACTIVE");
  assert.equal(data.rateId, validPayload.rateId);
});

// Decisión funcional "Proyectos On Street" (2026-08-29): cada QR exige una
// tarifa explícita -- nunca se resuelve sola.
test("rechaza la creación sin una tarifa explícita (rateId)", () => {
  const { errors, data } = buildOnStreetQrLocationCreate({ ...validPayload, rateId: undefined });
  assert.equal(errors.some((e) => /tarifa/i.test(e)), true);
  assert.equal(data, null);
});

test("rechaza un rateId que no tiene forma de UUID", () => {
  const { errors, data } = buildOnStreetQrLocationCreate({ ...validPayload, rateId: "no-es-un-uuid" });
  assert.equal(errors.some((e) => /tarifa/i.test(e)), true);
  assert.equal(data, null);
});

test("rechaza IDs que no tienen forma de UUID", () => {
  const { errors, data } = buildOnStreetQrLocationCreate({ ...validPayload, segmentId: "no-es-un-uuid" });
  assert.equal(errors.length > 0, true);
  assert.equal(data, null);
});

test("rechaza un label vacío", () => {
  const { errors } = buildOnStreetQrLocationCreate({ ...validPayload, label: "   " });
  assert.equal(errors.some((e) => /nombre o descripción/i.test(e)), true);
});

test("rechaza un estado inicial que no exista", () => {
  const { errors } = buildOnStreetQrLocationCreate({ ...validPayload, status: "BANNED" });
  assert.equal(errors.some((e) => /estado inicial/i.test(e)), true);
});

test("el mapeo de estados solo admite ACTIVE/INACTIVE", () => {
  assert.deepEqual([...ON_STREET_QR_STATUS_VALUES].sort(), ["ACTIVE", "INACTIVE"]);
});

test("edición: solo incluye los campos realmente enviados", () => {
  const { errors, patch } = buildOnStreetQrLocationUpdate({ status: "INACTIVE" });
  assert.deepEqual(errors, []);
  assert.deepEqual(patch, { status: "INACTIVE" });
});

test("edición: rechaza label vacío sin tocar el resto del payload", () => {
  const { errors, patch } = buildOnStreetQrLocationUpdate({ label: "  " });
  assert.equal(errors.length > 0, true);
  assert.deepEqual(patch, {});
});

test("edición: payload vacío no produce cambios ni errores", () => {
  const { errors, patch } = buildOnStreetQrLocationUpdate({});
  assert.deepEqual(errors, []);
  assert.deepEqual(patch, {});
});
