import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canAccessPath, hasPermission, PERMISSIONS, ROLES } from "../auth/permissions.mjs";
import { extractDisplayUsername } from "../auth/accessUsernameDomain.mjs";

// POS Entry/Exit — Fase 1 (entorno, sesión, permisos, aislamiento).
// Las rutas API, el proxy y operationAuthorization.js importan "server-only"
// / next/server, que no resuelven bajo node --test (ver el mismo criterio en
// operationAuthorization.test.mjs): aquí se fija el contrato desplegado
// leyendo el código fuente y se ejecuta la lógica pura real cuando existe.

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const POS_API_ROUTES = {
  stays: read("../../app/api/pos/stays/route.js"),
  quote: read("../../app/api/pos/stays/[stayId]/quote/route.js"),
  payments: read("../../app/api/pos/payments/route.js"),
  shift: read("../../app/api/pos/shift/route.js"),
  shiftStart: read("../../app/api/pos/shift/start/route.js"),
  shiftClose: read("../../app/api/pos/shift/close/route.js"),
  shiftOperatorClose: read("../../app/api/pos/shift/operator-close/route.js"),
  dataEntry: read("../../app/api/data-entry/route.js"),
};
const operationAuthorization = read("../auth/operationAuthorization.js");
const proxy = read("../../proxy.js");
const posLogin = read("../../app/pos/login/page.js");
const posTerminal = read("../../components/pos/PosTerminal.js");

// Extrae una función top-level (sin dependencias de React) para ejecutarla
// con sus dependencias reales inyectadas.
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `no se encontró function ${name}`);
  let depth = 0;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`función ${name} sin cierre`);
}

function loadFunction(source, name, deps = {}) {
  const names = Object.keys(deps);
  return new Function(...names, `${extractFunction(source, name)}; return ${name};`)(...Object.values(deps));
}

// ---- Aislamiento de estacionamiento (hallazgo crítico de Fase 1) ----

test("ninguna API POS resuelve el estacionamiento con assignedParkingIds[0]", () => {
  for (const [name, source] of Object.entries(POS_API_ROUTES)) {
    assert.doesNotMatch(source, /assignedParkingIds\?\.\[0\]|assignedParkingIds\[0\]/, `${name} todavía usa assignedParkingIds[0]`);
  }
});

test("todas las APIs POS usan el mismo resolvedor server-side de estacionamiento", () => {
  for (const [name, source] of Object.entries(POS_API_ROUTES)) {
    assert.match(source, /resolvePosOperationalParking\(authorization\)/, `${name} no usa resolvePosOperationalParking`);
  }
  assert.match(operationAuthorization, /export async function resolvePosOperationalParking/);
  assert.match(operationAuthorization, /listParkings\(db, scope\)/, "las opciones deben salir del scope autorizado (empresa + asignaciones)");
  assert.match(operationAuthorization, /\.eq\("operator_id", context\.userId\)/, "los turnos consultados son solo del operador autenticado");
});

test("con varios estacionamientos sin turno que los desambigüe, las APIs responden 409 PARKING_SELECTION_REQUIRED (nunca eligen uno)", () => {
  for (const name of ["stays", "quote", "payments", "shiftClose", "shiftOperatorClose", "dataEntry"]) {
    assert.match(POS_API_ROUTES[name], /POS_PARKING_RESOLUTION\.SELECTION_REQUIRED/, `${name} no maneja SELECTION_REQUIRED`);
  }
  assert.match(POS_API_ROUTES.shift, /state: "PARKING_SELECTION_REQUIRED"/);
  assert.match(POS_API_ROUTES.shift, /parkingOptions: resolved\.options/);
});

