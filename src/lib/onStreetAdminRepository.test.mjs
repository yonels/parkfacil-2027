import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { applySortAndPaginate, paymentRevenueByGroup, paymentsByDay, resolveParkingCompanyFilter } from "./onStreetDashboardCore.mjs";
import { paymentTypeFromTransaction } from "./onStreetAdminCore.mjs";

// onStreetAdminRepository.js tiene "server-only" (no resoluble bajo
// `node --test`, como el resto de los *Repository.js del proyecto — ver
// usersRepository.js/usersRepositoryCore.mjs). El aislamiento multiempresa
// que scopedParkings aplica se decide en resolveParkingCompanyFilter
// (onStreetDashboardCore.mjs, sin "server-only"), así que se testea ahí
// directamente, sin necesidad de un fake de Supabase.

test("company_admin de Empresa A nunca puede consultar Empresa B, aunque lo intente por parámetro", () => {
  const admin = { role: "company_admin", companyId: "company-a" };
  assert.equal(resolveParkingCompanyFilter(admin), "company-a");
  // Manipular el parámetro companyId (simulando un query param armado a
  // mano) no tiene efecto: el rol no es platform_admin, así que se ignora
  // por completo y se usa siempre context.companyId.
  assert.equal(resolveParkingCompanyFilter(admin, "company-b"), "company-a");
});

test("operator también queda acotado a su propia empresa, sin excepción", () => {
  const operator = { role: "operator", companyId: "company-b" };
  assert.equal(resolveParkingCompanyFilter(operator), "company-b");
  assert.equal(resolveParkingCompanyFilter(operator, "company-a"), "company-b");
});

test("platform_admin ve todas las empresas por defecto (sin filtro)", () => {
  const root = { role: "platform_admin", companyId: null };
  assert.equal(resolveParkingCompanyFilter(root), null);
});

test("platform_admin puede sub-filtrar explícitamente por empresa (selector Root)", () => {
  const root = { role: "platform_admin", companyId: null };
  assert.equal(resolveParkingCompanyFilter(root, "company-b"), "company-b");
});

// Administradores/Operadores On Street (/on-street-qr/administradores,
// /on-street-qr/operadores) reutilizan exactamente esta misma función a
// través de listOnStreetCompanies() para acotar tanto el listado como el
// selector de empresa del formulario "Crear". La creación (POST
// /api/usuarios) y la ficha individual (GET/PATCH /api/usuarios/[id]) no
// se tocaron — siguen protegidas por companyScope/requireCompanyResource,
// ya testeados en apiAuthorizationCore.test.mjs (ahí se prueba
// explícitamente que company_admin de una empresa recibe 404 al intentar
// tocar un recurso de otra).
test("Administradores/Operadores On Street: listOnStreetCompanies nunca expone una empresa ajena a company_admin/operator", () => {
  const adminA = { role: "company_admin", companyId: "company-a" };
  const operatorA = { role: "operator", companyId: "company-a" };
  // Ni manipulando el parámetro (simulando ?companyId=company-b en la URL
  // del endpoint /api/on-street-qr/companies) se obtiene otra empresa.
  assert.equal(resolveParkingCompanyFilter(adminA, "company-b"), "company-a");
  assert.equal(resolveParkingCompanyFilter(operatorA, "company-b"), "company-a");
});

// ============================================================
// "Reportes On Street -> Pagos -> Gráficos" (2026-08-30). getOnStreetReport
// completo no es extraíble (llama a "db" varias veces antes de la rama
// "pagos" -- inspecciones, etc.), así que se extrae y EJECUTA DE VERDAD
// (mismo criterio que periodBoundsFromFilters en
// onStreetSessionsPaymentsPeriod.test.mjs, "new Function" con las
// dependencias reales inyectadas -- nunca una reimplementación) solo la
// rama "if(type==='pagos'){...}" completa, junto con sus 3 helpers de
// módulo (locate/matches/intentMapFor + SIDE_LABELS). Esto prueba el
// código real que corre en el backend: el filtro de Área/Calle/Tramo
// corregido, los 3 filtros de clic (paymentType/operationType/approval) y
// el armado de "charts" -- sin necesidad de un fake de Supabase.
// ============================================================
const repoSource = await readFile(new URL("./onStreetAdminRepository.js", import.meta.url), "utf8");
function sliceFrom(marker, endMarker) {
  const start = repoSource.indexOf(marker);
  assert.ok(start >= 0, `marker no encontrado en onStreetAdminRepository.js: ${marker}`);
  const end = repoSource.indexOf(endMarker, start + marker.length);
  assert.ok(end >= 0, `marker de cierre no encontrado: ${endMarker}`);
  return repoSource.slice(start, end);
}
// Corrección "Reportes On Street -> Pagos: No fue posible cargar el
// reporte" (2026-08-30): la causa raíz real era `.in(columna, arreglo)`
// con un arreglo cercano/superior a REPORT_ROW_CAP=1000 -- PostgREST lo
// expone como parámetro de query string y la URL resultante supera el
// límite real de la plataforma ("URI too long", reproducido contra
// Supabase LOCAL). selectInChunks es el fix: trocea el `.in()` en lotes.
// Se extrae y ejecuta la función REAL (con un "makeQuery" falso que
// registra el tamaño de cada lote y devuelve filas sintéticas) para
// probar tanto el troceo como que el resultado final es la unión completa
// y sin duplicados.
const failSrc = sliceFrom("function fail(result){", "\n");
const inChunkSizeSrc = sliceFrom("const IN_CHUNK_SIZE=", "\n");
const selectInChunksSrc = sliceFrom("async function selectInChunks(makeQuery,ids){", "\n}") + "\n}";
const runSelectInChunks = new Function(`${failSrc}\n${inChunkSizeSrc}\n${selectInChunksSrc}\nreturn selectInChunks;`)();

