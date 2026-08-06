import { NextResponse } from "next/server";
import { sanitizeOnStreetSector, validateOnStreetSector } from "@/lib/parkingOperations.mjs";
import { classifyParkingPersistenceError } from "@/lib/estacionamientos.mjs";
import { sectorInput } from "@/lib/parkingStructureRepository";
import { authorizeParkingRequest } from "@/lib/auth/parkingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";

function fail(error, fallback) {
  console.error("[parking:sectors]", error);
  const classified = classifyParkingPersistenceError(error);
  return NextResponse.json({ error: classified.code === "PARKING_UPDATE_FAILED" ? fallback : classified.message, code: classified.code }, { status: classified.status });
}

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_READ); if (auth.response) return auth.response;
    return NextResponse.json({ data: auth.parking.sectors });
  } catch (error) {
    return fail(error, "No fue posible obtener los sectores.");
  }
}

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_MANAGE); if (auth.response) return auth.response;
    const payload = sanitizeOnStreetSector(await request.json());
    const validation = validateOnStreetSector(payload);
    if (Object.keys(validation).length) return NextResponse.json({ error: "Revisa los campos indicados.", code: "VALIDATION_ERROR", details: validation }, { status: 400 });
    const supabase = auth.db;
    const parking = auth.parking;
    if (parking.type !== "ON_STREET") return NextResponse.json({ error: "Los sectores solo pertenecen a estacionamientos On Street." }, { status: 409 });
    const { data, error } = await supabase.from("parking_sectors").insert(sectorInput(payload, parking.id)).select("*").limit(1);
    if (error) throw error;
    return NextResponse.json({ data: data[0] }, { status: 201 });
  } catch (error) {
    return fail(error, "No fue posible crear el sector.");
  }
}
