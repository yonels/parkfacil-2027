import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ACTIVE_CARD_ATTEMPT_STATUSES,
  CARD_ATTEMPTS_UNAVAILABLE,
  CARD_ATTEMPT_STATUS,
  CARD_ATTEMPT_STATUS_LABELS,
  canRegularizeCardPayments,
  canReviewCardPayments,
  cardAttemptBlocksStay,
  cardAttemptErrorResponse,
  cardRegistrationStayIdProblem,
  cardRegistrationStayMismatch,
  findActiveCardPaymentAttemptRow,
  getCardPaymentAttemptRow,
  isCardAttemptsStorageMissing,
  listCardPaymentAttemptRows,
  mapCardPaymentAttempt,
  mapCardPaymentAttemptForPos,
  markCardPaymentAttemptSent,
  paymentFromChargeSnapshot,
  registerCardPaymentAttempt,
  regularizeCardPaymentAttempt,
  reportCardPaymentAttemptResult,
  reserveCardPaymentAttempt,
  sanitizeDeviceId,
  sanitizeIdempotencyKey,
  tuuEnvironmentFromEnv,
  validateRegularizationInput,
} from "./cardPaymentAttempts.mjs";
import { createCardAttemptsModelDb } from "./cardPaymentAttemptsModel.testkit.mjs";

// Reserva central de intentos de pago con tarjeta (SOL-2026-10-11-001).
//
// ALCANCE DE ESTAS PRUEBAS: reglas de estados, idempotencia, alcance por
// empresa y traducción de errores, contra un MODELO EN MEMORIA de las
// funciones SQL (cardPaymentAttemptsModel.testkit.mjs). No demuestran la
// atomicidad ni la concurrencia real de la base: eso requiere PostgreSQL con
// la migración aplicada (pruebas de integración preparadas, no ejecutadas).

const NOW = new Date("2026-10-11T15:00:00.000Z");
const SNAPSHOT = { version: "POS_STAY_QUOTE_V2", stayId: "stay-1", parkingId: "park-1", elapsedMinutes: 50, rateId: "rate-1", rateName: "Tarifa", billingMode: "EFFECTIVE_MINUTE", subtotalAmount: 1000, discountAmount: 0, netAmount: 840, taxAmount: 160, totalAmount: 1000, signature: "firma" };

function fixture() {
  let clock = NOW;
  const db = createCardAttemptsModelDb({
    now: () => clock,
    parkings: [{ id: "park-1", company_id: "emp-a" }, { id: "park-2", company_id: "emp-a" }, { id: "park-x", company_id: "emp-b" }],
    stays: [
      { id: "stay-1", parking_id: "park-1", code: "ING-1", license_plate: "BBCC-12" },
      { id: "stay-2", parking_id: "park-1", code: "ING-2", license_plate: "DDFF-34" },
      { id: "stay-x", parking_id: "park-x", code: "ING-X", license_plate: "XXXX-99" },
    ],
    shifts: [
      { id: "shift-a", operator_id: "op-a", parking_id: "park-1", status: "OPEN" },
      { id: "shift-b", operator_id: "op-b", parking_id: "park-1", status: "OPEN" },
      { id: "shift-x", operator_id: "op-x", parking_id: "park-x", status: "OPEN" },
    ],
  });
  const reserve = (overrides = {}) => reserveCardPaymentAttempt(db, {
    idempotencyKey: "key-aaaaaaaaaaaaaaaa", companyId: "emp-a", parkingId: "park-1", stayId: "stay-1", operatorId: "op-a", operatorName: "Operador A",
    shiftId: "shift-a", deviceId: "pos-device-a", environment: "DEV", cardType: "DEBIT", amount: 1000, chargeSnapshot: SNAPSHOT, ...overrides,
  });
  return { db, reserve, advance: (ms) => { clock = new Date(clock.getTime() + ms); } };
}
const errorCode = async (promise) => { try { await promise; return null; } catch (error) { return cardAttemptErrorResponse(error)?.code || error.message; } };

// ------------------------------------------------------------------ reserva

test("reserva: el servidor crea el identificador interno y asocia empresa, estacionamiento, ticket, operador, equipo, monto y medio", async () => {
  const { reserve } = fixture();
  const row = await reserve();
  const attempt = mapCardPaymentAttempt(row);
  assert.match(attempt.id, /^[0-9a-f-]{36}$/);
  assert.equal(attempt.status, CARD_ATTEMPT_STATUS.RESERVED);
  assert.deepEqual(
    { companyId: attempt.companyId, parkingId: attempt.parkingId, stayId: attempt.stayId, ticketCode: attempt.ticketCode, plate: attempt.plate, operatorId: attempt.operatorId, deviceId: attempt.deviceId, amount: attempt.amount, cardType: attempt.cardType, environment: attempt.environment },
    { companyId: "emp-a", parkingId: "park-1", stayId: "stay-1", ticketCode: "ING-1", plate: "BBCC-12", operatorId: "op-a", deviceId: "pos-device-a", amount: 1000, cardType: "DEBIT", environment: "DEV" },
  );
  assert.equal("chargeSnapshot" in attempt, false, "el cálculo de cobro firmado no se expone");
});