test("selectInChunks (código real, la corrección de la causa raíz): trocea ids en lotes de 200 y devuelve la unión exacta, sin duplicados ni pérdidas", async () => {
  const ids = Array.from({ length: 450 }, (_, i) => `id-${i}`);
  const chunkSizes = [];
  const result = await runSelectInChunks(async (chunk) => {
    chunkSizes.push(chunk.length);
    return { data: chunk.map((id) => ({ id })), error: null };
  }, ids);
  assert.deepEqual(chunkSizes, [200, 200, 50], "450 ids -> 3 lotes de máximo 200 (nunca un solo .in() con las 450)");
  assert.equal(result.length, 450);
  assert.deepEqual(result.map((r) => r.id).sort(), [...ids].sort(), "la unión de los lotes es exactamente el conjunto original, sin duplicados ni pérdidas");
});

test("selectInChunks: con 0 ids no ejecuta ninguna consulta y devuelve un arreglo vacío", async () => {
  let calls = 0;
  const result = await runSelectInChunks(async () => { calls += 1; return { data: [], error: null }; }, []);
  assert.deepEqual(result, []);
  assert.equal(calls, 0, "sin ids, ni siquiera se llama a makeQuery -- mismo comportamiento que el `sessionIds.length?...:[]` que reemplazó");
});

test("selectInChunks: si un lote falla (result.error), la excepción se propaga (mismo criterio que fail() en el resto del repositorio)", async () => {
  await assert.rejects(
    () => runSelectInChunks(async () => ({ data: null, error: new Error("boom") }), ["a", "b"]),
    /boom/,
  );
});

const sideLabelsSrc = sliceFrom("const SIDE_LABELS=", "\n");
const locateSrc = sliceFrom("function locate(row,map){", "\n");
const matchesSrc = sliceFrom("function matches(location,filters){", "\n");
const intentMapForSrc = sliceFrom("function intentMapFor(intents,id){", "\n");
const pagosBranchSrc = sliceFrom('if(type==="pagos"){', 'if(type==="ubicaciones"');
const runPagosBranch = new Function(
  "paymentAttempts", "intents", "map", "sessionMap", "filters", "bounds", "input", "base", "summary",
  "applySortAndPaginate", "paymentsByDay", "paymentRevenueByGroup", "paymentTypeFromTransaction",
  `${sideLabelsSrc}\n${locateSrc}\n${matchesSrc}\n${intentMapForSrc}\nconst type="pagos";\n${pagosBranchSrc}\n`,
);

