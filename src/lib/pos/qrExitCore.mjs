// POS Salida por QR: el ticket de entrada imprime el qr_token (uuid) de la
// estadía (ver buildEntryPrintPayload). En la salida se lee ese QR, se
// ubica la estadía OPEN del estacionamiento y se cotiza/cobra con el mismo
// flujo que la salida por patente. Módulo puro (sin DOM) para testearlo.

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const COUPON_PREFIX = "PFC-COUPON:";
const TICKET_CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,39}$/;

export const QR_EXIT_STATUS = Object.freeze({
  FOUND: "FOUND",
  EMPTY: "EMPTY",
  INVALID: "INVALID",
  COUPON: "COUPON",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
});

export function extractStayQrToken(raw) {
  const match = UUID_RE.exec(String(raw ?? ""));
  return match ? match[0].toLowerCase() : null;
}

// Acepta el contenido leído del QR (qr_token) o, como respaldo manual, el
// token o el código del ticket escritos por el operador.
export function resolveStayFromQr(stays, raw) {
  const text = String(raw ?? "").trim();
  if (!text) return { status: QR_EXIT_STATUS.EMPTY };
  if (text.toUpperCase().startsWith(COUPON_PREFIX)) return { status: QR_EXIT_STATUS.COUPON };

  const list = Array.isArray(stays) ? stays : [];
  const token = extractStayQrToken(text);
  let matches;
  if (token) {
    matches = list.filter((stay) => String(stay?.qr_token || "").toLowerCase() === token);
  } else {
    const code = text.toUpperCase();
    if (!TICKET_CODE_RE.test(code)) return { status: QR_EXIT_STATUS.INVALID };
    matches = list.filter((stay) => String(stay?.code || "").toUpperCase() === code);
  }

  if (matches.length === 0) return { status: QR_EXIT_STATUS.NOT_FOUND };
  // Anomalía (mismo criterio que la búsqueda por patente): nunca se elige una.
  if (matches.length > 1) return { status: QR_EXIT_STATUS.CONFLICT, count: matches.length };
  return { status: QR_EXIT_STATUS.FOUND, stay: matches[0] };
}

export function qrExitMessage(result) {
  switch (result?.status) {
    case QR_EXIT_STATUS.EMPTY:
      return "Lee el QR del ticket o escribe el código del ticket.";
    case QR_EXIT_STATUS.INVALID:
      return "El código leído no corresponde a un ticket de entrada ParkFacil.";
    case QR_EXIT_STATUS.COUPON:
      return "Este QR es un cupón, no un ticket de entrada. Lee el QR del ticket del vehículo.";
    case QR_EXIT_STATUS.NOT_FOUND:
      return "No hay un vehículo dentro con ese ticket en este estacionamiento (puede haber salido ya o ser de otro estacionamiento).";
    case QR_EXIT_STATUS.CONFLICT:
      return `Se encontraron ${result.count} permanencias abiertas con este ticket. No se puede continuar automáticamente — contacta a soporte antes de cobrar.`;
    default:
      return "";
  }
}
