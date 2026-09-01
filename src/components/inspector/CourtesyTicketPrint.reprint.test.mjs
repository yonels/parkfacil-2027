import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// REIMPRESIÓN -- CRÍTICO (cierre de etapa, 2026-08-31): pruebas directas
// sobre el código fuente de que "REINTENTAR IMPRESIÓN"/"IMPRIMIR
// NUEVAMENTE" nunca puede duplicar la fiscalización, cambiar patente/
// fecha/folio, reenviar SMS ni tener ningún otro efecto secundario en BD.
// No hay estado de React que represente plate/inspectedAt/inspectionId --
// vienen SIEMPRE de los props del componente, nunca de un useState propio
// que pudiera derivar -- así que esto se verifica por inspección
// estructural del código, no simulando clics (no hay jsdom en este
// proyecto, ver el resto de tests de Inspector para el mismo criterio).
const source = await readFile(new URL("./CourtesyTicketPrint.js", import.meta.url), "utf8");

test("REIMPRIMIR: no existe NINGÚN useState para plate/inspectedAt/inspectionId -- solo pueden venir de los props del componente, nunca recalculados ni reobtenidos", () => {
  assert.doesNotMatch(source, /useState\([^)]*\)\s*;?\s*\/\/.*\b(plate|inspectedAt|inspectionId)\b/i);
  assert.doesNotMatch(source, /const \[(plate|inspectedAt|inspectionId), set(Plate|InspectedAt|InspectionId)\]/);
});

test("REIMPRIMIR: handlePrint (el mismo handler para el primer intento, reintento y reimpresión) construye el ticket SIEMPRE con { plate, inspectedAt, inspectionId } -- los props del componente, idénticos en cada click", () => {
  const handlePrintBody = source.slice(source.indexOf("async function handlePrint()"), source.indexOf("if (!available) {"));
  const calls = [...handlePrintBody.matchAll(/\{ plate, inspectedAt, inspectionId \}/g)];
  assert.ok(calls.length >= 2, "tanto la rama Android (buildCourtesyTicketEscPos) como la rama PC (courtesyTicketAgentPayload) deben usar exactamente los mismos props");
});

test("REIMPRIMIR: el componente NUNCA hace fetch/authenticatedFetch -- ninguna reimpresión puede volver a tocar /api/inspector/inspections (crear otra fiscalización) ni ningún otro endpoint de ParkFacil", () => {
  assert.doesNotMatch(source, /fetch\(|authenticatedFetch\(/);
});

test("REIMPRIMIR: nunca importa ni menciona el envío de SMS (sendInspectionSmsIfNeeded, register_on_street_inspection, INSPECTION_OVERDUE_SMS_TEXT) -- la impresión y el SMS son caminos completamente separados", () => {
  assert.doesNotMatch(source, /sendInspectionSmsIfNeeded|register_on_street_inspection|INSPECTION_OVERDUE_SMS_TEXT|inspectorSms/);
});

test("REIMPRIMIR: 'IMPRIMIR NUEVAMENTE' y 'REINTENTAR IMPRESIÓN' llaman al MISMO handlePrint que el primer intento -- no existe un segundo handler para reimpresión que pudiera divergir", () => {
  const printButtonBlock = source.slice(source.indexOf("<button\n        type=\"button\"\n        onClick={handlePrint}"), source.indexOf("</button>", source.indexOf("onClick={handlePrint}")));
  assert.match(printButtonBlock, /onClick=\{handlePrint\}/);
  assert.match(source, /printLabel = printStatus === "error" \? "REINTENTAR IMPRESIÓN" : printStatus === "done" \? "IMPRIMIR NUEVAMENTE"/, "ambas etiquetas son solo texto del MISMO botón/handler, no una ruta de código distinta");
});

test("REIMPRIMIR: un error de impresión (Bluetooth desconectado, agente no disponible, etc.) solo cambia printStatus/printError -- nunca toca ningún estado relacionado con la fiscalización, que ni siquiera existe en este componente", () => {
  const catchBlock = source.slice(source.indexOf("} catch (cause) {", source.indexOf("async function handlePrint")), source.indexOf("}\n  }\n\n  if (!available)"));
  assert.match(catchBlock, /setPrintStatus\("error"\)/);
  assert.match(catchBlock, /La fiscalización ya fue registrada/);
  assert.doesNotMatch(catchBlock, /setInspector|setRegistro|fetch\(/);
});

test("REIMPRIMIR: la impresora recordada (persistencia local) usa una clave global, sin inspectionId -- reconectar/reimprimir nunca crea ni depende de una fiscalización", async () => {
  const adapterSource = await readFile(new URL("../../lib/inspector/printerAdapter.js", import.meta.url), "utf8");
  assert.match(adapterSource, /const STORAGE_KEY = "parkfacil-inspector-printer";/);
  const storageBlock = adapterSource.slice(adapterSource.indexOf("const STORAGE_KEY"), adapterSource.indexOf("export function clearSavedPrinter"));
  assert.doesNotMatch(storageBlock, /inspectionId/);
});
