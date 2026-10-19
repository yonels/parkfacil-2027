import test from "node:test";
import assert from "node:assert/strict";

import {
  abandonNativeTuuAttempt,
  ackNativeTuuResult,
  correlationOfTuuResult,
  detectTuuBridgeCapabilities,
  isTuuAttemptId,
  planNativeTuuSync,
  readNativeDeviceId,
  readPendingTuuState,
  readTuuBridgeEnvironment,
  resolvePosDeviceId,
  shouldAbandonLostTuuAttempt,
  shouldAckTuuResult,
  tuuLaunchBridge,
} from "./tuuNativeBridge.mjs";
import { createTuuResultRouter } from "./tuuResultRouter.mjs";
import { TUU_OUTCOME, classifyTuuOutcome } from "./tuuPayment.mjs";
import { normalizeDeclaredTuuEnvironment, tuuEnvironmentCompatibilityProblem } from "./cardPaymentAttempts.mjs";

const A1 = "11111111-1111-4111-8111-111111111111";
const A2 = "22222222-2222-4222-8222-222222222222";
const DEVICE = `apk-${"a".repeat(32)}`;

// APK 0.3.13: solo payWithTuu.
function legacyApk() {
  const calls = [];
  return { calls, payWithTuu: (payload) => { calls.push(["payWithTuu", payload]); return JSON.stringify({ ok: true, status: "LAUNCHED" }); } };
}

// APK 0.4.0 simulada (misma forma de respuestas que ParkFacilDeviceBridge.kt).
function attemptApk({ environment = "DEV" } = {}) {
  const calls = [];
  const state = { inFlight: null, results: [] };
  return {
    calls,
    state,
    payWithTuu: (payload) => { calls.push(["payWithTuu", payload]); return JSON.stringify({ ok: true, status: "LAUNCHED", attemptId: null }); },
    payWithTuuAttempt: (payload, attemptId) => {
      calls.push(["payWithTuuAttempt", payload, attemptId]);
      if (state.inFlight || state.results.length) return JSON.stringify({ ok: false, code: "TUU_PAYMENT_IN_PROGRESS" });
      state.inFlight = { attemptId, awaitingResult: true };
      return JSON.stringify({ ok: true, status: "LAUNCHED", attemptId });
    },
    getPendingTuuResults: () => JSON.stringify({ ok: true, inFlight: state.inFlight, results: state.results, legacyInProgress: false }),
    ackTuuResult: (attemptId) => {
      calls.push(["ackTuuResult", attemptId]);
      const before = state.results.length;
      state.results = state.results.filter((entry) => entry.attemptId !== attemptId);
      return JSON.stringify({ ok: state.results.length < before, code: state.results.length < before ? null : "TUU_RESULT_NOT_FOUND" });
    },
    abandonTuuAttempt: (attemptId) => {
      calls.push(["abandonTuuAttempt", attemptId]);
      if (!state.inFlight || state.inFlight.attemptId !== attemptId) return JSON.stringify({ ok: false, code: "ATTEMPT_NOT_IN_FLIGHT" });
      if (state.inFlight.awaitingResult) return JSON.stringify({ ok: false, code: "AWAITING_RESULT" });
      state.inFlight = null;
      return JSON.stringify({ ok: true, code: "ABANDONED" });
    },
    getTuuEnvironment: () => JSON.stringify({ ok: true, provider: "TUU", environment, enabled: environment === "DEV", runtimeVersion: "1.4.0" }),
    getDeviceId: () => JSON.stringify({ ok: true, deviceId: DEVICE }),
  };
}

const approved = ({ transactionId = "123456789012", ...extra } = {}) => ({ success: true, cancelled: false, transactionId, rawResponse: JSON.stringify({ transactionStatus: true, sequenceNumber: transactionId }), ...extra });

// --- Detección de capacidades por método --------------------------------------

test("capacidades: se detectan por la existencia de cada método, no por la versión", () => {
  assert.deepEqual(detectTuuBridgeCapabilities(null), { legacy: false, attempt: false, abandon: false, environment: false, deviceId: false });
  assert.deepEqual(detectTuuBridgeCapabilities(legacyApk()), { legacy: true, attempt: false, abandon: false, environment: false, deviceId: false });
  assert.deepEqual(detectTuuBridgeCapabilities(attemptApk()), { legacy: true, attempt: true, abandon: true, environment: true, deviceId: true });
  // Una APK que dice una versión pero no tiene los métodos no gana capacidades.
  assert.equal(detectTuuBridgeCapabilities({ ...legacyApk(), getDeviceInfo: () => JSON.stringify({ runtimeVersion: "9.9.9" }) }).attempt, false);
  // El flujo por intento exige lanzar + releer + confirmar: a medias no cuenta.
  const partial = attemptApk();
  delete partial.ackTuuResult;
  assert.equal(detectTuuBridgeCapabilities(partial).attempt, false);
});

