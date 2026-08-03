import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { classifyParkingPersistenceError } from "@/lib/estacionamientos.mjs";
import { sanitizeOnStreetSector, validateOnStreetSector } from "@/lib/parkingOperations.mjs";
import { getParking } from "@/lib/estacionamientosRepository";
import { sectorInput } from "@/lib/parkingStructureRepository";

function fail(error) {
  console.error("[parking:sector]", error);
  const classified = classifyParkingPersistenceError(error);
  return NextResponse.json({ error: classified.code === "PARKING_UPDATE_FAILED" ? "No fue posible actualizar el sector." : classified.message, code: classified.code }, { status: classified.status });
}

export async function GET(_request, { params }) {
  try {
    const { id, sectorId } = await params;
    const parking = await getParking(getSupabaseAdminClient(), id);
    if (!parking) return NextResponse.json({ error: "Estacionamiento no encontrado.", code: "PARKING_NOT_FOUND" }, { status: 404 });
    const sector = parking.sectors.find((item) => item.id === sectorId || item.code === sectorId);
    if (!sector) return NextResponse.json({ error: "Sector no encontrado.", code: "SECTOR_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ data: sector });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id, sectorId } = await params;
    const payload = sanitizeOnStreetSector(await request.json());
    const validation = validateOnStreetSector(payload);
    if (Object.keys(validation).length) return NextResponse.json({ error: "Revisa los campos indicados.", code: "VALIDATION_ERROR", details: validation }, { status: 400 });
    const supabase = getSupabaseAdminClient();
    const parking = await getParking(supabase, id);
    if (!parking) return NextResponse.json({ error: "Estacionamiento no encontrado." }, { status: 404 });
    const { data, error } = await supabase.from("parking_sectors").update(sectorInput(payload, parking.id)).eq("id", sectorId).eq("parking_id", parking.id).select("*").limit(1);
    if (error) throw error;
    if (!data?.length) return NextResponse.json({ error: "Sector no encontrado." }, { status: 404 });
    return NextResponse.json({ data: data[0] });
  } catch (error) {
    return fail(error);
  }
}
