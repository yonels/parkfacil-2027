import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildFlowSeries, buildHourlyFlow, buildOccupancy, flowRange, monthRange, operationalInstant, paymentsFromRevenue, summarizeActivity, summarizeFlow } from "./generalDashboardCore.mjs";

// 12:00 UTC = 09:00 en Santiago (noviembre, UTC-3).
const filas = [
  { entry_at: "2026-11-05T12:00:00Z", exit_at: "2026-11-05T13:00:00Z", status: "PAID" },
  { entry_at: "2026-11-05T14:00:00Z", exit_at: null, status: "OPEN" },
  { entry_at: "2026-11-05T15:00:00Z", exit_at: null, status: "CANCELLED" },
  { entry_at: "2026-11-05T16:00:00Z", exit_at: "2026-11-05T17:00:00Z", status: "UNPAID_EXIT" },
  { entry_at: "2026-11-04T12:00:00Z", exit_at: "2026-11-05T12:30:00Z", status: "PAID" },
  { entry_at: "2026-10-31T12:00:00Z", exit_at: "2026-10-31T13:00:00Z", status: "PAID" },
];

test("la actividad usa las mismas reglas que el detalle", () => {
  assert.deepEqual(summarizeActivity(filas, "2026-11-05", "2026-11-05"), { pendientes: 1, ingresos: 4, salidas: 2, anulados: 1 });
  assert.deepEqual(summarizeActivity(filas, "2026-11-01", "2026-11-05"), { pendientes: 1, ingresos: 5, salidas: 2, anulados: 1 });
});

test("el día operacional es el de Santiago, no el de UTC", () => {
  const noche = [{ entry_at: "2026-11-06T01:30:00Z", exit_at: null, status: "OPEN" }];
  assert.equal(summarizeActivity(noche, "2026-11-05", "2026-11-05").ingresos, 1);
  assert.equal(summarizeActivity(noche, "2026-11-06", "2026-11-06").ingresos, 0);
});

test("medios de pago: totales, participación y caso sin ingresos", () => {
  const pagos = paymentsFromRevenue({ cashAmount: 100, debitAmount: 0, creditAmount: 300, unclassifiedCardAmount: 0, count: 4 });
  assert.equal(pagos.total, 400);
  assert.equal(pagos.count, 4);
  assert.deepEqual(pagos.shares, { efectivo: 25, debito: 0, credito: 75, sinClasificar: 0 });
  assert.equal(paymentsFromRevenue({}).shares.credito, 0);
});

test("flujo diario con días sin movimiento y resumen", () => {
  const serie = buildFlowSeries(filas, "2026-11-03", "2026-11-05");
  assert.deepEqual(serie.map((item) => [item.label, item.from, item.entries, item.exits]), [["3 Nov", "2026-11-03", 0, 0], ["4 Nov", "2026-11-04", 1, 0], ["5 Nov", "2026-11-05", 4, 2]]);
  assert.deepEqual(summarizeFlow(serie), { busiestLabel: "5 Nov", balance: 3, averageEntries: 2 });
  assert.deepEqual(summarizeFlow([]), { busiestLabel: null, balance: 0, averageEntries: 0 });
});

test("flujo anual agrupa por mes, con rango real para el detalle", () => {
  const serie = buildFlowSeries(filas, "2026-10-01", "2026-11-05", "month");
  assert.deepEqual(serie.map((item) => [item.label, item.from, item.to, item.entries, item.exits]), [["Oct 2026", "2026-10-01", "2026-10-31", 1, 1], ["Nov 2026", "2026-11-01", "2026-11-05", 5, 2]]);
});

test("rangos de período y de mes, incluido febrero", () => {
  assert.deepEqual(flowRange("7 días", "2026-11-05"), { from: "2026-10-30", to: "2026-11-05", group: "day" });
  assert.deepEqual(flowRange("Hoy", "2026-11-05"), { from: "2026-11-05", to: "2026-11-05", group: "day" });
  assert.deepEqual(flowRange("Mes", "2026-11-05"), { from: "2026-11-01", to: "2026-11-05", group: "day" });
  assert.deepEqual(flowRange("Año", "2026-11-05"), { from: "2026-01-01", to: "2026-11-05", group: "month" });
  assert.deepEqual(monthRange("2026-02"), { from: "2026-02-01", to: "2026-02-28" });
});

test("flujo por hora en bloques de 3 horas, en hora de Santiago", () => {
  const horas = buildHourlyFlow(filas, "2026-11-05");
  assert.equal(horas.length, 8);
  assert.deepEqual(horas.find((h) => h.hour === "09:00"), { hour: "09:00", entries: 2, exits: 2 });
  assert.deepEqual(horas.find((h) => h.hour === "12:00"), { hour: "12:00", entries: 2, exits: 0 });
});

test("instante de Santiago, con horario de verano e invierno", () => {
  assert.equal(operationalInstant("2026-11-05", 9).toISOString(), "2026-11-05T12:00:00.000Z");
  assert.equal(operationalInstant("2026-07-15", 9).toISOString(), "2026-07-15T13:00:00.000Z");
});

test("ocupación: presentes sobre capacidad, sin anulados ni franjas futuras", () => {
  const now = new Date("2026-11-05T14:00:00Z"); // jueves 11:00 en Santiago
  const presentes = [
    { entry_at: "2026-11-05T11:00:00Z", exit_at: null, status: "OPEN" },
    { entry_at: "2026-11-05T11:00:00Z", exit_at: null, status: "CANCELLED" },
  ];
  const r = buildOccupancy(presentes, 10, "2026-11-05", now);
  const jueves = r.rows.find((row) => row.day === "Jueves");
  assert.equal(jueves.values[0] < 10 && jueves.values[0] >= 0, true); // 06–09 promediado con 3 jueves anteriores vacíos
  assert.equal(jueves.values[1], 3); // 09–12: 1 de 10, promediado con 3 jueves vacíos
  assert.equal(jueves.values[1] > 0, true);
  assert.equal(r.peak.day, "Jueves");
  assert.equal(buildOccupancy([], 0, "2026-11-05", now).rows[0].values[0], null);
  assert.equal(buildOccupancy([], 10, "2026-11-05", now).peak, null);
});

test("la pantalla ya no contiene cifras de ejemplo ni marcas de prototipo", () => {
  const page = readFileSync(new URL("../app/modelo-dashboard/page.js", import.meta.url), "utf8");
  for (const fijo of ["Modelo de prueba", "Prototipo", "1.388", "month: 1388", "flowData = [", "hourlyFlow = [", "occupancyHeatmap = [", "2026-07-28", "27 Jul", "dayFactor", "viernes 15:00"]) {
    assert.equal(page.includes(fijo), false, fijo);
  }
  assert.match(page, /\/api\/dashboard-general/);
});

test("la API exige el mismo permiso y aislamiento que el detalle", () => {
  const route = readFileSync(new URL("../app/api/dashboard-general/route.js", import.meta.url), "utf8");
  assert.match(route, /PERMISSIONS\.REPORTS_READ/);
  assert.match(route, /listParkings\(db, authorization\.scope\)/);
});
