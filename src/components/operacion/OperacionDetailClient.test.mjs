import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// Ajuste final, §16/§17: se muestra la trazabilidad de la evidencia
// (fecha/hora exacta, GPS, dispositivo, tipo, hash) solo cuando existe --
// nunca se inventa un valor para evidencia histórica sin esos campos
// (§27). El operador NO se duplica acá: se reutiliza el mismo
// detail.entry.operator que ya muestra esta pantalla para el ENTRY.

const source = await readFile(new URL("./OperacionDetailClient.js", import.meta.url), "utf8");

test("formatCapturedAt/formatCoordinate devuelven null ante datos ausentes -- nunca fabrican un valor", () => {
  assert.match(source, /function formatCapturedAt\(value\) \{\s*\n\s*if \(!value\) return null;/);
  assert.match(source, /function formatCoordinate\(value\) \{\s*\n\s*return typeof value === "number" \? value\.toFixed\(6\) : null;/);
});

test("cada campo de trazabilidad solo se renderiza si el dato existe (histórico sin GPS/hash no rompe ni muestra '0, 0')", () => {
  assert.match(source, /\{formatCapturedAt\(platePhoto\.capturedAt\) \? \(/);
  assert.match(source, /\{formatCoordinate\(platePhoto\.latitude\) && formatCoordinate\(platePhoto\.longitude\) \? \(/);
  assert.match(source, /\{platePhoto\.sha256 \? \(/);
});

test("el operador NO se duplica en el bloque de evidencia -- se reutiliza detail.entry.operator ya mostrado en esta misma pantalla", () => {
  const blockStart = source.indexOf("{platePhoto ? (");
  const blockEnd = source.indexOf(") : null}", blockStart);
  const block = source.slice(blockStart, blockEnd);
  assert.doesNotMatch(block, /operatorId|operatorName/);
  assert.match(source, /<Field label="Operador" value=\{detail\.entry\.operator\} \/>/);
});

test("evidenceType por defecto se muestra como 'Fotografía real' -- nunca aparece un PLATE_RENDERED inexistente como si fuera real", () => {
  assert.match(source, /const EVIDENCE_TYPE_LABELS = \{ PHOTO_CAPTURED: "Fotografía real", PLATE_RENDERED: "Representación gráfica" \};/);
});
