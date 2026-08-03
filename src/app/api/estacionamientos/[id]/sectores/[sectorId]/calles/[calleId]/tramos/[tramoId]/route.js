import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabaseAuthServer";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { sanitizeStreetSegment, validateStreetSegment } from "@/lib/parkingSegments.mjs";
import { operationalError, validationError } from "@/lib/parkingApi";

export async function PATCH(request, { params }) {
  const actor = await authenticateRequest(request);
  if (!actor) return NextResponse.json({ error: "Debes iniciar sesión.", code: "AUTH_REQUIRED" }, { status: 401 });
  if (!actor.isAdmin && !actor.isSupervisor) return NextResponse.json({ error: "No tienes permisos para editar tramos.", code: "FORBIDDEN" }, { status: 403 });
  try {
    const { sectorId, calleId, tramoId } = await params;
    const db = getSupabaseAdminClient();
    const input = sanitizeStreetSegment(await request.json());
    const { data: current, error: currentError } = await db.from("parking_street_segments").select("id,code,from_number,to_number,street_side,status").eq("street_id", calleId);
    if (currentError) throw currentError;
    const existing = (current || []).map((item) => ({ id: item.id, code: item.code, fromNumber: item.from_number, toNumber: item.to_number, streetSide: item.street_side, status: item.status }));
    const errors = validateStreetSegment(input, existing, tramoId);
    if (Object.keys(errors).length) return validationError(errors);
    const row = { code: input.code, name: input.name, from_number: input.fromNumber, to_number: input.toNumber, street_side: input.streetSide, capacity: input.capacity, occupied_spaces: input.occupiedSpaces, status: input.status, sort_order: input.sortOrder, notes: input.notes };
    const { data, error } = await db.from("parking_street_segments").update(row).eq("id", tramoId).eq("area_id", sectorId).eq("street_id", calleId).select("*").single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) { return operationalError(error, "No fue posible actualizar el tramo."); }
}
