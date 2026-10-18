// Off Street — Pago liberado (Fase C/D): autorizaciones individuales por
// patente y estacionamiento. Reglas documentadas (usuario 2026-10-01/04):
//
// - CONTINUA: intervalo con fecha y hora de inicio y término (p. ej. dos
//   horas, tres días).
// - RECURRENTE: días de la semana + franjas horarias dentro de una vigencia
//   desde/hasta (p. ej. lunes a viernes de 09:00 a 18:00). Una franja puede
//   cruzar medianoche: "lunes 22:00–02:00" = lunes 22:00 → martes 02:00.
// - Zona horaria operacional; festivos = días normales (sin calendario).
// - La duración de una autorización NO determina el precio del módulo
//   (importe mensual que ParkFacil cobra al cliente). Lo que el
//   estacionamiento cobra al beneficiario sale de su tarifa (hora, día, mes
//   o año) × cantidad, y se copia en la autorización (SOL-2026-10-05-001).
// - Fuera del horario autorizado corresponde el cobro normal: solo se
//   descuenta el tiempo cubierto, sin duplicar (la franja es de reloj y no
//   se reinicia por ingreso).

import { formatChileanPlate } from "../dataEntry.mjs";
import { computeAuthorizationTerms, describeTerms } from "./tariffCore.mjs";
import {
  addLocalDays,
  formatLocalDateTime,
  localParts,
  parseLocalDateTime,
  parseTimeOfDay,
  RELEASED_PAYMENT_TIME_ZONE,
  zonedLocalToUtc,
} from "./zonedTime.mjs";

