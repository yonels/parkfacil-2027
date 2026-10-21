import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./InspectorApp.js", import.meta.url), "utf8");
const withoutComments = source.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

test("la sesión se obtiene siempre de la API real (/api/auth/session), nunca de un almacenamiento local propio", () => {
  assert.match(source, /fetch\("\/api\/auth\/session", \{ headers: PORTAL_HEADERS, cache: "no-store" \}\)/);
  assert.doesNotMatch(withoutComments, /sessionStorage/);
  assert.doesNotMatch(withoutComments, /inspectorAuth\.mjs|INSPECTOR_SESSION_STORAGE_KEY|validateInspectorCredentials/);
});

test("toda llamada de lectura a la API de Inspectores envía x-parkfacil-portal: inspector -- mismo criterio que Terminal para /pos", () => {
  assert.match(source, /const PORTAL_HEADERS = \{ "x-parkfacil-portal": "inspector" \};/);
  // GET a sesión/patentes/fiscalizaciones: las 3 deben portar el header de
  // portal. El DELETE de logout no necesita portal (solo limpia la cookie,
  // sin lógica por portal en /api/auth/session).
  assert.match(source, /fetch\("\/api\/auth\/session", \{ headers: PORTAL_HEADERS, cache: "no-store" \}\)/);
  assert.match(source, /fetch\(`\/api\/inspector\/plates\/\$\{encodeURIComponent\(plate\)\}`, \{ headers: PORTAL_HEADERS, cache: "no-store" \}\)/);
  assert.match(source, /fetch\("\/api\/inspector\/inspections", \{ headers: PORTAL_HEADERS, cache: "no-store" \}\)/);
});

