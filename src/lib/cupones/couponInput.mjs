// Lectura del cupón en el POS (SOL-2026-10-19-002): el QR del cupón trae
// "PFC-COUPON:<token>" y el código impreso tiene 4 caracteres (couponCode.mjs).
// Los cupones anteriores con "PF-XXXXXXXX" (8 hexadecimales) siguen valiendo.
// Se acepta cualquiera de los dos; el servidor busca por token o por código
// (este último siempre dentro de la empresa del estacionamiento).

const QR_PREFIX = /^PFC-COUPON:/i;
const CODE_PATTERN = /^PF-[A-F0-9]{8}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const SHORT_CODE_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;

export function isCouponQrPayload(raw) {
  return QR_PREFIX.test(String(raw ?? "").trim());
}

// { kind: "token", value } | { kind: "code", value } | null si no es un cupón.
export function parseCouponInput(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  if (QR_PREFIX.test(text)) {
    const token = text.replace(QR_PREFIX, "").trim();
    return TOKEN_PATTERN.test(token) ? { kind: "token", value: token } : null;
  }
  const code = text.toUpperCase().replace(/\s+/g, "");
  if (SHORT_CODE_PATTERN.test(code)) return { kind: "code", value: code };
  if (CODE_PATTERN.test(code)) return { kind: "code", value: code };
  // Código escrito sin guion o sin prefijo: "PF0B5B9CF2" / "0B5B9CF2".
  const bare = code.replace(/^PF-?/, "");
  if (/^[A-F0-9]{8}$/.test(bare)) return { kind: "code", value: `PF-${bare}` };
  return null;
}

// Lo que el POS envía al servidor como couponToken (el servidor vuelve a parsear).
export function couponTokenForRequest(raw) {
  const parsed = parseCouponInput(raw);
  if (!parsed) return null;
  return parsed.kind === "token" ? `PFC-COUPON:${parsed.value}` : parsed.value;
}

// Antes de iniciar un cobro con tarjeta con cupón: activo, sin canjear y no vencido.
export function couponAvailableForCharge(row, now = Date.now()) {
  if (!row || row.status !== "ACTIVE" || row.redeemed_at) return false;
  const expires = Date.parse(row.expires_at);
  return Number.isFinite(expires) && expires > now;
}
