import assert from "node:assert/strict";
import test from "node:test";
import { inspectionMotivoLabel, resolveOnStreetPlateState } from "./inspectorPlateStateCore.mjs";

const location = { sectorName: "Sector Centro", streetName: "Av. Providencia", segmentName: "Tramo 3" };
const activeSession = { id: "s-active", started_at: "2026-08-27T10:00:00Z", expires_at: "2026-08-27T12:00:00Z", purchased_minutes: 60, amount_paid: 1800 };
const expiredSession = { id: "s-expired", started_at: "2026-08-27T08:00:00Z", expires_at: "2026-08-27T09:30:00Z", purchased_minutes: 90, amount_paid: 2700 };
const inspection = { inspection_type: "OVERSTAY", inspected_at: "2026-08-27T09:45:00Z" };

test("VIGENTE cuando hay una sesión activa, sin importar antecedentes -- un antecedente nunca oculta una sesión vigente real", () => {
  const r = resolveOnStreetPlateState({ plate: "ABC123", activeSession, latestInspection: inspection, location });
  assert.equal(r.status, "VIGENTE");
  assert.equal(r.sessionId, "s-active");
  assert.equal(r.expiresAt, activeSession.expires_at);
  assert.equal(r.location, location);
});

test("VENCIDO cuando hay una sesión expirada sin fiscalizar todavía", () => {
  const r = resolveOnStreetPlateState({ plate: "XYZ789", expiredSession, location });
  assert.equal(r.status, "VENCIDO");
  assert.equal(r.sessionId, "s-expired");
  assert.equal(r.expiresAt, expiredSession.expires_at);
});

test("una sesión expirada YA fiscalizada nunca vuelve a mostrarse VENCIDO (protección de doble fiscalización desde la propia consulta)", () => {
  const r = resolveOnStreetPlateState({ plate: "XYZ789", expiredSession, sessionInspection: inspection, latestInspection: inspection });
  assert.notEqual(r.status, "VENCIDO");
  assert.equal(r.status, "OBSERVADO");
});

test("OBSERVADO cuando no hay nada vigente/pendiente pero existe un antecedente", () => {
  const r = resolveOnStreetPlateState({ plate: "MOR123", latestInspection: inspection, recentInspections: [inspection], location });
  assert.equal(r.status, "OBSERVADO");
  assert.equal(r.motivo, "Exceso de tiempo");
  assert.equal(r.ultimoEvento.at, inspection.inspected_at);
  assert.equal(r.historial.length, 1);
});

test("SIN_SESION cuando no hay sesión activa/vencida ni antecedente alguno -- nunca se inventa una sesión antigua como vigente", () => {
  const r = resolveOnStreetPlateState({ plate: "DEF456" });
  assert.deepEqual(r, { status: "SIN_SESION", plate: "DEF456" });
});

test("inspectionMotivoLabel traduce cada tipo, y nunca inventa un motivo para uno desconocido", () => {
  assert.equal(inspectionMotivoLabel({ inspection_type: "OVERSTAY" }), "Exceso de tiempo");
  assert.equal(inspectionMotivoLabel({ inspection_type: "NO_SESSION" }), "Sin sesión vigente");
  assert.equal(inspectionMotivoLabel({ inspection_type: "OTHER" }), "Otro");
  assert.equal(inspectionMotivoLabel({ inspection_type: "ALGO_DESCONOCIDO" }), "Fiscalización registrada");
});

test("nunca expone phone_normalized en ningún estado -- el core ni siquiera lo recibe como campo de sesión relevante", () => {
  const r = resolveOnStreetPlateState({ plate: "XYZ789", expiredSession: { ...expiredSession, phone_normalized: "+56911112222" } });
  assert.equal("phoneNormalized" in r, false);
  assert.equal(JSON.stringify(r).includes("+56911112222"), false);
});
