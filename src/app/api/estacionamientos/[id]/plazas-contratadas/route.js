import { NextResponse } from "next/server";
import { authorizeParkingRequest } from "@/lib/auth/parkingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { deleteContractedSpaces, getContractedSpaces, setContractedSpaces } from "@/lib/contractParkingSpacesRepository";
import { sanitizeContractedSpacesInput, validateContractedSpacesInput } from "@/lib/contractedSpacesInput.mjs";
import { operationalError, validationError } from "@/lib/parkingApi";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_READ); if (auth.response) return auth.response;
    return NextResponse.json({ data: await getContractedSpaces(auth.db, auth.parking.id) });
  } catch (error) { return operationalError(error, "No fue posible obtener las plazas contratadas.", request); }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PLATFORM_GLOBAL); if (auth.response) return auth.response;
    const input = sanitizeContractedSpacesInput(await request.json());
    const errors = validateContractedSpacesInput(input);
    if (Object.keys(errors).length) return validationError(errors);
    const data = await setContractedSpaces(auth.db, { parkingId: auth.parking.id, companyId: auth.parking.companyId, contractedSpaces: input.contractedSpaces, notes: input.notes });
    return NextResponse.json({ data });
  } catch (error) {
    if (error?.code === "CONTRACT_NOT_FOUND") return NextResponse.json({ error: "La empresa dueña de este estacionamiento no tiene un contrato vigente registrado.", code: "CONTRACT_NOT_FOUND" }, { status: 409 });
    return operationalError(error, "No fue posible guardar las plazas contratadas.", request);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PLATFORM_GLOBAL); if (auth.response) return auth.response;
    await deleteContractedSpaces(auth.db, auth.parking.id);
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) { return operationalError(error, "No fue posible eliminar las plazas contratadas.", request); }
}
