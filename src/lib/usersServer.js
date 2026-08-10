import "server-only";
import { getEmpresaById } from "@/data/empresas.mjs";
import { getEstacionamientoById } from "@/data/estacionamientos.mjs";
import { getUsuarioById } from "@/data/usuarios.mjs";
import { getCurrentServerContext } from "@/lib/auth/currentServerContext";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { listAuthorizedUsers } from "@/lib/usersRepository";

function normalizeUserDetail(user) {
  if (!user) return null;
  return {
    ...user,
    organizationId: user.organizationId || null,
    fechaIncorporacion: user.fechaIncorporacion || "Sin fecha informada",
    observaciones: user.observaciones || "Sin observaciones registradas.",
    permisos: Array.isArray(user.permisos) && user.permisos.length ? user.permisos : ["Permisos administrados por rol y empresa"],
    historial: Array.isArray(user.historial) && user.historial.length ? user.historial : ["Sin historial registrado"],
    actividad: Array.isArray(user.actividad) && user.actividad.length ? user.actividad : ["Sin actividad registrada"],
    perfilesSecundarios: Array.isArray(user.perfilesSecundarios) ? user.perfilesSecundarios : [],
  };
}

export async function getUserPageData(id) {
  try {
    const context = await getCurrentServerContext();
    const db = getSupabaseAdminClient();
    const result = await listAuthorizedUsers(db, context);
    const user = result.data.find((item) => item.id === id) || null;
    const company = user ? result.companies.find((item) => item.id === user.empresaId) || null : null;
    const parkings = user ? result.parkings.filter((item) => (user.estacionamientos || []).includes(item.id)) : [];
    return {
      user: normalizeUserDetail(user),
      company,
      parkings,
      persistent: true,
    };
  } catch (error) {
    console.error("[users:page:fallback]", error?.code || error?.message || "connection_error");
    const user = getUsuarioById(id);
    return {
      user: normalizeUserDetail(user),
      company: user?.empresaId ? getEmpresaById(user.empresaId) : null,
      parkings: (user?.estacionamientos || []).map((parkingId) => getEstacionamientoById(parkingId)).filter(Boolean),
      persistent: false,
    };
  }
}