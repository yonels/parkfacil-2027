import { NextResponse } from "next/server";
import { getConfigurator } from "@/lib/parkingConfiguratorRepository";
import { authorizeParkingRequest } from "@/lib/auth/parkingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_MANAGE); if (auth.response) return auth.response;
    const { db } = auth;
    const configuration = await getConfigurator(db, auth.parking.id, { parking: auth.parking });
    if (!configuration.activation.allowed) return NextResponse.json({ error: "El estacionamiento todavía tiene requisitos pendientes.", code: "ACTIVATION_REQUIREMENTS_PENDING", details: configuration.activation.requirements }, { status: 409 });
    const { error } = await db.rpc("activate_parking_configuration", { p_parking_id: configuration.parking.id, p_actor_id: auth.context.userId });
    if (error) throw error;
    return NextResponse.json({ data: await getConfigurator(db, configuration.parking.id, { parking: auth.parking }) });
  } catch (error) {
    console.error("[parking:configurator:activate]", { code: error?.code, message: error?.message, details: error?.details });
    return NextResponse.json({ error: "No fue posible completar la operación. Intente nuevamente o contacte al administrador.", code: "ACTIVATION_FAILED" }, { status: 500 });
  }
}
