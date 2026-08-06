import { NextResponse } from "next/server";
import { authorizeParkingRequest, requireParkingChild } from "@/lib/auth/parkingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { zoneInput } from "@/lib/parkingStructureRepository";
import { operationalError, validationError } from "@/lib/parkingApi";
import { validateZone } from "@/lib/parkingOperations.mjs";
export async function POST(request, { params }) { try { const { id, nivelId } = await params; const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_MANAGE); if (auth.response) return auth.response; await requireParkingChild(auth.db, auth.context, auth.parking, "parking_levels", nivelId); const input = await request.json(); const errors = validateZone(input); if (Object.keys(errors).length) return validationError(errors); const result = await auth.db.from("parking_zones").insert(zoneInput(input, auth.parking.id, nivelId)).select("*").single(); if (result.error) throw result.error; return NextResponse.json({ data: result.data }, { status: 201 }); } catch (error) { return operationalError(error, "No fue posible crear la zona.", request); } }
