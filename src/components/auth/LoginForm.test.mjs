import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// LoginForm.js es "use client" con hooks de React -- no se monta bajo
// `node --test` sin un DOM (mismo criterio que el resto de componentes
// cliente de este repo, ver InstallPrompt.test.mjs). Se prueba por
// contrato sobre el código fuente.
async function readSource(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

// "compactMobile" (2026-09-02, "login mobile optimizado"): opt-in, default
// false -- verifica que ningún llamador existente (Root/POS/Cliente) la
// pase, así que sus 3 pantallas quedan con el mismo markup de siempre.
test("compactMobile es opt-in con default false", async () => {
  const source = await readSource("./LoginForm.js");
  assert.match(source, /compactMobile\s*=\s*false/);
});

test("cuando compactMobile es false, las clases del form son exactamente las de antes (mt-8 space-y-5) -- cero diff para Root/POS/Cliente", async () => {
  const source = await readSource("./LoginForm.js");
  assert.match(source, /compactMobile \? "mt-5 space-y-3\.5 md:mt-8 md:space-y-5" : "mt-8 space-y-5"/);
});

test("ningún login que no sea Inspector pasa compactMobile", async () => {
  const rootLogin = await readSource("../../app/login/page.js");
  const posLogin = await readSource("../../app/pos/login/page.js");
  assert.doesNotMatch(rootLogin, /compactMobile/);
  assert.doesNotMatch(posLogin, /compactMobile/);
});

test("/inspector/login SÍ pasa compactMobile a LoginForm", async () => {
  const inspectorLogin = await readSource("../../app/inspector/login/page.js");
  assert.match(inspectorLogin, /<LoginForm[\s\S]*?compactMobile/);
});
