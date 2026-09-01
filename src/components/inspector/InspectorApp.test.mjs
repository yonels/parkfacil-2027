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

test("cancelar una fiscalización sin registrar vuelve a RESULTADO si venía de FISCALIZAR, o a la lista si no", () => {
  assert.match(source, /onCancelar=\{\(\) => navigate\(fiscalizacionPlate \? INSPECTOR_VIEW\.RESULTADO : INSPECTOR_VIEW\.FISCALIZACIONES\)\}/);
});

test("una repetición idempotente (reused=true) del registro de fiscalización nunca duplica la fila en el historial local", () => {
  assert.match(source, /if \(row\?\.reused === false\) \{/);
});

test("el shell nunca importa Webpay/reconciliador/payment_transactions -- Inspectores no toca pagos (§23)", () => {
  for (const forbidden of ["Webpay", "reconcile", "payment_transactions", "createTransaction"]) {
    assert.doesNotMatch(source, new RegExp(forbidden, "i"), forbidden);
  }
});

test("cada vista se resuelve exactamente a un componente, sin duplicados", () => {
  const renders = [...source.matchAll(/view === INSPECTOR_VIEW\.(\w+)/g)].map((m) => m[1]);
  const unique = new Set(renders);
  assert.ok(renders.length >= 8, "deben renderizarse al menos 8 vistas");
  assert.equal(unique.size, renders.length, `no debe haber una vista renderizada dos veces: ${renders.join(", ")}`);
});
