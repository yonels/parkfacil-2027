import assert from "node:assert/strict";
import test from "node:test";

import { findSelectableShift, isRequestedParkingConsistent, POS_PARKING_RESOLUTION, resolvePosParking } from "./posParkingResolution.mjs";
import { parkingQueryScope } from "../auth/parkingAuthorizationCore.mjs";
import { ROLES } from "../auth/permissions.mjs";

// POS Entry/Exit — Fase 1: resolución del estacionamiento de una sesión POS
// (reemplaza assignedParkingIds[0]). authorizedParkings representa lo que
// listParkings devuelve con parkingQueryScope: SOLO estacionamientos de la
// empresa de la sesión y asignados al operador.

const A = { id: "p-a", code: "PF-001", name: "Centro", status: "ACTIVE" };
const B = { id: "p-b", code: "PF-002", name: "Norte", status: "ACTIVE" };
const INACTIVE = { id: "p-x", code: "PF-009", name: "Cerrado", status: "INACTIVE" };
const OTHER_COMPANY = { id: "p-otra", code: "OT-001", name: "Otra empresa", status: "ACTIVE" };

const shift = (id, parkingId, status, extra = {}) => ({ id, parking_id: parkingId, status, shift_date: "2026-09-25", scheduled_start: "08:00", scheduled_end: "16:00", ...extra });

test("0 estacionamientos autorizados -> UNASSIGNED", () => {
  const result = resolvePosParking({ authorizedParkings: [] });
  assert.equal(result.status, POS_PARKING_RESOLUTION.UNASSIGNED);
  assert.equal(result.parkingId, null);
});

test("1 estacionamiento autorizado y activo -> ese, sin necesidad de turno", () => {
  const result = resolvePosParking({ authorizedParkings: [A] });
  assert.equal(result.status, POS_PARKING_RESOLUTION.SINGLE_AUTHORIZED);
  assert.equal(result.parkingId, "p-a");
});

test("un estacionamiento inactivo no cuenta como autorizado operable sin turno", () => {
  assert.equal(resolvePosParking({ authorizedParkings: [INACTIVE] }).status, POS_PARKING_RESOLUTION.UNASSIGNED);
  assert.equal(resolvePosParking({ authorizedParkings: [A, INACTIVE] }).parkingId, "p-a");
});

test("múltiples autorizados sin turno -> SELECTION_REQUIRED, nunca elige por orden", () => {
  for (const order of [[A, B], [B, A]]) {
    const result = resolvePosParking({ authorizedParkings: order });
    assert.equal(result.status, POS_PARKING_RESOLUTION.SELECTION_REQUIRED);
    assert.equal(result.parkingId, null);
  }
});

test("turno OPEN es la fuente de verdad, independiente del orden de las asignaciones", () => {
  for (const order of [[A, B], [B, A]]) {
    const result = resolvePosParking({ authorizedParkings: order, openShift: shift("s-open", "p-b", "OPEN") });
    assert.equal(result.status, POS_PARKING_RESOLUTION.OPEN_SHIFT);
    assert.equal(result.parkingId, "p-b");
  }
});

test("turno CLOSING también fija el estacionamiento (cierre en curso)", () => {
  const result = resolvePosParking({ authorizedParkings: [A, B], openShift: shift("s-closing", "p-a", "CLOSING") });
  assert.equal(result.parkingId, "p-a");
});

test("turno abierto en un estacionamiento NO autorizado (otra empresa/desasignado) -> se deniega, nunca cae a otro", () => {
  const result = resolvePosParking({ authorizedParkings: [A, B], openShift: shift("s-foreign", "p-otra", "OPEN") });
  assert.equal(result.status, POS_PARKING_RESOLUTION.SHIFT_PARKING_FORBIDDEN);
  assert.equal(result.parkingId, null);
});

test("turno abierto tiene prioridad sobre turnos programados en otro estacionamiento", () => {
  const result = resolvePosParking({
    authorizedParkings: [A, B],
    openShift: shift("s-open", "p-a", "OPEN"),
    programmedShifts: [shift("s-prog", "p-b", "PROGRAMMED")],
  });
  assert.equal(result.parkingId, "p-a");
});

test("turnos programados de hoy en UN solo estacionamiento -> ese (aunque tenga varios autorizados)", () => {
  const result = resolvePosParking({
    authorizedParkings: [A, B],
    programmedShifts: [shift("s1", "p-b", "PROGRAMMED"), shift("s2", "p-b", "PROGRAMMED", { scheduled_start: "16:00", scheduled_end: "23:00" })],
  });
  assert.equal(result.status, POS_PARKING_RESOLUTION.PROGRAMMED_SHIFT);
  assert.equal(result.parkingId, "p-b");
});

