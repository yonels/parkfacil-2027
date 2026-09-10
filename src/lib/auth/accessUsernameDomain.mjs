// Dominio técnico fijo del "usuario de acceso" generado (ver
// accessCredentialCore.mjs para el porqué). Aislado en su propio archivo,
// sin dependencias de node:crypto, para poder importarlo también desde
// LoginForm.js (componente de cliente) sin arrastrar módulos server-only.
export const ACCESS_USERNAME_TECHNICAL_DOMAIN = "acceso.parkfacilapp.cl";

export function buildTechnicalEmail(username, domain = ACCESS_USERNAME_TECHNICAL_DOMAIN) {
  return `${String(username || "").trim().toLowerCase()}@${domain}`;
}

// Inverso de buildTechnicalEmail -- usado donde solo se tiene el email real
// de auth.users (p. ej. al reenviar enrolamiento) y hace falta mostrar/
// enviar únicamente el "usuario de acceso", nunca el email técnico interno
// completo (encargo "cierre de reenvío de enrolamiento" 2026-09-10, §10/§11:
// "los emails técnicos nunca deben presentarse como correo real del
// usuario"). Una cuenta creada ANTES de este modelo (con un email real, sin
// el dominio técnico) se devuelve tal cual -- ese sí es su credencial real.
export function extractDisplayUsername(email, domain = ACCESS_USERNAME_TECHNICAL_DOMAIN) {
  const value = String(email || "").trim().toLowerCase();
  const suffix = `@${domain}`;
  return value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
}
