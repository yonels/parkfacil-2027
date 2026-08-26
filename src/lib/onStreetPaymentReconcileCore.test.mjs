import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  reconcileDueOnStreetPayments,
  RECONCILE_STALE_THRESHOLD_MS,
  REDIRECTED_RECHECK_THRESHOLD_MS,
  REDIRECTED_ABANDON_THRESHOLD_MS,
  RECONCILE_BATCH_SIZE,
} from "./onStreetPaymentReconcileCore.mjs";

// Mismo enfoque que onStreetSmsSimulatedE2E.test.mjs: una base de datos en
// memoria mínima que soporta exactamente los métodos encadenados que usa
// selectStaleTransactions (select/eq/in/lte/order/limit) y resuelve como
// una promesa (igual que el cliente real de Supabase). Una sola tabla
// (payment_transactions); el núcleo la consulta dos veces por invocación
// (cola COMMITTING y cola REDIRECTED), cada consulta ve el estado actual.
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
const OLD_ENOUGH = "2026-08-26T16:57:00.000Z"; // 3 min antes de NOW: supera el umbral COMMITTING de 2 min
const TOO_RECENT = "2026-08-26T16:59:30.000Z"; // 30s antes de NOW: dentro del umbral COMMITTING
const REDIRECTED_RECHECKABLE = "2026-08-26T16:54:00.000Z"; // 6 min antes: supera el umbral REDIRECTED de 5 min, no supera el de abandono (30 min)
const REDIRECTED_TOO_RECENT = "2026-08-26T16:58:00.000Z"; // 2 min antes: dentro del umbral REDIRECTED de 5 min
const REDIRECTED_ABANDONABLE = "2026-08-26T16:25:00.000Z"; // 35 min antes: supera también el umbral de abandono de 30 min

function committingRow(overrides) {
  return { id: "tx-1", source_id: "intent-1", source_type: "ON_STREET_INITIAL", status: "COMMITTING", updated_at: OLD_ENOUGH, redirected_at: OLD_ENOUGH, provider: "TRANSBANK_WEBPAY", ...overrides };
}
function redirectedRow(overrides) {
  return { id: "tx-r1", source_id: "intent-r1", source_type: "ON_STREET_EXTENSION", status: "REDIRECTED", updated_at: REDIRECTED_RECHECKABLE, redirected_at: REDIRECTED_RECHECKABLE, provider: "TRANSBANK_WEBPAY", ...overrides };
}

function withoutComments(source) {
  return source.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
}

// ============================================================
// Cola COMMITTING (incidente 926c7144-...)
// ============================================================

test("COMMITTING antiguo con proveedor autorizado se marca RECOVERED", async () => {
  const db = memoryDb([committingRow()]);
  const recover = async (_db, { transactionId }) => { assert.equal(transactionId, "tx-1"); return { status: "COMMITTED", sessionId: "s-1", sessionToken: "tok-1" }; };
  const { summary, results } = await reconcileDueOnStreetPayments({ db, recover, now: NOW });
  assert.deepEqual(summary, { processed: 1, recovered: 1, pending: 0, skipped: 0, abandoned: 0, failed: 0, sessionsExpired: 0 });
  assert.deepEqual(results, [{ transactionId: "tx-1", queue: "COMMITTING", outcome: "RECOVERED" }]);
});

test("COMMITTING reciente (dentro del umbral) no es candidato: nunca se llama a recover()", async () => {
  const db = memoryDb([committingRow({ id: "tx-recent", updated_at: TOO_RECENT })]);
  const recover = async () => assert.fail("no debe intentarse recuperar una transacción todavía dentro de su ventana normal");
  const { summary, results } = await reconcileDueOnStreetPayments({ db, recover, now: NOW });
  assert.deepEqual(summary, { processed: 0, recovered: 0, pending: 0, skipped: 0, abandoned: 0, failed: 0, sessionsExpired: 0 });
  assert.deepEqual(results, []);
});

