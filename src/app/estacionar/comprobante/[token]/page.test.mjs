import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// Mismo enfoque que src/app/estacionar/[qrCode]/page.test.mjs: sin
// jsdom/testing-library, Node no puede parsear JSX. Este page.js es un
// Server Component async cuyo cuerpo relevante (a qué estado corresponde el
// pago, a qué sesión "volver" -- o si no hay ninguna --, qué título/mensaje
// mostrar, y a qué QR ofrecer reintentar) es lógica pura sin JSX -- se
// extrae tal cual del archivo fuente y se ejecuta de verdad con
// `new Function`. Las ramas de JSX (botones, contador en vivo, idempotencia
// estructural) se verifican por contrato sobre el código fuente.

const source = await readFile(new URL("./page.js", import.meta.url), "utf8");
const withoutComments = source.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");

function literal(name) {
  const m = source.match(new RegExp(`const ${name} = "([^"]+)";`));
  assert.ok(m, `no se encontró ${name} en page.js`);
  return m[1];
}
const INITIAL_FAILED_MESSAGE = literal("INITIAL_FAILED_MESSAGE");
const EXTENSION_FAILED_MESSAGE = literal("EXTENSION_FAILED_MESSAGE");
const GENERIC_FAILED_MESSAGE = literal("GENERIC_FAILED_MESSAGE");

const logicStart = source.indexOf("const paid = intent.status === \"PAID\";");
const logicEnd = source.indexOf("\n\n  return (");
assert.ok(logicStart > -1 && logicEnd > logicStart, "no se encontró el bloque de decisión de estado en page.js");
const logicSrc = source.slice(logicStart, logicEnd);

// El bloque extraído usa `await` (paymentReference/getSessionSummary/
// getQrPublicCode) -- mismo patrón que src/app/estacionar/[qrCode]/
// page.test.mjs -- se envuelve en un IIFE async dentro del cuerpo de la
// función generada, con dobles inertes/parametrizables.
async function decide({ intent, estado, session = null, qrPublicCode = null }) {
  const driver = new Function(
    "intent", "estado", "INITIAL_FAILED_MESSAGE", "EXTENSION_FAILED_MESSAGE", "GENERIC_FAILED_MESSAGE",
    "paymentReference", "getSessionSummary", "getQrPublicCode", "db",
    `return (async () => { ${logicSrc} ; return { paid, processing, isExtension, sessionId, session, sessionUsable, title, message, offerRetryToQr, qrPublicCode }; })();`,
  );
  return driver(
    intent, estado, INITIAL_FAILED_MESSAGE, EXTENSION_FAILED_MESSAGE, GENERIC_FAILED_MESSAGE,
    async () => null, async () => session, async () => qrPublicCode, {},
  );
}

const baseIntent = { status: "PENDING_PAYMENT", operation_type: "EXTENSION", qr_location_id: "qr-1", resulting_session_id: null, target_session_id: "target-session-id", purchased_minutes: 10 };
const activeSession = { token: "target-token", expiresAt: "2026-08-27T15:00:00Z", status: "ACTIVE" };
const expiredSession = { token: "target-token", expiresAt: "2026-08-27T10:00:00Z", status: "EXPIRED" };

// --- 1) INITIAL + PAYMENT_FAILED + sin sesión -> pantalla "Pago no completado" ---

test("INITIAL fallido (PAYMENT_FAILED/ABORTED, sin sesión): 'Pago no completado', mensaje específico de inicial, nunca navega a ninguna sesión", async () => {
  for (const estado of [undefined, "ABORTED", "REJECTED"]) {
    const r = await decide({ intent: { ...baseIntent, operation_type: "INITIAL", status: "PAYMENT_FAILED", target_session_id: null, resulting_session_id: null }, estado, qrPublicCode: "abc123code" });
    assert.equal(r.paid, false, estado);
    assert.equal(r.title, "Pago no completado", estado);
    assert.equal(r.message, INITIAL_FAILED_MESSAGE, estado);
    assert.equal(r.sessionId, null, estado);
    assert.equal(r.session, null, estado);
    assert.equal(r.offerRetryToQr, true, estado);
  }
});

// --- 2) No aparece "Tiempo expirado" ni nada equivalente para un fallo de pago ---

test("un INITIAL o EXTENSION fallido nunca produce el título/mensaje reservado a una sesión realmente vencida", async () => {
  const initial = await decide({ intent: { ...baseIntent, operation_type: "INITIAL", status: "PAYMENT_FAILED", target_session_id: null, resulting_session_id: null }, estado: "ABORTED" });
  assert.notEqual(initial.title, "Tiempo expirado");
  assert.doesNotMatch(initial.message, /expirad|vencid/i);
  const extension = await decide({ intent: baseIntent, estado: "REJECTED", session: activeSession });
  assert.notEqual(extension.title, "Tiempo expirado");
  assert.doesNotMatch(extension.message, /expirad/i);
});

