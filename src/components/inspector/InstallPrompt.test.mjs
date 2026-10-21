import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// InstallPrompt.js es "use client" con hooks de React (useEffect/useState) --
// no se monta bajo `node --test` sin un DOM (el proyecto no trae jsdom/
// testing-library, ver LoginForm/route.test.mjs para el mismo criterio de
// probar por contrato sobre el código fuente).
async function readSource() {
  return readFile(new URL("./InstallPrompt.js", import.meta.url), "utf8");
}

test("no se monta nunca si la PWA ya corre en modo standalone (Android/Chrome y iOS Safari)", async () => {
  const source = await readSource();
  assert.match(source, /display-mode:\s*standalone/);
  assert.match(source, /navigator\.standalone/);
});

test("previene el mini-infobar nativo (preventDefault) y ofrece el propio botón en su lugar", async () => {
  const source = await readSource();
  assert.match(source, /beforeinstallprompt/);
  assert.match(source, /event\.preventDefault\(\)/);
});

test("recuerda el descarte del aviso en localStorage, sin guardar ningún otro dato (nunca patentes/fiscalizaciones/sesión)", async () => {
  const source = await readSource();
  assert.match(source, /localStorage\.(get|set)Item\(DISMISS_KEY/);
  assert.doesNotMatch(source, /localStorage\.setItem\((?!DISMISS_KEY)/);
});

test("ofrece instrucción manual para iOS (nunca dispara beforeinstallprompt ahí)", async () => {
  const source = await readSource();
  assert.match(source, /Compartir/);
  assert.match(source, /iphone|ipad|ipod/i);
});
