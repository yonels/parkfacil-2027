import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// POS Entry/Exit — ticket de entrada PT-210 (agente local): contrato de
// integración en PosTerminal.js y en el origen de los datos de empresa.

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const terminal = read("./PosTerminal.js");
const dataEntry = read("../../app/api/data-entry/route.js");

function slice(source, start, end) {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `no se encontró ${start}`);
  return source.slice(from, source.indexOf(end, from + start.length));
}

const buildEntry = slice(terminal, "function buildEntryPrintPayload(stay, parkingResponse) {", "// Arma el payload del recibo de pago");
const toAgentEntry = slice(terminal, "function toAgentEntryPayload(payload) {", "function toAgentExitPayload(payload) {");
const autoPrint = slice(terminal, "async function executeAutoPrint(payload, toAgentPayload, platePhoto) {", "async function getSessionContext()");

test("32. la empresa del ticket sale de la MISMA estadía/parking que confirmó el backend", () => {
  assert.match(buildEntry, /const agentTicket = buildAgentEntryTicketPayload\(stay, parkingResponse\);/);
  // ENTRY devuelve el parking de la estadía con la empresa por FK (sin [0]).
  assert.match(dataEntry, /const ticketParkingFields = "[^"]*company:companies\(business_name,address,district,city,rut_number,rut_dv,phone\)"/);
  assert.match(dataEntry, /select\(ticketParkingFields\)\.eq\("id", assignedParkingId\)\.single\(\)/);
});

test("el agente recibe el payload del formato definitivo (reimpresión incluida: mismo payload guardado)", () => {
  assert.match(toAgentEntry, /if \(payload\.agentTicket\) return \{ \.\.\.payload\.agentTicket \};/);
});

test("foto en el agente: misma regla de negocio que el bridge (config del parking) y fallback a patente grande", () => {
  assert.match(autoPrint, /resolvePlatePhotoPrintDecision\(\{\s*printOnTicket: Boolean\(platePhoto\.printOnTicket\),\s*hasPhoto: true,\s*bridgeSupportsImage: true,\s*\}\)/);
  assert.match(autoPrint, /const fotoRaster = decision\.includePhoto \? await photoToTicketRaster\(platePhoto\.photoBase64\) : null;/);
  assert.match(autoPrint, /tryLocalAgentPrint\(\{ \.\.\.agentPayload, fotoRaster \}\)/);
  // Sin foto / conversión fallida / no corresponde -> ticket sin foto (patente grande en el agente).
  assert.match(autoPrint, /return tryLocalAgentPrint\(toAgentPayload\(payload\)\);\s*\}\s*$/);
});

test("el camino del bridge nativo (SUNMI) no cambia", () => {
  assert.match(autoPrint, /if \(bridge\) \{\s*if \(platePhoto\?\.photoBase64\) \{\s*return executeNativePrintWithPlatePhoto\(payload, platePhoto\.photoBase64, platePhoto\.printOnTicket\);\s*\}\s*return executeNativePrint\(payload\);\s*\}/);
});

test("la foto se toma de la captura existente (entryPhotoForPrint), nunca de una nueva", () => {
  assert.match(terminal, /const photoBase64 = photoOptions\?\.photoBase64 \?\? entryPhotoForPrint;/);
  assert.doesNotMatch(autoPrint, /getUserMedia|PlatePhotoCapture/);
});
