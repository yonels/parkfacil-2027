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
//
// Selector Off Street (SOL-2026-10-10-001): cuando el llamador entrega
// `offStreetParkings` (todos los estacionamientos Off Street de la empresa
// del operador; solo lo hace el POS, ver resolvePosOperationalParking), la
// asignación operador -> estacionamiento deja de limitar la selección Off
// Street y las reglas 2-5 se reemplazan por:
//
//   1. Turno OPEN/CLOSING -> su estacionamiento (igual que arriba; ahora
//      también vale un Off Street de la empresa no asignado).
//   2. Un solo Off Street activo en la empresa (y ningún turno On Street
//      programado hoy) -> ese, ingreso directo.
//   3. Varios Off Street activos -> SELECTION_REQUIRED con `offStreetOptions`
//      (el pulldown). Un turno programado o cerrado hoy ya NO fija el
//      estacionamiento.
//
// On Street no cambia: sin `offStreetParkings`, sin Off Street activo en la
// empresa, o con un operador asignado exclusivamente a On Street, se aplican
// las reglas 1-6 originales tal cual. Los turnos On Street programados hoy
// de un operador mixto se siguen ofreciendo como `options`.

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
function resolveAssignedPosParking({ authorizedParkings, openShift = null, programmedShifts = [], closedShifts = [] } = {}) {
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

function toParkingOption(parking) {
  return {
    parkingId: String(parking.id),
    parkingName: parking.name || "",
    parkingCode: parking.code || "",
    parkingAddress: parking.address || "",
  };
}

function compareParkingName(a, b) {
  return String(a?.name || "").localeCompare(String(b?.name || ""), "es") || String(a?.code || "").localeCompare(String(b?.code || ""));
}

// offStreetParkings: null/undefined -> reglas originales por asignación
// (cualquier llamador que no sea el POS, y On Street). Arreglo -> flujo del
// selector Off Street descrito en la cabecera.
export function resolvePosParking({ authorizedParkings, openShift = null, programmedShifts = [], closedShifts = [], offStreetParkings = null } = {}) {
  const legacy = () => ({ ...resolveAssignedPosParking({ authorizedParkings, openShift, programmedShifts, closedShifts }), offStreetOptions: [] });
  if (!Array.isArray(offStreetParkings)) return legacy();

  const assigned = byId(authorizedParkings);
  const offStreet = byId(offStreetParkings.filter((parking) => parking?.type === "OFF_STREET"));

  if (openShift) {
    const parking = assigned.get(String(openShift.parking_id)) || offStreet.get(String(openShift.parking_id));
    if (!parking) {
      return { status: POS_PARKING_RESOLUTION.SHIFT_PARKING_FORBIDDEN, parkingId: null, options: [], offStreetOptions: [] };
    }
    return { status: POS_PARKING_RESOLUTION.OPEN_SHIFT, parkingId: String(parking.id), options: [], offStreetOptions: [] };
  }

  const selectable = [...offStreet.values()].filter((parking) => parking.status === "ACTIVE").sort(compareParkingName);
  const assignedList = [...assigned.values()];
  const onStreetOnlyOperator = assignedList.length > 0 && assignedList.every((parking) => parking.type === "ON_STREET");
  if (!selectable.length || onStreetOnlyOperator) return legacy();

  const onStreetProgrammed = (Array.isArray(programmedShifts) ? programmedShifts : [])
    .filter((shift) => assigned.get(String(shift?.parking_id))?.type === "ON_STREET")
    .sort(compareScheduledStart);

  if (!onStreetProgrammed.length && selectable.length === 1) {
    return { status: POS_PARKING_RESOLUTION.SINGLE_AUTHORIZED, parkingId: String(selectable[0].id), options: [], offStreetOptions: [] };
  }
  return {
    status: POS_PARKING_RESOLUTION.SELECTION_REQUIRED,
    parkingId: null,
    options: onStreetProgrammed.map((shift) => toOption(shift, assigned.get(String(shift.parking_id)))),
    offStreetOptions: selectable.map(toParkingOption),
  };
}

// Selector Off Street: el parkingId elegido en el pulldown solo se acepta si
// está entre las opciones que el servidor calculó para ESTA sesión.
export function findSelectableOffStreetParking(resolution, parkingId) {
  if (!resolution || resolution.status !== POS_PARKING_RESOLUTION.SELECTION_REQUIRED) return null;
  const wanted = String(parkingId || "").trim();
  if (!wanted) return null;
  return (resolution.offStreetOptions || []).find((option) => option.parkingId === wanted) || null;
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
