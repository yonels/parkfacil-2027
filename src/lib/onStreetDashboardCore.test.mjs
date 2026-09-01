import test from "node:test";
import assert from "node:assert/strict";
import {
  applySortAndPaginate,
  compareForSort,
  computeKpis,
  durationDistribution,
  extensionsBreakdown,
  locationRanking,
  minutesDistribution,
  normalizePagination,
  occupancyRate,
  operationalAlerts,
  paymentMethodBreakdown,
  paymentRevenueByGroup,
  paymentsByDay,
  placePerformanceRanking,
  resolvePeriodBounds,
  resolveRevenueGranularity,
  revenueBreakdown,
  revenueByDay,
  revenueByHourOfDay,
  revenueTimeSeries,
  segmentCapacity,
  sessionDurationMinutes,
  sessionStateBreakdown,
  sessionsByDay,
  sessionsByHourOfDay,
  soonToExpireCount,
  sortLocationRanking,
  sortPlacePerformance,
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

// ============================================================
// month/year arbitrarios (§ corrección "filtro de fechas" 2026-08-28):
// Sesiones/Pagos On Street necesitan poder pedir un mes o año HISTÓRICO,
// no solo el actual -- estos tests cubren exactamente ese caso nuevo, sin
// tocar el comportamiento relativo (mes/año actual) ya probado arriba.
// ============================================================

test("resolvePeriodBounds: mes arbitrario (Agosto 2026) empieza el día 1 a las 00:00:00 -04:00 exacto", () => {
  const bounds = resolvePeriodBounds("month", { month: 8, year: 2026, now: NOW });
  assert.equal(bounds.from, "2026-08-01T04:00:00.000Z"); // 00:00:00.000 -04:00
});

test("resolvePeriodBounds: mes arbitrario respeta meses de 28/29/30/31 días (incl. año bisiesto) -- el rango cubre exactamente N días completos, sin cortar el último ni invadir el mes siguiente", () => {
  const casos = [
    { year: 2026, month: 2, dias: 28 }, // 2026 no es bisiesto
    { year: 2028, month: 2, dias: 29 }, // 2028 sí es bisiesto
    { year: 2026, month: 4, dias: 30 },
    { year: 2026, month: 8, dias: 31 },
  ];
  for (const { year, month, dias } of casos) {
    const bounds = resolvePeriodBounds("month", { month, year, now: NOW });
    const spanMs = new Date(bounds.to).getTime() - new Date(bounds.from).getTime() + 1;
    assert.equal(spanMs, dias * 24 * 60 * 60 * 1000, `mes ${month}/${year} debería cubrir exactamente ${dias} días completos`);
    // El límite superior debe seguir siendo 23:59:59.999 (fin de día), nunca
    // 00:00:00.000 del mes siguiente -- confirma que no se "corta" el
    // último día ni se "invade" el mes siguiente.
    assert.match(bounds.to, /T(23:59:59\.999|0[0-3]:59:59\.999)Z$/);
  }
});

test("resolvePeriodBounds: año arbitrario (2026) cubre 01-01 00:00 a 31-12 23:59:59.999, America/Santiago", () => {
  const bounds = resolvePeriodBounds("year", { year: 2026, now: NOW });
  assert.equal(bounds.from, "2026-01-01T04:00:00.000Z");
  assert.equal(bounds.to, "2027-01-01T03:59:59.999Z");
});

test("resolvePeriodBounds: sin month/year explícitos, 'month'/'year' siguen significando el actual -- retrocompatible con Dashboard/Reportes", () => {
  const month = resolvePeriodBounds("month", { now: NOW });
  const year = resolvePeriodBounds("year", { now: NOW });
  assert.ok(month.from < NOW.toISOString() && month.to === NOW.toISOString());
  assert.ok(year.from < NOW.toISOString() && year.to === NOW.toISOString());
});

test("resolvePeriodBounds: personalizado cruzando dos meses y cruzando dos años incluye ambos extremos completos", () => {
  const cruzaMeses = resolvePeriodBounds("custom", { from: "2026-07-25", to: "2026-08-05", now: NOW });
  assert.equal(cruzaMeses.from, "2026-07-25T04:00:00.000Z"); // 25-07 00:00:00 -04:00
  assert.equal(cruzaMeses.to, "2026-08-06T03:59:59.999Z"); // 05-08 23:59:59.999 -04:00

  const cruzaAnios = resolvePeriodBounds("custom", { from: "2025-12-20", to: "2026-01-10", now: NOW });
  assert.equal(cruzaAnios.from, "2025-12-20T04:00:00.000Z"); // 20-12-2025 00:00:00 -04:00
  assert.equal(cruzaAnios.to, "2026-01-11T03:59:59.999Z"); // 10-01-2026 23:59:59.999 -04:00
});

test("resolvePeriodBounds: 'día específico' se logra con personalizado Desde=Hasta, incluye el día completo", () => {
  const bounds = resolvePeriodBounds("custom", { from: "2026-08-15", to: "2026-08-15", now: NOW });
  assert.equal(bounds.from, "2026-08-15T04:00:00.000Z"); // 15-08 00:00:00 -04:00
  assert.equal(bounds.to, "2026-08-16T03:59:59.999Z"); // 15-08 23:59:59.999 -04:00
  const spanMs = new Date(bounds.to).getTime() - new Date(bounds.from).getTime() + 1;
  assert.equal(spanMs, 24 * 60 * 60 * 1000, "un solo día debe cubrir exactamente 24h completas");
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

// --- Administración QR On Street: ingresos por tipo, medio de pago, sesiones por vencer ---

test("revenueBreakdown: separa pago inicial de extensión usando solo COMMITTED, atribuido por operation_type del intent", () => {
  const intentMap = new Map([
    ["intent-initial", { operation_type: "INITIAL" }],
    ["intent-ext", { operation_type: "EXTENSION" }],
  ]);
  const paymentAttempts = [
    { source_id: "intent-initial", status: "COMMITTED", amount: 900 },
    { source_id: "intent-ext", status: "COMMITTED", amount: 450 },
    { source_id: "intent-ext", status: "COMMITTED", amount: 300 },
  ];
  const result = revenueBreakdown(paymentAttempts, intentMap);
  assert.equal(result.initial, 900);
  assert.equal(result.extension, 750);
  assert.equal(result.total, 1650);
  assert.equal(result.initialCount, 1);
  assert.equal(result.extensionCount, 2);
});

test("revenueBreakdown NUNCA contabiliza INITIALIZED/REDIRECTED/ABORTED/FAILED/PAYMENT_FAILED como ingreso", () => {
  const intentMap = new Map([["i1", { operation_type: "INITIAL" }], ["i2", { operation_type: "EXTENSION" }]]);
  const paymentAttempts = [
    { source_id: "i1", status: "INITIALIZED", amount: 900 },
    { source_id: "i1", status: "REDIRECTED", amount: 900 },
    { source_id: "i2", status: "ABORTED", amount: 450 },
    { source_id: "i2", status: "FAILED", amount: 450 },
    { source_id: "i1", status: "REJECTED", amount: 900 },
    { source_id: "i1", status: "COMMITTING", amount: 900 },
  ];
  const result = revenueBreakdown(paymentAttempts, intentMap);
  assert.equal(result.total, 0, "ninguno de estos estados debe sumar ingreso alguno");
});

test("revenueBreakdown: sin intent encontrado (no debería ocurrir, pero no debe romper) se cuenta como inicial por defecto, nunca se pierde el monto", () => {
  const result = revenueBreakdown([{ source_id: "no-existe", status: "COMMITTED", amount: 500 }], new Map());
  assert.equal(result.total, 500);
});

test("paymentMethodBreakdown: usa el payment_type oficial de Transbank (DEBIT/CREDIT), nunca infiere Onepay", () => {
  const result = paymentMethodBreakdown([
    { status: "COMMITTED", amount: 900, payment_type: "DEBIT" },
    { status: "COMMITTED", amount: 450, payment_type: "CREDIT" },
    { status: "COMMITTED", amount: 300, payment_type: "CREDIT" },
    { status: "COMMITTED", amount: 200, payment_type: null },
    { status: "REJECTED", amount: 900, payment_type: "DEBIT" },
  ]);
  assert.deepEqual(result.DEBIT, { count: 1, amount: 900 });
  assert.deepEqual(result.CREDIT, { count: 2, amount: 750 });
  assert.deepEqual(result.UNKNOWN, { count: 1, amount: 200 }, "sin payment_type reconocible -> UNKNOWN, nunca inventado como Onepay");
  assert.equal("ONEPAY" in result, false, "el sistema no debe fabricar una categoría Onepay que no puede determinar");
});

test("soonToExpireCount: solo ACTIVE con expires_at dentro de los próximos 15 min, nunca una ya vencida", () => {
  const now = new Date("2026-08-22T12:00:00-04:00");
  const sessions = [
    { status: "ACTIVE", expires_at: "2026-08-22T12:10:00-04:00" }, // por vencer
    { status: "ACTIVE", expires_at: "2026-08-22T13:00:00-04:00" }, // falta más de 15 min
    { status: "ACTIVE", expires_at: "2026-08-22T11:59:00-04:00" }, // ya vencida (EXPIRED visible), no "por vencer"
    { status: "CLOSED", expires_at: "2026-08-22T12:05:00-04:00" }, // finalizada, no cuenta
  ];
  assert.equal(soonToExpireCount(sessions, now), 1);
});

// ============================================================
// Cierre final (auditoría 2026-08-28): gráficos, rendimiento por lugar,
// ocupación.
// ============================================================

test("resolveRevenueGranularity: día->hora, mes->día, año->mes (§4.1, §20-1/2/3)", () => {
  assert.equal(resolveRevenueGranularity({ from: "2026-08-22T00:00:00-04:00", to: "2026-08-22T23:59:59-04:00" }), "hour");
  assert.equal(resolveRevenueGranularity({ from: "2026-08-01T00:00:00-04:00", to: "2026-08-31T23:59:59-04:00" }), "day");
  assert.equal(resolveRevenueGranularity({ from: "2026-01-01T00:00:00-04:00", to: "2026-12-31T23:59:59-04:00" }), "month");
  assert.equal(resolveRevenueGranularity(null), "day");
});

test("revenueTimeSeries: granularidad hora agrupa por hora local de Chile, solo COMMITTED (§20-1)", () => {
  const bounds = { from: "2026-08-22T00:00:00-04:00", to: "2026-08-22T23:59:59-04:00" };
  const intentMap = new Map([["i1", { operation_type: "INITIAL" }], ["i2", { operation_type: "EXTENSION" }]]);
  const paymentAttempts = [
    { status: "COMMITTED", amount: 1000, committed_at: "2026-08-22T14:30:00-04:00", source_id: "i1" }, // 14:00 bucket
    { status: "COMMITTED", amount: 500, committed_at: "2026-08-22T14:45:00-04:00", source_id: "i2" }, // 14:00 bucket
    { status: "COMMITTED", amount: 200, committed_at: "2026-08-22T09:05:00-04:00", source_id: "i1" }, // 09:00 bucket
    { status: "REDIRECTED", amount: 9999, committed_at: null, source_id: "i1" }, // sin committed_at, nunca cuenta
  ];
  const result = revenueTimeSeries(paymentAttempts, intentMap, bounds);
  assert.equal(result.granularity, "hour");
  const at14 = result.points.find((p) => p.bucket === "2026-08-22 14:00");
  assert.ok(at14, "debe existir el bucket de las 14:00");
  assert.equal(at14.amount, 1500);
  assert.equal(at14.initial, 1000);
  assert.equal(at14.extension, 500);
  const at09 = result.points.find((p) => p.bucket === "2026-08-22 09:00");
  assert.equal(at09.amount, 200);
  const totalAmount = result.points.reduce((sum, p) => sum + p.amount, 0);
  assert.equal(totalAmount, 1700, "REDIRECTED nunca se suma al total");
});

test("revenueTimeSeries: granularidad día agrupa por fecha (§20-2)", () => {
  const bounds = { from: "2026-08-01T00:00:00-04:00", to: "2026-08-05T23:59:59-04:00" };
  const paymentAttempts = [
    { status: "COMMITTED", amount: 100, committed_at: "2026-08-02T10:00:00-04:00", source_id: "i1" },
    { status: "COMMITTED", amount: 300, committed_at: "2026-08-02T20:00:00-04:00", source_id: "i1" },
  ];
  const result = revenueTimeSeries(paymentAttempts, new Map(), bounds);
  assert.equal(result.granularity, "day");
  const day2 = result.points.find((p) => p.bucket === "2026-08-02");
  assert.equal(day2.amount, 400);
  assert.equal(result.points.length, 5, "enumera todos los días del rango, incluso sin ingresos, para que el eje X no salte fechas");
});

test("revenueTimeSeries: granularidad mes agrupa por mes (§20-3)", () => {
  const bounds = { from: "2026-01-01T00:00:00-04:00", to: "2026-12-31T23:59:59-04:00" };
  const paymentAttempts = [
    { status: "COMMITTED", amount: 700, committed_at: "2026-03-15T10:00:00-04:00", source_id: "i1" },
  ];
  const result = revenueTimeSeries(paymentAttempts, new Map(), bounds);
  assert.equal(result.granularity, "month");
  const march = result.points.find((p) => p.bucket === "2026-03");
  assert.equal(march.amount, 700);
  assert.equal(result.points.length, 12);
});

test("revenueTimeSeries y revenueByHourOfDay: NUNCA contabilizan un estado que no sea COMMITTED (§20-4 a 9)", () => {
  const bounds = { from: "2026-08-22T00:00:00-04:00", to: "2026-08-22T23:59:59-04:00" };
  const nonCommittedStatuses = ["CREATED", "REDIRECTED", "COMMITTING", "REJECTED", "ABORTED", "FAILED"];
  const paymentAttempts = nonCommittedStatuses.map((status, i) => ({ status, amount: 1000 * (i + 1), committed_at: "2026-08-22T10:00:00-04:00", source_id: "i1" }));
  const series = revenueTimeSeries(paymentAttempts, new Map(), bounds);
  assert.equal(series.points.reduce((sum, p) => sum + p.amount, 0), 0);
  const byHour = revenueByHourOfDay(paymentAttempts);
  assert.equal(byHour.reduce((sum, b) => sum + b.amount, 0), 0);
});

test("revenueByHourOfDay: histograma de 24 horas, agrega todo el período por hora-del-día, no por fecha (§4.4)", () => {
  const paymentAttempts = [
    { status: "COMMITTED", amount: 100, committed_at: "2026-08-01T09:15:00-04:00", source_id: "i1" },
    { status: "COMMITTED", amount: 200, committed_at: "2026-08-15T09:45:00-04:00", source_id: "i1" }, // mismo hour-of-day, fecha distinta
    { status: "COMMITTED", amount: 50, committed_at: "2026-08-02T23:00:00-04:00", source_id: "i1" },
  ];
  const result = revenueByHourOfDay(paymentAttempts);
  assert.equal(result.length, 24);
  assert.equal(result[9].amount, 300, "ambos pagos de las 09h se suman aunque sean de fechas distintas");
  assert.equal(result[23].amount, 50);
  assert.equal(result[0].amount, 0);
});

test("sessionsByHourOfDay: 'Horarios de mayor uso' -- histograma de 24 horas por INICIO de sesión (started_at), no por pago -- una sesión sin pago igual cuenta como uso", () => {
  const sessions = [
    { started_at: "2026-08-01T09:15:00-04:00" },
    { started_at: "2026-08-15T09:45:00-04:00" }, // misma hour-of-day, fecha distinta
    { started_at: "2026-08-02T23:00:00-04:00" },
    { started_at: null }, // sesión sin fecha de inicio real -- nunca cuenta como si fuera hora 0
  ];
  const result = sessionsByHourOfDay(sessions);
  assert.equal(result.length, 24);
  assert.equal(result[9].count, 2, "ambas sesiones de las 09h se suman aunque sean de fechas distintas");
  assert.equal(result[23].count, 1);
  assert.equal(result[0].count, 0, "la sesión sin started_at no se cuenta como hora 0");
  assert.equal(result.reduce((sum, b) => sum + b.count, 0), 3, "el total cuenta exactamente las 3 sesiones con started_at real");
});

test("sessionDurationMinutes: CLOSED usa duration_seconds persistido, EXPIRED usa expires_at-started_at, ACTIVE usa now-started_at (§4.3)", () => {
  const now = new Date("2026-08-22T12:00:00-04:00");
  const closed = { status: "CLOSED", started_at: "2026-08-22T10:00:00-04:00", ended_at: "2026-08-22T10:20:00-04:00", duration_seconds: 1200 };
  assert.equal(sessionDurationMinutes(closed, now), 20);
  const expired = { status: "EXPIRED", started_at: "2026-08-22T10:00:00-04:00", expires_at: "2026-08-22T10:45:00-04:00" };
  assert.equal(sessionDurationMinutes(expired, now), 45);
  const active = { status: "ACTIVE", started_at: "2026-08-22T11:30:00-04:00" };
  assert.equal(sessionDurationMinutes(active, now), 30);
});

test("durationDistribution: 5 rangos exactos 0-15/16-30/31-60/61-120/+120 (§20-10 a 14)", () => {
  const now = new Date("2026-08-22T12:00:00-04:00");
  const mk = (minutes) => ({ status: "CLOSED", started_at: now.toISOString(), ended_at: now.toISOString(), duration_seconds: minutes * 60 });
  const sessions = [mk(10), mk(16), mk(30), mk(45), mk(61), mk(120), mk(121), mk(500)];
  const result = durationDistribution(sessions, now);
  assert.deepEqual(result.map((b) => b.count), [1, 2, 1, 2, 2]);
  assert.deepEqual(result.map((b) => b.label), ["0–15 min", "16–30 min", "31–60 min", "61–120 min", "+120 min"]);
});

test("sessionStateBreakdown: VIGENTE/POR VENCER/VENCIDA/FINALIZADA/FISCALIZADA (§4.2, §20-15)", () => {
  const now = new Date("2026-08-22T12:00:00-04:00");
  const sessions = [
    { id: "s1", status: "ACTIVE", expires_at: "2026-08-22T13:00:00-04:00" }, // vigente
    { id: "s2", status: "ACTIVE", expires_at: "2026-08-22T12:10:00-04:00" }, // por vencer
    { id: "s3", status: "ACTIVE", expires_at: "2026-08-22T11:00:00-04:00" }, // vencida (visible EXPIRED)
    { id: "s4", status: "CLOSED", expires_at: "2026-08-22T11:30:00-04:00" }, // finalizada
    { id: "s5", status: "ACTIVE", expires_at: "2026-08-22T11:00:00-04:00" }, // vencida Y fiscalizada
  ];
  const result = sessionStateBreakdown(sessions, new Set(["s5"]), now);
  assert.deepEqual(result, { VIGENTE: 1, POR_VENCER: 1, VENCIDA: 2, FINALIZADA: 1, FISCALIZADA: 1 });
});

test("placePerformanceRanking: agrupa por nivel elegido (parking/area/street/segment/qrLocation), sin duplicar locate() (§5, §20-16)", () => {
  const locateFn = (s) => s.location;
  const sessions = [
    { id: "s1", license_plate_normalized: "AAAA11", amount_paid: 1000, status: "CLOSED", started_at: "2026-08-22T10:00:00-04:00", ended_at: "2026-08-22T10:30:00-04:00", duration_seconds: 1800, location: { parking: { id: "p1", name: "Centro" }, area: { id: "a1", name: "Área 1" }, street: { id: "st1", name: "Calle 1" }, segment: { id: "sg1", name: "Tramo 1" }, label: "QR-1" } },
    { id: "s2", license_plate_normalized: "AAAA11", amount_paid: 500, status: "CLOSED", started_at: "2026-08-22T11:00:00-04:00", ended_at: "2026-08-22T11:10:00-04:00", duration_seconds: 600, location: { parking: { id: "p1", name: "Centro" }, area: { id: "a1", name: "Área 1" }, street: { id: "st1", name: "Calle 1" }, segment: { id: "sg2", name: "Tramo 2" }, label: "QR-2" } },
    { id: "s3", license_plate_normalized: "BBBB22", amount_paid: 2000, status: "CLOSED", started_at: "2026-08-22T09:00:00-04:00", ended_at: "2026-08-22T09:40:00-04:00", duration_seconds: 2400, location: { parking: { id: "p2", name: "Otro" }, area: { id: "a2", name: "Área 2" }, street: { id: "st2", name: "Calle 2" }, segment: { id: "sg3", name: "Tramo 3" }, label: "QR-3" } },
  ];
  const extensions = [{ session_id: "s1", simulated_amount: 300 }];

  const byParking = sortPlacePerformance(placePerformanceRanking(sessions, extensions, new Set(["s3"]), locateFn, "parking"), "revenue");
  assert.equal(byParking.length, 2, "s1 y s2 comparten parking_id -> un solo grupo");
  const centro = byParking.find((r) => r.key === "p1");
  assert.equal(centro.sessions, 2);
  assert.equal(centro.vehicles, 1, "misma patente en ambas sesiones -> 1 vehículo distinto");
  assert.equal(centro.revenue, 1500);
  assert.equal(centro.averageTicket, 750);
  assert.equal(centro.extensionsCount, 1);
  assert.equal(centro.extensionsRevenue, 300);
  const otro = byParking.find((r) => r.key === "p2");
  assert.equal(otro.fiscalizations, 1);

  const bySegment = placePerformanceRanking(sessions, extensions, new Set(), locateFn, "segment");
  assert.equal(bySegment.length, 3, "por tramo, cada sesión de este fixture cae en un tramo distinto");
});

test("segmentCapacity y occupancyRate: NUNCA inventan capacidad -- null explícito si no hay dato real (§6)", () => {
  assert.equal(segmentCapacity(null), null);
  assert.equal(segmentCapacity({ capacity: null, right_capacity: null, left_capacity: null }), null, "sin ningún dato de capacidad -> null, nunca 0 disfrazado de capacidad real");
  assert.equal(segmentCapacity({ capacity: 10 }), 10);
  assert.equal(segmentCapacity({ capacity: null, right_capacity: 4, left_capacity: 6 }), 10, "usa right+left cuando el campo combinado no está poblado");
  assert.equal(occupancyRate(3, null), null, "sin capacidad conocida, la ocupación es null, nunca un porcentaje inventado");
  assert.deepEqual(occupancyRate(3, 10), { active: 3, capacity: 10, rate: 0.3 });
  assert.equal(occupancyRate(15, 10).rate, 1, "nunca reporta más de 100% aunque haya más sesiones activas que capacidad conocida");
});

// ============================================================
// Paginación/orden server-side de Reportes (§7, §20-17 a 29)
// ============================================================

function mkRows(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, amount: (i + 1) * 10, label: `Fila ${String(i + 1).padStart(3, "0")}` }));
}

