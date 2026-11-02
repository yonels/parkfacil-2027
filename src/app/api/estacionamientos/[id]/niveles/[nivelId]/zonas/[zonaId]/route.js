import { NextResponse } from "next/server";
import { authorizeParkingRequest, requireParkingChild } from "@/lib/auth/parkingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { zoneInput } from "@/lib/parkingStructureRepository";
import { operationalError, validationError } from "@/lib/parkingApi";
import { validateZone, zoneDeleteBlockReason } from "@/lib/parkingOperations.mjs";
export async function PATCH(request, { params }) { try { const { id, nivelId, zonaId } = await params; const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_MANAGE); if (auth.response) return auth.response; await requireParkingChild(auth.db, auth.context, auth.parking, "parking_levels", nivelId); await requireParkingChild(auth.db, auth.context, auth.parking, "parking_zones", zonaId, { level_id: nivelId }); const input = await request.json(); const errors = validateZone(input); if (Object.keys(errors).length) return validationError(errors); const result = await auth.db.from("parking_zones").update(zoneInput(input, auth.parking.id, nivelId)).eq("id", zonaId).eq("parking_id", auth.parking.id).eq("level_id", nivelId).select("*").single(); if (result.error) throw result.error; return NextResponse.json({ data: result.data }); } catch (error) { return operationalError(error, "No fue posible actualizar la zona.", request); } }

export async function DELETE(request, { params }) {
  try {
    const { id, nivelId, zonaId } = await params;
    const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_MANAGE); if (auth.response) return auth.response;
    await requireParkingChild(auth.db, auth.context, auth.parking, "parking_levels", nivelId);
    const zone = await requireParkingChild(auth.db, auth.context, auth.parking, "parking_zones", zonaId, { level_id: nivelId });
    const others = await auth.db.from("parking_zones").select("id", { count: "exact", head: true }).eq("parking_id", auth.parking.id).eq("status", "ACTIVE").neq("id", zonaId);
    if (others.error) throw others.error;
    const blocked = zoneDeleteBlockReason(zone, { parkingStatus: auth.parking.status, otherActiveZones: others.count || 0 });
    if (blocked) return NextResponse.json({ error: blocked, code: "ZONE_DELETE_BLOCKED" }, { status: 409 });
    const result = await auth.db.from("parking_zones").delete().eq("id", zonaId).eq("parking_id", auth.parking.id).eq("level_id", nivelId).eq("occupied", 0).select("id");
    if (result.error) throw result.error;
    if (!result.data?.length) return NextResponse.json({ error: "La zona cambió mientras se eliminaba. Actualiza la página e inténtalo de nuevo.", code: "ZONE_DELETE_BLOCKED" }, { status: 409 });
    return NextResponse.json({ data: { removed: true } });
  } catch (error) {
    return operationalError(error, "No fue posible eliminar la zona.", request);
  }
}