// --- Compatibilidad con la APK 0.3.13 -----------------------------------------

test("APK 0.3.13: se lanza con payWithTuu(payload); no hay estado guardado ni ACK; la reserva no depende de la APK", () => {
  const apk = legacyApk();
  const launch = tuuLaunchBridge(apk, A1);
  assert.equal(launch.usesAttempt, false);
  launch.payWithTuu("{\"amount\":1500}");
  assert.deepEqual(apk.calls, [["payWithTuu", "{\"amount\":1500}"]]);
  assert.deepEqual(readPendingTuuState(apk), { supported: false, inFlight: null, results: [] });
  assert.deepEqual(planNativeTuuSync(readPendingTuuState(apk)), []);
  assert.equal(ackNativeTuuResult(apk, A1).ok, false);
  assert.equal(abandonNativeTuuAttempt(apk, A1).ok, false);
  assert.equal(readTuuBridgeEnvironment(apk), null);
  assert.equal(readNativeDeviceId(apk), null);
  assert.equal(resolvePosDeviceId(apk, () => "pos-0123456789abcdef01234567"), "pos-0123456789abcdef01234567");
  assert.equal(tuuLaunchBridge(null, A1), null);
  assert.equal(tuuLaunchBridge({}, A1), null);
});

test("APK 0.4.0: se lanza con payWithTuuAttempt(payload, attemptId); sin un intento válido no usa ese camino", () => {
  const apk = attemptApk();
  const launch = tuuLaunchBridge(apk, A1);
  assert.equal(launch.usesAttempt, true);
  assert.equal(JSON.parse(launch.payWithTuu("{\"amount\":1500}")).attemptId, A1);
  assert.deepEqual(apk.calls[0], ["payWithTuuAttempt", "{\"amount\":1500}", A1]);
  // El payload que va a TUU no lleva el identificador del intento.
  assert.ok(!apk.calls[0][1].includes(A1));
  for (const bad of [null, undefined, "", "abc", 7]) assert.equal(tuuLaunchBridge(apk, bad).usesAttempt, false);
  assert.equal(isTuuAttemptId(A1), true);
  assert.equal(isTuuAttemptId(`${A1}0`), false);
});

// --- Ambiente -----------------------------------------------------------------

test("ambiente: la web lee lo que declara la APK; valores desconocidos o errores -> no declarado", () => {
  assert.equal(readTuuBridgeEnvironment(attemptApk()), "DEV");
  assert.equal(readTuuBridgeEnvironment(attemptApk({ environment: "PROD" })), "PROD");
  assert.equal(readTuuBridgeEnvironment({ getTuuEnvironment: () => JSON.stringify({ environment: "qa" }) }), null);
  assert.equal(readTuuBridgeEnvironment({ getTuuEnvironment: () => "no es json" }), null);
  assert.equal(readTuuBridgeEnvironment({ getTuuEnvironment: () => { throw new Error("bridge"); } }), null);
});

test("ambiente: el servidor rechaza ambientes incompatibles; sin ambiente declarado solo se opera en DEV", () => {
  const check = (serverEnvironment, declared) => tuuEnvironmentCompatibilityProblem({ serverEnvironment, declaredEnvironment: normalizeDeclaredTuuEnvironment(declared) });
  // Compatibles.
  assert.equal(check("DEV", "DEV"), null);
  assert.equal(check("PROD", "PROD"), null);
  assert.equal(check("DEV", " dev "), null);
  // APK 0.3.13 o navegador (no declara): solo DEV.
  for (const none of [undefined, null, ""]) {
    assert.equal(check("DEV", none), null);
    assert.deepEqual([check("PROD", none).status, check("PROD", none).code], [409, "CARD_ATTEMPT_ENVIRONMENT_REQUIRED"]);
  }
  // Mezcla DEV/PROD en cualquier sentido.
  assert.deepEqual([check("DEV", "PROD").status, check("DEV", "PROD").code], [409, "CARD_ATTEMPT_ENVIRONMENT_MISMATCH"]);
  assert.deepEqual([check("PROD", "DEV").status, check("PROD", "DEV").code], [409, "CARD_ATTEMPT_ENVIRONMENT_MISMATCH"]);
  // Valor no reconocido: nunca se interpreta como DEV.
  for (const bad of ["QA", "development", 1, {}, true]) {
    assert.equal(normalizeDeclaredTuuEnvironment(bad), "INVALID");
    assert.deepEqual([check("DEV", bad).status, check("DEV", bad).code], [400, "CARD_ATTEMPT_ENVIRONMENT_INVALID"]);
  }
  for (const problem of [check("PROD", null), check("DEV", "PROD"), check("DEV", "QA")]) assert.match(problem.error, /No se inició ningún cobro/);
});

