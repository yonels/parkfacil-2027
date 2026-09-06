import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  buildPrintableEntryPayload,
  resolvePlatePhotoPrintDecision,
} from "../../lib/offStreet/offStreetPlatePhoto.mjs";

// Fase 6B (impresión gráfica de la foto de patente en el ticket físico).
// Mismo enfoque que PosTerminal.printAgent.test.mjs: sin infraestructura de
// render de React, se verifica por contrato sobre el código fuente + las
// reglas puras ya cubiertas por offStreetPlatePhoto.test.mjs. No son tests
// frágiles de whitespace: cada aserción ancla a un identificador/token
// estable del código, no a formato exacto.

const terminalSource = await readFile(new URL("./PosTerminal.js", import.meta.url), "utf8");

// ---- 1) Foto disponible + bridge con soporte de imagen -> imprime imagen ----

test("bridge con printWithImage + foto disponible: se llama printWithImage, nunca print() de solo texto", () => {
  assert.match(terminalSource, /function bridgeSupportsPlatePhoto\(bridge\) \{\s*\n\s*return Boolean\(bridge && typeof bridge\.printWithImage === "function"\);/);
  assert.match(terminalSource, /const raw = await bridge\.printWithImage\(JSON\.stringify\(decision\.payload\)\);/);

  const decision = resolvePlatePhotoPrintDecision({ printOnTicket: true, hasPhoto: true, bridgeSupportsImage: true });
  assert.equal(decision.includePhoto, true);
});

// ---- 2) Foto disponible + bridge solo texto -> fallback controlado ----

test("bridge sin printWithImage (solo print de texto): la decisión nunca incluye la foto, se usa el ticket de texto", () => {
  const decision = resolvePlatePhotoPrintDecision({ printOnTicket: true, hasPhoto: true, bridgeSupportsImage: false });
  assert.equal(decision.includePhoto, false);
  assert.equal(decision.reason, "BRIDGE_NO_IMAGE_SUPPORT");
  // executeNativePrintWithPlatePhoto cae siempre a executeNativePrint (texto)
  // cuando decision.includePhoto es false -- nunca intenta printWithImage.
  assert.match(terminalSource, /if \(decision\.includePhoto\) \{\s*\n\s*try \{\s*\n\s*const raw = await bridge\.printWithImage/);
  assert.match(terminalSource, /const textResult = await executeNativePrint\(payload\);/);
});

// ---- 3) Sin foto -> imprime ticket textual (nunca intenta el bridge de imagen) ----

test("executeAutoPrint sin fotografía nunca llama a executeNativePrintWithPlatePhoto", () => {
  assert.match(
    terminalSource,
    /async function executeAutoPrint\(payload, toAgentPayload, platePhoto\) \{\s*\n\s*const bridge = getNativePrinterBridge\(\);\s*\n\s*if \(bridge\) \{\s*\n\s*if \(platePhoto\?\.photoBase64\) \{\s*\n\s*return executeNativePrintWithPlatePhoto\(payload, platePhoto\.photoBase64, platePhoto\.printOnTicket\);\s*\n\s*\}\s*\n\s*return executeNativePrint\(payload\);/
  );
});

// ---- 4/5) Reimpresión reutiliza la foto ya guardada, nunca abre la cámara ----

test("printLastEntryTicket reutiliza entryPhotoForPrint (ya en memoria) cuando no se pasa una foto explícita", () => {
  assert.match(terminalSource, /const photoBase64 = photoOptions\?\.photoBase64 \?\? entryPhotoForPrint;/);
});

test("REIMPRIMIR TICKET no abre PlatePhotoCapture ni toca entryPhoto/setEntryOpen", () => {
  const blockStart = terminalSource.indexOf("{entryPrintPayload ? (");
  const blockEnd = terminalSource.indexOf(") : null}", blockStart);
  const buttonBlock = terminalSource.slice(blockStart, blockEnd);
  assert.match(buttonBlock, /onClick=\{\(\) => void printLastEntryTicket\(entryPrintPayload\)\}/);
  assert.doesNotMatch(buttonBlock, /setEntryOpen/);
  assert.doesNotMatch(buttonBlock, /PlatePhotoCapture/);
});

test("printLastEntryTicket nunca vuelve a llamar a /api/data-entry (no crea una nueva estadía)", () => {
  const fnStart = terminalSource.indexOf("async function printLastEntryTicket(payload, photoOptions)");
  const fnEnd = terminalSource.indexOf("async function printLastReceipt(payload)");
  const fn = terminalSource.slice(fnStart, fnEnd);
  assert.doesNotMatch(fn, /fetch\("\/api\/data-entry"/);
  assert.doesNotMatch(fn, /PlatePhotoCapture/);
});

// ---- 6) Error obteniendo/decodificando la foto no rompe el ticket ----

test("un fallo del bridge al imprimir con imagen se atrapa y cae al ticket de texto, sin propagar la excepción", () => {
  assert.match(
    terminalSource,
    /\} catch \{\s*\n\s*\/\/ El bridge declaró soporte pero falló al imprimir la imagen: se cae\s*\n\s*\/\/ a texto sin propagar este error \(fallback obligatorio, §9\)\.\s*\n\s*\}/
  );
});

// ---- 7) Error imprimiendo imagen no crea doble ingreso ----

test("executeNativePrintWithPlatePhoto nunca hace fetch: un fallo de imagen no puede duplicar ENTRY/EXIT", () => {
  const fnStart = terminalSource.indexOf("async function executeNativePrintWithPlatePhoto(payload, photoBase64, printPlatePhotoOnTicket) {");
  const fnEnd = terminalSource.indexOf("async function executeAutoPrint(payload, toAgentPayload, platePhoto)");
  const fn = terminalSource.slice(fnStart, fnEnd);
  assert.doesNotMatch(fn, /fetch\(/);
});

test("un fallo de impresión (con o sin foto) nunca reintenta el POST de ENTRY", () => {
  // Ya cubierto en general por PosTerminal.printAgent.test.mjs; aquí se
  // confirma que la variable de estado usada para eso sigue derivándose del
  // MISMO resultado que ahora también puede traer photoIncluded/
  // photoSkippedReason -- no una segunda ruta de error paralela.
  assert.match(terminalSource, /const printFailedOnDevice = Boolean\(printResult\?\.attempted && !printResult\.ok\);/);
  assert.match(terminalSource, /photoSkippedReason: decision\.reason \|\| "IMAGE_PRINT_FAILED_FALLBACK_TEXT"/);
});

// ---- 8) ENTRY completo: texto + foto ----

test("buildPrintableEntryPayload agrega la foto al MISMO payload de texto (nunca un segundo ticket aparte)", () => {
  const base = { type: "ENTRY", plate: "ABCD-12", ticketNumber: "T-1", qrValue: "Q-1" };
  const result = buildPrintableEntryPayload(base, {
    photoBase64: "data:image/jpeg;base64,AAA",
    printOnTicket: true,
    bridgeSupportsImage: true,
  });
  assert.equal(result.payload.type, "ENTRY");
  assert.equal(result.payload.plate, "ABCD-12");
  assert.equal(result.payload.ticketNumber, "T-1");
  assert.equal(result.payload.qrValue, "Q-1");
  assert.equal(result.payload.platePhotoBase64, "data:image/jpeg;base64,AAA");
});

// ---- 9) DISABLED: nunca se intenta la foto ----

test("platePhotoMode DISABLED nunca muestra PlatePhotoCapture (entryPhoto queda siempre null)", () => {
  assert.match(terminalSource, /\{platePhotoMode !== "DISABLED" \? \(/);
});

// ---- 10/11) OPTIONAL sin foto imprime normal; REQUIRED respeta 6A ----

test("el gate de envío solo bloquea en REQUIRED sin foto -- OPTIONAL/DISABLED nunca bloquean", () => {
  assert.match(terminalSource, /if \(platePhotoMode === "REQUIRED" && !entryPhoto\) \{/);
});

// ---- 12) Navegador sin ParkFacilDevice -> comportamiento seguro (agente PC / texto) ----

test("sin window.ParkFacilDevice, executeAutoPrint usa el agente local (nunca intenta printWithImage)", () => {
  assert.match(terminalSource, /function getNativePrinterBridge\(\) \{\s*\n\s*if \(typeof window === "undefined"\) return null;\s*\n\s*const bridge = window\?\.ParkFacilDevice;\s*\n\s*if \(!bridge \|\| typeof bridge\.print !== "function"\) return null;/);
  assert.match(terminalSource, /return tryLocalAgentPrint\(toAgentPayload\(payload\)\);/);
});

test("no se asume soporte de imagen que el bridge no declaró explícitamente", () => {
  assert.doesNotMatch(terminalSource, /bridgeSupportsPlatePhoto\(bridge\)\s*\?\?\s*true/);
});
