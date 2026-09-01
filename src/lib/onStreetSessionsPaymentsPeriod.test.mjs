import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolvePeriodBounds } from "./onStreetDashboardCore.mjs";

// periodBoundsFromFilters vive en onStreetAdminRepository.js ("server-only",
// no importable directo con node --test, mismo criterio que el resto del
// módulo). Se extrae y ejecuta de verdad con `new Function`, inyectando la
// MISMA resolvePeriodBounds real (no un mock) -- mismo patrón ya usado en
// inspectorInspectionService.test.mjs para sendInspectionSmsIfNeeded.
const repoSource = await readFile(new URL("./onStreetAdminRepository.js", import.meta.url), "utf8");
const start = repoSource.indexOf("function periodBoundsFromFilters");
const end = repoSource.indexOf("\n}", start) + 2;
const fnSrc = repoSource.slice(start, end);
const periodBoundsFromFilters = new Function("resolvePeriodBounds", `return (${fnSrc});`)(resolvePeriodBounds);

test("periodBoundsFromFilters: Hoy/7 días/Mes/Año relativos, delegando 100% en resolvePeriodBounds (misma política de timezone)", () => {
  for (const period of ["today", "7d", "month", "year"]) {
    const bounds = periodBoundsFromFilters({ period });
    assert.ok(Array.isArray(bounds) && bounds.length === 2, period);
  }
});

test("periodBoundsFromFilters: Mes/Año arbitrarios (Agosto 2026 / 2026) llegan completos hasta la consulta", () => {
  const mes = periodBoundsFromFilters({ period: "month", month: 8, year: 2026 });
  assert.equal(mes[0], "2026-08-01T04:00:00.000Z");
  const anio = periodBoundsFromFilters({ period: "year", year: 2026 });
  assert.equal(anio[0], "2026-01-01T04:00:00.000Z");
  assert.equal(anio[1], "2027-01-01T03:59:59.999Z");
});

test("periodBoundsFromFilters: personalizado (rango de días) respeta Desde/Hasta exactos, incluyendo el día completo de 'Hasta'", () => {
  const bounds = periodBoundsFromFilters({ period: "custom", from: "2026-08-01", to: "2026-08-26" });
  assert.equal(bounds[0], "2026-08-01T04:00:00.000Z");
  assert.equal(bounds[1], "2026-08-27T03:59:59.999Z"); // 26-08 23:59:59.999 -04:00 -- el 26 completo queda incluido
});

test("periodBoundsFromFilters: 'día específico' vía personalizado Desde=Hasta cubre el día completo (00:00 a 23:59:59.999 -04:00)", () => {
  const bounds = periodBoundsFromFilters({ period: "custom", from: "2026-08-28", to: "2026-08-28" });
  assert.equal(bounds[0], "2026-08-28T04:00:00.000Z");
  assert.equal(bounds[1], "2026-08-29T03:59:59.999Z");
});

test("periodBoundsFromFilters: sin 'period' pero con 'date' (retrocompatibilidad con un enlace/filtro guardado antiguo) se interpreta como un solo día completo", () => {
  const bounds = periodBoundsFromFilters({ date: "2026-08-15" });
  assert.equal(bounds[0], "2026-08-15T04:00:00.000Z");
  assert.equal(bounds[1], "2026-08-16T03:59:59.999Z");
});

test("periodBoundsFromFilters: sin period ni date, no hay límite -- lista todo el alcance (mismo comportamiento que el dayBounds(null) de siempre)", () => {
  assert.equal(periodBoundsFromFilters({}), null);
  assert.equal(periodBoundsFromFilters({ parkingId: "algo" }), null);
});

// --- Combinación con el resto de los filtros (Empresa/Estacionamiento/
// Área/Calle/Tramo) -- verificado por fuente: el período se aplica sobre
// la MISMA query ya acotada por scopedParkings(companyId)/matches(), nunca
// reemplaza esos filtros. ---

test("listOnStreetSessions/listOnStreetPayments: el período se combina con Empresa/Estacionamiento/Área/Calle/Tramo -- no los reemplaza ni los ignora", () => {
  assert.match(repoSource, /scopedParkings\(db,context,input\.companyId\|\|null\)/, "Empresa sigue acotando qué estacionamientos entran a la consulta ANTES del período");
  assert.match(repoSource, /const bounds=periodBoundsFromFilters\(filters\);if\(bounds\)query=query\.gte\("started_at",bounds\[0\]\)\.lte\("started_at",bounds\[1\]\)/, "Sesiones filtra por started_at");
  assert.match(repoSource, /const bounds=periodBoundsFromFilters\(sessionData\.filters\);if\(bounds\)query=query\.gte\("created_at",bounds\[0\]\)\.lte\("created_at",bounds\[1\]\)/, "Pagos filtra por created_at");
  assert.match(repoSource, /\.filter\(row=>matches\(row\.location,filters\)\)/, "Área/Calle/Tramo se siguen aplicando sobre las filas ya acotadas por período");
});

// --- Paginación/ordenamiento/exportación server-side real (§ corrección
// "eliminar límite de 1000" 2026-08-28): OnStreetWorkspace ya no confía en
// el export propio de ParkFacilDataGrid (que solo vería la página actual
// en serverMode, por diseño -- ver el comentario en ParkFacilDataGrid.js).
// El botón propio "EXPORTAR A EXCEL" recorre TODAS las páginas server-side
// (fetchAllPages) antes de generar el archivo. ---

test("OnStreetWorkspace: Sesiones/Pagos usan serverMode con paginación real (page/pageSize/sort delegados al servidor, nunca todo el universo en memoria)", async () => {
  const src = await readFile(new URL("../components/on-street-admin/OnStreetWorkspace.js", import.meta.url), "utf8");
  const sessionsGrid = src.slice(src.indexOf('kind==="sessions"?<ParkFacilDataGrid'), src.indexOf('kind==="payments"?<ParkFacilDataGrid'));
  const paymentsGrid = src.slice(src.indexOf('kind==="payments"?<ParkFacilDataGrid'), src.indexOf('kind==="dashboard"?<ParkFacilDataGrid'));
  for (const grid of [sessionsGrid, paymentsGrid]) {
    assert.match(grid, /serverMode/);
    assert.match(grid, /pagination=\{pagination\}/);
    assert.match(grid, /onPageChange=\{setPage\}/);
    assert.match(grid, /onPageSizeChange=\{setPageSize\}/);
    assert.match(grid, /onSortChange=\{/);
  }
  assert.match(src, /rows=\{data\.rows\|\|\[\]\}/g);
});

test("OnStreetWorkspace: exportación Excel completa recorre TODAS las páginas del servidor (fetchAllPages), nunca exporta solo data.rows (la página actual)", async () => {
  const src = await readFile(new URL("../components/on-street-admin/OnStreetWorkspace.js", import.meta.url), "utf8");
  assert.match(src, /async function fetchAllPages\(path, baseParams, totalRows\)/);
  assert.match(src, /for \(let page = 1; page <= pages; page \+= 1\)/, "debe recorrer todas las páginas, no solo la primera");
  assert.match(src, /const rows=await fetchAllPages\(path,buildParams\(\{page:undefined,pageSize:undefined\}\),totalRows\);/);
});
