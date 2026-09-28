import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// POS Salida por QR: contrato de integración en PosTerminal.js y del lector.
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const terminal = read("./PosTerminal.js");
const scanner = read("./QrTicketScanner.js");
const buildEntry = terminal.slice(terminal.indexOf("function buildEntryPrintPayload("), terminal.indexOf("function buildEntryPrintPayload(") + 2500);
const qrView = terminal.slice(terminal.indexOf("if (currentView === POS_VIEWS.QR) {"), terminal.indexOf("if (currentView === POS_VIEWS.BUSCAR) {"));
const handler = terminal.slice(terminal.indexOf("async function handleQrTicket(raw) {"), terminal.indexOf("function restartQrScan() {"));

test("el ticket de entrada sigue imprimiendo el qr_token de la estadía como QR", () => {
  assert.match(terminal, /qrValue: String\(stay\?\.qr_token \|\| ""\)\.trim\(\),/);
  assert.ok(buildEntry.length > 0);
});

test("la vista QR ya no es un marcador: lector + código manual, con gate de turno", () => {
  assert.doesNotMatch(terminal, /La lectura QR futura/);
  assert.match(qrView, /const gate = renderShiftGate\("Salida por código QR"\);\s*if \(gate\) return gate;/);
  assert.match(qrView, /<QrTicketScanner key=\{qrScanKey\} onDetected=\{\(value\) => void handleQrTicket\(value\)\} \/>/);
  assert.match(qrView, /void handleQrTicket\(qrManualCode\);/);
});

test("lectura -> lista fresca del servidor -> resolvedor puro -> cotización y cobro directo", () => {
  assert.match(handler, /const summary = await getPosVehicleSummary\(\);/);
  assert.match(handler, /const result = resolveStayFromQr\(stays, raw\);/);
  assert.match(handler, /const detail = await openVehicleDetail\(result\.stay\);\s*if \(detail\) openPaymentModal\(\);/, "el cobro se abre recién con la cotización cargada");
  assert.match(handler, /if \(qrBusy\) return;/, "una lectura a la vez (sin doble cobro por lecturas repetidas)");
});

test("la salida por patente no cambia: openVehicleDetail no abre el cobro por sí mismo", () => {
  const detailFn = terminal.slice(terminal.indexOf("async function openVehicleDetail(stay) {"), terminal.indexOf("async function handleQrTicket(raw) {"));
  assert.doesNotMatch(detailFn, /openPaymentModal\(\)/);
  assert.match(detailFn, /return detail;/);
  assert.match(terminal, /void openVehicleDetail\(matches\[0\]\);/);
});

test("lector compatible con WebView 83: BarcodeDetector si existe, jsQR si no; cámara se libera", () => {
  assert.match(scanner, /typeof window\.BarcodeDetector === "function"/);
  assert.match(scanner, /await import\("jsqr"\)/);
  assert.match(scanner, /stream\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(scanner, /facingMode: "environment"/);
});
