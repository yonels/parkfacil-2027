import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// Mismo enfoque que src/app/estacionar/[qrCode]/page.test.mjs: sin
// jsdom/testing-library, Node no puede parsear JSX. Este page.js es un
// Server Component async cuyo cuerpo relevante (a qué estado corresponde el
// pago, a qué sesión "volver", qué título/mensaje mostrar) es lógica pura
// sin JSX -- se extrae tal cual del archivo fuente y se ejecuta de verdad
// con `new Function`. Las ramas de JSX (botones, contador en vivo,
// idempotencia estructural) se verifican por contrato sobre el código
// fuente, igual que ese mismo archivo de referencia.

const source = await readFile(new URL("./page.js", import.meta.url), "utf8");
const withoutComments = source.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");

const notCompletedMatch = source.match(/const NOT_COMPLETED_MESSAGE = "([^"]+)";/);
assert.ok(notCompletedMatch, "no se encontró NOT_COMPLETED_MESSAGE en page.js");
const NOT_COMPLETED_MESSAGE = notCompletedMatch[1];

const logicStart = source.indexOf("const paid = intent.status === \"PAID\";");
const logicEnd = source.indexOf("\n\n  return (");
assert.ok(logicStart > -1 && logicEnd > logicStart, "no se encontró el bloque de decisión de estado en page.js");
const logicSrc = source.slice(logicStart, logicEnd);

// El bloque extraído usa `await` (paymentReference/getSessionSummary), así
// que -- mismo patrón que src/app/estacionar/[qrCode]/page.test.mjs -- se
// envuelve en un IIFE async dentro del cuerpo de la función generada, con
// dobles inertes para paymentReference/getSessionSummary/db (la decisión de
// estado no depende de lo que devuelvan, solo de que no lancen).
async function decide({ intent, estado }) {
  const driver = new Function(
    "intent", "estado", "NOT_COMPLETED_MESSAGE", "paymentReference", "getSessionSummary", "db",
    `return (async () => { ${logicSrc} ; return { paid, processing, isExtension, sessionId, title, message }; })();`,
  );
  return driver(intent, estado, NOT_COMPLETED_MESSAGE, async () => null, async () => null, {});
}

const baseIntent = { status: "PENDING_PAYMENT", operation_type: "EXTENSION", resulting_session_id: null, target_session_id: "target-session-id", purchased_minutes: 10 };

// --- Comportamiento real (ejecutado, no solo inspeccionado) ---

test("extensión pagada: 'extendido', y vuelve a resulting_session_id (la sesión real, actualizada)", async () => {
  const { paid, isExtension, sessionId, title, message } = await decide({
    intent: { ...baseIntent, status: "PAID", resulting_session_id: "resulting-session-id" },
    estado: undefined,
  });
  assert.equal(paid, true);
  assert.equal(isExtension, true);
  assert.equal(sessionId, "resulting-session-id", "una extensión pagada debe apuntar a resulting_session_id, no a target_session_id");
  assert.equal(title, "Pago confirmado");
  assert.match(message, /extendido correctamente/);
});

test("pago inicial pagado: 'activado', nunca 'extendido'", async () => {
  const { message } = await decide({ intent: { ...baseIntent, operation_type: "INITIAL", status: "PAID", resulting_session_id: "s1" }, estado: undefined });
  assert.match(message, /activado correctamente/);
  assert.doesNotMatch(message, /extendido/);
});

test("extensión rechazada: nunca 'Pago confirmado', vuelve a target_session_id (la sesión que ya tenía, intacta)", async () => {
  const { paid, processing, sessionId, title, message } = await decide({ intent: baseIntent, estado: "REJECTED" });
  assert.equal(paid, false);
  assert.equal(processing, false);
  assert.equal(sessionId, "target-session-id");
  assert.equal(title, "Pago no completado");
  assert.equal(message, NOT_COMPLETED_MESSAGE);
  assert.match(message, /No se realizaron cambios/);
});

test("extensión pendiente/en verificación: nunca 'Pago confirmado', mensaje exacto de verificación, también vuelve a target_session_id", async () => {
  const { paid, processing, sessionId, title, message } = await decide({ intent: baseIntent, estado: "PROCESSING" });
  assert.equal(paid, false);
  assert.equal(processing, true);
  assert.equal(sessionId, "target-session-id");
  assert.notEqual(title, "Pago confirmado");
  assert.equal(message, "Estamos verificando el estado de su pago.");
});

test("pago inicial no pagado: nunca hay sesión a la que volver, sin importar el estado", async () => {
  for (const estado of [undefined, "REJECTED", "PROCESSING", "ABORTED"]) {
    // Aun si resulting_session_id/target_session_id vinieran poblados por
    // algún dato anómalo, un INITIAL no pagado JAMÁS debe exponer un botón
    // "volver" -- nunca existió sesión.
    const { sessionId, paid } = await decide({ intent: { ...baseIntent, operation_type: "INITIAL", status: "PENDING_PAYMENT", resulting_session_id: "leaked", target_session_id: "leaked" }, estado });
    assert.equal(paid, false);
    assert.equal(sessionId, null, `estado=${estado}`);
  }
});

