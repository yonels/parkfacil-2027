import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Paginación REAL server-side (§ corrección "eliminar límite de 1000"
// 2026-08-28): listOnStreetSessionsPage/listOnStreetPaymentsPage viven en
// onStreetAdminRepository.js ("server-only", no importable directo -- ver
// el resto de esta suite). La prueba de VOLUMEN real (>10.500 filas
// reales) vive en scripts/local-on-street-volume-e2e.mjs, ejecutada contra
// Supabase local. Aquí se verifica por fuente que la implementación
// realmente usa .range()+count -- nunca .limit(1000) ni un fetch completo
// a memoria -- para las dos rutas que ahora sirven Sesiones/Pagos.

const source = await readFile(new URL("./onStreetAdminRepository.js", import.meta.url), "utf8");

test("listOnStreetSessionsPage: pide COUNT+.range() a Postgres, nunca .limit(1000) -- la paginación es real, no en memoria", () => {
  const start = source.indexOf("export async function listOnStreetSessionsPage");
  const end = source.indexOf("\n}", start) + 2;
  const fn = source.slice(start, end);
  assert.match(fn, /\{count:"exact"\}/);
  assert.match(fn, /\.range\(offset,offset\+pageSize-1\)/);
  assert.doesNotMatch(fn, /\.limit\(1000\)/, "no debe traer hasta 1000 filas a memoria para paginar ahí");
});

test("listOnStreetPaymentsPage: usa el join embebido real (on_street_payment_intents!inner) + COUNT+.range(), nunca trae todos los intents/transacciones a Node para cruzarlos en JS", () => {
  const start = source.indexOf("export async function listOnStreetPaymentsPage");
  const end = source.indexOf("\n}", start) + 2;
  const fn = source.slice(start, end);
  assert.match(fn, /on_street_payment_intents!inner\(id,public_token,parking_id,qr_location_id,resulting_session_id,operation_type\)/);
  assert.match(fn, /\{count:"exact"\}/);
  assert.match(fn, /\.range\(offset,offset\+pageSize-1\)/);
  assert.doesNotMatch(fn, /\.limit\(1000\)/);
});

test("El join de Pagos filtra por la columna embebida (on_street_payment_intents.parking_id), nunca precarga TODOS los intents del alcance para cruzar en JS", () => {
  const start = source.indexOf("export async function listOnStreetPaymentsPage");
  const end = source.indexOf("\n}", start) + 2;
  const fn = source.slice(start, end);
  assert.match(fn, /\.in\("on_street_payment_intents\.parking_id",scopedIds0\)/);
});

test("Filtro de Área/Calle/Tramo: se resuelve a un conjunto acotado de qr_location_id (infraestructura física, nunca volumen transaccional) antes del .range()", () => {
  assert.match(source, /async function qrLocationIdsForHierarchyFilter\(db,parkingIds,filters\)/);
  assert.match(source, /\.in\("qr_location_id",qrLocationIds\)/);
  assert.match(source, /\.in\("on_street_payment_intents\.qr_location_id",qrLocationIds\)/);
});

test("Filtro de Estado 'EXPIRED' incluye AMBOS casos reales (status persistido EXPIRED, y ACTIVE con expires_at ya vencido) -- coherente con visibleOnStreetStatus, nunca subestima el conteo", () => {
  assert.match(source, /function applySessionStatusFilter\(query,status\)/);
  assert.match(source, /status\.eq\.EXPIRED,and\(status\.eq\.ACTIVE,expires_at\.lte\.\$\{nowIso\}\)/);
});

test("Fecha financiera de Pagos (§4 de la corrección): COMMITTED se filtra por committed_at, el resto por created_at -- nunca todo por created_at", () => {
  const start = source.indexOf("export async function listOnStreetPaymentsPage");
  const end = source.indexOf("\n}", start) + 2;
  const fn = source.slice(start, end);
  assert.match(fn, /and\(status\.eq\.COMMITTED,committed_at\.gte\.\$\{bounds\[0\]\},committed_at\.lte\.\$\{bounds\[1\]\}\)/);
  assert.match(fn, /and\(status\.neq\.COMMITTED,created_at\.gte\.\$\{bounds\[0\]\},created_at\.lte\.\$\{bounds\[1\]\}\)/);
});

test("Patente en Pagos: se resuelve primero a un conjunto acotado de session_id (coincidencias de una búsqueda de patente, nunca miles) -- nunca trae el universo completo para cruzar en JS", () => {
  const start = source.indexOf("export async function listOnStreetPaymentsPage");
  const end = source.indexOf("\n}", start) + 2;
  const fn = source.slice(start, end);
  assert.match(fn, /sessionIdsForPlate=\(r\.data\|\|\[\]\)\.map\(x=>x\.id\)/);
  assert.match(fn, /\.in\("on_street_payment_intents\.resulting_session_id",sessionIdsForPlate\)/);
});

test("/api/on-street-qr/sessions y /payments: repuntan a las funciones paginadas reales, ya no a listOnStreetSessions/listOnStreetPayments (que siguen existiendo, pero solo para sus otros consumidores internos)", async () => {
  const sessionsRoute = await readFile(new URL("../app/api/on-street-qr/sessions/route.js", import.meta.url), "utf8");
  const paymentsRoute = await readFile(new URL("../app/api/on-street-qr/payments/route.js", import.meta.url), "utf8");
  assert.match(sessionsRoute, /listOnStreetSessionsPage/);
  assert.match(paymentsRoute, /listOnStreetPaymentsPage/);
});

test("El aviso de truncamiento por 1000 ya no existe en OnStreetWorkspace -- la paginación real lo volvió engañoso", async () => {
  const src = await readFile(new URL("../components/on-street-admin/OnStreetWorkspace.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /Se alcanzó el máximo de 1\.000 registros/);
  assert.doesNotMatch(src, /const truncado=/);
});
