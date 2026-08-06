import { NextResponse } from "next/server";
import { getConfigurator } from "@/lib/parkingConfiguratorRepository";
import { authorizeParkingRequest } from "@/lib/auth/parkingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_READ); if (auth.response) return auth.response;
    const data = await getConfigurator(auth.db, auth.parking.id, { parking: auth.parking });
    return NextResponse.json({ data });
  } catch (error) {
    console.error("[parking:configurator:get]", { code: error?.code, message: error?.message, details: error?.details });
    return NextResponse.json({ error: "No fue posible cargar la configuración. Intente nuevamente o contacte al administrador.", code: error?.configuratorCode || "CONFIGURATION_LOAD_FAILED" }, { status: error?.configuratorCode ? 503 : 500 });
  }
}