test("reserva (modelo): dos equipos sobre el mismo ticket -> solo uno obtiene la reserva", async () => {
  const { reserve } = fixture();
  const results = await Promise.allSettled([
    reserve({ idempotencyKey: "key-equipo-a-0000000", deviceId: "pos-device-a" }),
    reserve({ idempotencyKey: "key-equipo-b-0000000", deviceId: "pos-device-b", operatorId: "op-b", shiftId: "shift-b" }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.equal(cardAttemptErrorResponse(rejected.reason).code, "CARD_ATTEMPT_ACTIVE");
  assert.equal(cardAttemptErrorResponse(rejected.reason).status, 409);
});

test("reserva: repetir la solicitud con la misma clave de idempotencia recupera el mismo intento", async () => {
  const { reserve, db } = fixture();
  const first = await reserve();
  const second = await reserve();
  assert.equal(second.id, first.id);
  assert.equal(db.state.attempts.length, 1);
});

test("reserva: la misma clave con datos incompatibles es un conflicto", async () => {
  const { reserve } = fixture();
  await reserve();
  for (const change of [{ amount: 1200 }, { cardType: "CREDIT" }, { stayId: "stay-2" }, { deviceId: "pos-device-b" }, { operatorId: "op-b", shiftId: "shift-b" }, { environment: "PROD" }]) {
    assert.equal(await errorCode(reserve(change)), "CARD_ATTEMPT_IDEMPOTENCY_CONFLICT", JSON.stringify(change));
  }
});

test("reserva: ticket ya pagado, turno inválido o estacionamiento ajeno no se reservan", async () => {
  const { reserve, db } = fixture();
  db.state.stays.find((stay) => stay.id === "stay-2").status = "PAID";
  assert.equal(await errorCode(reserve({ stayId: "stay-2", idempotencyKey: "key-pagado-00000000" })), "CARD_ATTEMPT_STAY_NOT_OPEN");
  assert.equal(await errorCode(reserve({ shiftId: "shift-x", idempotencyKey: "key-turno-000000000" })), "CARD_ATTEMPT_SHIFT_INVALID");
  assert.equal(await errorCode(reserve({ parkingId: "park-2", idempotencyKey: "key-parking-0000000" })), "CARD_ATTEMPT_SCOPE_MISMATCH");
  assert.equal(await errorCode(reserve({ amount: 0, idempotencyKey: "key-monto-000000000" })), "CARD_ATTEMPT_AMOUNT_INVALID");
});

test("aislamiento por empresa: no se reserva ni se consulta un ticket de otra empresa", async () => {
  const { reserve, db } = fixture();
  const scope = cardAttemptErrorResponse(await reserve({ stayId: "stay-x", parkingId: "park-x", idempotencyKey: "key-otra-emp-000000" }).catch((error) => error));
  assert.deepEqual({ status: scope.status, code: scope.code }, { status: 404, code: "CARD_ATTEMPT_SCOPE_MISMATCH" });
  const mine = await reserve();
  assert.equal(await getCardPaymentAttemptRow(db, { attemptId: mine.id, companyId: "emp-b" }), null, "otra empresa no ve el intento");
  assert.equal((await getCardPaymentAttemptRow(db, { attemptId: mine.id, companyId: "emp-a" })).id, mine.id);
  assert.deepEqual(await listCardPaymentAttemptRows(db, { parkingIds: ["park-x"] }), []);
  assert.deepEqual(await listCardPaymentAttemptRows(db, { parkingIds: [] }), [], "sin alcance no se lista nada");
  assert.deepEqual(await listCardPaymentAttemptRows(db, { parkingIds: ["park-1"], parkingId: "park-x" }), [], "estacionamiento fuera del alcance");
  assert.equal((await listCardPaymentAttemptRows(db, { parkingIds: ["park-1", "park-2"] })).length, 1);
  // Operaciones sobre un intento con la empresa equivocada: no existe.
  assert.equal(await errorCode(markCardPaymentAttemptSent(db, { attemptId: mine.id, companyId: "emp-b", operatorId: "op-a", deviceId: "pos-device-a" })), "CARD_ATTEMPT_NOT_FOUND");
  assert.equal(await errorCode(regularizeCardPaymentAttempt(db, { attemptId: mine.id, companyId: "emp-b", actorId: "admin", resolution: "NOT_CHARGED", reason: "motivo suficiente" })), "CARD_ATTEMPT_NOT_FOUND");
});

// ------------------------------------------------------------------ estados

test("envío a TUU: solo el equipo y operador de la reserva pasan a SENT_TO_TUU; repetirlo no cambia nada", async () => {
  const { reserve, db } = fixture();
  const attempt = await reserve();
  assert.equal(await errorCode(markCardPaymentAttemptSent(db, { attemptId: attempt.id, companyId: "emp-a", operatorId: "op-b", deviceId: "pos-device-a" })), "CARD_ATTEMPT_FORBIDDEN");
  assert.equal(await errorCode(markCardPaymentAttemptSent(db, { attemptId: attempt.id, companyId: "emp-a", operatorId: "op-a", deviceId: "pos-device-b" })), "CARD_ATTEMPT_FORBIDDEN");
  const sent = await markCardPaymentAttemptSent(db, { attemptId: attempt.id, companyId: "emp-a", operatorId: "op-a", deviceId: "pos-device-a" });
  assert.equal(sent.status, CARD_ATTEMPT_STATUS.SENT_TO_TUU);
  assert.equal((await markCardPaymentAttemptSent(db, { attemptId: attempt.id, companyId: "emp-a", operatorId: "op-a", deviceId: "pos-device-a" })).status, CARD_ATTEMPT_STATUS.SENT_TO_TUU);
});

test("vencimiento: una reserva que nunca abrió TUU se cierra como NOT_SENT; si ya venció no se confirma el envío", async () => {
  const { reserve, db, advance } = fixture();
  const attempt = await reserve();
  advance(181000);
  const late = await markCardPaymentAttemptSent(db, { attemptId: attempt.id, companyId: "emp-a", operatorId: "op-a", deviceId: "pos-device-a" });
  assert.equal(late.status, CARD_ATTEMPT_STATUS.NOT_SENT, "el POS recibe NOT_SENT y no abre TUU");
  // El ticket vuelve a estar disponible: nunca se abrió TUU.
  const again = await reserve({ idempotencyKey: "key-segundo-000000000" });
  assert.equal(again.status, CARD_ATTEMPT_STATUS.RESERVED);
});

test("vencimiento sin desbloqueo inseguro: un intento que pudo llegar a TUU nunca vence ni se libera solo", async () => {
  const { reserve, db, advance } = fixture();
  const attempt = await reserve();
  await markCardPaymentAttemptSent(db, { attemptId: attempt.id, companyId: "emp-a", operatorId: "op-a", deviceId: "pos-device-a" });
  advance(7 * 24 * 60 * 60 * 1000);
  assert.equal(await errorCode(reserve({ idempotencyKey: "key-dias-despues-0000", deviceId: "pos-device-b", operatorId: "op-b", shiftId: "shift-b" })), "CARD_ATTEMPT_ACTIVE");
  const row = await findActiveCardPaymentAttemptRow(db, { stayId: "stay-1", now: new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000) });
  assert.equal(row.status, CARD_ATTEMPT_STATUS.SENT_TO_TUU);
  // La regla pura: RESERVED vencido no bloquea; cualquier otro activo sí.
  assert.equal(cardAttemptBlocksStay({ status: "RESERVED", reservationExpiresAt: "2026-10-11T14:00:00Z" }, NOW), false);
  assert.equal(cardAttemptBlocksStay({ status: "RESERVED", reservationExpiresAt: "2026-10-11T16:00:00Z" }, NOW), true);
  for (const status of ["SENT_TO_TUU", "APPROVED_PENDING_REGISTRATION", "UNCERTAIN"]) assert.equal(cardAttemptBlocksStay({ status, reservationExpiresAt: "2020-01-01T00:00:00Z" }, NOW), true, status);
  for (const status of ["PAID", "DECLINED", "CANCELLED", "NOT_SENT", "RELEASED_BY_REGULARIZATION"]) assert.equal(cardAttemptBlocksStay({ status }, NOW), false, status);
});

async function sentAttempt(context, overrides) {
  const attempt = await context.reserve(overrides);
  await markCardPaymentAttemptSent(context.db, { attemptId: attempt.id, companyId: "emp-a", operatorId: attempt.operator_id, deviceId: attempt.device_id });
  return attempt;
}
const report = (db, attempt, outcome, extra = {}) => reportCardPaymentAttemptResult(db, { attemptId: attempt.id, companyId: "emp-a", deviceId: attempt.device_id, outcome, ...extra });

test("resultado: rechazado o cancelado confirmados liberan el ticket; incierto y aprobado lo mantienen bloqueado", async () => {
  for (const [outcome, status, blocks] of [["DECLINED", "DECLINED", false], ["CANCELLED", "CANCELLED", false], ["NOT_STARTED", "NOT_SENT", false], ["UNCERTAIN", "UNCERTAIN", true], ["APPROVED", "APPROVED_PENDING_REGISTRATION", true]]) {
    const context = fixture();
    const attempt = await sentAttempt(context);
    const row = await report(context.db, attempt, outcome, outcome === "APPROVED" ? { reference: "000012345678" } : { errorCode: "9", errorMessage: "Error en proceso de pago." });
    assert.equal(row.status, status, outcome);
    const second = await errorCode(context.reserve({ idempotencyKey: "key-otro-equipo-00000", deviceId: "pos-device-b", operatorId: "op-b", shiftId: "shift-b" }));
    assert.equal(second === "CARD_ATTEMPT_ACTIVE", blocks, `${outcome} bloquea=${blocks}`);
  }
});

test("resultado: un intento incierto o activo bloquea un nuevo cobro también desde el MISMO equipo", async () => {
  const context = fixture();
  const attempt = await sentAttempt(context);
  await report(context.db, attempt, "UNCERTAIN", { errorCode: "NO_RESPONSE" });
  assert.equal(await errorCode(context.reserve({ idempotencyKey: "key-mismo-equipo-0000" })), "CARD_ATTEMPT_ACTIVE");
});

test("resultado: el aviso lo acepta solo el equipo que abrió TUU; sin envío confirmado solo vale 'no se inició'", async () => {
  const context = fixture();
  const reserved = await context.reserve();
  assert.equal(await errorCode(report(context.db, reserved, "APPROVED", { reference: "000012345678" })), "CARD_ATTEMPT_INVALID_STATE");
  assert.equal((await report(context.db, reserved, "NOT_STARTED")).status, "NOT_SENT");
  const other = await sentAttempt(context, { idempotencyKey: "key-envio-0000000000" });
  assert.equal(await errorCode(reportCardPaymentAttemptResult(context.db, { attemptId: other.id, companyId: "emp-a", deviceId: "pos-device-b", outcome: "DECLINED" })), "CARD_ATTEMPT_FORBIDDEN");
  assert.equal(await errorCode(report(context.db, other, "OTRO")), "CARD_ATTEMPT_OUTCOME_INVALID");
  assert.equal(await errorCode(report(context.db, other, "APPROVED", { reference: "123" })), "CARD_ATTEMPT_REFERENCE_INVALID");
});

test("respuesta tardía: resuelve el intento incierto correcto (aprobada o sin cobro), nunca 'no se inició'", async () => {
  const context = fixture();
  const attempt = await sentAttempt(context);
  await report(context.db, attempt, "UNCERTAIN", { errorCode: "NO_RESPONSE" });
  assert.equal(await errorCode(report(context.db, attempt, "NOT_STARTED")), "CARD_ATTEMPT_INVALID_STATE");
  const approved = await report(context.db, attempt, "APPROVED", { reference: "000012345678" });
  assert.equal(approved.status, "APPROVED_PENDING_REGISTRATION");
  assert.equal(approved.provider_reference, "000012345678");
  const other = fixture();
  const second = await sentAttempt(other);
  await report(other.db, second, "UNCERTAIN");
  assert.equal((await report(other.db, second, "CANCELLED", { errorCode: "10" })).status, "CANCELLED");
});

test("respuesta duplicada: repetir el mismo resultado no cambia nada; un resultado distinto es un conflicto", async () => {
  const context = fixture();
  const attempt = await sentAttempt(context);
  const first = await report(context.db, attempt, "APPROVED", { reference: "000012345678" });
  const again = await report(context.db, attempt, "APPROVED", { reference: "000012345678" });
  assert.equal(again.approved_at, first.approved_at);
  assert.equal(await errorCode(report(context.db, attempt, "DECLINED")), "CARD_ATTEMPT_RESULT_CONFLICT");
  assert.equal(await errorCode(report(context.db, attempt, "APPROVED", { reference: "000099990000" })), "CARD_ATTEMPT_RESULT_CONFLICT");
  // No afecta a otro ticket: el aviso va por identificador de intento.
  const otherTicket = await sentAttempt(context, { stayId: "stay-2", idempotencyKey: "key-otro-ticket-0000" });
  assert.equal((await getCardPaymentAttemptRow(context.db, { attemptId: otherTicket.id, companyId: "emp-a" })).status, "SENT_TO_TUU");
});

test("referencia TUU reutilizada dentro de la misma empresa y ambiente: no se aprueba, queda incierto", async () => {
  const context = fixture();
  const first = await sentAttempt(context);
  await report(context.db, first, "APPROVED", { reference: "000012345678" });
  const second = await sentAttempt(context, { stayId: "stay-2", idempotencyKey: "key-otro-ticket-0000" });
  const reused = await report(context.db, second, "APPROVED", { reference: "000012345678" });
  assert.equal(reused.status, "UNCERTAIN");
  assert.equal(reused.provider_error_code, "REFERENCE_REUSED");
  // Otro ambiente (PROD) con la misma referencia no choca con DEV.
  const prod = await sentAttempt(context, { stayId: "stay-2", idempotencyKey: "key-prod-0000000000" }).catch(() => null);
  assert.equal(prod, null, "el ticket sigue bloqueado por el intento incierto");
});

// ------------------------------------------------------------------ registro

async function approvedAttempt(context, overrides) {
  const attempt = await sentAttempt(context, overrides);
  await report(context.db, attempt, "APPROVED", { reference: "000012345678" });
  return attempt;
}
const register = (db, attempt, overrides = {}) => registerCardPaymentAttempt(db, {
  attemptId: attempt.id, companyId: "emp-a", operatorId: "op-a", operatorName: "Operador A", shiftId: "shift-a",
  payment: paymentFromChargeSnapshot(SNAPSHOT, { paymentCode: "PAG-1" }), ...overrides,
});

test("registro: el pago y el cierre del intento quedan juntos; el monto es el reservado", async () => {
  const context = fixture();
  const attempt = await approvedAttempt(context);
  const stay = await register(context.db, attempt);
  assert.deepEqual(
    { status: stay.status, method: stay.payment_method, cardType: stay.payment_card_type, total: stay.total_amount, reference: stay.card_payment_reference, attempt: stay.card_payment_attempt_id },
    { status: "PAID", method: "CARD", cardType: "DEBIT", total: 1000, reference: "000012345678", attempt: attempt.id },
  );
  assert.equal((await getCardPaymentAttemptRow(context.db, { attemptId: attempt.id, companyId: "emp-a" })).status, "PAID");
});

test("aprobación seguida de fallo de registro: reintentar registra o devuelve el mismo pago, sin repetir el cobro", async () => {
  const context = fixture();
  const attempt = await approvedAttempt(context);
  // Fallo de registro: monto distinto al reservado.
  assert.equal(await errorCode(register(context.db, attempt, { payment: paymentFromChargeSnapshot({ ...SNAPSHOT, totalAmount: 1200 }, { paymentCode: "PAG-X" }) })), "CARD_ATTEMPT_AMOUNT_MISMATCH");
  assert.equal((await getCardPaymentAttemptRow(context.db, { attemptId: attempt.id, companyId: "emp-a" })).status, "APPROVED_PENDING_REGISTRATION", "sigue pendiente de registro");
  assert.equal(await errorCode(context.reserve({ idempotencyKey: "key-nuevo-cobro-00000" })), "CARD_ATTEMPT_ACTIVE", "no se puede cobrar de nuevo");
  const first = await register(context.db, attempt);
  const retry = await register(context.db, attempt, { payment: paymentFromChargeSnapshot(SNAPSHOT, { paymentCode: "PAG-2" }) });
  assert.equal(retry.payment_code, first.payment_code, "el reintento devuelve el pago existente");
  assert.equal(context.db.state.stays.filter((stay) => stay.card_payment_attempt_id === attempt.id).length, 1);
});

test("recuperación desde otro equipo: otro operador registra el pago aprobado sin relanzar el cobro", async () => {
  const context = fixture();
  const attempt = await approvedAttempt(context);
  const active = mapCardPaymentAttemptForPos(await findActiveCardPaymentAttemptRow(context.db, { stayId: "stay-1", now: NOW }));
  assert.equal(active.status, "APPROVED_PENDING_REGISTRATION");
  assert.equal("regularization" in active, false);
  assert.equal("companyId" in active, false);
  const stay = await register(context.db, attempt, { operatorId: "op-b", operatorName: "Operador B", shiftId: "shift-b" });
  assert.equal(stay.exit_operator_id, "op-b");
  assert.equal(stay.payment_shift_id, "shift-b");
  assert.equal(context.db.state.attempts.length, 1, "no se creó ningún intento nuevo");
});

test("registro: solo un intento aprobado puede pagar; reservado, enviado, incierto o rechazado no", async () => {
  for (const outcome of [null, "UNCERTAIN", "DECLINED"]) {
    const context = fixture();
    const attempt = await sentAttempt(context);
    if (outcome) await report(context.db, attempt, outcome);
    assert.equal(await errorCode(register(context.db, attempt)), "CARD_ATTEMPT_NOT_APPROVED", String(outcome));
  }
});

test("caminos alternativos (modelo de la guarda): efectivo, salida sin pago o anulación no eluden un intento activo", async () => {
  const context = fixture();
  const attempt = await sentAttempt(context);
  for (const status of ["PAID", "UNPAID_PENDING", "CANCELLED"]) {
    const blocked = context.db.changeStayStatus("stay-1", status);
    assert.equal(cardAttemptErrorResponse(blocked.error).code, "CARD_PAYMENT_ATTEMPT_ACTIVE", status);
  }
  await report(context.db, attempt, "DECLINED");
  assert.equal(context.db.changeStayStatus("stay-1", "PAID").error, null, "sin intento activo el efectivo funciona");
});

// ------------------------------------------------------------------ regularización

test("regularización: solo un administrador; el operador no puede declarar un incierto como pagado o rechazado", () => {
  assert.equal(canRegularizeCardPayments("operator"), false);
  assert.equal(canRegularizeCardPayments("inspector"), false);
  assert.equal(canRegularizeCardPayments(undefined), false);
  assert.equal(canRegularizeCardPayments("company_admin"), true);
  assert.equal(canRegularizeCardPayments("platform_admin"), true);
  assert.equal(canReviewCardPayments("operator"), false);
});

test("regularización: exige resolución, motivo y (si se declara aprobado) evidencia", () => {
  assert.equal(validateRegularizationInput({}).code, "CARD_ATTEMPT_RESOLUTION_INVALID");
  assert.equal(validateRegularizationInput({ resolution: "PAID" }).code, "CARD_ATTEMPT_RESOLUTION_INVALID");
  assert.equal(validateRegularizationInput({ resolution: "NOT_CHARGED", reason: "corto" }).code, "CARD_ATTEMPT_REASON_REQUIRED");
  assert.equal(validateRegularizationInput({ resolution: "APPROVED", reason: "Revisado en portal TUU", reference: "12" }).code, "CARD_ATTEMPT_REFERENCE_INVALID");
  assert.equal(validateRegularizationInput({ resolution: "APPROVED", reason: "Revisado en portal TUU" }).code, "CARD_ATTEMPT_EVIDENCE_REQUIRED");
  assert.equal(validateRegularizationInput({ resolution: "APPROVED", reason: "Revisado en portal TUU", evidence: "Voucher TUU foto 12", reference: "000012345678" }).ok, true);
  assert.equal(validateRegularizationInput({ resolution: "NOT_CHARGED", reason: "Sin venta en reporte TUU del día" }).ok, true);
});

test("regularización: deja actor, fecha, motivo, evidencia y estado anterior; no equivale a un resultado de TUU", async () => {
  const context = fixture();
  const attempt = await sentAttempt(context);
  await report(context.db, attempt, "UNCERTAIN", { errorCode: "NO_RESPONSE" });
  const row = await regularizeCardPaymentAttempt(context.db, { attemptId: attempt.id, companyId: "emp-a", actorId: "admin-1", actorName: "Admin Uno", resolution: "NOT_CHARGED", reason: "Sin venta en el reporte TUU", evidence: "Reporte de ventas 11-10" });
  const mapped = mapCardPaymentAttempt(row);
  assert.equal(mapped.status, "RELEASED_BY_REGULARIZATION");
  assert.equal(mapped.resolutionSource, "MANUAL_REGULARIZATION");
  assert.deepEqual({ by: mapped.regularization.by, byName: mapped.regularization.byName, reason: mapped.regularization.reason, evidence: mapped.regularization.evidence, previousStatus: mapped.regularization.previousStatus }, { by: "admin-1", byName: "Admin Uno", reason: "Sin venta en el reporte TUU", evidence: "Reporte de ventas 11-10", previousStatus: "UNCERTAIN" });
  assert.ok(mapped.regularization.at);
  // Liberado: el ticket puede volver a pagarse.
  assert.equal((await context.reserve({ idempotencyKey: "key-tras-regularizar-0" })).status, "RESERVED");
});

test("regularización como aprobado: queda pendiente de registro (no pagado) y solo aplica a intentos sin resultado", async () => {
  const context = fixture();
  const attempt = await sentAttempt(context);
  await report(context.db, attempt, "UNCERTAIN");
  const row = await regularizeCardPaymentAttempt(context.db, { attemptId: attempt.id, companyId: "emp-a", actorId: "admin-1", actorName: "Admin", resolution: "APPROVED", reference: "000012345678", reason: "Aprobado según voucher TUU", evidence: "Voucher" });
  assert.equal(row.status, "APPROVED_PENDING_REGISTRATION");
  assert.equal(row.resolution_source, "MANUAL_REGULARIZATION");
  assert.equal(await errorCode(regularizeCardPaymentAttempt(context.db, { attemptId: attempt.id, companyId: "emp-a", actorId: "admin-1", resolution: "NOT_CHARGED", reason: "segundo intento de cambio" })), "CARD_ATTEMPT_INVALID_STATE");
  const stay = await register(context.db, attempt);
  assert.equal(stay.card_payment_registration, "REGULARIZED");
});

// ------------------------------------------------------------------ sin migración

test("sin la migración no hay modo alternativo: reservar responde 503 'no se inició ningún cobro'", async () => {
  const missing = { rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.reserve_pos_card_payment(...) in the schema cache" } }) };
  const error = await reserveCardPaymentAttempt(missing, { idempotencyKey: "key-aaaaaaaaaaaaaaaa" }).catch((cause) => cause);
  assert.equal(isCardAttemptsStorageMissing(error), true);
  assert.deepEqual(cardAttemptErrorResponse(error), { ...CARD_ATTEMPTS_UNAVAILABLE });
  assert.equal(CARD_ATTEMPTS_UNAVAILABLE.status, 503);
  assert.match(CARD_ATTEMPTS_UNAVAILABLE.error, /No se inició ningún cobro/);
  assert.equal(isCardAttemptsStorageMissing({ code: "42P01", message: 'relation "public.pos_card_payment_attempts" does not exist' }), true);
  assert.equal(isCardAttemptsStorageMissing({ code: "42703", message: "column parking_stays.card_payment_attempt_id does not exist" }), true);
  assert.equal(isCardAttemptsStorageMissing({ code: "42P01", message: 'relation "public.otra_tabla" does not exist' }), false);
  assert.equal(isCardAttemptsStorageMissing({ code: "23505", message: "duplicate" }), false);
  assert.equal(cardAttemptErrorResponse({ code: "XX000", message: "otro error" }), null, "un error desconocido no se disfraza");
});

// ------------------------------------------------------------------ utilidades

test("identificadores: clave de idempotencia y equipo validados; ambiente DEV salvo configuración expresa de producción", () => {
  assert.equal(sanitizeIdempotencyKey("3f2c1a9e-8b7d-4c6e-9f10-aabbccddeeff"), "3f2c1a9e-8b7d-4c6e-9f10-aabbccddeeff");
  assert.equal(sanitizeIdempotencyKey("corta"), null);
  assert.equal(sanitizeIdempotencyKey("con espacios no vale 1234"), null);
  assert.equal(sanitizeIdempotencyKey(undefined), null);
  assert.equal(sanitizeDeviceId("pos-0123456789abcdef01234567"), "pos-0123456789abcdef01234567");
  assert.equal(sanitizeDeviceId("x"), null);
  assert.equal(tuuEnvironmentFromEnv({}), "DEV");
  assert.equal(tuuEnvironmentFromEnv({ POS_TUU_ENVIRONMENT: "prod" }), "PROD");
  assert.equal(tuuEnvironmentFromEnv({ POS_TUU_ENVIRONMENT: "produccion" }), "DEV");
});

test("datos del pago: salen del cálculo de cobro guardado en el intento, sin recalcular", () => {
  const payment = paymentFromChargeSnapshot({ ...SNAPSHOT, chargeBreakdown: [{ band: "A", amount: 1000 }] }, { paymentCode: "PAG-9" });
  assert.deepEqual(payment, { elapsed_minutes: 50, rate_id: "rate-1", rate_name: "Tarifa", billing_mode: "EFFECTIVE_MINUTE", subtotal_amount: 1000, discount_amount: 0, coupon_id: "", coupon_code: "", net_amount: 840, tax_amount: 160, total_amount: 1000, payment_code: "PAG-9", charge_breakdown: [{ band: "A", amount: 1000 }] });
  assert.equal(paymentFromChargeSnapshot(null), null);
});

test("estados: todos tienen etiqueta visible y distinguen pagado, rechazado, cancelado, sin envío e incierto", () => {
  for (const status of Object.values(CARD_ATTEMPT_STATUS)) assert.ok(CARD_ATTEMPT_STATUS_LABELS[status], status);
  assert.equal(new Set(Object.values(CARD_ATTEMPT_STATUS_LABELS)).size, Object.keys(CARD_ATTEMPT_STATUS).length);
  assert.deepEqual([...ACTIVE_CARD_ATTEMPT_STATUSES].sort(), ["APPROVED_PENDING_REGISTRATION", "RESERVED", "SENT_TO_TUU", "UNCERTAIN"]);
  for (const label of Object.values(CARD_ATTEMPT_STATUS_LABELS)) assert.doesNotMatch(label, /cotiz/i);
});

// ------------------------------------------------------------------ inspección estática del SQL propuesto (no ejecutado)

const sql = await readFile(new URL("../../../supabase/migrations/20261011110000_pos_card_payment_attempts.sql", import.meta.url), "utf8");

test("SQL propuesto: un intento activo por ticket garantizado por índice único parcial y bloqueo de la fila del ticket", () => {
  assert.match(sql, /create unique index if not exists pos_card_payment_attempts_one_active_per_stay\s+on public\.pos_card_payment_attempts \(stay_id\)\s+where status in \('RESERVED', 'SENT_TO_TUU', 'APPROVED_PENDING_REGISTRATION', 'UNCERTAIN'\);/);
  const reserveFn = sql.slice(sql.indexOf("create or replace function public.reserve_pos_card_payment("), sql.indexOf("create or replace function public.mark_pos_card_payment_sent("));
  assert.match(reserveFn, /select \* into v_stay from public\.parking_stays where id = p_stay_id for update;/);
  assert.ok(reserveFn.indexOf("for update") < reserveFn.indexOf("insert into public.pos_card_payment_attempts"), "bloquea el ticket antes de insertar");
  assert.match(reserveFn, /when unique_violation then/);
  assert.match(reserveFn, /constraint pos_card_payment_attempts_idempotency_key|pos_card_payment_attempts_idempotency_key/);
  assert.match(sql, /constraint pos_card_payment_attempts_idempotency_key unique \(company_id, idempotency_key\)/);
});

test("SQL propuesto: el registro del pago y el cierre del intento están en la misma función y son idempotentes", () => {
  const fn = sql.slice(sql.indexOf("create or replace function public.register_pos_card_payment("), sql.indexOf("create or replace function public.regularize_pos_card_payment("));
  assert.match(fn, /where id = p_attempt_id and company_id = p_company_id for update;/);
  assert.match(fn, /select \* into v_stay from public\.parking_stays where id = v_attempt\.stay_id for update;/);
  assert.match(fn, /if v_attempt\.status = 'PAID' then[\s\S]{0,260}return v_stay;/);
  assert.match(fn, /update public\.parking_stays set[\s\S]*card_payment_attempt_id = v_attempt\.id,[\s\S]*where id = v_stay\.id and status = 'OPEN'/);
  assert.match(fn, /update public\.pos_card_payment_attempts\s+set status = 'PAID'/);
  assert.match(fn, /CARD_ATTEMPT_AMOUNT_MISMATCH/);
  assert.match(sql, /create unique index if not exists parking_stays_card_payment_attempt_unique_idx\s+on public\.parking_stays \(card_payment_attempt_id\)/);
});

test("SQL propuesto: una guarda sobre el ticket impide que otro camino cambie su estado con un intento activo", () => {
  assert.match(sql, /create trigger parking_stays_guard_card_attempt\s+before update of status on public\.parking_stays/);
  const guard = sql.slice(sql.indexOf("create or replace function public.guard_parking_stay_card_attempt()"), sql.indexOf("drop trigger if exists parking_stays_guard_card_attempt"));
  assert.match(guard, /status in \('SENT_TO_TUU', 'APPROVED_PENDING_REGISTRATION', 'UNCERTAIN'\)\s+or \(status = 'RESERVED' and reservation_expires_at > clock_timestamp\(\)\)/);
  assert.match(guard, /new\.status = 'PAID' and new\.card_payment_attempt_id is not distinct from v_attempt_id/);
  assert.match(guard, /raise exception 'CARD_PAYMENT_ATTEMPT_ACTIVE'/);
});

test("regularización: no acepta como aprobado una referencia TUU ya asociada a otro pago de la misma empresa y ambiente", async () => {
  const context = fixture();
  const first = await sentAttempt(context);
  await report(context.db, first, "APPROVED", { reference: "000012345678" });
  const second = await sentAttempt(context, { stayId: "stay-2", idempotencyKey: "key-otro-ticket-0000" });
  await report(context.db, second, "UNCERTAIN");
  const reused = cardAttemptErrorResponse(await regularizeCardPaymentAttempt(context.db, { attemptId: second.id, companyId: "emp-a", actorId: "admin-1", resolution: "APPROVED", reference: "000012345678", reason: "Aprobado según comprobante", evidence: "Comprobante" }).catch((error) => error));
  assert.deepEqual({ status: reused.status, code: reused.code }, { status: 409, code: "CARD_ATTEMPT_REFERENCE_REUSED" });
  assert.equal((await getCardPaymentAttemptRow(context.db, { attemptId: second.id, companyId: "emp-a" })).status, "UNCERTAIN", "sigue incierto");
});

test("SQL propuesto: la detección de referencia reutilizada se serializa por (empresa, ambiente, proveedor, referencia)", () => {
  const locks = sql.match(/perform pg_advisory_xact_lock\(hashtextextended\(\s*v_attempt\.company_id \|\| ':' \|\| v_attempt\.environment \|\| ':' \|\| v_attempt\.provider \|\| ':' \|\| v_reference, 0\)\);/g) || [];
  assert.equal(locks.length, 2, "aviso de resultado + regularización");
  const reportFn = sql.slice(sql.indexOf("create or replace function public.report_pos_card_payment_result("), sql.indexOf("create or replace function public.register_pos_card_payment("));
  assert.ok(reportFn.indexOf("pg_advisory_xact_lock") < reportFn.indexOf("other.provider_reference = v_reference"), "el bloqueo va antes de la comprobación");
  assert.match(sql, /raise exception 'CARD_ATTEMPT_REFERENCE_REUSED'/);
});

test("SQL propuesto: sin índice único global sobre sequenceNumber; la referencia TUU se acota a empresa y ambiente", () => {
  assert.doesNotMatch(sql, /create unique index[^;]*provider_reference/);
  assert.doesNotMatch(sql, /create unique index[^;]*card_payment_reference/);
  assert.match(sql, /create index if not exists pos_card_payment_attempts_reference_idx\s+on public\.pos_card_payment_attempts \(company_id, environment, provider, provider_reference\)/);
  assert.match(sql, /environment text not null check \(environment in \('DEV', 'PROD'\)\)/);
  assert.match(sql, /other\.company_id = v_attempt\.company_id\s+and other\.environment = v_attempt\.environment/);
  assert.doesNotMatch(sql, /hashtextextended\(\s*v_reference/, "el bloqueo nunca es global por referencia");
});

test("SQL propuesto: solo el backend accede (RLS, sin permisos a anon/authenticated) y las funciones filtran por empresa", () => {
  assert.match(sql, /alter table public\.pos_card_payment_attempts enable row level security;/);
  assert.match(sql, /revoke all on public\.pos_card_payment_attempts from public, anon, authenticated;/);
  const grants = sql.match(/grant execute on function public\.[a-z_]+\([^)]*\) to service_role;/g) || [];
  assert.equal(grants.length, 5);
  assert.doesNotMatch(sql, /grant [^;]* to (anon|authenticated)/);
  for (const name of ["mark_pos_card_payment_sent", "report_pos_card_payment_result", "register_pos_card_payment", "regularize_pos_card_payment"]) {
    const start = sql.indexOf(`create or replace function public.${name}(`);
    assert.match(sql.slice(start, start + 2200), /where id = p_attempt_id and company_id = p_company_id for update;/, name);
  }
  const functions = sql.match(/language plpgsql security definer set search_path = public as \$\$/g) || [];
  assert.equal(functions.length, 6);
});

test("SQL propuesto: un intento que pudo llegar a TUU nunca se libera por tiempo; la regularización deja rastro completo", () => {
  const expirations = sql.match(/provider_error_code = 'RESERVATION_EXPIRED'/g) || [];
  assert.equal(expirations.length, 2);
  for (const match of sql.matchAll(/set status = 'NOT_SENT', resolution_source = 'NOT_SENT', provider_error_code = 'RESERVATION_EXPIRED',[\s\S]{0,200}?where ([^;]*);/g)) {
    assert.match(match[1], /status = 'RESERVED'|id = v_attempt\.id/, "solo reservas que nunca pasaron a SENT_TO_TUU");
  }
  const regularize = sql.slice(sql.indexOf("create or replace function public.regularize_pos_card_payment("), sql.indexOf("create or replace function public.guard_parking_stay_card_attempt()"));
  assert.match(regularize, /if v_attempt\.status not in \('UNCERTAIN', 'SENT_TO_TUU'\) then/);
  for (const column of ["regularized_by = p_actor_id", "regularized_at = v_now", "regularization_reason = left(v_reason, 500)", "regularization_evidence =", "regularization_previous_status = v_attempt.status", "resolution_source = 'MANUAL_REGULARIZATION'"]) {
    assert.ok(regularize.includes(column), column);
  }
  // La cabecera debe decir la verdad sobre dónde está aplicada (2026-10-11):
  // solo en local; QA y producción pendientes.
  const header = sql.slice(0, sql.indexOf("-- Reemplaza la propuesta anterior"));
  assert.doesNotMatch(header, /NO APLICADA EN NINGÚN AMBIENTE/);
  assert.match(header, /LOCAL\s+APLICADA el 2026-10-11 en Supabase local/);
  assert.match(header, /NO quedó\s+--\s+registrada en supabase_migrations\.schema_migrations/);
  assert.match(header, /QA\s+PENDIENTE\. No aplicada\./);
  assert.match(header, /PRODUCCIÓN\s+PENDIENTE\. No aplicada\./);
});

// D1 (2026-10-11): el ticket solicitado al registrar debe ser el del intento.
test("registro: stayId es obligatorio y debe ser un identificador válido (400, antes de leer nada)", () => {
  const stay = "11111111-2222-4333-8444-555555555555";
  assert.equal(cardRegistrationStayIdProblem(stay), null);
  for (const bad of [undefined, null, "", "   ", "abc", 42, {}, [stay], `${stay} `, "11111111-2222-4333-8444-55555555555"]) {
    const problem = cardRegistrationStayIdProblem(bad);
    assert.deepEqual([problem?.status, problem?.code], [400, "CARD_PAYMENT_STAY_REQUIRED"], JSON.stringify(bad));
    assert.match(problem.error, /No se registró ningún pago/);
  }
});

test("registro: el ticket solicitado debe ser el del intento, también si el intento ya está registrado; la respuesta no revela nada", () => {
  const own = "11111111-2222-4333-8444-555555555555";
  const other = "99999999-2222-4333-8444-555555555555";
  for (const status of ["APPROVED_PENDING_REGISTRATION", "PAID", "UNCERTAIN", "SENT_TO_TUU"]) {
    assert.equal(cardRegistrationStayMismatch(own, { stay_id: own, status }), null, status);
    assert.equal(cardRegistrationStayMismatch(own.toUpperCase(), { stay_id: own, status }), null, "sin distinguir mayúsculas");
    const mismatch = cardRegistrationStayMismatch(other, { stay_id: own, status });
    assert.deepEqual([mismatch.status, mismatch.code], [409, "CARD_ATTEMPT_STAY_MISMATCH"], status);
    // Mismo mensaje para cualquier ticket indicado; sin identificadores.
    assert.equal(mismatch.error, cardRegistrationStayMismatch("77777777-2222-4333-8444-555555555555", { stay_id: own, status }).error);
    assert.ok(!mismatch.error.includes(own) && !mismatch.error.includes(other));
    assert.deepEqual(Object.keys(mismatch).sort(), ["code", "error", "status"]);
  }
  // Sin dato en cualquiera de los dos lados nunca se da por coincidente.
  assert.equal(cardRegistrationStayMismatch("", { stay_id: own }).code, "CARD_ATTEMPT_STAY_MISMATCH");
  assert.equal(cardRegistrationStayMismatch(own, { stay_id: null }).code, "CARD_ATTEMPT_STAY_MISMATCH");
  assert.equal(cardRegistrationStayMismatch(own, null).code, "CARD_ATTEMPT_STAY_MISMATCH");
});
