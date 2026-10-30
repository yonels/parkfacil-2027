import { buildTechnicalEmail } from "./auth/accessUsernameDomain.mjs";

export const MIN_PASSWORD_LENGTH = 12;

export function validateDirectPassword(value) {
  const password = String(value || "");
  const errors = [];
  if (password.length < MIN_PASSWORD_LENGTH) errors.push(`La clave debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  if (!/[a-z]/.test(password)) errors.push("La clave debe incluir una letra minúscula.");
  if (!/[A-Z]/.test(password)) errors.push("La clave debe incluir una letra mayúscula.");
  if (!/\d/.test(password)) errors.push("La clave debe incluir un número.");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("La clave debe incluir un símbolo.");
  return errors;
}

// Clave fijada directamente (sin clave temporal). Root puede con cualquier
// usuario desde el Portal Root; el administrador de empresa, responsable de
// sus operadores, puede fijar la clave de los operadores de su empresa
// (SOL-2026-10-29-011). La pertenencia a la empresa la valida cada ruta.
export function canSetDirectPassword(context, targetRole) {
  if (context?.role === "platform_admin") return context.portal === "root";
  return context?.role === "company_admin" && context?.portal === "client" && targetRole === "operator";
}

const ACCESS_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCESS_USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,39}$/;

// «Usuario de acceso»: un correo, o un usuario simple sin «@» (ej. operuno)
// que se guarda con el dominio técnico, igual que lo completa LoginForm al
// iniciar sesión en los portales Cliente y Terminal.
export function normalizeAccessUsername(value) {
  const typed = String(value || "").trim().toLowerCase();
  if (!typed) return { email: "", error: "El usuario de acceso es obligatorio." };
  if (typed.includes("@")) return ACCESS_EMAIL_PATTERN.test(typed) ? { email: typed, error: null } : { email: "", error: "El correo electrónico no es válido." };
  if (!ACCESS_USERNAME_PATTERN.test(typed)) return { email: "", error: "El usuario debe tener entre 3 y 40 caracteres: letras, números, punto, guion o guion bajo." };
  return { email: buildTechnicalEmail(typed), error: null };
}
