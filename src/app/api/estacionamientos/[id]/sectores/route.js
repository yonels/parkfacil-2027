import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { sanitizeOnStreetSector, validateOnStreetSector } from "@/lib/parkingOperations.mjs";
import { classifyParkingPersistenceError } from "@/lib/estacionamientos.mjs";
import { getParking } from "@/lib/estacionamientosRepository";
import { sectorInput } from "@/lib/parkingStructureRepository";

function fail(error, fallback) {
  console.error("[parking:sectors]", error);
  const classified = classifyParkingPersistenceError(error);
  return NextResponse.json({ error: classified.code === "PARKING_UPDATE_FAILED" ? fallback : classified.message, code: classified.code }, { status: classified.status });
}

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const parking = await getParking(getSupabaseAdminClient(), id);
    if (!parking) return NextResponse.json({ error: "Estacionamiento no encontrado.", code: "PARKING_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ data: parking.sectors });
  } catch (error) {
    return fail(error, "No fue posible obtener los sectores.");
  }
}

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const payload = sanitizeOnStreetSector(await request.json());
    const validation = validateOnStreetSector(payload);
    if (Object.keys(validation).length) return NextResponse.json({ error: "Revisa los campos indicados.", code: "VALIDATION_ERROR", details: validation }, { status: 400 });
    const supabase = getSupabaseAdminClient();
    const parking = await getParking(supabase, id);
    if (!parking) return NextResponse.json({ error: "Estacionamiento no encontrado." }, { status: 404 });
    if (parking.type !== "ON_STREET") return NextResponse.json({ error: "Los sectores solo pertenecen a estacionamientos On Street." }, { status: 409 });
    const { data, error } = await supabase.from("parking_sectors").insert(sectorInput(payload, parking.id)).select("*").limit(1);
    if (error) throw error;
    return NextResponse.json({ data: data[0] }, { status: 201 });
  } catch (error) {
    return fail(error, "No fue posible crear el sector.");
  }
}
