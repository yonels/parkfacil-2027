export const CARD_TYPES = Object.freeze(["CREDIT", "DEBIT"]);
export const REVENUE_METHODS = Object.freeze(["CASH", "CARD", "CREDIT", "DEBIT", "CARD_UNCLASSIFIED"]);

export function validatePaymentCardType(method, cardType) {
  if (cardType == null || cardType === "") return null;
  if (method !== "CARD" || !CARD_TYPES.includes(cardType)) throw new Error("INVALID_PAYMENT_CARD_TYPE");
  return cardType;
}

export function classifiedPaymentMethod(row) {
  const method = row?.payment_method ?? row?.paymentMethod;
  const cardType = row?.payment_card_type ?? row?.paymentCardType;
  return method === "CARD" && CARD_TYPES.includes(cardType) ? cardType : method || null;
}

export function paymentMethodDisplay(method) {
  return ({ CASH: "Efectivo", CREDIT: "Crédito", DEBIT: "Débito", CARD: "Tarjeta sin clasificar", CARD_UNCLASSIFIED: "Tarjeta sin clasificar" })[method] || "—";
}

export function matchesRevenueMethod(row, method) {
  if (!method) return true;
  if (method === "CARD") return row?.payment_method === "CARD";
  return classifiedPaymentMethod(row) === (method === "CARD_UNCLASSIFIED" ? "CARD" : method);
}

export function summarizeCardTypes(rows) {
  let creditAmount = 0, debitAmount = 0, unclassifiedCardAmount = 0;
  for (const row of rows || []) {
    const amount = Number(row?.total_amount ?? row?.amount) || 0;
    const method = classifiedPaymentMethod(row);
    if (method === "CREDIT") creditAmount += amount;
    else if (method === "DEBIT") debitAmount += amount;
    else if (method === "CARD") unclassifiedCardAmount += amount;
  }
  return { creditAmount, debitAmount, unclassifiedCardAmount };
}

export function closureCardTypes(row) {
  const typed = summarizeCardTypes(Array.isArray(row?.payments_snapshot) ? row.payments_snapshot : []);
  // Old closures may lack snapshots altogether. Their persisted card total
  // remains unclassified; old snapshots/amounts are never rewritten.
  const cardAmount = Number(row?.card_amount) || 0;
  return { ...typed, unclassifiedCardAmount: Math.max(0, cardAmount - typed.creditAmount - typed.debitAmount) };
}

export function missingCardTypeColumn(error) {
  return ["42703", "PGRST204"].includes(error?.code) && /payment_card_type/.test(String(error?.message || "") + String(error?.details || ""));
}

// Read-only rollout compatibility. Rebuild the SAME authorized query when
// the additive column is absent. Never retry mutations or swallow outages.
export async function readCardTypedQuery(buildQuery) {
  const first = await buildQuery(true);
  if (!missingCardTypeColumn(first.error)) return { ...first, cardTypeSupported: !first.error };
  return { ...(await buildQuery(false)), cardTypeSupported: false };
}

export async function canCaptureCardType(db, parkingId) {
  const result = await readCardTypedQuery((typed) => db.from("parking_stays").select(typed ? "id,payment_card_type" : "id").eq("parking_id", parkingId).limit(0));
  if (result.error) throw result.error;
  return result.cardTypeSupported;
}
