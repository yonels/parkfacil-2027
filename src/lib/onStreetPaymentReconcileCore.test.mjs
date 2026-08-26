import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  reconcileDueOnStreetPayments,
  RECONCILE_STALE_THRESHOLD_MS,
  RECONCILE_BATCH_SIZE,
} from "./onStreetPaymentReconcileCore.mjs";

// Mismo enfoque que onStreetSmsSimulatedE2E.test.mjs: una base de datos en
// memoria mínima que soporta exactamente los métodos encadenados que usa
// selectStaleCommittingTransactions (select/eq/in/lte/order/limit) y
// resuelve como una promesa (igual que el cliente real de Supabase).
function memoryDb(rows) {
  return {
    from(name) {
      assert.equal(name, "payment_transactions");
      const filters = [];
      let limitN = null;
      const api = {
        select() { return api; },
        eq(key, value) { filters.push((row) => row[key] === value); return api; },
        in(key, values) { filters.push((row) => values.includes(row[key])); return api; },
        lte(key, value) { filters.push((row) => row[key] <= value); return api; },
        order(key, { ascending } = {}) {
          rows = [...rows].sort((a, b) => (ascending === false ? -1 : 1) * (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0));
          return api;
        },
        limit(n) { limitN = n; return api; },
        then(resolve) {
          let filtered = rows.filter((row) => filters.every((f) => f(row)));
          if (limitN != null) filtered = filtered.slice(0, limitN);
          resolve({ data: filtered, error: null });
        },
      };
      return api;
    },
  };
}

const NOW = "2026-08-26T17:00:00.000Z";
const OLD_ENOUGH = "2026-08-26T16:57:00.000Z"; // 3 min antes de NOW: supera el umbral de 2 min
const TOO_RECENT = "2026-08-26T16:59:30.000Z"; // 30s antes de NOW: dentro del umbral

function baseRow(overrides) {
  return { id: "tx-1", source_id: "intent-1", source_type: "ON_STREET_INITIAL", status: "COMMITTING", updated_at: OLD_ENOUGH, provider: "TRANSBANK_WEBPAY", ...overrides };
}

// --- A. COMMITTING antiguo + proveedor autorizado -> RECOVERED ---
test("COMMITTING antiguo con proveedor autorizado se marca RECOVERED", async () => {
  const db = memoryDb([baseRow()]);
  const recover = async (_db, { transactionId }) => { assert.equal(transactionId, "tx-1"); return { status: "COMMITTED", sessionId: "s-1", sessionToken: "tok-1" }; };
  const { summary, results } = await reconcileDueOnStreetPayments({ db, recover, now: NOW });
  assert.deepEqual(summary, { processed: 1, recovered: 1, pending: 0, skipped: 0, failed: 0 });
  assert.deepEqual(results, [{ transactionId: "tx-1", outcome: "RECOVERED" }]);
});

// --- B. COMMITTING reciente -> SKIPPED (nunca llega a candidato) ---
test("COMMITTING reciente (dentro del umbral) no es candidato: nunca se llama a recover()", async () => {
  const db = memoryDb([baseRow({ id: "tx-recent", updated_at: TOO_RECENT })]);
  const recover = async () => assert.fail("no debe intentarse recuperar una transacción todavía dentro de su ventana normal");
  const { summary, results } = await reconcileDueOnStreetPayments({ db, recover, now: NOW });
  assert.deepEqual(summary, { processed: 0, recovered: 0, pending: 0, skipped: 0, failed: 0 });
  assert.deepEqual(results, []);
});

// --- C. COMMITTING antiguo + proveedor pending -> PENDING ---
test("proveedor todavía no confirma autorización: PENDING, no crea sesión, no marca COMMITTED", async () => {
  const db = memoryDb([baseRow({ id: "tx-pending" })]);
  const recover = async () => ({ status: "PENDING", providerStatus: "INITIALIZED" });
  const { summary, results } = await reconcileDueOnStreetPayments({ db, recover, now: NOW });
  assert.deepEqual(summary, { processed: 1, recovered: 0, pending: 1, skipped: 0, failed: 0 });
  assert.deepEqual(results, [{ transactionId: "tx-pending", outcome: "PENDING" }]);
});

// --- D. COMMITTING antiguo + error de red -> no éxito + retry futuro ---
test("error de red o RPC (incluye un 23505 real de la regla de sesión activa) no se asume éxito ni rechazo: FAILED, sigue en COMMITTING para el próximo ciclo", async () => {
  const db = memoryDb([baseRow({ id: "tx-network" })]);
  const recover = async () => { throw Object.assign(new Error("fetch failed"), { code: "ETIMEDOUT" }); };
  const { summary, results } = await reconcileDueOnStreetPayments({ db, recover, now: NOW });
  assert.deepEqual(summary, { processed: 1, recovered: 0, pending: 0, skipped: 0, failed: 1 });
  assert.deepEqual(results, [{ transactionId: "tx-network", outcome: "FAILED" }]);
});

test("un 23505 real de la RPC de finalización tampoco se asume como éxito", async () => {
  const db = memoryDb([baseRow({ id: "tx-23505" })]);
  const recover = async () => { throw Object.assign(new Error("duplicate key"), { code: "23505" }); };
  const { results } = await reconcileDueOnStreetPayments({ db, recover, now: NOW });
  assert.deepEqual(results, [{ transactionId: "tx-23505", outcome: "FAILED" }]);
});

// --- E. COMMITTED no se procesa (el propio filtro SQL lo excluye) ---
test("una transacción ya COMMITTED nunca es candidata", async () => {
  const db = memoryDb([baseRow({ id: "tx-done", status: "COMMITTED" })]);
  const recover = async () => assert.fail("no debe tocarse una transacción ya COMMITTED");
  const { results } = await reconcileDueOnStreetPayments({ db, recover, now: NOW });
  assert.deepEqual(results, []);
});