test("normalizePagination: pageSize solo admite 25/50/100, valores fuera de rango caen a 25 (§20-19/20/21)", () => {
  assert.deepEqual(normalizePagination({ page: 1, pageSize: 25 }), { page: 1, pageSize: 25 });
  assert.deepEqual(normalizePagination({ page: 1, pageSize: 50 }), { page: 1, pageSize: 50 });
  assert.deepEqual(normalizePagination({ page: 1, pageSize: 100 }), { page: 1, pageSize: 100 });
  assert.deepEqual(normalizePagination({ page: 1, pageSize: 999 }), { page: 1, pageSize: 25 });
  assert.deepEqual(normalizePagination({}), { page: 1, pageSize: 25 });
  assert.deepEqual(normalizePagination({ page: -3, pageSize: 25 }), { page: 1, pageSize: 25 }, "página inválida cae a 1");
});

test("applySortAndPaginate: página 1 y página 2 devuelven exactamente pageSize filas distintas, en el mismo orden (§20-17/18)", () => {
  const rows = mkRows(60);
  const page1 = applySortAndPaginate(rows, { page: 1, pageSize: 25, sortKey: "amount" });
  const page2 = applySortAndPaginate(rows, { page: 2, pageSize: 25, sortKey: "amount" });
  assert.equal(page1.rows.length, 25);
  assert.equal(page2.rows.length, 25);
  assert.equal(page1.rows[0].id, "r1");
  assert.equal(page2.rows[0].id, "r26");
  assert.deepEqual(page1.pagination, { page: 1, pageSize: 25, totalRows: 60, totalPages: 3 });
  assert.equal(page2.pagination.page, 2);
  const overlap = page1.rows.some((r) => page2.rows.some((r2) => r2.id === r.id));
  assert.equal(overlap, false, "página 1 y 2 nunca comparten filas");
});

