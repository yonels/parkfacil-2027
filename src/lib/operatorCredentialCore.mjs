// Reporte de claves de operadores (SOL-2026-11-04-004): cifrado y reglas de acceso.
// Lógica pura, sin Supabase, para probarla con node --test.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const OPERATOR_CREDENTIAL_KEY_ENV = "OPERATOR_CREDENTIAL_ENCRYPTION_KEY";
const MIN_SECRET_LENGTH = 32;

export class OperatorCredentialError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OperatorCredentialError";
    this.code = code;
  }
}

function keyFromSecret(secret) {
  if (String(secret || "").length < MIN_SECRET_LENGTH) {
    throw new OperatorCredentialError("CREDENTIAL_KEY_NOT_CONFIGURED", "El servidor no tiene configurada la llave de cifrado de claves.");
  }
  return createHash("sha256").update(String(secret)).digest();
}

export function encryptOperatorPassword(password, secret = process.env[OPERATOR_CREDENTIAL_KEY_ENV]) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  const encrypted = Buffer.concat([cipher.update(String(password), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptOperatorPassword(payload, secret = process.env[OPERATOR_CREDENTIAL_KEY_ENV]) {
  const [version, iv, tag, encrypted] = String(payload || "").split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new OperatorCredentialError("CREDENTIAL_INVALID", "La clave guardada no es válida.");
  }
  const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(secret), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

// Solo el administrador de la empresa ve las claves, desde el Portal Cliente. Root ve el estado
// del reporte y puede reemplazar claves, pero no leerlas.
export function canViewOperatorCredentials(context) {
  return context?.role === "company_admin" && context?.portal === "client";
}

// Filas del reporte, sin la clave: esta se pide una por una para que quede auditada.
export function operatorCredentialRows(users = [], credentials = []) {
  const byUser = new Map(credentials.map((item) => [item.user_id, item]));
  return users
    .filter((user) => user.perfilPrincipal === "operator")
    .map((user) => ({
      id: user.id,
      nombre: user.nombreCompleto || "",
      usuarioAcceso: user.usuarioAcceso || user.correo || "",
      hasCredential: byUser.has(user.id),
      updatedAt: byUser.get(user.id)?.updated_at || null,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
