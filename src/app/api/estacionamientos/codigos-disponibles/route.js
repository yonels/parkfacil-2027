import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { listAvailableParkingCodes } from "@/lib/estacionamientosRepository";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { requirePermission } from "@/lib/auth/apiAuthorizationCore.mjs";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";

// Códigos disponibles del catálogo (corrección funcional 2026-08-29): mismo
// permiso ya exigido para crear un estacionamiento (PARKINGS_MANAGE) --
// Root y company_admin lo comparten hoy, no se inventa uno nuevo. El
// catálogo es GLOBAL: no se filtra por empresa (ver informe de auditoría).
export async function GET(request) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization.response;
  try {
    requirePermission(authorization.context, PERMISSIONS.PARKINGS_MANAGE);
    return NextResponse.json({ data: await listAvailableParkingCodes(getSupabaseAdminClient()) });
  } catch (error) {
    if (error?.status) return authorizationErrorResponse(request, error, authorization.context);
    console.error("[parking-code-catalog:available]", error);
    return NextResponse.json({ error: "No fue posible obtener los códigos disponibles.", code: "CATALOG_READ_FAILED" }, { status: 500 });
  }
}
