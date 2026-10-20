// Tipo de venta y últimos 4 dígitos informados por TUU (QA PRO2 2026-10-20,
// SOL-2026-10-11-001). La respuesta de TUU (`resultJson`, que la APK entrega como
// rawResponse) trae `transactionMethod` ("Tarjeta de Débito" / "Tarjeta de
// Crédito") y `last4` ("****5223"). Decisión del usuario: si el tipo de TUU difiere
// del botón elegido en el POS, prevalece TUU; ambos se guardan.

function parseJson(value) {
  if (value && typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value || ""));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function tuuCardTypeFromMethod(method) {
  const text = String(method || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (text.includes("debito")) return "DEBIT";
  if (text.includes("credito")) return "CREDIT";
  return null;
}

export function tuuLast4(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

// { cardType: "CREDIT"|"DEBIT"|null, last4: "5223"|null }
export function tuuCardDetailsFromRaw(rawResponse) {
  const data = parseJson(rawResponse);
  return { cardType: tuuCardTypeFromMethod(data?.transactionMethod), last4: tuuLast4(data?.last4) };
}

// Validación para el servidor: solo valores conocidos.
export function sanitizeTuuCardDetails(input) {
  const cardType = ["CREDIT", "DEBIT"].includes(input?.cardType) ? input.cardType : null;
  const last4 = /^\d{4}$/.test(String(input?.last4 || "")) ? String(input.last4) : null;
  return cardType || last4 ? { cardType, last4 } : null;
}

// «Medio de pago» del comprobante: la APK imprime tal cual un texto que no es un
// código conocido, así que "Debito ****5223" se imprime sin cambiar la APK.
export function receiptPaymentMethod(method, last4) {
  const code = String(method || "").toUpperCase();
  if (!/^\d{4}$/.test(String(last4 || ""))) return method || null;
  if (code === "DEBIT") return `Debito ****${last4}`;
  if (code === "CREDIT") return `Credito ****${last4}`;
  return method || null;
}
