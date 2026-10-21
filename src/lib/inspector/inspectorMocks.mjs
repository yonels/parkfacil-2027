import { normalizePlate } from "../dataEntry.mjs";

// Enum de los 4 estados de patente aprobados -- compartido por el core real
// de resolución de estado (inspectorPlateStateCore.mjs), la API y la UI.
// Los datos mock de la Etapa 1 (lookupInspectorPlate, morosos, semilla de
// consultas) se retiraron en la Etapa 2: la consulta de patente y el
// listado de observados ahora son reales (ver inspectorRepository.js,
// /api/inspector/plates/[plate], /api/inspector/observed).
export const INSPECTOR_PLATE_STATUS = Object.freeze({
  VIGENTE: "VIGENTE",
  VENCIDO: "VENCIDO",
  SIN_SESION: "SIN_SESION",
  OBSERVADO: "OBSERVADO",
});

// Normalización de patente (Etapa 2, §6): reutiliza el mismo helper oficial
// que el resto de ParkFacil (dataEntry.mjs) -- nunca una regla propia.
export function normalizeInspectorPlate(rawPlate) {
  return normalizePlate(rawPlate, { truncate: false }).slice(0, 8);
}