test("proveedor todavía no confirma autorización (COMMITTING): PENDING, no crea sesión, no marca COMMITTED", async () => {
  const db = memoryDb([committingRow({ id: "tx-pending" })]);
  const recover = async () => ({ status: "PENDING", providerStatus: "INITIALIZED" });
  const { summary, results } = await reconcileDueOnStreetPayments({ db, recover, now: NOW });
  assert.deepEqual(summary, { processed: 1, recovered: 0, pending: 1, skipped: 0, abandoned: 0, failed: 0, sessionsExpired: 0 });
  assert.deepEqual(results, [{ transactionId: "tx-pending", queue: "COMMITTING", outcome: "PENDING" }]);
});

test("error de red o RPC (incluye un 23505 real de la regla de sesión activa) no se asume éxito ni rechazo: FAILED", async () => {
  const db = memoryDb([committingRow({ id: "tx-network" })]);
  const recover = async () => { throw Object.assign(new Error("fetch failed"), { code: "ETIMEDOUT" }); };
  const { summary, results } = await reconcileDueOnStreetPayments({ db, recover, now: NOW });
  assert.deepEqual(summary, { processed: 1, recovered: 0, pending: 0, skipped: 0, abandoned: 0, failed: 1, sessionsExpired: 0 });
  assert.deepEqual(results, [{ transactionId: "tx-network", queue: "COMMITTING", outcome: "FAILED" }]);
});

test("una transacción ya COMMITTED nunca es candidata", async () => {
  const db = memoryDb([committingRow({ id: "tx-done", status: "COMMITTED" })]);
  const recover = async () => assert.fail("no debe tocarse una transacción ya COMMITTED");
  const { results } = await reconcileDueOnStreetPayments({ db, recover, now: NOW });
  assert.deepEqual(results, []);
});

test("una transacción ya FAILED no es candidata de ninguna cola", async () => {
  const db = memoryDb([committingRow({ id: "tx-failed", status: "FAILED" })]);
  const recover = async () => assert.fail("FAILED no es responsabilidad de este reconciliador");
  const { results } = await reconcileDueOnStreetPayments({ db, recover, now: NOW });
  assert.deepEqual(results, []);
});

test("sesión bloqueante ACTIVE vencida se expira ANTES del intento de recuperación, y eso desbloquea el pago", async () => {
  const db = memoryDb([committingRow({ id: "tx-blocked" })]);
  let sessionExpired = false;
  const expireSessions = async () => { sessionExpired = true; return 1; };
  const recover = async () => {
    if (!sessionExpired) throw Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
    return { status: "COMMITTED", sessionId: "s-new", sessionToken: "tok-new" };
  };
  const { summary, results } = await reconcileDueOnStreetPayments({ db, recover, expireSessions, now: NOW });
  assert.equal(sessionExpired, true, "la expiración debe haberse intentado");
  assert.deepEqual(results, [{ transactionId: "tx-blocked", queue: "COMMITTING", outcome: "RECOVERED" }]);
  assert.equal(summary.recovered, 1);
  assert.equal(summary.sessionsExpired, 1);
});

test("un fallo en el barrido de expiración no detiene la reconciliación de las transacciones ya candidatas", async () => {
  const db = memoryDb([committingRow({ id: "tx-resiliente" })]);
  const expireSessions = async () => { throw Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }); };
  const recover = async () => ({ status: "COMMITTED", sessionId: "s-resiliente" });
  const { summary, results } = await reconcileDueOnStreetPayments({ db, recover, expireSessions, now: NOW });
  assert.deepEqual(results, [{ transactionId: "tx-resiliente", queue: "COMMITTING", outcome: "RECOVERED" }]);
  assert.equal(summary.sessionsExpired, 0, "no se asume ningún conteo si el barrido falló");
});

test("dos ejecuciones sucesivas sobre la misma fila COMMITTING: la idempotencia real vive en recoverWebpayTransaction/la RPC", async () => {
  const db = memoryDb([committingRow({ id: "tx-idem" })]);
  let calls = 0;
  const recover = async () => { calls += 1; return { status: "COMMITTED", sessionId: "s-1" }; };
  await reconcileDueOnStreetPayments({ db, recover, now: NOW });
  await reconcileDueOnStreetPayments({ db, recover, now: NOW });
  assert.equal(calls, 2, "el reconciliador llama a recover() en cada ciclo; la idempotencia real vive en recoverWebpayTransaction/la RPC, no aquí");
});

