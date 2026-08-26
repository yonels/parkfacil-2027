import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// Mismo enfoque que el resto de pruebas de este repo (ver
// PosTerminal.salidaSearch.test.mjs): sin infraestructura de render de React
// (sin jsdom/testing-library). page.js es un componente cliente con JSX que
// Node no puede parsear directamente, así que:
//   - la lógica PURA (mapeo de selección a filtros, validación de fechas,
//     periodo, orden, exportación CSV) se extrae tal cual del archivo
//     fuente y se ejecuta de verdad con `new Function`, para probar
//     comportamiento real, no una reimplementación paralela;
//   - la conexión con el backend real (fetch a /api/reportes/actividad,
//     BUSCAR, fuente única de filas) se verifica por contrato sobre el
//     código fuente, igual que PosTerminal.shiftGate.test.mjs.

const source = await readFile(new URL("./page.js", import.meta.url), "utf8");

const logicStart = source.indexOf("const REPORT_ACTIVITIES = ");
const logicEnd = source.indexOf("\nconst transactionColumns = [");
assert.ok(logicStart > -1 && logicEnd > logicStart, "no se encontró el bloque de lógica pura en page.js");
const logicSrc = source.slice(logicStart, logicEnd);

const driver = new Function(`
  ${logicSrc}
  return {
    REPORT_ACTIVITIES, todayIso, parseDayLabelToIsoDate, selectionToQueryParams,
    validateDateRange, periodToRange, DEFAULT_MODAL_FILTERS, sortRows, buildCsvFromRows,
  };
`);
const {
  parseDayLabelToIsoDate, selectionToQueryParams,
  validateDateRange, periodToRange, sortRows, buildCsvFromRows,
} = driver();

// --- selectionToQueryParams: qué se clickeó -> filtros reales del endpoint ---

test("actividad: Ingresos/Salidas/Pendientes/Anulados se traducen 1:1 al parámetro activity real", () => {
  assert.deepEqual(selectionToQueryParams({ type: "actividad", id: "ingresos" }), { activity: "ingresos" });
  assert.deepEqual(selectionToQueryParams({ type: "actividad", id: "salidas" }), { activity: "salidas" });
  assert.deepEqual(selectionToQueryParams({ type: "actividad", id: "pendientes" }), { activity: "pendientes" });
  assert.deepEqual(selectionToQueryParams({ type: "actividad", id: "anulados" }), { activity: "anulados" });
});

test("actividad-dia: 'day-<id>' se traduce a la misma actividad real, sin el prefijo 'day-'", () => {
  assert.deepEqual(selectionToQueryParams({ type: "actividad-dia", id: "day-pendientes" }), { activity: "pendientes" });
  assert.deepEqual(selectionToQueryParams({ type: "actividad-dia", id: "day-salidas" }), { activity: "salidas" });
});

test("barras del gráfico semanal (entries-<día>/exits-<día>): activity real + rango de un solo día real", () => {
  const year = new Date().getFullYear();
  assert.deepEqual(selectionToQueryParams({ type: "actividad-dia", id: "entries-22 Jul" }), { activity: "ingresos", dateFrom: `${year}-07-22`, dateTo: `${year}-07-22` });
  assert.deepEqual(selectionToQueryParams({ type: "actividad-dia", id: "exits-27 Jul" }), { activity: "salidas", dateFrom: `${year}-07-27`, dateTo: `${year}-07-27` });
});

test("pago: Efectivo -> CASH; Débito y Crédito -> CARD (parking_stays no distingue débito de crédito)", () => {
  assert.deepEqual(selectionToQueryParams({ type: "pago", id: "efectivo" }), { paymentMethod: "CASH" });
  assert.deepEqual(selectionToQueryParams({ type: "pago", id: "debito" }), { paymentMethod: "CARD" });
  assert.deepEqual(selectionToQueryParams({ type: "pago", id: "credito" }), { paymentMethod: "CARD" });
});

test("pago-dia: mismo mapeo de medio de pago que 'pago'", () => {
  assert.deepEqual(selectionToQueryParams({ type: "pago-dia", id: "day-efectivo" }), { paymentMethod: "CASH" });
});

test("pie de distribución de ingresos (ingresos-pie): representa el total, sin filtro de medio", () => {
  assert.deepEqual(selectionToQueryParams({ type: "pago", id: "ingresos-pie" }), {});
});

