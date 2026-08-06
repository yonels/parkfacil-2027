import { GET as getClosure, POST as postClosure } from "@/app/api/turnos/[id]/cerrar/route";
import { authorizeOperationRequest, operationAuthorizationError, requireOperationalParking, requireOperationalShift } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";

async function forward(handler, request, { params }) {
  let authorization;
  try {
    const { id, turnoId } = await params;
    authorization = await authorizeOperationRequest(request, PERMISSIONS.OPERATIONS_USE);
    if (authorization.response) return authorization.response;
    const parking = await requireOperationalParking(authorization.db, authorization.context, authorization.scope, id);
    await requireOperationalShift(authorization.db, authorization.context, authorization.scope, turnoId, parking.id);
    return handler(request, { params: Promise.resolve({ id: turnoId }) });
  } catch (error) {
    return operationAuthorizationError(request, authorization?.context, error) || Response.json({ error: "No fue posible procesar el cierre." }, { status: 500 });
  }
}

export function GET(request, routeContext) { return forward(getClosure, request, routeContext); }
export function POST(request, routeContext) { return forward(postClosure, request, routeContext); }
