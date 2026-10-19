import test from "node:test";
import assert from "node:assert/strict";

import {
  POS_DEVICE_STORAGE_KEY,
  TUU_PENDING_STATUS,
  TUU_PENDING_STORAGE_KEY,
  buildTuuRegistrationRequest,
  buildTuuResultReport,
  canStartTuuPayment,
  clearTuuPendingPayment,
  findTuuPendingPayment,
  getOrCreatePosDeviceId,
  isProcessedTuuSequence,
  latestUnresolvedTuuPayment,
  loadQueuedTuuResultReports,
  loadTuuPendingPayments,
  markTuuPaymentApproved,
  markTuuPaymentUncertain,
  mergeTuuPendingViews,
  newTuuIdempotencyKey,
  noteTuuRegistrationFailure,
  pendingViewFromServerAttempt,
  queueTuuResultReport,
  reconcileTuuPendingWithServer,
  recoverTuuPendingPayments,
  rememberProcessedTuuSequence,
  removeQueuedTuuResultReport,
  sanitizeTuuPendingPayment,
  saveTuuPaymentStarted,
} from "./tuuPendingPayments.mjs";

// Copia de APOYO en el equipo de los pagos con tarjeta sin cerrar. La fuente
// de verdad es el servidor (reserva central); el almacenamiento se inyecta:
// aquí un doble en memoria que se comporta como localStorage.

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
  };
}

const ATTEMPT_ID = "11111111-1111-4111-8111-111111111111";
const ATTEMPT = {
  stayId: "stay-1",
  attemptId: ATTEMPT_ID,
  idempotencyKey: "3f2c1a9e-8b7d-4c6e-9f10-aabbccddeeff",
  deviceId: "pos-0123456789abcdef01234567",
  ticketCode: "ING-261011120000-AAAA",
  plate: "BBCC-12",
  parkingId: "park-1",
  parkingName: "Clínica Central",
  amount: 4500,
  cardType: "DEBIT",
  operatorId: "op-1",
  operatorName: "Operador Uno",
  shiftId: "shift-1",
};
const T0 = new Date("2026-10-11T12:00:00.000Z");
const serverAttempt = (overrides = {}) => ({ id: ATTEMPT_ID, stayId: "stay-1", status: "SENT_TO_TUU", deviceId: ATTEMPT.deviceId, cardType: "DEBIT", amount: 4500, plate: "BBCC-12", ticketCode: ATTEMPT.ticketCode, operatorName: "Operador Uno", reference: null, reservedAt: T0.toISOString(), sentAt: T0.toISOString(), approvedAt: null, ...overrides });

// ------------------------------------------------------------------ identificadores

test("identificadores: clave de idempotencia con formato UUID v4 sin depender de crypto.randomUUID (WebView 83)", () => {
  const bytes = Uint8Array.from({ length: 16 }, (_, index) => index);
  const key = newTuuIdempotencyKey(() => bytes);
  assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(newTuuIdempotencyKey(), newTuuIdempotencyKey());
});

test("identificadores: el equipo se genera una vez y se conserva; sin almacenamiento no hay identificador (no se cobra)", () => {
  const storage = memoryStorage();
  const first = getOrCreatePosDeviceId(storage);
  assert.match(first, /^pos-[0-9a-f]{24}$/);
  assert.equal(getOrCreatePosDeviceId(storage), first);
  assert.equal(storage.data[POS_DEVICE_STORAGE_KEY], first);
  assert.equal(getOrCreatePosDeviceId(null), null);
  assert.equal(getOrCreatePosDeviceId({ getItem: () => null, setItem: () => { throw new Error("quota"); } }), null);
});

// ------------------------------------------------------------------ copia local

