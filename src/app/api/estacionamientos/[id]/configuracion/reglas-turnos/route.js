import { NextResponse } from "next/server";
import { authorizeParkingRequest } from "@/lib/auth/parkingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { getShiftRules, setShiftRules } from "@/lib/offStreet/shiftRulesRepository";
import { validateShiftRulesInput } from "@/lib/pos/shiftRulesCore.mjs";

// Reglas de turnos del estacionamiento (SOL-2026-10-29-006). Lectura con
// PARKINGS_READ; escritura con PARKINGS_MANAGE (el operador no la tiene).
// Solo estacionamientos Off Street.
function fail(message, status = 400, details) { return NextResponse.json({ error: message, details }, { status }); }

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_READ); if (auth.response) return auth.response;
    if (auth.parking.type !== "OFF_STREET") return fail("Disponible solo para estacionamientos Off Street.", 400, { code: "OFF_STREET_ONLY" });
    return NextResponse.json({ data: await getShiftRules(auth.db, auth.parking.id) });
  } catch (error) {
    console.error("[parking:configuracion:reglas-turnos:get]", { code: error?.code, message: error?.message });
    return fail("No fue posible cargar las reglas de turnos.", 503);
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_MANAGE); if (auth.response) return auth.response;
    if (auth.parking.type !== "OFF_STREET") return fail("Disponible solo para estacionamientos Off Street.", 400, { code: "OFF_STREET_ONLY" });
    const input = await request.json().catch(() => ({}));
    const errors = validateShiftRulesInput(input);
    if (Object.keys(errors).length) return fail("Revisa las reglas elegidas.", 400, { code: "SHIFT_RULES_INVALID", errors });
    const rules = await setShiftRules(auth.db, { parkingId: auth.parking.id, companyId: auth.parking.companyId, rules: input, updatedBy: auth.context.userId });
    return NextResponse.json({ data: rules });
  } catch (error) {
    if (error?.status === 503) return fail("Falta habilitar las reglas de turnos en la base de datos.", 503, { code: error.code });
    console.error("[parking:configuracion:reglas-turnos:put]", { code: error?.code, message: error?.message });
    return fail("No fue posible guardar las reglas de turnos.", 503);
  }
}