test("candidato ON_STREET_INITIAL se procesa normalmente", async () => {
  const db = memoryDb([committingRow({ id: "tx-initial", source_type: "ON_STREET_INITIAL" })]);
  const recover = async () => ({ status: "COMMITTED", sessionId: "s-initial" });
  const { results } = await reconcileDueOnStreetPayments({ db, recover, now: NOW });
  assert.deepEqual(results, [{ transactionId: "tx-initial", queue: "COMMITTING", outcome: "RECOVERED" }]);
});

test("candidato ON_STREET_EXTENSION se procesa igual, sin lógica especial", async () => {
  const db = memoryDb([committingRow({ id: "tx-extension", source_type: "ON_STREET_EXTENSION" })]);
  const recover = async () => ({ status: "COMMITTED", sessionId: "s-extension" });
  const { results } = await reconcileDueOnStreetPayments({ db, recover, now: NOW });
  assert.deepEqual(results, [{ transactionId: "tx-extension", queue: "COMMITTING", outcome: "RECOVERED" }]);
});

test("fuente ajena a On-Street (otro source_type) nunca es candidata", async () => {
  const db = memoryDb([committingRow({ id: "tx-other", source_type: "OTHER_PRODUCT" })]);
  const recover = async () => assert.fail("no debe tocar transacciones fuera de ON_STREET_INITIAL/ON_STREET_EXTENSION");
  const { results } = await reconcileDueOnStreetPayments({ db, recover, now: NOW });
  assert.deepEqual(results, []);
});

test("respeta el tamaño de lote y procesa las más antiguas primero (COMMITTING)", async () => {
  const rows = Array.from({ length: 15 }, (_, i) => committingRow({ id: `tx-${i}`, updated_at: new Date(new Date(OLD_ENOUGH).getTime() - i * 1000).toISOString() }));
  const db = memoryDb(rows);
  const order = [];
  const recover = async (_db, { transactionId }) => { order.push(transactionId); return { status: "PENDING", providerStatus: "INITIALIZED" }; };
  const { summary } = await reconcileDueOnStreetPayments({ db, recover, now: NOW, batchSize: 5 });
  assert.equal(summary.processed, 5, "no procesa más que el tamaño de lote configurado");
  assert.equal(order[0], "tx-14", "la más antigua (updated_at menor) va primero");
});

// ============================================================
// Cola REDIRECTED (incidente 05909e7a-..., callback de retorno nunca llegó)
// ============================================================

test("REDIRECTED reciente (dentro de los 5 min) no es candidato: no se molesta a Transbank todavía", async () => {
  const db = memoryDb([redirectedRow({ id: "tx-r-recent", redirected_at: REDIRECTED_TOO_RECENT })]);
  const recover = async () => assert.fail("no debe consultarse Transbank mientras el checkout aún podría estar en curso legítimamente");
  const { results } = await reconcileDueOnStreetPayments({ db, recover, now: NOW });
  assert.deepEqual(results, []);
});

test("REDIRECTED antigua + Transbank confirma autorizado -> RECOVERED, exactamente igual que COMMITTING", async () => {
  const db = memoryDb([redirectedRow({ id: "tx-r-authorized" })]);
  const recover = async (_db, { transactionId }) => { assert.equal(transactionId, "tx-r-authorized"); return { status: "COMMITTED", sessionId: "s-r1", sessionToken: "tok-r1" }; };
  const { summary, results } = await reconcileDueOnStreetPayments({ db, recover, now: NOW });
  assert.deepEqual(results, [{ transactionId: "tx-r-authorized", queue: "REDIRECTED", outcome: "RECOVERED" }]);
  assert.equal(summary.recovered, 1);
});

