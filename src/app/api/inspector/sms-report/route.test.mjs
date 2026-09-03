import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./route.js", import.meta.url), "utf8");
const withoutComments = source.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

// TAREA 10.A/H: el reporte lista, y abrirlo no genera writes.
test("TAREA 10.A: solo exporta GET -- ningún método de escritura", () => {
  assert.match(source, /export async function GET\(/);
  for (const metodo of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.ok(!source.includes(`export async function ${metodo}(`), `no debe exportar ${metodo}`);
  }
});

test("TAREA 10.H: nunca importa funciones de escritura/envío -- solo listInspectorSmsReportRows (lectura)", () => {
  assert.match(source, /import \{ listInspectorSmsReportRows \} from "@\/lib\/inspector\/inspectorRepository";/);
  for (const forbidden of ["registerOnStreetInspection", "sendInspectionSmsIfNeeded", "sendInspectorCopySmsIfNeeded", "persistInspectorSmsDeliveryStatus", "checkInspectorSmsDelivery"]) {
    assert.doesNotMatch(source, new RegExp(forbidden));
  }
});

// --- Alcance RBAC (2026-09-03, agregado tras revisión) ---
test("TAREA A/B: el scope SIEMPRE es 'own' con el userId autenticado -- esta ruta no puede recibir otro rol (portal Inspector, ver contextCore.mjs), así que 'own' es la única opción posible", () => {
  assert.match(source, /const scope = \{ type: "own", inspectorUserId: authorization\.context\.userId \};/);
});

test("TAREA F: no consulta inspectorEmailById (lista completa de inspectores) -- usa directamente authorization.context.email, un Inspector no necesita saber quién más existe", () => {
  assert.doesNotMatch(withoutComments, /inspectorEmailById/);
  assert.match(source, /inspectorEmail: authorization\.context\.email,/);
});

test("exige autorización de Inspector igual que el resto de rutas", () => {
  assert.match(source, /const authorization = await authorizeInspectorRequest\(request\);/);
  assert.match(source, /if \(authorization\.response\) return authorization\.response;/);
});

test("aplica el período (TAREA 6) antes de consultar, y rechaza un período no soportado sin adivinar un rango", () => {
  assert.match(source, /resolveInspectorSmsReportPeriod\(period\)/);
  assert.match(source, /if \(!bounds\) return NextResponse\.json\(\{ error: "Período no válido\." \}, \{ status: 400 \}\);/);
});

test("aplica los filtros (patente/teléfono/estado envío/estado DLR/inspector) sobre las filas ya obtenidas -- filterInspectorSmsReportRows, nunca una query SQL nueva por cada combinación", () => {
  assert.match(source, /filterInspectorSmsReportRows\(mapped,/);
});
