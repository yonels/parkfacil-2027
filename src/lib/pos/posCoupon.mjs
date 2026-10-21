// Cupón en el POS (SOL-2026-10-19-002): lo que se muestra en la ventana de pago
// y se imprime en el comprobante. Todo sale del cálculo firmado por el servidor
// (quote.snapshot) o de la estadía ya pagada; el POS no calcula descuentos.

import { couponTokenForRequest, isCouponQrPayload } from "../cupones/couponInput.mjs";
import { extractStayQrToken } from "./qrExitCore.mjs";

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
export const COUPON_IN_TICKET_SCAN_MESSAGE = "Este QR es un cupón de descuento. Primero lee el ticket del vehículo y aplica el cupón con Leer QR Descuento.";

// Leer QR Descuento: solo el QR impreso del cupón ("PFC-COUPON:<token>") se envía
// al servidor. El QR del ticket (UUID) o uno ajeno se explican sin consultar.
export function classifyDiscountScan(raw) {
  if (isCouponQrPayload(raw)) {
    const token = couponTokenForRequest(raw);
    return token ? { kind: "coupon", token } : { kind: "foreign" };
  }
  if (extractStayQrToken(raw)) return { kind: "ticket" };
  return { kind: "foreign" };
}

export const DISCOUNT_SCAN_MESSAGES = Object.freeze({
  ticket: "Ese QR es el ticket del vehículo, no un cupón. Lee el QR del cupón de descuento.",
  foreign: "El QR leído no es un cupón de ParkFacil.",
  cancelled: "Lectura cancelada. Puedes leer el QR de nuevo o escribir el código.",
  permissionDenied: "La app no tiene permiso para usar la cámara. Actívalo en Ajustes de Android o escribe el código del cupón.",
  unavailable: "No fue posible abrir la cámara. Escribe el código del cupón.",
  alreadyApplied: "Este cupón ya está aplicado.",
});

// Resultado del escáner nativo (nativeQrScanner) que no trae un QR.
export function discountScanFailureMessage(result) {
  if (result?.cancelled) return { type: "info", text: DISCOUNT_SCAN_MESSAGES.cancelled };
  if (result?.permissionDenied) return { type: "error", text: DISCOUNT_SCAN_MESSAGES.permissionDenied };
  return { type: "error", text: DISCOUNT_SCAN_MESSAGES.unavailable };
}

// Total $0 por el cupón: salida sin cargo confirmada por el operador. Se registra
// como efectivo $0 (decisión del usuario, 2026-10-19) y nunca se envía a TUU.
export function isZeroTotalCouponCharge(quote) {
  const snapshot = quote?.snapshot;
  return Boolean(snapshot?.couponId) && Number(snapshot.totalAmount) === 0;
}
