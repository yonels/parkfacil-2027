import { NextResponse } from "next/server";
import { mapClosure } from "@/lib/shiftClosureRepository";
import { authorizeOperationRequest, operationAuthorizationError, requireOperationalClosure } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";

export async function GET(request, { params }) {
  let authorization;
  try {
    authorization = await authorizeOperationRequest(request, PERMISSIONS.OPERATIONS_USE);
    if (authorization.response) return authorization.response;
    const { id } = await params;
    const closure = await requireOperationalClosure(authorization.db, authorization.context, authorization.scope, id);
    return NextResponse.json({ data: mapClosure(closure) });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    return denied || NextResponse.json({ error: "No fue posible obtener el comprobante.", code: "CLOSURE_READ_FAILED" }, { status: 500 });
  }
}