test("copia local: exige un intento reservado en el servidor (sin attemptId no existe pago que seguir)", () => {
  const storage = memoryStorage();
  assert.equal(saveTuuPaymentStarted(storage, { ...ATTEMPT, attemptId: null }, { now: T0 }).ok, false);
  assert.equal(saveTuuPaymentStarted(storage, { ...ATTEMPT, attemptId: "no-es-uuid" }, { now: T0 }).ok, false);
  const started = saveTuuPaymentStarted(storage, ATTEMPT, { now: T0 });
  assert.equal(started.ok, true);
  assert.equal(started.record.status, TUU_PENDING_STATUS.IN_PROGRESS);
  assert.equal(started.record.attemptId, ATTEMPT_ID);
  assert.equal(started.record.amount, 4500);
  assert.equal(JSON.parse(storage.data[TUU_PENDING_STORAGE_KEY]).length, 1);
});

test("copia local: si no se puede escribir en el equipo, el intento no queda guardado (el POS devuelve la reserva y no cobra)", () => {
  const broken = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
  assert.equal(saveTuuPaymentStarted(broken, ATTEMPT, { now: T0 }).ok, false);
  assert.equal(saveTuuPaymentStarted(null, ATTEMPT, { now: T0 }).ok, false);
});

test("copia local: nunca guarda datos de tarjeta, la respuesta cruda de TUU ni el cálculo de cobro firmado", () => {
  const record = sanitizeTuuPendingPayment({ ...ATTEMPT, status: "PENDING_REGISTRATION", pan: "4111111111111111", cardNumber: "4111", cvv: "123", pin: "0000", rawResponse: "{}", quoteSnapshot: { signature: "x" } });
  for (const forbidden of ["pan", "cardNumber", "cvv", "pin", "rawResponse", "quoteSnapshot"]) assert.equal(forbidden in record, false, forbidden);
});

test("copia local: TUU aprobado se guarda como pendiente de registro antes de avisar al servidor", () => {
  const storage = memoryStorage();
  saveTuuPaymentStarted(storage, ATTEMPT, { now: T0 });
  const approved = markTuuPaymentApproved(storage, "stay-1", { sequenceNumber: "000012345678", approvedAt: T0 });
  assert.equal(approved.record.status, TUU_PENDING_STATUS.PENDING_REGISTRATION);
  assert.equal(approved.record.sequenceNumber, "000012345678");
  // La misma referencia recibida dos veces no altera el pago guardado.
  const again = markTuuPaymentApproved(storage, "stay-1", { sequenceNumber: "000012345678", approvedAt: new Date("2026-10-11T13:00:00Z") });
  assert.equal(again.duplicate, true);
  assert.equal(again.record.approvedAt, approved.record.approvedAt);
});

test("copia local: reinicio con TUU abierto -> resultado incierto; tiempo de espera -> incierto; un aprobado no retrocede", () => {
  const storage = memoryStorage();
  saveTuuPaymentStarted(storage, ATTEMPT, { now: T0 });
  const recovered = recoverTuuPendingPayments(storage);
  assert.equal(recovered[0].status, TUU_PENDING_STATUS.UNCERTAIN);
  assert.equal(recovered[0].uncertainReason, "APP_RESTART");
  const uncertain = markTuuPaymentUncertain(storage, "stay-1", "HP-68", "Re-intente, tiempo de respuesta excedido");
  assert.equal(uncertain.record.uncertainDetail, "Re-intente, tiempo de respuesta excedido");
  markTuuPaymentApproved(storage, "stay-1", { sequenceNumber: "000012345678", approvedAt: T0 });
  assert.equal(markTuuPaymentUncertain(storage, "stay-1", "NO_RESPONSE").record.status, TUU_PENDING_STATUS.PENDING_REGISTRATION);
});

