// Contrato web <-> APK para el pago TUU por intento (SOL-2026-10-11-001, fase
// APK). Funciones puras sobre `window.ParkFacilDevice`; nunca lanzan.
//
// Compatibilidad: cada capacidad se detecta por la EXISTENCIA del método, no
// por el número de versión.
//   APK 0.3.13 (runtime 1.3.0): solo payWithTuu(payload). La web sigue con la
//     reserva central y asocia el resultado al pago en espera; lo que no pueda
//     asociar queda incierto.
//   APK 0.4.0 (runtime 1.4.0): payWithTuuAttempt(payload, attemptId),
//     getPendingTuuResults(), ackTuuResult(attemptId),
//     abandonTuuAttempt(attemptId), getTuuEnvironment(), getDeviceId().
// Ninguna capacidad de la APK relaja una regla del servidor: la reserva, los
// permisos y el registro por intento no dependen de la versión de la APK.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NATIVE_DEVICE_ID = /^apk-[0-9a-f]{32}$/;

const fn = (bridge, name) => Boolean(bridge) && typeof bridge[name] === "function";

function callJson(bridge, name, ...args) {
  if (!fn(bridge, name)) return null;
  try {
    const raw = bridge[name](...args);
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    return data && typeof data === "object" && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

export function isTuuAttemptId(value) {
  return typeof value === "string" && UUID.test(value);
}

export function detectTuuBridgeCapabilities(bridge) {
  const legacy = fn(bridge, "payWithTuu");
  // El flujo por intento exige las tres piezas: lanzar, releer y confirmar.
  const attempt = fn(bridge, "payWithTuuAttempt") && fn(bridge, "getPendingTuuResults") && fn(bridge, "ackTuuResult");
  return {
    legacy,
    attempt,
    abandon: attempt && fn(bridge, "abandonTuuAttempt"),
    environment: fn(bridge, "getTuuEnvironment"),
    deviceId: fn(bridge, "getDeviceId"),
  };
}

// Ambiente TUU que DECLARA la APK: "DEV", "PROD" o null (no lo declara o no se
// pudo leer). Es una comprobación de compatibilidad con el servidor, no una
// prueba de autenticidad: lo informa el cliente.
export function readTuuBridgeEnvironment(bridge) {
  const data = callJson(bridge, "getTuuEnvironment");
  const environment = String(data?.environment || "").trim().toUpperCase();
  return environment === "DEV" || environment === "PROD" ? environment : null;
}

// Identificador del equipo entregado por la APK (dato de trazabilidad, no una
// credencial). null si la APK no lo entrega.
export function readNativeDeviceId(bridge) {
  const data = callJson(bridge, "getDeviceId");
  return data?.ok === true && typeof data.deviceId === "string" && NATIVE_DEVICE_ID.test(data.deviceId) ? data.deviceId : null;
}

// Para un intento NUEVO se prefiere el identificador de la APK; si no existe,
// el que la web guarda en el WebView (comportamiento con la APK 0.3.13).
export function resolvePosDeviceId(bridge, fallback) {
  const native = readNativeDeviceId(bridge);
  if (native) return native;
  try {
    return typeof fallback === "function" ? fallback() || null : null;
  } catch {
    return null;
  }
}

// Objeto con la forma que espera tuuResultRouter.start (payWithTuu): usa el
// método por intento cuando la APK lo tiene y el antiguo en caso contrario.
// Sin bridge de pago devuelve null (la web informa "TUU no disponible").
export function tuuLaunchBridge(bridge, attemptId) {
  const capabilities = detectTuuBridgeCapabilities(bridge);
  if (capabilities.attempt && isTuuAttemptId(attemptId)) {
    return { payWithTuu: (payloadJson) => bridge.payWithTuuAttempt(payloadJson, attemptId), usesAttempt: true };
  }
  if (capabilities.legacy) return { payWithTuu: (payloadJson) => bridge.payWithTuu(payloadJson), usesAttempt: false };
  return null;
}

// Correlación que trae un resultado entregado por la APK.
//   declared      la APK informa el campo attemptId (APK 0.4.0+).
//   attemptId     intento al que pertenece, o null.
//   uncorrelated  la APK indica que NO debe asignarse a ningún ticket.
export function correlationOfTuuResult(raw) {
  let data = raw;
  if (typeof raw === "string") {
    try { data = JSON.parse(raw); } catch { data = null; }
  }
  if (!data || typeof data !== "object") return { declared: false, attemptId: null, uncorrelated: false, late: false };
  const declared = Object.prototype.hasOwnProperty.call(data, "attemptId");
  const attemptId = isTuuAttemptId(data.attemptId) ? data.attemptId.toLowerCase() : null;
  return { declared, attemptId, uncorrelated: data.uncorrelated === true || (declared && !attemptId && data.uncorrelated !== false), late: data.late === true };
}

// Estado guardado en la APK: intento en curso y resultados sin confirmar.
export function readPendingTuuState(bridge) {
  const empty = { supported: false, inFlight: null, results: [] };
  if (!detectTuuBridgeCapabilities(bridge).attempt) return empty;
  const data = callJson(bridge, "getPendingTuuResults");
  if (!data || data.ok !== true) return { ...empty, supported: true, readFailed: true };
  const flight = data.inFlight && isTuuAttemptId(data.inFlight.attemptId)
    ? { attemptId: data.inFlight.attemptId.toLowerCase(), awaitingResult: data.inFlight.awaitingResult === true }
    : null;
  const seen = new Set();
  const results = [];
  for (const entry of Array.isArray(data.results) ? data.results : []) {
    if (!entry || !isTuuAttemptId(entry.attemptId) || !entry.result || typeof entry.result !== "object") continue;
    const attemptId = entry.attemptId.toLowerCase();
    if (seen.has(attemptId)) continue;
    seen.add(attemptId);
    results.push({ attemptId, late: entry.late === true, result: entry.result });
  }
  return { supported: true, inFlight: flight, results, readFailed: false };
}

// Qué hacer con el estado guardado al cargar el POS o volver a primer plano.
// Solo describe acciones de AVISO al servidor: nunca incluye abrir TUU.
//   RESULT          hay un resultado guardado: informarlo al servidor y, solo
//                   si el servidor lo guardó, confirmarlo en la APK.
//   LOST_IN_FLIGHT  quedó un intento sin resultado y la APK ya no lo espera
//                   (el proceso murió): informarlo como incierto y liberarlo.
export function planNativeTuuSync(state) {
  if (!state?.supported) return [];
  const actions = state.results.map((entry) => ({ type: "RESULT", attemptId: entry.attemptId, late: entry.late, result: entry.result }));
  const flight = state.inFlight;
  if (flight && !flight.awaitingResult && !state.results.some((entry) => entry.attemptId === flight.attemptId)) {
    actions.push({ type: "LOST_IN_FLIGHT", attemptId: flight.attemptId });
  }
  return actions;
}

// La web confirma un resultado en la APK SOLO cuando el servidor lo guardó o
// reconoció el duplicado (respuesta 2xx). Fallo de red, sesión vencida,
// rechazo o conflicto: el resultado se conserva en la APK y se reintenta.
export function shouldAckTuuResult(response) {
  return Boolean(response) && response.ok === true && response.network !== true;
}

// Un intento SIN resultado se libera en la APK cuando el servidor ya lo tiene
// como incierto (2xx) o ya tiene otro estado final para él: no hay resultado
// de TUU que se pueda perder.
export function shouldAbandonLostTuuAttempt(response) {
  if (shouldAckTuuResult(response)) return true;
  return Boolean(response) && response.network !== true && response.status === 409 && response.code === "CARD_ATTEMPT_RESULT_CONFLICT";
}

export function ackNativeTuuResult(bridge, attemptId) {
  if (!isTuuAttemptId(attemptId)) return { ok: false, code: "INVALID_ATTEMPT" };
  const data = callJson(bridge, "ackTuuResult", attemptId);
  return { ok: data?.ok === true, code: data?.code || (data ? null : "UNSUPPORTED") };
}

export function abandonNativeTuuAttempt(bridge, attemptId) {
  if (!isTuuAttemptId(attemptId)) return { ok: false, code: "INVALID_ATTEMPT" };
  const data = callJson(bridge, "abandonTuuAttempt", attemptId);
  return { ok: data?.ok === true, code: data?.code || (data ? null : "UNSUPPORTED") };
}
