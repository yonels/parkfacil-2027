import { NextResponse } from "next/server";
import { authorizeParkingRequest, requireParkingChild } from "@/lib/auth/parkingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { sanitizeStreetSegment, validateStreetSegment, sortOrderToLetter, segmentCodeForLetter } from "@/lib/parkingSegments.mjs";
import { operationalError, validationError } from "@/lib/parkingApi";

const rowInput = (input, parkingId, areaId, streetId) => ({
  parking_id: parkingId, area_id: areaId, street_id: streetId, code: input.code, name: input.name,
  from_number: input.fromNumber, to_number: input.toNumber, street_side: input.streetSide,
  capacity: input.capacity, occupied_spaces: input.occupiedSpaces, status: input.status,
  sort_order: input.sortOrder, notes: input.notes,
});

export async function GET(request, { params }) {
  try {
    const { id, sectorId, calleId } = await params;
    const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_READ); if (auth.response) return auth.response;
    await requireParkingChild(auth.db, auth.context, auth.parking, "parking_sectors", sectorId);
    await requireParkingChild(auth.db, auth.context, auth.parking, "parking_streets", calleId, { sector_id: sectorId });
    const { data, error } = await auth.db.from("parking_street_segments").select("*").eq("parking_id", auth.parking.id).eq("area_id", sectorId).eq("street_id", calleId).order("sort_order").order("from_number");
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) { return operationalError(error, "No fue posible obtener los tramos.", request); }
}

export async function POST(request, { params }) {
  try {
    const { id, sectorId, calleId } = await params;
    const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_MANAGE); if (auth.response) return auth.response;
    await requireParkingChild(auth.db, auth.context, auth.parking, "parking_sectors", sectorId);
    await requireParkingChild(auth.db, auth.context, auth.parking, "parking_streets", calleId, { sector_id: sectorId });
    const raw = await request.json();
    // Código automático (corrección UX "Proyectos On Street" 2026-08-29):
    // solo se activa cuando el cliente NO envía código (el formulario nuevo
    // de Tramo On Street, OnStreetSegmentForm, deliberadamente lo omite). Si
    // llega un código explícito -- como sigue enviando siempre el formulario
    // compartido con Off Street (SegmentForm.js/StreetSegmentsManager.js) --
    // se respeta tal cual, sin ningún cambio de comportamiento para Off
    // Street. sanitizeStreetSegment ocurre DESPUÉS para no perder este matiz
    // ("" vs código real) por el trim/uppercase.
    const codeWasOmitted = !String(raw.code || "").trim();
    const input = sanitizeStreetSegment(raw);
    const { data: current, error: currentError } = await auth.db.from("parking_street_segments").select("id,code,from_number,to_number,street_side,status,sort_order").eq("parking_id", auth.parking.id).eq("area_id", sectorId).eq("street_id", calleId);
    if (currentError) throw currentError;
    const existing = (current || []).map((item) => ({ id: item.id, code: item.code, fromNumber: item.from_number, toNumber: item.to_number, streetSide: item.street_side, status: item.status, sortOrder: item.sort_order }));
    // La letra de Tramo (sort_order) debe ser única POR CALLE -- pero SOLO
    // para On Street (ver migración 20260829110000: el trigger de base de
    // datos aplica la misma condición como respaldo ante concurrencia). Off
    // Street sigue permitiendo "Orden" repetido, sin cambios.
    if (auth.parking.type === "ON_STREET" && existing.some((item) => item.sortOrder === input.sortOrder)) {
      return validationError({ sortOrder: "Ya existe un tramo con esa letra en esta calle." });
    }
    if (auth.parking.type === "ON_STREET" && codeWasOmitted) {
      input.code = segmentCodeForLetter(sortOrderToLetter(input.sortOrder));
    }
    const errors = validateStreetSegment(input, existing);
    if (Object.keys(errors).length) return validationError(errors);
    const { data, error } = await auth.db.from("parking_street_segments").insert(rowInput(input, auth.parking.id, sectorId, calleId)).select("*").single();
    if (error) {
      // Respaldo de concurrencia (ver migración 20260829110000): dos
      // creaciones simultáneas pueden pasar ambas la validación de arriba
      // con una foto stale de `existing` -- el trigger de base de datos
      // rechaza la segunda con este código, y se lo devolvemos como error de
      // campo en vez de un 500 genérico.
      if (error.code === "23514" && error.message?.includes("STREET_SEGMENT_SORT_ORDER_DUPLICATE")) {
        return validationError({ sortOrder: "Ese tramo ya fue asignado, intenta nuevamente." });
      }
      throw error;
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) { return operationalError(error, "No fue posible crear el tramo.", request); }
}
