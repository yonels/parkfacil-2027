// Reportes de Pago liberado / Patentes Autorizadas (SOL-2026-10-28-005).
// Puro: arma el resultado estándar del motor a partir de autorizaciones ya
// cargadas y autorizadas (la carga y el aislamiento por empresa los hace el
// servidor). Montos cobrados a terceros: se informan por moneda, nunca se
// suman UF con pesos; son importes del cliente, no de ParkFacil.

import { describeDuration, PLATE_STATUS, PLATE_STATUS_LABELS, releasedPlateStatus } from "../../releasedPlates/releasedPlateCore.mjs";
import { overlapsPeriod } from "../engine/periodCore.mjs";

const USAGE_LABELS = { MULTIPLE: "Entradas múltiples", SINGLE: "Una sola entrada", MAX: "Máximo de usos" };
const MODALITY_LABELS = { FREE: "Sin costo", THIRD_PARTY: "Cobro a tercero" };
const STATUS_ORDER = [PLATE_STATUS.CURRENT, PLATE_STATUS.SCHEDULED, PLATE_STATUS.EXPIRED, PLATE_STATUS.EXHAUSTED, PLATE_STATUS.FINISHED, PLATE_STATUS.DELETED];

export const PLATE_REPORT_COLUMNS = Object.freeze([
  { key: "plate", label: "Patente", width: 12 },
  { key: "status", label: "Estado", width: 16 },
  { key: "beneficiaryName", label: "Beneficiario", width: 26 },
  { key: "beneficiaryRut", label: "RUT", width: 14 },
  { key: "beneficiaryPhone", label: "Teléfono", width: 18 },
  { key: "beneficiaryEmail", label: "Correo", width: 28 },
  { key: "reason", label: "Motivo / referencia", width: 28 },
  { key: "modality", label: "Modalidad", width: 16 },
  { key: "thirdPartyName", label: "Tercero", width: 26 },
  { key: "thirdPartyAmountUf", label: "Valor neto UF", format: "uf", width: 14 },
  { key: "thirdPartyAmountClp", label: "Valor neto $", format: "clp", width: 14 },
  { key: "validFrom", label: "Inicio", format: "datetime", width: 18 },
  { key: "validTo", label: "Término", format: "datetime", width: 18 },
  { key: "duration", label: "Duración", width: 22 },
  { key: "usage", label: "Uso", width: 20 },
  { key: "usesCount", label: "Entradas", format: "int", width: 10 },
  { key: "maxUses", label: "Máximo", format: "int", width: 10 },
  { key: "createdByEmail", label: "Creada por", width: 28 },
  { key: "createdAt", label: "Creada", format: "datetime", width: 18 },
]);

export function plateReportRow(authorization, now) {
  const status = releasedPlateStatus(authorization, now);
  const tp = authorization.thirdParty;
  return {
    id: authorization.id,
    plate: authorization.displayPlate,
    statusCode: status,
    status: PLATE_STATUS_LABELS[status],
    beneficiaryName: authorization.beneficiaryName,
    beneficiaryRut: authorization.beneficiaryRut,
    beneficiaryPhone: authorization.beneficiaryPhone,
    beneficiaryEmail: authorization.beneficiaryEmail,
    reason: authorization.reason,
    modalityCode: authorization.modality,
    modality: MODALITY_LABELS[authorization.modality] || authorization.modality,
    thirdPartyName: tp?.name || "",
    thirdPartyAmountUf: tp?.currency === "UF" ? tp.amount : null,
    thirdPartyAmountClp: tp?.currency === "CLP" ? tp.amount : null,
    validFrom: authorization.validFrom,
    validTo: authorization.validTo,
    duration: authorization.durationUnit ? describeDuration(authorization.durationQuantity, authorization.durationUnit) : "Término a mano",
    usage: USAGE_LABELS[authorization.usageMode] || authorization.usageMode,
    usesCount: authorization.usesCount,
    maxUses: authorization.maxUses,
    createdByEmail: authorization.createdByEmail,
    createdAt: authorization.createdAt,
  };
}