test("applySortAndPaginate: totalRows y totalPages correctos para distintos pageSize (§20-22)", () => {
  const rows = mkRows(101);
  assert.equal(applySortAndPaginate(rows, { pageSize: 25 }).pagination.totalRows, 101);
  assert.equal(applySortAndPaginate(rows, { pageSize: 25 }).pagination.totalPages, 5);
  assert.equal(applySortAndPaginate(rows, { pageSize: 50 }).pagination.totalPages, 3);
  assert.equal(applySortAndPaginate(rows, { pageSize: 100 }).pagination.totalPages, 2);
});

test("applySortAndPaginate: orden se aplica sobre el conjunto COMPLETO antes de paginar -- nunca solo sobre la página visible (§7.4, §20-24/25)", () => {
  // 30 filas con montos DESORDENADOS respecto de su id (r1 no es la fila de
  // menor monto) -- si el orden se aplicara solo dentro de cada página en
  // vez de sobre el conjunto completo, la frontera entre página 1 y 2
  // quedaría mal ordenada. pageSize=25 es el único valor real soportado
  // (§7.2): no se usa un pageSize inventado solo para forzar el test.
  const rows = mkRows(30).map((r, i) => ({ ...r, amount: (30 - i) * 10 })); // r1 tiene el monto más alto, r30 el más bajo
  const ascPage1 = applySortAndPaginate(rows, { page: 1, pageSize: 25, sortKey: "amount", sortDirection: "asc" });
  const ascPage2 = applySortAndPaginate(rows, { page: 2, pageSize: 25, sortKey: "amount", sortDirection: "asc" });
  assert.equal(ascPage1.rows[0].id, "r30", "la fila de menor monto de TODO el conjunto encabeza la página 1 ascendente");
  assert.equal(ascPage1.rows[24].id, "r6", "posición 25 de la página 1 es la fila #25 ordenada globalmente, no una porción sin ordenar");
  assert.equal(ascPage2.rows[0].id, "r5", "la página 2 continúa exactamente donde terminó la 1, en el mismo orden global");
  assert.equal(ascPage2.rows.length, 5);
  const descPage1 = applySortAndPaginate(rows, { page: 1, pageSize: 25, sortKey: "amount", sortDirection: "desc" });
  assert.equal(descPage1.rows[0].id, "r1", "descendente: la fila de mayor monto de todo el conjunto encabeza la página 1");
});

