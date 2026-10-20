import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { DTE_ENVIRONMENTS, DTE_PROVIDERS, DTE_STATUS } from "./dteSettingsConstants.mjs";

// Boleta electrónica (DTE) por empresa: configuración Haulmer (SOL-2026-10-20-001).
// Reglas puras: validación, enmascarado, estado y cifrado de la API Key. La
// emisión de boletas no existe todavía (falta la documentación de Haulmer).

export { DTE_ENVIRONMENT_LABELS, DTE_ENVIRONMENTS, DTE_PROVIDERS, DTE_STATUS, DTE_STATUS_LABELS } from "./dteSettingsConstants.mjs";

export const DTE_KEY_ENV = "DTE_API_KEY_ENCRYPTION_KEY";
export const DTE_STORAGE_MISSING_CODES = new Set(["42P01", "PGRST205", "PGRST200"]);

const API_KEY_PATTERN = /^[A-Za-z0-9._~+/=-]{16,256}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class DteSettingsError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "DteSettingsError";
    this.code = code;
    this.status = status;
  }
}

// --- API Key ----------------------------------------------------------------

export function apiKeyLast4(apiKey) {
  return String(apiKey || "").slice(-4);
}

export function maskedApiKey(last4) {
  return last4 ? `••••${last4}` : null;
}

function keyFromSecret(secret) {
  if (String(secret || "").length < 32) throw new DteSettingsError("DTE_ENCRYPTION_KEY_NOT_CONFIGURED", "El servidor no tiene configurada la clave de cifrado de la boleta electrónica.", 503);
  return createHash("sha256").update(String(secret)).digest();
}

export function dteEncryptionConfigured(secret = process.env[DTE_KEY_ENV]) {
  return String(secret || "").length >= 32;
}

export function encryptDteApiKey(apiKey, secret = process.env[DTE_KEY_ENV]) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  const encrypted = Buffer.concat([cipher.update(String(apiKey), "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), encrypted].map((part) => (typeof part === "string" ? part : part.toString("base64url"))).join(".");
}

// Para la futura emisión (servidor): nunca se devuelve al navegador.
export function decryptDteApiKey(payload, secret = process.env[DTE_KEY_ENV]) {
  const [version, ivRaw, tagRaw, encryptedRaw] = String(payload || "").split(".");
  if (version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw) throw new DteSettingsError("DTE_API_KEY_INVALID", "La API Key guardada no es válida.", 500);
  const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(secret), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf8");
}

// --- Validación del formulario ----------------------------------------------

// input: { environment, apiKey?, removeApiKey?, parkingIds }
// allowedParkingIds: estacionamientos Off Street de la empresa.
// Devuelve { environment, parkingIds, apiKeyAction: "KEEP"|"SET"|"REMOVE", apiKey }.
export function validateDteSettingsInput(input, { allowedParkingIds = [], hasStoredKey = false } = {}) {
  const errors = [];
  const environment = String(input?.environment || "");
  if (!Object.values(DTE_ENVIRONMENTS).includes(environment)) errors.push("Elige el ambiente (Prueba o Producción).");

  const rawKey = typeof input?.apiKey === "string" ? input.apiKey.trim() : "";
  const removeApiKey = input?.removeApiKey === true;
  let apiKeyAction = "KEEP";
  if (removeApiKey && rawKey) errors.push("No se puede quitar y cargar la API Key a la vez.");
  else if (removeApiKey) apiKeyAction = hasStoredKey ? "REMOVE" : "KEEP";
  else if (rawKey) {
    if (!API_KEY_PATTERN.test(rawKey)) errors.push("La API Key debe tener entre 16 y 256 caracteres, sin espacios.");
    else apiKeyAction = "SET";
  }

  const rawParkings = Array.isArray(input?.parkingIds) ? input.parkingIds : [];
  const allowed = new Set(allowedParkingIds);
  const parkingIds = [...new Set(rawParkings.map((id) => String(id || "")))];
  if (parkingIds.some((id) => !UUID_PATTERN.test(id) || !allowed.has(id))) errors.push("Hay estacionamientos que no pertenecen a tu empresa.");

  const willHaveKey = apiKeyAction === "SET" || (apiKeyAction === "KEEP" && hasStoredKey);
  if (parkingIds.length && !willHaveKey) errors.push("Para activar estacionamientos primero carga la API Key.");

  if (errors.length) {
    const error = new DteSettingsError("DTE_SETTINGS_INVALID", errors[0]);
    error.details = errors;
    throw error;
  }
  return { environment, parkingIds: parkingIds.sort(), apiKeyAction, apiKey: apiKeyAction === "SET" ? rawKey : null };
}

// --- Estado y vistas ----------------------------------------------------------

export function resolveDteStatus(row) {
  if (!row?.api_key_ciphertext) return DTE_STATUS.NOT_CONFIGURED;
  return (row.enabled_parking_ids || []).length ? DTE_STATUS.CONFIGURED : DTE_STATUS.CONFIGURED_INACTIVE;
}

// Vista del administrador de la empresa: la API Key solo enmascarada.
export function dteSettingsView(row, parkings = []) {
  const enabled = new Set(row?.enabled_parking_ids || []);
  return {
    provider: row?.provider || DTE_PROVIDERS.HAULMER,
    environment: row?.environment || DTE_ENVIRONMENTS.TEST,
    hasApiKey: Boolean(row?.api_key_ciphertext),
    apiKeyMasked: maskedApiKey(row?.api_key_last4 || null),
    parkings: parkings.map((parking) => ({ id: parking.id, name: parking.name, code: parking.code || "", enabled: enabled.has(parking.id) })),
    status: resolveDteStatus(row),
    emissionAvailable: false,
    updatedAt: row?.updated_at || null,
    updatedByEmail: row?.updated_by_email || null,
  };
}

// Vista Root: solo estado (sin API Key, ni siquiera enmascarada).
export function dteRootStatusView(company, row) {
  return {
    companyId: company.id,
    companyName: company.trade_name || company.business_name || company.id,
    provider: row?.provider || null,
    environment: row?.environment || null,
    status: resolveDteStatus(row),
    enabledParkings: (row?.enabled_parking_ids || []).length,
    updatedAt: row?.updated_at || null,
  };
}

// Cambios para la auditoría, nunca con la API Key.
export function dteAuditChanges(previous, next) {
  const changes = {};
  if ((previous?.environment || null) !== next.environment) changes.environment = { from: previous?.environment || null, to: next.environment };
  const before = [...(previous?.enabled_parking_ids || [])].sort();
  if (JSON.stringify(before) !== JSON.stringify(next.parkingIds)) changes.enabledParkingIds = { from: before, to: next.parkingIds };
  if (next.apiKeyAction !== "KEEP") changes.apiKey = next.apiKeyAction;
  return changes;
}

export function dteAuditAction(previous, next) {
  if (next.apiKeyAction === "REMOVE") return "API_KEY_REMOVED";
  if (next.apiKeyAction === "SET") return previous?.api_key_ciphertext ? "API_KEY_REPLACED" : "API_KEY_SET";
  return "SETTINGS_SAVED";
}
