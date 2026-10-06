import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { TUU_METHOD, buildTuuPaymentPayload, parseTuuResult } from "../../lib/pos/tuuPayment.mjs";

// TUU PRO2 (ambiente DEV) -- pago con tarjeta desde PosTerminal.js. Mismo
// enfoque que PosTerminal.platePhoto.test.mjs: sin infraestructura de render
// de React, se verifica por contrato sobre el código fuente (identificadores
// estables, no formato exacto) + las reglas puras ya cubiertas por
// tuuPayment.test.mjs.

const terminalSource = await readFile(new URL("./PosTerminal.js", import.meta.url), "utf8");

// ---- 1) CASH nunca se toca: el stub de CARD es lo único reemplazado ----

test("handlePaymentSelection(CASH) sigue yendo a CASH_CONFIRM, sin ninguna rama CARD adentro", () => {
  const fnStart = terminalSource.indexOf("function handlePaymentSelection(method) {");
  const fnEnd = terminalSource.indexOf("// Pago con tarjeta vía TUU PRO2", fnStart);
  assert.ok(fnStart !== -1 && fnEnd !== -1 && fnEnd > fnStart);
  const fn = terminalSource.slice(fnStart, fnEnd);
  assert.match(fn, /if \(method === "CASH"\) \{\s*\n\s*setPaymentStep\("CASH_CONFIRM"\);\s*\n\s*setPaymentMessage\(""\);/);
  assert.doesNotMatch(fn, /CARD/);
});

test("confirmCashPayment y refreshExpiredQuote no fueron tocados en su lógica de cobro (misma llamada EXIT/CASH)", () => {
  assert.match(terminalSource, /body: JSON\.stringify\(\{ action: "EXIT", stayId: selectedVehicle\.stay\.id, paymentMethod: "CASH", quoteSnapshot \}\)/);
});

// ---- 2) Los botones DÉBITO/CRÉDITO llaman al nuevo flujo con el method real ----

test("DÉBITO llama a handleCardPaymentSelection(TUU_METHOD.DEBIT) y CRÉDITO a TUU_METHOD.CREDIT", () => {
  assert.match(terminalSource, /onClick=\{\(\) => void handleCardPaymentSelection\(TUU_METHOD\.DEBIT\)\}/);
  assert.match(terminalSource, /onClick=\{\(\) => void handleCardPaymentSelection\(TUU_METHOD\.CREDIT\)\}/);
});

// ---- 3) Protección contra doble cobro: candado síncrono antes de cualquier await ----

test("handleCardPaymentSelection verifica y fija cardPaymentLockRef ANTES del primer await (nunca después)", () => {
  const fnStart = terminalSource.indexOf("async function handleCardPaymentSelection(tuuMethod) {");
  assert.notEqual(fnStart, -1);
  const guardIndex = terminalSource.indexOf("if (cardPaymentLockRef.current || paymentSubmitting) return;", fnStart);
  const lockIndex = terminalSource.indexOf("cardPaymentLockRef.current = true;", fnStart);
  const firstAwaitIndex = terminalSource.indexOf("await ", fnStart);
  assert.ok(guardIndex > fnStart && guardIndex < lockIndex, "la verificación del candado debe ir antes de fijarlo");
  assert.ok(lockIndex < firstAwaitIndex, "el candado debe fijarse antes del primer await de la función");
});

test("el candado se libera SOLO en el finally (cubre TUU + registro de salida, nunca antes)", () => {
  const fnStart = terminalSource.indexOf("async function handleCardPaymentSelection(tuuMethod) {");
  // Límite de la función por el siguiente identificador estable del archivo
  // (no por conteo de llaves/saltos de línea, que es frágil ante CRLF).
  const fnEnd = terminalSource.indexOf("async function printLastEntryTicket(payload, photoOptions)", fnStart);
  assert.ok(fnStart !== -1 && fnEnd !== -1 && fnEnd > fnStart);
  const fn = terminalSource.slice(fnStart, fnEnd);
  assert.match(fn, /\} finally \{\s*\n\s*cardPaymentLockRef\.current = false;\s*\n\s*setPaymentSubmitting\(false\);/);
  // Solo 3 apariciones esperadas: la verificación inicial (guard), fijarlo en
  // true, y liberarlo en false dentro de finally -- ningún otro punto del
  // cuerpo debe tocar el candado (si lo hiciera, podría liberarse antes de
  // que termine el registro de la salida, riesgo de doble cobro).
  const lockMentions = fn.match(/cardPaymentLockRef\.current/g) || [];
  assert.equal(lockMentions.length, 3, "cardPaymentLockRef.current solo debe aparecer en el guard, al fijarse (true) y al liberarse (false) en finally");
});

test("cerrar/reabrir el modal (closePaymentModal) NUNCA toca cardPaymentLockRef: un pago realmente en curso sigue bloqueado aunque se cierre y reabra la UI", () => {
  const fnStart = terminalSource.indexOf("function closePaymentModal() {");
  const fnEnd = terminalSource.indexOf("// Obtiene una cotización nueva", fnStart);
  assert.ok(fnStart !== -1 && fnEnd !== -1 && fnEnd > fnStart);
  const fn = terminalSource.slice(fnStart, fnEnd);
  assert.doesNotMatch(fn, /cardPaymentLockRef/);
});

test("el candado nunca queda permanentemente bloqueado: existe un único try/finally que envuelve TODA la función (todo error pasa por el release)", () => {
  const fnStart = terminalSource.indexOf("async function handleCardPaymentSelection(tuuMethod) {");
  const nextFnStart = terminalSource.indexOf("async function printLastEntryTicket(payload, photoOptions)");
  const fn = terminalSource.slice(fnStart, nextFnStart);
  // Puede haber try/catch internos (build del payload TUU, fetch de EXIT)
  // que resuelven su propio error con return -- ninguno de los dos evita que
  // la ejecución siga hasta el ÚNICO finally exterior, que es el que libera
  // el candado sin importar por qué salida se llegó ahí.
  const finallyCount = (fn.match(/\} finally \{/g) || []).length;
  assert.equal(finallyCount, 1, "debe existir exactamente un finally exterior que libere el candado en cualquier salida de la función");
});

// ---- 4) La cotización se valida ANTES de cobrar con TUU, nunca después ----

test("la expiración de la cotización se revisa antes de construir/enviar el payload TUU (nunca se cobra con un monto vencido)", () => {
  const fnStart = terminalSource.indexOf("async function handleCardPaymentSelection(tuuMethod) {");
  const expiredCheckIndex = terminalSource.indexOf("isQuoteSnapshotExpired(quoteSnapshot)", fnStart);
  const startTuuPaymentIndex = terminalSource.indexOf("await startTuuPayment(", fnStart);
  assert.ok(expiredCheckIndex > fnStart && expiredCheckIndex < startTuuPaymentIndex);
});

test("cotización vencida en CARD vuelve a MENU (nunca a CASH_CONFIRM) y no lanza TUU", () => {
  assert.match(terminalSource, /await refreshExpiredQuote\("La cotización del vehículo expiró\.", \{ targetStep: "MENU" \}\);/);
});

test("refreshExpiredQuote(reasonPrefix) sin segundo argumento sigue usando CASH_CONFIRM por defecto (EFECTIVO intacto)", () => {
  assert.match(terminalSource, /async function refreshExpiredQuote\(reasonPrefix, \{ targetStep = "CASH_CONFIRM" \} = \{\}\) \{/);
  assert.match(terminalSource, /await refreshExpiredQuote\("La cotización del vehículo expiró\."\);\s*\n\s*\} finally \{/);
  assert.match(terminalSource, /await refreshExpiredQuote\("La cotización venció\."\);\s*\n\s*return;/);
});

// ---- 5) El payload nunca se arma con datos inventados: usa buildTuuPaymentPayload real ----

test("el amount enviado a TUU es el total ya cotizado (normalizeQuoteView), nunca un valor recalculado aparte", () => {
  assert.match(terminalSource, /const amount = normalizeQuoteView\(selectedVehicle\.quote\)\?\.total;/);
  assert.match(terminalSource, /const netAmount = getTaxBreakdown\(amount\)\.netAmount;/);
  assert.match(terminalSource, /buildTuuPaymentPayload\(\{ amount, method: tuuMethod, netAmount \}\);/);
});

test("buildTuuPaymentPayload (regla pura) nunca inventa dteType/sourceVersion/customFields", () => {
  const payload = buildTuuPaymentPayload({ amount: 5000, method: TUU_METHOD.DEBIT, netAmount: 4202 });
  assert.equal("dteType" in payload, false);
  assert.equal("sourceVersion" in payload.extraData, false);
  assert.equal("customFields" in payload.extraData, false);
});

// ---- 6) El bridge nunca se llama sin antes confirmar que existe (feature-detection) ----

test("getTuuPaymentBridge exige typeof bridge.payWithTuu === 'function' (mismo criterio que getNativePrinterBridge)", () => {
  assert.match(terminalSource, /function getTuuPaymentBridge\(\) \{\s*\n\s*if \(typeof window === "undefined"\) return null;\s*\n\s*const bridge = window\?\.ParkFacilDevice;\s*\n\s*if \(!bridge \|\| typeof bridge\.payWithTuu !== "function"\) return null;/);
});

test("sin bridge disponible, startTuuPayment nunca llama a window.ParkFacilTuuResult ni cuelga: resuelve TUU_BRIDGE_UNAVAILABLE", () => {
  assert.match(terminalSource, /code: "TUU_BRIDGE_UNAVAILABLE",/);
});

// ---- 7) El resultado real de TUU llega por window.ParkFacilTuuResult, con timeout defensivo ----

test("startTuuPayment nunca queda colgada: usa TUU_RESULT_TIMEOUT_MS con un resultado NO_RESPONSE", () => {
  assert.match(terminalSource, /timer = setTimeout\(\(\) => \{\s*\n\s*finish\(\{ delivered: false, code: "NO_RESPONSE", message: "TUU no respondió dentro del tiempo esperado\." \}\);\s*\n\s*\}, TUU_RESULT_TIMEOUT_MS\);/);
});

test("parseTuuResult (regla pura) nunca lanza con una respuesta inválida del bridge", () => {
  assert.equal(parseTuuResult(undefined).success, false);
  assert.equal(parseTuuResult("{ json invalido").success, false);
});

// ---- 8) Nunca se crashea si TUU no está instalada / falla el lanzador ----

test("TUU no instalada (o bridge no disponible) nunca lanza excepción: cae a CARD_PAYMENT con estado NOT_INSTALLED", () => {
  assert.match(terminalSource, /if \(outcome\?\.code === "TUU_NOT_INSTALLED" \|\| outcome\?\.code === "TUU_BRIDGE_UNAVAILABLE"\) \{[\s\S]{0,120}?setCardPaymentStatus\("NOT_INSTALLED"\);/);
});

test("una excepción al invocar payWithTuu se atrapa dentro de startTuuPayment, nunca se propaga sin resolver", () => {
  assert.match(terminalSource, /\} catch \(error\) \{\s*\n\s*finish\(\{\s*\n\s*delivered: false,\s*\n\s*code: "TUU_BRIDGE_EXCEPTION",/);
});

// ---- 9) Nunca se registra un segundo cobro tras una aprobación real de TUU ----

test("tras un pago aprobado por TUU, un fallo al registrar la salida NUNCA vuelve a MENU (evita reintentar y cobrar dos veces)", () => {
  const fnStart = terminalSource.indexOf("async function handleCardPaymentSelection(tuuMethod) {");
  const approvedIndex = terminalSource.indexOf('setCardPaymentStatus("APPROVED");', fnStart);
  const afterApproved = terminalSource.slice(approvedIndex, terminalSource.indexOf("} finally {", approvedIndex));
  assert.doesNotMatch(afterApproved, /setPaymentStep\("MENU"\)/);
  assert.match(afterApproved, /setCardPaymentStatus\("CHARGED_NOT_REGISTERED"\);/);
});

test('el botón REINTENTAR nunca se muestra en el estado CHARGED_NOT_REGISTERED', () => {
  const blockStart = terminalSource.indexOf('paymentStep === "CARD_PAYMENT" ?');
  const blockEnd = terminalSource.indexOf("renderOperationalPanel", blockStart);
  const block = terminalSource.slice(blockStart, blockEnd);
  assert.match(block, /cardPaymentStatus !== "CHARGED_NOT_REGISTERED" \? \(\s*\n\s*<button/);
});

// ---- 10) La salida se registra con paymentMethod CARD, reutilizando el mismo recibo/impresión que EFECTIVO ----

test('el registro de salida con tarjeta usa paymentMethod: "CARD" y arma el recibo con paymentMethod "CARD"', () => {
  assert.match(terminalSource, /body: JSON\.stringify\(\{ action: "EXIT", stayId: selectedVehicle\.stay\.id, paymentMethod: "CARD", paymentCardType, quoteSnapshot \}\)/);
  assert.match(terminalSource, /buildPaymentReceiptPayload\(stay, quote, parkingResponse, "CARD"\)/);
});

test("buildPaymentReceiptPayload(..., paymentMethod = \"CASH\") mantiene el comportamiento anterior para EFECTIVO (mismo default)", () => {
  assert.match(terminalSource, /function buildPaymentReceiptPayload\(stay, quote, parkingResponse, paymentMethod = "CASH"\) \{/);
});

// ---- 11) No se agregó ninguna dependencia/paquete nuevo de Sunmi ----

test("la integración TUU no referencia Sunmi en ningún punto (bridge independiente del hardware de impresión)", () => {
  const fnStart = terminalSource.indexOf("function getTuuPaymentBridge() {");
  const fnEnd = terminalSource.indexOf("async function executeNativePrint(payload) {");
  const tuuBlock = terminalSource.slice(fnStart, fnEnd);
  assert.doesNotMatch(tuuBlock, /[Ss]unmi/);
});

test('el POS comprueba disponibilidad de clasificación antes de invocar TUU',()=>{
 const handler=terminalSource.slice(terminalSource.indexOf('async function handleCardPaymentSelection'));
 assert.ok(handler.indexOf('selectedVehicle.cardTypeCaptureAvailable !== true')<handler.indexOf('buildTuuPaymentPayload'));
 assert.match(handler,/const paymentCardType = tuuMethod === TUU_METHOD.CREDIT \? "CREDIT" : tuuMethod === TUU_METHOD.DEBIT \? "DEBIT" : null/);
});
