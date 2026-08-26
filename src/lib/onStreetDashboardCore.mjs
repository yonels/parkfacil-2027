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
export function resolvePeriodBounds(period, { from, to, now = new Date() } = {}) {
  const end = new Date(now);
  if (period === "custom") {
    if (!from || !to) return null;
    const start = new Date(`${from}T00:00:00.000-04:00`);
    const finish = new Date(`${to}T23:59:59.999-04:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(finish.getTime()) || start > finish) return null;
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
