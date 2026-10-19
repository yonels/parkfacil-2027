import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { PLATE_PHOTO_STATUS, canCompleteEntry, platePhotoUnavailableMessage, resolvePlatePhotoStatus } from "./offStreetPlatePhoto.mjs";
import { getPlatePhotoSettings } from "./offStreetPlatePhotoSettingsRepository.js";

// SOL-2026-10-11-001 — incidencia "restaurar la opción de fotografiar la
// patente". La opción depende de la configuración POR ESTACIONAMIENTO; con el
// selector de estacionamiento el operador puede quedar en uno sin configurar.
// Estas pruebas fijan que la regla NO cambió (sin fila = sin fotografía) y que
// el motivo ahora es visible.

const terminalSource = await readFile(new URL("../../components/pos/PosTerminal.js", import.meta.url), "utf8");
const staysRouteSource = await readFile(new URL("../../app/api/pos/stays/route.js", import.meta.url), "utf8");
const dataEntrySource = await readFile(new URL("../../app/api/data-entry/route.js", import.meta.url), "utf8");

function fakeDb(row, error = null) {
  return { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error }) }) }) }) };
}

test("estado: habilitada, desactivada, sin configurar y no disponible", () => {
  assert.equal(resolvePlatePhotoStatus({ mode: "OPTIONAL", configured: true }), PLATE_PHOTO_STATUS.ENABLED);
  assert.equal(resolvePlatePhotoStatus({ mode: "REQUIRED", configured: true }), PLATE_PHOTO_STATUS.ENABLED);
  assert.equal(resolvePlatePhotoStatus({ mode: "DISABLED", configured: true }), PLATE_PHOTO_STATUS.DISABLED);
  assert.equal(resolvePlatePhotoStatus({ mode: "DISABLED", configured: false }), PLATE_PHOTO_STATUS.NOT_CONFIGURED);
  assert.equal(resolvePlatePhotoStatus({ mode: "DISABLED" }), PLATE_PHOTO_STATUS.NOT_CONFIGURED);
  assert.equal(resolvePlatePhotoStatus(), PLATE_PHOTO_STATUS.NOT_CONFIGURED);
  // Un error de lectura nunca se informa como "desactivada" ni como "habilitada".
  assert.equal(resolvePlatePhotoStatus({ mode: "DISABLED", configured: false, readFailed: true }), PLATE_PHOTO_STATUS.UNAVAILABLE);
  assert.equal(resolvePlatePhotoStatus({ mode: "REQUIRED", configured: true, readFailed: true }), PLATE_PHOTO_STATUS.UNAVAILABLE);
  // Un modo desconocido nunca habilita la fotografía.
  assert.equal(resolvePlatePhotoStatus({ mode: "SIEMPRE", configured: true }), PLATE_PHOTO_STATUS.DISABLED);
});

test("mensaje al operador: explica por qué no aparece la opción; nada cuando está habilitada o el servidor no informa", () => {
  assert.match(platePhotoUnavailableMessage(PLATE_PHOTO_STATUS.NOT_CONFIGURED), /sin configurar en este estacionamiento/);
  assert.match(platePhotoUnavailableMessage(PLATE_PHOTO_STATUS.NOT_CONFIGURED), /administrador/);
  assert.match(platePhotoUnavailableMessage(PLATE_PHOTO_STATUS.DISABLED), /desactivada en este estacionamiento/);
  assert.match(platePhotoUnavailableMessage(PLATE_PHOTO_STATUS.UNAVAILABLE), /No fue posible leer la configuración/);
  for (const none of [PLATE_PHOTO_STATUS.ENABLED, null, undefined, "", "OTRO"]) assert.equal(platePhotoUnavailableMessage(none), null);
});

test("repositorio: distingue 'sin fila' de 'desactivada', sin cambiar la regla (sin fila = DISABLED)", async () => {
  const none = await getPlatePhotoSettings(fakeDb(null), "parking-1");
  assert.deepEqual([none.plateMode, none.printOnTicket, none.gpsMode, none.configured], ["DISABLED", false, "DISABLED", false]);
  const disabled = await getPlatePhotoSettings(fakeDb({ parking_id: "parking-1", plate_photo_mode: "DISABLED", print_plate_photo_on_ticket: false, gps_mode: "DISABLED" }), "parking-1");
  assert.deepEqual([disabled.plateMode, disabled.configured], ["DISABLED", true]);
  const optional = await getPlatePhotoSettings(fakeDb({ parking_id: "parking-1", plate_photo_mode: "OPTIONAL", print_plate_photo_on_ticket: true, gps_mode: "OPTIONAL" }), "parking-1");
  assert.deepEqual([optional.plateMode, optional.printOnTicket, optional.gpsMode, optional.configured], ["OPTIONAL", true, "OPTIONAL", true]);
  assert.equal((await getPlatePhotoSettings(fakeDb(null), null)).configured, false);
  // La regla de ingreso no cambia: sin fotografía se puede ingresar salvo en REQUIRED.
  assert.equal(canCompleteEntry(none.plateMode, false), true);
  assert.equal(canCompleteEntry("REQUIRED", false), false);
  assert.equal(canCompleteEntry("OPTIONAL", false), true);
  // Un error de lectura se propaga (lo decide quien llama), no se disfraza de "sin fila".
  await assert.rejects(() => getPlatePhotoSettings(fakeDb(null, { code: "XX000", message: "fallo" }), "parking-1"));
});

