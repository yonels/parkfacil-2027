// Cupón en el POS (SOL-2026-10-19-002): lo que se muestra en la ventana de pago
// y se imprime en el comprobante. Todo sale del cálculo firmado por el servidor
// (quote.snapshot) o de la estadía ya pagada; el POS no calcula descuentos.

export function couponBenefitText(benefitType, value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  if (benefitType === "FREE_MINUTES") return `${amount} minutos gratis`;
  if (benefitType === "FIXED_AMOUNT") return `$${Math.round(amount).toLocaleString("es-CL")} de descuento`;
  if (benefitType === "PERCENTAGE") return `${amount}% de descuento`;
  return "";
}

// Ventana de pago: null si el cálculo no lleva cupón.
export function couponViewFromQuote(quote) {
  const snapshot = quote?.snapshot;
  if (!snapshot?.couponId) return null;
  const subtotal = Number(snapshot.subtotalAmount);
  const discount = Number(snapshot.discountAmount);
  return {
    code: String(snapshot.couponCode || "").trim(),
    benefit: couponBenefitText(snapshot.couponBenefitType, snapshot.couponBenefitValue),
    subtotal: Number.isFinite(subtotal) ? subtotal : null,
    discount: Number.isFinite(discount) ? discount : 0,
  };
}

// Comprobante (APK 0.5.3+; las anteriores lo ignoran): datos del pago confirmado.
export function receiptCouponLine(stay, quote) {
  const code = String(stay?.coupon_code || quote?.snapshot?.couponCode || "").trim();
  if (!code) return null;
  const discount = Number(stay?.discount_amount ?? quote?.snapshot?.discountAmount ?? 0);
  const subtotal = Number(stay?.subtotal_amount ?? quote?.snapshot?.subtotalAmount);
  return {
    code,
    benefit: couponBenefitText(quote?.snapshot?.couponBenefitType, quote?.snapshot?.couponBenefitValue),
    subtotalAmount: Number.isFinite(subtotal) ? Math.round(subtotal) : null,
    discountAmount: Number.isFinite(discount) ? Math.round(discount) : 0,
  };
}

// «CÓDIGO QR» del menú es para tickets: si se lee un cupón ahí, se explica.
export const COUPON_IN_TICKET_SCAN_MESSAGE = "Este QR es un cupón de descuento. Primero lee el ticket del vehículo y aplica el cupón con APLICAR CUPÓN al pagar.";
