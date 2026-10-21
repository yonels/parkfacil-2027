// Código impreso del cupón (pedido del usuario 2026-10-19, SOL-2026-10-19-002):
// 4 caracteres alfanuméricos, fáciles de dictar y escribir en el POS. Sin los
// caracteres que se confunden (0/O, 1/I/L): 31 símbolos → 923.521 códigos.
// El QR sigue usando el token largo (PFC-COUPON:<uuid>); el código corto es el
// respaldo manual y se busca solo dentro de la empresa. Los cupones anteriores
// con "PF-XXXXXXXX" siguen siendo válidos (ver couponInput.mjs).

export const COUPON_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const COUPON_CODE_LENGTH = 4;
export const SHORT_COUPON_CODE_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;

// `randomInt(max)` devuelve un entero en [0, max): crypto.randomInt en el servidor.
export function generateShortCouponCode(randomInt) {
  let code = "";
  for (let index = 0; index < COUPON_CODE_LENGTH; index += 1) code += COUPON_CODE_ALPHABET[randomInt(COUPON_CODE_ALPHABET.length)];
  return code;
}

// Varios códigos distintos entre sí y distintos de `taken` (códigos ya usados).
export function generateDistinctShortCouponCodes(count, randomInt, taken = new Set(), maxAttempts = count * 50 + 50) {
  const codes = new Set();
  let attempts = 0;
  while (codes.size < count) {
    if (attempts > maxAttempts) throw new Error("COUPON_CODE_SPACE_EXHAUSTED");
    attempts += 1;
    const code = generateShortCouponCode(randomInt);
    if (!taken.has(code)) codes.add(code);
  }
  return [...codes];
}