test("inicio de turno con selección: solo acepta un shiftId ofrecido por el servidor, nunca un parkingId del cliente sin validar", () => {
  assert.match(POS_API_ROUTES.shiftStart, /findSelectableShift\(resolved, body\.shiftId\)/);
  // Turno a pedido (2026-09-28): el parkingId elegido solo vale si está en la
  // lista autorizada calculada server-side (resolved.authorizedParkings) y ACTIVE.
  const uses = POS_API_ROUTES.shiftStart.match(/body\.parkingId/g) || [];
  assert.equal(uses.length, 1, "body.parkingId se lee en un único lugar");
  assert.match(
    POS_API_ROUTES.shiftStart,
    /const wanted = String\(body\.parkingId \|\| ""\)\.trim\(\);\s*const target = \(resolved\.authorizedParkings \|\| \[\]\)\.find\(\(item\) => String\(item\.id\) === wanted && item\.status === "ACTIVE"\);\s*if \(!target\) \{/,
  );
});

test("turno a pedido: solo sin turno (UNASSIGNED/CLOSED), crea el PROGRAMMED de hoy y lo abre con el mismo RPC", () => {
  assert.match(POS_API_ROUTES.shiftStart, /const ON_DEMAND_STATES = new Set\(\["UNASSIGNED", "CLOSED"\]\);/);
  assert.match(POS_API_ROUTES.shiftStart, /if \(onDemand && ON_DEMAND_STATES\.has\(current\.state\)\) \{/);
  assert.match(POS_API_ROUTES.shiftStart, /const shiftId = await ensureOnDemandProgrammedShift\(authorization\.db, \{ parking, operatorId: actor\.id \}\);\s*const shift = await startPosOperatorShift\(authorization\.db, \{ shiftId, actor \}\);/);
  const onDemand = read("./onDemandShift.js");
  assert.match(onDemand, /if \(parking\.type !== "OFF_STREET"\)/, "On Street sigue exigiendo turno programado");
  assert.match(onDemand, /if \(existing\.data\?\.id\) return existing\.data\.id;/, "idempotente ante doble toque");
});

test("data-entry: un parkingId del cliente que no coincide con el resuelto se rechaza (403 POS_PARKING_MISMATCH)", () => {
  assert.match(POS_API_ROUTES.dataEntry, /isRequestedParkingConsistent\(resolved\.parkingId, requestedParkingId\)/);
  assert.match(POS_API_ROUTES.dataEntry, /POS_PARKING_MISMATCH/);
  assert.match(POS_API_ROUTES.dataEntry, /isTerminalRequest \|\| authorization\.context\.role === ROLES\.OPERATOR/);
});

test("turno abierto en estacionamiento no autorizado -> 403, nunca se opera otro estacionamiento", () => {
  assert.match(operationAuthorization, /POS_SHIFT_PARKING_FORBIDDEN", 403/);
});

// ---- Autenticación / autorización de APIs ----

test("APIs POS rechazan requests sin sesión: autorizan antes de cualquier lectura/escritura", () => {
  for (const [name, source] of Object.entries(POS_API_ROUTES)) {
    assert.match(source, /authorizeOperationRequest\(request, PERMISSIONS\.OPERATIONS_USE\)/, `${name} no exige operations:use`);
    assert.match(source, /if \(authorization\.response\) return/, `${name} no corta con la respuesta de autorización`);
  }
});

test("data-entry: un cuerpo JSON inválido no produce 500 antes de validar la sesión", () => {
  assert.match(POS_API_ROUTES.dataEntry, /\(await request\.json\(\)\.catch\(\(\) => null\)\) \|\| \{\}/);
});

test("solo roles con operations:use pueden operar; inspector no", () => {
  assert.equal(hasPermission(ROLES.OPERATOR, PERMISSIONS.OPERATIONS_USE), true);
  assert.equal(hasPermission(ROLES.INSPECTOR, PERMISSIONS.OPERATIONS_USE), false);
});

// ---- Operador identificado (sin correo técnico) ----

test("POS identifica al operador por nombre de membresía o usuario de acceso, nunca por el correo técnico", () => {
  assert.match(operationAuthorization, /export function posOperationActor\(context\)/);
  assert.match(operationAuthorization, /context\?\.membership\?\.fullName/);
  for (const [name, source] of Object.entries(POS_API_ROUTES)) {
    assert.doesNotMatch(source, /[^s]operationActor\(authorization\.context\)/, `${name} usa operationActor (correo técnico)`);
  }
  const format = loadFunction(posTerminal, "formatOperatorDisplayName", { extractDisplayUsername });
  assert.equal(format({ membership: { fullName: "Juana Pérez" }, email: "jperez@acceso.parkfacilapp.cl" }), "Juana Pérez");
  assert.equal(format({ membership: { fullName: "" }, email: "jperez@acceso.parkfacilapp.cl" }), "jperez");
  assert.equal(format({ membership: null, email: "real@empresa.cl" }), "real@empresa.cl");
  assert.doesNotMatch(posTerminal, /\{context\?\.email \|\| "-"\}/, "el panel del operador ya no muestra context.email");
});

// ---- Proxy: acceso al POS ----

test("usuario no autenticado en /pos -> /pos/login (401 del contexto)", () => {
  assert.match(proxy, /isPosPath\(request\.nextUrl\.pathname\) \? "\/pos\/login"/);
  assert.match(proxy, /error instanceof AuthorizationError && error\.status === 401\) return loginRedirect\(request\)/);
  assert.match(proxy, /"\/pos\/login",/, "/pos/login debe seguir siendo pública");
  assert.doesNotMatch(proxy, /"\/pos",\n/, "/pos no puede ser ruta pública");
});

test("operador autorizado entra; company_admin/inspector en el Terminal quedan rechazados de forma controlada", () => {
  const canOpenPosTerminal = loadFunction(proxy, "canOpenPosTerminal", { ROLES });
  const operator = { portal: "terminal", role: ROLES.OPERATOR, enabledProducts: [] };
  assert.equal(canAccessPath(operator, "/pos") && canOpenPosTerminal(operator), true);
  const admin = { portal: "terminal", role: ROLES.COMPANY_ADMIN, enabledProducts: [] };
  assert.equal(canAccessPath(admin, "/pos"), true, "canAccessPath por sí solo lo permitía");
  assert.equal(canOpenPosTerminal(admin), false, "el proxy ahora exige rol operador en el Terminal");
  assert.equal(canAccessPath({ portal: "terminal", role: ROLES.INSPECTOR }, "/pos"), false);
  assert.equal(canAccessPath(operator, "/usuarios"), false, "desde el Terminal no se navega fuera de /pos");
  // Fuera del Terminal el helper no altera nada.
  assert.equal(canOpenPosTerminal({ portal: "client", role: ROLES.COMPANY_ADMIN }), true);
  assert.match(proxy, /!canAccessPath\(context, request\.nextUrl\.pathname\) \|\| !canOpenPosTerminal\(context\)/);
});

test("acceso denegado en el Terminal ofrece salir al login POS (antes enlazaba a /pos en bucle)", () => {
  assert.match(proxy, /href="\/pos\/login"[^`]*Ingresar con otra cuenta/);
});

test("las pantallas /pos se sirven con no-store (Atrás tras logout no restaura una pantalla operativa)", () => {
  assert.match(proxy, /if \(isPosPath\(pathname\)\) response\.headers\.set\("cache-control", "no-store, max-age=0"\)/);
});

// ---- Login POS ----

test("login POS muestra motivos de una lista cerrada (nunca texto arbitrario del query string)", () => {
  for (const reason of ["sesion-expirada", "acceso-revocado", "sesion-cerrada"]) {
    assert.match(posLogin, new RegExp(`"${reason}":`));
  }
  assert.match(posLogin, /POS_LOGIN_REASONS\[String\(params\.motivo \|\| ""\)\] \|\| ""/);
  assert.match(posLogin, /loginScope="pos_operator"/, "el login sigue exigiendo el scope de operador POS");
  assert.match(posLogin, /forcePosDestination/);
});

// ---- Sesión en el cliente ----

function loadRevokedAccessCodes() {
  const match = posTerminal.match(/const POS_REVOKED_ACCESS_CODES = (new Set\(\[[\s\S]*?\]\));/);
  assert.ok(match, "no se encontró POS_REVOKED_ACCESS_CODES");
  return new Function(`return ${match[1]};`)();
}

test("sesión expirada o revocada -> login con motivo; errores de red no expulsan al operador", () => {
  const reasonFor = loadFunction(posTerminal, "posLoginReasonForSessionStatus", { POS_REVOKED_ACCESS_CODES: loadRevokedAccessCodes() });
  assert.equal(reasonFor(401, "AUTH_REQUIRED"), "sesion-expirada");
  for (const code of ["MEMBERSHIP_INACTIVE", "COMPANY_INACTIVE", "ACCESS_EXPIRED", "ROLE_FORBIDDEN", "PORTAL_FORBIDDEN", "PERMISSION_FORBIDDEN"]) {
    assert.equal(reasonFor(403, code), "acceso-revocado", `${code} debe revocar el acceso`);
  }
  assert.equal(reasonFor(500), null);
  assert.equal(reasonFor(0), null);
  assert.match(posTerminal, /const POS_SESSION_REVALIDATE_MS = 60000;/);
  assert.match(posTerminal, /document\.addEventListener\("visibilitychange", onVisibilityChange\)/);
  assert.match(posTerminal, /if \(cancelled \|\| operationBusyRef\.current \|\| cardPaymentLockRef\.current\) return;/, "nunca interrumpe un cobro u operación en curso");
});

test("revalidación: una falla transitoria del backend nunca expulsa al operador en pleno turno", () => {
  const reasonFor = loadFunction(posTerminal, "posLoginReasonForSessionStatus", { POS_REVOKED_ACCESS_CODES: loadRevokedAccessCodes() });
  // 403 por error de lectura en base de datos (authenticatedContext.js) no
  // es una revocación de acceso.
  assert.equal(reasonFor(403, "MEMBERSHIP_LOOKUP_FAILED"), null);
  assert.equal(reasonFor(403, "COMPANY_LOOKUP_FAILED"), null);
  assert.equal(reasonFor(403, undefined), null);
  assert.equal(reasonFor(403, ""), null);
  // El código se lee también en respuestas de error.
  const getSession = extractFunction(posTerminal, "getSessionContext");
  assert.match(getSession, /const payload = await response\.json\(\)\.catch\(\(\) => \(\{\}\)\);\s*return \{ ok: response\.ok, status: response\.status, payload: payload \|\| \{\} \};/);
  assert.match(posTerminal, /posLoginReasonForSessionStatus\(session\.status, session\.payload\?\.code\)/);
  // Un 401 aislado (corte momentáneo de Supabase Auth) no redirige: se
  // exige que se repita en revalidaciones consecutivas; un OK reinicia.
  assert.match(posTerminal, /const POS_SESSION_UNAUTHORIZED_THRESHOLD = 2;/);
  const revalidation = posTerminal.slice(posTerminal.indexOf("async function revalidateSession()"), posTerminal.indexOf("function onVisibilityChange()"));
  assert.match(revalidation, /if \(session\.ok\) \{\s*consecutiveUnauthorized = 0;\s*return;\s*\}/);
  assert.match(revalidation, /consecutiveUnauthorized \+= 1;\s*if \(consecutiveUnauthorized < POS_SESSION_UNAUTHORIZED_THRESHOLD\) return;/);
  assert.match(revalidation, /\} else \{\s*consecutiveUnauthorized = 0;\s*\}/);
});

test("401 durante ingreso o cobro en efectivo vuelve al login", () => {
  const entry = posTerminal.slice(posTerminal.indexOf("async function submitEntry("), posTerminal.indexOf("const navItems"));
  assert.match(entry, /response\.status === 401\) \{\s*redirectToPosLogin\("sesion-expirada"\)/);
  const cash = posTerminal.slice(posTerminal.indexOf("async function confirmCashPayment("), posTerminal.indexOf("function finishPaidFlow("));
  assert.match(cash, /response\.status === 401\) \{\s*redirectToPosLogin\("sesion-expirada"\)/);
});

test("la navegación al login es 'dura' (location.replace): limpia el estado en memoria y el historial", () => {
  const redirect = extractFunction(posTerminal, "redirectToPosLogin");
  assert.match(redirect, /window\.location\.replace\(/);
  assert.doesNotMatch(posTerminal, /router\.replace\("\/pos\/login/);
  assert.match(posTerminal, /if \(event\.persisted\) window\.location\.reload\(\)/);
});

test("logout: nunca queda a medias, invalida la cookie y no se permite con un cobro TUU en curso", () => {
  const logout = extractFunction(posTerminal, "logout");
  assert.match(logout, /if \(loggingOut \|\| paymentSubmitting\) return;/);
  // paymentSubmitting cubre todo el cobro con tarjeta (se libera en el
  // finally de handleCardPaymentSelection, después de registrar el EXIT).
  const card = posTerminal.slice(posTerminal.indexOf("async function handleCardPaymentSelection("));
  assert.match(card, /setPaymentSubmitting\(true\)/);
  assert.match(card, /finally \{\s*cardPaymentLockRef\.current = false;\s*setPaymentSubmitting\(false\);/);
  assert.match(logout, /try \{\s*await getSupabaseBrowserClient\(\)\.auth\.signOut\(\);\s*\} catch/);
  assert.match(logout, /fetch\("\/api\/auth\/session", \{ method: "DELETE" \}\)/);
  assert.match(logout, /redirectToPosLogin\("sesion-cerrada"\)/);
});

test("selección explícita de estacionamiento en el gate de turno", () => {
  assert.match(posTerminal, /shiftState === "PARKING_SELECTION_REQUIRED"/);
  assert.match(posTerminal, /onClick=\{\(\) => void startProgrammedShift\(option\.shiftId\)\}/);
  assert.match(posTerminal, /setParkingOptions\(Array\.isArray\(data\.parkingOptions\) \? data\.parkingOptions : \[\]\)/);
});

test("UI táctil: navegación y acciones de cabecera con área mínima de toque", () => {
  assert.match(posTerminal, /min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3/);
  assert.match(posTerminal, /aria-label="Abrir menú"/);
  assert.match(posTerminal, /aria-label="Cerrar sesión"/);
  assert.doesNotMatch(posTerminal, /Versión 0\.1\.1/, "la versión visible sale de POS_FRONTEND_VERSION");
});
