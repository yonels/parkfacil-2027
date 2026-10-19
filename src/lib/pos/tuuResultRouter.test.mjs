import test from "node:test";
import assert from "node:assert/strict";

import { createTuuResultRouter } from "./tuuResultRouter.mjs";
import { TUU_OUTCOME, classifyTuuOutcome } from "./tuuPayment.mjs";

// Fase TUU-02: receptor permanente del resultado de TUU. Temporizadores y
// "window" son dobles: no hay espera real.

function fakeTimers() {
  const timers = [];
  return {
    setTimer: (fn, ms) => { const timer = { fn, ms, cleared: false }; timers.push(timer); return timer; },
    clearTimer: (timer) => { if (timer) timer.cleared = true; },
    fire: () => { for (const timer of timers.splice(0)) if (!timer.cleared) timer.fn(); },
    timers,
  };
}

const launchedBridge = () => {
  const calls = [];
  return { calls, payWithTuu: (payload) => { calls.push(payload); return JSON.stringify({ ok: true, status: "LAUNCHED" }); } };
};
const bridgeResult = (tuu) => JSON.stringify({ success: false, cancelled: false, rawResponse: JSON.stringify(tuu) });
const APPROVED = { transactionStatus: true, sequenceNumber: "000012345678" };

test("router TUU: resultado aprobado entregado dentro del plazo resuelve la espera", async () => {
  const timers = fakeTimers();
  const late = [];
  const router = createTuuResultRouter({ onLateResult: (result) => late.push(result), ...timers });
  const target = {};
  router.install(target);
  const pending = router.start(launchedBridge(), "{}", 120000);
  assert.equal(router.isWaiting(), true);
  target.ParkFacilTuuResult(bridgeResult(APPROVED));
  const outcome = await pending;
  assert.equal(outcome.delivered, true);
  assert.equal(outcome.result.success, true);
  assert.equal(outcome.result.transactionId, "000012345678");
  assert.equal(classifyTuuOutcome(outcome).outcome, TUU_OUTCOME.APPROVED);
  assert.equal(late.length, 0);
  assert.equal(timers.timers[0].cleared, true, "el temporizador se cancela al llegar el resultado");
});

test("router TUU: tiempo de espera agotado -> NO_RESPONSE (resultado incierto), nunca rechazado ni cancelado", async () => {
  const timers = fakeTimers();
  const router = createTuuResultRouter(timers);
  router.install({});
  const pending = router.start(launchedBridge(), "{}", 120000);
  assert.equal(timers.timers[0].ms, 120000);
  timers.fire();
  const outcome = await pending;
  assert.deepEqual({ delivered: outcome.delivered, code: outcome.code }, { delivered: false, code: "NO_RESPONSE" });
  assert.equal(classifyTuuOutcome(outcome).outcome, TUU_OUTCOME.UNCERTAIN);
  assert.equal(router.isWaiting(), false);
});

test("router TUU: una respuesta tardía (después del tiempo de espera) NO se descarta: llega a onLateResult", async () => {
  const timers = fakeTimers();
  const late = [];
  const router = createTuuResultRouter({ onLateResult: (result) => late.push(result), ...timers });
  const target = {};
  router.install(target);
  const pending = router.start(launchedBridge(), "{}", 120000);
  timers.fire();
  await pending;
  // El receptor sigue instalado tras el tiempo de espera.
  assert.equal(typeof target.ParkFacilTuuResult, "function");
  target.ParkFacilTuuResult(bridgeResult(APPROVED));
  assert.equal(late.length, 1);
  assert.equal(late[0].success, true, "respuesta tardía aprobada");
  assert.equal(late[0].transactionId, "000012345678");
});

test("router TUU: tras recargar la app (sin espera activa) el resultado también se captura como tardío", () => {
  const late = [];
  const router = createTuuResultRouter({ onLateResult: (result) => late.push(result) });
  const target = {};
  router.install(target);
  target.ParkFacilTuuResult(bridgeResult({ transactionStatus: false, errorCode: 10 }));
  assert.equal(late.length, 1);
  assert.equal(late[0].cancelled, true);
  // El manejador se puede reemplazar (versión vigente del componente).
  const next = [];
  router.setLateResultHandler((result) => next.push(result));
  target.ParkFacilTuuResult(bridgeResult(APPROVED));
  assert.equal(late.length, 1);
  assert.equal(next.length, 1);
});

