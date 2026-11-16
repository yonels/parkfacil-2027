// SOL-2026-11-16-003: la copia SMS al inspector usaba el teléfono tal como se
// escribió en el Catálogo («+56 9… » con espacio) y el proveedor la rechazaba.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { normalizeChileanMobile } from "../onStreetPilot.mjs";

test("los formatos que guarda el Catálogo se normalizan a +569XXXXXXXX", () => {
  for (const typed of ["+56 966514044", "+56 9 6651 4044", "966514044", "56966514044", "+56966514044", "9 6651-4044"]) {
    assert.equal(normalizeChileanMobile(typed), "+56966514044", typed);
  }
  for (const invalid of ["", null, "12345", "+1 202 555 0100", "Sin teléfono informado"]) {
    assert.equal(normalizeChileanMobile(invalid), null, String(invalid));
  }
});

test("la copia al inspector envía el teléfono normalizado, nunca el texto crudo", async () => {
  const source = await readFile(new URL("./inspectorInspectionService.js", import.meta.url), "utf8");
  const fn = source.slice(source.indexOf("export async function getInspectorPhone"), source.indexOf("\n}", source.indexOf("export async function getInspectorPhone")));
  assert.match(fn, /return normalizeChileanMobile\(data\.user\.user_metadata\?\.phone\);/);
});
