import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { sanitizeParkingCatalogCode, validateParkingCatalogCode, nextParkingCodeBatch, highestParkingCodeSequence } from "./estacionamientos.mjs";

// Corrección funcional "Código de estacionamiento desde catálogo/dropdown"
// (2026-08-29). estacionamientosRepository.js/las rutas API son
// "server-only" (no importables directo bajo node --test, mismo criterio ya
// usado en el resto de esta suite) -- se verifican por fuente real, igual
// que onStreetProjects.test.mjs.

const repoSource = await readFile(new URL("./estacionamientosRepository.js", import.meta.url), "utf8");
const createRouteSource = await readFile(new URL("../app/api/estacionamientos/route.js", import.meta.url), "utf8");
const patchRouteSource = await readFile(new URL("../app/api/estacionamientos/[id]/route.js", import.meta.url), "utf8");
const disponiblesRouteSource = await readFile(new URL("../app/api/estacionamientos/codigos-disponibles/route.js", import.meta.url), "utf8");
const adminRouteSource = await readFile(new URL("../app/api/administracion/codigos-estacionamiento/route.js", import.meta.url), "utf8");
const formSource = await readFile(new URL("../components/estacionamientos/EstacionamientoForm.js", import.meta.url), "utf8");

// --- 1. Código ya no es input libre ---

test("EstacionamientoForm: al crear, el Código es un <select> de códigos disponibles -- ya no un <input> de texto libre", () => {
  assert.doesNotMatch(formSource, /<input data-field="code"[^>]*onChange/, "no debe quedar un input editable ligado a 'code'");
  assert.match(formSource, /<select data-field="code" value=\{values\.code\}/, "debe existir un <select> controlado para 'code'");
  assert.match(formSource, /\/api\/estacionamientos\/codigos-disponibles/, "debe consumir el endpoint de códigos disponibles");
});

