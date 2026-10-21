import { randomBytes } from "node:crypto";
import { ACCESS_USERNAME_TECHNICAL_DOMAIN, buildTechnicalEmail } from "./accessUsernameDomain.mjs";

// NUNCA es un buzón real: Supabase Auth solo exige que auth.users.email
// tenga forma de correo (no soporta username nativo, ver diagnóstico
// "ajustar flujo de creación de empresas" 2026-09-10) -- el valor se crea
// con email_confirm:true (igual que ya hace POST /api/empresas) y jamás se
// usa para enviar nada. Lo único que ve Root/la empresa es la parte local
// (username), que ya es el mismo concepto que /usuarios llama "Usuario de
// acceso" (usersRepositoryCore.mjs: usuarioAcceso = authUser.email). El
// dominio técnico vive en accessUsernameDomain.mjs (sin node:crypto) para
// poder compartirlo con LoginForm.js, componente de cliente.
export { ACCESS_USERNAME_TECHNICAL_DOMAIN, buildTechnicalEmail };

const ROLE_PREFIX = { company_admin: "pfadmin", operator: "pfop" };

function randomToken(length) {
  // base64url evita caracteres que rompan URLs/inputs; se recorta a `length`.
  return randomBytes(length).toString("base64url").replace(/[^a-z0-9]/gi, "").slice(0, length).toLowerCase();
}

// Genera un candidato de "usuario de acceso" (no aún verificado contra
// auth.users -- la unicidad real la garantiza el caller reintentando ante
// EMAIL_ALREADY_EXISTS, igual que ya hace POST /api/usuarios con su propio
// createTemporaryPassword ante colisión).
export function createAccessUsername(role) {
  const prefix = ROLE_PREFIX[role] || "pfuser";
  return `${prefix}${randomToken(6)}`;
}

// Clave temporal inicial -- mismo patrón ya usado y probado en
// api/usuarios/route.js y api/usuarios/[id]/credencial/route.js (cumple
// MIN_PASSWORD_LENGTH=12 + minúscula/mayúscula/número/símbolo de
// userCredentialCore.mjs). Se centraliza aquí para no triplicarlo con el
// nuevo flujo de creación de empresa.
export function createTemporaryPassword() {
  return `Pf!${randomBytes(9).toString("base64url")}9a`;
}
