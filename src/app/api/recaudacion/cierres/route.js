import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationActor, operationAuthorizationError } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { searchRevenueClosures } from "@/lib/offStreetRevenueService";
import { validateRevenueFilters } from "@/lib/offStreetRevenueCore.mjs";
import { listParkings } from "@/lib/estacionamientosRepository";

function fail(message, status = 400, details) {
  return NextResponse.json({ error: message, details }, { status });
}

// Cierres de caja reales para /recaudacion (§5) -- lee shift_closures, la
// MISMA tabla que ya llena close_operator_shift (POS), sin recalcular
// ningún monto. Mismo patrón de autorización que /api/recaudacion
// (REPORTS_READ, sin extender a OPERATIONS_USE -- ver comentario en
// ../route.js).
export async function GET(request) {
  let authorization;
  try {
    authorization = await authorizeOperationRequest(request, PERMISSIONS.REPORTS_READ);
    if (authorization.response) return authorization.response;

    const url = new URL(request.url);
    const parkingId = url.searchParams.get("parkingId") || null;
    const companyId = url.searchParams.get("companyId") || null;
    const dateFrom = url.searchParams.get("dateFrom") || null;
    const dateTo = url.searchParams.get("dateTo") || null;
    const operatorId = url.searchParams.get("operatorId") || null;
    const page = url.searchParams.get("page");
    const pageSize = url.searchParams.get("pageSize");

    const validation = validateRevenueFilters({ dateFrom, dateTo });
    if (!validation.ok) return fail(validation.message, 400, { code: "INVALID_FILTERS" });

    const scopedParkings = await listParkings(authorization.db, authorization.scope);
    const result = await searchRevenueClosures(authorization.db, scopedParkings, {
      parkingId,
      companyId,
      dateFrom,
      dateTo,
      operatorId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });

    return NextResponse.json({
      data: {
        rows: result.rows,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        actor: operationActor(authorization.context),
      },
    });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    if (denied) return denied;
    return fail("No fue posible consultar los cierres de caja solicitados.", 503);
  }
}
