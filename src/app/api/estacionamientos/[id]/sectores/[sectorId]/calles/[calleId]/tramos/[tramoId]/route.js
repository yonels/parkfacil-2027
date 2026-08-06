import { NextResponse } from "next/server";
import { authorizeParkingRequest, requireParkingChild } from "@/lib/auth/parkingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { sanitizeStreetSegment, validateStreetSegment } from "@/lib/parkingSegments.mjs";
import { operationalError, validationError } from "@/lib/parkingApi";

export async function PATCH(request, { params }) {
  try {
    const { id, sectorId, calleId, tramoId } = await params;
    const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_MANAGE); if (auth.response) return auth.response;
    await requireParkingChild(auth.db, auth.context, auth.parking, "parking_sectors", sectorId);
    await requireParkingChild(auth.db, auth.context, auth.parking, "parking_streets", calleId, { sector_id: sectorId });
    await requireParkingChild(auth.db, auth.context, auth.parking, "parking_street_segments", tramoId, { area_id: sectorId, street_id: calleId });
    const input = sanitizeStreetSegment(await request.json());
    const { data: current, error: currentError } = await auth.db.from("parking_street_segments").select("id,code,from_number,to_number,street_side,status").eq("parking_id", auth.parking.id).eq("area_id", sectorId).eq("street_id", calleId);
    if (currentError) throw currentError;
    const existing = (current || []).map((item) => ({ id: item.id, code: item.code, fromNumber: item.from_number, toNumber: item.to_number, streetSide: item.street_side, status: item.status }));
    const errors = validateStreetSegment(input, existing, tramoId);
    if (Object.keys(errors).length) return validationError(errors);
    const row = { code: input.code, name: input.name, from_number: input.fromNumber, to_number: input.toNumber, street_side: input.streetSide, capacity: input.capacity, occupied_spaces: input.occupiedSpaces, status: input.status, sort_order: input.sortOrder, notes: input.notes };
    const { data, error } = await auth.db.from("parking_street_segments").update(row).eq("id", tramoId).eq("parking_id", auth.parking.id).eq("area_id", sectorId).eq("street_id", calleId).select("*").single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) { return operationalError(error, "No fue posible actualizar el tramo.", request); }
}