// --- F. FAILED no se reprocesa por este mecanismo ---
test("una transacción ya FAILED no es candidata (el filtro solo selecciona COMMITTING)", async () => {
  const db = memoryDb([baseRow({ id: "tx-failed", status: "FAILED" })]);
  const recover = async () => assert.fail("FAILED no es responsabilidad del reconciliador de COMMITTING atascados");
  const { results } = await reconcileDueOnStreetPayments({ db, recover, now: NOW });
  assert.deepEqual(results, []);
});

// --- G. dos ejecuciones no duplican pago/sesión ---
test("dos ejecuciones sucesivas sobre la misma fila: la segunda ve exactamente el mismo resultado idempotente de recover(), sin duplicar nada", async () => {
  const db = memoryDb([baseRow({ id: "tx-idem" })]);
  let calls = 0;
  const recover = async () => { calls += 1; return { status: "COMMITTED", sessionId: "s-1" }; }; // recoverWebpayTransaction ya es idempotente (RPC con for update + short-circuit en COMMITTED)
  await reconcileDueOnStreetPayments({ db, recover, now: NOW });
  await reconcileDueOnStreetPayments({ db, recover, now: NOW });
  assert.equal(calls, 2, "el reconciliador llama a recover() en cada ciclo; la idempotencia real vive en recoverWebpayTransaction/la RPC, no aquí");
});

// --- H. el reconciliador nunca llama createTransaction ---
// Se excluyen las líneas de comentario: el archivo documenta a propósito
// qué NO debe llamar (igual que sentralandCore.test.mjs con las opciones de
// TLS), así que esos nombres aparecen en prosa explicativa, nunca en código
// real ejecutable.
function withoutComments(source) {
  return source.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
}

test("el núcleo del reconciliador nunca referencia createTransaction ni startWebpayPayment en código real", async () => {
  const code = withoutComments(await readFile(new URL("./onStreetPaymentReconcileCore.mjs", import.meta.url), "utf8"));
  assert.doesNotMatch(code, /createTransaction/);
  assert.doesNotMatch(code, /startWebpayPayment/);
});

test("el envoltorio de servicio tampoco importa createTransaction ni startWebpayPayment", async () => {
  const source = await readFile(new URL("./onStreetPaymentReconcileService.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /createTransaction/);
  assert.doesNotMatch(source, /startWebpayPayment/);
  assert.match(source, /recoverWebpayTransaction/, "debe delegar en la recuperación idempotente existente, no reimplementarla");
});

// --- I. INITIAL funciona ---
test("candidato ON_STREET_INITIAL se procesa normalmente", async () => {
  const db = memoryDb([baseRow({ id: "tx-initial", source_type: "ON_STREET_INITIAL" })]);
  const recover = async () => ({ status: "COMMITTED", sessionId: "s-initial" });
  const { results } = await reconcileDueOnStreetPayments({ db, recover, now: NOW });
  assert.deepEqual(results, [{ transactionId: "tx-initial", outcome: "RECOVERED" }]);
});

// --- J. EXTENSION funciona ---
test("candidato ON_STREET_EXTENSION se procesa igual, sin lógica especial", async () => {
  const db = memoryDb([baseRow({ id: "tx-extension", source_type: "ON_STREET_EXTENSION" })]);
  const recover = async () => ({ status: "COMMITTED", sessionId: "s-extension" });
  const { results } = await reconcileDueOnStreetPayments({ db, recover, now: NOW });
  assert.deepEqual(results, [{ transactionId: "tx-extension", outcome: "RECOVERED" }]);
});

test("fuente ajena a On-Street (otro source_type) nunca es candidata", async () => {
  const db = memoryDb([baseRow({ id: "tx-other", source_type: "OTHER_PRODUCT" })]);
  const recover = async () => assert.fail("no debe tocar transacciones fuera de ON_STREET_INITIAL/ON_STREET_EXTENSION");
  const { results } = await reconcileDueOnStreetPayments({ db, recover, now: NOW });
  assert.deepEqual(results, []);
});

// --- Batch y orden ---
test("respeta el tamaño de lote y procesa las más antiguas primero", async () => {
  const rows = Array.from({ length: 15 }, (_, i) => baseRow({ id: `tx-${i}`, updated_at: new Date(new Date(OLD_ENOUGH).getTime() - i * 1000).toISOString() }));
  const db = memoryDb(rows);
  const order = [];
  const recover = async (_db, { transactionId }) => { order.push(transactionId); return { status: "PENDING", providerStatus: "INITIALIZED" }; };
  const { summary } = await reconcileDueOnStreetPayments({ db, recover, now: NOW, batchSize: 5 });
  assert.equal(summary.processed, 5, "no procesa más que el tamaño de lote configurado");
  assert.equal(order[0], "tx-14", "la más antigua (updated_at menor) va primero");
});

// --- Constantes documentadas, no números mágicos dispersos ---
test("umbral y tamaño de lote son constantes exportadas y documentadas, no literales dispersos", () => {
  assert.equal(RECONCILE_STALE_THRESHOLD_MS, 120_000);
  assert.equal(RECONCILE_BATCH_SIZE, 10);
});

// --- Logging seguro ---
test("el código real de registro nunca referencia secretos ni datos de tarjeta", async () => {
  const code = withoutComments(await readFile(new URL("./onStreetPaymentReconcileCore.mjs", import.meta.url), "utf8"));
  for (const forbidden of ["token_ws", "PARKFACIL_INTERNAL_SERVICE_KEY", "CRON_SECRET", "SERVICE_ROLE_KEY", "card_detail"]) {
    assert.doesNotMatch(code, new RegExp(forbidden));
  }
});