test("compareForSort: números, fechas ISO y texto (es, numeric) -- nulls siempre al final", () => {
  assert.ok(compareForSort(1, 2) < 0);
  assert.ok(compareForSort("2026-08-02", "2026-08-01") > 0);
  assert.ok(compareForSort("Item 2", "Item 10") < 0, "orden numérico dentro del texto, no lexicográfico puro");
  assert.equal(compareForSort(null, 5), 1);
  assert.equal(compareForSort(5, null), -1);
});

test("applySortAndPaginate: input.export=true devuelve el dataset COMPLETO, no la página visible (§7.6, §20-27/28/29)", () => {
  const rows = mkRows(250);
  const paged = applySortAndPaginate(rows, { page: 1, pageSize: 25 });
  assert.equal(paged.rows.length, 25, "sin export, la pantalla solo recibe pageSize filas");
  const exported = applySortAndPaginate(rows, { page: 1, pageSize: 25, export: true });
  assert.equal(exported.rows.length, 250, "con export=true, Excel recibe las 250 filas filtradas completas, no solo las 25 visibles");
  assert.equal(exported.pagination.totalRows, 250);
});

test("applySortAndPaginate: página fuera de rango se ajusta a la última página existente, nunca deja el resultado vacío por error de UI", () => {
  const rows = mkRows(30);
  const result = applySortAndPaginate(rows, { page: 99, pageSize: 25 });
  assert.equal(result.pagination.page, 2, "30 filas / 25 por página = 2 páginas, la 99 se ajusta a la 2");
  assert.equal(result.rows.length, 5);
});

