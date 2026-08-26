import test from "node:test";
import assert from "node:assert/strict";
import {
  computeKpis,
  extensionsBreakdown,
  locationRanking,
  minutesDistribution,
  operationalAlerts,
  resolvePeriodBounds,
  revenueByDay,
  sessionsByDay,
  sortLocationRanking,
  statusDistribution,
  visibleSessionStatus,
} from "./onStreetDashboardCore.mjs";

const NOW = new Date("2026-08-22T15:00:00-04:00");

test("resolvePeriodBounds: hoy/7 días/mes/año producen rangos coherentes", () => {
  const today = resolvePeriodBounds("today", { now: NOW });
  assert.equal(today.from.slice(0, 10), "2026-08-22");
  assert.equal(today.to, NOW.toISOString());

  const week = resolvePeriodBounds("7d", { now: NOW });
  assert.equal(week.from.slice(0, 10), "2026-08-16");

  const month = resolvePeriodBounds("month", { now: NOW });
  assert.equal(month.from.slice(0, 10), "2026-08-01");

  const year = resolvePeriodBounds("year", { now: NOW });
  assert.equal(year.from.slice(0, 10), "2026-01-01");
});

test("resolvePeriodBounds: personalizado exige from/to válidos y coherentes", () => {
  assert.equal(resolvePeriodBounds("custom", { now: NOW }), null);
  assert.equal(resolvePeriodBounds("custom", { from: "2026-08-10", to: "2026-08-01", now: NOW }), null);
  const range = resolvePeriodBounds("custom", { from: "2026-08-01", to: "2026-08-10", now: NOW });
  // from/to se devuelven en ISO/UTC (Date#toISOString) — el "to" de las
  // 23:59:59.999 en horario de Chile (-04:00) cae ya el día siguiente en
  // UTC. Se compara contra el instante exacto en vez del prefijo de fecha
  // para no depender de la zona horaria del que lee el test.
  assert.equal(range.from, new Date("2026-08-01T00:00:00.000-04:00").toISOString());
  assert.equal(range.to, new Date("2026-08-10T23:59:59.999-04:00").toISOString());
});

test("resolvePeriodBounds: período desconocido devuelve null (sin inventar un rango)", () => {
  assert.equal(resolvePeriodBounds("no-existe", { now: NOW }), null);
});

test("computeKpis: estado vacío no produce NaN ni división por cero", () => {
  const kpis = computeKpis({ sessions: [], extensions: [], paymentAttempts: [], activeSessionsNow: 0 });
  assert.equal(kpis.sessionsInPeriod, 0);
  assert.equal(kpis.revenue, 0);
  assert.equal(kpis.averageTicket, 0);
  assert.equal(kpis.averageMinutesPerSession, 0);
  assert.equal(kpis.approvalRate, 0);
  assert.ok(!Number.isNaN(kpis.averageTicket));
});

test("computeKpis: ticket promedio = recaudación aprobada / sesiones pagadas", () => {
  const sessions = [
    { id: "s1", amount_paid: 1000, purchased_minutes: 30 },
    { id: "s2", amount_paid: 2000, purchased_minutes: 60 },
    { id: "s3", amount_paid: 0, purchased_minutes: 15 }, // sin pago -> no cuenta como sesión pagada
  ];
  const kpis = computeKpis({ sessions, extensions: [], paymentAttempts: [], activeSessionsNow: 2 });
  assert.equal(kpis.revenue, 3000);
  assert.equal(kpis.averageTicket, 1500); // 3000 / 2 sesiones pagadas
  assert.equal(kpis.minutesPurchased, 105);
  assert.equal(kpis.averageMinutesPerSession, 35); // 105 / 3 sesiones totales
  assert.equal(kpis.activeSessionsNow, 2);
});

test("computeKpis: tasa de aprobación Webpay = aprobados / intentos", () => {
  const paymentAttempts = [
    { status: "COMMITTED" }, { status: "COMMITTED" }, { status: "REJECTED" }, { status: "FAILED" }, { status: "CREATED" },
  ];
  const kpis = computeKpis({ sessions: [], extensions: [], paymentAttempts, activeSessionsNow: 0 });
  assert.equal(kpis.paymentsApproved, 2);
  assert.equal(kpis.paymentsRejected, 2);
  assert.equal(kpis.approvalRate, 0.4);
});

test("sessionsByDay: incluye días sin sesiones (no salta fechas en el eje X)", () => {
  const from = "2026-08-01T00:00:00-04:00", to = "2026-08-03T23:59:59-04:00";
  const sessions = [{ started_at: "2026-08-01T10:00:00-04:00" }, { started_at: "2026-08-01T11:00:00-04:00" }, { started_at: "2026-08-03T09:00:00-04:00" }];
  const series = sessionsByDay(sessions, from, to);
  assert.deepEqual(series.map((d) => d.day), ["2026-08-01", "2026-08-02", "2026-08-03"]);
  assert.deepEqual(series.map((d) => d.count), [2, 0, 1]);
});

