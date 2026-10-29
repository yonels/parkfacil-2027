// Off Street — Pago liberado gestionado por el cliente (SOL-2026-10-28-003,
// prototipo v5 aprobado el 2026-10-28). Puro (sin red): lo usan la API del
// administrador, el POS (/api/data-entry), la pantalla y las pruebas.
//
// - Patente AAAA-11 o AA-1111; se guarda en el formato interno del sistema
//   (XXXX-XX: AA-1111 -> AA11-11), igual que el POS.
// - Inicio y término los define el cliente; la cantidad y la unidad solo
//   sugieren el término y se guardan para el ticket «LIBERADO POR …».
// - «Semanas (lunes a viernes)»: sábado y domingo no hay beneficio.
// - Beneficiario (nombre, RUT, teléfono, correo) y motivo: obligatorios.
// - Modalidad FREE (sin costo) o THIRD_PARTY (factura a un tercero por un
//   valor neto en UF o pesos). Uso MULTIPLE, SINGLE o MAX.

import { formatChileanPlate } from "../dataEntry.mjs";
import { contractEndMs, formatLocalDateTime, localParts, parseLocalDateTime, RELEASED_PAYMENT_TIME_ZONE } from "../releasedPayment/zonedTime.mjs";

export const PLATE_TIME_ZONE = RELEASED_PAYMENT_TIME_ZONE;
export const DURATION_UNITS = Object.freeze({
  HOUR: { singular: "hora", plural: "horas", short: "HORA", shortPlural: "HORAS" },
  DAY: { singular: "día", plural: "días", short: "DÍA", shortPlural: "DÍAS" },
  WEEK_WEEKDAYS: { singular: "semana (lunes a viernes)", plural: "semanas (lunes a viernes)", short: "SEMANA", shortPlural: "SEMANAS" },
  MONTH: { singular: "mes", plural: "meses", short: "MES", shortPlural: "MESES" },
  YEAR: { singular: "año", plural: "años", short: "AÑO", shortPlural: "AÑOS" },
});
export const MODALITIES = Object.freeze({ FREE: "FREE", THIRD_PARTY: "THIRD_PARTY" });
export const USAGE_MODES = Object.freeze({ MULTIPLE: "MULTIPLE", SINGLE: "SINGLE", MAX: "MAX" });
export const PLATE_STATUS = Object.freeze({
  CURRENT: "CURRENT", SCHEDULED: "SCHEDULED", EXPIRED: "EXPIRED", FINISHED: "FINISHED", EXHAUSTED: "EXHAUSTED", DELETED: "DELETED",
});
export const PLATE_STATUS_LABELS = Object.freeze({
  CURRENT: "Vigente", SCHEDULED: "Programada", EXPIRED: "Vencida", FINISHED: "Finalizada", EXHAUSTED: "Usos agotados", DELETED: "Eliminada",
});
export const MAX_IMPORT_ROWS = 1000;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const text = (value) => String(value ?? "").trim();

// --- Patente --------------------------------------------------------------

// Acepta AAAA-11 (actual) y AA-1111 (antigua), con o sin guion/espacios.
export function normalizeReleasedPlate(value) {
  const raw = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]{4}\d{2}$/.test(raw) && !/^[A-Z]{2}\d{4}$/.test(raw)) return "";
  return formatChileanPlate(raw);
}

// Formato para mostrar: AA11-11 (antigua guardada) -> AA-1111.
export function displayReleasedPlate(stored) {
  const value = String(stored || "");
  const old = value.match(/^([A-Z]{2})(\d{2})-(\d{2})$/);
  return old ? `${old[1]}-${old[2]}${old[3]}` : value;
}

// --- RUT, teléfono y correo -----------------------------------------------

export function rutCheckDigit(body) {
  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const rest = 11 - (sum % 11);
  return rest === 11 ? "0" : rest === 10 ? "K" : String(rest);
}

