// Interruptor explícito de salida de correo (Microsoft Graph).
//
// EMAIL_DELIVERY=disabled bloquea TODA llamada a Microsoft Graph (token y
// envío) antes de tocar la red. Pensado para entornos de QA/Preview: se
// configura por rama en Vercel y es comprobable (sin credenciales ficticias).
// Cualquier otro valor, o la variable ausente, mantiene el comportamiento
// actual (envío habilitado).

export const EMAIL_DELIVERY_ENV = "EMAIL_DELIVERY";
export const EMAIL_DELIVERY_DISABLED_CODE = "EMAIL_DELIVERY_DISABLED";

export function isEmailDeliveryDisabled(env = process.env) {
  return String(env?.[EMAIL_DELIVERY_ENV] ?? "").trim().toLowerCase() === "disabled";
}

export function emailDeliveryDisabledMessage() {
  return "El envío de correo está deshabilitado en este entorno (EMAIL_DELIVERY=disabled).";
}