// --- Fixture compartida: 2 ubicaciones en jerarquías DISTINTAS (misma
// Estacionamiento, Área/Calle/Tramo diferentes) -- t1 en loc-a, t2
// (extensión de la misma sesión que t1) en loc-b, t3 rechazado en loc-a. ---
function pagosFixture() {
  const map = {
    p: new Map([["p1", { id: "p1", name: "Estacionamiento P1" }]]),
    l: new Map([
      ["loc-a", { id: "loc-a", parking_id: "p1", sector_id: "a1", street_id: "s1", segment_id: "g1" }],
      ["loc-b", { id: "loc-b", parking_id: "p1", sector_id: "a2", street_id: "s2", segment_id: "g2" }],
    ]),
    a: new Map([["a1", { id: "a1", name: "Área 1" }], ["a2", { id: "a2", name: "Área 2" }]]),
    s: new Map([["s1", { id: "s1", name: "Calle 1" }], ["s2", { id: "s2", name: "Calle 2" }]]),
    g: new Map([["g1", { id: "g1", name: "Tramo 1" }], ["g2", { id: "g2", name: "Tramo 2" }]]),
  };
  const intents = [
    { id: "i1", parking_id: "p1", qr_location_id: "loc-a", operation_type: "INITIAL", resulting_session_id: "sess1", target_session_id: null },
    { id: "i2", parking_id: "p1", qr_location_id: "loc-b", operation_type: "EXTENSION", resulting_session_id: null, target_session_id: "sess1" },
    { id: "i3", parking_id: "p1", qr_location_id: "loc-a", operation_type: "INITIAL", resulting_session_id: null, target_session_id: null },
  ];
  const sessionMap = new Map([["sess1", { id: "sess1", operational_number: "OS-1", license_plate_normalized: "ABCD12" }]]);
  const paymentAttempts = [
    { id: "t1", source_id: "i1", status: "COMMITTED", amount: 600, payment_type: "DEBIT", committed_at: "2026-08-10T10:00:00-04:00" },
    { id: "t2", source_id: "i2", status: "COMMITTED", amount: 300, payment_type: "CREDIT", committed_at: "2026-08-11T10:00:00-04:00" },
    { id: "t3", source_id: "i3", status: "REJECTED", amount: 900, payment_type: null, committed_at: null },
  ];
  const bounds = { from: "2026-08-10T00:00:00-04:00", to: "2026-08-11T23:59:59-04:00" };
  return { map, intents, sessionMap, paymentAttempts, bounds };
}
const noFilters = { parkingId: null, areaId: null, streetId: null, segmentId: null };
const emptySummary = { kpis: {}, revenue: {}, paymentMethods: {}, extensions: {}, places: [], inspections: {} };

test("getOnStreetReport (rama pagos, código real): sin filtros de clic, devuelve las 3 filas (2 COMMITTED + 1 REJECTED) con paymentTypeLabel y ubicación resueltos", () => {
  const f = pagosFixture();
  const result = runPagosBranch(f.paymentAttempts, f.intents, f.map, f.sessionMap, noFilters, f.bounds, {}, { bounds: f.bounds }, emptySummary, applySortAndPaginate, paymentsByDay, paymentRevenueByGroup, paymentTypeFromTransaction);
  assert.equal(result.pagination.totalRows, 3);
  const byId = new Map(result.rows.map((r) => [r.id, r]));
  assert.equal(byId.get("t1").paymentTypeLabel, "Débito");
  assert.equal(byId.get("t2").paymentTypeLabel, "Crédito");
  assert.equal(byId.get("t3").paymentTypeLabel, "No informado");
  assert.equal(byId.get("t1").operationType, "INITIAL");
  assert.equal(byId.get("t2").operationType, "EXTENSION");
  assert.equal(byId.get("t2").sessionNumber, "OS-1", "extensión resuelve la sesión vía target_session_id");
});

test("getOnStreetReport (rama pagos): CORRECCIÓN -- Área/Calle/Tramo ahora SÍ acotan Pagos (antes el filtro se ignoraba por completo)", () => {
  const f = pagosFixture();
  const filtered = { ...noFilters, areaId: "a2" };
  const result = runPagosBranch(f.paymentAttempts, f.intents, f.map, f.sessionMap, filtered, f.bounds, {}, { bounds: f.bounds }, emptySummary, applySortAndPaginate, paymentsByDay, paymentRevenueByGroup, paymentTypeFromTransaction);
  assert.equal(result.pagination.totalRows, 1, "área a2 -- solo t2 (loc-b) queda, t1/t3 (loc-a, área a1) se excluyen");
  assert.equal(result.rows[0].id, "t2");
  // Los gráficos también respetan el filtro superior de Área (§4 del
  // requerimiento) -- solo t2 aporta a "charts", nunca t1 (excluido antes
  // de calcular charts, no solo del Detalle).
  assert.deepEqual(result.summary.charts.byParking, [{ id: "p1", label: "Estacionamiento P1", amount: 300, count: 1 }]);
});

