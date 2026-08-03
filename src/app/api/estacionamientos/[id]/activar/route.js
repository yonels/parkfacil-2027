import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabaseAuthServer";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { getConfigurator } from "@/lib/parkingConfiguratorRepository";

export async function POST(request, { params }) {
  const actor = await authenticateRequest(request);
  if (!actor) return NextResponse.json({ error: "Debes iniciar sesión.", code: "AUTH_REQUIRED" }, { status: 401 });
  if (!actor.isAdmin && !actor.isSupervisor) return NextResponse.json({ error: "No tienes permisos para activar estacionamientos.", code: "FORBIDDEN" }, { status: 403 });
  try {
    const { id } = await params;
    const db = getSupabaseAdminClient();
    const configuration = await getConfigurator(db, id);
    if (!configuration) return NextResponse.json({ error: "Estacionamiento no encontrado.", code: "PARKING_NOT_FOUND" }, { status: 404 });
    if (!configuration.activation.allowed) return NextResponse.json({ error: "El estacionamiento todavía tiene requisitos pendientes.", code: "ACTIVATION_REQUIREMENTS_PENDING", details: configuration.activation.requirements }, { status: 409 });
    const { error } = await db.rpc("activate_parking_configuration", { p_parking_id: configuration.parking.id, p_actor_id: actor.id });
    if (error) throw error;
    return NextResponse.json({ data: await getConfigurator(db, configuration.parking.id) });
  } catch (error) {
    console.error("[parking:configurator:activate]", { code: error?.code, message: error?.message, details: error?.details });
    return NextResponse.json({ error: "No fue posible completar la operación. Intente nuevamente o contacte al administrador.", code: "ACTIVATION_FAILED" }, { status: 500 });
  }
}
