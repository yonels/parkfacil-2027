import { NextResponse } from "next/server";
import { classifyParkingPersistenceError, sanitizeParkingInput, validateParkingInput } from "@/lib/estacionamientos.mjs";
import { parkingRowInput } from "@/lib/estacionamientosRepository";
import { authorizeParkingRequest } from "@/lib/auth/parkingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";

function fail(error) {
  console.error("[parking:update]", error);
  const classified = classifyParkingPersistenceError(error);
  return NextResponse.json({ error: classified.message, code: classified.code }, { status: classified.status });
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_MANAGE); if (auth.response) return auth.response;
    const payload = sanitizeParkingInput(await request.json());
    const validation = validateParkingInput(payload);
    if (Object.keys(validation).length) return NextResponse.json({ error: "Revisa los campos indicados.", code: "VALIDATION_ERROR", details: validation }, { status: 400 });
    const supabase = auth.db;
    const current = auth.parking;
    payload.companyId = current.companyId;
    if (current.type !== payload.type) return NextResponse.json({ error: "Cambia el tipo desde el configurador para conservar el historial.", code: "USE_TYPE_CHANGE_ENDPOINT" }, { status: 409 });
    if (payload.status === "ACTIVE" && current.status !== "ACTIVE") return NextResponse.json({ error: "Activa el estacionamiento desde la revisión final.", code: "USE_ACTIVATION_ENDPOINT" }, { status: 409 });
    const { data, error } = await supabase.from("parkings").update(parkingRowInput(payload)).eq("id", current.id).select("*").limit(1);
    if (error) throw error;
    if (!data?.length) return NextResponse.json({ error: "Estacionamiento no encontrado." }, { status: 404 });
    return NextResponse.json({ data: data[0] });
  } catch (error) { return fail(error); }
}
