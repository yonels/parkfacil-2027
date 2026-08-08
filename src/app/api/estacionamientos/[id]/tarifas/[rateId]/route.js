import { NextResponse } from "next/server";
import { authorizeParkingRequest, requireParkingChild } from "@/lib/auth/parkingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { RateNotEditableError, updateParkingRate } from "@/lib/parkingRatesRepository";
import { sanitizeRateInput, validateRateInput } from "@/lib/parkingRateInput.mjs";
import { operationalError, validationError } from "@/lib/parkingApi";

// Edición en el mismo registro de una tarifa existente. Solo se permite mientras la
// tarifa nunca haya estado ACTIVE ni haya participado en un cobro real (parking_stays);
// cualquier otro caso se rechaza con 409 y debe resolverse creando una nueva versión en
// POST /api/estacionamientos/[id]/tarifas/[rateId]/reemplazar.
export async function PATCH(request, { params }) {
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
    const updated = await updateParkingRate(auth.db, auth.parking.id, rateId, input);
    if (!updated) return NextResponse.json({ error: "La tarifa no existe.", code: "RATE_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof RateNotEditableError) {
      return NextResponse.json({
        error: "Esta tarifa ya estuvo activa o participó en cobros y no puede modificarse. Cierra su vigencia y crea una nueva versión.",
        code: "RATE_NOT_EDITABLE",
      }, { status: 409 });
    }
    return operationalError(error, "No fue posible actualizar la tarifa.", request);
  }
}