test("getOnStreetReport (rama pagos): filtros de clic (paymentType/operationType/approval) acotan SOLO el Detalle -- los gráficos siguen reflejando todos los filtros superiores (§5: deben cuadrar exactamente para el mismo alcance superior)", () => {
  const f = pagosFixture();
  const withoutClickFilter = runPagosBranch(f.paymentAttempts, f.intents, f.map, f.sessionMap, noFilters, f.bounds, {}, { bounds: f.bounds }, emptySummary, applySortAndPaginate, paymentsByDay, paymentRevenueByGroup, paymentTypeFromTransaction);
  const withPaymentTypeClick = runPagosBranch(f.paymentAttempts, f.intents, f.map, f.sessionMap, noFilters, f.bounds, { paymentType: "DEBIT" }, { bounds: f.bounds }, emptySummary, applySortAndPaginate, paymentsByDay, paymentRevenueByGroup, paymentTypeFromTransaction);
  assert.equal(withPaymentTypeClick.pagination.totalRows, 1);
  assert.equal(withPaymentTypeClick.rows[0].id, "t1");
  assert.deepEqual(withPaymentTypeClick.summary.charts, withoutClickFilter.summary.charts, "clic en 'Débito' acota el Detalle, pero los gráficos no cambian (misma agregación de siempre)");

  const withOperationTypeClick = runPagosBranch(f.paymentAttempts, f.intents, f.map, f.sessionMap, noFilters, f.bounds, { operationType: "EXTENSION" }, { bounds: f.bounds }, emptySummary, applySortAndPaginate, paymentsByDay, paymentRevenueByGroup, paymentTypeFromTransaction);
  assert.deepEqual(withOperationTypeClick.rows.map((r) => r.id), ["t2"]);

  const withApprovedClick = runPagosBranch(f.paymentAttempts, f.intents, f.map, f.sessionMap, noFilters, f.bounds, { approval: "approved" }, { bounds: f.bounds }, emptySummary, applySortAndPaginate, paymentsByDay, paymentRevenueByGroup, paymentTypeFromTransaction);
  assert.deepEqual(withApprovedClick.rows.map((r) => r.id).sort(), ["t1", "t2"]);

  const withRejectedClick = runPagosBranch(f.paymentAttempts, f.intents, f.map, f.sessionMap, noFilters, f.bounds, { approval: "rejected" }, { bounds: f.bounds }, emptySummary, applySortAndPaginate, paymentsByDay, paymentRevenueByGroup, paymentTypeFromTransaction);
  assert.deepEqual(withRejectedClick.rows.map((r) => r.id), ["t3"]);
});

test("getOnStreetReport (rama pagos, código real): búsqueda por patente resuelve la patente de la sesión resultante/objetivo del intent (t1/t2 comparten sesión 'ABCD12')", () => {
  const f = pagosFixture();
  const withPlate = runPagosBranch(f.paymentAttempts, f.intents, f.map, f.sessionMap, noFilters, f.bounds, { plate: "abcd" }, { bounds: f.bounds }, emptySummary, applySortAndPaginate, paymentsByDay, paymentRevenueByGroup, paymentTypeFromTransaction);
  assert.deepEqual(withPlate.rows.map((r) => r.id).sort(), ["t1", "t2"], "t1 (INITIAL) y t2 (EXTENSION) comparten la misma sesión 'ABCD12' -- ambos coinciden; t3 (sin sesión resultante) no");
  const noMatch = runPagosBranch(f.paymentAttempts, f.intents, f.map, f.sessionMap, noFilters, f.bounds, { plate: "ZZZZ" }, { bounds: f.bounds }, emptySummary, applySortAndPaginate, paymentsByDay, paymentRevenueByGroup, paymentTypeFromTransaction);
  assert.deepEqual(noMatch.rows, []);
});

test("getOnStreetReport (rama pagos): summary.charts.byDay/byParking/byArea/byStreet/bySegment cuadran exactamente con la suma de las filas COMMITTED del Detalle (sin filtros de clic)", () => {
  const f = pagosFixture();
  const result = runPagosBranch(f.paymentAttempts, f.intents, f.map, f.sessionMap, noFilters, f.bounds, {}, { bounds: f.bounds }, emptySummary, applySortAndPaginate, paymentsByDay, paymentRevenueByGroup, paymentTypeFromTransaction);
  const committedTotal = result.rows.filter((r) => r.status === "COMMITTED").reduce((sum, r) => sum + Number(r.amount), 0);
  assert.equal(committedTotal, 900);
  assert.equal(result.summary.charts.byDay.reduce((sum, d) => sum + d.amount, 0), committedTotal);
  assert.equal(result.summary.charts.byParking.reduce((sum, g) => sum + g.amount, 0), committedTotal);
  assert.equal(result.summary.charts.byArea.reduce((sum, g) => sum + g.amount, 0), committedTotal);
  assert.equal(result.summary.charts.byStreet.reduce((sum, g) => sum + g.amount, 0), committedTotal);
  assert.equal(result.summary.charts.bySegment.reduce((sum, g) => sum + g.amount, 0), committedTotal);
});