// Alcances de los listados (misma fila y columnas, distinta selección):
// - all / free / thirdParty: vigencia que se cruza con el período.
// - current / scheduled / expiring: estado a la fecha de emisión (el período no aplica).
// - expired: término dentro del período (vencidas o con usos agotados).
// - closed: finalizadas o eliminadas con la acción dentro del período.
export const LIST_SCOPES = Object.freeze({
  all: { usesPeriod: "validity" },
  free: { usesPeriod: "validity", predicate: (row) => row.modalityCode === "FREE" },
  thirdParty: { usesPeriod: "validity", predicate: (row) => row.modalityCode === "THIRD_PARTY" },
  current: { usesPeriod: "none", predicate: (row) => row.statusCode === PLATE_STATUS.CURRENT },
  scheduled: { usesPeriod: "none", predicate: (row) => row.statusCode === PLATE_STATUS.SCHEDULED },
  expiring: { usesPeriod: "none", predicate: (row) => row.statusCode === PLATE_STATUS.CURRENT },
  expired: { usesPeriod: "validTo", predicate: (row) => [PLATE_STATUS.EXPIRED, PLATE_STATUS.EXHAUSTED].includes(row.statusCode) },
  closed: { usesPeriod: "closedAt", predicate: (row) => [PLATE_STATUS.FINISHED, PLATE_STATUS.DELETED].includes(row.statusCode) },
});

const inPeriod = (value, period) => {
  if (!value) return false;
  const ms = new Date(value).getTime();
  return ms >= new Date(period.fromIso).getTime() && ms < new Date(period.toIso).getTime();
};
const HOUR = 3600000;
export const EXPIRING_WINDOWS = Object.freeze([7, 15, 30]);

/**
 * Listados de patentes. Filtros: plate (contiene), status (código), window
 * (días, solo «Próximos vencimientos»).
 */
