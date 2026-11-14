// Reglas puras de la boleta de pagos Webpay («Pague Aquí» Off Street,
// SOL-2026-11-12-004 etapa 3 — DISENO.md §8.2/§8.3: «a diferencia del
// voucher TUU, el comprobante de Webpay no reemplaza a la boleta: el
// comercio debe emitirla»). No toca cashBoletaCore.mjs/cashBoletaService.js
// a propósito: son un flujo en producción ya probado, y este es uno nuevo.
//
// Solo pagos con tarjeta ONLINE (Webpay), nunca los de TUU en el POS
// (etapa 2 quedó omitida para esos: siguen con el comprobante C). La
// RPC accredit_webpay_parking_stay deja payment_method='CARD' pero NUNCA
// toca card_payment_provider/payment_card_type (esas columnas son
// exclusivas del registro TUU, register_pos_card_payment) -- por eso
// card_payment_provider presente = TUU, ausente = Webpay.
export function shouldIssueWebpayBoleta({ stay, settings }) {
  if (!stay || stay.status !== "PAID" || stay.payment_method !== "CARD") return false;
  if (stay.card_payment_provider) return false; // pago TUU, no Webpay.
  if (!(Math.round(Number(stay.total_amount)) > 0) || !stay.payment_code) return false;
  if (!settings?.api_key_ciphertext) return false;
  return (settings.enabled_parking_ids || []).includes(stay.parking_id);
}