// --- §20-23: filtro server-side (via fetchOnStreetScopedData, ya
// aplicado antes de que applySortAndPaginate reciba las filas -- se prueba
// aquí que paginar/ordenar un conjunto YA filtrado nunca "recupera" filas
// fuera de ese filtro, es decir, que ambas etapas son independientes y
// componibles sin fugas). ---
test("applySortAndPaginate nunca agrega filas fuera del conjunto ya filtrado que recibe -- el filtrado real vive antes, en fetchOnStreetScopedData (§20-23)", () => {
  const filtered = mkRows(40); // simula el resultado YA filtrado por período/lugar
  const result = applySortAndPaginate(filtered, { page: 1, pageSize: 100, export: true });
  assert.equal(result.rows.length, 40, "nunca más filas que las que efectivamente recibió filtradas");
  assert.ok(result.rows.every((r) => filtered.includes(r)), "cada fila devuelta pertenece al conjunto filtrado de entrada, ninguna inventada");
});

// --- §20-26: cambiar un filtro vuelve a página 1 -- comportamiento de
// OnStreetReports.js (componente cliente), probado por inspección de
// fuente (mismo criterio que el resto del módulo para archivos "use
// client" sin jsdom). ---
test("OnStreetReports.js: cambiar tipo/período/filtro/orden/agrupación vuelve a página 1 (§7.3, §20-26)", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../components/on-street-admin/OnStreetReports.js", import.meta.url), "utf8");
  assert.match(source, /useEffect\(\(\) => \{\s*const timer = window\.setTimeout\(\(\) => setPage\(1\), 0\);/, "debe existir un efecto que resetea page a 1");
  // 2026-08-30: se agregaron los filtros de clic (paymentTypeFilter/
  // operationTypeFilter/approvalFilter/statusFilter) y la búsqueda por
  // patente (plateSearch) a esta misma dependencia -- también deben volver
  // a página 1 al cambiar (página integral "Reportes On Street").
  const effectDeps = source.match(/}, \[type, period, customFrom, customTo, companyId, parkingId, areaId, streetId, segmentId, groupBy, paymentTypeFilter, operationTypeFilter, approvalFilter, statusFilter, plateSearch, pageSize, sort\.key, sort\.direction\]\);/);
  assert.ok(effectDeps, "el efecto de reset a página 1 debe depender de type/período/todos los filtros (incluidos los de clic de Gráficos)/groupBy/pageSize/sort -- cualquier cambio de estos vuelve a página 1");
});