test("ambiente: códigos con los que la APK rechaza el lanzamiento constan como 'TUU no se abrió' para ese intento", () => {
  for (const code of ["TUU_PAYMENT_IN_PROGRESS", "TUU_ATTEMPT_ID_INVALID", "TUU_ATTEMPT_NOT_PERSISTED", "TUU_ATTEMPT_STORE_UNAVAILABLE", "TUU_ENVIRONMENT_NOT_ENABLED", "TUU_ENVIRONMENT_MISCONFIGURED"]) {
    assert.equal(classifyTuuOutcome({ delivered: false, code }).outcome, TUU_OUTCOME.NOT_STARTED, code);
  }
  // Lo desconocido sigue siendo incierto.
  assert.equal(classifyTuuOutcome({ delivered: false, code: "ALGO_NUEVO" }).outcome, TUU_OUTCOME.UNCERTAIN);
  assert.equal(classifyTuuOutcome({ delivered: false, code: "NO_RESPONSE" }).outcome, TUU_OUTCOME.UNCERTAIN);
});

// --- Identificador del equipo -------------------------------------------------

test("equipo: se prefiere el identificador de la APK; valores con otro formato se descartan", () => {
  assert.equal(readNativeDeviceId(attemptApk()), DEVICE);
  assert.equal(resolvePosDeviceId(attemptApk(), () => "pos-0123456789abcdef01234567"), DEVICE);
  for (const bad of ["apk-123", "pos-0123456789abcdef01234567", "", null, 5, `apk-${"A".repeat(32)}`]) {
    const bridge = { getDeviceId: () => JSON.stringify({ ok: true, deviceId: bad }) };
    assert.equal(readNativeDeviceId(bridge), null);
    assert.equal(resolvePosDeviceId(bridge, () => "pos-0123456789abcdef01234567"), "pos-0123456789abcdef01234567");
  }
  assert.equal(readNativeDeviceId({ getDeviceId: () => JSON.stringify({ ok: false, deviceId: DEVICE }) }), null);
  assert.equal(resolvePosDeviceId({}, () => { throw new Error("sin almacenamiento"); }), null);
});

// --- Correlación --------------------------------------------------------------

test("correlación: attemptId válido, ausente (APK 0.3.13) y resultado no asignable", () => {
  assert.deepEqual(correlationOfTuuResult(JSON.stringify({ ...approved(), attemptId: A1 })), { declared: true, attemptId: A1, uncorrelated: false, late: false });
  assert.deepEqual(correlationOfTuuResult({ ...approved(), attemptId: A1.toUpperCase(), late: true }), { declared: true, attemptId: A1, uncorrelated: false, late: true });
  // APK 0.3.13: no informa el campo.
  assert.deepEqual(correlationOfTuuResult(JSON.stringify(approved())), { declared: false, attemptId: null, uncorrelated: false, late: false });
  // APK 0.4.0 sin intento conocido.
  assert.equal(correlationOfTuuResult({ ...approved(), attemptId: null, uncorrelated: true }).uncorrelated, true);
  // Un attemptId declarado pero inválido nunca se toma como válido.
  assert.equal(correlationOfTuuResult({ ...approved(), attemptId: "no-es-un-intento" }).uncorrelated, true);
  assert.equal(correlationOfTuuResult({ ...approved(), attemptId: "no-es-un-intento" }).attemptId, null);
  // Flujo antiguo de la APK 0.4.0: declara null y marca que NO es "no asignable".
  assert.deepEqual(correlationOfTuuResult({ ...approved(), attemptId: null, uncorrelated: false }), { declared: true, attemptId: null, uncorrelated: false, late: false });
  assert.deepEqual(correlationOfTuuResult("no es json"), { declared: false, attemptId: null, uncorrelated: false, late: false });
});

function routerWithLate() {
  const late = [];
  const router = createTuuResultRouter({ onLateResult: (result) => late.push(result), setTimer: () => 1, clearTimer: () => {} });
  const target = {};
  router.install(target);
  return { router, late, deliver: (value) => target.ParkFacilTuuResult(JSON.stringify(value)) };
}