test("sin sesión real válida, nunca se muestra una vista operativa -- se ofrece volver a /inspector/login", () => {
  assert.match(source, /if \(!inspector\) \{/);
  const guardBlock = source.slice(source.indexOf("if (!inspector) {"), source.indexOf("return (\n    <div"));
  assert.match(guardBlock, /\/inspector\/login/);
  assert.doesNotMatch(guardBlock, /INSPECTOR_VIEW\.CONSULTA/);
});

test("un 401/403 en la consulta de patente cierra la sesión local en vez de mostrar un resultado inventado", () => {
  const consultFn = source.slice(source.indexOf("async function consult("), source.indexOf("function goFiscalizar"));
  assert.match(consultFn, /status === 401 \|\| status === 403/);
  assert.match(consultFn, /setInspector\(null\)/);
});

test("cerrar sesión hace signOut real de Supabase y DELETE /api/auth/session, nunca solo borra estado local", () => {
  const logoutFn = source.slice(source.indexOf("async function handleLogout"), source.indexOf("function navigate"));
  assert.match(logoutFn, /getSupabaseBrowserClient\(\)\.auth\.signOut\(\)/);
  assert.match(logoutFn, /method: "DELETE"/);
});

test("consultar una patente llama a la API real de patentes y navega a RESULTADO, nunca al revés", () => {
  const consultFn = source.slice(source.indexOf("async function consult("), source.indexOf("function goFiscalizar"));
  assert.match(consultFn, /fetchPlateState\(plate\)/);
  assert.match(consultFn, /setHistory\(/);
  assert.match(consultFn, /setView\(INSPECTOR_VIEW\.RESULTADO\)/);
});

test("FISCALIZAR desde un resultado VENCIDO siempre bloquea el motivo a Exceso de tiempo (lockToOverstay)", () => {
  assert.match(source, /onFiscalizar=\{\(\) => goFiscalizar\(activeResult\.plate, \{ lockToOverstay: true \}\)\}/);
});

// 2026-09-03, "abrir detalle desde la lista de Fiscalizaciones": se agregó
// un TERCER caso (existingRegistro, ver más abajo) -- el routing original
// (RESULTADO si venía de FISCALIZAR, lista si no) sigue exactamente igual
// para los otros dos casos, solo se extendió el mismo ternario.
test("cancelar una fiscalización sin registrar vuelve a RESULTADO si venía de FISCALIZAR, o a la lista si no", () => {
  assert.match(source, /const destino = existingRegistro \? INSPECTOR_VIEW\.FISCALIZACIONES : fiscalizacionPlate \? INSPECTOR_VIEW\.RESULTADO : INSPECTOR_VIEW\.FISCALIZACIONES;/);
});

test("cancelar/volver de una fiscalización REABIERTA desde la lista (existingRegistro) siempre vuelve a la lista, nunca a RESULTADO -- y limpia existingRegistro para no arrastrarlo a la próxima", () => {
  assert.match(source, /existingRegistro \? INSPECTOR_VIEW\.FISCALIZACIONES/);
  assert.match(source, /setExistingRegistro\(null\);\s*\n\s*navigate\(destino\);/);
});

test("una repetición idempotente (reused=true) del registro de fiscalización nunca duplica la fila en el historial local", () => {
  assert.match(source, /if \(row\?\.reused === false\) \{/);
});

test("el shell nunca importa Webpay/reconciliador/payment_transactions -- Inspectores no toca pagos (§23)", () => {
  for (const forbidden of ["Webpay", "reconcile", "payment_transactions", "createTransaction"]) {
    assert.doesNotMatch(source, new RegExp(forbidden, "i"), forbidden);
  }
});

test("openFiscalizacion (TAREA 5.A/B/C): abre el detalle vía GET (nunca POST/fetch con method), y pasa existingRegistro/onOpen a los componentes correctos", () => {
  const openFn = source.slice(source.indexOf("async function openFiscalizacion"), source.indexOf("async function openFiscalizacion") + 600);
  assert.match(openFn, /fetchInspectorInspectionDetail\(f\.id\)/);
  assert.match(openFn, /setExistingRegistro\(detalle\)/);
  assert.match(openFn, /setView\(INSPECTOR_VIEW\.FISCALIZACION\)/);

  const fetchDetailFn = source.slice(source.indexOf("async function fetchInspectorInspectionDetail"), source.indexOf("async function fetchInspectorInspectionDetail") + 400);
  assert.match(fetchDetailFn, /fetch\(`\/api\/inspector\/inspections\/\$\{encodeURIComponent\(id\)\}`, \{ headers: PORTAL_HEADERS, cache: "no-store" \}\)/);
  assert.doesNotMatch(fetchDetailFn, /method:\s*"POST"/);

  assert.match(source, /existingRegistro=\{existingRegistro\}/);
  assert.match(source, /onOpen=\{openFiscalizacion\}/);
});

test("goFiscalizar (registrar UNA NUEVA fiscalización) siempre limpia existingRegistro -- nunca arrastra un detalle reabierto a un registro nuevo", () => {
  const goFn = source.slice(source.indexOf("function goFiscalizar"), source.indexOf("// Abre el detalle"));
  assert.match(goFn, /setExistingRegistro\(null\)/);
});

test("cada vista se resuelve exactamente a un componente, sin duplicados", () => {
  // Acotado al JSX de retorno (2026-09-03, incidente CXPY93): los nuevos
  // efectos de refresco de Fiscalizaciones (loadFiscalizaciones al navegar
  // / volver de background) también comparan `view === INSPECTOR_VIEW.
  // FISCALIZACIONES`, fuera del switch de render -- no son una vista
  // renderizada dos veces, así que no deben contarse acá.
  const jsx = source.slice(source.indexOf("return (\n    <div"));
  const renders = [...jsx.matchAll(/view === INSPECTOR_VIEW\.(\w+)/g)].map((m) => m[1]);
  const unique = new Set(renders);
  assert.ok(renders.length >= 8, "deben renderizarse al menos 8 vistas");
  assert.equal(unique.size, renders.length, `no debe haber una vista renderizada dos veces: ${renders.join(", ")}`);
});
