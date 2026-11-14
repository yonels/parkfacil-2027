// SMS con el link a «Consulte su boleta» para On Street
// (SOL-2026-11-12-004, etapa 3 + petición del usuario del 2026-11-14: «que
// sea un link al teléfono»). On Street siempre tiene el teléfono del
// cliente (nunca el correo), así que este es el aviso natural -- distinto
// del envío por correo de la página (que exige que el cliente escriba su
// correo). Sin tildes a propósito: evita el aviso NON_GSM_CHARACTERS del
// centro de SMS (smsCenterCore.mjs) sin cambiar el significado.

export const RECEIPT_SMS_SITE_BASE_URL_DEFAULT = "https://www.parkfacil.cl";

export function resolveReceiptSmsSiteBaseUrl(env = process.env) {
  return String(env.PUBLIC_RECEIPTS_SITE_BASE_URL || RECEIPT_SMS_SITE_BASE_URL_DEFAULT).trim().replace(/\/$/, "");
}

export function buildReceiptSmsLink({ plate, baseUrl }) {
  return `${baseUrl}/consulte-su-boleta?patente=${encodeURIComponent(plate)}`;
}

export function buildReceiptSmsMessage({ plate, baseUrl }) {
  return `ParkFacil: su boleta ya esta disponible. Consultela aqui: ${buildReceiptSmsLink({ plate, baseUrl })}`;
}
