import { NextResponse } from "next/server";
import { operationalError } from "@/lib/parkingApi";
import { authorizeOperationRequest, operationAuthorizationError, requireOperationalParking, requireOperationalShift } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { AuthorizationError } from "@/lib/auth/contextCore.mjs";

export async function POST(request, { params }) {
  let authorization;
  try {
    const { id, turnoId } = await params;
    authorization = await authorizeOperationRequest(request, PERMISSIONS.OPERATIONS_USE);
    if (authorization.response) return authorization.response;
    const parking = await requireOperationalParking(authorization.db, authorization.context, authorization.scope, id);
    await requireOperationalShift(authorization.db, authorization.context, authorization.scope, turnoId, parking.id);
    const input = await request.json();
    if (!input.type || !input.description) return NextResponse.json({ error: "Tipo y descripcion son obligatorios.", code: "VALIDATION_ERROR" }, { status: 400 });
    if (input.closureId) {
      const closure = await authorization.db.from("shift_closures").select("id").eq("id", input.closureId).eq("shift_id", turnoId).maybeSingle();
      if (closure.error) throw closure.error;
      if (!closure.data) throw new AuthorizationError("RESOURCE_NOT_FOUND", 404, "No se encontro el cierre solicitado.", authorization.context);
    }
    const result = await authorization.db.from("shift_incidents").insert({ shift_id: turnoId, closure_id: input.closureId || null, type: input.type, description: String(input.description).slice(0, 2000), reported_by: authorization.context.userId, status: input.status || "OPEN" }).select("*").single();
    if (result.error) throw result.error;
    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    return denied || operationalError(error, "No fue posible registrar la incidencia.", request, authorization?.context);
  }
}
