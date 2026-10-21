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
    const { data: current, error: currentError } = await auth.db.from("parking_street_segments").select("id,code,from_number,to_number,street_side,status,sort_order").eq("parking_id", auth.parking.id).eq("area_id", sectorId).eq("street_id", calleId);
    if (currentError) throw currentError;
    const existing = (current || []).map((item) => ({ id: item.id, code: item.code, fromNumber: item.from_number, toNumber: item.to_number, streetSide: item.street_side, status: item.status, sortOrder: item.sort_order }));
    // Misma regla que en la creación (ver route.js del listado): letra de
    // Tramo única por calle, solo para On Street. El propio tramo (tramoId)
    // queda excluido -- editar sin cambiar su letra no debe autorrechazarse.
    if (auth.parking.type === "ON_STREET" && existing.some((item) => item.id !== tramoId && item.sortOrder === input.sortOrder)) {
      return validationError({ sortOrder: "Ya existe un tramo con esa letra en esta calle." });
    }
    const errors = validateStreetSegment(input, existing, tramoId);
    if (Object.keys(errors).length) return validationError(errors);
    // El código NUNCA se regenera aquí -- se sigue guardando input.code tal
    // cual, sin cambios de comportamiento respecto de antes: Off Street
    // sigue pudiendo editarlo libremente vía el formulario compartido
    // (SegmentForm.js/StreetSegmentsManager.js). El formulario nuevo de On
    // Street (OnStreetSegmentForm) simplemente no ofrece ese campo como
    // editable y reenvía el código ya existente sin modificarlo -- "el
    // código no cambia" se cumple en la UI de On Street sin tocar esta API
    // compartida.
    const row = { code: input.code, name: input.name, from_number: input.fromNumber, to_number: input.toNumber, street_side: input.streetSide, capacity: input.capacity, occupied_spaces: input.occupiedSpaces, status: input.status, sort_order: input.sortOrder, notes: input.notes };
    const { data, error } = await auth.db.from("parking_street_segments").update(row).eq("id", tramoId).eq("parking_id", auth.parking.id).eq("area_id", sectorId).eq("street_id", calleId).select("*").single();
    if (error) {
      if (error.code === "23514" && error.message?.includes("STREET_SEGMENT_SORT_ORDER_DUPLICATE")) {
        return validationError({ sortOrder: "Ese tramo ya fue asignado, intenta nuevamente." });
      }
      throw error;
    }
    return NextResponse.json({ data });
  } catch (error) { return operationalError(error, "No fue posible actualizar el tramo.", request); }
}
