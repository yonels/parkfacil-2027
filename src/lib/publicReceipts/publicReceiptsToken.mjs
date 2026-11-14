// Token de sesión corta para «Consulte su boleta» (DISENO.md, control C5):
// 15 minutos, HMAC-SHA256, sin estado en el servidor (no hay tabla de
// sesiones). El token lleva la patente y la lista de stayId autorizados
// por esa consulta -- ver/imprimir/enviar una boleta exige ese mismo token
// y que el stayId pedido esté en esa lista. No es un JWT genérico: formato
// mínimo propio, igual de verificable, sin librerías nuevas.

import { createHmac, timingSafeEqual } from "node:crypto";

export const PUBLIC_RECEIPTS_TOKEN_TTL_MS = 15 * 60 * 1000;

function base64url(input) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function fromBase64url(input) {
  return Buffer.from(String(input || ""), "base64url").toString("utf8");
}

function sign(payload, secret) {
  return createHmac("sha256", String(secret || "")).update(payload).digest("base64url");
}

// { plate, stayIds, secret, now } -> "payload.signature"
export function issuePublicReceiptsToken({ plate, stayIds, secret, now = new Date() }) {
  if (!secret) throw new Error("secret requerido para firmar el token.");
  const body = JSON.stringify({
    plate: String(plate || ""),
    stayIds: Array.isArray(stayIds) ? [...stayIds] : [],
    exp: now.getTime() + PUBLIC_RECEIPTS_TOKEN_TTL_MS,
  });
  const payload = base64url(body);
  return `${payload}.${sign(payload, secret)}`;
}

// Devuelve { ok:true, plate, stayIds } o { ok:false, code }.
export function verifyPublicReceiptsToken(token, secret, now = new Date()) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, code: "MALFORMED" };
  const [payload, signature] = parts;
  const expected = sign(payload, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, code: "INVALID_SIGNATURE" };

  let data;
  try {
    data = JSON.parse(fromBase64url(payload));
  } catch {
    return { ok: false, code: "MALFORMED" };
  }
  if (!data || typeof data.exp !== "number" || now.getTime() > data.exp) return { ok: false, code: "EXPIRED" };
  if (typeof data.plate !== "string" || !Array.isArray(data.stayIds)) return { ok: false, code: "MALFORMED" };
  return { ok: true, plate: data.plate, stayIds: data.stayIds };
}

export function tokenAuthorizesStay(verified, stayId) {
  return Boolean(verified?.ok) && verified.stayIds.includes(String(stayId || ""));
}