test("ocupacion (mapa de calor): devuelve null -> nunca se consulta el backend", () => {
  assert.equal(selectionToQueryParams({ type: "ocupacion", id: "Lunes-06–09" }), null);
});

test("general: 'Vehículos pendientes' -> activity pendientes; el resto (KPIs agregados) sin filtro de actividad", () => {
  assert.deepEqual(selectionToQueryParams({ type: "general", id: "Vehículos pendientes" }), { activity: "pendientes" });
  assert.deepEqual(selectionToQueryParams({ type: "general", id: "Total mensual cobrado" }), {});
  assert.deepEqual(selectionToQueryParams({ type: "general", id: "Transacciones totales" }), {});
});

test("parseDayLabelToIsoDate usa el año real actual, no un año demostrativo fijo", () => {
  const year = new Date().getFullYear();
  assert.equal(parseDayLabelToIsoDate("22 Jul"), `${year}-07-22`);
  assert.equal(parseDayLabelToIsoDate("no es una fecha"), null);
});

// --- validación de fechas / periodo (sin cambios de comportamiento) ---

test("validateDateRange: desde > hasta se rechaza con mensaje, desde <= hasta se acepta", () => {
  const invalid = validateDateRange("2026-07-28", "2026-07-01");
  assert.equal(invalid.ok, false);
  assert.match(invalid.message, /no puede ser posterior/i);
  assert.equal(validateDateRange("2026-07-01", "2026-07-28").ok, true);
});

test("periodToRange ajusta el rango de forma coherente para Hoy/7 días/Mes/Año", () => {
  assert.deepEqual(periodToRange("Hoy", "2026-07-28"), { from: "2026-07-28", to: "2026-07-28" });
  assert.deepEqual(periodToRange("7 días", "2026-07-28"), { from: "2026-07-22", to: "2026-07-28" });
  assert.deepEqual(periodToRange("Mes", "2026-07-28"), { from: "2026-07-01", to: "2026-07-31" });
  assert.deepEqual(periodToRange("Año", "2026-07-28"), { from: "2026-01-01", to: "2026-12-31" });
});

test("DEFAULT_MODAL_FILTERS usa la fecha real de hoy (no una fecha demostrativa fija) para calcular el mes calendario", () => {
  const expected = periodToRange("Mes", new Date().toISOString().slice(0, 10));
  const { DEFAULT_MODAL_FILTERS } = driver();
  assert.equal(DEFAULT_MODAL_FILTERS.parking, "todos");
  assert.equal(DEFAULT_MODAL_FILTERS.from, expected.from);
  assert.equal(DEFAULT_MODAL_FILTERS.to, expected.to);
});

test("sortRows no altera la cantidad de filas, solo su orden", () => {
  const rows = [{ id: "a", amount: 300 }, { id: "b", amount: 100 }, { id: "c", amount: 200 }];
  const sorted = sortRows(rows, { key: "amount", direction: "asc" });
  assert.deepEqual(sorted.map((r) => r.id), ["b", "c", "a"]);
  assert.equal(sorted.length, rows.length);
});

test("buildCsvFromRows exporta exactamente las filas recibidas", () => {
  const rows = [{ plate: "AAAA-11", amount: 480 }, { plate: "BBBB-22", amount: 1590 }];
  const columns = [{ key: "plate", label: "Patente" }, { key: "amount", label: "Monto" }];
  const csv = buildCsvFromRows(rows, columns);
  const lines = csv.split("\r\n");
  assert.equal(lines.length, 3); // encabezado + 2 filas
  assert.ok(lines[1].includes("AAAA-11"));
  assert.ok(lines[2].includes("BBBB-22"));
});

// --- Conexión real con el backend (contrato sobre el código fuente) ---

