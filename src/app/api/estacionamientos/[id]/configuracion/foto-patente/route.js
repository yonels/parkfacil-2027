import { NextResponse } from "next/server";
import { authorizeParkingRequest } from "@/lib/auth/parkingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { getPlatePhotoSettings, setPlatePhotoSettings } from "@/lib/offStreet/offStreetPlatePhotoSettingsRepository";
import { PLATE_PHOTO_MODES } from "@/lib/offStreet/offStreetPlatePhoto.mjs";

// Configuración Off Street → "Operación de entrada" (Fase 6, §2-3 del
// encargo): fotografía de patente en ENTRY + impresión en ticket. Lectura
// con PARKINGS_READ (mismo permiso que el resto de /configuracion),
// escritura con PARKINGS_MANAGE -- que operator NO tiene (ver
// permissions.mjs), cumpliendo "solo usuarios administrativos autorizados
// pueden cambiarla" (§3).
function fail(message, status = 400, details) { return NextResponse.json({ error: message, details }, { status }); }

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_READ); if (auth.response) return auth.response;
    const settings = await getPlatePhotoSettings(auth.db, auth.parking.id);
    return NextResponse.json({ data: { ...settings, modes: PLATE_PHOTO_MODES } });
  } catch (error) {
    console.error("[parking:configuracion:foto-patente:get]", { code: error?.code, message: error?.message });
    return fail("No fue posible cargar la configuración de fotografía de patente.", 503);
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_MANAGE); if (auth.response) return auth.response;
    const input = await request.json().catch(() => ({}));
    const settings = await setPlatePhotoSettings(auth.db, {
      parkingId: auth.parking.id,
      companyId: auth.parking.companyId,
      plateMode: input.plateMode,
      printOnTicket: Boolean(input.printOnTicket),
      evidenceRetentionDays: input.evidenceRetentionDays ?? null,
      updatedBy: auth.context.userId,
    });
    return NextResponse.json({ data: { ...settings, modes: PLATE_PHOTO_MODES } });
  } catch (error) {
    if (error?.status === 400) return fail("La configuración enviada no es válida.", 400, { code: error.code });
    console.error("[parking:configuracion:foto-patente:put]", { code: error?.code, message: error?.message });
    return fail("No fue posible guardar la configuración de fotografía de patente.", 503);
  }
}
