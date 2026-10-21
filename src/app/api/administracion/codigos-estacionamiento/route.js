import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { sanitizeParkingCatalogCode, validateParkingCatalogCode } from "@/lib/estacionamientos.mjs";
import { listParkingCodeCatalog, addParkingCatalogCode, CatalogCodeExistsError } from "@/lib/estacionamientosRepository";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { requirePlatformAdmin } from "@/lib/auth/apiAuthorizationCore.mjs";

// Administración del catálogo de códigos de Estacionamiento/Proyecto
// (corrección funcional 2026-08-29): exclusivo de Root -- company_admin NO
// puede incorporar códigos nuevos (definición aprobada, punto 9), aunque sí
// puede CONSUMIR uno disponible al crear su estacionamiento (ver
// /api/estacionamientos/codigos-disponibles, con PARKINGS_MANAGE).
export async function GET(request) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization.response;
  try {
    requirePlatformAdmin(authorization.context);
    return NextResponse.json({ data: await listParkingCodeCatalog(getSupabaseAdminClient()) });
  } catch (error) {
    if (error?.status) return authorizationErrorResponse(request, error, authorization.context);
    console.error("[parking-code-catalog:list]", error);
    return NextResponse.json({ error: "No fue posible obtener el catálogo de códigos.", code: "CATALOG_READ_FAILED" }, { status: 500 });
  }
}

export async function POST(request) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization.response;
  try {
    requirePlatformAdmin(authorization.context);
    const body = await request.json().catch(() => ({}));
    const code = sanitizeParkingCatalogCode(body?.code);
    const db = getSupabaseAdminClient();
    const existing = await listParkingCodeCatalog(db);
    const errors = validateParkingCatalogCode(code, existing.map((item) => item.code));
    if (Object.keys(errors).length) return NextResponse.json({ error: "Revisa los campos indicados.", code: "VALIDATION_ERROR", details: errors }, { status: 400 });
    const created = await addParkingCatalogCode(db, code);
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    if (error?.status) return authorizationErrorResponse(request, error, authorization.context);
    if (error instanceof CatalogCodeExistsError) return NextResponse.json({ error: "Ese código ya existe en el catálogo.", code: "CATALOG_CODE_EXISTS", details: { code: "Ese código ya existe en el catálogo." } }, { status: 409 });
    console.error("[parking-code-catalog:create]", error);
    return NextResponse.json({ error: "No fue posible agregar el código.", code: "CATALOG_CREATE_FAILED" }, { status: 500 });
  }
}