test("servidor: /api/pos/stays informa el estado del estacionamiento ACTIVO y ya no oculta un error de lectura", () => {
  // Configuración del estacionamiento resuelto para el turno, nunca de otro.
  assert.match(staysRouteSource, /getPlatePhotoSettings\(authorization\.db, parking\.id\)\.catch\(\(error\) => \{/);
  assert.match(staysRouteSource, /console\.error\("\[pos:stays\] plate photo settings"/);
  assert.match(staysRouteSource, /return \{ \.\.\.PLATE_PHOTO_DISABLED, readFailed: true \};/);
  assert.match(staysRouteSource, /status: resolvePlatePhotoStatus\(\{ mode: platePhotoSettings\.plateMode, configured: platePhotoSettings\.configured === true, readFailed: platePhotoSettings\.readFailed === true \}\),/);
  // El modo que se entrega sigue saliendo de la configuración: no se fuerza.
  assert.match(staysRouteSource, /mode: platePhotoSettings\.plateMode,/);
  assert.doesNotMatch(staysRouteSource, /mode: "OPTIONAL"|mode: "REQUIRED"/);
  // La regla del ingreso en el servidor no se tocó.
  assert.match(dataEntrySource, /if \(!canCompleteEntry\(platePhotoSettings\.plateMode, Boolean\(decodedPhoto\)\)\) \{/);
});

test("POS: la opción 'Tomar foto' sigue dependiendo del modo; cuando no está disponible se explica el motivo", () => {
  // Misma condición y mismo lugar que antes (paso Patente del ingreso).
  const step = terminalSource.slice(terminalSource.indexOf('{/* "Tomar foto": foto de evidencia con el marco de patente'), terminalSource.indexOf('{voiceState === "LISTENING" ? ('));
  assert.match(step, /\{platePhotoMode !== "DISABLED" \? \(/);
  assert.match(step, /\{entryPhoto \? "Repetir foto" : "Tomar foto"\}/);
  assert.match(step, /\) : platePhotoUnavailableMessage\(platePhotoStatus\) \? \(/);
  assert.match(step, /<p role="note"[^>]*>\s*\n\s*\{platePhotoUnavailableMessage\(platePhotoStatus\)\}/);
  // Con una API anterior (sin `status`) el POS no afirma nada: queda como antes.
  assert.match(step, /\) : <span \/>\}/);
  // El estado se carga junto con el modo, del mismo estacionamiento activo.
  assert.match(terminalSource, /setPlatePhotoMode\(photoSettings\?\.mode \|\| "DISABLED"\);\s*\n\s*setPlatePhotoStatus\(photoSettings\?\.status \|\| null\);/);
  // El estado es solo informativo: ninguna decisión del ingreso lo usa.
  const uses = terminalSource.match(/platePhotoStatus/g) || [];
  assert.equal(uses.length, 3, "declaración + dos usos en el aviso (el set usa otro identificador)");
  assert.doesNotMatch(terminalSource, /platePhotoStatus === |platePhotoStatus !== /);
});

test("POS: una captura tardía no puede adjuntarse al vehículo siguiente; el doble toque no duplica el ingreso", () => {
  // Al registrar el ingreso se limpia la foto y se cierra la cámara de evidencia
  // (el componente se desmonta y ya no entrega nada: ver PlatePhotoCapture.test.mjs).
  const submit = terminalSource.slice(terminalSource.indexOf("const capturedPhotoBase64 = entryPhoto?.base64 || null;"), terminalSource.indexOf("setVehiclesInside((current) => current + 1);"));
  assert.match(submit, /setEntryPhoto\(null\);[\s\S]{0,260}setPhotoCaptureOpen\(false\);\s*\n\s*setEntryPlate\(""\);/);
  // Abrir y cerrar el formulario de ingreso también limpian foto y cámara.
  for (const fn of ["function openEntryForm() {", "function closeEntryForm() {"]) {
    const body = terminalSource.slice(terminalSource.indexOf(fn), terminalSource.indexOf("\n  }\n", terminalSource.indexOf(fn)));
    assert.match(body, /setEntryPhoto\(null\);/, fn);
    assert.match(body, /setPhotoCaptureOpen\(false\);/, fn);
  }
  // Cancelar la cámara no toca la patente digitada ni la foto ya elegida.
  assert.match(terminalSource, /onCapture=\{capturedPlatePhoto\}\s*\n\s*onCancel=\{\(\) => setPhotoCaptureOpen\(false\)\}/);
  // Guarda síncrona contra doble toque al registrar (sin cambios).
  assert.match(terminalSource, /if \(entrySubmitLockRef\.current\) return;/);
  assert.match(terminalSource, /entrySubmitLockRef\.current = true;/);
});
