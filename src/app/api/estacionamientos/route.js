import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { classifyParkingPersistenceError, sanitizeParkingInput, validateParkingInput } from "@/lib/estacionamientos.mjs";
import { listParkings, parkingRowInput } from "@/lib/estacionamientosRepository";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { assignedParkingIds } from "@/lib/auth/parkingAuthorization";
import { parkingQueryScope } from "@/lib/auth/parkingAuthorizationCore.mjs";
import { requirePermission } from "@/lib/auth/apiAuthorizationCore.mjs";
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions.mjs";

function fail(error, fallback = "No fue posible procesar los estacionamientos.") {
  console.error("[parking:collection]", error);
  const classified = classifyParkingPersistenceError(error);
  return NextResponse.json({ error: classified.code === "PARKING_UPDATE_FAILED" ? fallback : classified.message, code: classified.code }, { status: classified.status });
}

export async function GET(request) {
  const auth = await authorizeApiRequest(request); if (auth.response) return auth.response;
  try {
    requirePermission(auth.context, PERMISSIONS.PARKINGS_READ);
    const db = getSupabaseAdminClient();
    const ids = await assignedParkingIds(db, auth.context);
    return NextResponse.json({ data: await listParkings(db, parkingQueryScope(auth.context, ids || [])) });
  } catch (error) { if (error?.status) return authorizationErrorResponse(request, error, auth.context); return fail(error, "No fue posible obtener los estacionamientos."); }
}

export async function POST(request) {
  try {
    const auth = await authorizeApiRequest(request); if (auth.response) return auth.response;
    try { requirePermission(auth.context, PERMISSIONS.PARKINGS_MANAGE); } catch (error) { return authorizationErrorResponse(request, error, auth.context); }
    const payload = sanitizeParkingInput(await request.json());
    if (auth.context.role !== ROLES.PLATFORM_ADMIN) payload.companyId = auth.context.companyId;
    payload.status = "DRAFT";
    const validation = validateParkingInput(payload);
    if (Object.keys(validation).length) return NextResponse.json({ error: "Revisa los campos indicados.", code: "VALIDATION_ERROR", details: validation }, { status: 400 });
    const supabase = getSupabaseAdminClient();
    const company = await supabase.from("companies").select("id,status,relationship_type").eq("id", payload.companyId).maybeSingle();
    if (company.error) throw company.error;
    if (!company.data || company.data.status !== "active" || company.data.relationship_type !== "client") return NextResponse.json({ error: "No se encontró la empresa solicitada.", code: "RESOURCE_NOT_FOUND" }, { status: 404 });
    const { data, error } = await supabase.from("parkings").insert(parkingRowInput(payload)).select("*").limit(1);
    if (error) throw error;
    return NextResponse.json({ data: data[0] }, { status: 201 });
  } catch (error) { return fail(error, "No fue posible crear el estacionamiento."); }
}
