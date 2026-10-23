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
const routerSource = await readFile(new URL("../../lib/pos/tuuResultRouter.mjs", import.meta.url), "utf8");
const pendingCardSource = await readFile(new URL("./PosTuuPendingPayments.js", import.meta.url), "utf8");
const dataEntrySource = await readFile(new URL("../../app/api/data-entry/route.js", import.meta.url), "utf8");
const attemptsManagerSource = await readFile(new URL("../pagos-tarjeta/CardPaymentAttemptsManager.js", import.meta.url), "utf8");
const HANDLER_START = "async function handleCardPaymentSelection(tuuMethod) {";
const HANDLER_END = "async function reportTuuAttemptResult(record, outcome, extra = {}) {";


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
  // Cupón (SOL-2026-10-19-002): la misma llamada EXIT/CASH agrega couponToken solo si el cálculo firmado lleva cupón.
  assert.match(terminalSource, /body: JSON\.stringify\(\{ action: "EXIT", stayId: selectedVehicle\.stay\.id, paymentMethod: "CASH", quoteSnapshot, \.\.\.\(appliedCouponToken && quoteSnapshot\?\.couponId \? \{ couponToken: appliedCouponToken \} : \{\}\) \}\)/);
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
  const guardIndex = terminalSource.indexOf("if (cardPaymentLockRef.current || paymentSubmitting || couponLockRef.current) return;", fnStart);
  const lockIndex = terminalSource.indexOf("cardPaymentLockRef.current = true;", fnStart);
  const firstAwaitIndex = terminalSource.indexOf("await ", fnStart);
  assert.ok(guardIndex > fnStart && guardIndex < lockIndex, "la verificación del candado debe ir antes de fijarlo");
  assert.ok(lockIndex < firstAwaitIndex, "el candado debe fijarse antes del primer await de la función");
});

test("el candado se libera SOLO en el finally (cubre TUU + registro de salida, nunca antes)", () => {
  const fnStart = terminalSource.indexOf("async function handleCardPaymentSelection(tuuMethod) {");
  // Límite de la función por el siguiente identificador estable del archivo
  // (no por conteo de llaves/saltos de línea, que es frágil ante CRLF).
  const fnEnd = terminalSource.indexOf(HANDLER_END, fnStart);
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
  const nextFnStart = terminalSource.indexOf(HANDLER_END);
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
  assert.match(terminalSource, /await refreshExpiredQuote\("El cálculo de cobro expiró\.", \{ targetStep: "MENU" \}\);/);
});

