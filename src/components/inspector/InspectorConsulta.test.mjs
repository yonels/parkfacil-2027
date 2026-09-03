import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./InspectorConsulta.js", import.meta.url), "utf8");
const withoutComments = source.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

test("normaliza la patente reutilizando normalizeInspectorPlate, no una regex propia", () => {
  assert.match(source, /import \{ normalizeInspectorPlate \} from "@\/lib\/inspector\/inspectorMocks\.mjs";/);
  assert.match(source, /const normalized = normalizeInspectorPlate\(plateInput\);/);
});

test("el botón CONSULTAR está deshabilitado sin una patente normalizada válida o mientras consulta", () => {
  assert.match(source, /disabled=\{!normalized \|\| busy\}/);
});

test("la cámara es solo un botón preparado visualmente -- sin OCR real todavía", () => {
  assert.match(source, /aria-label="Escanear patente con la cámara \(disponible en una próxima etapa\)"/);
  assert.doesNotMatch(withoutComments, /getUserMedia|MediaDevices|Tesseract|ocr/i);
});

// 2026-09-03, "teclado móvil Inspector corregido": el input de patente debe
// ser explícitamente type="text" (nunca "number", que en Android no
// muestra letras) con inputMode/autoCapitalize/autoCorrect/spellCheck
// correctos, para que el teclado virtual de Android se abra siempre al
// tocarlo (incluso instalado como PWA/WebAPK standalone).
test("el input de patente es explícitamente type=\"text\" (nunca type=\"number\") con atributos de teclado móvil correctos", () => {
  const inputMatch = source.match(/<input\b[\s\S]*?\/>/);
  assert.ok(inputMatch, "debe existir el <input> de patente");
  const inputTag = inputMatch[0];
  assert.match(inputTag, /id="inspector-plate-input"/);
  assert.match(inputTag, /type="text"/);
  assert.doesNotMatch(inputTag, /type="number"/);
  assert.match(inputTag, /inputMode="text"/);
  assert.match(inputTag, /autoCapitalize="characters"/);
  assert.match(inputTag, /autoCorrect="off"/);
  assert.match(inputTag, /spellCheck=\{false\}/);
  assert.doesNotMatch(inputTag, /readOnly/);
  assert.doesNotMatch(inputTag, /disabled/);
});

test("cada fila de últimas consultas reutiliza el mismo InspectorStatusBadge, no un color propio", () => {
  assert.match(source, /import InspectorStatusBadge from "\.\/InspectorStatusBadge";/);
  assert.match(source, /<InspectorStatusBadge status=\{entry\.status\}/);
});
