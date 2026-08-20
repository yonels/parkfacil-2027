// Valida y normaliza la edición de datos básicos de un usuario
// (company_admin/operator) desde la ficha de administración individual.
// Deliberadamente NO incluye reasignación de empresa ni de
// estacionamientos: eso afecta aislamiento por tenant/RLS y queda fuera
// de este alcance. Tampoco toca contraseñas (ver adminPasswordRecoveryCore.mjs
// y el endpoint /credencial, ya existentes).

// Mapea el estado visible en la UI (active/inactive/pending) al valor
// real permitido por el check constraint de company_members.status
// ('invited','active','suspended','inactive').
export const ESTADO_A_STATUS_DB = Object.freeze({
  active: "active",
  pending: "invited",
  inactive: "inactive",
});

// Validación básica de formato de correo (la unicidad real la valida
// Supabase Auth al intentar el update; aquí solo se descarta lo obviamente
// inválido antes de llegar allá).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function buildUserProfileUpdate(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const errors = [];
  const memberUpdate = {};
  let phone;
  let email;

  if (Object.prototype.hasOwnProperty.call(source, "nombreCompleto")) {
    const nombre = String(source.nombreCompleto || "").trim();
    if (!nombre) {
      errors.push("El nombre completo no puede estar vacío.");
    } else {
      memberUpdate.full_name = nombre;
    }
  }

  if (Object.prototype.hasOwnProperty.call(source, "estado")) {
    const statusDb = ESTADO_A_STATUS_DB[source.estado];
    if (!statusDb) {
      errors.push("Estado inválido.");
    } else {
      memberUpdate.status = statusDb;
    }
  }

  if (Object.prototype.hasOwnProperty.call(source, "telefono")) {
    phone = String(source.telefono || "").trim();
  }

  if (Object.prototype.hasOwnProperty.call(source, "correo")) {
    const correo = String(source.correo || "").trim().toLowerCase();
    if (!EMAIL_PATTERN.test(correo)) {
      errors.push("El correo electrónico no es válido.");
    } else {
      email = correo;
    }
  }

  return { errors, memberUpdate, phone, email };
}
