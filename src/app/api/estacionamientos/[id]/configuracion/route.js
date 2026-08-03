import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabaseAuthServer";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { getConfigurator } from "@/lib/parkingConfiguratorRepository";

export async function GET(request, { params }) {
  const actor = await authenticateRequest(request);
  if (!actor) return NextResponse.json({ error: "Debes iniciar sesión.", code: "AUTH_REQUIRED" }, { status: 401 });
  try {
    const { id } = await params;
    const data = await getConfigurator(getSupabaseAdminClient(), id);
    if (!data) return NextResponse.json({ error: "Estacionamiento no encontrado.", code: "PARKING_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ data });
  } catch (error) {
    console.error("[parking:configurator:get]", { code: error?.code, message: error?.message, details: error?.details });
    return NextResponse.json({ error: "No fue posible cargar la configuración. Intente nuevamente o contacte al administrador.", code: error?.configuratorCode || "CONFIGURATION_LOAD_FAILED" }, { status: error?.configuratorCode ? 503 : 500 });
  }
}