export function buildPlateListReport({ authorizations, period, filters = {}, now = Date.now(), scope = "all" }) {
  const config = LIST_SCOPES[scope] || LIST_SCOPES.all;
  const plateQuery = String(filters.plate || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const status = String(filters.status || "");
  const windowDays = EXPIRING_WINDOWS.includes(Number(filters.window)) ? Number(filters.window) : 7;
  const nowMs = new Date(now).getTime();
  let rows = authorizations
    .filter((a) => {
      if (config.usesPeriod === "validity") return overlapsPeriod(a.validFrom, a.validTo, period);
      if (config.usesPeriod === "validTo") return inPeriod(a.validTo, period);
      if (config.usesPeriod === "closedAt") return inPeriod(a.deletedAt || a.finishedAt, period);
      return true;
    })
    .map((a) => ({
      ...plateReportRow(a, now),
      closedAt: a.deletedAt || a.finishedAt || null,
      closedBy: a.status === "ACTIVE" ? "" : a.updatedByEmail || "",
      hoursLeft: Math.max(0, Math.round((new Date(a.validTo).getTime() - nowMs) / HOUR)),
      hoursToStart: Math.max(0, Math.round((new Date(a.validFrom).getTime() - nowMs) / HOUR)),
    }))
    .filter((row) => (config.predicate ? config.predicate(row) : true))
    .filter((row) => (status ? row.statusCode === status : scope === "closed" || row.statusCode !== PLATE_STATUS.DELETED))
    .filter((row) => !plateQuery || row.plate.replace(/[^A-Z0-9]/g, "").includes(plateQuery));
  if (scope === "expiring") rows = rows.filter((row) => new Date(row.validTo).getTime() - nowMs <= windowDays * 24 * HOUR);
  const sortKey = { expiring: "validTo", scheduled: "validFrom", closed: "closedAt", expired: "validTo" }[scope];
  rows.sort((a, b) => (sortKey === "validTo" && scope === "expiring") || sortKey === "validFrom"
    ? new Date(a[sortKey]).getTime() - new Date(b[sortKey]).getTime()
    : new Date(b[sortKey || "validFrom"]).getTime() - new Date(a[sortKey || "validFrom"]).getTime());

  const count = (predicate) => rows.filter(predicate).length;
  const sum = (key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  const thirdParty = rows.filter((row) => row.modalityCode === "THIRD_PARTY");
  const kpis = [
    { key: "total", label: scope === "expiring" ? `Vencen en ${windowDays} días` : "Patentes", value: rows.length, format: "int" },
    { key: "current", label: "Vigentes", value: count((row) => row.statusCode === PLATE_STATUS.CURRENT), format: "int" },
    { key: "scheduled", label: "Programadas", value: count((row) => row.statusCode === PLATE_STATUS.SCHEDULED), format: "int" },
    { key: "closed", label: "Vencidas, finalizadas o con usos agotados", value: count((row) => [PLATE_STATUS.EXPIRED, PLATE_STATUS.FINISHED, PLATE_STATUS.EXHAUSTED].includes(row.statusCode)), format: "int" },
    { key: "free", label: "Sin costo", value: count((row) => row.modalityCode === "FREE"), format: "int" },
    { key: "thirdParty", label: "Cobradas a terceros", value: thirdParty.length, format: "int" },
    { key: "thirdPartyUf", label: "Valor neto a terceros (UF)", value: sum("thirdPartyAmountUf"), format: "uf", note: "Importe del cliente a sus terceros, más IVA. No es un cobro de ParkFacil." },
    { key: "thirdPartyClp", label: "Valor neto a terceros ($)", value: sum("thirdPartyAmountClp"), format: "clp", note: "Importe del cliente a sus terceros, más IVA. No se suma con UF." },
    { key: "entries", label: "Entradas registradas", value: sum("usesCount"), format: "int" },
  ];
  const byStatus = STATUS_ORDER.map((code) => ({ label: PLATE_STATUS_LABELS[code], value: count((row) => row.statusCode === code) })).filter((point) => point.value > 0);
  const byModality = [{ label: "Sin costo", value: count((row) => row.modalityCode === "FREE") }, { label: "Cobro a tercero", value: thirdParty.length }];
  const extraColumns = {
    expiring: [{ key: "hoursLeft", label: "Horas restantes", format: "int", width: 14 }],
    current: [{ key: "hoursLeft", label: "Horas restantes", format: "int", width: 14 }],
    scheduled: [{ key: "hoursToStart", label: "Comienza en (horas)", format: "int", width: 16 }],
    closed: [{ key: "closedAt", label: "Fecha de cierre", format: "datetime", width: 18 }, { key: "closedBy", label: "Cerrada por", width: 28 }],
  }[scope] || [];
  return {
    kpis,
    charts: [
      { key: "status", title: "Patentes por estado", type: "bar", format: "int", data: byStatus },
      { key: "modality", title: "Patentes por modalidad", type: "bar", format: "int", data: byModality },
    ],
    columns: [...PLATE_REPORT_COLUMNS.slice(0, 2), ...extraColumns, ...PLATE_REPORT_COLUMNS.slice(2)],
    rows,
    totals: { thirdPartyAmountUf: sum("thirdPartyAmountUf"), thirdPartyAmountClp: sum("thirdPartyAmountClp"), usesCount: sum("usesCount") },
    notCalculable: [],
  };
}

// --- Por empresa u organización -------------------------------------------
// Agrupa por tercero pagador (organización); las autorizaciones sin costo se
// agrupan como «Sin costo (beneficiario directo)». Vigencia que se cruza con
// el período; montos separados por moneda.
export function buildOrganizationReport({ authorizations, period, now = Date.now() }) {
  const groups = new Map();
  for (const a of authorizations) {
    if (a.status === "DELETED" || !overlapsPeriod(a.validFrom, a.validTo, period)) continue;
    const row = plateReportRow(a, now);
    const key = a.thirdParty ? `${a.thirdParty.rut}|${a.thirdParty.name}` : "FREE";
    const group = groups.get(key) || {
      id: key, organization: a.thirdParty ? a.thirdParty.name : "Sin costo (beneficiario directo)", rut: a.thirdParty?.rut || "",
      email: a.thirdParty?.email || "", modality: a.thirdParty ? "Cobro a tercero" : "Sin costo", plates: 0, current: 0, entries: 0, amountUf: 0, amountClp: 0,
    };
    group.plates += 1;
    if (row.statusCode === PLATE_STATUS.CURRENT) group.current += 1;
    group.entries += a.usesCount;
    group.amountUf += row.thirdPartyAmountUf || 0;
    group.amountClp += row.thirdPartyAmountClp || 0;
    groups.set(key, group);
  }
  const rows = [...groups.values()].sort((a, b) => b.plates - a.plates);
  const sum = (key) => rows.reduce((total, row) => total + row[key], 0);
  return {
    kpis: [
      { key: "organizations", label: "Organizaciones que pagan", value: rows.filter((row) => row.id !== "FREE").length, format: "int" },
      { key: "plates", label: "Patentes", value: sum("plates"), format: "int" },
      { key: "current", label: "Vigentes hoy", value: sum("current"), format: "int" },
      { key: "entries", label: "Entradas registradas", value: sum("entries"), format: "int" },
      { key: "amountUf", label: "Valor neto a terceros (UF)", value: sum("amountUf"), format: "uf", note: "Importe del cliente a sus terceros, más IVA." },
      { key: "amountClp", label: "Valor neto a terceros ($)", value: sum("amountClp"), format: "clp", note: "No se suma con UF." },
    ],
    charts: [{ key: "plates", title: "Patentes por organización", type: "bar", format: "int", data: rows.slice(0, 15).map((row) => ({ label: row.organization, value: row.plates })) }],
    columns: [
      { key: "organization", label: "Organización", width: 30 }, { key: "rut", label: "RUT", width: 14 }, { key: "email", label: "Correo de facturación", width: 28 },
      { key: "modality", label: "Modalidad", width: 16 }, { key: "plates", label: "Patentes", format: "int", width: 10 }, { key: "current", label: "Vigentes", format: "int", width: 10 },
      { key: "entries", label: "Entradas", format: "int", width: 10 }, { key: "amountUf", label: "Valor neto UF", format: "uf", width: 14 }, { key: "amountClp", label: "Valor neto $", format: "clp", width: 14 },
    ],
    rows,
    totals: { plates: sum("plates"), current: sum("current"), entries: sum("entries"), amountUf: sum("amountUf"), amountClp: sum("amountClp") },
    notCalculable: [],
  };
}

// --- Historial por patente --------------------------------------------------
const EVENT_LABELS = { CREATED: "Creada", IMPORTED: "Importada desde Excel", UPDATED: "Editada", FINISHED: "Finalizada", DELETED: "Eliminada", RESTORED: "Restaurada", USED: "Entrada" };

// Eventos de las autorizaciones dentro del período (inmutables). `events`:
// { authorizationId, type, at, actorEmail, parkingName, useNumber, stayCode }.
export function buildHistoryReport({ authorizations, events, filters = {} }) {
  const byId = new Map(authorizations.map((a) => [a.id, a]));
  const plateQuery = String(filters.plate || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const rows = events
    .map((event) => {
      const a = byId.get(event.authorizationId);
      return {
        id: `${event.authorizationId}-${event.at}-${event.type}`,
        at: event.at,
        plate: a?.displayPlate || "",
        beneficiaryName: a?.beneficiaryName || "",
        event: EVENT_LABELS[event.type] || event.type,
        eventCode: event.type,
        parkingName: event.parkingName || "",
        detail: event.type === "USED" ? `Uso ${event.useNumber}${a?.maxUses ? ` de ${a.maxUses}` : ""}${event.stayCode ? ` · ticket ${event.stayCode}` : ""}` : "",
        actorEmail: event.actorEmail || "",
      };
    })
    .filter((row) => row.plate && (!plateQuery || row.plate.replace(/[^A-Z0-9]/g, "").includes(plateQuery)))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const count = (code) => rows.filter((row) => row.eventCode === code).length;
  return {
    kpis: [
      { key: "events", label: "Eventos", value: rows.length, format: "int" },
      { key: "plates", label: "Patentes con movimientos", value: new Set(rows.map((row) => row.plate)).size, format: "int" },
      { key: "created", label: "Creadas o importadas", value: count("CREATED") + count("IMPORTED"), format: "int" },
      { key: "updated", label: "Editadas", value: count("UPDATED"), format: "int" },
      { key: "used", label: "Entradas", value: count("USED"), format: "int" },
      { key: "closed", label: "Finalizadas o eliminadas", value: count("FINISHED") + count("DELETED"), format: "int" },
    ],
    charts: [{ key: "events", title: "Eventos por tipo", type: "bar", format: "int", data: Object.keys(EVENT_LABELS).map((code) => ({ label: EVENT_LABELS[code], value: count(code) })).filter((point) => point.value > 0) }],
    columns: [
      { key: "at", label: "Fecha y hora", format: "datetime", width: 18 }, { key: "plate", label: "Patente", width: 12 }, { key: "beneficiaryName", label: "Beneficiario", width: 24 },
      { key: "event", label: "Evento", width: 20 }, { key: "parkingName", label: "Estacionamiento", width: 24 }, { key: "detail", label: "Detalle", width: 30 }, { key: "actorEmail", label: "Usuario", width: 28 },
    ],
    rows,
    totals: {},
    notCalculable: [],
  };
}

// --- Uso del beneficio --------------------------------------------------------
// Estadías ingresadas con Pago liberado (modelo cliente) dentro del período:
// minutos cubiertos y cobrados, y excedente pagado. Las estadías abiertas no
// tienen minutos cubiertos/cobrados definitivos: se informan como «No calculable».
export function buildUsageReport({ stays, authorizations, parkingsById = new Map() }) {
  const byId = new Map(authorizations.map((a) => [a.id, a]));
  const rows = stays.map((stay) => {
    const a = byId.get(stay.released_plate_authorization_id);
    const open = stay.status === "OPEN";
    const covered = stay.released_covered_seconds;
    const chargeable = stay.released_chargeable_seconds;
    return {
      id: stay.id,
      code: stay.code,
      plate: a?.displayPlate || stay.license_plate,
      beneficiaryName: a?.beneficiaryName || "",
      modality: a ? MODALITY_LABELS[a.modality] : "",
      thirdPartyName: a?.thirdParty?.name || "",
      parkingName: parkingsById.get(stay.parking_id) || "",
      entryAt: stay.entry_at,
      exitAt: stay.exit_at,
      status: open ? "Dentro" : stay.status === "CANCELLED" ? "Anulada" : "Salió",
      coveredMinutes: open || covered === null || covered === undefined ? null : Math.floor(covered / 60),
      chargedMinutes: open || chargeable === null || chargeable === undefined ? null : Math.floor(chargeable / 60),
      excessAmount: open ? null : Number(stay.total_amount || 0),
    };
  }).sort((a, b) => new Date(b.entryAt).getTime() - new Date(a.entryAt).getTime());
  const closed = rows.filter((row) => row.status === "Salió");
  const sum = (list, key) => list.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  const byParking = new Map();
  const byDay = new Map();
  // Un solo formateador: crearlo por fila es costoso con miles de estadías.
  const dayFormat = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "2-digit" });
  for (const row of rows) {
    byParking.set(row.parkingName || "—", (byParking.get(row.parkingName || "—") || 0) + 1);
    const day = dayFormat.format(new Date(row.entryAt));
    byDay.set(day, (byDay.get(day) || 0) + 1);
  }
  const openCount = rows.filter((row) => row.status === "Dentro").length;
  return {
    kpis: [
      { key: "entries", label: "Entradas con beneficio", value: rows.length, format: "int" },
      { key: "plates", label: "Patentes distintas", value: new Set(rows.map((row) => row.plate)).size, format: "int" },
      { key: "inside", label: "Dentro ahora", value: openCount, format: "int" },
      { key: "covered", label: "Minutos cubiertos", value: sum(closed, "coveredMinutes"), format: "int", note: "Solo estadías con salida." },
      { key: "charged", label: "Minutos cobrados (excedente)", value: sum(closed, "chargedMinutes"), format: "int" },
      { key: "excess", label: "Recaudado por excedente", value: sum(closed, "excessAmount"), format: "clp", note: "Cobrado al conductor con la tarifa del estacionamiento." },
    ],
    charts: [
      { key: "parking", title: "Entradas por estacionamiento", type: "bar", format: "int", data: [...byParking].map(([label, value]) => ({ label, value })) },
      { key: "day", title: "Entradas por día", type: "bar", format: "int", data: [...byDay].reverse().map(([label, value]) => ({ label, value })) },
    ],
    columns: [
      { key: "code", label: "Ticket", width: 16 }, { key: "plate", label: "Patente", width: 12 }, { key: "beneficiaryName", label: "Beneficiario", width: 24 },
      { key: "modality", label: "Modalidad", width: 16 }, { key: "thirdPartyName", label: "Tercero", width: 24 }, { key: "parkingName", label: "Estacionamiento", width: 24 },
      { key: "entryAt", label: "Ingreso", format: "datetime", width: 18 }, { key: "exitAt", label: "Salida", format: "datetime", width: 18 }, { key: "status", label: "Estado", width: 10 },
      { key: "coveredMinutes", label: "Minutos cubiertos", format: "int", width: 12 }, { key: "chargedMinutes", label: "Minutos cobrados", format: "int", width: 12 }, { key: "excessAmount", label: "Excedente $", format: "clp", width: 14 },
    ],
    rows,
    totals: { coveredMinutes: sum(closed, "coveredMinutes"), chargedMinutes: sum(closed, "chargedMinutes"), excessAmount: sum(closed, "excessAmount") },
    notCalculable: openCount ? [`${openCount} estadía(s) siguen dentro: sus minutos y excedente se calculan a la salida.`] : [],
  };
}
