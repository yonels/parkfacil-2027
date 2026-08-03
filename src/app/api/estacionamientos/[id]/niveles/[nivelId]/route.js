import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { getParking } from "@/lib/estacionamientosRepository";
import { levelUpdateInput } from "@/lib/parkingStructureRepository";
import { operationalError, validationError } from "@/lib/parkingApi";
import { sanitizeLevelCreateInput, validateLevelCreateInput } from "@/lib/parkingOperations.mjs";
export async function PATCH(request, { params }) { try { const { id, nivelId } = await params; const input = sanitizeLevelCreateInput(await request.json()); const errors = validateLevelCreateInput(input); if (Object.keys(errors).length) return validationError(errors); const db = getSupabaseAdminClient(); const parking = await getParking(db, id); if (!parking) return NextResponse.json({ error: "Estacionamiento no encontrado." }, { status: 404 }); const result = await db.from("parking_levels").update(levelUpdateInput(input)).eq("id", nivelId).eq("parking_id", parking.id).select("*").single(); if (result.error) throw result.error; return NextResponse.json({ data: result.data }); } catch (error) { return operationalError(error, "No fue posible actualizar el nivel."); } }
