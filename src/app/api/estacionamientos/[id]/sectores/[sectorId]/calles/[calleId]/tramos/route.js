import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabaseAuthServer";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { getParking } from "@/lib/estacionamientosRepository";
import { sanitizeStreetSegment, validateStreetSegment } from "@/lib/parkingSegments.mjs";
import { operationalError, validationError } from "@/lib/parkingApi";

const rowInput = (input, parkingId, areaId, streetId) => ({
  parking_id: parkingId, area_id: areaId, street_id: streetId, code: input.code, name: input.name,
  from_number: input.fromNumber, to_number: input.toNumber, street_side: input.streetSide,
  capacity: input.capacity, occupied_spaces: input.occupiedSpaces, status: input.status,
  sort_order: input.sortOrder, notes: input.notes,
});

async function context(db, id, sectorId, calleId) {
  const parking = await getParking(db, id);
  if (!parking || parking.type !== "ON_STREET") return null;
  const { data: street, error } = await db.from("parking_streets").select("id").eq("id", calleId).eq("parking_id", parking.id).eq("sector_id", sectorId).single();
  if (error) return null;
  return { parking, street };
}

export async function GET(request, { params }) {
  const actor = await authenticateRequest(request);
  if (!actor) return NextResponse.json({ error: "Debes iniciar sesión.", code: "AUTH_REQUIRED" }, { status: 401 });
  try {
    const { id, sectorId, calleId } = await params;
    const db = getSupabaseAdminClient();
    const parent = await context(db, id, sectorId, calleId);
    if (!parent) return NextResponse.json({ error: "Calle no encontrada." }, { status: 404 });
    const { data, error } = await db.from("parking_street_segments").select("*").eq("street_id", calleId).order("sort_order").order("from_number");
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) { return operationalError(error, "No fue posible obtener los tramos."); }
}

export async function POST(request, { params }) {
  const actor = await authenticateRequest(request);
  if (!actor) return NextResponse.json({ error: "Debes iniciar sesión.", code: "AUTH_REQUIRED" }, { status: 401 });
  if (!actor.isAdmin && !actor.isSupervisor) return NextResponse.json({ error: "No tienes permisos para crear tramos.", code: "FORBIDDEN" }, { status: 403 });
  try {
    const { id, sectorId, calleId } = await params;
    const db = getSupabaseAdminClient();
    const parent = await context(db, id, sectorId, calleId);
    if (!parent) return NextResponse.json({ error: "Calle no encontrada." }, { status: 404 });
    const input = sanitizeStreetSegment(await request.json());
    const { data: current, error: currentError } = await db.from("parking_street_segments").select("id,code,from_number,to_number,street_side,status").eq("street_id", calleId);
    if (currentError) throw currentError;
    const existing = (current || []).map((item) => ({ id: item.id, code: item.code, fromNumber: item.from_number, toNumber: item.to_number, streetSide: item.street_side, status: item.status }));
    const errors = validateStreetSegment(input, existing);
    if (Object.keys(errors).length) return validationError(errors);
    const { data, error } = await db.from("parking_street_segments").insert(rowInput(input, parent.parking.id, sectorId, calleId)).select("*").single();
    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) { return operationalError(error, "No fue posible crear el tramo."); }
}
