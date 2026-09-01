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

test("cada fila de últimas consultas reutiliza el mismo InspectorStatusBadge, no un color propio", () => {
  assert.match(source, /import InspectorStatusBadge from "\.\/InspectorStatusBadge";/);
  assert.match(source, /<InspectorStatusBadge status=\{entry\.status\}/);
});
