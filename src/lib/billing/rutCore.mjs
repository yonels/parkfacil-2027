// Validación de RUT chileno (módulo 11) antes de enviar documentos al proveedor (SOL-2026-11-05-005).
// Motivo: Haulmer responde «OF-02 RUTRecep Requerido» cuando el dígito verificador no corresponde, un error confuso.

export function rutCheckDigit(body) {
  let sum = 0;
  let factor = 2;
  for (const digit of String(body).split("").reverse()) {
    sum += Number(digit) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const rest = 11 - (sum % 11);
  return rest === 11 ? "0" : rest === 10 ? "K" : String(rest);
}

// Acepta «12.345.678-5», «12345678-5» o «123456785»; la K puede ir en minúscula.
export function isValidRut(value) {
  const clean = String(value ?? "").replace(/[.\s]/g, "").replace(/-/g, "").toUpperCase();
  const match = /^(\d{1,9})([\dK])$/.exec(clean);
  if (!match || Number(match[1]) === 0) return false;
  return rutCheckDigit(match[1]) === match[2];
}

export function invalidRutMessage(value, who = "del cliente") {
  return `El RUT ${who} (${String(value ?? "").trim() || "vacío"}) no es válido: el dígito verificador no corresponde. Corrígelo en la ficha de la empresa y vuelve a emitir.`;
}
