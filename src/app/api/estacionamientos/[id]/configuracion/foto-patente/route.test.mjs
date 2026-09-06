import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// Ajuste final: GPS configurable expuesto en la configuración administrable
// (§1/§4/§18/§19 del encargo). RBAC intacto (§29): lectura con
// PARKINGS_READ, escritura con PARKINGS_MANAGE -- sin relajar nada.

const source = await readFile(new URL("./route.js", import.meta.url), "utf8");

test("GET/PUT siguen exigiendo PARKINGS_READ/PARKINGS_MANAGE -- RBAC intacto", () => {
  assert.match(source, /authorizeParkingRequest\(request, id, PERMISSIONS\.PARKINGS_READ\)/);
  assert.match(source, /authorizeParkingRequest\(request, id, PERMISSIONS\.PARKINGS_MANAGE\)/);
});

test("GET/PUT exponen gpsMode y el catálogo GPS_MODES, mismo criterio que PLATE_PHOTO_MODES", () => {
  assert.match(source, /import\s*\{\s*GPS_MODES,\s*PLATE_PHOTO_MODES\s*\}\s*from\s*"@\/lib\/offStreet\/offStreetPlatePhoto\.mjs"/);
  const occurrences = source.match(/modes: PLATE_PHOTO_MODES, gpsModes: GPS_MODES/g) || [];
  assert.equal(occurrences.length, 2, "GET y PUT deben exponer ambos catálogos");
});

test("PUT reenvía gpsMode al repositorio -- la dependencia con plateMode se resuelve ahí, no acá (sin duplicar la regla)", () => {
  assert.match(source, /gpsMode: input\.gpsMode,/);
});