test("enrutador: el resultado resuelve SOLO la espera de su intento", async () => {
  const { router, late, deliver } = routerWithLate();
  const apk = attemptApk();
  const waiting = router.start(tuuLaunchBridge(apk, A2), "{\"amount\":900}", 1000, { attemptId: A2 });
  // Llega primero el resultado guardado de OTRO intento: no resuelve esta espera.
  deliver({ ...approved({ transactionId: "111111111111" }), attemptId: A1 });
  assert.equal(router.isWaiting(), true);
  assert.equal(late.length, 1);
  assert.equal(late[0].attemptId, A1);
  // El del intento que se espera sí.
  deliver({ ...approved({ transactionId: "222222222222" }), attemptId: A2 });
  const outcome = await waiting;
  assert.equal(outcome.delivered, true);
  assert.equal(outcome.result.attemptId, A2);
  assert.equal(outcome.result.transactionId, "222222222222");
  assert.equal(router.isWaiting(), false);
});

test("enrutador: un resultado sin correlación válida nunca resuelve un pago ni se asigna", async () => {
  const { router, late, deliver } = routerWithLate();
  const waiting = router.start(tuuLaunchBridge(attemptApk(), A1), "{\"amount\":900}", 1000, { attemptId: A1 });
  deliver({ ...approved(), attemptId: null, uncorrelated: true });
  deliver({ ...approved(), attemptId: "no-es-un-intento" });
  assert.equal(router.isWaiting(), true, "la espera sigue abierta");
  assert.equal(late.length, 2);
  assert.ok(late.every((result) => result.uncorrelated === true && result.attemptId === null));
  deliver({ ...approved(), attemptId: A1 });
  assert.equal((await waiting).result.attemptId, A1);
});

test("enrutador: con la APK 0.3.13 (sin attemptId) se conserva el comportamiento anterior", async () => {
  const { router, late, deliver } = routerWithLate();
  const apk = legacyApk();
  const waiting = router.start(tuuLaunchBridge(apk, A1), "{\"amount\":900}", 1000, { attemptId: A1 });
  deliver(approved());
  const outcome = await waiting;
  assert.equal(outcome.delivered, true);
  assert.equal(outcome.result.attemptId, null);
  assert.equal(outcome.result.uncorrelated, false);
  // Y un resultado tardío sin correlación sigue llegando al receptor tardío.
  deliver(approved({ transactionId: "333333333333" }));
  assert.equal(late.length, 1);
  assert.equal(late[0].uncorrelated, false);
});

test("enrutador: si la APK rechaza el lanzamiento (pago anterior sin cerrar) no queda ninguna espera", async () => {
  const { router } = routerWithLate();
  const apk = attemptApk();
  apk.state.results.push({ attemptId: A1, late: false, result: approved() });
  const outcome = await router.start(tuuLaunchBridge(apk, A2), "{\"amount\":900}", 1000, { attemptId: A2 });
  assert.deepEqual([outcome.delivered, outcome.code], [false, "TUU_PAYMENT_IN_PROGRESS"]);
  assert.equal(router.isWaiting(), false);
  assert.equal(classifyTuuOutcome(outcome).outcome, TUU_OUTCOME.NOT_STARTED);
  assert.equal(apk.state.inFlight, null, "no se abrió TUU");
});

// --- Estado guardado, reentrega y ACK -----------------------------------------

test("estado guardado: se leen solo entradas válidas, sin duplicados", () => {
  const apk = attemptApk();
  apk.state.inFlight = { attemptId: A2, awaitingResult: false };
  apk.state.results.push({ attemptId: A1, late: true, result: approved() }, { attemptId: A1, late: false, result: approved() }, { attemptId: "x", result: approved() }, { attemptId: A2 }, null);
  const state = readPendingTuuState(apk);
  assert.equal(state.supported, true);
  assert.deepEqual(state.inFlight, { attemptId: A2, awaitingResult: false });
  assert.deepEqual(state.results.map((entry) => [entry.attemptId, entry.late]), [[A1, true]]);
  // Lectura fallida: se informa, no se inventa un estado vacío "limpio".
  assert.equal(readPendingTuuState({ ...apk, getPendingTuuResults: () => "x" }).readFailed, true);
  assert.equal(readPendingTuuState({ ...apk, getPendingTuuResults: () => JSON.stringify({ ok: false }) }).readFailed, true);
});

