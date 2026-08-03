import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { getParking } from "@/lib/estacionamientosRepository";
import { streetInput } from "@/lib/parkingStructureRepository";
import { operationalError, validationError } from "@/lib/parkingApi";
import { validateStreet } from "@/lib/parkingOperations.mjs";
export async function PATCH(request, { params }) { try { const { id, sectorId, calleId } = await params; const input = await request.json(); const errors = validateStreet(input); if (Object.keys(errors).length) return validationError(errors); const db = getSupabaseAdminClient(); const parking = await getParking(db, id); if (!parking) return NextResponse.json({ error: "Estacionamiento no encontrado." }, { status: 404 }); const result = await db.from("parking_streets").update(streetInput(input, parking.id, sectorId)).eq("id", calleId).eq("sector_id", sectorId).select("*").single(); if (result.error) throw result.error; return NextResponse.json({ data: result.data }); } catch (error) { return operationalError(error, "No fue posible actualizar la calle."); } }