// --- §36: Dashboard y gráficos comparten exactamente el mismo alcance
// (mismos sessions/paymentAttempts/extensions ya filtrados por período+
// lugar) -- se prueba que los distintos cálculos derivados de UN MISMO
// conjunto de entrada son mutuamente consistentes entre sí (ninguno usa un
// subconjunto oculto o un filtro adicional no visible). ---
test("Consistencia de alcance Dashboard/gráficos: revenueTimeSeries, revenueByHourOfDay y revenueBreakdown suman EXACTAMENTE el mismo total cuando reciben el mismo paymentAttempts (§18, §20-36)", () => {
  const bounds = { from: "2026-08-01T00:00:00-04:00", to: "2026-08-05T23:59:59-04:00" };
  const intentMap = new Map([["i1", { operation_type: "INITIAL" }], ["i2", { operation_type: "EXTENSION" }]]);
  const paymentAttempts = [
    { status: "COMMITTED", amount: 1000, committed_at: "2026-08-02T10:00:00-04:00", source_id: "i1" },
    { status: "COMMITTED", amount: 500, committed_at: "2026-08-03T20:00:00-04:00", source_id: "i2" },
    { status: "REDIRECTED", amount: 9999, committed_at: null, source_id: "i1" },
  ];
  const series = revenueTimeSeries(paymentAttempts, intentMap, bounds);
  const byHour = revenueByHourOfDay(paymentAttempts);
  const breakdown = revenueBreakdown(paymentAttempts, intentMap);
  const seriesTotal = series.points.reduce((sum, p) => sum + p.amount, 0);
  const byHourTotal = byHour.reduce((sum, b) => sum + b.amount, 0);
  assert.equal(seriesTotal, breakdown.total, "la serie temporal (mismo alcance) suma exactamente lo mismo que el desglose de ingresos");
  assert.equal(byHourTotal, breakdown.total, "el histograma por hora-del-día (mismo alcance) también suma exactamente lo mismo");
});