test("router TUU: aplicación TUU no instalada / sin bridge -> no se inicia el pago y no queda espera abierta", async () => {
  const router = createTuuResultRouter(fakeTimers());
  const noBridge = await router.start(null, "{}", 1000);
  assert.equal(noBridge.code, "TUU_BRIDGE_UNAVAILABLE");
  assert.equal(classifyTuuOutcome(noBridge).outcome, TUU_OUTCOME.NOT_STARTED);
  const notInstalled = await router.start({ payWithTuu: () => JSON.stringify({ ok: false, code: "TUU_NOT_INSTALLED", message: "x" }) }, "{}", 1000);
  assert.equal(notInstalled.code, "TUU_NOT_INSTALLED");
  assert.equal(classifyTuuOutcome(notInstalled).outcome, TUU_OUTCOME.NOT_STARTED);
  assert.equal(router.isWaiting(), false);
});

test("router TUU: una excepción al invocar payWithTuu se atrapa y es resultado incierto (pudo abrirse TUU)", async () => {
  const router = createTuuResultRouter(fakeTimers());
  const outcome = await router.start({ payWithTuu: () => { throw new Error("bridge roto"); } }, "{}", 1000);
  assert.equal(outcome.code, "TUU_BRIDGE_EXCEPTION");
  assert.equal(classifyTuuOutcome(outcome).outcome, TUU_OUTCOME.UNCERTAIN);
  assert.equal(router.isWaiting(), false);
});

test("router TUU: mientras hay un pago en espera no se lanza un segundo Intent", async () => {
  const timers = fakeTimers();
  const router = createTuuResultRouter(timers);
  const bridge = launchedBridge();
  const first = router.start(bridge, "{\"amount\":1}", 120000);
  const second = await router.start(bridge, "{\"amount\":2}", 120000);
  assert.equal(second.code, "TUU_PAYMENT_IN_PROGRESS");
  assert.equal(bridge.calls.length, 1, "payWithTuu se llamó una sola vez");
  timers.fire();
  await first;
});

test("router TUU: respuesta inválida del bridge -> entregada pero incierta (nunca aprobada, nunca rechazada)", async () => {
  const timers = fakeTimers();
  const router = createTuuResultRouter(timers);
  const target = {};
  router.install(target);
  const pending = router.start(launchedBridge(), "{}", 120000);
  target.ParkFacilTuuResult("{ json invalido");
  const outcome = await pending;
  assert.equal(outcome.delivered, true);
  assert.equal(outcome.result.success, false);
  assert.equal(classifyTuuOutcome(outcome).outcome, TUU_OUTCOME.UNCERTAIN);
});

test("router TUU: una aprobación duplicada no resuelve la espera de otro pago ni llega como tardía", async () => {
  const timers = fakeTimers();
  const late = [];
  const duplicates = [];
  const processed = new Set(["000012345678"]);
  const router = createTuuResultRouter({
    onLateResult: (result) => late.push(result),
    isDuplicate: (result) => processed.has(result.transactionId),
    onDuplicate: (result) => duplicates.push(result.transactionId),
    ...timers,
  });
  const target = {};
  router.install(target);
  // Otro ticket está esperando su propio resultado.
  const pending = router.start(launchedBridge(), "{}", 120000);
  target.ParkFacilTuuResult(bridgeResult(APPROVED));
  assert.equal(router.isWaiting(), true, "la espera del otro ticket sigue abierta");
  assert.deepEqual(duplicates, ["000012345678"]);
  assert.equal(late.length, 0);
  // Su resultado real (otra referencia) sí la resuelve.
  target.ParkFacilTuuResult(bridgeResult({ transactionStatus: true, sequenceNumber: "000099990000" }));
  const outcome = await pending;
  assert.equal(outcome.result.transactionId, "000099990000");
  // Un rechazo o cancelación repetidos no se filtran (no tienen referencia).
  target.ParkFacilTuuResult(bridgeResult({ errorCode: 10 }));
  assert.equal(late.length, 1);
});
