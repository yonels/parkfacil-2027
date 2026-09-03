import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./CourtesyTicketPrint.js", import.meta.url), "utf8");

// printSummaryFor es una función pura (sin JSX/hooks) -- se extrae y ejecuta
// de verdad con `new Function`, mismo criterio que sendInspectionSmsIfNeeded
// en inspectorInspectionService.test.mjs, en vez de solo verificar el texto
// fuente por regex.
const start = source.indexOf("function printSummaryFor");
const end = source.indexOf("\n}", start) + 2;
const printSummaryFor = new Function(`return (${source.slice(start, end)});`)();

test("printSummaryFor: no disponible es tono neutral, nunca error (2026-09-03, §7)", () => {
  assert.deepEqual(printSummaryFor({ available: false, printerState: "disconnected", isAndroid: true, printStatus: "idle" }), { label: "No disponible", tone: "neutral" });
});

test("printSummaryFor: impresión realizada es éxito", () => {
  assert.deepEqual(printSummaryFor({ available: true, printerState: "connected", isAndroid: true, printStatus: "done" }), { label: "Realizada", tone: "success" });
});

test("printSummaryFor: fallo real de impresión SÍ es error (a diferencia de 'no disponible')", () => {
  assert.deepEqual(printSummaryFor({ available: true, printerState: "connected", isAndroid: true, printStatus: "error" }), { label: "Error", tone: "error" });
});

test("printSummaryFor: disponible pero sin conectar (Android) es neutral, no error", () => {
  const status = printSummaryFor({ available: true, printerState: "disconnected", isAndroid: true, printStatus: "idle" });
  assert.equal(status.tone, "neutral");
});

test("onStatusChange es opcional -- se llama con optional chaining, nunca lanza si no se pasa (retrocompatible con cualquier otro llamador futuro)", () => {
  assert.match(source, /onStatusChange\?\.\(/);
});

test("el mensaje de 'no disponible' usa tono neutral (slate), no de advertencia (amber) -- la impresión ausente no debe leerse como un fallo", () => {
  assert.match(source, /bg-slate-100 p-3 text-xs font-semibold text-slate-600/);
  assert.doesNotMatch(source, /bg-amber-50 p-3 text-xs font-semibold text-amber-800/);
});