// --- §37: extensión pagada en un período distinto al inicio de la sesión
// -- atribución financiera correcta y documentada (no es un error). ---
test("Extensión pagada en fecha distinta a started_at: revenueTimeSeries atribuye por committed_at (evento financiero), no por started_at de la sesión (§19/§20-37)", () => {
  const bounds = { from: "2026-08-31T00:00:00-04:00", to: "2026-09-02T23:59:59-04:00" };
  const intentMap = new Map([["i-init", { operation_type: "INITIAL" }], ["i-ext", { operation_type: "EXTENSION" }]]);
  // Sesión inicia 31-ago (pago inicial también 31-ago), pero la extensión
  // se paga recién el 1-sep -- fecha del evento financiero distinta a la
  // fecha de inicio de la sesión.
  const paymentAttempts = [
    { status: "COMMITTED", amount: 300, committed_at: "2026-08-31T23:50:00-04:00", source_id: "i-init" },
    { status: "COMMITTED", amount: 300, committed_at: "2026-09-01T00:10:00-04:00", source_id: "i-ext" },
  ];
  const result = revenueTimeSeries(paymentAttempts, intentMap, bounds);
  const day31 = result.points.find((p) => p.bucket === "2026-08-31");
  const day1 = result.points.find((p) => p.bucket === "2026-09-01");
  assert.equal(day31.amount, 300, "el pago inicial se atribuye al 31-ago (su propio committed_at)");
  assert.equal(day1.amount, 300, "la extensión se atribuye al 1-sep (su propio committed_at), NUNCA al 31-ago solo porque la sesión empezó ese día");
  assert.equal(day31.amount + day1.amount, 600, "ambos montos existen, ninguno se pierde ni se duplica -- solo están en fechas distintas, correctamente");
});

// --- Gráficos de "Reportes On Street -> Pagos" (2026-08-30) ---

