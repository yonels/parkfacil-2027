import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// QA 2026-10-19 (SOL-2026-10-19-002): el filtro por columna de las planillas
// heredaba el blanco del encabezado y el texto escrito no se veía.
test("inputs inside table headers use dark text, not the white header color", () => {
  const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
  assert.match(css, /table thead th \{[^}]*color: #ffffff !important;/);
  assert.match(css, /table thead input, table thead select, table thead textarea \{ color: #041e42; \}/);
});