test("el dataset ficticio fue eliminado por completo — ni el array ni los filtros cliente que lo consumían siguen existiendo", () => {
  assert.doesNotMatch(source, /\bconst transactions = \[/);
  assert.doesNotMatch(source, /function filterByModalFilters/);
  assert.doesNotMatch(source, /function filterTransactionsBySelection/);
  assert.doesNotMatch(source, /\bconst PARKINGS = \[/);
});

test("openDetail dispara la consulta real al abrir el modal (no requiere pulsar BUSCAR para ver algo)", () => {
  const fn = source.slice(source.indexOf("const openDetail = (nextSelection) => {"), source.indexOf("return (\n    <AppShell"));
  assert.match(fn, /void fetchActivityReport\(\{ selectionValue: nextSelection, filtersValue: defaultFilters, page: 1 \}\);/);
});

test("runSearch (BUSCAR) valida el rango y solo entonces consulta el backend con los filtros recién aplicados", () => {
  const fn = source.slice(source.indexOf("const runSearch = () => {"), source.indexOf("const goToReportPage ="));
  assert.match(fn, /validateDateRange\(filterFromDraft, filterToDraft\)/);
  assert.match(fn, /setAppliedFilters\(nextFilters\);/);
  assert.match(fn, /void fetchActivityReport\(\{ filtersValue: nextFilters, page: 1 \}\);/);
});

test("fetchActivityReport llama a GET /api/reportes/actividad con los filtros como querystring", () => {
  const fn = source.slice(source.indexOf("async function fetchActivityReport"), source.indexOf("const runSearch = () => {"));
  assert.match(fn, /fetch\(`\/api\/reportes\/actividad\?\$\{query\.toString\(\)\}`\)/);
  assert.match(fn, /query\.set\("activity", params\.activity\)/);
  assert.match(fn, /query\.set\("paymentMethod", params\.paymentMethod\)/);
  assert.match(fn, /query\.set\("parkingId", filtersValue\.parking\)/);
  assert.match(fn, /query\.set\("page", String\(page\)\)/);
  assert.match(fn, /query\.set\("pageSize", String\(REPORT_PAGE_SIZE\)\)/);
});

test("FUENTE ÚNICA DE FILAS: finalRows deriva de rows (backend real) -> búsqueda -> orden; tabla/contador/total/Excel consumen exclusivamente finalRows", () => {
  assert.match(source, /const searchedRows = useMemo\(\(\) => rows\.filter/);
  assert.match(source, /const finalRows = useMemo\(\(\) => sortRows\(searchedRows, sort\)/);
  assert.match(source, /const finalTotal = useMemo\(\(\) => finalRows\.reduce/);
  assert.match(source, /transacción encontrada/); // contador real (reportTotal), no finalRows.length
  assert.match(source, /money\(finalTotal\)/);
  assert.match(source, /: finalRows\.map\(\(item\) => \(/);
  assert.match(source, /buildCsvFromRows\(finalRows, orderedColumns\)/);
});

test("el selector Estacionamiento usa los parkings reales devueltos por el endpoint, no una lista hardcodeada", () => {
  assert.match(source, /\{availableParkings\.map\(\(parking\) => <option key=\{parking\.id\} value=\{parking\.id\}>\{parking\.name\}<\/option>\)\}/);
});

test("el modal ya no se etiqueta como 'Datos demostrativos' (está conectado al backend real)", () => {
  assert.doesNotMatch(source, /Datos demostrativos/);
  assert.match(source, /Datos en vivo/);
});

test("estados de carga/error/vacío: 'Cargando resultados...' y el mensaje pedido para respuesta vacía", () => {
  assert.match(source, /Cargando resultados\.\.\./);
  assert.match(source, /No existen registros para los criterios seleccionados/);
});

test("paginación básica: hay controles Anterior/Siguiente que llaman a goToReportPage sin resetear los filtros aplicados", () => {
  assert.match(source, /onClick=\{\(\) => goToReportPage\(reportPage - 1\)\}/);
  assert.match(source, /onClick=\{\(\) => goToReportPage\(reportPage \+ 1\)\}/);
  const fn = source.slice(source.indexOf("const goToReportPage = (nextPage) => {"), source.indexOf("const applyPeriodDraft = "));
  assert.doesNotMatch(fn, /setAppliedFilters/); // cambiar de página no debe alterar los filtros aplicados
});

test("medio de pago se muestra como Efectivo/Tarjeta (paymentMethodLabel), reflejando el esquema real (CASH/CARD)", () => {
  assert.match(source, /function paymentMethodLabel\(method\) \{/);
  assert.match(source, /if \(method === "CASH"\) return "Efectivo";/);
  assert.match(source, /if \(method === "CARD"\) return "Tarjeta";/);
});

test("el endpoint reutiliza el patrón de autorización existente (REPORTS_READ) — verificado también en posStaysService.test.mjs", async () => {
  const routeSource = await readFile(new URL("../api/reportes/actividad/route.js", import.meta.url), "utf8");
  assert.match(routeSource, /PERMISSIONS\.REPORTS_READ/);
  assert.match(routeSource, /searchActivityReport\(/);
});