test("revenueByDay: solo suma sesiones con amount_paid > 0 (pagos aprobados)", () => {
  const from = "2026-08-01T00:00:00-04:00", to = "2026-08-02T23:59:59-04:00";
  const sessions = [
    { started_at: "2026-08-01T10:00:00-04:00", amount_paid: 1000 },
    { started_at: "2026-08-01T11:00:00-04:00", amount_paid: 0 },
    { started_at: "2026-08-02T09:00:00-04:00", amount_paid: 500 },
  ];
  const series = revenueByDay(sessions, from, to);
  assert.deepEqual(series.map((d) => d.amount), [1000, 500]);
});

test("minutesDistribution: clasifica en los rangos analíticos sin alterar el límite operacional 1–1440", () => {
  const sessions = [{ purchased_minutes: 15 }, { purchased_minutes: 45 }, { purchased_minutes: 90 }, { purchased_minutes: 200 }, { purchased_minutes: 300 }, { purchased_minutes: 700 }];
  const buckets = minutesDistribution(sessions);
  assert.deepEqual(buckets.map((b) => b.count), [1, 1, 1, 1, 1, 1]);
});

test("extensionsBreakdown: 0/1/2+ extensiones por sesión y % de extendidas", () => {
  const sessions = [{ id: "s1" }, { id: "s2" }, { id: "s3" }, { id: "s4" }];
  const extensions = [{ session_id: "s2" }, { session_id: "s3" }, { session_id: "s3" }, { session_id: "s3" }];
  const breakdown = extensionsBreakdown(sessions, extensions);
  assert.equal(breakdown.none, 2); // s1, s4
  assert.equal(breakdown.one, 1); // s2
  assert.equal(breakdown.many, 1); // s3 (3 extensiones)
  assert.equal(breakdown.extendedCount, 2);
  assert.equal(breakdown.extensionsRate, 0.5);
});

test("visibleSessionStatus: ACTIVE con expires_at vencido se muestra como EXPIRED", () => {
  const now = new Date("2026-08-22T12:00:00-04:00");
  assert.equal(visibleSessionStatus({ status: "ACTIVE", expires_at: "2026-08-22T11:00:00-04:00" }, now), "EXPIRED");
  assert.equal(visibleSessionStatus({ status: "ACTIVE", expires_at: "2026-08-22T13:00:00-04:00" }, now), "ACTIVE");
  assert.equal(visibleSessionStatus({ status: "CLOSED", expires_at: null }, now), "CLOSED");
});

test("statusDistribution: usa los estados reales del sistema, no inventa nombres", () => {
  const now = new Date("2026-08-22T12:00:00-04:00");
  const sessions = [
    { status: "ACTIVE", expires_at: "2026-08-22T13:00:00-04:00" },
    { status: "ACTIVE", expires_at: "2026-08-22T10:00:00-04:00" }, // vencida -> EXPIRED visible
    { status: "CLOSED" },
  ];
  assert.deepEqual(statusDistribution(sessions, now), { ACTIVE: 1, CLOSED: 1, EXPIRED: 1 });
});

test("locationRanking + sortLocationRanking: agrupa por ubicación real y ordena por la métrica pedida", () => {
  const locate = (session) => session.__location;
  const locA = { label: "Calle A / Tramo 1", parking: { id: "p1", name: "Norte" }, street: { name: "Calle A" }, segment: { id: "seg-a", name: "Tramo 1" } };
  const locB = { label: "Calle B / Tramo 2", parking: { id: "p1", name: "Norte" }, street: { name: "Calle B" }, segment: { id: "seg-b", name: "Tramo 2" } };
  const sessions = [
    { id: "s1", purchased_minutes: 30, amount_paid: 900, __location: locA },
    { id: "s2", purchased_minutes: 60, amount_paid: 1800, __location: locA },
    { id: "s3", purchased_minutes: 15, amount_paid: 450, __location: locB },
  ];
  const extensions = [{ session_id: "s1" }];
  const rows = locationRanking(sessions, extensions, locate);
  assert.equal(rows.length, 2);
  const byRevenue = sortLocationRanking(rows, "revenue");
  assert.equal(byRevenue[0].label, "Calle A / Tramo 1");
  assert.equal(byRevenue[0].sessions, 2);
  assert.equal(byRevenue[0].revenue, 2700);
  assert.equal(byRevenue[0].extensions, 1);
});

test("operationalAlerts: solo genera alertas por condiciones realmente detectadas", () => {
  assert.deepEqual(operationalAlerts({ paymentAttempts: [], sessions: [] }), []);

  const now = new Date("2026-08-22T12:00:00-04:00");
  const alerts = operationalAlerts({
    paymentAttempts: [{ status: "REJECTED" }, { status: "CREATED" }],
    sessions: [{ status: "ACTIVE", expires_at: "2026-08-22T10:00:00-04:00" }],
    now,
  });
  const ids = alerts.map((a) => a.id);
  assert.ok(ids.includes("pending-payments"));
  assert.ok(ids.includes("failed-payments"));
  assert.ok(ids.includes("stale-active"));
});
