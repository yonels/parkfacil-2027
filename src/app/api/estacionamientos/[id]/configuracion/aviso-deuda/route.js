import { NextResponse } from "next/server";
import { authorizeParkingRequest } from "@/lib/auth/parkingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { getDebtNoticeEnabled, setDebtNoticeEnabled } from "@/lib/offStreet/debtNoticeSettingsRepository";

// Aviso de deuda pendiente al ingresar una patente (SOL-2026-10-08-003, D6/D7).
// Lectura con PARKINGS_READ; escritura con PARKINGS_MANAGE (el operador no la
// tiene). Solo estacionamientos Off Street.
function fail(message, status = 400, details) { return NextResponse.json({ error: message, details }, { status }); }

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_READ); if (auth.response) return auth.response;
    if (auth.parking.type !== "OFF_STREET") return fail("Disponible solo para estacionamientos Off Street.", 400, { code: "OFF_STREET_ONLY" });
    return NextResponse.json({ data: { enabled: await getDebtNoticeEnabled(auth.db, auth.parking.id) } });
  } catch (error) {
    console.error("[parking:configuracion:aviso-deuda:get]", { code: error?.code, message: error?.message });
    return fail("No fue posible cargar el aviso de deuda pendiente.", 503);
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_MANAGE); if (auth.response) return auth.response;
    if (auth.parking.type !== "OFF_STREET") return fail("Disponible solo para estacionamientos Off Street.", 400, { code: "OFF_STREET_ONLY" });
    const input = await request.json().catch(() => ({}));
    const enabled = await setDebtNoticeEnabled(auth.db, {
      parkingId: auth.parking.id,
      companyId: auth.parking.companyId,
      enabled: input.enabled,
      updatedBy: auth.context.userId,
    });
    return NextResponse.json({ data: { enabled } });
  } catch (error) {
    if (error?.status === 400) return fail("Indica si el aviso queda activo o inactivo.", 400, { code: error.code });
    if (error?.status === 503) return fail("Falta habilitar el aviso de deuda en la base de datos.", 503, { code: error.code });
    console.error("[parking:configuracion:aviso-deuda:put]", { code: error?.code, message: error?.message });
    return fail("No fue posible guardar el aviso de deuda pendiente.", 503);
  }
}