test("REDIRECTED antigua pero AÚN NO pasa el umbral de abandono (30 min): queda PENDING, no se cierra todavía", async () => {
  const db = memoryDb([redirectedRow({ id: "tx-r-pending" })]); // 6 min de antigüedad: recheckeable, no abandonable
  const recover = async () => ({ status: "PENDING", providerStatus: "INITIALIZED" });
  const markAbandoned = async () => assert.fail("no debe cerrarse antes de cumplir el umbral de abandono");
  const { summary, results } = await reconcileDueOnStreetPayments({ db, recover, markAbandoned, now: NOW });
  assert.deepEqual(results, [{ transactionId: "tx-r-pending", queue: "REDIRECTED", outcome: "PENDING" }]);
  assert.equal(summary.pending, 1);
  assert.equal(summary.abandoned, 0);
});

test("REDIRECTED que ya superó el umbral de abandono (30 min) y Transbank sigue sin autorizar -> ABANDONED, cerrada como ABORTED, sin sesión ni minutos", async () => {
  const db = memoryDb([redirectedRow({ id: "tx-r-abandoned", redirected_at: REDIRECTED_ABANDONABLE })]);
  const recover = async () => ({ status: "PENDING", providerStatus: "INITIALIZED" });
  let abandonedCall = null;
  const markAbandoned = async (_db, transactionId, opts) => { abandonedCall = { transactionId, opts }; };
  const { summary, results } = await reconcileDueOnStreetPayments({ db, recover, markAbandoned, now: NOW });
  assert.deepEqual(results, [{ transactionId: "tx-r-abandoned", queue: "REDIRECTED", outcome: "ABANDONED" }]);
  assert.equal(summary.abandoned, 1);
  assert.equal(summary.pending, 0);
  assert.deepEqual(abandonedCall, { transactionId: "tx-r-abandoned", opts: { providerStatus: "INITIALIZED" } });
});

test("sin markAbandoned inyectado, una REDIRECTED abandonable simplemente queda PENDING (nunca se auto-cierra por accidente)", async () => {
  const db = memoryDb([redirectedRow({ id: "tx-r-no-close", redirected_at: REDIRECTED_ABANDONABLE })]);
  const recover = async () => ({ status: "PENDING", providerStatus: "INITIALIZED" });
  const { summary, results } = await reconcileDueOnStreetPayments({ db, recover, now: NOW }); // sin markAbandoned
  assert.deepEqual(results, [{ transactionId: "tx-r-no-close", queue: "REDIRECTED", outcome: "PENDING" }]);
  assert.equal(summary.abandoned, 0);
});

test("REDIRECTED + error de red al consultar Transbank -> FAILED, nunca se cierra como abandonada por un error transitorio", async () => {
  const db = memoryDb([redirectedRow({ id: "tx-r-error", redirected_at: REDIRECTED_ABANDONABLE })]);
  const recover = async () => { throw Object.assign(new Error("fetch failed"), { code: "ETIMEDOUT" }); };
  const markAbandoned = async () => assert.fail("un error de red no es evidencia de abandono, es incertidumbre -- no debe cerrarse");
  const { summary, results } = await reconcileDueOnStreetPayments({ db, recover, markAbandoned, now: NOW });
  assert.deepEqual(results, [{ transactionId: "tx-r-error", queue: "REDIRECTED", outcome: "FAILED" }]);
  assert.equal(summary.failed, 1);
  assert.equal(summary.abandoned, 0);
});

test("dos ciclos sobre la misma REDIRECTED abandonable: markAbandoned se invoca en cada uno, pero cerrar dos veces la misma transacción ya ABORTED es un no-op seguro (mismo helper que el rechazo normal)", async () => {
  const db = memoryDb([redirectedRow({ id: "tx-r-idem", redirected_at: REDIRECTED_ABANDONABLE })]);
  let markCalls = 0;
  const recover = async () => ({ status: "PENDING", providerStatus: "INITIALIZED" });
  const markAbandoned = async () => { markCalls += 1; };
  await reconcileDueOnStreetPayments({ db, recover, markAbandoned, now: NOW });
  await reconcileDueOnStreetPayments({ db, recover, markAbandoned, now: NOW });
  assert.equal(markCalls, 2, "el reconciliador reintenta cerrarla cada ciclo; markTransactionFailed (ya existente) es seguro de llamar repetidamente");
});