test("copia local: la comprobación previa del equipo bloquea un nuevo intento sobre el mismo ticket (la decisión final es del servidor)", () => {
  const storage = memoryStorage();
  assert.equal(canStartTuuPayment(loadTuuPendingPayments(storage), "stay-1").allowed, true);
  saveTuuPaymentStarted(storage, ATTEMPT, { now: T0 });
  assert.equal(canStartTuuPayment(loadTuuPendingPayments(storage), "stay-1").allowed, false);
  assert.equal(canStartTuuPayment(loadTuuPendingPayments(storage), "stay-2").allowed, true);
  const again = saveTuuPaymentStarted(storage, { ...ATTEMPT, amount: 9999 }, { now: T0 });
  assert.equal(again.reason, "ALREADY_PENDING");
  assert.equal(findTuuPendingPayment(loadTuuPendingPayments(storage), "stay-1").amount, 4500);
});

test("copia local: quitarla no libera el ticket (eso lo decide el servidor); otro equipo no comparte esta copia", () => {
  const deviceA = memoryStorage();
  const deviceB = memoryStorage();
  saveTuuPaymentStarted(deviceA, ATTEMPT, { now: T0 });
  assert.deepEqual(loadTuuPendingPayments(deviceB), [], "por eso el bloqueo entre equipos es la reserva del servidor");
  assert.deepEqual(clearTuuPendingPayment(deviceA, "stay-1").records, []);
});

test("copia local: respuesta tardía -> intento sin resolver más reciente de este equipo", () => {
  const storage = memoryStorage();
  saveTuuPaymentStarted(storage, ATTEMPT, { now: T0 });
  markTuuPaymentApproved(storage, "stay-1", { sequenceNumber: "000012345678", approvedAt: T0 });
  saveTuuPaymentStarted(storage, { ...ATTEMPT, stayId: "stay-2", attemptId: "22222222-2222-4222-8222-222222222222", plate: "DDFF-34" }, { now: new Date("2026-10-11T12:10:00.000Z") });
  markTuuPaymentUncertain(storage, "stay-2", "NO_RESPONSE");
  assert.equal(latestUnresolvedTuuPayment(loadTuuPendingPayments(storage)).stayId, "stay-2");
});

test("copia local: contenido corrupto o de una versión anterior (sin intento) no rompe el POS ni se usa", () => {
  assert.deepEqual(loadTuuPendingPayments(memoryStorage({ [TUU_PENDING_STORAGE_KEY]: "{no json" })), []);
  const mixed = JSON.stringify([{ stayId: "x" }, { ...ATTEMPT, attemptId: undefined, status: "PENDING_REGISTRATION" }, { ...ATTEMPT, status: "UNCERTAIN" }, { ...ATTEMPT, status: "PENDING_REGISTRATION" }]);
  const loaded = loadTuuPendingPayments(memoryStorage({ [TUU_PENDING_STORAGE_KEY]: mixed }));
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].attemptId, ATTEMPT_ID);
});

// ------------------------------------------------------------------ solicitudes al servidor

test("REGISTRAR PAGO: la solicitud va por intento y nunca contiene un pago TUU; solo existe para pagos aprobados", () => {
  const storage = memoryStorage();
  const started = saveTuuPaymentStarted(storage, ATTEMPT, { now: T0 });
  assert.equal(buildTuuRegistrationRequest(started.record), null, "en curso no se registra");
  assert.equal(buildTuuRegistrationRequest(markTuuPaymentUncertain(storage, "stay-1", "NO_RESPONSE").record), null, "incierto no se registra");
  const approved = markTuuPaymentApproved(storage, "stay-1", { sequenceNumber: "000012345678", approvedAt: T0 }).record;
  const request = buildTuuRegistrationRequest(approved);
  assert.deepEqual(request, { action: "EXIT", stayId: "stay-1", paymentMethod: "CARD", paymentCardType: "DEBIT", cardPayment: { attemptId: ATTEMPT_ID } });
  for (const field of ["method", "tip", "cashback", "installmentsQuantity", "amount", "quoteSnapshot"]) assert.equal(field in request, false, field);
  // También desde la vista de un intento aprobado en otro equipo.
  const view = pendingViewFromServerAttempt(serverAttempt({ status: "APPROVED_PENDING_REGISTRATION", deviceId: "pos-otro", reference: "000012345678" }), { deviceId: ATTEMPT.deviceId });
  assert.deepEqual(buildTuuRegistrationRequest(view).cardPayment, { attemptId: ATTEMPT_ID });
});

