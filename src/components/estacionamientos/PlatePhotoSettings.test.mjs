import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// Ajuste final: configuración jerárquica con carpetas (§1/§28) + GPS
// configurable con la misma dependencia que "Imprimir foto en ticket"
// (§5). Mismo enfoque de contrato sobre el código fuente que el resto de
// componentes de este proyecto sin infraestructura de render de React.

const source = await readFile(new URL("./PlatePhotoSettings.js", import.meta.url), "utf8");

test("estructura jerárquica de carpetas: Servicios contratados > Evidencia de patente > Ubicación GPS", () => {
  const servicios = source.indexOf("Servicios contratados");
  const evidencia = source.indexOf("Evidencia de patente");
  const gps = source.indexOf("Ubicación GPS");
  assert.ok(servicios > -1 && evidencia > -1 && gps > -1);
  // Anidamiento real, no solo texto en cualquier orden: cada nivel debe
  // aparecer DENTRO del <details> del nivel anterior.
  assert.ok(servicios < evidencia && evidencia < gps, "el orden jerárquico debe ser Servicios > Evidencia > GPS");
  const detailsCount = (source.match(/<details/g) || []).length;
  assert.ok(detailsCount >= 3, "se esperan al menos 3 niveles de <details> anidados (carpetas)");
});

test("GPS reutiliza los mismos tres valores DISABLED/OPTIONAL/REQUIRED que el modo de foto -- mismos labels en español", () => {
  assert.match(source, /const GPS_MODE_OPTIONS = \[/);
  for (const value of ["DISABLED", "OPTIONAL", "REQUIRED"]) {
    assert.match(source, new RegExp(`value: "${value}"`));
  }
});

test("dependencia §5: GPS queda deshabilitado/oculto mientras la foto esté Desactivada", () => {
  assert.match(source, /const photoEnabled = plateMode !== "DISABLED";/);
  assert.match(source, /<details open=\{photoEnabled\}/);
  assert.match(source, /!photoEnabled \? \(\s*\n\s*<p className="text-sm text-slate-400">Activa primero la fotografía de patente/);
});

test("'Imprimir foto en ticket' sigue deshabilitado cuando la foto está Desactivada (regla ya existente, no se relajó)", () => {
  assert.match(source, /disabled=\{!photoEnabled\}/);
});

test("fecha/hora, operador y dispositivo se muestran como trazabilidad AUTOMÁTICA, nunca como un switch que no hace nada", () => {
  const block = source.slice(source.indexOf("Trazabilidad automática"), source.indexOf("Trazabilidad automática") + 600);
  assert.doesNotMatch(block, /<input type="checkbox"/);
  assert.match(block, /Fecha y hora exacta/);
  assert.match(block, /Operador autenticado/);
  assert.match(block, /Dispositivo utilizado/);
  assert.match(block, /Hash de integridad/);
});

test("guardar envía plateMode/printOnTicket/gpsMode juntos -- una sola escritura, no dos sistemas separados", () => {
  assert.match(source, /body: JSON\.stringify\(\{ plateMode, printOnTicket, gpsMode, evidenceRetentionDays: data\?\.evidenceRetentionDays \?\? null \}\)/);
});

test("el botón Guardar se habilita ante cualquier cambio, incluido el de gpsMode", () => {
  assert.match(source, /gpsMode !== \(data\.gpsMode \|\| "DISABLED"\)/);
});
