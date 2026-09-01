// Lógica pura del contexto territorial del Inspector (Etapa 3, §13/§14):
// sin "server-only" ni imports de framework, testeable directo con
// `node --test`. Filtra la jerarquía real (parkings/áreas/calles/tramos ya
// resuelta por /api/inspector/context) en cascada, sin depender de
// Supabase ni del navegador.

export function areasForParking(areas, parkingId) {
  if (!parkingId) return [];
  return (areas || []).filter((a) => a.parking_id === parkingId);
}

export function streetsForArea(streets, areaId) {
  if (!areaId) return [];
  return (streets || []).filter((s) => s.sector_id === areaId);
}

export function segmentsForStreet(segments, streetId) {
  if (!streetId) return [];
  return (segments || []).filter((s) => s.street_id === streetId);
}

// Selección completa -> payload listo para enviar en el POST de la
// fiscalización. Un tramo sin QR asociado igual es un contexto válido
// (qrLocationId queda null, pero parkingId sí queda atribuido -- soluciona
// el caso real "Sin estacionamiento asignado").
export function contextToInspectionPayload(context) {
  if (!context?.parkingId) return { contextParkingId: null, contextQrLocationId: null };
  return { contextParkingId: context.parkingId, contextQrLocationId: context.qrLocationId || null };
}

// Un contexto se considera "completo" cuando al menos el estacionamiento
// está definido -- Área/Calle/Tramo afinan la atribución pero no son
// obligatorios para resolver el caso real reportado (empresa se deriva de
// parking_id, no de la granularidad del tramo).
export function isContextUsable(context) {
  return Boolean(context?.parkingId);
}
