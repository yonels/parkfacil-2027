import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { inactivateParkingCode, reactivateParkingCode, CatalogCodeInvalidTransitionError } from "@/lib/estacionamientosRepository";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { requirePlatformAdmin } from "@/lib/auth/apiAuthorizationCore.mjs";

const ACTIONS = { inactivate: inactivateParkingCode, reactivate: reactivateParkingCode };

// Inactivar/Reactivar un código del catálogo (continuación 2026-08-29) --
// exclusivo de Root, igual que el resto de la administración del catálogo.
// Un código ASSIGNED nunca pasa por aquí en un estado válido: inactivateParkingCode
// exige status='AVAILABLE' en el propio UPDATE condicional (ver
// estacionamientosRepository.js), así que un intento sobre un código
// asignado se rechaza igual que uno ya inactivo o inexistente.
export async function PATCH(request, { params }) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization.response;
  try {
    requirePlatformAdmin(authorization.context);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = ACTIONS[body?.action];
    if (!action) return NextResponse.json({ error: "Acción inválida.", code: "VALIDATION_ERROR" }, { status: 400 });
    const data = await action(getSupabaseAdminClient(), id);
    return NextResponse.json({ data });
  } catch (error) {
    if (error?.status) return authorizationErrorResponse(request, error, authorization.context);
    if (error instanceof CatalogCodeInvalidTransitionError) {
      return NextResponse.json({ error: "Ese código no puede cambiar a ese estado (ya está asignado, ya tiene ese estado, o no existe).", code: "CATALOG_CODE_INVALID_TRANSITION" }, { status: 409 });
    }
    console.error("[parking-code-catalog:transition]", error);
    return NextResponse.json({ error: "No fue posible actualizar el código.", code: "CATALOG_UPDATE_FAILED" }, { status: 500 });
  }
}
