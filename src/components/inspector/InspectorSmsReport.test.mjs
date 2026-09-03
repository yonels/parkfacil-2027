import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./InspectorSmsReport.js", import.meta.url), "utf8");

// 2026-09-03, alcance RBAC: apiBase/portalHeaders/canFilterByInspector son
// props (con default = portal Inspector, alcance "own") en vez de
// constantes fijas -- así el mismo componente sirve, sin duplicarse, para
// una futura pantalla admin (que pasaría apiBase="/api/on-street-qr/
// inspector-sms-report", portalHeaders del portal admin correspondiente, y
// canFilterByInspector=true) -- ver informe: esa pantalla admin todavía NO
// está construida, solo el backend (rutas ya con RBAC completo).
test("TAREA 10.A: por defecto carga desde /api/inspector/sms-report (GET) con el header de portal Inspector, nunca simulado", () => {
  assert.match(source, /apiBase = "\/api\/inspector\/sms-report"/);
  assert.match(source, /portalHeaders = \{ "x-parkfacil-portal": "inspector" \}/);
  assert.match(source, /fetch\(`\$\{apiBase\}\?\$\{qs\.toString\(\)\}`, \{ headers: portalHeaders, cache: "no-store" \}\)/);
});

test("TAREA 10.B: el teléfono SIEMPRE se enmascara con maskInspectorPhone antes de mostrarse -- el componente nunca imprime row.phone crudo", () => {
  assert.match(source, /import \{[\s\S]{0,120}maskInspectorPhone,[\s\S]{0,120}\} from "@\/lib\/inspector\/inspectorSmsReportCore\.mjs";/);
  assert.match(source, /maskInspectorPhone\(row\.phone\)/);
  assert.doesNotMatch(source, /\{row\.phone\}/, "nunca debe interpolar row.phone directamente sin enmascarar");
});

test("TAREA 10.C: filtros (patente/teléfono/estado envío/estado DLR) y períodos (hoy/7d/30d) están cableados al fetch", () => {
  assert.match(source, /INSPECTOR_SMS_REPORT_PERIODS\.map/);
  assert.match(source, /const params = \{ period, plate, phone, sendStatus, deliveryStatus \};/);
});

// TAREA F (alcance RBAC, 2026-09-03): el filtro "Inspector" solo existe
// cuando canFilterByInspector===true -- en el portal Inspector (default
// false) nunca se renderiza, porque un Inspector solo ve sus propias
// filas y filtrar por sí mismo no aporta nada.
test("TAREA F: el filtro 'Inspector' se renderiza SOLO condicionado a canFilterByInspector -- oculto por defecto (portal Inspector)", () => {
  assert.match(source, /canFilterByInspector = false,/);
  assert.match(source, /\{canFilterByInspector \? \(\s*<input value=\{inspector\}/);
  assert.match(source, /if \(canFilterByInspector\) params\.inspector = inspector;/);
});

test("TAREA 8: 'Actualizar estado' llama a POST \\{apiBase\\}/:id/dlr, nunca a un endpoint de envío", () => {
  assert.match(source, /fetch\(`\$\{apiBase\}\/\$\{encodeURIComponent\(id\)\}\/dlr`, \{ method: "POST", headers: portalHeaders \}\)/);
  assert.doesNotMatch(source, /\/api\/inspector\/inspections["'`]/, "no debe llamar al endpoint de registrar fiscalización");
});

test("'Actualizar pendientes' llama a POST \\{apiBase\\}/dlr-pending", () => {
  assert.match(source, /fetch\(`\$\{apiBase\}\/dlr-pending`, \{ method: "POST", headers: portalHeaders \}\)/);
});

test("TAREA 9: el detalle expandido muestra la copia inspector por separado (inspectorCopySmsShortStatus), nunca mezclada con el SMS conductor", () => {
  assert.match(source, /import \{ inspectorCopySmsShortStatus \} from "@\/lib\/inspector\/inspectorSmsStatusMessage\.mjs";/);
  assert.match(source, /Copia inspector/);
  assert.match(source, /inspectorCopySmsShortStatus\(row\)/);
});

test("TAREA 10.J: este archivo nunca importa CourtesyTicketPrint/printerAdapter -- el reporte SMS no toca impresión, sigue siendo un camino completamente independiente", () => {
  assert.doesNotMatch(source, /CourtesyTicketPrint|printerAdapter/);
});
