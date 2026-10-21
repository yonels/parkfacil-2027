import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// Ajuste final (evidencia de patente configurable por proyecto + GPS +
// metadatos de trazabilidad, §16-§20 del encargo). Mismo enfoque que el
// resto de tests de rutas de este proyecto: contrato sobre el código
// fuente, sin infraestructura de Supabase real. La lógica pura de decisión
// (canCompleteEvidenceGps/gpsRequirementMessage) ya está cubierta en
// offStreetPlatePhoto.test.mjs -- aquí solo se confirma que la ruta la usa
// en el punto correcto, no una copia paralela.

const source = await readFile(new URL("./route.js", import.meta.url), "utf8");

test("GET expone gpsMode en platePhotoSettings (el POS necesita saber si debe pedir ubicación)", () => {
  assert.match(source, /platePhotoSettings: \{ mode: platePhotoSettings\.plateMode, printOnTicket: platePhotoSettings\.printOnTicket, gpsMode: platePhotoSettings\.gpsMode \}/);
});

test("los fallbacks de 'migración/tabla pendiente' incluyen gpsMode DISABLED -- nunca queda undefined", () => {
  const occurrences = source.match(/\.catch\(\(\) => \(\{ plateMode: "DISABLED", printOnTicket: false, gpsMode: "DISABLED" \}\)\)/g) || [];
  assert.equal(occurrences.length, 2);
});

test("el gate de GPS reutiliza canCompleteEvidenceGps/gpsRequirementMessage -- no una copia paralela de la regla", () => {
  assert.match(
    source,
    /import\s*\{[^}]*canCompleteEvidenceGps[^}]*gpsRequirementMessage[^}]*\}\s*from\s*"@\/lib\/offStreet\/offStreetPlatePhoto\.mjs"/
  );
  assert.match(source, /if \(!canCompleteEvidenceGps\(platePhotoSettings\.gpsMode, hasValidGps\)\) \{/);
});

test("el gate de GPS solo se evalúa cuando efectivamente hay una foto para asociar (nunca si no hay evidencia)", () => {
  assert.match(
    source,
    /if \(decodedPhoto && !decodedPhoto\.discard\) \{\s*\n\s*const hasValidGps = gpsInput\.latitude !== null && gpsInput\.longitude !== null;\s*\n\s*if \(!canCompleteEvidenceGps/
  );
});

test("el gate de GPS se evalúa ANTES de subir el archivo -- nunca se sube nada que de todas formas no va a quedar completo", () => {
  const gpsGateIndex = source.indexOf("if (!canCompleteEvidenceGps(platePhotoSettings.gpsMode, hasValidGps))");
  const uploadIndex = source.indexOf("uploadedPhoto = await uploadPlateEntryPhoto(");
  assert.ok(gpsGateIndex > -1 && uploadIndex > -1);
  assert.ok(gpsGateIndex < uploadIndex);
});

test("linkPlateEntryPhoto recibe sha256/capturedAt/GPS/deviceInfo -- toda la trazabilidad pedida en §16", () => {
  const callStart = source.indexOf("await linkPlateEntryPhoto(current.db, {");
  const callEnd = source.indexOf("});", callStart);
  const call = source.slice(callStart, callEnd);
  for (const field of ["sha256: uploadedPhoto.sha256", "capturedAt: sanitizeCapturedAt(input.platePhotoCapturedAt)", "latitude: gpsInput.latitude", "longitude: gpsInput.longitude", "gpsAccuracyM: gpsInput.accuracy", "deviceInfo: sanitizeDeviceInfo(input.deviceInfo)"]) {
    assert.ok(call.includes(field), `falta ${field} en la llamada a linkPlateEntryPhoto`);
  }
});

test("decodePlateGpsInput/toFiniteOrNull nunca tratan ausencia como (0, 0) -- mismo bug ya corregido una vez en este proyecto (numeroSeguro)", () => {
  assert.match(source, /function toFiniteOrNull\(value\) \{\s*\n\s*if \(value === null \|\| value === undefined \|\| value === ""\) return null;/);
});

test("sanitizeDeviceInfo descarta campos fuera de lo esperado -- no se recolectan identificadores innecesarios (§20)", () => {
  const fnStart = source.indexOf("function sanitizeDeviceInfo(value) {");
  const fnEnd = source.indexOf("\n}\n", fnStart);
  const fn = source.slice(fnStart, fnEnd);
  assert.match(fn, /platform/);
  assert.match(fn, /manufacturer/);
  assert.match(fn, /model/);
  assert.match(fn, /appVersion/);
});