test("REDIRECTED soporta ON_STREET_INITIAL y ON_STREET_EXTENSION sin lógica especial por tipo", async () => {
  const db = memoryDb([redirectedRow({ id: "tx-r-initial", source_type: "ON_STREET_INITIAL" }), redirectedRow({ id: "tx-r-ext", source_id: "intent-r2", source_type: "ON_STREET_EXTENSION" })]);
  const recover = async () => ({ status: "COMMITTED", sessionId: "s-x" });
  const { results } = await reconcileDueOnStreetPayments({ db, recover, now: NOW });
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.outcome === "RECOVERED" && r.queue === "REDIRECTED"));
});

test("respeta el tamaño de lote también para REDIRECTED, más antiguas primero", async () => {
  const rows = Array.from({ length: 12 }, (_, i) => redirectedRow({ id: `tx-r-${i}`, source_id: `intent-r-${i}`, redirected_at: new Date(new Date(REDIRECTED_RECHECKABLE).getTime() - i * 1000).toISOString() }));
  const db = memoryDb(rows);
  const order = [];
  const recover = async (_db, { transactionId }) => { order.push(transactionId); return { status: "PENDING", providerStatus: "INITIALIZED" }; };
  const { summary } = await reconcileDueOnStreetPayments({ db, recover, now: NOW, batchSize: 5 });
  assert.equal(summary.processed, 5);
  assert.equal(order[0], "tx-r-11", "la más antigua (redirected_at menor) va primero");
});

test("ambas colas se procesan en la misma invocación cuando ambas tienen candidatos", async () => {
  const db = memoryDb([committingRow({ id: "tx-c1" }), redirectedRow({ id: "tx-r-both" })]);
  const recover = async () => ({ status: "COMMITTED", sessionId: "s-both" });
  const { summary, results } = await reconcileDueOnStreetPayments({ db, recover, now: NOW });
  assert.equal(summary.processed, 2);
  assert.deepEqual(new Set(results.map((r) => r.queue)), new Set(["COMMITTING", "REDIRECTED"]));
});

// ============================================================
// Contrato: nunca un cobro nuevo, nunca secretos en logs
// ============================================================

test("el núcleo del reconciliador nunca referencia createTransaction ni startWebpayPayment en código real", async () => {
  const code = withoutComments(await readFile(new URL("./onStreetPaymentReconcileCore.mjs", import.meta.url), "utf8"));
  assert.doesNotMatch(code, /createTransaction/);
  assert.doesNotMatch(code, /startWebpayPayment/);
});

test("el envoltorio de servicio tampoco importa createTransaction ni startWebpayPayment, y reutiliza markTransactionFailed existente para el cierre por abandono", async () => {
  const source = await readFile(new URL("./onStreetPaymentReconcileService.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /createTransaction/);
  assert.doesNotMatch(source, /startWebpayPayment/);
  assert.match(source, /recoverWebpayTransaction/, "debe delegar en la recuperación idempotente existente, no reimplementarla");
  assert.match(source, /markTransactionFailed/, "el cierre por abandono debe reutilizar el helper ya existente, no una segunda ruta de cierre");
  assert.match(source, /status:\s*"ABORTED"/, "debe usar un estado ya existente en el modelo, no inventar uno nuevo");
});

test("umbrales y tamaño de lote son constantes exportadas y documentadas, no literales dispersos", () => {
  assert.equal(RECONCILE_STALE_THRESHOLD_MS, 120_000);
  assert.equal(REDIRECTED_RECHECK_THRESHOLD_MS, 300_000);
  assert.equal(REDIRECTED_ABANDON_THRESHOLD_MS, 1_800_000);
  assert.equal(RECONCILE_BATCH_SIZE, 10);
});

test("el código real de registro nunca referencia secretos ni datos de tarjeta", async () => {
  const code = withoutComments(await readFile(new URL("./onStreetPaymentReconcileCore.mjs", import.meta.url), "utf8"));
  for (const forbidden of ["token_ws", "PARKFACIL_INTERNAL_SERVICE_KEY", "CRON_SECRET", "SERVICE_ROLE_KEY", "card_detail"]) {
    assert.doesNotMatch(code, new RegExp(forbidden));
  }
});
