import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { getParking } from "@/lib/estacionamientosRepository";
import { createLevel } from "@/lib/parkingStructureRepository";
import { operationalError, validationError } from "@/lib/parkingApi";
import { sanitizeLevelCreateInput, validateLevelCreateInput } from "@/lib/parkingOperations.mjs";
import { authenticateRequest } from "@/lib/supabaseAuthServer";

export async function GET(_request, { params }) {
  try { const { id } = await params; const db = getSupabaseAdminClient(); const parking = await getParking(db, id); if (!parking) return NextResponse.json({ error: "Estacionamiento no encontrado." }, { status: 404 }); const { data, error } = await db.from("parking_levels").select("*").eq("parking_id", parking.id).order("code"); if (error) throw error; return NextResponse.json({ data }); } catch (error) { return operationalError(error); }
}
export async function POST(request, { params }) {
  try {
    const actor = await authenticateRequest(request);
    if (!actor) return NextResponse.json({ error: "Debes iniciar sesión para crear un nivel.", code: "AUTH_REQUIRED" }, { status: 401 });
    const { id } = await params;
    const input = sanitizeLevelCreateInput(await request.json());
    const errors = validateLevelCreateInput(input);
    if (Object.keys(errors).length) return validationError(errors);
    const db = getSupabaseAdminClient();
    const parking = await getParking(db, id);
    if (!parking) return NextResponse.json({ error: "Estacionamiento no encontrado.", code: "PARKING_NOT_FOUND" }, { status: 404 });
    if (parking.type !== "OFF_STREET") return NextResponse.json({ error: "Los niveles solo pertenecen a estacionamientos Off Street.", code: "INVALID_PARKING_TYPE" }, { status: 409 });
    const level = await createLevel(db, input, parking.id);
    return NextResponse.json({ data: level, message: `Nivel ${level.code} creado correctamente.` }, { status: 201 });
  } catch (error) {
    console.error("[parking:levels:create]", { code: error?.code, message: error?.message, details: error?.details, hint: error?.hint });
    return NextResponse.json({ error: "No fue posible crear el nivel. Intente nuevamente o contacte al administrador.", code: ["42P01","PGRST202","PGRST205"].includes(error?.code) ? "LEVEL_STRUCTURE_UNAVAILABLE" : "LEVEL_CREATE_FAILED" }, { status: ["42P01","PGRST202","PGRST205"].includes(error?.code) ? 503 : 500 });
  }
}
