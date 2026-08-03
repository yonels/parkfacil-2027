import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { classifyParkingPersistenceError, sanitizeParkingInput, validateParkingInput } from "@/lib/estacionamientos.mjs";
import { listParkings, parkingRowInput } from "@/lib/estacionamientosRepository";
import { authenticateRequest } from "@/lib/supabaseAuthServer";

function fail(error, fallback = "No fue posible procesar los estacionamientos.") {
  console.error("[parking:collection]", error);
  const classified = classifyParkingPersistenceError(error);
  return NextResponse.json({ error: classified.code === "PARKING_UPDATE_FAILED" ? fallback : classified.message, code: classified.code }, { status: classified.status });
}

export async function GET() {
  try { return NextResponse.json({ data: await listParkings(getSupabaseAdminClient()) }); } catch (error) { return fail(error, "No fue posible obtener los estacionamientos."); }
}

export async function POST(request) {
  try {
    const actor = await authenticateRequest(request);
    if (!actor) return NextResponse.json({ error: "Debes iniciar sesión.", code: "AUTH_REQUIRED" }, { status: 401 });
    const payload = sanitizeParkingInput(await request.json());
    payload.status = "DRAFT";
    const validation = validateParkingInput(payload);
    if (Object.keys(validation).length) return NextResponse.json({ error: "Revisa los campos indicados.", code: "VALIDATION_ERROR", details: validation }, { status: 400 });
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.from("parkings").insert(parkingRowInput(payload)).select("*").limit(1);
    if (error) throw error;
    return NextResponse.json({ data: data[0] }, { status: 201 });
  } catch (error) { return fail(error, "No fue posible crear el estacionamiento."); }
}