test("aviso de resultado: lleva el identificador del intento y del equipo; la referencia solo en un aprobado", () => {
  const record = { ...ATTEMPT, status: "IN_PROGRESS" };
  assert.deepEqual(buildTuuResultReport(record, "APPROVED", { reference: "000012345678", errorCode: "x" }), { action: "CARD_PAYMENT_RESULT", attemptId: ATTEMPT_ID, deviceId: ATTEMPT.deviceId, outcome: "APPROVED", reference: "000012345678", errorCode: null, errorMessage: null });
  assert.deepEqual(buildTuuResultReport(record, "UNCERTAIN", { reference: "000012345678", errorCode: "HP-68", errorMessage: "Tiempo excedido" }), { action: "CARD_PAYMENT_RESULT", attemptId: ATTEMPT_ID, deviceId: ATTEMPT.deviceId, outcome: "UNCERTAIN", reference: null, errorCode: "HP-68", errorMessage: "Tiempo excedido" });
  assert.equal(buildTuuResultReport(record, "REINTENTAR"), null);
  assert.equal(buildTuuResultReport({ ...record, attemptId: null }, "DECLINED"), null);
});

test("caída de red tras un resultado: el aviso queda en cola y se reintenta; un aprobado nunca se reemplaza", () => {
  const storage = memoryStorage();
  const record = { ...ATTEMPT, status: "IN_PROGRESS" };
  assert.equal(queueTuuResultReport(storage, buildTuuResultReport(record, "APPROVED", { reference: "000012345678" })), true);
  queueTuuResultReport(storage, buildTuuResultReport(record, "UNCERTAIN", { errorCode: "NO_RESPONSE" }));
  const queue = loadQueuedTuuResultReports(storage);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].outcome, "APPROVED");
  removeQueuedTuuResultReport(storage, ATTEMPT_ID);
  assert.deepEqual(loadQueuedTuuResultReports(storage), []);
});

test("backend sin conexión: el pago aprobado sigue pendiente, cuenta los intentos de registro y se recupera tras reiniciar", () => {
  const storage = memoryStorage();
  saveTuuPaymentStarted(storage, ATTEMPT, { now: T0 });
  markTuuPaymentApproved(storage, "stay-1", { sequenceNumber: "000012345678", approvedAt: T0 });
  for (let attempt = 0; attempt < 3; attempt += 1) noteTuuRegistrationFailure(storage, "stay-1", "network_error");
  const [record] = recoverTuuPendingPayments(storage);
  assert.equal(record.status, TUU_PENDING_STATUS.PENDING_REGISTRATION);
  assert.equal(record.registrationAttempts, 3);
  assert.equal(record.sequenceNumber, "000012345678");
  assert.equal(canStartTuuPayment(loadTuuPendingPayments(storage), "stay-1").allowed, false);
});

// ------------------------------------------------------------------ servidor como fuente de verdad

test("servidor como fuente: lo que el servidor ya resolvió se quita de la copia local", () => {
  const storage = memoryStorage();
  saveTuuPaymentStarted(storage, ATTEMPT, { now: T0 });
  markTuuPaymentUncertain(storage, "stay-1", "NO_RESPONSE");
  // El intento ya no está entre los activos (regularizado como "no se realizó", o pagado).
  assert.deepEqual(reconcileTuuPendingWithServer(storage, []), []);
});

