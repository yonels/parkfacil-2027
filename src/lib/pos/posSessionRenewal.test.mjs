import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { POS_SESSION_RENEW_MS, POS_TOKEN_MIN_REMAINING_MS, renewPosSession, tokenNeedsRefresh } from "./posSessionRenewal.mjs";

const NOW = Date.parse("2026-11-04T20:00:00Z");
const session = (minutes, token = "t1") => ({ access_token: token, expires_at: (NOW + minutes * 60000) / 1000 });
const run = async (current, { refreshed = null, status = 200 } = {}) => {
  const calls = { refresh: 0, posted: [] };
  const result = await renewPosSession({
    now: NOW,
    getSession: async () => current,
    refreshSession: async () => { calls.refresh += 1; if (refreshed === "fail") throw new Error("sin red"); return refreshed; },
    postSession: async (token) => { calls.posted.push(token); return status; },
  });
  return { result, calls };
};

test("renueva con frecuencia suficiente para la cookie de 55 minutos y el token de 60", () => {
  assert.ok(POS_SESSION_RENEW_MS < 55 * 60 * 1000 / 2);
  assert.ok(POS_TOKEN_MIN_REMAINING_MS > POS_SESSION_RENEW_MS);
});

test("con token vigente solo renueva la cookie", async () => {
  const { result, calls } = await run(session(40));
  assert.deepEqual(result, { ok: true });
  assert.equal(calls.refresh, 0);
  assert.deepEqual(calls.posted, ["t1"]);
});

test("con token por vencer lo refresca y guarda el nuevo", async () => {
  assert.equal(tokenNeedsRefresh(session(10), NOW), true);
  const { calls } = await run(session(10), { refreshed: session(60, "t2") });
  assert.equal(calls.refresh, 1);
  assert.deepEqual(calls.posted, ["t2"]);
});

test("si falla el refresco usa el token vigente", async () => {
  const { result, calls } = await run(session(10), { refreshed: "fail" });
  assert.equal(result.ok, true);
  assert.deepEqual(calls.posted, ["t1"]);
});

test("sin sesión local no publica nada: no revive una sesión cerrada", async () => {
  const { result, calls } = await run(null);
  assert.deepEqual(result, { ok: false, reason: "NO_SESSION" });
  assert.deepEqual(calls.posted, []);
});

test("un rechazo del servidor se informa, no se da por renovada", async () => {
  const { result } = await run(session(40), { status: 403 });
  assert.deepEqual(result, { ok: false, reason: "REJECTED", status: 403 });
});

test("el POS renueva en intervalo y reintenta una vez ante un 401 de sesión", async () => {
  const source = await readFile(new URL("../../components/pos/PosTerminal.js", import.meta.url), "utf8");
  assert.match(source, /setInterval\(\(\) => void renewPosSessionNow\(\), POS_SESSION_RENEW_MS\)/);
  const fn = source.slice(source.indexOf("async function getSessionContext()"), source.indexOf("async function getPosVehicleSummary()"));
  assert.match(fn, /status === 401/);
  assert.match(fn, /await renewPosSessionNow\(\)/);
});