export const AUTHORIZATION_KINDS = Object.freeze({ CONTINUOUS: "CONTINUOUS", RECURRING: "RECURRING" });
export const WEEKDAY_LABELS = Object.freeze({ 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb", 7: "Dom" });

const MAX_WINDOWS = 14;
const MAX_BULK_PLATES = 200;

function minutesText(total) {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// Patentes de la carga masiva: una por línea/coma; cada una genera una
// autorización individual (nunca un grupo).
export function parsePlateList(value) {
  const raw = String(value || "").split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean);
  const plates = [];
  const invalid = [];
  for (const item of raw) {
    const plate = formatChileanPlate(item);
    if (!plate) invalid.push(item);
    else if (!plates.includes(plate)) plates.push(plate);
  }
  return { plates, invalid };
}

function normalizeWindows(schedule) {
  const errors = [];
  const windows = [];
  if (!Array.isArray(schedule) || schedule.length === 0) {
    return { windows, errors: ["Agrega al menos una franja horaria con sus días."] };
  }
  if (schedule.length > MAX_WINDOWS) errors.push(`Máximo ${MAX_WINDOWS} franjas por autorización.`);
  schedule.slice(0, MAX_WINDOWS).forEach((item, index) => {
    const label = `Franja ${index + 1}`;
    const days = [...new Set((Array.isArray(item?.days) ? item.days : []).map(Number))].filter((day) => Number.isInteger(day) && day >= 1 && day <= 7).sort();
    const start = parseTimeOfDay(item?.start);
    const end = parseTimeOfDay(item?.end);
    if (!days.length) errors.push(`${label}: selecciona al menos un día.`);
    if (start === null || end === null) errors.push(`${label}: indica hora de inicio y término (HH:MM).`);
    else if (start === end) errors.push(`${label}: el inicio y el término no pueden ser iguales.`);
    if (days.length && start !== null && end !== null && start !== end) {
      windows.push({ days, start: minutesText(start), end: minutesText(end) });
    }
  });
  return { windows, errors };
}

/**
 * Valida y normaliza una autorización enviada por el administrador
 * (SOL-2026-10-05-001). La vigencia la define lo ACORDADO con el
 * beneficiario: inicio (fecha y hora locales) + cantidad de la unidad de la
 * tarifa elegida; el término se calcula (no se ingresa). La tarifa y el
 * total se copian en la autorización (la RPC es la que guarda la copia).
 * - CONTINUA: cubre todo el período acordado.
 * - RECURRENTE: dentro del período acordado, solo las franjas indicadas.
 *   Las franjas son independientes de la unidad comercial de cobro.
 * `tariffs`: tarifas VIGENTES del estacionamiento. `contract`: solo una
 * versión periódica anterior (con término) limita la vigencia.
 */
export function validateAuthorizationInput(input, { contract = null, tariffs = [], current = null, timeZone = RELEASED_PAYMENT_TIME_ZONE } = {}) {
  const errors = [];
  const kind = String(input?.kind || "").toUpperCase();
  let schedule = [];
  if (kind === AUTHORIZATION_KINDS.RECURRING) {
    const normalized = normalizeWindows(input?.schedule);
    errors.push(...normalized.errors);
    schedule = normalized.windows;
  } else if (kind !== AUTHORIZATION_KINDS.CONTINUOUS) {
    errors.push("Selecciona el tipo de autorización: período continuo u horario recurrente.");
  }

  const startsAtMs = parseLocalDateTime(input?.startsAt, timeZone);
  if (startsAtMs === null) errors.push("Indica la fecha y hora de inicio.");
  const tariffId = String(input?.tariffId || "").trim();
  const quantity = Number(input?.quantity);
  // Una modificación que conserva tarifa, cantidad e inicio mantiene la
  // copia acordada aunque la tarifa haya cambiado después.
  const keepsTerms = Boolean(current?.terms && current.terms.tariffId === tariffId && current.terms.quantity === quantity
    && startsAtMs !== null && new Date(current.validFrom).getTime() === startsAtMs);
  let terms = null;
  if (keepsTerms) {
    terms = { ...current.terms, startsAt: new Date(current.validFrom).toISOString(), endsAt: new Date(current.validTo).toISOString() };
  } else {
    const tariff = (tariffs || []).find((item) => item.id === tariffId && !item.supersededAt);
    if (!tariffId) errors.push("Selecciona la tarifa acordada con el beneficiario (hora, día, mes o año).");
    else if (!tariff) errors.push("La tarifa seleccionada ya no está vigente: elige la tarifa actual.");
    if (tariff && startsAtMs !== null) {
      const computed = computeAuthorizationTerms({ tariff, quantity, startsAtMs, timeZone });
      if (computed.ok) terms = computed.value;
      else errors.push(...computed.errors);
    }
  }

  if (contract?.endsAt && terms && !errors.length) {
    const contractStart = new Date(contract.startsAt).getTime();
    const contractEnd = new Date(contract.endsAt).getTime();
    if (new Date(terms.startsAt).getTime() < contractStart || new Date(terms.endsAt).getTime() > contractEnd) {
      errors.push(`La autorización debe quedar dentro de la vigencia contratada (${formatLocalDateTime(contractStart, timeZone)} a ${formatLocalDateTime(contractEnd, timeZone)}).`);
    }
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      kind,
      startsAt: terms.startsAt,
      validFrom: terms.startsAt,
      validTo: terms.endsAt,
      schedule,
      tariffId: terms.tariffId,
      quantity: terms.quantity,
      terms,
      beneficiaryName: String(input?.beneficiaryName || "").trim().slice(0, 120),
      beneficiaryReference: String(input?.beneficiaryReference || "").trim().slice(0, 120),
    },
  };
}

// Lo que se envía a la RPC: ella vuelve a leer la tarifa vigente, calcula
// término y total, y guarda la copia (nunca se confía en montos del cliente).
export function authorizationRpcInput(value, licensePlate) {
  return {
    licensePlate,
    kind: value.kind,
    schedule: value.schedule,
    startsAt: value.startsAt,
    tariffId: value.tariffId,
    quantity: value.quantity,
    beneficiaryName: value.beneficiaryName,
    beneficiaryReference: value.beneficiaryReference,
  };
}

export function validatePlates(input) {
  const { plates, invalid } = parsePlateList(input?.plates ?? input?.licensePlate);
  const errors = [];
  if (invalid.length) errors.push(`Patentes inválidas: ${invalid.slice(0, 10).join(", ")}.`);
  if (!plates.length && !invalid.length) errors.push("Indica al menos una patente.");
  if (plates.length > MAX_BULK_PLATES) errors.push(`Máximo ${MAX_BULK_PLATES} patentes por carga.`);
  return { plates, errors };
}

function mergeIntervals(intervals) {
  const sorted = intervals.filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

// Intervalos [inicio, término) en ms que una autorización cubre dentro de
// [fromMs, toMs).
export function authorizationIntervals(authorization, fromMs, toMs, { timeZone = RELEASED_PAYMENT_TIME_ZONE, limitMs = null } = {}) {
  const validFrom = new Date(authorization.validFrom ?? authorization.valid_from).getTime();
  let validTo = new Date(authorization.validTo ?? authorization.valid_to).getTime();
  if (limitMs !== null && limitMs !== undefined) validTo = Math.min(validTo, limitMs);
  if (Math.min(toMs, validTo) <= fromMs && authorization.kind === AUTHORIZATION_KINDS.CONTINUOUS) return [];
  const kind = authorization.kind;
  if (kind === AUTHORIZATION_KINDS.CONTINUOUS) {
    const start = Math.max(fromMs, validFrom);
    const end = Math.min(toMs, validTo);
    return end > start ? [[start, end]] : [];
  }
  // Recurrente: cuenta cada franja que COMIENZA antes del fin de la vigencia,
  // hasta su término (una franja nocturna del último día termina al día
  // siguiente), y nunca antes del inicio de la vigencia.
  const hardLimit = limitMs === null || limitMs === undefined ? Infinity : limitMs;
  const start = fromMs;
  const end = Math.min(toMs, hardLimit);
  if (!(end > start)) return [];

  const schedule = Array.isArray(authorization.schedule) ? authorization.schedule : [];
  const intervals = [];
  // Desde el día local anterior (franjas nocturnas que vienen de la víspera).
  let day = addLocalDays(localParts(start, timeZone), -1);
  const lastDay = localParts(end, timeZone);
  const lastKey = lastDay.year * 10000 + lastDay.month * 100 + lastDay.day;
  for (let guard = 0; guard < 4000; guard += 1) {
    const key = day.year * 10000 + day.month * 100 + day.day;
    if (key > lastKey) break;
    const weekday = new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay() || 7;
    for (const window of schedule) {
      if (!window.days.includes(weekday)) continue;
      const startMinutes = parseTimeOfDay(window.start);
      const endMinutes = parseTimeOfDay(window.end);
      const windowStart = zonedLocalToUtc({ ...day, hour: Math.floor(startMinutes / 60), minute: startMinutes % 60 }, timeZone);
      const endDay = endMinutes <= startMinutes ? addLocalDays(day, 1) : day;
      const windowEnd = zonedLocalToUtc({ ...endDay, hour: Math.floor(endMinutes / 60), minute: endMinutes % 60 }, timeZone);
      // Franja que comienza después del fin de la vigencia: no aplica. Una
      // franja en curso al inicio de la vigencia cuenta desde ese inicio.
      if (windowStart >= validTo || windowEnd <= validFrom) continue;
      intervals.push([Math.max(windowStart, validFrom, start), Math.min(windowEnd, end)]);
    }
    day = addLocalDays(day, 1);
  }
  return mergeIntervals(intervals);
}

// Tiempo cubierto (segundos enteros) por la unión de autorizaciones entre
// el ingreso y la salida. Nunca cuenta dos veces un mismo minuto.
export function coveredSecondsBetween(authorizations, entryAt, exitAt, options = {}) {
  const fromMs = new Date(entryAt).getTime();
  const toMs = new Date(exitAt).getTime();
  if (!(toMs > fromMs)) return 0;
  const all = (authorizations || []).flatMap((authorization) => authorizationIntervals(authorization, fromMs, toMs, options));
  const covered = mergeIntervals(all).reduce((sum, [start, end]) => sum + (end - start), 0);
  return Math.floor(covered / 1000);
}

// La autorización está vigente (dentro de su período de validez) en `now`.
export function isAuthorizationCurrent(authorization, now = Date.now()) {
  const at = new Date(now).getTime();
  return authorization.status !== "REVOKED"
    && new Date(authorization.validFrom ?? authorization.valid_from).getTime() <= at
    && at < new Date(authorization.validTo ?? authorization.valid_to).getTime();
}

export function isCoveredAt(authorization, now = Date.now(), options = {}) {
  const at = new Date(now).getTime();
  return authorizationIntervals(authorization, at, at + 1000, options).length > 0;
}

export function describeAuthorizationTerms(authorization) {
  return authorization?.terms ? describeTerms(authorization.terms) : "Sin condiciones comerciales registradas (autorización anterior)";
}

export function describeAuthorization(authorization, timeZone = RELEASED_PAYMENT_TIME_ZONE) {
  const from = authorization.validFrom ?? authorization.valid_from;
  const to = authorization.validTo ?? authorization.valid_to;
  if (authorization.kind === AUTHORIZATION_KINDS.CONTINUOUS) {
    return `Continua: ${formatLocalDateTime(from, timeZone)} a ${formatLocalDateTime(to, timeZone)}`;
  }
  const windows = (authorization.schedule || []).map((window) => {
    const days = window.days.map((day) => WEEKDAY_LABELS[day]).join(", ");
    const crosses = parseTimeOfDay(window.end) <= parseTimeOfDay(window.start) ? " (cruza medianoche)" : "";
    return `${days} ${window.start}–${window.end}${crosses}`;
  });
  return `Recurrente: ${windows.join(" · ")} · vigencia ${formatLocalDateTime(from, timeZone)} a ${formatLocalDateTime(to, timeZone)}`;
}

export function authorizationFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    parkingId: row.parking_id,
    companyId: row.company_id,
    licensePlate: row.license_plate,
    beneficiaryName: row.beneficiary_name || "",
    beneficiaryReference: row.beneficiary_reference || "",
    kind: row.kind,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    schedule: Array.isArray(row.schedule) ? row.schedule : [],
    timeZone: row.time_zone || RELEASED_PAYMENT_TIME_ZONE,
    terms: row.tariff_id
      ? {
          tariffId: row.tariff_id,
          tariffVersion: row.tariff_version,
          billingUnit: row.billing_unit,
          quantity: row.quantity,
          unitPrice: Number(row.unit_price),
          currency: row.currency,
          vatTreatment: row.vat_treatment,
          vatRate: Number(row.vat_rate),
          totalAmount: Number(row.total_amount),
          netAmount: Number(row.net_amount),
          taxAmount: Number(row.tax_amount),
          capturedAt: row.terms_captured_at,
        }
      : null,
    status: row.status,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revokedAt: row.revoked_at,
    revokedReason: row.revoked_reason,
  };
}
