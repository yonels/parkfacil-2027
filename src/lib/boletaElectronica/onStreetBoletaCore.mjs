// Reglas puras de la boleta de pagos Webpay On Street
// (SOL-2026-11-12-004, etapa 3, segunda mitad). Mismo criterio que
// webpayBoletaCore.mjs (Off Street), pero sobre `on_street_payment_intents`
// -- un esquema totalmente aparte de `parking_stays`.
export function shouldIssueOnStreetBoleta({ intent, settings }) {
  if (!intent || intent.status !== "PAID" || !intent.paid_at) return false;
  if (!(Math.round(Number(intent.amount)) > 0)) return false;
  if (!settings?.api_key_ciphertext) return false;
  return (settings.enabled_parking_ids || []).includes(intent.parking_id);
}
