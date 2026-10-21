import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationAuthorizationError } from "@/lib/auth/operationAuthorization";
import { AuthorizationError } from "@/lib/auth/contextCore.mjs";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { getOperationStayById } from "@/lib/posStaysService";
import { listParkings } from "@/lib/estacionamientosRepository";

function fail(message, status = 400, details) {
  return NextResponse.json({ error: message, details }, { status });
}

// Ficha /operacion/[id]: mismo aislamiento que GET /api/operacion --
// getOperationStayById solo busca dentro de scopedParkings (nunca acepta un
// id de otra empresa/estacionamiento aunque se conozca el uuid).
export async function GET(request, { params }) {
  let authorization;
  try {
    authorization = await authorizeOperationRequest(request, [PERMISSIONS.REPORTS_READ, PERMISSIONS.OPERATIONS_USE]);
    if (authorization.response) return authorization.response;

    const { id } = await params;
    const scopedParkings = await listParkings(authorization.db, authorization.scope);
    const detail = await getOperationStayById(authorization.db, scopedParkings, id);
    if (!detail) throw new AuthorizationError("RESOURCE_NOT_FOUND", 404, "No se encontró el movimiento solicitado.", authorization.context);

    return NextResponse.json({ data: detail });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    if (denied) return denied;
    return fail("No fue posible consultar el movimiento solicitado.", 503);
  }
}
