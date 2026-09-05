import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// Defecto real encontrado en la validación Fase 5 (§13 Recaudación): el CSV
// de /recaudacion armaba cada celda citándola directamente
// (`"${String(value)...}"`) sin pasar por sanitizeCsvCell -- a diferencia de
// Reportes Off Street, que sí protege contra CSV injection (una celda como
// patente/operador/turno que empiece con =,+,-,@ se interpreta como fórmula
// en Excel/Sheets). Mismo enfoque que el resto de contratos de este repo
// (ver PosTerminal.printAgent.test.mjs): se verifica sobre el código fuente
// en vez de extraer rowsToCsv (función local del componente cliente).
const pageSource = await readFile(new URL("./page.js", import.meta.url), "utf8");

test("recaudacion/page.js importa sanitizeCsvCell del módulo central de protección CSV", () => {
  assert.match(pageSource, /import\s*\{\s*sanitizeCsvCell\s*\}\s*from\s*"@\/lib\/offStreetReportsCore\.mjs"/);
});

test("rowsToCsv aplica sanitizeCsvCell a cada valor antes de citarlo (no vuelve a la regresión de citar el valor crudo)", () => {
  const inicio = pageSource.indexOf("function rowsToCsv(");
  const fin = pageSource.indexOf("function downloadCsv(");
  assert.ok(inicio > -1 && fin > inicio, "no se encontró rowsToCsv en el archivo");
  const cuerpo = pageSource.slice(inicio, fin);
  assert.match(cuerpo, /sanitizeCsvCell\(value\)/);
  assert.doesNotMatch(cuerpo, /`"\$\{String\(value/, "regresión: volvió a citar el valor crudo sin sanitizeCsvCell");
});
