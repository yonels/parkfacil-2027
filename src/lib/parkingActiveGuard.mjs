// Un estacionamiento solo se opera cuando está Activo (SOL-2026-10-29-016). Antes
// un turno abierto desde el panel de Turnos permitía registrar ingresos en un
// estacionamiento en Borrador, y la lista del POS (que solo lee estacionamientos
// activos) los dejaba invisibles sin ningún aviso.

export const PARKING_NOT_ACTIVE = Object.freeze({
  code: "PARKING_NOT_ACTIVE",
  message: "Este estacionamiento aún no está activo. Pide a tu administrador que lo active desde «Configuración y activación».",
  adminMessage: "El estacionamiento aún no está activo: actívalo desde «Configuración y activación» antes de abrir turnos.",
});

export function isParkingActive(parking) {
  return parking?.status === "ACTIVE";
}