test("servidor como fuente: incierto local + aprobado en el servidor (regularización o respuesta tardía) -> pendiente de registro", () => {
  const storage = memoryStorage();
  saveTuuPaymentStarted(storage, ATTEMPT, { now: T0 });
  markTuuPaymentUncertain(storage, "stay-1", "NO_RESPONSE");
  const [record] = reconcileTuuPendingWithServer(storage, [serverAttempt({ status: "APPROVED_PENDING_REGISTRATION", reference: "000012345678", approvedAt: "2026-10-11T12:05:00.000Z" })]);
  assert.equal(record.status, TUU_PENDING_STATUS.PENDING_REGISTRATION);
  assert.equal(record.sequenceNumber, "000012345678");
  assert.equal(record.approvedAt, "2026-10-11T12:05:00.000Z");
});

test("servidor como fuente: un aprobado local nunca se pierde, y con un aviso en cola no se concluye nada", () => {
  const storage = memoryStorage();
  saveTuuPaymentStarted(storage, ATTEMPT, { now: T0 });
  markTuuPaymentApproved(storage, "stay-1", { sequenceNumber: "000012345678", approvedAt: T0 });
  assert.equal(reconcileTuuPendingWithServer(storage, [])[0].status, TUU_PENDING_STATUS.PENDING_REGISTRATION);
  assert.equal(reconcileTuuPendingWithServer(storage, [serverAttempt({ status: "SENT_TO_TUU" })])[0].status, TUU_PENDING_STATUS.PENDING_REGISTRATION);
  const other = memoryStorage();
  saveTuuPaymentStarted(other, ATTEMPT, { now: T0 });
  markTuuPaymentUncertain(other, "stay-1", "NO_RESPONSE");
  queueTuuResultReport(other, buildTuuResultReport(ATTEMPT, "UNCERTAIN", { errorCode: "NO_RESPONSE" }));
  assert.equal(reconcileTuuPendingWithServer(other, []).length, 1);
});

test("recuperación desde otro equipo: se muestra el intento del servidor para consultar; nunca como pago disponible", () => {
  const mine = ATTEMPT.deviceId;
  const elsewhere = pendingViewFromServerAttempt(serverAttempt({ deviceId: "pos-otro-equipo-000000000000" }), { deviceId: mine });
  assert.equal(elsewhere.status, TUU_PENDING_STATUS.IN_PROGRESS);
  assert.equal(elsewhere.otherDevice, true);
  assert.equal(elsewhere.source, "SERVER");
  assert.equal(buildTuuRegistrationRequest(elsewhere), null, "en curso en otro equipo: solo consulta");
  const uncertain = pendingViewFromServerAttempt(serverAttempt({ status: "UNCERTAIN", errorCode: "NO_RESPONSE" }), { deviceId: mine });
  assert.equal(uncertain.status, TUU_PENDING_STATUS.UNCERTAIN);
  assert.equal(buildTuuRegistrationRequest(uncertain), null);
  for (const status of ["PAID", "DECLINED", "CANCELLED", "NOT_SENT", "RELEASED_BY_REGULARIZATION"]) {
    assert.equal(pendingViewFromServerAttempt(serverAttempt({ status })), null, status);
  }
});

test("vista combinada: registros de este equipo + intentos activos de otros equipos, sin duplicar el mismo ticket", () => {
  const storage = memoryStorage();
  saveTuuPaymentStarted(storage, ATTEMPT, { now: T0 });
  const views = mergeTuuPendingViews(loadTuuPendingPayments(storage), [
    serverAttempt(),
    serverAttempt({ id: "33333333-3333-4333-8333-333333333333", stayId: "stay-3", deviceId: "pos-otro", status: "UNCERTAIN", plate: "GGHH-56" }),
  ], { deviceId: ATTEMPT.deviceId });
  assert.equal(views.length, 2);
  assert.deepEqual(views.map((view) => [view.stayId, view.source, view.otherDevice]), [["stay-1", "LOCAL", false], ["stay-3", "SERVER", true]]);
  assert.equal(findTuuPendingPayment(views, "stay-3").status, TUU_PENDING_STATUS.UNCERTAIN);
});

// ------------------------------------------------------------------ respuesta duplicada