// --- 3) No busca/reutiliza una sesión anterior para un INITIAL fallido ---

test("un INITIAL no pagado nunca expone sessionId, aunque target/resulting_session_id vengan poblados por datos anómalos", async () => {
  for (const estado of [undefined, "REJECTED", "PROCESSING", "ABORTED"]) {
    const r = await decide({ intent: { ...baseIntent, operation_type: "INITIAL", status: "PENDING_PAYMENT", resulting_session_id: "leaked", target_session_id: "leaked" }, estado, session: activeSession });
    assert.equal(r.paid, false, estado);
    assert.equal(r.sessionId, null, `estado=${estado}`);
  }
});

// --- 4) INTENTAR NUEVAMENTE vuelve al QR correcto / 5) VOLVER AL QR usa el public_code correcto ---

test("INITIAL fallido: offerRetryToQr=true y qrPublicCode se resuelve desde qr_location_id real del intento", async () => {
  const r = await decide({ intent: { ...baseIntent, operation_type: "INITIAL", status: "PAYMENT_FAILED", target_session_id: null, resulting_session_id: null, qr_location_id: "qr-real-id" }, estado: "ABORTED", qrPublicCode: "codigo-real" });
  assert.equal(r.offerRetryToQr, true);
  assert.equal(r.qrPublicCode, "codigo-real");
});

test("los botones de reintento apuntan a /estacionar/{qrPublicCode}, nunca reutilizan token_ws ni una transacción anterior", () => {
  assert.match(source, /INTENTAR NUEVAMENTE/);
  assert.match(source, /VOLVER AL QR/);
  assert.match(source, /href=\{qrPublicCode \? `\/estacionar\/\$\{qrPublicCode\}` : "\/"\}/);
  assert.doesNotMatch(withoutComments, /token_ws/);
});

// --- 6) EXTENSION fallida + sesión activa -> vuelve al target_session_id ---

test("EXTENSION fallida con sesión activa: 'no se agregaron minutos', vuelve exclusivamente a target_session_id, sin buscar otra por teléfono", async () => {
  const r = await decide({ intent: baseIntent, estado: "REJECTED", session: activeSession });
  assert.equal(r.paid, false);
  assert.equal(r.isExtension, true);
  assert.equal(r.sessionId, "target-session-id");
  assert.equal(r.sessionUsable, true);
  assert.equal(r.message, EXTENSION_FAILED_MESSAGE);
  assert.equal(r.offerRetryToQr, false, "con sesión activa no se ofrece reintentar, se vuelve a la sesión existente");
});

// --- 7) EXTENSION fallida + sesión expirada -> informa correctamente ---

test("EXTENSION fallida con sesión ya expirada: lo informa explícitamente y ofrece volver al QR en vez de un botón muerto", async () => {
  const r = await decide({ intent: baseIntent, estado: "REJECTED", session: expiredSession, qrPublicCode: "codigo-real" });
  assert.equal(r.sessionUsable, false);
  assert.equal(r.message, `${EXTENSION_FAILED_MESSAGE} Su sesión de estacionamiento ya venció.`);
  assert.equal(r.offerRetryToQr, true);
  assert.equal(r.qrPublicCode, "codigo-real");
});

// --- 8) PENDING -> no dice pago confirmado ni pago fallido prematuramente ---

test("PENDING: nunca 'Pago confirmado' ni 'Pago no completado', mensaje exacto de verificación", async () => {
  for (const intentBase of [{ ...baseIntent, operation_type: "INITIAL", target_session_id: null, resulting_session_id: null }, baseIntent]) {
    const r = await decide({ intent: intentBase, estado: "PROCESSING", session: activeSession });
    assert.equal(r.processing, true);
    assert.notEqual(r.title, "Pago confirmado");
    assert.notEqual(r.title, "Pago no completado");
    assert.equal(r.message, "Estamos verificando el estado de su pago.");
  }
});

// --- 9) COMMITTED conserva el flujo exitoso existente ---

