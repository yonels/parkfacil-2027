import { NextResponse } from "next/server";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { requirePermission } from "@/lib/auth/apiAuthorizationCore.mjs";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
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

export async function GET(request, { params }) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization.response;
  try {
    requirePermission(authorization.context, PERMISSIONS.USERS_MANAGE);
  } catch (error) {
    return authorizationErrorResponse(request, error, authorization.context);
  }

  const { id } = await params;
  const db = getSupabaseAdminClient();
  const result = await listAuthorizedUsers(db, authorization.context);
  const user = result.data.find((item) => item.id === id) || null;

  if (!user) {
    return NextResponse.json({ error: "No se encontró el usuario solicitado.", code: "USER_NOT_FOUND" }, { status: 404 });
  }

  const company = result.companies.find((item) => item.id === user.empresaId) || null;
  const parkings = result.parkings.filter((item) => (user.estacionamientos || []).includes(item.id));
  return NextResponse.json({ data: { user: normalizeUserDetail(user), company, parkings } }, { headers: { "Cache-Control": "no-store" } });
}