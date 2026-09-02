import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// route.js importa NextResponse ("next/server"), que no resuelve bajo
// node --test sin el loader de Next -- mismo criterio que el resto de rutas
// server-only de este repo: se verifica por contrato sobre el código
// fuente en vez de ejecutar el handler.
const source = await readFile(new URL("./route.js", import.meta.url), "utf8");

test("manifest de Inspectores: standalone, propio (start_url/scope /inspector, no pisa el de POS)", () => {
  assert.match(source, /start_url: "\/inspector"/);
  assert.match(source, /scope: "\/inspector"/);
  assert.match(source, /display: "standalone"/);
  assert.match(source, /theme_color: "#041E42"/);
  assert.doesNotMatch(source, /name: "ParkFacil POS"/);
});

// 2026-09-02, PWA instalable: name/short_name alineados con /inspector/login
// ("ParkFacil Inspector", singular) -- ver page.test.mjs del login.
test("name/short_name son 'ParkFacil Inspector' / 'Inspector' (singular, igual que /inspector/login)", () => {
  assert.match(source, /name: "ParkFacil Inspector"/);
  assert.match(source, /short_name: "Inspector"/);
});

test("incluye iconos SVG y PNG 192/512, con al menos uno maskable -- compatibilidad iOS/Android", () => {
  assert.match(source, /sizes: "192x192"/);
  assert.match(source, /sizes: "512x512"/);
  assert.match(source, /purpose: "maskable"/);
});
