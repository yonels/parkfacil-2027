// Cálculos puros del Dashboard On Street. Sin acceso a base de datos —
// reciben datos ya obtenidos (sesiones, extensiones, transacciones,
// ubicaciones) y devuelven KPIs/series/rankings. Toda la autorización y el
// aislamiento por empresa ocurren antes, en onStreetAdminRepository.js
// (scopedParkings), nunca aquí. Esto permite testear el cálculo sin depender
// de Supabase ni de datos reales de producción.

export const PERIODS = Object.freeze(["today", "7d", "month", "year", "custom"]);

// Aislamiento multiempresa del dashboard On Street — misma regla que
// scopedParkings en onStreetAdminRepository.js (que la reutiliza en vez de
// duplicarla). Extraída aquí, sin "server-only", precisamente para poder
// testearla sin depender de Supabase: para company_admin/operator el
// companyId SIEMPRE viene del contexto autenticado, nunca de lo que el
// cliente envíe (un intento de manipular el parámetro se ignora); solo
// platform_admin puede sub-filtrar explícitamente por empresa.
export function resolveParkingCompanyFilter(context, requestedCompanyId = null) {
  if (context.role !== "platform_admin") return context.companyId;
  return requestedCompanyId || null;
}

// Resuelve el rango [from,to) en ISO para un período. "now" es inyectable
// para tests deterministas. Personalizado exige from/to ya validados
// (strings YYYY-MM-DD) por el llamador.
// Último día del mes `month` (1-12) de `year`, calculado con Date.UTC (sin
// tocar el reloj local del proceso) -- Date.UTC(year, month, 0) entrega el
// día 0 del mes 0-index `month`, que es exactamente el último día del mes
// humano `month` (1-index). Se usa solo para construir el string de fecha
// del límite superior, nunca para el cálculo final (que sigue siendo el
// mismo patrón "-04:00" ya usado por "custom").
function lastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// month/year (§ corrección "filtro de fechas" 2026-08-28): permiten pedir un
// mes o año ARBITRARIO (p. ej. "Agosto 2026"), no solo el mes/año actual --
// necesario para Sesiones/Pagos On Street, que deben poder consultar
// cualquier período histórico, no solo el corriente. Reutiliza EXACTAMENTE
// el mismo patrón de construcción de fecha "-04:00" que ya usa "custom" --
// no se introduce una segunda política de timezone. Retrocompatible: si no
// se pasa month/year, "month"/"year" siguen significando "mes/año actual"
// tal como ya usan Dashboard/Reportes -- ningún llamador existente cambia
// de comportamiento.
export function resolvePeriodBounds(period, { from, to, month, year, now = new Date() } = {}) {
  const end = new Date(now);
  if (period === "custom") {
    if (!from || !to) return null;
    const start = new Date(`${from}T00:00:00.000-04:00`);
    const finish = new Date(`${to}T23:59:59.999-04:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(finish.getTime()) || start > finish) return null;
    return { from: start.toISOString(), to: finish.toISOString() };
  }
  if (period === "month" && month && year) {
    const mm = String(month).padStart(2, "0");
    const lastDay = String(lastDayOfMonth(Number(year), Number(month))).padStart(2, "0");
    const start = new Date(`${year}-${mm}-01T00:00:00.000-04:00`);
    const finish = new Date(`${year}-${mm}-${lastDay}T23:59:59.999-04:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(finish.getTime())) return null;
    return { from: start.toISOString(), to: finish.toISOString() };
  }
  if (period === "year" && year && !month) {
    const start = new Date(`${year}-01-01T00:00:00.000-04:00`);
    const finish = new Date(`${year}-12-31T23:59:59.999-04:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(finish.getTime())) return null;
    return { from: start.toISOString(), to: finish.toISOString() };
  }
  const start = new Date(end);
  if (period === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (period === "7d") {
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (period === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else if (period === "year") {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  } else {
    return null;
  }
  return { from: start.toISOString(), to: end.toISOString() };
}

function safeDiv(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

// Estado "visible" de una sesión: igual criterio que
// onStreetAdminCore.visibleOnStreetStatus (ACTIVE con expires_at vencido se
// muestra como EXPIRED), reimplementado aquí para no crear una dependencia
// circular entre los dos módulos Core y mantener este archivo
// independiente/testeable con fixtures propios.
export function visibleSessionStatus(session, now = new Date()) {
  if (session.status === "ACTIVE" && session.expires_at && new Date(session.expires_at) <= now) return "EXPIRED";
  return session.status;
}

// KPIs de la primera y segunda fila del dashboard. "activeSessionsNow" NO
// se calcula desde "sessions" (que ya viene acotado al período elegido) —
// se recibe aparte, como conteo en vivo independiente del período, porque
// una sesión puede seguir activa aunque haya comenzado antes del rango
// seleccionado.
export function computeKpis({ sessions, extensions, paymentAttempts, activeSessionsNow, now = new Date() }) {
  const paidSessions = sessions.filter((s) => Number(s.amount_paid) > 0);
  const revenue = paidSessions.reduce((sum, s) => sum + Number(s.amount_paid || 0), 0);
  const minutesPurchased = sessions.reduce((sum, s) => sum + Number(s.purchased_minutes || 0), 0);
  const approved = paymentAttempts.filter((t) => t.status === "COMMITTED").length;
  const rejected = paymentAttempts.filter((t) => ["REJECTED", "ABORTED", "FAILED"].includes(t.status)).length;

  return {
    activeSessionsNow: Number(activeSessionsNow) || 0,
    sessionsInPeriod: sessions.length,
    revenue,
    minutesPurchased,
    extensionsCount: extensions.length,
    averageTicket: Math.round(safeDiv(revenue, paidSessions.length)),
    averageMinutesPerSession: Math.round(safeDiv(minutesPurchased, sessions.length)),
    revenuePerSession: Math.round(safeDiv(revenue, sessions.length)),
    paymentsApproved: approved,
    paymentsRejected: rejected,
    approvalRate: safeDiv(approved, paymentAttempts.length),
    _now: now,
  };
}

// Sesiones por día dentro del rango [from,to) — incluye días con 0 sesiones
// para que el eje X del gráfico no salte fechas.
export function sessionsByDay(sessions, from, to) {
  const days = enumerateDays(from, to);
  const counts = new Map(days.map((d) => [d, 0]));
  for (const session of sessions) {
    const day = String(session.started_at || "").slice(0, 10);
    if (counts.has(day)) counts.set(day, counts.get(day) + 1);
  }
  return days.map((day) => ({ day, count: counts.get(day) || 0 }));
}

// Recaudación por día (solo sesiones con pago aprobado, amount_paid > 0),
// agrupada por fecha de inicio de la sesión.
export function revenueByDay(sessions, from, to) {
  const days = enumerateDays(from, to);
  const totals = new Map(days.map((d) => [d, 0]));
  for (const session of sessions) {
    const amount = Number(session.amount_paid || 0);
    if (amount <= 0) continue;
    const day = String(session.started_at || "").slice(0, 10);
    if (totals.has(day)) totals.set(day, totals.get(day) + amount);
  }
  return days.map((day) => ({ day, amount: totals.get(day) || 0 }));
}

function enumerateDays(fromIso, toIso) {
  const days = [];
  const start = new Date(String(fromIso).slice(0, 10));
  const end = new Date(String(toIso).slice(0, 10));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return days;
  // Tope defensivo: un año calendario como máximo, para no generar un
  // arreglo desmedido ante un rango mal formado.
  for (let cursor = new Date(start), guard = 0; cursor <= end && guard < 366; cursor.setDate(cursor.getDate() + 1), guard += 1) {
    days.push(cursor.toISOString().slice(0, 10));
  }
  return days;
}

// Distribución analítica por rangos de minutos contratados. Los rangos son
// solo para el gráfico — no alteran la regla operacional real (1 a 1.440
// minutos permitidos al contratar).
const MINUTE_BUCKETS = [
  { label: "1–30", min: 1, max: 30 },
  { label: "31–60", min: 31, max: 60 },
  { label: "61–120", min: 61, max: 120 },
  { label: "121–240", min: 121, max: 240 },
  { label: "241–480", min: 241, max: 480 },
  { label: "480+", min: 481, max: Infinity },
];
export function minutesDistribution(sessions) {
  const buckets = MINUTE_BUCKETS.map((b) => ({ label: b.label, count: 0 }));
  for (const session of sessions) {
    const minutes = Number(session.purchased_minutes || 0);
    if (minutes <= 0) continue;
    const index = MINUTE_BUCKETS.findIndex((b) => minutes >= b.min && minutes <= b.max);
    if (index >= 0) buckets[index].count += 1;
  }
  return buckets;
}

// Extensiones por sesión: 0 / 1 / 2+ extensiones. "extensionsRate" es el
// % de sesiones con al menos una extensión.
export function extensionsBreakdown(sessions, extensions) {
  const perSession = new Map();
  for (const ext of extensions) perSession.set(ext.session_id, (perSession.get(ext.session_id) || 0) + 1);
  let none = 0, one = 0, many = 0;
  for (const session of sessions) {
    const count = perSession.get(session.id) || 0;
    if (count === 0) none += 1;
    else if (count === 1) one += 1;
    else many += 1;
  }
  const extendedCount = one + many;
  return { none, one, many, extendedCount, extensionsRate: safeDiv(extendedCount, sessions.length) };
}

// Distribución por estado visible (ACTIVE/CLOSED/EXPIRED) — usa los mismos
// nombres que existen realmente en la base (on_street_pilot_sessions_status_check),
// no inventa estados nuevos.
export function statusDistribution(sessions, now = new Date()) {
  const counts = { ACTIVE: 0, CLOSED: 0, EXPIRED: 0 };
  for (const session of sessions) {
    const status = visibleSessionStatus(session, now);
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

// Ranking de ubicaciones QR por sesiones/minutos/recaudación/extensiones.
// "locateFn(session)" resuelve la jerarquía real (parking/área/calle/tramo)
// de cada sesión — se inyecta desde el repositorio, que ya tiene ese mapa
// construido (locate() en onStreetAdminRepository.js), para no duplicar esa
// lógica aquí.
export function locationRanking(sessions, extensions, locateFn) {
  const perSessionExtensions = new Map();
  for (const ext of extensions) perSessionExtensions.set(ext.session_id, (perSessionExtensions.get(ext.session_id) || 0) + 1);

  const byLocation = new Map();
  for (const session of sessions) {
    const location = locateFn(session) || {};
    const key = location.segment?.id || location.street?.id || location.parking?.id || "unknown";
    if (!byLocation.has(key)) {
      byLocation.set(key, {
        key,
        label: location.label || "Ubicación no disponible",
        parkingName: location.parking?.name || "—",
        streetName: location.street?.name || "—",
        segmentName: location.segment?.name || "—",
        sessions: 0,
        minutes: 0,
        revenue: 0,
        extensions: 0,
      });
    }
    const entry = byLocation.get(key);
    entry.sessions += 1;
    entry.minutes += Number(session.purchased_minutes || 0);
    entry.revenue += Number(session.amount_paid || 0);
    entry.extensions += perSessionExtensions.get(session.id) || 0;
  }
  return [...byLocation.values()];
}

export function sortLocationRanking(rows, sortBy = "sessions") {
  const key = ["sessions", "minutes", "revenue"].includes(sortBy) ? sortBy : "sessions";
  return [...rows].sort((a, b) => b[key] - a[key]);
}

// Ingresos por pago inicial vs. extensión (§11/§19 de la administración
// On-Street). Fuente de verdad: payment_transactions.status='COMMITTED'
// (nunca INITIALIZED/REDIRECTED/ABORTED/FAILED/PAYMENT_FAILED — esos jamás
// llegan a "COMMITTED"), distinguido por on_street_payment_intents.
// operation_type vía source_id. NOTA DE CONSISTENCIA: esta función atribuye
// cada pago a su propio período por la fecha del INTENT (created_at, ver
// fetchOnStreetScopedData), mientras que computeKpis.revenue arriba atribuye
// por la fecha de INICIO de la sesión (started_at) vía session.amount_paid.
// Para una sesión con una extensión pagada en un día distinto al de su
// inicio, ambos números pueden no sumar exactamente igual si el período
// corta esa frontera -- documentado aquí a propósito, no es un error de
// cálculo: son dos atribuciones temporales legítimas y distintas, no una
// doble contabilización (cada payment_transaction se cuenta una sola vez
// dentro de esta función).
export function revenueBreakdown(paymentAttempts, intentMap) {
  let initial = 0, extension = 0, initialCount = 0, extensionCount = 0;
  for (const t of paymentAttempts) {
    if (t.status !== "COMMITTED") continue;
    const amount = Number(t.amount || 0);
    const intent = intentMap?.get ? intentMap.get(t.source_id) : null;
    if (intent?.operation_type === "EXTENSION") { extension += amount; extensionCount += 1; }
    else { initial += amount; initialCount += 1; }
  }
  return { initial, extension, total: initial + extension, initialCount, extensionCount };
}

// Medios de pago (§16/§20/§33-C): DEBIT/CREDIT provienen del campo OFICIAL
// de Transbank payment_type_code (ver webpayCore.mjs:webpayPaymentType),
// nunca inferido por ParkFacil. "UNKNOWN" agrupa transacciones COMMITTED
// sin payment_type reconocible -- NUNCA se etiqueta nada como "Onepay":
// Transbank no expone en la respuesta de Webpay Plus ningún campo que
// distinga "pagado vía Onepay" de "tarjeta ingresada directamente", así que
// esa distinción no es determinable hoy desde los datos persistidos (ver
// informe, sección "medios de pago").
export function paymentMethodBreakdown(paymentAttempts) {
  const buckets = { DEBIT: { count: 0, amount: 0 }, CREDIT: { count: 0, amount: 0 }, UNKNOWN: { count: 0, amount: 0 } };
  for (const t of paymentAttempts) {
    if (t.status !== "COMMITTED") continue;
    const key = t.payment_type === "DEBIT" || t.payment_type === "CREDIT" ? t.payment_type : "UNKNOWN";
    buckets[key].count += 1;
    buckets[key].amount += Number(t.amount || 0);
  }
  return buckets;
}

// Sesiones "por vencer" (§9/§13): ACTIVE cuyo expires_at cae dentro de la
// ventana de aviso (por defecto 15 min, igual al umbral ya usado por el SMS
// T-15 existente — ver onStreetSmsEligibility.mjs — para no inventar un
// número nuevo sin relación con el resto del sistema). Una sesión ya
// vencida (expires_at <= now) es EXPIRED, no "por vencer" — ver
// visibleSessionStatus.
export function soonToExpireCount(sessions, now = new Date(), windowMs = 15 * 60 * 1000) {
  const limit = new Date(now.getTime() + windowMs);
  return sessions.filter((s) => s.status === "ACTIVE" && s.expires_at && new Date(s.expires_at) > now && new Date(s.expires_at) <= limit).length;
}

// Alertas operacionales — solo condiciones realmente detectables en los
// datos, nunca alertas decorativas.
export function operationalAlerts({ paymentAttempts, sessions, now = new Date() }) {
  const alerts = [];
  const pending = paymentAttempts.filter((t) => ["CREATED", "REDIRECTED", "COMMITTING"].includes(t.status)).length;
  if (pending > 0) alerts.push({ id: "pending-payments", severity: "info", message: `${pending} pago(s) Webpay en curso o pendientes de confirmación.` });

  const failed = paymentAttempts.filter((t) => ["REJECTED", "ABORTED", "FAILED"].includes(t.status)).length;
  if (failed > 0) alerts.push({ id: "failed-payments", severity: "warning", message: `${failed} pago(s) Webpay rechazados o fallidos en el período.` });

  const staleActive = sessions.filter((s) => s.status === "ACTIVE" && s.expires_at && new Date(s.expires_at) <= now).length;
  if (staleActive > 0) alerts.push({ id: "stale-active", severity: "warning", message: `${staleActive} sesión(es) marcada(s) como activa(s) en base de datos pero ya vencidas.` });

  return alerts;
}

// ============================================================
// Cierre final de la Administración On Street (auditoría 2026-08-28):
// gráficos pendientes, rendimiento por lugar y ocupación real.
// ============================================================

const CHILE_TZ = "America/Santiago";
// Partes de fecha/hora en horario de Chile (no del huso del servidor) --
// mismo criterio que el resto del módulo (custom bounds usan "-04:00"
// literal). Se usa Intl en vez de fijar el offset a mano para tolerar el
// cambio de horario de verano si volviera a existir.
function chileParts(iso) {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: CHILE_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: parts.hour };
}

// Granularidad automática de "Evolución de ingresos" (§4.1): día -> hora,
// mes -> día, año -> mes, personalizado -> según el largo real del rango
// (mismos umbrales que el brief ejemplifica: 1 día -> hora, 31 días -> día,
// 365 días -> mes).
export function resolveRevenueGranularity(bounds) {
  if (!bounds) return "day";
  const spanMs = new Date(bounds.to).getTime() - new Date(bounds.from).getTime();
  const days = spanMs / 86_400_000;
  if (days <= 2.1) return "hour";
  if (days <= 62) return "day";
  return "month";
}

function enumerateHours(fromIso, toIso) {
  const buckets = [];
  const start = chileParts(fromIso), end = chileParts(toIso);
  let cursor = new Date(fromIso);
  const stop = new Date(toIso);
  // Tope defensivo: 24h * 3 días como máximo (esta granularidad solo se
  // elige para rangos de ~2 días).
  for (let guard = 0; cursor <= stop && guard < 72; guard += 1) {
    const p = chileParts(cursor.toISOString());
    buckets.push(`${p.date} ${p.hour}:00`);
    cursor = new Date(cursor.getTime() + 3_600_000);
  }
  // Evita un arreglo vacío si from===to o el rango es menor a una hora.
  if (!buckets.length) buckets.push(`${start.date} ${start.hour}:00`, `${end.date} ${end.hour}:00`);
  return [...new Set(buckets)];
}

function enumerateMonths(fromIso, toIso) {
  const buckets = [];
  const start = new Date(String(fromIso).slice(0, 10)), end = new Date(String(toIso).slice(0, 10));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return buckets;
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const stopMonth = end.getUTCFullYear() * 12 + end.getUTCMonth();
  for (let guard = 0; cursor.getUTCFullYear() * 12 + cursor.getUTCMonth() <= stopMonth && guard < 120; guard += 1) {
    buckets.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return buckets;
}

// Evolución de ingresos (§4.1): SOLO payment_transactions.status='COMMITTED'
// (fuente de verdad de ingresos, §18/§3 del brief), nunca sesiones. La hora/
// día/mes se toma de committed_at (el evento financiero real), en horario
// de Chile. Distingue INITIAL/EXTENSION vía intentMap, igual que
// revenueBreakdown, para que el desglose por tipo esté disponible si se
// necesita, sin duplicar esa función.
export function revenueTimeSeries(paymentAttempts, intentMap, bounds, now = new Date()) {
  const granularity = resolveRevenueGranularity(bounds);
  if (!bounds) return { granularity, points: [] };
  const buckets = granularity === "hour" ? enumerateHours(bounds.from, bounds.to) : granularity === "month" ? enumerateMonths(bounds.from, bounds.to) : enumerateDays(bounds.from, bounds.to);
  const totals = new Map(buckets.map((b) => [b, { amount: 0, initial: 0, extension: 0, count: 0 }]));
  for (const t of paymentAttempts) {
    if (t.status !== "COMMITTED" || !t.committed_at) continue;
    const p = chileParts(t.committed_at);
    const key = granularity === "hour" ? `${p.date} ${p.hour}:00` : granularity === "month" ? p.date.slice(0, 7) : p.date;
    if (!totals.has(key)) continue; // fuera del rango enumerado (no debería ocurrir con committed_at dentro de bounds)
    const bucket = totals.get(key);
    const amount = Number(t.amount || 0);
    bucket.amount += amount;
    bucket.count += 1;
    const intent = intentMap?.get ? intentMap.get(t.source_id) : null;
    if (intent?.operation_type === "EXTENSION") bucket.extension += amount; else bucket.initial += amount;
  }
  return { granularity, points: buckets.map((bucket) => ({ bucket, ...totals.get(bucket) })) };
}

// Recaudación por hora del día (§4.4): histograma de 24 horas (0-23),
// agregando TODO el período seleccionado por la hora-del-día del evento
// financiero COMMITTED (committed_at, horario de Chile) -- responde "en
// qué horarios se concentra la recaudación", a diferencia de
// revenueTimeSeries (que es una serie temporal a lo largo del rango).
export function revenueByHourOfDay(paymentAttempts) {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, amount: 0, count: 0 }));
  for (const t of paymentAttempts) {
    if (t.status !== "COMMITTED" || !t.committed_at) continue;
    const hour = Number(chileParts(t.committed_at).hour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    buckets[hour].amount += Number(t.amount || 0);
    buckets[hour].count += 1;
  }
  return buckets;
}

// "Horarios de mayor uso" (Reportes On Street -> Resumen/Gráficos,
// 2026-08-30): mismo patrón que revenueByHourOfDay, pero por INICIO de
// sesión (started_at, horario de Chile) en vez de por pago COMMITTED --
// responde "a qué hora empieza a estacionar la gente" (uso real), una
// pregunta distinta a "a qué hora se concentra la recaudación" (dinero,
// ya cubierta por revenueByHourOfDay). No se fusionan en una sola función
// porque una sesión sin pago igual cuenta como uso, y un pago (extensión)
// no siempre ocurre a la hora de inicio de la sesión.
export function sessionsByHourOfDay(sessions) {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  for (const s of sessions) {
    if (!s.started_at) continue;
    const hour = Number(chileParts(s.started_at).hour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    buckets[hour].count += 1;
  }
  return buckets;
}

// Duración real de una sesión (§4.3), en minutos. Definición explícita
// (documentada porque el brief la exige):
//  - CLOSED: duration_seconds ya persistido al cerrar (closePilotSession),
//    la medición más precisa posible -- no se recalcula.
//  - EXPIRED: expires_at - started_at (agotó todo el tiempo contratado más
//    extensiones; no hay ended_at porque nadie cerró la sesión a mano).
//  - ACTIVE (todavía en curso): now - started_at (tiempo transcurrido
//    hasta este instante, igual criterio que "TIEMPO TRANSCURRIDO" en
//    Operación en vivo).
export function sessionDurationMinutes(session, now = new Date()) {
  if (session.status === "CLOSED" && session.duration_seconds != null) return Number(session.duration_seconds) / 60;
  const started = session.started_at ? new Date(session.started_at) : null;
  if (!started) return null;
  const reference = session.status === "EXPIRED" && session.expires_at ? new Date(session.expires_at)
    : session.status === "CLOSED" && session.ended_at ? new Date(session.ended_at)
    : now;
  const minutes = (reference.getTime() - started.getTime()) / 60_000;
  return minutes >= 0 ? minutes : 0;
}

const DURATION_BUCKETS = [
  { label: "0–15 min", min: 0, max: 15 },
  { label: "16–30 min", min: 16, max: 30 },
  { label: "31–60 min", min: 31, max: 60 },
  { label: "61–120 min", min: 61, max: 120 },
  { label: "+120 min", min: 121, max: Infinity },
];
export function durationDistribution(sessions, now = new Date()) {
  const buckets = DURATION_BUCKETS.map((b) => ({ label: b.label, count: 0 }));
  for (const session of sessions) {
    const minutes = sessionDurationMinutes(session, now);
    if (minutes == null) continue;
    const index = DURATION_BUCKETS.findIndex((b) => minutes >= b.min && minutes <= b.max);
    if (index >= 0) buckets[index].count += 1;
  }
  return buckets;
}

// Sesiones por estado (§4.2): VIGENTE/POR VENCER son una partición de
// ACTIVE (igual ventana que soonToExpireCount, sin inventar un número
// nuevo); VENCIDA/FINALIZADA son EXPIRED/CLOSED tal cual. FISCALIZADA es
// transversal (una sesión vencida o finalizada puede además estar
// fiscalizada) -- se informa aparte, nunca sumada a las 4 anteriores, para
// no inflar el total ni duplicar el conteo en un gráfico de barras.
export function sessionStateBreakdown(sessions, fiscalizedSessionIds = new Set(), now = new Date(), soonWindowMs = 15 * 60 * 1000) {
  const limit = new Date(now.getTime() + soonWindowMs);
  let vigente = 0, porVencer = 0, vencida = 0, finalizada = 0, fiscalizada = 0;
  for (const session of sessions) {
    const status = visibleSessionStatus(session, now);
    if (status === "ACTIVE") {
      const expiring = session.expires_at && new Date(session.expires_at) > now && new Date(session.expires_at) <= limit;
      if (expiring) porVencer += 1; else vigente += 1;
    } else if (status === "EXPIRED") vencida += 1;
    else if (status === "CLOSED") finalizada += 1;
    if (fiscalizedSessionIds.has(session.id)) fiscalizada += 1;
  }
  return { VIGENTE: vigente, POR_VENCER: porVencer, VENCIDA: vencida, FINALIZADA: finalizada, FISCALIZADA: fiscalizada };
}

// Rendimiento por lugar (§5): generaliza locationRanking a cualquier nivel
// de la jerarquía (estacionamiento/área/calle/tramo/ubicación QR) vía
// "groupBy", reutilizando locateFn (igual que locationRanking, inyectado
// desde el repositorio -- no duplica la resolución de jerarquía). Agrega
// las métricas que locationRanking no tenía: vehículos (patentes
// distintas), ticket promedio, duración promedio, extensiones/ingresos por
// extensión y fiscalizaciones. Ocupación se agrega aparte (occupancyFn es
// opcional) porque depende de capacidad real (parking_street_segments.
// capacity), no siempre disponible -- si no se provee o no hay capacidad
// conocida para el grupo, occupancy queda null (§6: nunca inventar un
// porcentaje).
const GROUP_RESOLVERS = {
  parking: (location) => ({ id: location.parking?.id, label: location.parking?.name }),
  area: (location) => ({ id: location.area?.id, label: location.area?.name }),
  street: (location) => ({ id: location.street?.id, label: location.street?.name }),
  segment: (location) => ({ id: location.segment?.id, label: location.segment?.name }),
  qrLocation: (location) => ({ id: location.segment?.id || location.street?.id || location.parking?.id, label: location.label }),
};
export function placePerformanceRanking(sessions, extensions, fiscalizedSessionIds, locateFn, groupBy = "qrLocation", now = new Date(), occupancyFn = null) {
  const resolver = GROUP_RESOLVERS[groupBy] || GROUP_RESOLVERS.qrLocation;
  const extensionsBySession = new Map();
  for (const ext of extensions) {
    const list = extensionsBySession.get(ext.session_id) || [];
    list.push(ext);
    extensionsBySession.set(ext.session_id, list);
  }
  const byGroup = new Map();
  for (const session of sessions) {
    const location = locateFn(session) || {};
    const { id, label } = resolver(location) || {};
    const key = id || "unknown";
    if (!byGroup.has(key)) {
      byGroup.set(key, {
        key, label: label || "Sin datos",
        parkingName: location.parking?.name || "—", areaName: location.area?.name || "—", streetName: location.street?.name || "—", segmentName: location.segment?.name || "—",
        plates: new Set(), sessions: 0, revenue: 0, durationTotal: 0, durationCount: 0, extensionsCount: 0, extensionsRevenue: 0, fiscalizations: 0,
      });
    }
    const entry = byGroup.get(key);
    entry.sessions += 1;
    if (session.license_plate_normalized) entry.plates.add(session.license_plate_normalized);
    entry.revenue += Number(session.amount_paid || 0);
    const minutes = sessionDurationMinutes(session, now);
    if (minutes != null) { entry.durationTotal += minutes; entry.durationCount += 1; }
    const sessionExtensions = extensionsBySession.get(session.id) || [];
    entry.extensionsCount += sessionExtensions.length;
    entry.extensionsRevenue += sessionExtensions.reduce((sum, e) => sum + Number(e.simulated_amount || 0), 0);
    if (fiscalizedSessionIds?.has?.(session.id)) entry.fiscalizations += 1;
  }
  return [...byGroup.values()].map((entry) => ({
    key: entry.key, label: entry.label,
    parkingName: entry.parkingName, areaName: entry.areaName, streetName: entry.streetName, segmentName: entry.segmentName,
    vehicles: entry.plates.size, sessions: entry.sessions, revenue: entry.revenue,
    averageTicket: Math.round(safeDiv(entry.revenue, entry.sessions)),
    averageDurationMinutes: Math.round(safeDiv(entry.durationTotal, entry.durationCount)),
    extensionsCount: entry.extensionsCount, extensionsRevenue: entry.extensionsRevenue,
    fiscalizations: entry.fiscalizations,
    occupancy: occupancyFn ? occupancyFn(entry.key) : null,
  }));
}
export function sortPlacePerformance(rows, sortBy = "revenue") {
  const key = ["sessions", "revenue", "vehicles", "averageTicket", "extensionsCount", "fiscalizations"].includes(sortBy) ? sortBy : "revenue";
  return [...rows].sort((a, b) => b[key] - a[key]);
}

// Ocupación (§6): capacity = parking_street_segments.capacity (o
// right_capacity+left_capacity si el total combinado no está poblado) --
// dato REAL, persistido, confirmado en el esquema (no existía cuando se
// documentó "pendiente" en la tarea anterior: right_capacity/left_capacity
// se agregaron después, en 20260731173000_on_street_spaces_and_zones.sql).
// activeCount = sesiones ACTIVE EN VIVO en ese tramo (no depende del
// período del filtro -- ocupación es una foto del momento actual, igual
// criterio que "Sesiones activas ahora" del Dashboard). Si no hay capacidad
// conocida para el tramo, devuelve null explícito -- nunca 0/100% inventado.
export function segmentCapacity(segment) {
  if (!segment) return null;
  if (segment.capacity != null && Number(segment.capacity) > 0) return Number(segment.capacity);
  const sides = [segment.right_capacity, segment.left_capacity].filter((v) => v != null);
  if (!sides.length) return null;
  const total = sides.reduce((sum, v) => sum + Number(v), 0);
  return total > 0 ? total : null;
}
export function occupancyRate(activeCount, capacity) {
  if (capacity == null || capacity <= 0) return null;
  const active = Number(activeCount) || 0;
  return { active, capacity, rate: Math.min(1, safeDiv(active, capacity)) };
}

// Paginación/orden server-side de Reportes (§7 de la auditoría 2026-08-28).
// Pura y sin "server-only" a propósito (igual criterio que el resto de este
// archivo): el resto del alcance completo (todas las filas que calzan con
// los filtros) sigue obteniéndose de una sola vez desde
// fetchOnStreetScopedData en onStreetAdminRepository.js -- eso NO cambia,
// porque el Resumen/Excel/KPIs necesitan el conjunto completo, no solo la
// página visible. Lo que hacen las funciones de aquí abajo es: (1) ordenar
// el conjunto COMPLETO ya filtrado (nunca solo la página), y (2) recortar a
// la página pedida ANTES de que las filas lleguen al navegador -- el
// cliente nunca recibe más de "pageSize" filas salvo que input.export=true
// (usado únicamente por el botón Excel, que sí necesita el detalle
// completo). No es una reescritura a agregación SQL: el límite real hoy
// sigue siendo REPORT_ROW_CAP (ver onStreetAdminRepository.js), un techo ya
// existente (antes 2000, documentado como límite de escala pendiente de una
// futura iteración con agregación en base de datos si el volumen real lo
// exige -- ver informe, sección Paginación).
export const REPORT_PAGE_SIZES = Object.freeze([25, 50, 100]);
export function normalizePagination(input = {}) {
  const pageSize = REPORT_PAGE_SIZES.includes(Number(input.pageSize)) ? Number(input.pageSize) : 25;
  const page = Number.isInteger(Number(input.page)) && Number(input.page) > 0 ? Number(input.page) : 1;
  return { page, pageSize };
}
export function compareForSort(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const da = new Date(a), db = new Date(b);
  if (!Number.isNaN(da.getTime()) && !Number.isNaN(db.getTime()) && (String(a).includes("-") || String(b).includes("-"))) return da.getTime() - db.getTime();
  return String(a).localeCompare(String(b), "es", { sensitivity: "base", numeric: true });
}
export function applySortAndPaginate(rows, input = {}) {
  let sorted = rows;
  if (input.sortKey) {
    const factor = input.sortDirection === "desc" ? -1 : 1;
    sorted = [...rows].sort((a, b) => compareForSort(a[input.sortKey], b[input.sortKey]) * factor);
  }
  const totalRows = sorted.length;
  if (input.export) return { rows: sorted, pagination: { page: 1, pageSize: totalRows || 1, totalRows } };
  const { page, pageSize } = normalizePagination(input);
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  return { rows: sorted.slice(start, start + pageSize), pagination: { page: safePage, pageSize, totalRows, totalPages } };
}

// ============================================================
// Gráficos de "Reportes On Street -> Pagos" (2026-08-30). Ambas funciones
// reciben "items" ya resueltos por el repositorio como
// { transaction, location } -- transaction=fila real de payment_transactions
// (id,status,amount,committed_at,...), location=objeto ya armado por
// locate() (parking/area/street/segment). Se reciben pre-resueltos (en vez
// de recibir "locate" como dependencia) para que este archivo siga sin
// ninguna dependencia de Supabase/servidor, igual que el resto de
// funciones "Core" de este módulo -- totalmente testeable con fixtures
// planas.
// ============================================================

// Recaudación y cantidad de pagos por día calendario (SIEMPRE por día, a
// diferencia de revenueTimeSeries que adapta la granularidad según el
// largo del período -- el requerimiento de Gráficos de Pagos pide
// explícitamente "por día"). Misma fuente de verdad que revenueTimeSeries/
// revenueByHourOfDay: solo payment_transactions.status='COMMITTED', por
// committed_at en horario de Chile -- nunca sesiones.
export function paymentsByDay(items, bounds) {
  if (!bounds) return [];
  const days = enumerateDays(bounds.from, bounds.to);
  const totals = new Map(days.map((d) => [d, { amount: 0, count: 0 }]));
  for (const { transaction: t } of items) {
    if (t.status !== "COMMITTED" || !t.committed_at) continue;
    const day = chileParts(t.committed_at).date;
    if (!totals.has(day)) continue;
    const bucket = totals.get(day);
    bucket.amount += Number(t.amount || 0);
    bucket.count += 1;
  }
  return days.map((day) => {
    const bucket = totals.get(day);
    return { day, amount: bucket.amount, count: bucket.count, averageTicket: bucket.count > 0 ? Math.round(bucket.amount / bucket.count) : 0 };
  });
}

// Recaudación agrupada por nivel de jerarquía (Estacionamiento/Área/Calle/
// Tramo), a partir de payment_transactions COMMITTED -- misma atribución
// que revenueBreakdown (por pago confirmado). Solo agrupa transacciones
// cuya ubicación resolvió el nivel pedido (id presente); una transacción
// sin esa relación (por ejemplo sin área, si algún día existiera una
// ubicación fuera de jerarquía) simplemente no aporta a ese grupo, nunca
// se le inventa una etiqueta "Sin dato" mezclada con datos reales.
const PAYMENT_GROUP_RESOLVERS = {
  parking: (location) => ({ id: location.parking?.id, label: location.parking?.name }),
  area: (location) => ({ id: location.area?.id, label: location.area?.name }),
  street: (location) => ({ id: location.street?.id, label: location.street?.name }),
  segment: (location) => ({ id: location.segment?.id, label: location.segment?.name }),
};
export function paymentRevenueByGroup(items, groupBy) {
  const resolver = PAYMENT_GROUP_RESOLVERS[groupBy] || PAYMENT_GROUP_RESOLVERS.parking;
  const byGroup = new Map();
  for (const { transaction: t, location } of items) {
    if (t.status !== "COMMITTED") continue;
    const { id, label } = resolver(location || {});
    if (!id) continue;
    if (!byGroup.has(id)) byGroup.set(id, { id, label: label || "—", amount: 0, count: 0 });
    const entry = byGroup.get(id);
    entry.amount += Number(t.amount || 0);
    entry.count += 1;
  }
  return [...byGroup.values()].sort((a, b) => b.amount - a.amount);
}
