// POS Entry/Exit — Fase 1: resolución del estacionamiento que opera una
// sesión POS. Reglas puras (sin Supabase/DOM) para que sean 100%
// unit-testeables, mismo criterio que el resto de módulos "*Core.mjs"/".mjs"
// del proyecto.
//
// Antes de esta fase, cada API POS tomaba assignedParkingIds[0]: el primer
// elemento de una consulta a company_member_parkings SIN orden. Con más de un
// estacionamiento asignado, dos requests de la misma sesión podían resolver
// estacionamientos distintos (p. ej. listar vehículos de A y registrar el
// ingreso en B). El esquema no tiene "parking principal/activo/por defecto"
// (company_member_parkings solo tiene user_id/parking_id/access_level), pero
// SÍ tiene una fuente de verdad server-side que el cliente no puede
// manipular: el turno del operador (operator_shifts.parking_id), con a lo
// sumo UN turno OPEN/CLOSING por operador (índice único
// operator_one_open_shift_idx). Por eso el orden de precedencia es:
//
//   1. Turno OPEN/CLOSING  -> su estacionamiento (si sigue autorizado; si
//      no, se DENIEGA -- nunca se cae a otro estacionamiento mientras haya
//      un turno abierto en otro lado).
//   2. Turnos PROGRAMMED de hoy -> si están todos en UN solo
//      estacionamiento autorizado, ese; si están en varios, el operador
//      debe elegir explícitamente cuál iniciar (SELECTION_REQUIRED).
//   3. Último turno CLOSED de hoy -> el estacionamiento donde el operador
//      acaba de trabajar (para ver/reimprimir su cierre).
//   4. Exactamente UN estacionamiento autorizado y activo -> ese.
//   5. Varios autorizados sin ningún turno que los desambigüe ->
//      SELECTION_REQUIRED (sin opciones: no hay nada que operar hasta que
//      exista un turno). Nunca se elige uno "por orden".
//   6. Ninguno -> UNASSIGNED.

export const POS_PARKING_RESOLUTION = Object.freeze({
  OPEN_SHIFT: "OPEN_SHIFT",
  PROGRAMMED_SHIFT: "PROGRAMMED_SHIFT",
  LAST_CLOSED_SHIFT: "LAST_CLOSED_SHIFT",
  SINGLE_AUTHORIZED: "SINGLE_AUTHORIZED",
  SELECTION_REQUIRED: "SELECTION_REQUIRED",
  UNASSIGNED: "UNASSIGNED",
  SHIFT_PARKING_FORBIDDEN: "SHIFT_PARKING_FORBIDDEN",
});

function byId(parkings) {
  const map = new Map();
  for (const parking of Array.isArray(parkings) ? parkings : []) {
    if (parking?.id) map.set(String(parking.id), parking);
  }
  return map;
}

function toOption(shift, parking) {
  return {
    shiftId: String(shift.id),
    parkingId: String(parking.id),
    parkingName: parking.name || "",
    parkingCode: parking.code || "",
    shiftDate: shift.shift_date || null,
    scheduledStart: shift.scheduled_start || null,
    scheduledEnd: shift.scheduled_end || null,
  };
}

function compareScheduledStart(a, b) {
  return String(a?.scheduled_start || "").localeCompare(String(b?.scheduled_start || ""));
}

// authorizedParkings: estacionamientos YA acotados server-side a la empresa
// de la sesión y a las asignaciones del operador (listParkings con
// parkingQueryScope). Los turnos son solo del operador autenticado.
export function resolvePosParking({ authorizedParkings, openShift = null, programmedShifts = [], closedShifts = [] } = {}) {
  const authorized = byId(authorizedParkings);

  if (openShift) {
    const parking = authorized.get(String(openShift.parking_id));
    if (!parking) {
      return { status: POS_PARKING_RESOLUTION.SHIFT_PARKING_FORBIDDEN, parkingId: null, options: [] };
    }
    return { status: POS_PARKING_RESOLUTION.OPEN_SHIFT, parkingId: String(parking.id), options: [] };
  }

  const programmed = (Array.isArray(programmedShifts) ? programmedShifts : [])
    .filter((shift) => authorized.has(String(shift?.parking_id)))
    .sort(compareScheduledStart);
  const programmedParkingIds = [...new Set(programmed.map((shift) => String(shift.parking_id)))];
  if (programmedParkingIds.length === 1) {
    return { status: POS_PARKING_RESOLUTION.PROGRAMMED_SHIFT, parkingId: programmedParkingIds[0], options: [] };
  }
  if (programmedParkingIds.length > 1) {
    return {
      status: POS_PARKING_RESOLUTION.SELECTION_REQUIRED,
      parkingId: null,
      options: programmed.map((shift) => toOption(shift, authorized.get(String(shift.parking_id)))),
    };
  }

  const lastClosed = (Array.isArray(closedShifts) ? closedShifts : [])
    .filter((shift) => authorized.has(String(shift?.parking_id)))
    .sort((a, b) => String(b?.closed_at || "").localeCompare(String(a?.closed_at || "")))[0];
  if (lastClosed) {
    return { status: POS_PARKING_RESOLUTION.LAST_CLOSED_SHIFT, parkingId: String(lastClosed.parking_id), options: [] };
  }

  const active = [...authorized.values()].filter((parking) => parking.status === "ACTIVE");
  if (active.length === 1) {
    return { status: POS_PARKING_RESOLUTION.SINGLE_AUTHORIZED, parkingId: String(active[0].id), options: [] };
  }
  if (active.length > 1) {
    return { status: POS_PARKING_RESOLUTION.SELECTION_REQUIRED, parkingId: null, options: [] };
  }
  return { status: POS_PARKING_RESOLUTION.UNASSIGNED, parkingId: null, options: [] };
}

// Selección explícita (Fase 1): el único modo de "elegir" estacionamiento
// es elegir cuál de los turnos PROGRAMMED de hoy iniciar. Se valida contra
// la lista calculada server-side -- un shiftId enviado por el cliente que no
// esté en esa lista (otro operador, otro día, otro estacionamiento no
// autorizado) se rechaza. El RPC start_operator_shift vuelve a verificar
// dueño/estado bajo bloqueo de fila.
export function findSelectableShift(resolution, shiftId) {
  if (!resolution || resolution.status !== POS_PARKING_RESOLUTION.SELECTION_REQUIRED) return null;
  const wanted = String(shiftId || "").trim();
  if (!wanted) return null;
  return resolution.options.find((option) => option.shiftId === wanted) || null;
}

// Una solicitud POS que declare explícitamente un estacionamiento solo es
// válida si coincide con el resuelto server-side (defensa contra
// manipulación de parámetros: nunca se usa el valor del cliente para
// elegir).
export function isRequestedParkingConsistent(resolvedParkingId, requestedParkingId) {
  if (!requestedParkingId) return true;
  return Boolean(resolvedParkingId) && String(requestedParkingId) === String(resolvedParkingId);
}