test("nunca se muestra 'Pago confirmado' salvo que intent.status sea exactamente PAID", async () => {
  for (const status of ["PENDING_PAYMENT", "PAYMENT_FAILED", "EXPIRED", "REJECTED"]) {
    const { title } = await decide({ intent: { ...baseIntent, status }, estado: "PROCESSING" });
    assert.notEqual(title, "Pago confirmado", status);
  }
});

// --- getSessionSummary: comportamiento real ante fila ausente / error de DB ---

const summaryStart = source.indexOf("async function getSessionSummary(db, id) {");
const summaryEnd = source.indexOf("\n}", summaryStart) + 2;
assert.ok(summaryStart > -1, "no se encontró getSessionSummary en page.js");
const getSessionSummary = new Function(`return (${source.slice(summaryStart, summaryEnd).replace("async function getSessionSummary", "async function")});`)();

function fakeDb(result) {
  return { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }) };
}

test("getSessionSummary nunca lanza ante fila ausente (regresión del bug .single() sin try/catch)", async () => {
  const result = await getSessionSummary(fakeDb({ data: null, error: null }), "id-inexistente");
  assert.equal(result, null);
});

test("getSessionSummary nunca lanza ante error de infraestructura", async () => {
  const result = await getSessionSummary(fakeDb({ data: null, error: { code: "ECONNREFUSED" } }), "id-cualquiera");
  assert.equal(result, null);
});

test("getSessionSummary devuelve token y expiresAt reales de la sesión, no del intent", async () => {
  const result = await getSessionSummary(fakeDb({ data: { public_token: "tok-real", expires_at: "2026-08-26T13:00:00Z" }, error: null }), "id-real");
  assert.deepEqual(result, { token: "tok-real", expiresAt: "2026-08-26T13:00:00Z" });
});

// --- Contrato sobre las ramas de JSX (botón, contador, idempotencia) ---

test("el botón obligatorio dice exactamente 'VOLVER A MI ESTACIONAMIENTO' y apunta siempre a session.token, nunca al ID crudo ni al home", () => {
  const matches = [...source.matchAll(/VOLVER A MI ESTACIONAMIENTO/g)];
  assert.ok(matches.length >= 3, "debe aparecer en el flujo pagado, pendiente y rechazado/cancelado con sesión");
  assert.match(source, /href=\{`\/estacionar\/sesion\/\$\{session\.token\}`\}/);
  assert.doesNotMatch(source, /estacionar\/sesion\/\$\{session\.id\}/);
  assert.doesNotMatch(source, /estacionar\/sesion\/\$\{intent\.(resulting|target)_session_id\}/);
});

test("el contador en vivo se alimenta de session.expiresAt (real, del servidor), nunca de purchased_minutes", () => {
  assert.match(source, /<LiveRemainingTime expiresAt=\{session\.expiresAt\}\s*\/>/);
  assert.doesNotMatch(withoutComments, /<LiveRemainingTime expiresAt=\{intent\.purchased_minutes\}/);
});

test("'tiempo agregado'/'tiempo contratado' usan purchased_minutes del intent, distinto del contador de tiempo restante", () => {
  assert.match(source, /Tiempo agregado: \$\{intent\.purchased_minutes\} minutos/);
  assert.match(source, /Tiempo contratado: \$\{intent\.purchased_minutes\} minutos/);
});

test("la página del comprobante nunca dispara un cobro ni una finalización de pago -- es de solo lectura (garantía estructural de idempotencia)", () => {
  for (const forbidden of ["startWebpayPayment", "createTransaction", "finalizeAuthorizedPayment", "createPaymentTransaction", "claimTransactionCommit", "createInitialPaymentIntent", "createExtensionPaymentIntent"]) {
    assert.doesNotMatch(withoutComments, new RegExp(forbidden), forbidden);
  }
});

test("getSessionSummary usa maybeSingle, nunca single (regresión del bug que podía lanzar sin capturar)", () => {
  assert.match(source, /getSessionSummary[\s\S]*?maybeSingle\(\)/);
});

test("un error real de infraestructura al consultar el intent nunca se confunde con 'Comprobante no disponible'", () => {
  const catchBranch = source.slice(source.indexOf("} catch {"), source.indexOf("if (!intent)"));
  assert.match(catchBranch, /No fue posible verificar tu pago/);
  assert.doesNotMatch(catchBranch, /Comprobante no disponible/);
});

test("el pago pendiente nunca usa el título 'Pago confirmado' en el código fuente de esa rama", () => {
  const pendingBranch = source.slice(source.indexOf(") : processing ? ("), source.indexOf(") : (\n        session"));
  assert.doesNotMatch(pendingBranch, /Pago confirmado/);
});
