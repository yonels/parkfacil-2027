import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { getParking } from "@/lib/estacionamientosRepository";
import { zoneInput } from "@/lib/parkingStructureRepository";
import { operationalError, validationError } from "@/lib/parkingApi";
import { validateZone } from "@/lib/parkingOperations.mjs";
export async function POST(request, { params }) { try { const { id, nivelId } = await params; const input = await request.json(); const errors = validateZone(input); if (Object.keys(errors).length) return validationError(errors); const db = getSupabaseAdminClient(); const parking = await getParking(db, id); if (!parking) return NextResponse.json({ error: "Estacionamiento no encontrado." }, { status: 404 }); const result = await db.from("parking_zones").insert(zoneInput(input, parking.id, nivelId)).select("*").single(); if (result.error) throw result.error; return NextResponse.json({ data: result.data }, { status: 201 }); } catch (error) { return operationalError(error, "No fue posible crear la zona."); } }
