import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// Mismo enfoque que el resto de pruebas de PosTerminal.js en este repo
// (ver PosTerminal.shiftGate.test.mjs): sin infraestructura de render de
// React (sin jsdom/testing-library), se verifica por contrato sobre el
// código fuente que la integración del agente local de impresión cumple
// lo pedido — impresión automática tras confirmar la operación, sin
// duplicar ENTRY/EXIT ante fallos, y con el mismo payload reutilizado en
// la reimpresión.

const terminalSource = await readFile(new URL("./PosTerminal.js", import.meta.url), "utf8");
const dataEntryRouteSource = await readFile(new URL("../../app/api/data-entry/route.js", import.meta.url), "utf8");

test("el agente local solo se usa como fallback del bridge Android, nunca al revés", () => {
  // Fase 6 (fotografía de patente en el ticket) agregó un tercer parámetro
  // opcional (platePhoto) y una rama para el caso "bridge + foto", pero el
  // contrato de fondo sigue intacto: el agente local (PC) SOLO se llama
  // cuando no existe bridge nativo -- nunca al revés.
  assert.match(
    terminalSource,
    /async function executeAutoPrint\(payload, toAgentPayload, platePhoto\) \{\s*\n\s*const bridge = getNativePrinterBridge\(\);\s*\n\s*if \(bridge\) \{/,
  );
  assert.match(terminalSource, /return tryLocalAgentPrint\(toAgentPayload\(payload\)\);/);
});

test("el agente local solo escucha en 127.0.0.1 (mismo host que el POS)", () => {
  assert.match(terminalSource, /const PRINT_AGENT_URL = "http:\/\/127\.0\.0\.1:19100\/print";/);
});

test("INGRESO: la impresión ocurre después de confirmar el ENTRY, nunca antes", () => {
  const fn = terminalSource.slice(
    terminalSource.indexOf("async function submitEntry(event)"),
    terminalSource.indexOf("const navItems = ["),
  );
  const entryPostIndex = fn.indexOf('fetch("/api/data-entry"');
  const printCallIndex = fn.indexOf("await printLastEntryTicket(printPayload,");
  assert.ok(entryPostIndex > -1 && printCallIndex > -1, "no se encontraron los puntos de referencia esperados");
  assert.ok(printCallIndex > entryPostIndex, "la impresión debe ocurrir después del POST de ENTRY, no antes");
});

test("SALIDA: la impresión ocurre automáticamente después de confirmar el pago, sin preguntar SÍ/NO", () => {
  const fn = terminalSource.slice(
    terminalSource.indexOf("async function confirmCashPayment()"),
    terminalSource.indexOf("function finishPaidFlow()"),
  );
  const exitPostIndex = fn.indexOf('body: JSON.stringify({ action: "EXIT"');
  const printCallIndex = fn.indexOf("await printLastReceipt(receiptPayload)");
  assert.ok(exitPostIndex > -1 && printCallIndex > -1, "no se encontraron los puntos de referencia esperados");
  assert.ok(printCallIndex > exitPostIndex, "la impresión debe ocurrir después del POST de EXIT, no antes");
  assert.doesNotMatch(terminalSource, /¿DESEA IMPRIMIR EL RECIBO\?/);
});

test("si la impresión de INGRESO falla, no se repite ENTRY: solo se reutiliza el mismo printPayload ya construido", () => {
  assert.match(terminalSource, /const printFailedOnDevice = Boolean\(printResult\?\.attempted && !printResult\.ok\);/);
  assert.doesNotMatch(terminalSource, /REIMPRIMIR[\s\S]{0,120}fetch\("\/api\/data-entry"/);
});

test("si la impresión de SALIDA falla, se muestra 'No fue posible imprimir el ticket' y REINTENTAR IMPRESIÓN reutiliza el mismo recibo", () => {
  assert.match(terminalSource, /No fue posible imprimir el ticket\./);
  assert.match(terminalSource, /REINTENTAR IMPRESIÓN/);
  assert.match(
    terminalSource,
    /async function confirmReceiptPrint\(\) \{\s*\n\s*const result = await printLastReceipt\(receiptPrintPayload\);/,
  );
});

test("las reimpresiones (entrada y recibo) están protegidas contra doble clic por el mismo estado de 'ocupado'", () => {
  assert.match(terminalSource, /disabled=\{entryPrintBusy\}/);
  assert.match(terminalSource, /disabled=\{receiptPrintBusy\}/);
});

test("el botón CONFIRMAR PAGO queda deshabilitado durante todo el ciclo, incluida la impresión automática (paymentSubmitting solo se libera en finally)", () => {
  const fn = terminalSource.slice(
    terminalSource.indexOf("async function confirmCashPayment()"),
    terminalSource.indexOf("function finishPaidFlow()"),
  );
  const finallyIndex = fn.lastIndexOf("finally");
  const setSubmittingFalseIndex = fn.indexOf("setPaymentSubmitting(false);", finallyIndex);
  const printCallIndex = fn.indexOf("await printLastReceipt(receiptPayload)");
  assert.ok(setSubmittingFalseIndex > printCallIndex, "paymentSubmitting debe seguir en true durante el intento de impresión");
});

test("no se creó infraestructura paralela de agente dentro del repo: solo se agregó un cliente HTTP hacia el agente ya piloteado", () => {
  assert.doesNotMatch(terminalSource, /require\(["']serialport["']\)/);
  assert.doesNotMatch(terminalSource, /COM6/);
});

test("la validación server-side de turno y de estadía sigue intacta (sin relación con impresión)", () => {
  assert.match(dataEntryRouteSource, /requireOpenPosShift\(current\.db, current\.actor\)/);
  assert.match(dataEntryRouteSource, /eq\("status", "OPEN"\)/);
});
