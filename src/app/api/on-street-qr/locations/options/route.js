import { NextResponse } from "next/server";
import { authorizeOnStreetAdminManageRequest } from "@/lib/onStreetAdminAuthorization";
import { listOnStreetLocationOptions } from "@/lib/onStreetAdminRepository";

// Opciones para el formulario "Crear QR": estacionamientos/área/calle/tramo
// del alcance del usuario, con la tarifa vigente resuelta por área y los
// tramos que ya tienen QR marcados.
export async function GET(request) {
  const auth = await authorizeOnStreetAdminManageRequest(request);
  if (auth.response) return auth.response;
  try {
    return NextResponse.json({ data: await listOnStreetLocationOptions(auth.db, auth.context) });
  } catch (error) {
    console.error("[ON_STREET_ADMIN_LOCATION_OPTIONS]", { code: error.code || error.message });
    return NextResponse.json({ error: "No fue posible cargar las opciones para crear el QR." }, { status: 503 });
  }
}
