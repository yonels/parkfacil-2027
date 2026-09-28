import assert from "node:assert/strict";
import test from "node:test";
import { hasNativeQrScanner, scanQrWithNativeScanner } from "./nativeQrScanner.mjs";

function fakeWindow(scanQr) {
  const win = {
    timers: [],
    setTimeout(fn, ms) { const id = this.timers.length + 1; this.timers.push({ id, fn, ms }); return id; },
    clearTimeout(id) { this.timers = this.timers.filter((t) => t.id !== id); },
  };
  if (scanQr) win.ParkFacilDevice = { scanQr: () => scanQr(win) };
  return win;
}

test("sin bridge (navegador) -> unsupported, usa la cámara web", async () => {
  const win = fakeWindow(null);
  assert.equal(hasNativeQrScanner(win), false);
  assert.deepEqual(await scanQrWithNativeScanner(win), { ok: false, unsupported: true });
});

test("APK antiguo con scanQr stub (not_implemented) -> unsupported", async () => {
  const win = fakeWindow(() => JSON.stringify({ ok: false, error: "not_implemented", operation: "scanQr" }));
  assert.equal(hasNativeQrScanner(win), true);
  assert.deepEqual(await scanQrWithNativeScanner(win), { ok: false, unsupported: true });
  assert.equal(win.ParkFacilQrResult, undefined, "restaura el callback previo");
});

test("lectura nativa: el valor llega por ParkFacilQrResult (string JSON)", async () => {
  const win = fakeWindow((w) => {
    setImmediate(() => w.ParkFacilQrResult(JSON.stringify({ ok: true, value: " 3f1c2b7e-9a4d-4c1e-8b2a-0d9e8f7a6b5c " })));
    return JSON.stringify({ ok: true, started: true });
  });
  assert.deepEqual(await scanQrWithNativeScanner(win), { ok: true, value: "3f1c2b7e-9a4d-4c1e-8b2a-0d9e8f7a6b5c" });
  assert.equal(win.timers.length, 0, "cancela el timeout");
});

test("el operador cierra el escáner -> cancelled; resultados repetidos se ignoran", async () => {
  const win = fakeWindow((w) => {
    setImmediate(() => { w.ParkFacilQrResult({ ok: false, cancelled: true }); });
    return JSON.stringify({ ok: true, started: true });
  });
  const result = await scanQrWithNativeScanner(win);
  assert.deepEqual(result, { ok: false, cancelled: true });
});

test("fallo al lanzar o respuesta inválida -> error, nunca un valor", async () => {
  const launchFail = fakeWindow(() => JSON.stringify({ ok: false, error: "launch_failed" }));
  assert.deepEqual(await scanQrWithNativeScanner(launchFail), { ok: false, error: "launch_failed" });
  const garbage = fakeWindow((w) => { setImmediate(() => w.ParkFacilQrResult("no-json")); return "{\"ok\":true}"; });
  assert.deepEqual(await scanQrWithNativeScanner(garbage), { ok: false, error: "invalid_result" });
});

test("timeout si el APK nunca responde", async () => {
  const win = fakeWindow(() => JSON.stringify({ ok: true, started: true }));
  const pending = scanQrWithNativeScanner(win, { timeoutMs: 5 });
  win.timers[0].fn();
  assert.deepEqual(await pending, { ok: false, error: "timeout" });
});
