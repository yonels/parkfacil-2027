import { NextResponse } from "next/server";
import { classifyParkingPersistenceError } from "@/lib/estacionamientos.mjs";
import { sanitizeOnStreetSector, validateOnStreetSector } from "@/lib/parkingOperations.mjs";
import { sectorInput } from "@/lib/parkingStructureRepository";
import { authorizeParkingRequest, requireParkingChild } from "@/lib/auth/parkingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { authorizationErrorResponse } from "@/lib/auth/apiAuthorization";

function fail(error) {
  console.error("[parking:sector]", error);
  const classified = classifyParkingPersistenceError(error);
  return NextResponse.json({ error: classified.code === "PARKING_UPDATE_FAILED" ? "No fue posible actualizar el sector." : classified.message, code: classified.code }, { status: classified.status });
}

export async function GET(request, { params }) {
  try {
    const { id, sectorId } = await params;
    const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_READ); if (auth.response) return auth.response;
    const sector = await requireParkingChild(auth.db, auth.context, auth.parking, "parking_sectors", sectorId);
    return NextResponse.json({ data: sector });
  } catch (error) {
    if (error?.status) return authorizationErrorResponse(request, error, error.auditContext);
    return fail(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id, sectorId } = await params;
    const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_MANAGE); if (auth.response) return auth.response;
    await requireParkingChild(auth.db, auth.context, auth.parking, "parking_sectors", sectorId);
    const payload = sanitizeOnStreetSector(await request.json());
    const validation = validateOnStreetSector(payload);
    if (Object.keys(validation).length) return NextResponse.json({ error: "Revisa los campos indicados.", code: "VALIDATION_ERROR", details: validation }, { status: 400 });
    const supabase = auth.db;
    const parking = auth.parking;
    const { data, error } = await supabase.from("parking_sectors").update(sectorInput(payload, parking.id)).eq("id", sectorId).eq("parking_id", parking.id).select("*").limit(1);
    if (error) throw error;
    if (!data?.length) return NextResponse.json({ error: "Sector no encontrado." }, { status: 404 });
    return NextResponse.json({ data: data[0] });
  } catch (error) {
    if (error?.status) return authorizationErrorResponse(request, error, error.auditContext);
    return fail(error);
  }
}