test("EstacionamientoForm: al editar, el Código sigue siendo solo lectura (sin cambios de comportamiento)", () => {
  assert.match(formSource, /editing \? \(\s*<>\s*<input data-field="code" value=\{values\.code\} readOnly/, "editar debe mostrar el código actual como solo lectura");
});

test("EstacionamientoForm: no permite enviar el formulario de creación sin un código disponible", () => {
  assert.match(formSource, /disabled=\{submitting \|\| \(!editing && \(loadingCodes \|\| availableCodes\.length === 0\)\)\}/);
});

// --- 2-3. El dropdown consulta solo códigos AVAILABLE reales ---

test("listAvailableParkingCodes: consulta únicamente status='AVAILABLE' -- un código ya usado no puede aparecer como disponible", () => {
  const start = repoSource.indexOf("export async function listAvailableParkingCodes");
  const fn = repoSource.slice(start, repoSource.indexOf("\n}", start));
  assert.match(fn, /\.eq\("status",\s*"AVAILABLE"\)/);
});

test("/api/estacionamientos/codigos-disponibles: exige PARKINGS_MANAGE (mismo permiso que crear un estacionamiento, no uno nuevo)", () => {
  assert.match(disponiblesRouteSource, /requirePermission\(authorization\.context,\s*PERMISSIONS\.PARKINGS_MANAGE\)/);
});

// --- 4-5-6. Backend nunca confía en el código enviado por el frontend; concurrencia ---

test("createParkingWithCatalogCode: revalida disponibilidad en el servidor ANTES de insertar -- rechaza un código no disponible o inventado", () => {
  const start = repoSource.indexOf("export async function createParkingWithCatalogCode");
  const fn = repoSource.slice(start, repoSource.length);
  assert.match(fn, /\.eq\("code",\s*payload\.code\)\.eq\("status",\s*"AVAILABLE"\)\.maybeSingle\(\)/, "precheck real contra el catálogo antes de crear nada");
  assert.match(fn, /throw new CatalogCodeNotAvailableError\(\)/);
});

test("createParkingWithCatalogCode: la reclamación final es un UPDATE condicional atómico (status='AVAILABLE'), no una simple escritura -- respaldo real contra condición de carrera", () => {
  const start = repoSource.indexOf("export async function createParkingWithCatalogCode");
  const fn = repoSource.slice(start, repoSource.length);
  assert.match(fn, /\.update\(\{\s*status:\s*"ASSIGNED",\s*parking_id:\s*parking\.id/);
  assert.match(fn, /\.eq\("code",\s*payload\.code\)\.eq\("status",\s*"AVAILABLE"\)\s*\n\s*\.select\("id"\)/);
  // Si la UPDATE condicional no afecta filas (perdió la carrera / el código
  // no estaba en el catálogo), revierte el parking recién insertado -- no
  // deja un estacionamiento huérfano con un código no reservado realmente.
  assert.match(fn, /if \(!claimed\.data \|\| claimed\.data\.length === 0\) \{\s*await db\.from\("parkings"\)\.delete\(\)\.eq\("id", parking\.id\);/);
});

test("POST /api/estacionamientos: usa createParkingWithCatalogCode (no un insert directo) y traduce CatalogCodeNotAvailableError a un 409 claro", () => {
  assert.match(createRouteSource, /createParkingWithCatalogCode\(supabase, payload\)/);
  assert.match(createRouteSource, /CatalogCodeNotAvailableError/);
  assert.match(createRouteSource, /409/);
});

// --- 9. Editar conserva el código (defensa de servidor, no solo de UI) ---

test("PATCH /api/estacionamientos/[id]: fuerza payload.code al código actual -- una manipulación de frontend no puede reasignarlo", () => {
  assert.match(patchRouteSource, /payload\.code = current\.code;/);
});

// --- 7/12. Catálogo GLOBAL (definición aprobada), no por Empresa ---

test("El catálogo es GLOBAL: codigos-disponibles no filtra por companyId, y createParkingWithCatalogCode tampoco lo usa para resolver el código", () => {
  assert.doesNotMatch(disponiblesRouteSource, /companyId/i);
  const start = repoSource.indexOf("export async function createParkingWithCatalogCode");
  const fn = repoSource.slice(start, repoSource.indexOf("\n}", repoSource.indexOf("\n}", start) + 1));
  assert.doesNotMatch(fn, /company_id|companyId/);
});

// --- 11/9(admin). Administración del catálogo es exclusiva de Root ---

test("/api/administracion/codigos-estacionamiento (GET y POST): exige requirePlatformAdmin -- company_admin no puede administrar el catálogo", () => {
  const getFn = adminRouteSource.slice(adminRouteSource.indexOf("export async function GET"), adminRouteSource.indexOf("export async function POST"));
  const postFn = adminRouteSource.slice(adminRouteSource.indexOf("export async function POST"));
  assert.match(getFn, /requirePlatformAdmin\(authorization\.context\)/);
  assert.match(postFn, /requirePlatformAdmin\(authorization\.context\)/);
});

test("navigation.js: 'Códigos de Estacionamiento' vive en Administración, y /administracion queda en ROOT_ONLY_PREFIXES", async () => {
  const navSource = await readFile(new URL("../config/navigation.js", import.meta.url), "utf8");
  assert.match(navSource, /href: "\/administracion\/codigos-estacionamiento"/);
  const permissionsSource = await readFile(new URL("./auth/permissions.mjs", import.meta.url), "utf8");
  const start = permissionsSource.indexOf("const ROOT_ONLY_PREFIXES");
  const block = permissionsSource.slice(start, permissionsSource.indexOf("];", start));
  assert.match(block, /"\/administracion"/);
});

// --- Validación pura del alta de código (Root, catálogo) ---

test("sanitizeParkingCatalogCode: recorta y normaliza a mayúsculas, sin imponer un formato/prefijo (aún no aprobado, definición punto 10)", () => {
  assert.equal(sanitizeParkingCatalogCode("  pf-010 "), "PF-010");
  assert.equal(sanitizeParkingCatalogCode("cualquier-cosa-123"), "CUALQUIER-COSA-123");
});

test("validateParkingCatalogCode: exige un código no vacío y no duplicado en el catálogo", () => {
  assert.deepEqual(validateParkingCatalogCode("", []), { code: "Ingresa un código." });
  assert.deepEqual(validateParkingCatalogCode("PF-001", ["PF-001"]), { code: "Ese código ya existe en el catálogo." });
  assert.deepEqual(validateParkingCatalogCode("PF-010", ["PF-001"]), {});
});

// --- Continuación "Administración Root del catálogo" (2026-08-29) ---

const adminUiSource = await readFile(new URL("../components/estacionamientos/ParkingCodeCatalogAdmin.js", import.meta.url), "utf8");
const transitionRouteSource = await readFile(new URL("../app/api/administracion/codigos-estacionamiento/[id]/route.js", import.meta.url), "utf8");

test("Auditoría: forzar uppercase en el código del catálogo es consistente con la regla YA existente para parkings.code -- sanitizeParkingInput también lo hace, no es una convención nueva", async () => {
  const coreSource = await readFile(new URL("./estacionamientos.mjs", import.meta.url), "utf8");
  const start = coreSource.indexOf("export function sanitizeParkingInput");
  const fn = coreSource.slice(start, coreSource.indexOf("\n}", start));
  assert.match(fn, /code: String\(input\.code \|\| ""\)\.trim\(\)\.toUpperCase\(\)/, "parkings.code ya se guarda en mayúsculas -- el catálogo debe seguir el mismo criterio");
});

test("Pantalla admin usa ParkFacilDataGrid (no una tabla hecha a mano) y modal '+ Nuevo código' (no un formulario inline)", () => {
  assert.match(adminUiSource, /import ParkFacilDataGrid from "@\/components\/ui\/ParkFacilDataGrid"/);
  assert.match(adminUiSource, /<ParkFacilDataGrid/);
  assert.match(adminUiSource, /storageKey="administracion:codigos-estacionamiento"/);
  assert.match(adminUiSource, /Nuevo código de estacionamiento/, "debe existir el modal con ese título");
});

test("Columnas mínimas exigidas: Código, Estado, Estacionamiento, Empresa, Fecha de creación", () => {
  for (const label of ["Código", "Estado", "Estacionamiento", "Empresa", "Fecha de creación"]) {
    assert.match(adminUiSource, new RegExp(`label: "${label}"`), `falta la columna "${label}"`);
  }
});

test("Estados traducidos correctamente en UI: DISPONIBLE/ASIGNADO/INACTIVO sobre los nombres internos reales AVAILABLE/ASSIGNED/INACTIVE", () => {
  assert.match(adminUiSource, /AVAILABLE:\s*"Disponible"/);
  assert.match(adminUiSource, /ASSIGNED:\s*"Asignado"/);
  assert.match(adminUiSource, /INACTIVE:\s*"Inactivo"/);
});

test("Un código ASSIGNED nunca ofrece acción (no eliminar, no cambiar código, no inactivar)", () => {
  const start = adminUiSource.indexOf('key: "actions"');
  const fn = adminUiSource.slice(start, adminUiSource.indexOf("},", start));
  assert.match(fn, /ASSIGNED: sin acciones/i);
  assert.match(fn, /return null;/);
});

test("inactivateParkingCode: SOLO transiciona desde AVAILABLE (UPDATE condicional) -- un código ASSIGNED nunca puede inactivarse, ni por API ni por condición de carrera", () => {
  const start = repoSource.indexOf("export async function inactivateParkingCode");
  const fn = repoSource.slice(start, repoSource.indexOf("\n}", start));
  assert.match(fn, /\.update\(\{\s*status:\s*"INACTIVE"\s*\}\)\.eq\("id",\s*id\)\.eq\("status",\s*"AVAILABLE"\)/);
  assert.match(fn, /throw new CatalogCodeInvalidTransitionError\(\)/);
});

test("reactivateParkingCode: SOLO transiciona desde INACTIVE -- por construcción del modelo, nunca reactiva un código que haya estado asociado a un parking", () => {
  const start = repoSource.indexOf("export async function reactivateParkingCode");
  const fn = repoSource.slice(start, repoSource.indexOf("\n}", start));
  assert.match(fn, /\.update\(\{\s*status:\s*"AVAILABLE"\s*\}\)\.eq\("id",\s*id\)\.eq\("status",\s*"INACTIVE"\)/);
});

test("Código INACTIVE no puede aparecer en el dropdown de disponibles (listAvailableParkingCodes solo filtra AVAILABLE, sin excepción)", () => {
  const start = repoSource.indexOf("export async function listAvailableParkingCodes");
  const fn = repoSource.slice(start, repoSource.indexOf("\n}", start));
  assert.doesNotMatch(fn, /INACTIVE/);
  assert.match(fn, /\.eq\("status",\s*"AVAILABLE"\)/);
});

test("PATCH /api/administracion/codigos-estacionamiento/[id]: exige requirePlatformAdmin -- company_admin no puede inactivar/reactivar aunque manipule la API directamente", () => {
  assert.match(transitionRouteSource, /requirePlatformAdmin\(authorization\.context\)/);
  assert.match(transitionRouteSource, /const ACTIONS = \{ inactivate: inactivateParkingCode, reactivate: reactivateParkingCode \}/);
});

test("Transición inválida (código no encontrado en el estado esperado) responde 409 con mensaje claro, no un 500 genérico", () => {
  assert.match(transitionRouteSource, /CatalogCodeInvalidTransitionError/);
  assert.match(transitionRouteSource, /409/);
});

test("Sidebar: 'Códigos de estacionamiento' vive en Administración, NO dentro del árbol On Street", async () => {
  const navSource = await readFile(new URL("../config/navigation.js", import.meta.url), "utf8");
  const onStreetStart = navSource.indexOf('label: "On Street"');
  const onStreetEnd = navSource.indexOf("// ============================================================\n  // ADMINISTRACIÓN", onStreetStart);
  const onStreetBlock = navSource.slice(onStreetStart, onStreetEnd);
  assert.doesNotMatch(onStreetBlock, /codigos-estacionamiento/i, "el código de estacionamiento no debe vivir dentro de On Street");
  const adminStart = navSource.indexOf('label: "Administración"');
  const adminBlock = navSource.slice(adminStart);
  assert.match(adminBlock, /codigos-estacionamiento/i);
});

// --- Secuencia infinita / reposición automática (decisión aprobada 2026-08-29) ---

test("highestParkingCodeSequence: encuentra el número más alto de la serie PF-XXX, ignora códigos que no siguen ese patrón", () => {
  assert.equal(highestParkingCodeSequence([]), 0);
  assert.equal(highestParkingCodeSequence(["PF-001", "PF-002", "PF-003"]), 3);
  assert.equal(highestParkingCodeSequence(["PF-001", "5Q-001", "XXXX", "PF-050"]), 50);
  assert.equal(highestParkingCodeSequence(["pf-007"]), 7, "insensible a mayúsculas");
});

test("nextParkingCodeBatch: genera exactamente 100 códigos PF-XXX consecutivos, sin saltos ni reutilización, continuando desde el máximo real", () => {
  const batch = nextParkingCodeBatch(["PF-001", "PF-002", "PF-003"], 100);
  assert.equal(batch.length, 100);
  assert.equal(batch[0], "PF-004");
  assert.equal(batch[99], "PF-103");
  assert.equal(new Set(batch).size, 100, "sin duplicados dentro del propio lote");
});

test("nextParkingCodeBatch: no trunca más allá de 3 dígitos -- la secuencia es realmente infinita (PF-999 -> PF-1000)", () => {
  const batch = nextParkingCodeBatch(["PF-999"], 3);
  assert.deepEqual(batch, ["PF-1000", "PF-1001", "PF-1002"]);
});

test("replenishParkingCodesIfLow: revisa AVAILABLE con threshold=10 y repone batchSize=100 -- valores por defecto exactamente los aprobados", () => {
  const start = repoSource.indexOf("export async function replenishParkingCodesIfLow");
  const fn = repoSource.slice(start, repoSource.indexOf("\n}\n", start));
  assert.match(fn, /threshold = 10, batchSize = 100/);
  assert.match(fn, /\.eq\("status",\s*"AVAILABLE"\)/);
  assert.match(fn, /if \(\(availableCount\.count \|\| 0\) > threshold\) return \{ replenished: false, added: 0 \};/);
  assert.match(fn, /nextParkingCodeBatch\(/);
});

test("replenishParkingCodesIfLow: un error de reposición nunca se propaga (try/catch propio) -- no puede tumbar la creación del estacionamiento que la disparó", () => {
  const start = repoSource.indexOf("export async function replenishParkingCodesIfLow");
  const fn = repoSource.slice(start, repoSource.indexOf("\n}\n", start));
  assert.match(fn, /try \{[\s\S]*catch \(error\) \{[\s\S]*return \{ replenished: false, added: 0, error: error\?\.message \};/);
});

test("createParkingWithCatalogCode: dispara replenishParkingCodesIfLow DESPUÉS de reclamar el código -- verificación en el momento de asignar, no por cron", () => {
  const start = repoSource.indexOf("export async function createParkingWithCatalogCode");
  const claimIdx = repoSource.indexOf("claimed.data.length === 0", start);
  const replenishIdx = repoSource.indexOf("replenishParkingCodesIfLow(db)", start);
  assert.ok(replenishIdx > claimIdx, "la reposición debe ocurrir después de confirmar la asignación, no antes");
  // No debe importarse ni invocarse ningún módulo/servicio de cron -- la
  // reposición vive enteramente dentro de la llamada síncrona de creación.
  assert.doesNotMatch(repoSource, /import[^\n]*cron/i);
});

// --- 10. No afecta Off Street: mismo componente, mismo dropdown, sin caso especial ---

test("EstacionamientoForm sigue siendo el mismo componente único para Off Street y On Street (OnStreetProjectWizard.js lo reutiliza) -- el catálogo no crea un segundo formulario", async () => {
  const wizardSource = await readFile(new URL("../components/on-street-admin/OnStreetProjectWizard.js", import.meta.url), "utf8");
  assert.match(wizardSource, /<EstacionamientoForm/);
  assert.doesNotMatch(formSource, /if \(onStreet\)[^}]*codigos-disponibles/, "el catálogo de códigos no debe tener una rama especial para On Street");
});