test("paymentsByDay: recaudación y cantidad por día calendario, incluye días con 0 pagos (eje X sin saltos), solo COMMITTED", () => {
  const bounds = { from: "2026-08-01T00:00:00-04:00", to: "2026-08-03T23:59:59-04:00" };
  const items = [
    { transaction: { status: "COMMITTED", amount: 600, committed_at: "2026-08-01T09:00:00-04:00" } },
    { transaction: { status: "COMMITTED", amount: 400, committed_at: "2026-08-01T15:00:00-04:00" } },
    { transaction: { status: "REJECTED", amount: 9999, committed_at: null } },
    { transaction: { status: "COMMITTED", amount: 900, committed_at: "2026-08-03T10:00:00-04:00" } },
  ];
  const result = paymentsByDay(items, bounds);
  assert.equal(result.length, 3, "un punto por cada día del rango, incluido el 02-ago sin pagos");
  assert.deepEqual(result.map((r) => r.day), ["2026-08-01", "2026-08-02", "2026-08-03"]);
  assert.deepEqual(result[0], { day: "2026-08-01", amount: 1000, count: 2, averageTicket: 500 });
  assert.deepEqual(result[1], { day: "2026-08-02", amount: 0, count: 0, averageTicket: 0 }, "día sin pagos: 0, no se omite ni se inventa un valor");
  assert.deepEqual(result[2], { day: "2026-08-03", amount: 900, count: 1, averageTicket: 900 });
});

test("paymentsByDay: sin bounds (sin alcance real) devuelve arreglo vacío, nunca un error", () => {
  assert.deepEqual(paymentsByDay([{ transaction: { status: "COMMITTED", amount: 100, committed_at: "2026-08-01T00:00:00-04:00" } }], null), []);
});

test("paymentRevenueByGroup: agrupa por Estacionamiento/Área/Calle/Tramo, solo COMMITTED, ordenado por recaudación descendente", () => {
  const locA = { parking: { id: "p1", name: "Estacionamiento A" }, area: { id: "a1", name: "Área 1" }, street: { id: "s1", name: "Calle 1" }, segment: { id: "g1", name: "Tramo 1" } };
  const locB = { parking: { id: "p1", name: "Estacionamiento A" }, area: { id: "a2", name: "Área 2" }, street: { id: "s2", name: "Calle 2" }, segment: { id: "g2", name: "Tramo 2" } };
  const items = [
    { transaction: { status: "COMMITTED", amount: 500 }, location: locA },
    { transaction: { status: "COMMITTED", amount: 300 }, location: locA },
    { transaction: { status: "COMMITTED", amount: 1200 }, location: locB },
    { transaction: { status: "REJECTED", amount: 9999 }, location: locB },
  ];
  const byParking = paymentRevenueByGroup(items, "parking");
  assert.deepEqual(byParking, [{ id: "p1", label: "Estacionamiento A", amount: 2000, count: 3 }], "mismo estacionamiento en ambas ubicaciones -- un solo grupo, suma total, rechazado excluido");

  const byArea = paymentRevenueByGroup(items, "area");
  assert.deepEqual(byArea, [
    { id: "a2", label: "Área 2", amount: 1200, count: 1 },
    { id: "a1", label: "Área 1", amount: 800, count: 2 },
  ], "por área: dos grupos distintos, ordenados de mayor a menor recaudación");

  const byStreet = paymentRevenueByGroup(items, "street");
  assert.deepEqual(byStreet.map((r) => r.id), ["s2", "s1"]);

  const bySegment = paymentRevenueByGroup(items, "segment");
  assert.deepEqual(bySegment.map((r) => r.id), ["g2", "g1"]);
});

test("paymentRevenueByGroup: una transacción sin la relación pedida (id ausente) no aporta a ningún grupo inventado", () => {
  const items = [{ transaction: { status: "COMMITTED", amount: 500 }, location: { parking: { id: "p1", name: "P1" }, area: null, street: null, segment: null } }];
  assert.deepEqual(paymentRevenueByGroup(items, "area"), [], "sin área real -- ningún grupo 'Sin dato' inventado");
  assert.deepEqual(paymentRevenueByGroup(items, "parking"), [{ id: "p1", label: "P1", amount: 500, count: 1 }]);
});

test("Consistencia Pagos: paymentsByDay y paymentRevenueByGroup(parking), sobre el mismo conjunto, suman EXACTAMENTE el mismo total que revenueBreakdown (§5 del requerimiento -- gráficos y Detalle deben cuadrar)", () => {
  const bounds = { from: "2026-08-10T00:00:00-04:00", to: "2026-08-12T23:59:59-04:00" };
  const intentMap = new Map([["i1", { operation_type: "INITIAL" }], ["i2", { operation_type: "EXTENSION" }]]);
  const loc = { parking: { id: "p1", name: "P1" }, area: { id: "a1", name: "A1" }, street: { id: "s1", name: "S1" }, segment: { id: "g1", name: "G1" } };
  const paymentAttempts = [
    { status: "COMMITTED", amount: 700, committed_at: "2026-08-10T10:00:00-04:00", source_id: "i1" },
    { status: "COMMITTED", amount: 300, committed_at: "2026-08-11T10:00:00-04:00", source_id: "i2" },
    { status: "REJECTED", amount: 9999, committed_at: null, source_id: "i1" },
  ];
  const items = paymentAttempts.map((t) => ({ transaction: t, location: loc }));
  const byDayTotal = paymentsByDay(items, bounds).reduce((sum, d) => sum + d.amount, 0);
  const byParkingTotal = paymentRevenueByGroup(items, "parking").reduce((sum, g) => sum + g.amount, 0);
  const breakdown = revenueBreakdown(paymentAttempts, intentMap);
  assert.equal(byDayTotal, breakdown.total);
  assert.equal(byParkingTotal, breakdown.total);
});
