import { NextResponse } from "next/server";
import { authorizeParkingRequest, requireParkingChild } from "@/lib/auth/parkingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { replaceParkingRate } from "@/lib/parkingRatesRepository";
import { sanitizeRateInput, validateRateInput } from "@/lib/parkingRateInput.mjs";
import { operationalError, validationError } from "@/lib/parkingApi";

// Crea una nueva versión de una tarifa que ya no puede editarse en el mismo registro
// (porque estuvo ACTIVE y/o participó en cobros). Si la tarifa origen está ACTIVE, cierra
// su vigencia (valid_until = ahora, status = ENDED) sin tocar ninguno de sus valores
// históricos, y la nueva versión queda como una fila independiente desde ese momento.
export async function POST(request, { params }) {
  try {
    const { id, rateId } = await params;
    const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_MANAGE); if (auth.response) return auth.response;
    const input = sanitizeRateInput(await request.json());
    const errors = validateRateInput(input);
    if (Object.keys(errors).length) return validationError(errors);
    if (input.areaId) {
      const areaTable = auth.parking.type === "OFF_STREET" ? "parking_levels" : "parking_sectors";
      await requireParkingChild(auth.db, auth.context, auth.parking, areaTable, input.areaId);
    }
    const result = await replaceParkingRate(auth.db, auth.parking.id, rateId, input);
    if (!result) return NextResponse.json({ error: "La tarifa a reemplazar no existe.", code: "RATE_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) { return operationalError(error, "No fue posible crear la nueva versión de la tarifa.", request); }
}
