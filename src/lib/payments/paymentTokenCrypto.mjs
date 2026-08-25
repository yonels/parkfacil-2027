import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function keyFromSecret(secret) {
  if (String(secret || "").length < 32) throw new Error("PAYMENT_TOKEN_ENCRYPTION_KEY_NOT_CONFIGURED");
  return createHash("sha256").update(String(secret)).digest();
}

export function hashPaymentToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

export function encryptPaymentToken(token, secret = process.env.PAYMENT_TOKEN_ENCRYPTION_KEY) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  const encrypted = Buffer.concat([cipher.update(String(token), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptPaymentToken(payload, secret = process.env.PAYMENT_TOKEN_ENCRYPTION_KEY) {
  const [ivRaw, tagRaw, encryptedRaw] = String(payload || "").split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error("PAYMENT_TOKEN_INVALID");
  const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(secret), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf8");
}