test("plan de sincronización: solo avisos al servidor; nunca incluye abrir TUU", () => {
  const apk = attemptApk();
  apk.state.results.push({ attemptId: A1, late: false, result: approved() });
  apk.state.inFlight = { attemptId: A2, awaitingResult: false };
  const plan = planNativeTuuSync(readPendingTuuState(apk));
  assert.deepEqual(plan.map((action) => [action.type, action.attemptId]), [["RESULT", A1], ["LOST_IN_FLIGHT", A2]]);
  assert.ok(plan.every((action) => ["RESULT", "LOST_IN_FLIGHT"].includes(action.type)));
  assert.deepEqual(apk.calls, [], "planificar no llama a la APK para pagar ni confirmar");
  // Un intento cuyo resultado la APK todavía espera no se toca.
  apk.state.inFlight = { attemptId: A2, awaitingResult: true };
  assert.deepEqual(planNativeTuuSync(readPendingTuuState(apk)).map((action) => action.type), ["RESULT"]);
});

test("ACK: solo cuando el servidor guardó el resultado o reconoció el duplicado", () => {
  assert.equal(shouldAckTuuResult({ ok: true, status: 200, network: false }), true);
  for (const response of [
    null,
    undefined,
    { ok: false, status: 0, network: true, code: "NETWORK_ERROR" },
    { ok: false, status: 401, network: false },
    { ok: false, status: 403, network: false, code: "CARD_ATTEMPT_FORBIDDEN" },
    { ok: false, status: 404, network: false, code: "CARD_ATTEMPT_NOT_FOUND" },
    { ok: false, status: 409, network: false, code: "CARD_ATTEMPT_RESULT_CONFLICT" },
    { ok: false, status: 500, network: false },
    { ok: false, status: 503, network: false },
  ]) assert.equal(shouldAckTuuResult(response), false, JSON.stringify(response));
});

test("ACK: un fallo de red no elimina el resultado; el ACK de un intento no borra otro; un ACK incorrecto no borra nada", () => {
  const apk = attemptApk();
  apk.state.results.push({ attemptId: A1, late: false, result: approved() }, { attemptId: A2, late: false, result: approved({ transactionId: "222222222222" }) });
  // Sin red: la web no confirma -> el resultado sigue y se volverá a entregar.
  const offline = { ok: false, status: 0, network: true };
  if (shouldAckTuuResult(offline)) ackNativeTuuResult(apk, A1);
  assert.equal(readPendingTuuState(apk).results.length, 2);
  assert.deepEqual(planNativeTuuSync(readPendingTuuState(apk)).map((action) => action.attemptId), [A1, A2]);
  // ACK incorrecto.
  for (const wrong of ["33333333-3333-4333-8333-333333333333", "", null, "abc"]) assert.equal(ackNativeTuuResult(apk, wrong).ok, false);
  assert.equal(readPendingTuuState(apk).results.length, 2);
  // Servidor guardó A1.
  if (shouldAckTuuResult({ ok: true, status: 200, network: false })) assert.equal(ackNativeTuuResult(apk, A1).ok, true);
  assert.deepEqual(readPendingTuuState(apk).results.map((entry) => entry.attemptId), [A2]);
  assert.equal(ackNativeTuuResult(apk, A1).ok, false, "repetir el ACK no afecta a A2");
  assert.deepEqual(readPendingTuuState(apk).results.map((entry) => entry.attemptId), [A2]);
});

test("intento sin resultado: se libera en la APK solo cuando el servidor ya lo tiene resuelto o incierto", () => {
  assert.equal(shouldAbandonLostTuuAttempt({ ok: true, status: 200, network: false }), true);
  assert.equal(shouldAbandonLostTuuAttempt({ ok: false, status: 409, network: false, code: "CARD_ATTEMPT_RESULT_CONFLICT" }), true);
  for (const response of [null, { ok: false, status: 0, network: true }, { ok: false, status: 401 }, { ok: false, status: 403, code: "CARD_ATTEMPT_FORBIDDEN" }, { ok: false, status: 404, code: "CARD_ATTEMPT_NOT_FOUND" }, { ok: false, status: 409, code: "CARD_ATTEMPT_INVALID_STATE" }, { ok: false, status: 503 }]) {
    assert.equal(shouldAbandonLostTuuAttempt(response), false, JSON.stringify(response));
  }
  const apk = attemptApk();
  apk.state.inFlight = { attemptId: A1, awaitingResult: true };
  assert.deepEqual(abandonNativeTuuAttempt(apk, A1), { ok: false, code: "AWAITING_RESULT" });
  apk.state.inFlight = { attemptId: A1, awaitingResult: false };
  assert.equal(abandonNativeTuuAttempt(apk, A2).ok, false);
  assert.equal(abandonNativeTuuAttempt(apk, A1).ok, true);
  assert.equal(readPendingTuuState(apk).inFlight, null);
  assert.ok(!apk.calls.some(([name]) => name.startsWith("payWithTuu")), "liberar nunca relanza TUU");
});
