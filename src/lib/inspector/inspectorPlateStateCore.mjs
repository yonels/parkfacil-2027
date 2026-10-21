// Núcleo puro de resolución de estado de patente (Etapa 2, §8): sin
// "server-only" ni imports "@/..." para poder testearlo en directo con
// node --test, inyectando filas ya obtenidas (no consulta nada por sí
// mismo -- eso es inspectorRepository.js). Decide cuál de los 4 estados
// aprobados corresponde, con una única prioridad determinista:
//
//   1) VIGENTE  -- existe una sesión ACTIVE (expires_at > ahora, ya
//      garantizado porque el repositorio expira sesiones vencidas antes de
//      consultar -- nunca se inventa una sesión antigua como activa).
//   2) VENCIDO  -- existe una sesión EXPIRED cuyo evento de sobretiempo
//      todavía no fue fiscalizado (sessionInspection ausente).
//   3) OBSERVADO -- no hay nada vigente/pendiente ahora mismo, pero la
//      patente tiene al menos un antecedente de fiscalización (en
//      cualquier sesión, no solo la actual) -- §14: "cuando esa patente
//      vuelva a ser consultada, el Inspector debe poder ver el
//      antecedente". Una sesión vigente real (1) siempre gana sobre un
//      antecedente pasado: OBSERVADO informa, no bloquea.
//   4) SIN_SESION -- ningún caso anterior.
export function resolveOnStreetPlateState({
  plate,
  activeSession = null,
  expiredSession = null,
  sessionInspection = null,
  latestInspection = null,
  recentInspections = [],
  location = null,
} = {}) {
  if (activeSession) {
    return {
      status: "VIGENTE",
      plate,
      vehicleType: null,
      location,
      startedAt: activeSession.started_at,
      expiresAt: activeSession.expires_at,
      purchasedMinutes: activeSession.purchased_minutes,
      amountPaid: activeSession.amount_paid,
      sessionId: activeSession.id,
    };
  }
  if (expiredSession && !sessionInspection) {
    return {
      status: "VENCIDO",
      plate,
      location,
      startedAt: expiredSession.started_at,
      expiresAt: expiredSession.expires_at,
      purchasedMinutes: expiredSession.purchased_minutes,
      amountPaid: expiredSession.amount_paid,
      sessionId: expiredSession.id,
    };
  }
  if (latestInspection) {
    return {
      status: "OBSERVADO",
      plate,
      motivo: inspectionMotivoLabel(latestInspection),
      location,
      ultimoEvento: { tipo: "Fiscalización registrada", at: latestInspection.inspected_at },
      historial: recentInspections.map((row) => ({ tipo: "Fiscalización registrada", detalle: inspectionMotivoLabel(row), at: row.inspected_at })),
    };
  }
  return { status: "SIN_SESION", plate };
}

const MOTIVO_LABEL = Object.freeze({
  OVERSTAY: "Exceso de tiempo",
  NO_SESSION: "Sin sesión vigente",
  OTHER: "Otro",
});

export function inspectionMotivoLabel(inspection) {
  return MOTIVO_LABEL[inspection?.inspection_type] || "Fiscalización registrada";
}