test("refreshExpiredQuote(reasonPrefix) sin segundo argumento sigue usando CASH_CONFIRM por defecto (EFECTIVO intacto)", () => {
  assert.match(terminalSource, /async function refreshExpiredQuote\(reasonPrefix, \{ targetStep = "CASH_CONFIRM" \} = \{\}\) \{/);
  assert.match(terminalSource, /await refreshExpiredQuote\("El cálculo de cobro expiró\."\);\s*\n\s*\} finally \{/);
  assert.match(terminalSource, /await refreshExpiredQuote\("El cálculo de cobro expiró\."\);\s*\n\s*return;/);
});

// ---- 5) El payload nunca se arma con datos inventados: usa buildTuuPaymentPayload real ----

test("el amount enviado a TUU es el total ya cotizado (normalizeQuoteView), nunca un valor recalculado aparte", () => {
  assert.match(terminalSource, /const amount = normalizeQuoteView\(selectedVehicle\.quote\)\?\.total;/);
  // Auditoría: netAmount lo fija buildTuuPaymentPayload (= amount, regla
  // documentada amount = netAmount + exemptAmount); el POS ya no envía el neto sin IVA.
  assert.match(terminalSource, /buildTuuPaymentPayload\(\{ amount, method: tuuMethod \}\);/);
  assert.doesNotMatch(terminalSource, /buildTuuPaymentPayload\(\{[^}]*netAmount/);
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

test("sin bridge disponible, la espera del pago nunca cuelga: resuelve TUU_BRIDGE_UNAVAILABLE", () => {
  assert.match(routerSource, /code: "TUU_BRIDGE_UNAVAILABLE"/);
  assert.match(terminalSource, /return tuuResultRouter\.start\(tuuLaunchBridge\(getTuuPaymentBridge\(\), attemptId\), payloadJson, TUU_RESULT_TIMEOUT_MS, \{ attemptId \}\);/);
});

// ---- 7) El resultado real de TUU llega por window.ParkFacilTuuResult, con tiempo de espera ----

test("la espera nunca queda colgada: usa TUU_RESULT_TIMEOUT_MS y resuelve NO_RESPONSE", () => {
  assert.match(routerSource, /entry\.timer = setTimer\(\(\) => settle\(\{ delivered: false, code: "NO_RESPONSE", message: "TUU no respondió dentro del tiempo esperado\." \}\), timeoutMs\);/);
});

test("el receptor del resultado queda instalado de forma permanente (una respuesta tardía no se descarta)", () => {
  // Nunca se restaura/retira window.ParkFacilTuuResult tras la espera.
  assert.doesNotMatch(terminalSource, /window\.ParkFacilTuuResult = /);
  assert.doesNotMatch(routerSource, /previousCallback/);
  assert.match(routerSource, /if \(target\) target\.ParkFacilTuuResult = receive;/);
  assert.match(routerSource, /if \(lateHandler\) lateHandler\(result\);/);
  assert.match(terminalSource, /tuuResultRouter\.install\(window\);/);
  assert.match(terminalSource, /tuuResultRouter\.setLateResultHandler\(\(result\) => void handleLateTuuResult\(result\)\);/);
});

function sliceBetween(startText, endText) {
  const from = terminalSource.indexOf(startText);
  const to = terminalSource.indexOf(endText, from);
  assert.ok(from !== -1 && to > from, `${startText} ... ${endText}`);
  return terminalSource.slice(from, to);
}

test("respuesta tardía: se asocia al intento local más reciente y se informa al servidor por su identificador; nunca abre TUU", () => {
  const fn = sliceBetween("async function handleLateTuuResult(result) {", "async function refreshTuuPendingStatus(stayId) {");
  assert.match(fn, /const target = latestUnresolvedTuuPayment\(loadTuuPendingPayments\(storage\)\);/);
  assert.match(fn, /if \(verdict\.outcome === TUU_OUTCOME\.APPROVED\) \{\s*\n\s*rememberProcessedTuuSequence\(storage, result\?\.transactionId\);\s*\n\s*const approved = markTuuPaymentApproved\(storage, target\.stayId, \{ sequenceNumber: result\?\.transactionId \}\);/);
  assert.match(fn, /if \(approved\.record && !approved\.duplicate\) void registerPendingTuuPayment\(approved\.record\);/);
  assert.match(fn, /await reportTuuAttemptResult\(target, verdict\.outcome === TUU_OUTCOME\.DECLINED \? "DECLINED" : "CANCELLED"/);
  assert.match(fn, /await reportTuuAttemptResult\(uncertain\.record \|\| target, "UNCERTAIN"/);
  assert.doesNotMatch(fn, /startTuuPayment|payWithTuu/);
});

test("parseTuuResult (regla pura) nunca lanza con una respuesta inválida del bridge", () => {
  assert.equal(parseTuuResult(undefined).success, false);
  assert.equal(parseTuuResult("{ json invalido").success, false);
});

// ---- 8) Nunca se crashea si TUU no está instalada / falla el lanzador ----

test("TUU no instalada (o bridge no disponible) nunca lanza excepción: se avisa 'no se inició' y el estado es NOT_INSTALLED", () => {
  assert.match(terminalSource, /if \(verdict\.outcome === TUU_OUTCOME\.NOT_STARTED\) \{\s*\n\s*await reportTuuAttemptResult\(started\.record, "NOT_STARTED", tuuError\);\s*\n\s*setTuuPendingPayments\(clearTuuPendingPayment\(storage, stay\.id\)\.records\);\s*\n\s*if \(outcome\?\.code === "TUU_NOT_INSTALLED" \|\| outcome\?\.code === "TUU_BRIDGE_UNAVAILABLE"\) \{\s*\n\s*setCardPaymentStatus\("NOT_INSTALLED"\);/);
});

test("una excepción al invocar payWithTuu se atrapa dentro de la espera, nunca se propaga sin resolver", () => {
  assert.match(routerSource, /\} catch \(error\) \{\s*\n\s*settle\(\{ delivered: false, code: "TUU_BRIDGE_EXCEPTION"/);
});

// ---- 9) Reserva central: el servidor decide antes de abrir TUU ----

function handlerSource() {
  const start = terminalSource.indexOf(HANDLER_START);
  const end = terminalSource.indexOf(HANDLER_END, start);
  assert.ok(start !== -1 && end > start);
  return terminalSource.slice(start, end);
}

test("reserva central: TUU se abre únicamente después de reservar en el servidor y de confirmar el envío", () => {
  const fn = handlerSource();
  const reserve = fn.indexOf('action: "CARD_PAYMENT_RESERVE"');
  const save = fn.indexOf("saveTuuPaymentStarted(storage, {");
  const sent = fn.indexOf('action: "CARD_PAYMENT_SENT"');
  const launch = fn.indexOf("await startTuuPayment(");
  assert.ok(reserve !== -1 && save !== -1 && sent !== -1 && launch !== -1);
  assert.ok(reserve < save && save < sent && sent < launch, "reservar -> copia local -> confirmar envío -> abrir TUU");
  assert.equal((fn.match(/await startTuuPayment\(/g) || []).length, 1, "un único punto abre TUU");
  // La reserva envía ticket, medio, cálculo de cobro firmado, clave de idempotencia y equipo.
  assert.match(fn, /\{ action: "CARD_PAYMENT_RESERVE", stayId: stay\.id, paymentCardType, quoteSnapshot, idempotencyKey, deviceId, \.\.\.\(tuuEnvironment \? \{ tuuEnvironment \} : \{\}\) \}/);
  assert.match(fn, /const idempotencyKey = newTuuIdempotencyKey\(\);/);
});

test("fallo de reserva impide abrir TUU: sin conexión, ticket ya reservado o ambiente sin habilitar", () => {
  const fn = handlerSource();
  const block = fn.slice(fn.indexOf('if (!reservation.ok || !attempt?.id || attempt.status !== "RESERVED") {'), fn.indexOf("// 2) Copia de apoyo en el equipo"));
  assert.ok(block.length > 0);
  assert.doesNotMatch(block, /startTuuPayment|CARD_PAYMENT_SENT/);
  assert.match(block, /Sin conexión con ParkFacil: no se pudo reservar el pago\. No se inició ningún cobro\./);
  assert.match(block, /if \(reservation\.code === "CARD_ATTEMPT_ACTIVE"\) \{/);
  // Toda rama del bloque termina sin cobrar: el bloque acaba en return.
  assert.match(block, /return;\s*\n\s*\}\s*\n\s*$/);
  assert.ok((block.match(/return;/g) || []).length >= 4);
  // No existe un modo alternativo solo local.
  assert.doesNotMatch(fn, /RESERVATION_UNAVAILABLE[\s\S]{0,200}startTuuPayment/);
});

test("envío no confirmado por el servidor: no se abre TUU y se avisa 'no se inició'", () => {
  const fn = handlerSource();
  const block = fn.slice(fn.indexOf('if (!sent.ok || sent.payload?.data?.attempt?.status !== "SENT_TO_TUU") {'), fn.indexOf("// 4) Recién ahora se abre TUU."));
  assert.ok(block.length > 0);
  assert.match(block, /await reportTuuAttemptResult\(started\.record, "NOT_STARTED", \{ errorCode: "SENT_NOT_CONFIRMED" \}\);/);
  assert.match(block, /No se inició ningún cobro\./);
  assert.doesNotMatch(block, /startTuuPayment/);
});

test("copia local antes de abrir TUU: si no se puede guardar se devuelve la reserva y no se cobra", () => {
  const fn = handlerSource();
  assert.match(fn, /if \(!started\.ok \|\| !started\.record\) \{[\s\S]{0,420}?await reportTuuAttemptResult\(\{ attemptId: attempt\.id, deviceId, stayId: stay\.id \}, "NOT_STARTED"[\s\S]{0,260}?No se inició ningún cobro\."\);\s*\n\s*return;/);
  assert.match(fn, /amount: tuuPayload\.amount,/);
  assert.match(fn, /attemptId: attempt\.id,\s*\n\s*idempotencyKey,\s*\n\s*deviceId,/);
});

test("el pago aprobado se guarda en el equipo ANTES de avisar al servidor y registrar", () => {
  const fn = handlerSource();
  const persist = fn.indexOf("markTuuPaymentApproved(storage, stay.id,");
  const register = fn.indexOf("await registerPendingTuuPayment(approvedRecord, { earlyPrint })");
  assert.ok(persist !== -1 && register !== -1 && persist < register);
});

test("tiempo de espera o respuesta no interpretable -> RESULTADO INCIERTO en el equipo y en el servidor; nunca rechazo ni liberación", () => {
  const fn = handlerSource();
  const block = fn.slice(fn.indexOf("if (verdict.outcome === TUU_OUTCOME.UNCERTAIN) {"), fn.indexOf("// TUU aprobó: la tarjeta YA fue cobrada."));
  assert.match(block, /markTuuPaymentUncertain\(storage, stay\.id, verdict\.code, outcome\?\.result\?\.responseMessage \|\| null\)/);
  assert.match(block, /await reportTuuAttemptResult\(uncertain\.record \|\| started\.record, "UNCERTAIN", tuuError\);/);
  assert.doesNotMatch(block, /setCardPaymentStatus\("(DECLINED|CANCELLED|ERROR)"\)/);
  assert.doesNotMatch(block, /clearTuuPendingPayment|"NOT_STARTED"|"DECLINED"|"CANCELLED"/);
});

test("pago rechazado o cancelado: se informa al servidor (que libera el ticket) y se quita la copia local", () => {
  const fn = handlerSource();
  assert.match(fn, /if \(verdict\.outcome === TUU_OUTCOME\.CANCELLED\) \{\s*\n\s*await reportTuuAttemptResult\(started\.record, "CANCELLED", tuuError\);\s*\n\s*setTuuPendingPayments\(clearTuuPendingPayment\(storage, stay\.id\)\.records\);\s*\n\s*setCardPaymentStatus\("CANCELLED"\);/);
  assert.match(fn, /if \(verdict\.outcome === TUU_OUTCOME\.DECLINED\) \{\s*\n\s*await reportTuuAttemptResult\(started\.record, "DECLINED", tuuError\);\s*\n\s*setTuuPendingPayments\(clearTuuPendingPayment\(storage, stay\.id\)\.records\);\s*\n\s*setCardPaymentStatus\("DECLINED"\);/);
});

test("con un intento activo (de este u otro equipo) el modal NO ofrece medios de pago (ni EFECTIVO ni tarjeta)", () => {
  assert.match(terminalSource, /const tuuPendingForStay = paymentSubmitting \? null : pendingTuuPaymentFor\(stay\?\.id\);/);
  assert.match(terminalSource, /function pendingTuuPaymentFor\(stayId\) \{\s*\n\s*return findTuuPendingPayment\(\s*\n\s*mergeTuuPendingViews\(tuuPendingPayments, \[\.\.\.serverCardAttempts, \.\.\.\(selectedVehicle\?\.cardPaymentAttempt \? \[selectedVehicle\.cardPaymentAttempt\] : \[\]\)\], \{ deviceId: getKnownPosDeviceIds\(\) \}\),/);
  // Con o sin total $0 por cupón, los medios de pago exigen que no haya un intento activo.
  assert.match(terminalSource, /\{paymentStep === "MENU" && !tuuPendingForStay && !zeroTotalCoupon \? \(\s*\n\s*<div className=\{`grid gap-3 \$\{cardPaymentsEnabled \? "sm:grid-cols-3" : ""\}`\}>\s*\n\s*<button type="button" onClick=\{\(\) => handlePaymentSelection\("CASH"\)\}/);
  assert.match(terminalSource, /\{paymentStep === "MENU" && !tuuPendingForStay && zeroTotalCoupon \? \(/);
  assert.match(terminalSource, /\{paymentStep === "MENU" && tuuPendingForStay \? \(\s*\n\s*<TuuPendingPaymentCard/);
  assert.match(handlerSource(), /if \(!gate\.allowed \|\| selectedVehicle\?\.cardPaymentAttempt\) \{/);
});

test("REINTENTAR solo existe donde consta que TUU no cobró; ya no existe el estado CHARGED_NOT_REGISTERED", () => {
  assert.doesNotMatch(terminalSource, /CHARGED_NOT_REGISTERED/);
  const statuses = new Set([...terminalSource.matchAll(/setCardPaymentStatus\("([A-Z_]*)"\)/g)].map((match) => match[1]));
  assert.deepEqual([...statuses].sort(), ["", "APPROVED", "CANCELLED", "DECLINED", "ERROR", "NOT_INSTALLED", "PROCESSING"]);
});

// ---- 10) REGISTRAR PAGO y recuperación: solo servidor, nunca TUU ----

function registerSource() {
  return sliceBetween("async function registerPendingTuuPayment(record, { earlyPrint = null } = {}) {", "async function processCorrelatedTuuResult(result) {");
}

test("REGISTRAR PAGO nunca vuelve a invocar TUU: avisa la aprobación del intento y registra por intento", () => {
  const fn = registerSource();
  assert.doesNotMatch(fn, /startTuuPayment|payWithTuu|tuuResultRouter|buildTuuPaymentPayload|getTuuPaymentBridge|CARD_PAYMENT_RESERVE/);
  assert.match(fn, /const body = buildTuuRegistrationRequest\(record\);\s*\n\s*if \(!body\) return false;/);
  const report = fn.indexOf('await reportTuuAttemptResult(record, "APPROVED", { reference: record.sequenceNumber })');
  const exit = fn.indexOf("await postCardPaymentAction(body)");
  assert.ok(report !== -1 && exit !== -1 && report < exit, "primero el servidor conoce la aprobación, después registra");
  assert.match(fn, /buildPaymentReceiptPayload\(stay, quote, parkingResponse, "CARD"\)/);
});

test("fallo de registro tras la aprobación: el pago sigue pendiente (nunca se quita la copia ni se ofrece cobrar)", () => {
  const fn = registerSource();
  const beforeSuccess = fn.slice(0, fn.indexOf("// Registrado: se quita la copia local"));
  assert.doesNotMatch(beforeSuccess, /clearTuuPendingPayment/);
  assert.ok((beforeSuccess.match(/registrationFailed\(/g) || []).length >= 6);
  assert.match(beforeSuccess, /El pago TUU ya está aprobado: no vuelva a cobrar\./);
  assert.match(fn, /setTuuPendingPayments\(clearTuuPendingPayment\(storage, record\.stayId\)\.records\);/);
});

test("recuperación (también desde otro equipo): se consulta al servidor y se ajusta la copia local; es solo consulta", () => {
  const fn = sliceBetween("async function refreshServerCardAttempts() {", "// REGISTRAR PAGO: registra en ParkFacil");
  assert.match(fn, /const response = await getPosCardPayments\(\);/);
  assert.match(fn, /setTuuPendingPayments\(reconcileTuuPendingWithServer\(getTuuPendingStorage\(\), attempts\)\);/);
  assert.doesNotMatch(fn, /startTuuPayment|payWithTuu|CARD_PAYMENT_RESERVE|"EXIT"/);
  assert.match(terminalSource, /void refreshServerCardAttemptsRef\.current\?\.\(\);/);
  assert.match(terminalSource, /const recovered = recoverTuuPendingPayments\(getTuuPendingStorage\(\)\);\s*\n\s*setTuuPendingPayments\(recovered\);/);
  assert.match(terminalSource, /<TuuPendingPaymentsBanner records=\{tuuPendingViews\}/);
});

test("el operador no puede declarar un resultado incierto como aprobado o no realizado (es regularización de un administrador)", () => {
  assert.doesNotMatch(terminalSource, /resolveUncertainTuu|onResolveApproved|onResolveNotCharged/);
  assert.doesNotMatch(pendingCardSource, /onResolveApproved|onResolveNotCharged|NO SE REALIZÓ|CONFIRMAR PAGO APROBADO|COBRAR NUEVAMENTE|payWithTuu|startTuuPayment|ParkFacilDevice/);
  assert.match(pendingCardSource, /RESULTADO DEL PAGO INCIERTO/);
  assert.match(pendingCardSource, /No vuelva a cobrar hasta confirmar el estado de la transacción\./);
  assert.match(pendingCardSource, /PAGO TUU APROBADO — PENDIENTE DE REGISTRO/);
  assert.match(pendingCardSource, /REGISTRAR PAGO/);
  assert.match(pendingCardSource, /ACTUALIZAR ESTADO/);
});

// ---- 10b) Servidor: reserva, registro por intento y caminos alternativos ----

test("servidor: las acciones de reserva se atienden antes que cualquier otra y el pago con tarjeta del POS va siempre por intento", () => {
  const dispatch = dataEntrySource.indexOf('if (["CARD_PAYMENT_RESERVE", "CARD_PAYMENT_SENT", "CARD_PAYMENT_RESULT"].includes(input.action)) {');
  const cardExit = dataEntrySource.indexOf('if (input.action === "EXIT" && input.paymentMethod === "CARD" && isPosRequest) {');
  const entry = dataEntrySource.indexOf('if (input.action === "ENTRY") {');
  const generic = dataEntrySource.indexOf('if (["QUOTE", "EXIT"].includes(input.action)) {');
  assert.ok(dispatch !== -1 && cardExit !== -1 && dispatch < cardExit && cardExit < entry && entry < generic);
  assert.match(dataEntrySource, /if \(!attemptId\) return fail\("El pago con tarjeta requiere un intento reservado\. Vuelve a abrir el vehículo\.", 409, \{ code: "CARD_PAYMENT_ATTEMPT_REQUIRED" \}\);/);
});

test("servidor: la reserva valida turno, equipo, ticket abierto del estacionamiento, cálculo de cobro firmado vigente y monto", () => {
  const fn = dataEntrySource.slice(dataEntrySource.indexOf("async function handleCardPaymentAttemptAction("), dataEntrySource.indexOf("async function registerCardPaymentFromAttempt("));
  assert.match(fn, /if \(!isPosRequest \|\| !posShift\) return fail\(/);
  assert.match(fn, /const stay = await findOpenStay\(current\.db, \{ stayId: input\.stayId \}, current\.actor\.parkingId\);/);
  const check = fn.indexOf("const problem = chargeSnapshotProblem(input.quoteSnapshot || null, stay);");
  const reserve = fn.indexOf("await reserveCardPaymentAttempt(current.db, {");
  assert.ok(check !== -1 && reserve !== -1 && check < reserve, "se valida el cálculo de cobro antes de reservar");
  assert.match(fn, /const amount = Math\.round\(Number\(input\.quoteSnapshot\.totalAmount \|\| 0\)\);/);
  assert.match(fn, /const serverEnvironment = tuuEnvironmentFromEnv\(process\.env\);/);
  assert.match(fn, /environment: serverEnvironment, cardType, amount/);
  assert.match(fn, /companyId, parkingId: stay\.parking_id, stayId: stay\.id,/);
  // Empresa: sale del estacionamiento del turno, nunca del cuerpo de la solicitud.
  assert.match(fn, /const companyId = current\.parking\?\.companyId \|\| null;/);
  assert.doesNotMatch(fn, /input\.companyId|input\.amount|input\.parkingId/);
});

// QA PRO2 2026-10-19: el cálculo guardado ya fue verificado al reservar; al registrar
// se exige que corresponda al intento (jsonb reordenaba el desglose V2 y la firma fallaba).
test("servidor: registro por intento -> datos del cálculo de cobro guardado (verificado al reservar), una sola operación; sin recalcular", () => {
  const fn = dataEntrySource.slice(dataEntrySource.indexOf("async function registerCardPaymentFromAttempt("), dataEntrySource.indexOf("const UNPAID_ERROR_MESSAGES = {"));
  assert.match(fn, /attempt = await getCardPaymentAttemptRow\(current\.db, \{ attemptId, companyId \}\);/);
  assert.match(fn, /if \(attempt\.parking_id !== current\.actor\.parkingId\) \{/);
  assert.match(fn, /const snapshot = attempt\.charge_snapshot;\s*\r?\n\s*const problem = storedChargeSnapshotProblem\(snapshot, attempt\);/);
  assert.doesNotMatch(fn, /chargeSnapshotSignatureProblem/);
  // Con el tipo y los últimos 4 dígitos que informa TUU (SOL-2026-10-11-001).
  assert.match(fn, /payment: paymentFromChargeSnapshot\(snapshot, \{ paymentCode, tuu: sanitizeTuuCardDetails\(input\?\.cardPayment\?\.tuu\) \}\),/);
  assert.doesNotMatch(fn, /quoteParkingStay|input\.quoteSnapshot|input\.cardPayment\.reference|input\.cardPayment\.amount/);
  assert.equal((fn.match(/await registerCardPaymentAttempt\(/g) || []).length, 1);
});

test("servidor: registro por intento -> el ticket solicitado es obligatorio y debe ser el del intento, antes de cualquier modificación (D1)", () => {
  const fn = dataEntrySource.slice(dataEntrySource.indexOf("async function registerCardPaymentFromAttempt("), dataEntrySource.indexOf("const UNPAID_ERROR_MESSAGES = {"));
  const order = [
    "const stayIdProblem = cardRegistrationStayIdProblem(input?.stayId);",
    "attempt = await getCardPaymentAttemptRow(current.db, { attemptId, companyId });",
    'if (!attempt) return fail("No existe el intento de pago solicitado.", 404',
    "const stayMismatch = cardRegistrationStayMismatch(input.stayId, attempt);",
    "if (attempt.parking_id !== current.actor.parkingId) {",
    "const alreadyPaid = attempt.status === CARD_ATTEMPT_STATUS.PAID;",
    'current.db.from("coupons").update(',
    "stay = await registerCardPaymentAttempt(current.db, {",
  ].map((fragment) => [fragment, fn.indexOf(fragment)]);
  for (const [fragment, index] of order) assert.notEqual(index, -1, fragment);
  for (let i = 1; i < order.length; i += 1) assert.ok(order[i - 1][1] < order[i][1], `${order[i - 1][0]} debe ir antes de ${order[i][0]}`);
  // Ambos rechazos terminan la solicitud; el intento se busca siempre dentro de la empresa del turno.
  assert.match(fn, /if \(stayIdProblem\) return fail\(stayIdProblem\.error, stayIdProblem\.status, \{ code: stayIdProblem\.code \}\);/);
  assert.match(fn, /if \(stayMismatch\) \{\s+log\("REGISTRATION_REJECTED", \{ code: stayMismatch\.code \}\);\s+return fail\(stayMismatch\.error, stayMismatch\.status, \{ code: stayMismatch\.code \}\);/);
  // El ticket que se paga y el que se devuelve salen del intento, nunca del cuerpo.
  assert.doesNotMatch(fn, /stay_id: input\.stayId|eq\("id", input\.stayId\)|redeemed_stay_id: input\.stayId/);
});

test("servidor: efectivo, tarjeta manual y 'se retiró sin pagar' no eluden un intento activo; sin migración siguen funcionando", () => {
  const generic = dataEntrySource.slice(dataEntrySource.indexOf('if (["QUOTE", "EXIT"].includes(input.action)) {'), dataEntrySource.indexOf('if (input.action === "UNPAID_EXIT") {'));
  const precheck = generic.indexOf("blockingAttempt = await activeCardAttemptOrNull(current.db, stay.id);");
  const update = generic.indexOf('const update = { status: "PAID"');
  assert.ok(precheck !== -1 && update !== -1 && precheck < update);
  assert.match(generic, /if \(String\(error\.message \|\| ""\)\.includes\("CARD_PAYMENT_ATTEMPT_ACTIVE"\)\) return fail\(CARD_ATTEMPT_ACTIVE_MESSAGE, 409/);
  const unpaid = dataEntrySource.slice(dataEntrySource.indexOf('if (input.action === "UNPAID_EXIT") {'));
  assert.ok(unpaid.indexOf("unpaidBlockingAttempt = await activeCardAttemptOrNull(current.db, stay.id);") < unpaid.indexOf("marked = await markStayUnpaid("));
  assert.match(dataEntrySource, /CARD_PAYMENT_ATTEMPT_ACTIVE: CARD_ATTEMPT_ACTIVE_MESSAGE,/);
  assert.match(dataEntrySource, /if \(isCardAttemptsStorageMissing\(error\)\) return null;/);
});

test("servidor: los registros técnicos no incluyen credenciales ni datos de tarjeta", () => {
  for (const match of dataEntrySource.matchAll(/console\.(info|error)\("\[data-entry:card-attempt\]", \{([^}]*)\}/g)) {
    assert.doesNotMatch(match[2], /token|password|secret|pan\b|cvv|pin\b|cardNumber|signature|quoteSnapshot|chargeSnapshot/i);
  }
  assert.doesNotMatch(terminalSource.slice(terminalSource.indexOf("function logTuu("), terminalSource.indexOf("function logTuu(") + 900), /rawResponse|quoteSnapshot|token|password/);
});

// ---- 10c) Terminología visible ----

test("los textos visibles del flujo de pago usan terminología de cobro de estacionamiento", () => {
  const visible = (source) => [...source.matchAll(/"([^"\n]*)"|`([^`\n]*)`|>([^<>{}\n]+)</g)]
    .map((match) => match[1] ?? match[2] ?? match[3] ?? "")
    // Solo frases para personas: con espacios y sin aspecto de código.
    .filter((text) => /\s/.test(text) && !/[=;(){}]|\$\{|=>|className|^\s*\/\//.test(text));
  for (const [name, source] of [["PosTerminal.js", terminalSource], ["PosTuuPendingPayments.js", pendingCardSource], ["data-entry/route.js", dataEntrySource], ["CardPaymentAttemptsManager.js", attemptsManagerSource]]) {
    const offenders = visible(source).filter((text) => /cotiz|quote|snapshot/i.test(text));
    assert.deepEqual(offenders, [], `${name}: textos visibles con términos internos`);
  }
  assert.match(terminalSource, /El cálculo de cobro expiró\./);
  assert.match(dataEntrySource, /El cálculo de cobro expiró\. Actualiza el vehículo para obtener el monto a pagar\./);
});

test("consulta de intentos: un intento que no está pagado nunca se presenta como comprobante de pago", () => {
  assert.match(attemptsManagerSource, /ESTE DOCUMENTO NO ES UN COMPROBANTE DE PAGO/);
  assert.match(attemptsManagerSource, /Regularización manual \(no verificada contra TUU\)/);
  assert.match(attemptsManagerSource, /onClick=\{\(\) => window\.print\(\)\}/);
  assert.match(attemptsManagerSource, /onClick=\{\(\) => setSelected\(row\)\}/);
  for (const column of ['key: "plate"', 'key: "ticketCode"', 'key: "parkingName"', 'key: "reservedAt"', 'key: "amount"', 'key: "cardType"', 'key: "statusLabel"', 'key: "operatorName"', 'key: "deviceId"', 'key: "reference"', 'key: "id"', 'key: "regularization"']) {
    assert.ok(attemptsManagerSource.includes(column), column);
  }
  assert.doesNotMatch(attemptsManagerSource, /boleta|DTE/i);
});

test("buildPaymentReceiptPayload(..., paymentMethod = \"CASH\") mantiene el comportamiento anterior para EFECTIVO (mismo default)", () => {
  // SOL-2026-10-20-001 agrega `boleta` (opcional, al final): el default de EFECTIVO no cambia.
  assert.match(terminalSource, /function buildPaymentReceiptPayload\(stay, quote, parkingResponse, paymentMethod = "CASH", boleta = null\) \{/);
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

// ---- Auditoría 2026-10-11 ----

test("auditoría: una aprobación duplicada (misma referencia TUU) se ignora y no resuelve la espera de otro ticket", () => {
  assert.match(terminalSource, /isDuplicate: \(result\) => isProcessedTuuSequence\(getTuuPendingStorage\(\), result\?\.transactionId\),/);
  assert.match(routerSource, /if \(result\?\.success === true && typeof isDuplicate === "function" && isDuplicate\(result\)\) \{[\s\S]{0,160}?return;\s*\n\s*\}\s*\n[\s\S]{0,400}?const matchesWaiting = waiting && \(!waiting\.attemptId \|\| !correlation\.declared \|\| correlation\.attemptId === waiting\.attemptId\);\s*\n\s*if \(matchesWaiting\) \{/);
  const remembered = terminalSource.match(/rememberProcessedTuuSequence\(storage, /g) || [];
  assert.equal(remembered.length, 3, "aprobado en flujo + respuesta tardía (APK 0.3.13) + resultado con attemptId (APK 0.4.0)");
});

test("auditoría: el desenlace del pago lo decide classifyTuuOutcome; el POS no reinterpreta códigos de TUU", () => {
  const fn = handlerSource();
  assert.match(fn, /const verdict = classifyTuuOutcome\(outcome\);/);
  assert.doesNotMatch(fn, /tuuResult\?\.cancelled|tuuResult\?\.success|errorCode ===/);
});

// --- Fase APK (SOL-2026-10-11-001): contrato web <-> APK 0.4.0 -----------------

const nativeBridgeSource = await readFile(new URL("../../lib/pos/tuuNativeBridge.mjs", import.meta.url), "utf8");

test("fase APK: la APK nunca decide si se cobra; reserva y envío confirmados van SIEMPRE antes de lanzar, con cualquier APK", () => {
  const fn = sliceBetween("async function handleCardPaymentSelection(tuuMethod) {", "async function reportTuuAttemptResult(record, outcome, extra = {}) {");
  const order = [
    "await syncNativeTuuState({ fromPaymentFlow: true });",
    'action: "CARD_PAYMENT_RESERVE"',
    'action: "CARD_PAYMENT_SENT"',
    "await startTuuPayment(JSON.stringify(tuuPayload), attempt.id);",
  ].map((fragment) => [fragment, fn.indexOf(fragment)]);
  for (const [fragment, index] of order) assert.notEqual(index, -1, fragment);
  for (let i = 1; i < order.length; i += 1) assert.ok(order[i - 1][1] < order[i][1], `${order[i - 1][0]} antes de ${order[i][0]}`);
  // Un solo lanzamiento en todo el POS y siempre con el intento reservado.
  assert.equal((terminalSource.match(/startTuuPayment\(/g) || []).length, 2, "definición + una llamada");
  assert.equal((terminalSource.match(/payWithTuu/g) || []).filter(Boolean).length, (terminalSource.match(/payWithTuu(Attempt)?\b/g) || []).length);
  assert.doesNotMatch(terminalSource, /bridge\.payWithTuu(Attempt)?\(/, "PosTerminal no llama al bridge de pago directamente");
  // El método de la APK se elige por capacidad detectada, no por versión.
  assert.match(nativeBridgeSource, /if \(capabilities\.attempt && isTuuAttemptId\(attemptId\)\) \{\s*\n\s*return \{ payWithTuu: \(payloadJson\) => bridge\.payWithTuuAttempt\(payloadJson, attemptId\), usesAttempt: true \};/);
  assert.match(nativeBridgeSource, /if \(capabilities\.legacy\) return \{ payWithTuu: \(payloadJson\) => bridge\.payWithTuu\(payloadJson\), usesAttempt: false \};/);
  assert.doesNotMatch(nativeBridgeSource, /runtimeVersion|appVersion/, "sin decisiones por número de versión");
});

test("fase APK: con un pago anterior sin cerrar en el equipo no se reserva otro intento", () => {
  const fn = sliceBetween("async function handleCardPaymentSelection(tuuMethod) {", "async function reportTuuAttemptResult(record, outcome, extra = {}) {");
  const guard = fn.indexOf("if (nativeState.supported && (nativeState.inFlight || nativeState.results.length > 0 || nativeState.readFailed)) {");
  assert.ok(guard !== -1 && guard < fn.indexOf('action: "CARD_PAYMENT_RESERVE"'));
  assert.match(fn.slice(guard, guard + 900), /No se inició ningún cobro\."\);\s*\n\s*return;/);
});

test("fase APK: el ACK a la APK ocurre solo después de que el servidor guardó el resultado", () => {
  const report = sliceBetween("async function reportTuuAttemptResult(record, outcome, extra = {}) {", "async function flushTuuResultReports() {");
  const post = report.indexOf("const response = await postCardPaymentAction(report);");
  const ack = report.indexOf("if (shouldAckTuuResult(response)) ackNativeTuuResult(getNativeDeviceBridge(), report.attemptId);");
  assert.ok(post !== -1 && ack !== -1 && post < ack);
  // Tres puntos: al informar, al vaciar la cola y en el camino rápido (aprobación y
  // registro en una llamada, SOL-2026-10-11-001), siempre tras la respuesta OK del servidor.
  assert.equal((terminalSource.match(/ackNativeTuuResult\(/g) || []).length, 3, "al informar, al vaciar la cola y en el registro combinado");
  for (const match of terminalSource.matchAll(/ackNativeTuuResult\(/g)) {
    const line = terminalSource.slice(terminalSource.lastIndexOf("\n", match.index) + 1, terminalSource.indexOf("\n", match.index));
    assert.match(line, /if \(shouldAckTuuResult\((response|combined)\)\) ackNativeTuuResult\(getNativeDeviceBridge\(\), (report|record)\.attemptId\);/);
  }
  const fast = sliceBetween("// 0) Camino rápido", "// 1) El servidor debe conocer la aprobación");
  assert.ok(fast.indexOf("const combined = await postCardPaymentAction(") < fast.indexOf("if (combined.ok) {"));
  assert.ok(fast.indexOf("if (combined.ok) {") < fast.indexOf("ackNativeTuuResult("));
  // Y el ACK es siempre del intento informado, nunca "el último" ni todos.
  assert.match(nativeBridgeSource, /export function shouldAckTuuResult\(response\) \{\s*\n\s*return Boolean\(response\) && response\.ok === true && response\.network !== true;/);
});

test("fase APK: recuperar el estado guardado en la APK solo informa al servidor; nunca abre TUU", () => {
  const sync = sliceBetween("async function processCorrelatedTuuResult(result) {", "async function handleLateTuuResult(result) {");
  assert.doesNotMatch(sync, /startTuuPayment|payWithTuu|tuuLaunchBridge|buildTuuPaymentPayload|CARD_PAYMENT_RESERVE|CARD_PAYMENT_SENT/);
  assert.match(sync, /const actions = planNativeTuuSync\(readPendingTuuState\(bridge\)\);/);
  assert.match(sync, /const reported = await reportTuuAttemptResult\(record, "UNCERTAIN", \{ errorCode: "RESULT_NOT_DELIVERED" \}\);\s*\n\s*if \(shouldAbandonLostTuuAttempt\(reported\.response\)\) \{/);
  // No interfiere con un cobro en curso.
  assert.match(sync, /if \(tuuResultRouter\.isWaiting\(\)\) return;\s*\n\s*if \(cardPaymentLockRef\.current && !fromPaymentFlow\) return;/);
  // Se consulta al cargar y al volver a primer plano.
  assert.match(terminalSource, /void syncNativeTuuStateRef\.current\?\.\(\);\s*\n\s*\}\);\s*\n\s*\/\/ Al volver a primer plano/);
  assert.match(terminalSource, /if \(document\.visibilityState === "visible"\) void syncNativeTuuStateRef\.current\?\.\(\);/);
});

test("fase APK: un resultado sin correlación válida nunca se asigna a un ticket; con attemptId va a su intento", () => {
  const late = sliceBetween("async function handleLateTuuResult(result) {", "async function refreshTuuPendingStatus(stayId) {");
  const uncorrelated = late.indexOf("if (result?.uncorrelated === true) {");
  const correlated = late.indexOf("if (result?.attemptId) {");
  const legacy = late.indexOf("latestUnresolvedTuuPayment(loadTuuPendingPayments(storage))");
  assert.ok(uncorrelated !== -1 && correlated !== -1 && legacy !== -1 && uncorrelated < correlated && correlated < legacy);
  assert.match(late.slice(uncorrelated, correlated), /return;/);
  assert.match(late.slice(correlated, legacy), /await processCorrelatedTuuResult\(result\);\s*\n\s*return;/);
  const correlatedFn = sliceBetween("async function processCorrelatedTuuResult(result) {", "async function syncNativeTuuState(");
  assert.match(correlatedFn, /const local = findTuuPendingPaymentByAttempt\(loadTuuPendingPayments\(storage\), attemptId\);/);
  assert.doesNotMatch(correlatedFn, /latestUnresolvedTuuPayment/, "con attemptId no se usa 'el más reciente'");
});

test("fase APK: ambiente e identificador del equipo son datos declarados por el cliente, no credenciales", () => {
  const fn = sliceBetween("async function handleCardPaymentSelection(tuuMethod) {", "async function reportTuuAttemptResult(record, outcome, extra = {}) {");
  assert.match(fn, /const tuuEnvironment = readTuuBridgeEnvironment\(getNativeDeviceBridge\(\)\);/);
  assert.match(fn, /\.\.\.\(tuuEnvironment \? \{ tuuEnvironment \} : \{\}\) \}\);/);
  const reserve = dataEntrySource.slice(dataEntrySource.indexOf('if (input.action === "CARD_PAYMENT_RESERVE") {'), dataEntrySource.indexOf("const attemptId = isUuid(input.attemptId) ? input.attemptId : null;"));
  const check = reserve.indexOf("const environmentProblem = tuuEnvironmentCompatibilityProblem({ serverEnvironment, declaredEnvironment: normalizeDeclaredTuuEnvironment(input.tuuEnvironment) });");
  assert.ok(check !== -1 && check < reserve.indexOf("await reserveCardPaymentAttempt("));
  // El ambiente que se guarda en el intento es el del servidor, nunca el declarado.
  assert.match(reserve, /const serverEnvironment = tuuEnvironmentFromEnv\(process\.env\);/);
  assert.match(reserve, /environment: serverEnvironment, cardType, amount/);
  assert.doesNotMatch(reserve, /environment: input\.|environment: normalizeDeclaredTuuEnvironment/);
  // Los permisos del servidor no miran el identificador del equipo ni el ambiente declarado.
  assert.doesNotMatch(dataEntrySource, /input\.tuuEnvironment[\s\S]{0,80}(role|permission|REPORTS_READ)/);
  assert.match(terminalSource, /return resolvePosDeviceId\(getNativeDeviceBridge\(\), \(\) => getOrCreatePosDeviceId\(getTuuPendingStorage\(\)\)\);/);
});

test("pago con tarjeta no cobrado: PAGAR EN EFECTIVO lleva directo a confirmar el efectivo (2 toques)", () => {
  const i = terminalSource.indexOf("PAGAR EN EFECTIVO");
  assert.ok(i > 0);
  const button = terminalSource.slice(terminalSource.lastIndexOf("<button", i), i);
  assert.ok(button.includes('handlePaymentSelection("CASH")'));
  assert.ok(terminalSource.indexOf('setPaymentStep("CASH_CONFIRM")') > 0);
});