test("PAID (INITIAL y EXTENSION): título 'Pago confirmado', mensaje correcto por tipo, vuelve a resulting_session_id", async () => {
  const initial = await decide({ intent: { ...baseIntent, operation_type: "INITIAL", status: "PAID", resulting_session_id: "s1", target_session_id: null }, estado: undefined, session: activeSession });
  assert.equal(initial.title, "Pago confirmado");
  assert.match(initial.message, /activado correctamente/);
  assert.equal(initial.sessionId, "s1");

  const extension = await decide({ intent: { ...baseIntent, status: "PAID", resulting_session_id: "resulting-id" }, estado: undefined, session: activeSession });
  assert.equal(extension.title, "Pago confirmado");
  assert.match(extension.message, /extendido correctamente/);
  assert.equal(extension.sessionId, "resulting-id", "un PAID debe usar resulting_session_id, no target_session_id");
});

// --- Regresión general: nunca 'Pago confirmado' salvo intent.status === PAID ---

test("nunca se muestra 'Pago confirmado' salvo que intent.status sea exactamente PAID", async () => {
  for (const status of ["PENDING_PAYMENT", "PAYMENT_FAILED", "EXPIRED", "REJECTED"]) {
    const r = await decide({ intent: { ...baseIntent, status }, estado: "PROCESSING" });
    assert.notEqual(r.title, "Pago confirmado", status);
  }
});

// --- getSessionSummary / getQrPublicCode: comportamiento real ante fila ausente / error de DB ---

function extractAsyncFn(name) {
  const start = source.indexOf(`async function ${name}(`);
  const end = source.indexOf("\n}", start) + 2;
  assert.ok(start > -1, `no se encontró ${name} en page.js`);
  return new Function(`return (${source.slice(start, end).replace(`async function ${name}`, "async function")});`)();
}
const getSessionSummary = extractAsyncFn("getSessionSummary");
const getQrPublicCode = extractAsyncFn("getQrPublicCode");

function fakeDb(result) {
  return { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }) };
}

test("getSessionSummary nunca lanza ante fila ausente ni ante error de infraestructura, y expone status para distinguir sesión vencida", async () => {
  assert.equal(await getSessionSummary(fakeDb({ data: null, error: null }), "id-inexistente"), null);
  assert.equal(await getSessionSummary(fakeDb({ data: null, error: { code: "ECONNREFUSED" } }), "id-cualquiera"), null);
  const ok = await getSessionSummary(fakeDb({ data: { public_token: "tok", expires_at: "2026-08-27T10:00:00Z", status: "EXPIRED" }, error: null }), "id-real");
  assert.deepEqual(ok, { token: "tok", expiresAt: "2026-08-27T10:00:00Z", status: "EXPIRED" });
});

test("getQrPublicCode nunca lanza sin qr_location_id ni ante error/fila ausente", async () => {
  assert.equal(await getQrPublicCode({}, null), null);
  assert.equal(await getQrPublicCode(fakeDb({ data: null, error: null }), "qr-1"), null);
  assert.equal(await getQrPublicCode(fakeDb({ data: null, error: { code: "ECONNREFUSED" } }), "qr-1"), null);
  assert.equal(await getQrPublicCode(fakeDb({ data: { public_code: "abc123code" }, error: null }), "qr-1"), "abc123code");
});

// --- Contrato sobre las ramas de JSX (botón, contador, idempotencia) ---

test("el botón 'VOLVER A MI ESTACIONAMIENTO' apunta siempre a session.token, nunca al ID crudo ni al home", () => {
  const matches = [...source.matchAll(/VOLVER A MI ESTACIONAMIENTO/g)];
  assert.ok(matches.length >= 3, "debe aparecer en el flujo pagado, pendiente y en extensión fallida con sesión activa");
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

// --- 10) refresh del comprobante no genera cobro / 11) ninguna navegación dispara createTransaction / 12) ningún PAYMENT_FAILED crea sesión ---

test("la página del comprobante nunca dispara un cobro ni una finalización de pago -- es de solo lectura (refrescar o re-clickear jamás reaplica nada)", () => {
  for (const forbidden of ["startWebpayPayment", "createTransaction", "finalizeAuthorizedPayment", "createPaymentTransaction", "claimTransactionCommit", "createInitialPaymentIntent", "createExtensionPaymentIntent"]) {
    assert.doesNotMatch(withoutComments, new RegExp(forbidden), forbidden);
  }
});

test("ningún camino de PAYMENT_FAILED escribe en on_street_pilot_sessions -- la página nunca hace insert/update, solo select", () => {
  assert.doesNotMatch(withoutComments, /\.insert\(|\.update\(|\.upsert\(/);
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
  const pendingBranch = source.slice(source.indexOf(") : processing ? ("), source.indexOf(") : isExtension && sessionUsable ? ("));
  assert.doesNotMatch(pendingBranch, /Pago confirmado/);
});