// "Reportes On Street -> Resumen" / "Gráficos" (página integral, 2026-08-30):
// reutiliza getOnStreetDashboardOverview (mismo endpoint que el Dashboard,
// /api/on-street-qr/dashboard/overview) -- se confirma por fuente que
// sessionsByHourOfDay ("Horarios de mayor uso") quedó cableado en AMBAS
// ramas (alcance vacío y alcance real), igual criterio que el resto de
// gráficos ya existentes de ese mismo objeto de retorno.
test("getOnStreetDashboardOverview: expone sessionsByHourOfDay ('Horarios de mayor uso') en la rama de alcance vacío y en la real", () => {
  assert.match(repoSource, /sessionsByHourOfDay:sessionsByHourOfDay\(\[\]\)/, "alcance vacío -- nunca undefined, mismo criterio que revenueByHourOfDay:revenueByHourOfDay([])");
  assert.match(repoSource, /sessionsByHourOfDay:sessionsByHourOfDay\(sessions\)/, "alcance real -- calculado sobre las mismas sesiones ya acotadas por fetchOnStreetScopedData");
});

// --- Búsqueda por patente + filtro de clic por estado (§ página integral
// "Reportes On Street", 2026-08-30, requisito "buscar" de las tablas). Se
// extraen y ejecutan las líneas REALES (no una reimplementación) de cada
// rama, contra un "rows" sintético -- mismo criterio que selectInChunks
// arriba. ---
function runFilterSnippet(snippetSrc, rows, input) {
  const fn = new Function("rows", "input", `${snippetSrc}\nreturn rows;`);
  return fn(rows, input);
}
const sesionesPlateStatusSrc = sliceFrom(
  'if(input.plate){const needle=String(input.plate).toUpperCase();rows=rows.filter(r=>String(r.license_plate_normalized||"").toUpperCase().includes(needle));}',
  "\n",
) + "\n" + sliceFrom(
  'if(input.status&&["ACTIVE","CLOSED","EXPIRED"].includes(input.status))rows=rows.filter(r=>r.status===input.status);',
  "\n",
);
test("getOnStreetReport (rama sesiones, código real): búsqueda por patente (case-insensitive, coincidencia parcial) y filtro de clic por estado (p.ej. KPI 'Sesiones activas')", () => {
  const rows = [
    { id: "s1", license_plate_normalized: "ABCD12", status: "ACTIVE" },
    { id: "s2", license_plate_normalized: "xyzw99", status: "EXPIRED" },
    { id: "s3", license_plate_normalized: "ABCE34", status: "ACTIVE" },
  ];
  assert.deepEqual(runFilterSnippet(sesionesPlateStatusSrc, rows, { plate: "abc" }).map((r) => r.id), ["s1", "s3"], "búsqueda case-insensitive por coincidencia parcial de patente");
  assert.deepEqual(runFilterSnippet(sesionesPlateStatusSrc, rows, { status: "ACTIVE" }).map((r) => r.id), ["s1", "s3"], "clic en 'Sesiones activas' -> status=ACTIVE");
  assert.deepEqual(runFilterSnippet(sesionesPlateStatusSrc, rows, { status: "EXPIRED" }).map((r) => r.id), ["s2"], "clic en 'Sesiones vencidas' -> status=EXPIRED");
  assert.deepEqual(runFilterSnippet(sesionesPlateStatusSrc, rows, {}).map((r) => r.id), ["s1", "s2", "s3"], "sin filtro -- todas las filas, sin cambios");
  assert.deepEqual(runFilterSnippet(sesionesPlateStatusSrc, rows, { status: "BOGUS" }).map((r) => r.id), ["s1", "s2", "s3"], "un status no reconocido se ignora -- nunca vacía la tabla por un valor inválido");
});

const extensionesPlateSrc = sliceFrom(
  'if(input.plate){const needle=String(input.plate).toUpperCase();rows=rows.filter(r=>String(r.licensePlate||"").toUpperCase().includes(needle));}',
  "\n",
);
test("getOnStreetReport (rama extensiones, código real): búsqueda por patente", () => {
  const rows = [{ id: "e1", licensePlate: "ABCD12" }, { id: "e2", licensePlate: "ZZZZ99" }];
  assert.deepEqual(runFilterSnippet(extensionesPlateSrc, rows, { plate: "abcd" }).map((r) => r.id), ["e1"]);
  assert.deepEqual(runFilterSnippet(extensionesPlateSrc, rows, {}).map((r) => r.id), ["e1", "e2"]);
});