test("turnos programados en VARIOS estacionamientos -> selección explícita con opciones solo autorizadas", () => {
  const result = resolvePosParking({
    authorizedParkings: [A, B],
    programmedShifts: [
      shift("s-b", "p-b", "PROGRAMMED", { scheduled_start: "14:00" }),
      shift("s-a", "p-a", "PROGRAMMED", { scheduled_start: "08:00" }),
      shift("s-otra", "p-otra", "PROGRAMMED"),
    ],
  });
  assert.equal(result.status, POS_PARKING_RESOLUTION.SELECTION_REQUIRED);
  assert.deepEqual(result.options.map((option) => option.shiftId), ["s-a", "s-b"]);
  assert.ok(result.options.every((option) => ["p-a", "p-b"].includes(option.parkingId)));
  assert.equal(result.options[0].parkingName, "Centro");
});

test("un turno programado en un estacionamiento no autorizado se ignora", () => {
  const result = resolvePosParking({ authorizedParkings: [A], programmedShifts: [shift("s-otra", "p-otra", "PROGRAMMED")] });
  assert.equal(result.status, POS_PARKING_RESOLUTION.SINGLE_AUTHORIZED);
  assert.equal(result.parkingId, "p-a");
});

test("sin turno abierto ni programado: el último turno CERRADO hoy indica dónde trabajó el operador", () => {
  const result = resolvePosParking({
    authorizedParkings: [A, B],
    closedShifts: [shift("c1", "p-a", "CLOSED", { closed_at: "2026-09-25T12:00:00Z" }), shift("c2", "p-b", "CLOSED", { closed_at: "2026-09-25T18:00:00Z" })],
  });
  assert.equal(result.status, POS_PARKING_RESOLUTION.LAST_CLOSED_SHIFT);
  assert.equal(result.parkingId, "p-b");
});

test("selección: solo se acepta un shiftId que el servidor ofreció", () => {
  const resolution = resolvePosParking({
    authorizedParkings: [A, B],
    programmedShifts: [shift("s-a", "p-a", "PROGRAMMED"), shift("s-b", "p-b", "PROGRAMMED")],
  });
  assert.equal(findSelectableShift(resolution, "s-b")?.parkingId, "p-b");
  assert.equal(findSelectableShift(resolution, "s-otro-operador"), null);
  assert.equal(findSelectableShift(resolution, ""), null);
  assert.equal(findSelectableShift(resolution, undefined), null);
  const single = resolvePosParking({ authorizedParkings: [A] });
  assert.equal(findSelectableShift(single, "s-a"), null, "sin estado de selección no se acepta ningún shiftId");
});

test("un parkingId enviado por el cliente solo se acepta si coincide con el resuelto server-side", () => {
  assert.equal(isRequestedParkingConsistent("p-a", null), true);
  assert.equal(isRequestedParkingConsistent("p-a", "p-a"), true);
  assert.equal(isRequestedParkingConsistent("p-a", "p-b"), false);
  assert.equal(isRequestedParkingConsistent("p-a", "p-otra"), false);
  assert.equal(isRequestedParkingConsistent(null, "p-a"), false);
});

test("refresh: mismas condiciones del servidor -> mismo estacionamiento (resolución estable)", () => {
  const input = { authorizedParkings: [B, A], openShift: shift("s-open", "p-a", "OPEN") };
  const first = resolvePosParking(input);
  const second = resolvePosParking({ ...input, authorizedParkings: [A, B] });
  assert.deepEqual(first, second);
});

test("aislamiento por empresa: el scope de un operador en el Terminal queda acotado a su empresa y sus asignaciones", () => {
  const scope = parkingQueryScope({ role: ROLES.OPERATOR, portal: "terminal", companyId: "co-1" }, ["p-a", "p-a", "p-b"]);
  assert.deepEqual(scope, { companyId: "co-1", parkingIds: ["p-a", "p-b"] });
  // Lo que listParkings no devuelve (otra empresa) nunca puede resolverse.
  const result = resolvePosParking({ authorizedParkings: [A], openShift: shift("s", OTHER_COMPANY.id, "OPEN") });
  assert.equal(result.status, POS_PARKING_RESOLUTION.SHIFT_PARKING_FORBIDDEN);
});
