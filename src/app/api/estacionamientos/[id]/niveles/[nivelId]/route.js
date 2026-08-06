import { NextResponse } from "next/server";
import { authorizeParkingRequest, requireParkingChild } from "@/lib/auth/parkingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { levelUpdateInput } from "@/lib/parkingStructureRepository";
import { operationalError, validationError } from "@/lib/parkingApi";
import { sanitizeLevelCreateInput, validateLevelCreateInput } from "@/lib/parkingOperations.mjs";
export async function PATCH(request, { params }) { try { const { id, nivelId } = await params; const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_MANAGE); if (auth.response) return auth.response; await requireParkingChild(auth.db, auth.context, auth.parking, "parking_levels", nivelId); const input = sanitizeLevelCreateInput(await request.json()); const errors = validateLevelCreateInput(input); if (Object.keys(errors).length) return validationError(errors); const result = await auth.db.from("parking_levels").update(levelUpdateInput(input)).eq("id", nivelId).eq("parking_id", auth.parking.id).select("*").single(); if (result.error) throw result.error; return NextResponse.json({ data: result.data }); } catch (error) { return operationalError(error, "No fue posible actualizar el nivel.", request); } }