// "123456785" / "12.345.678-5" -> "12.345.678-5"; "" si es inválido.
export function normalizeRut(value) {
  const raw = String(value || "").toUpperCase().replace(/[^0-9K]/g, "");
  if (!/^\d{7,8}[0-9K]$/.test(raw)) return "";
  const body = raw.slice(0, -1);
  const dv = raw.slice(-1);
  if (rutCheckDigit(body) !== dv) return "";
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`;
}

// Celular chileno: +56 9 XXXX XXXX (también 9XXXXXXXX). Se guarda "+56 9 XXXX XXXX".
export function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("56")) digits = digits.slice(2);
  if (!/^9\d{8}$/.test(digits)) return "";
  return `+56 9 ${digits.slice(1, 5)} ${digits.slice(5)}`;
}

export const normalizeEmail = (value) => {
  const email = text(value).toLowerCase();
  return EMAIL.test(email) && email.length <= 160 ? email : "";
};

// --- Duración -------------------------------------------------------------

// Término sugerido: horas exactas; días, semanas, meses y años calendario a
// la misma hora local.
export function suggestedEndMs(startMs, quantity, unit, timeZone = PLATE_TIME_ZONE) {
  const n = Number(quantity);
  if (!Number.isInteger(n) || n < 1 || !DURATION_UNITS[unit]) return null;
  if (unit === "WEEK_WEEKDAYS") return contractEndMs(startMs, "DAY", n * 7, timeZone);
  return contractEndMs(startMs, unit, n, timeZone);
}

export function describeDuration(quantity, unit) {
  const meta = DURATION_UNITS[unit];
  if (!meta || !quantity) return "";
  return `${quantity} ${Number(quantity) === 1 ? meta.singular : meta.plural}`;
}

// --- Validación del formulario ----------------------------------------------

function parseInstant(value, timeZone) {
  if (value === null || value === undefined || value === "") return null;
  const local = parseLocalDateTime(value, timeZone);
  if (local !== null) return local;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Valida lo enviado por el administrador. Devuelve { ok, row, errors }:
 * `row` con la forma de released_plate_save (p_input). `current`: registro
 * existente al editar (la patente no cambia).
 */
export function validateReleasedPlateInput(input, { current = null, timeZone = PLATE_TIME_ZONE } = {}) {
  const errors = [];
  const plate = current ? current.licensePlate : normalizeReleasedPlate(input?.plate);
  if (!plate) errors.push("Patente inválida: usa AAAA-11 o AA-1111.");
  const fromMs = parseInstant(input?.validFrom, timeZone);
  const toMs = parseInstant(input?.validTo, timeZone);
  if (fromMs === null) errors.push("Indica la fecha y hora de inicio.");
  if (toMs === null) errors.push("Indica la fecha y hora de término.");
  if (fromMs !== null && toMs !== null && toMs <= fromMs) errors.push("El término debe ser posterior al inicio.");

  const unit = text(input?.durationUnit).toUpperCase();
  const quantity = input?.durationQuantity === "" || input?.durationQuantity === null || input?.durationQuantity === undefined ? null : Number(input.durationQuantity);
  const hasDuration = Boolean(unit) && quantity !== null;
  if (unit && !DURATION_UNITS[unit]) errors.push("Unidad de duración inválida.");
  if (hasDuration && (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999)) errors.push("La cantidad debe ser un entero entre 1 y 9999.");

  const name = text(input?.beneficiaryName);
  const rut = normalizeRut(input?.beneficiaryRut);
  const phone = normalizePhone(input?.beneficiaryPhone);
  const email = normalizeEmail(input?.beneficiaryEmail);
  const reason = text(input?.reason);
  if (name.length < 2 || name.length > 120) errors.push("Ingresa el nombre del beneficiario.");
  if (!rut) errors.push("RUT del beneficiario inválido (revisa el dígito verificador).");
  if (!phone) errors.push("Teléfono inválido: usa un celular chileno, ej. +56 9 1234 5678.");
  if (!email) errors.push("Correo del beneficiario inválido.");
  if (reason.length < 2 || reason.length > 200) errors.push("Ingresa el motivo o referencia.");

  const modality = text(input?.modality).toUpperCase() || MODALITIES.FREE;
  let thirdParty = null;
  if (!MODALITIES[modality]) errors.push("Modalidad de autorización inválida.");
  if (modality === MODALITIES.THIRD_PARTY) {
    const tpName = text(input?.thirdPartyName);
    const tpRut = normalizeRut(input?.thirdPartyRut);
    const tpEmail = normalizeEmail(input?.thirdPartyEmail);
    const amount = Number(String(input?.thirdPartyAmount ?? "").replace(",", "."));
    const currency = text(input?.thirdPartyCurrency).toUpperCase();
    if (tpName.length < 2 || tpName.length > 120 || !tpRut || !tpEmail) errors.push("Completa razón social, RUT y correo de facturación válidos del tercero.");
    if (!(amount > 0) || amount > 1e9) errors.push("Indica el valor a facturar al tercero (mayor que 0).");
    if (!["UF", "CLP"].includes(currency)) errors.push("Moneda del valor a facturar inválida.");
    thirdParty = { name: tpName, rut: tpRut, email: tpEmail, amount: Math.round(amount * 100) / 100, currency };
  }

  const usageMode = text(input?.usageMode).toUpperCase() || USAGE_MODES.MULTIPLE;
  let maxUses = null;
  if (!USAGE_MODES[usageMode]) errors.push("Uso de la autorización inválido.");
  if (usageMode === USAGE_MODES.SINGLE) maxUses = 1;
  if (usageMode === USAGE_MODES.MAX) {
    maxUses = Number(input?.maxUses);
    if (!Number.isInteger(maxUses) || maxUses < 2 || maxUses > 100000) errors.push("El máximo de usos debe ser un entero de 2 o más.");
  }
  if (current && maxUses !== null && maxUses < current.usesCount) errors.push(`El máximo de usos no puede ser menor que los usos ya registrados (${current.usesCount}).`);

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    row: {
      license_plate: plate,
      valid_from: new Date(fromMs).toISOString(),
      valid_to: new Date(toMs).toISOString(),
      duration_quantity: hasDuration ? quantity : null,
      duration_unit: hasDuration ? unit : null,
      beneficiary_name: name,
      beneficiary_rut: rut,
      beneficiary_phone: phone,
      beneficiary_email: email,
      reason,
      modality,
      third_party_name: thirdParty?.name ?? null,
      third_party_rut: thirdParty?.rut ?? null,
      third_party_email: thirdParty?.email ?? null,
      third_party_amount: thirdParty?.amount ?? null,
      third_party_currency: thirdParty?.currency ?? null,
      usage_mode: usageMode,
      max_uses: maxUses,
    },
  };
}

// --- Lectura ----------------------------------------------------------------

export function releasedPlateFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.company_id,
    licensePlate: row.license_plate,
    displayPlate: displayReleasedPlate(row.license_plate),
    validFrom: row.valid_from,
    validTo: row.valid_to,
    durationQuantity: row.duration_quantity ?? null,
    durationUnit: row.duration_unit ?? null,
    weekdaysOnly: row.weekdays_only === true,
    beneficiaryName: row.beneficiary_name,
    beneficiaryRut: row.beneficiary_rut,
    beneficiaryPhone: row.beneficiary_phone,
    beneficiaryEmail: row.beneficiary_email,
    reason: row.reason,
    modality: row.modality,
    thirdParty: row.modality === MODALITIES.THIRD_PARTY
      ? { name: row.third_party_name, rut: row.third_party_rut, email: row.third_party_email, amount: Number(row.third_party_amount), currency: row.third_party_currency }
      : null,
    usageMode: row.usage_mode,
    maxUses: row.max_uses ?? null,
    usesCount: Number(row.uses_count || 0),
    status: row.status,
    finishedAt: row.finished_at,
    deletedAt: row.deleted_at,
    createdByEmail: row.created_by_email || "",
    createdAt: row.created_at,
    updatedByEmail: row.updated_by_email || "",
    updatedAt: row.updated_at,
  };
}

export function releasedPlateStatus(authorization, now = Date.now()) {
  const at = new Date(now).getTime();
  if (authorization.status === "DELETED") return PLATE_STATUS.DELETED;
  if (authorization.status === "FINISHED") return PLATE_STATUS.FINISHED;
  if (authorization.maxUses !== null && authorization.usesCount >= authorization.maxUses) return PLATE_STATUS.EXHAUSTED;
  if (at < new Date(authorization.validFrom).getTime()) return PLATE_STATUS.SCHEDULED;
  if (at >= new Date(authorization.validTo).getTime()) return PLATE_STATUS.EXPIRED;
  return PLATE_STATUS.CURRENT;
}

// --- Ticket ---------------------------------------------------------------

const TICKET_LABEL = /^[A-Z0-9ÁÉÍÓÚÑ ]{1,24}$/;

// Rótulo del ticket (lo imprime el APK publicado: máx. 24 caracteres, solo
// letras, dígitos y espacios). Ej.: «LIBERADO POR 3 HORAS».
export function releasedTicketLabel(authorization) {
  const meta = DURATION_UNITS[authorization?.durationUnit];
  const n = authorization?.durationQuantity;
  if (!meta || !n) return "PAGO LIBERADO";
  const unitText = Number(n) === 1 ? meta.short : meta.shortPlural;
  const candidates = authorization.durationUnit === "WEEK_WEEKDAYS"
    ? [`LIBERADO POR ${n} ${unitText} LUN A VIE`, `LIBERADO ${n} ${unitText} LUN A VIE`, `LIBERADO ${n} SEM LUN A VIE`, `LIBERADO ${n} SEM HABILES`]
    : [`LIBERADO POR ${n} ${unitText}`, `LIBERADO ${n} ${unitText}`];
  return candidates.find((item) => TICKET_LABEL.test(item)) || "PAGO LIBERADO";
}

// Detalle del ticket: «Entre 28-10-2026 21:38 y 29-10-2026 00:38».
export function releasedTicketDetail(authorization, timeZone = PLATE_TIME_ZONE) {
  return `Entre ${formatLocalDateTime(authorization.validFrom, timeZone)} y ${formatLocalDateTime(authorization.validTo, timeZone)}`;
}

// --- Ingreso con beneficio (POS) ---------------------------------------------

export const PLATE_ENTRY_DECISION = Object.freeze({
  NOT_AUTHORIZED: "NOT_AUTHORIZED",
  MODULE_UNAVAILABLE: "MODULE_UNAVAILABLE",
  NOT_CURRENT: "NOT_CURRENT",
  WEEKEND: "WEEKEND",
  NO_USES: "NO_USES",
  ELIGIBLE: "ELIGIBLE",
});

// Lunes a viernes completos (00:00–12:00 y 12:00–00:00 del día siguiente),
// en el formato de franjas de releasedStayCore.
const WEEKDAY_SCHEDULE = Object.freeze([
  { days: [1, 2, 3, 4, 5], start: "00:00", end: "12:00" },
  { days: [1, 2, 3, 4, 5], start: "12:00", end: "00:00" },
]);

// Condiciones congeladas al ingreso; misma forma que lee releasedStayCoverage
// (la salida cobra solo el tiempo no cubierto).
export function buildReleasedPlateSnapshot(authorization, { now = Date.now(), timeZone = PLATE_TIME_ZONE } = {}) {
  return {
    version: 5,
    model: "CLIENT",
    capturedAt: new Date(now).toISOString(),
    timeZone,
    contract: null,
    authorizations: [{
      id: authorization.id,
      kind: authorization.weekdaysOnly ? "RECURRING" : "CONTINUOUS",
      validFrom: authorization.validFrom,
      validTo: authorization.validTo,
      schedule: authorization.weekdaysOnly ? WEEKDAY_SCHEDULE.map((item) => ({ ...item, days: [...item.days] })) : [],
    }],
    ticket: { label: releasedTicketLabel(authorization), detail: releasedTicketDetail(authorization, timeZone) },
    modality: authorization.modality,
    thirdPartyName: authorization.thirdParty?.name || null,
    usage: { mode: authorization.usageMode, maxUses: authorization.maxUses, useNumber: authorization.usesCount + 1 },
  };
}

/**
 * Decide si un ingreso se registra con Pago liberado (modelo cliente).
 * `authorizations`: autorizaciones ACTIVAS de la patente en la empresa.
 * `enabled`: módulo activado en este estacionamiento.
 */
export function evaluateReleasedPlateEntry({ enabled, authorizations = [], now = Date.now(), timeZone = PLATE_TIME_ZONE }) {
  const active = authorizations.filter((item) => item.status === "ACTIVE");
  if (!active.length) return { decision: PLATE_ENTRY_DECISION.NOT_AUTHORIZED };
  if (!enabled) return { decision: PLATE_ENTRY_DECISION.MODULE_UNAVAILABLE, message: "Pago liberado está desactivado en este estacionamiento: la patente ingresa con cobro normal." };
  const at = new Date(now).getTime();
  const current = active.filter((item) => at >= new Date(item.validFrom).getTime() && at < new Date(item.validTo).getTime());
  if (!current.length) return { decision: PLATE_ENTRY_DECISION.NOT_CURRENT, message: "La autorización de esta patente no está vigente ahora: ingresa con cobro normal." };
  const withUses = current.filter((item) => item.maxUses === null || item.usesCount < item.maxUses);
  if (!withUses.length) return { decision: PLATE_ENTRY_DECISION.NO_USES, message: "La autorización agotó sus usos: la patente ingresa con cobro normal." };
  const weekday = localParts(at, timeZone).weekday;
  const usable = withUses.filter((item) => !item.weekdaysOnly || weekday <= 5);
  if (!usable.length) return { decision: PLATE_ENTRY_DECISION.WEEKEND, message: "Autorización válida solo de lunes a viernes: hoy ingresa con cobro normal." };
  const authorization = [...usable].sort((a, b) => new Date(b.validTo).getTime() - new Date(a.validTo).getTime())[0];
  return {
    decision: PLATE_ENTRY_DECISION.ELIGIBLE,
    authorization,
    snapshot: buildReleasedPlateSnapshot(authorization, { now: at, timeZone }),
  };
}

// --- Importación desde Excel ---------------------------------------------------

export const IMPORT_COLUMNS = Object.freeze([
  "Patente", "Inicio (dd-mm-aaaa hh:mm)", "Termino (dd-mm-aaaa hh:mm)", "Nombre", "RUT", "Telefono", "Correo",
  "Motivo / referencia", "Uso (multiple/unica/maximo)", "Maximo de usos",
]);

// "28-10-2026 08:00" (hora local) -> "2026-10-28T08:00"; acepta también ISO.
export function importDateToLocal(value) {
  const raw = text(value);
  const match = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (match) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${match[3]}-${pad(match[2])}-${pad(match[1])}T${pad(match[4] || 0)}:${match[5] || "00"}`;
  }
  return raw;
}

// Filas de la planilla (sin encabezado) -> entradas del formulario. Las
// importadas quedan «Sin costo»; el cobro a un tercero se configura en cada
// registro.
export function importRowToInput(row) {
  const cells = Array.isArray(row) ? row : [];
  const usage = text(cells[8]).toLowerCase();
  return {
    plate: cells[0],
    validFrom: importDateToLocal(cells[1]),
    validTo: importDateToLocal(cells[2]),
    beneficiaryName: cells[3],
    beneficiaryRut: cells[4],
    beneficiaryPhone: cells[5],
    beneficiaryEmail: cells[6],
    reason: cells[7],
    usageMode: usage === "unica" || usage === "única" ? USAGE_MODES.SINGLE : usage === "maximo" || usage === "máximo" ? USAGE_MODES.MAX : USAGE_MODES.MULTIPLE,
    maxUses: cells[9],
    modality: MODALITIES.FREE,
  };
}
