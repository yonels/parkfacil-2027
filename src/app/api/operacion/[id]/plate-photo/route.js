import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationAuthorizationError } from "@/lib/auth/operationAuthorization";
import { AuthorizationError } from "@/lib/auth/contextCore.mjs";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { getOperationStayById } from "@/lib/posStaysService";
import { listParkings } from "@/lib/estacionamientosRepository";
import { getPlateEntryPhotoSignedUrl } from "@/lib/offStreet/platePhotoEvidenceRepository";

function fail(message, status = 400, details) {
  return NextResponse.json({ error: message, details }, { status });
}

// Fotografía de patente de un movimiento (Fase 6). Mismo aislamiento que
// GET /api/operacion/[id]: primero se confirma que el movimiento existe
// DENTRO del alcance del usuario (scopedParkings) -- solo entonces se
// resuelve una signed URL de corta duración. Nunca una URL pública
// permanente (§10 del encargo).
export async function GET(request, { params }) {
  let authorization;
  try {
    authorization = await authorizeOperationRequest(request, [PERMISSIONS.REPORTS_READ, PERMISSIONS.OPERATIONS_USE]);
    if (authorization.response) return authorization.response;

    const { id } = await params;
    const scopedParkings = await listParkings(authorization.db, authorization.scope);
    const detail = await getOperationStayById(authorization.db, scopedParkings, id);
    if (!detail) throw new AuthorizationError("RESOURCE_NOT_FOUND", 404, "No se encontró el movimiento solicitado.", authorization.context);

    const photo = await getPlateEntryPhotoSignedUrl(authorization.db, id, 120);
    if (!photo) return NextResponse.json({ data: null });
    return NextResponse.json({ data: photo });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    if (denied) return denied;
    return fail("No fue posible consultar la fotografía del movimiento.", 503);
  }
}
