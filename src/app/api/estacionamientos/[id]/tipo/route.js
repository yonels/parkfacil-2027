import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabaseAuthServer";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { getParking } from "@/lib/estacionamientosRepository";
import { getConfigurator } from "@/lib/parkingConfiguratorRepository";
import { sanitizeTypeChange } from "@/lib/parkingConfigurator.mjs";

export async function PATCH(request, { params }) {
  const actor = await authenticateRequest(request);
  if (!actor) return NextResponse.json({ error: "Debes iniciar sesión.", code: "AUTH_REQUIRED" }, { status: 401 });
  if (!actor.isAdmin && !actor.isSupervisor) return NextResponse.json({ error: "No tienes permisos para cambiar el tipo.", code: "FORBIDDEN" }, { status: 403 });
  try {
    const { id } = await params;
    const input = sanitizeTypeChange(await request.json());
    if (!input.type) return NextResponse.json({ error: "Selecciona un tipo válido.", code: "VALIDATION_ERROR" }, { status: 400 });
    const db = getSupabaseAdminClient();
    const parking = await getParking(db, id);
    if (!parking) return NextResponse.json({ error: "Estacionamiento no encontrado.", code: "PARKING_NOT_FOUND" }, { status: 404 });
    const { data, error } = await db.rpc("change_parking_configuration_type", {
      p_parking_id: parking.id,
      p_new_type: input.type,
      p_confirmed: input.confirmed,
      p_actor_id: actor.id,
      p_reason: input.reason,
    });
    if (error) throw error;
    return NextResponse.json({ data: await getConfigurator(db, parking.id), change: data });
  } catch (error) {
    console.error("[parking:configurator:type]", { code: error?.code, message: error?.message, details: error?.details });
    const message = String(error?.message || "");
    const successorRequired = message.includes("TYPE_CHANGE_REQUIRES_SUCCESSOR_PARKING");
    const confirmation = message.includes("TYPE_CHANGE_CONFIRMATION_REQUIRED");
    return NextResponse.json({
      error: successorRequired
        ? "Este estacionamiento contiene información operacional. Debes suspenderlo o cerrarlo y crear uno nuevo en la otra modalidad."
        : confirmation
          ? "La configuración actual contiene datos. Confirma el cambio para archivarla sin eliminarla."
          : "No fue posible completar la operación. Intenta nuevamente o contacta al administrador.",
      code: successorRequired ? "TYPE_CHANGE_REQUIRES_SUCCESSOR" : confirmation ? "TYPE_CHANGE_CONFIRMATION_REQUIRED" : "TYPE_CHANGE_FAILED",
      summary: confirmation ? safeSummary(message) : undefined,
    }, { status: successorRequired || confirmation ? 409 : 500 });
  }
}

function safeSummary(message) {
  const match = String(message).match(/TYPE_CHANGE_CONFIRMATION_REQUIRED:(\{.*\})/);
  try { return match ? JSON.parse(match[1]) : null; } catch { return null; }
}
