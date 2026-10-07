import { isValidTuuSequenceNumber } from "./tuuPayment.mjs";

// Referencia del cobro con tarjeta en el proveedor (TUU sequenceNumber),
// SOL-2026-10-07-002. Opcional: null si no viene. Lanza si viene mal formada.
export function validateCardPaymentReference(method, cardPayment) {
  if (cardPayment === undefined || cardPayment === null) return null;
  if (method !== "CARD" || cardPayment?.provider !== "TUU" || !isValidTuuSequenceNumber(cardPayment?.reference)) {
    throw new Error("CARD_PAYMENT_REFERENCE_INVALID");
  }
  return { provider: "TUU", reference: cardPayment.reference };
}

export function missingCardPaymentReferenceColumn(error) {
  return ["42703", "PGRST204"].includes(error?.code)
    && /card_payment_(provider|reference)/.test(String(error?.message || "") + String(error?.details || ""));
}

// La referencia llega DESPUÉS de que TUU cobró: si la migración aún no está
// aplicada, la salida se registra igual sin referencia (nunca se bloquea un
// cobro ya realizado). Es una lectura previa; la escritura no se reintenta.
export async function canStoreCardPaymentReference(db) {
  const { error } = await db.from("parking_stays").select("id,card_payment_provider,card_payment_reference").limit(0);
  if (!error) return true;
  if (missingCardPaymentReferenceColumn(error)) return false;
  throw error;
}
