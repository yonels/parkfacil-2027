import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { canSeeDemoConvenios } from "./conveniosAccess.mjs";

test("solo Root ve la demostración de convenios", () => {
  assert.equal(canSeeDemoConvenios({ role: "platform_admin" }), true);
  assert.equal(canSeeDemoConvenios({ role: "company_admin" }), false);
  assert.equal(canSeeDemoConvenios({ role: "operator" }), false);
  assert.equal(canSeeDemoConvenios(null), false);
});

test("la lista y el detalle de Convenios aplican la regla en el servidor", async () => {
  for (const path of ["../app/convenios/page.js", "../app/convenios/[id]/page.js"]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /canSeeDemoConvenios\(context\)/, path);
    assert.match(source, /ConveniosSinDatos/, path);
    assert.doesNotMatch(source, /^"use client"/, path);
  }
});
