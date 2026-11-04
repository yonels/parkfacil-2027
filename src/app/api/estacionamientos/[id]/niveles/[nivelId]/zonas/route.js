import { NextResponse } from "next/server";
import { authorizeParkingRequest, requireParkingChild } from "@/lib/auth/parkingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { zoneInput } from "@/lib/parkingStructureRepository";
import { operationalError, validationError } from "@/lib/parkingApi";
import { nextZoneCode, validateZone } from "@/lib/parkingOperations.mjs";

// El código lo asigna el servidor. El único índice es (level_id, code): si otra alta simultánea
// toma el mismo código (23505), se recalcula y se reintenta.
const ZONE_CODE_ATTEMPTS = 5;
async function insertZoneWithCode(db, input, parkingId, levelId) {
  for (let attempt = 1; ; attempt += 1) {
    const existing = await db.from("parking_zones").select("code").eq("level_id", levelId);
    if (existing.error) throw existing.error;
    const code = nextZoneCode((existing.data || []).map((zone) => zone.code));
    const result = await db.from("parking_zones").insert(zoneInput({ ...input, code }, parkingId, levelId)).select("*").single();
    if (result.error?.code === "23505" && attempt < ZONE_CODE_ATTEMPTS) continue;
    if (result.error) throw result.error;
    return result.data;
  }
}

export async function POST(request, { params }) { try { const { id, nivelId } = await params; const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_MANAGE); if (auth.response) return auth.response; await requireParkingChild(auth.db, auth.context, auth.parking, "parking_levels", nivelId); const input = await request.json(); const { code: _ignoredCode, ...errors } = validateZone(input); if (Object.keys(errors).length) return validationError(errors); const data = await insertZoneWithCode(auth.db, input, auth.parking.id, nivelId); return NextResponse.json({ data }, { status: 201 }); } catch (error) { return operationalError(error, "No fue posible crear la zona.", request); } }
