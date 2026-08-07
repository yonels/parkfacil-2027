import { NextResponse } from "next/server";
import { authorizeParkingRequest, requireParkingChild } from "@/lib/auth/parkingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { createParkingRate, listParkingRates } from "@/lib/parkingRatesRepository";
import { sanitizeRateInput, validateRateInput } from "@/lib/parkingRateInput.mjs";
import { operationalError, validationError } from "@/lib/parkingApi";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_READ); if (auth.response) return auth.response;
    return NextResponse.json({ data: await listParkingRates(auth.db, auth.parking.id), parking: auth.parking });
  } catch (error) { return operationalError(error, "No fue posible obtener las tarifas.", request); }
}

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_MANAGE); if (auth.response) return auth.response;
    const input = sanitizeRateInput(await request.json());
    const errors = validateRateInput(input);
    if (Object.keys(errors).length) return validationError(errors);
    if (input.areaId) {
      const areaTable = auth.parking.type === "OFF_STREET" ? "parking_levels" : "parking_sectors";
      await requireParkingChild(auth.db, auth.context, auth.parking, areaTable, input.areaId);
    }
    return NextResponse.json({ data: await createParkingRate(auth.db, auth.parking.id, input) }, { status: 201 });
  } catch (error) { return operationalError(error, "No fue posible crear la tarifa.", request); }
}
