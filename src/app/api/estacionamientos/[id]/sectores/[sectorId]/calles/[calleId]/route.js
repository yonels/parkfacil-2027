import { NextResponse } from "next/server";
import { authorizeParkingRequest, requireParkingChild } from "@/lib/auth/parkingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { streetInput } from "@/lib/parkingStructureRepository";
import { operationalError, validationError } from "@/lib/parkingApi";
import { validateStreet } from "@/lib/parkingOperations.mjs";
export async function PATCH(request, { params }) { try { const { id, sectorId, calleId } = await params; const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_MANAGE); if (auth.response) return auth.response; await requireParkingChild(auth.db, auth.context, auth.parking, "parking_sectors", sectorId); await requireParkingChild(auth.db, auth.context, auth.parking, "parking_streets", calleId, { sector_id: sectorId }); const input = await request.json(); const errors = validateStreet(input); if (Object.keys(errors).length) return validationError(errors); const result = await auth.db.from("parking_streets").update(streetInput(input, auth.parking.id, sectorId)).eq("id", calleId).eq("parking_id", auth.parking.id).eq("sector_id", sectorId).select("*").single(); if (result.error) throw result.error; return NextResponse.json({ data: result.data }); } catch (error) { return operationalError(error, "No fue posible actualizar la calle.", request); } }
