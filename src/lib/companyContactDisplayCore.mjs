// Distingue, para PRESENTACIÓN únicamente, un correo real de un email
// técnico generado (@acceso.parkfacilapp.cl -- ver accessUsernameDomain.mjs)
// al mostrar los contactos de una empresa. No cambia autenticación, no
// toca Supabase Auth, no persiste nada -- encargo "ficha de empresa:
// columna Usuario vs Correo" 2026-09-10, cierre del hallazgo dejado
// pendiente en el encargo de reenvío de enrolamiento.
import { ACCESS_USERNAME_TECHNICAL_DOMAIN, extractDisplayUsername } from "./auth/accessUsernameDomain.mjs";

export function isTechnicalEmail(email, domain = ACCESS_USERNAME_TECHNICAL_DOMAIN) {
  return String(email || "").trim().toLowerCase().endsWith(`@${domain}`);
}

// `email`: el valor real de auth.users.email para esa cuenta (o vacío si no
// se pudo resolver). `fallbackCorreo`: lo que ya traía el contacto antes de
// enriquecerlo con auth (hoy siempre "", se conserva por si algún llamador
// futuro lo completa). Devuelve exactamente lo que la UI necesita:
// - cuenta técnica (usuario generado): esCorreoTecnico=true, correo="",
//   usuario=<parte local, sin @dominio> -- nunca se expone el email técnico.
// - cuenta con correo real: esCorreoTecnico=false, correo=<tal cual>,
//   usuario="".
export function shapeContactDisplay({ email, fallbackCorreo = "" }) {
  const value = String(email || "").trim();
  const esCorreoTecnico = isTechnicalEmail(value);
  return {
    esCorreoTecnico,
    correo: esCorreoTecnico ? "" : (value || fallbackCorreo || ""),
    usuario: esCorreoTecnico ? extractDisplayUsername(value) : "",
  };
}