test("respuesta aprobada duplicada: las referencias ya procesadas se recuerdan en el equipo", () => {
  const storage = memoryStorage();
  assert.equal(isProcessedTuuSequence(storage, "000012345678"), false);
  assert.equal(rememberProcessedTuuSequence(storage, "000012345678"), true);
  assert.equal(isProcessedTuuSequence(storage, "000012345678"), true);
  assert.equal(rememberProcessedTuuSequence(storage, "no-valida"), false);
  for (let index = 0; index < 60; index += 1) rememberProcessedTuuSequence(storage, String(index).padStart(12, "0"));
  assert.equal(isProcessedTuuSequence(storage, "000012345678"), false, "solo las últimas 50");
  assert.equal(isProcessedTuuSequence(storage, "000000000059"), true);
});

test("ACTUALIZAR ESTADO siempre informa el resultado (QA PRO2 2026-10-19)", async () => {
  const { tuuRefreshResultMessage } = await import("./tuuPendingPayments.mjs");
  assert.match(tuuRefreshResultMessage(null, "s1"), /No fue posible consultar/);
  assert.match(tuuRefreshResultMessage([{ stayId: "s1", status: "UNCERTAIN" }], "s1"), /^Sin cambios: el pago sigue por resolver\. Un administrador debe regularizarlo en Pagos con tarjeta\.$/);
  assert.equal(tuuRefreshResultMessage([{ stayId: "s1", status: "RELEASED_BY_REGULARIZATION" }], "s1"), "El pago ya fue resuelto.");
  assert.equal(tuuRefreshResultMessage([], "s1"), "El pago ya fue resuelto.");
  assert.equal(tuuRefreshResultMessage([{ stayId: "otro", status: "UNCERTAIN" }], "s1"), "El pago ya fue resuelto.");
});

test("registro combinado: el aviso de aprobación viaja en la misma llamada solo si se pide y hay equipo (SOL-2026-10-11-001)", () => {
  const record = { status: TUU_PENDING_STATUS.PENDING_REGISTRATION, attemptId: "a1", stayId: "s1", cardType: "DEBIT", deviceId: "apk-1", sequenceNumber: "130000046876" };
  assert.deepEqual(buildTuuRegistrationRequest(record).cardPayment, { attemptId: "a1" });
  assert.deepEqual(buildTuuRegistrationRequest(record, { includeApprovedResult: true }).cardPayment, { attemptId: "a1", result: { outcome: "APPROVED", deviceId: "apk-1", reference: "130000046876" } });
  assert.deepEqual(buildTuuRegistrationRequest({ ...record, deviceId: null }, { includeApprovedResult: true }).cardPayment, { attemptId: "a1" });
  assert.equal(buildTuuRegistrationRequest({ ...record, sequenceNumber: "x" }, { includeApprovedResult: true }).cardPayment.result.reference, null);
});

test("servidor: el registro guarda el resultado aprobado antes de registrar, con la misma RPC", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../../app/api/data-entry/route.js", import.meta.url), "utf8");
  const fn = source.slice(source.indexOf("async function registerCardPaymentFromAttempt("), source.indexOf("const UNPAID_ERROR_MESSAGES = {"));
  const combined = fn.indexOf('approvedResult?.outcome === "APPROVED"');
  assert.ok(combined > fn.indexOf("if (attempt.parking_id !== current.actor.parkingId)"));
  assert.ok(combined < fn.indexOf("if (![CARD_ATTEMPT_STATUS.APPROVED_PENDING_REGISTRATION, CARD_ATTEMPT_STATUS.PAID].includes(attempt.status)) {\n    return fail") || combined < fn.lastIndexOf("CARD_ATTEMPT_NOT_APPROVED"));
  assert.match(fn, /attempt = await reportCardPaymentAttemptResult\(current\.db, \{\s*attemptId, companyId, deviceId: sanitizeDeviceId\(approvedResult\.deviceId\), outcome: "APPROVED"/);
});
