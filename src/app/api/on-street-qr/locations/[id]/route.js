import { NextResponse } from "next/server";
import { authorizeOnStreetAdminManageRequest, authorizeOnStreetAdminRequest } from "@/lib/onStreetAdminAuthorization";
import { getOnStreetLocationDetail, updateOnStreetQrLocation } from "@/lib/onStreetAdminRepository";
import { buildOnStreetQrLocationUpdate } from "@/lib/onStreetQrLocationFormCore.mjs";

// Ficha completa de una ubicación QR (para la ficha administrativa, el QR
// individual y el letrero imprimible): jerarquía real, tarifa vigente y
// datos de contacto del operador.
export async function GET(request, { params }) {
  const auth = await authorizeOnStreetAdminRequest(request);
  if (auth.response) return auth.response;
  const { id } = await params;
  try {
    const location = await getOnStreetLocationDetail(auth.db, auth.context, id);
    if (!location) return NextResponse.json({ error: "No se encontró la ubicación QR solicitada." }, { status: 404 });
    return NextResponse.json({ data: location }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error.code === "PARKING_NOT_FOUND") return NextResponse.json({ error: "No se encontró la ubicación QR solicitada." }, { status: 404 });
    console.error("[ON_STREET_ADMIN_LOCATION_DETAIL]", { code: error.code || error.message });
    return NextResponse.json({ error: "No fue posible cargar la ubicación QR." }, { status: 503 });
  }
}

// Edita nombre/descripción y estado (activar/desactivar) de una ubicación QR.
// No permite reasignar estacionamiento/área/calle/tramo. Desactivar solo
// cambia el estado: no elimina ni afecta sesiones/pagos históricos.
export async function PATCH(request, { params }) {
  const auth = await authorizeOnStreetAdminManageRequest(request);
  if (auth.response) return auth.response;

  const { id } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const { errors, patch } = buildOnStreetQrLocationUpdate(body);
  if (errors.length) {
    return NextResponse.json({ error: errors[0], details: errors, code: "VALIDATION_ERROR" }, { status: 400 });
  }
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "No hay cambios para guardar.", code: "NO_CHANGES" }, { status: 400 });
  }

  try {
    const location = await updateOnStreetQrLocation(auth.db, auth.context, id, patch);
    return NextResponse.json({ data: location });
  } catch (error) {
    const map = {
      LOCATION_NOT_FOUND: { status: 404, error: "No se encontró la ubicación QR solicitada." },
      PARKING_NOT_FOUND: { status: 404, error: "No se encontró la ubicación QR solicitada." },
    };
    const mapped = map[error.code];
    if (mapped) return NextResponse.json({ error: mapped.error, code: error.code }, { status: mapped.status });
    console.error("[ON_STREET_ADMIN_LOCATION_UPDATE]", { code: error.code || error.message });
    return NextResponse.json({ error: "No fue posible actualizar la ubicación QR." }, { status: 503 });
  }
}
